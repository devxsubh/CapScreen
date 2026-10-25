/**
 * MongoDB query semantics over plain JS documents — the subset mongoose emits
 * for this codebase: comparison, logical, element, array and regex operators,
 * dotted paths with implicit array traversal, projection and sort.
 */

export type Doc = Record<string, unknown>;
export type Filter = Record<string, unknown>;

export class UnsupportedOperatorError extends Error {
  constructor(op: string) {
    super(`SQLite store does not support MongoDB operator ${op}`);
    this.name = "UnsupportedOperatorError";
  }
}

// ── Value helpers ────────────────────────────────────────────────────────────

export function isBsonValue(v: unknown): v is { _bsontype: string } {
  return !!v && typeof v === "object" && typeof (v as { _bsontype?: unknown })._bsontype === "string";
}

export function isPlainObject(v: unknown): v is Doc {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  if (v instanceof Date || v instanceof RegExp || Buffer.isBuffer(v) || isBsonValue(v)) return false;
  return true;
}

function bsonString(v: { _bsontype: string }): string {
  const s = v as unknown as { toHexString?: () => string; toString: (enc?: string) => string };
  return s.toHexString ? s.toHexString() : s.toString("hex");
}

/** MongoDB BSON type ordering for cross-type comparisons. */
function typeRank(v: unknown): number {
  if (v === undefined || v === null) return 1;
  if (typeof v === "number" || typeof v === "bigint") return 2;
  if (typeof v === "string") return 3;
  if (Array.isArray(v)) return 5;
  if (v instanceof Date) return 9;
  if (v instanceof RegExp) return 11;
  if (typeof v === "boolean") return 8;
  if (isBsonValue(v)) {
    if (v._bsontype === "ObjectId") return 7;
    if (v._bsontype === "Binary") return 6;
    if (["Decimal128", "Long", "Int32", "Double"].includes(v._bsontype)) return 2;
    return 10;
  }
  if (Buffer.isBuffer(v)) return 6;
  return 4;
}

function numeric(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return Number(String(v));
}

/** Total order across values, matching MongoDB's sort order closely enough for app use. */
export function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 1:
      return 0;
    case 2:
      return numeric(a) - numeric(b);
    case 3:
      return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
    case 7:
    case 6: {
      const sa = isBsonValue(a) ? bsonString(a) : (a as Buffer).toString("hex");
      const sb = isBsonValue(b) ? bsonString(b) : (b as Buffer).toString("hex");
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    case 8:
      return Number(a) - Number(b);
    case 9:
      return (a as Date).getTime() - (b as Date).getTime();
    case 5: {
      const aa = a as unknown[];
      const bb = b as unknown[];
      for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
        const c = compareValues(aa[i], bb[i]);
        if (c !== 0) return c;
      }
      return aa.length - bb.length;
    }
    case 4: {
      const ka = Object.keys(a as Doc);
      const kb = Object.keys(b as Doc);
      for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        const c = compareValues((a as Doc)[ka[i]], (b as Doc)[kb[i]]);
        if (c !== 0) return c;
      }
      return ka.length - kb.length;
    }
    default:
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeRank(a) !== typeRank(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => valuesEqual(a[k], b[k]));
  }
  return compareValues(a, b) === 0;
}

// ── Path resolution ──────────────────────────────────────────────────────────

/** All values reachable at a dotted path, traversing arrays like MongoDB does. */
export function resolvePath(value: unknown, parts: string[], i = 0): unknown[] {
  if (i === parts.length) return [value];
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    if (/^\d+$/.test(parts[i])) out.push(...resolvePath(value[Number(parts[i])], parts, i + 1));
    for (const el of value) {
      if (isPlainObject(el)) out.push(...resolvePath(el, parts, i));
    }
    return out.length ? out : [undefined];
  }
  if (isPlainObject(value)) return resolvePath(value[parts[i]], parts, i + 1);
  return [undefined];
}

export function getPath(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const p of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(p)) cur = cur[Number(p)];
    else if (isPlainObject(cur)) cur = cur[p];
    else return undefined;
  }
  return cur;
}

// ── Matching ─────────────────────────────────────────────────────────────────

function isOperatorObject(v: unknown): v is Doc {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => k.startsWith("$"));
}

/** Equality with array-contains semantics and regex support. */
function candidateEquals(candidate: unknown, expected: unknown): boolean {
  if (expected instanceof RegExp) {
    if (typeof candidate === "string") return expected.test(candidate);
    if (Array.isArray(candidate)) return candidate.some((c) => typeof c === "string" && expected.test(c));
    return false;
  }
  if (valuesEqual(candidate, expected)) return true;
  if (Array.isArray(candidate)) return candidate.some((c) => valuesEqual(c, expected));
  return false;
}

function anyEquals(candidates: unknown[], expected: unknown): boolean {
  return candidates.some((c) => candidateEquals(c, expected));
}

function flatten(candidates: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const c of candidates) {
    if (Array.isArray(c)) out.push(...c);
    else out.push(c);
  }
  return out;
}

function compareOp(candidates: unknown[], expected: unknown, test: (c: number) => boolean): boolean {
  return flatten(candidates).some(
    (c) => c !== undefined && typeRank(c) === typeRank(expected) && test(compareValues(c, expected)),
  );
}

function toRegExp(pattern: unknown, options: unknown): RegExp {
  if (pattern instanceof RegExp) {
    return options ? new RegExp(pattern.source, String(options)) : pattern;
  }
  return new RegExp(String(pattern), typeof options === "string" ? options : undefined);
}

function matchOperators(candidates: unknown[], ops: Doc): boolean {
  for (const [op, arg] of Object.entries(ops)) {
    switch (op) {
      case "$eq":
        if (!anyEquals(candidates, arg)) return false;
        break;
      case "$ne":
        if (anyEquals(candidates, arg)) return false;
        break;
      case "$in":
        if (!(arg as unknown[]).some((v) => anyEquals(candidates, v))) return false;
        break;
      case "$nin":
        if ((arg as unknown[]).some((v) => anyEquals(candidates, v))) return false;
        break;
      case "$gt":
        if (!compareOp(candidates, arg, (c) => c > 0)) return false;
        break;
      case "$gte":
        if (!compareOp(candidates, arg, (c) => c >= 0)) return false;
        break;
      case "$lt":
        if (!compareOp(candidates, arg, (c) => c < 0)) return false;
        break;
      case "$lte":
        if (!compareOp(candidates, arg, (c) => c <= 0)) return false;
        break;
      case "$exists": {
        const exists = candidates.some((c) => c !== undefined);
        if (exists !== Boolean(arg)) return false;
        break;
      }
      case "$regex": {
        const re = toRegExp(arg, ops.$options);
        if (!flatten(candidates).some((c) => typeof c === "string" && re.test(c))) return false;
        break;
      }
      case "$options":
        break;
      case "$size":
        if (!candidates.some((c) => Array.isArray(c) && c.length === arg)) return false;
        break;
      case "$all":
        if (!(arg as unknown[]).every((v) => anyEquals(candidates, v))) return false;
        break;
      case "$elemMatch": {
        const sub = arg as Doc;
        const hit = candidates.some(
          (c) =>
            Array.isArray(c) &&
            c.some((el) =>
              isOperatorObject(sub) ? matchOperators([el], sub) : isPlainObject(el) && matchesFilter(el, sub),
            ),
        );
        if (!hit) return false;
        break;
      }
      case "$not": {
        const inner = arg instanceof RegExp ? { $regex: arg } : (arg as Doc);
        if (matchOperators(candidates, inner)) return false;
        break;
      }
      case "$type": {
        const want = String(arg);
        const names: Record<number, string> = { 1: "null", 2: "number", 3: "string", 4: "object", 5: "array", 7: "objectId", 8: "bool", 9: "date" };
        if (!candidates.some((c) => names[typeRank(c)] === want || (want === "double" && typeof c === "number"))) return false;
        break;
      }
      default:
        throw new UnsupportedOperatorError(op);
    }
  }
  return true;
}

export function matchesFilter(doc: Doc, filter: Filter | null | undefined): boolean {
  if (!filter) return true;
  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$and") {
      if (!(cond as Filter[]).every((f) => matchesFilter(doc, f))) return false;
      continue;
    }
    if (key === "$or") {
      if (!(cond as Filter[]).some((f) => matchesFilter(doc, f))) return false;
      continue;
    }
    if (key === "$nor") {
      if ((cond as Filter[]).some((f) => matchesFilter(doc, f))) return false;
      continue;
    }
    if (key === "$comment") continue;
    if (key.startsWith("$")) throw new UnsupportedOperatorError(key);

    const candidates = resolvePath(doc, key.split("."));
    if (isOperatorObject(cond)) {
      if (!matchOperators(candidates, cond)) return false;
    } else if (!anyEquals(candidates, cond)) {
      return false;
    }
  }
  return true;
}

/** Equality fields from a filter — seeds the document created by an upsert. */
export function equalityFields(filter: Filter | null | undefined): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  if (!filter) return out;
  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$and") {
      for (const f of cond as Filter[]) out.push(...equalityFields(f));
    } else if (!key.startsWith("$")) {
      if (isOperatorObject(cond)) {
        if ("$eq" in cond) out.push([key, cond.$eq]);
      } else if (!(cond instanceof RegExp)) {
        out.push([key, cond]);
      }
    }
  }
  return out;
}

// ── Sort & projection ────────────────────────────────────────────────────────

export type SortSpec = Array<[string, 1 | -1]>;

export function normalizeSort(sort: unknown): SortSpec {
  if (!sort) return [];
  const entries: Array<[string, unknown]> =
    sort instanceof Map
      ? [...sort.entries()]
      : Array.isArray(sort)
        ? (sort as Array<[string, unknown]>)
        : typeof sort === "string"
          ? [[sort, 1]]
          : Object.entries(sort as Doc);
  return entries.map(([k, v]) => {
    const dir = v === -1 || v === "desc" || v === "descending" ? -1 : 1;
    return [k, dir as 1 | -1];
  });
}

function sortKey(doc: Doc, path: string, dir: 1 | -1): unknown {
  const values = flatten(resolvePath(doc, path.split(".")));
  if (values.length <= 1) return values[0];
  // Arrays sort by their min (asc) or max (desc) element.
  return values.reduce((best, v) => (compareValues(v, best) * dir < 0 ? v : best));
}

export function sortDocs<T extends Doc>(docs: T[], sort: SortSpec): T[] {
  if (!sort.length) return docs;
  return [...docs].sort((a, b) => {
    for (const [path, dir] of sort) {
      const c = compareValues(sortKey(a, path, dir), sortKey(b, path, dir));
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}

function setPathRaw(target: Doc, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Doc = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]] as Doc;
  }
  cur[parts[parts.length - 1]] = value;
}

function unsetPathRaw(target: Doc, path: string): void {
  const parts = path.split(".");
  let cur: unknown = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur)) return;
    cur = cur[parts[i]];
  }
  if (isPlainObject(cur)) delete cur[parts[parts.length - 1]];
}

/** Apply a find projection. `meta` supplies values for { $meta: … } fields. */
export function projectDoc(doc: Doc, projection: Doc | null | undefined, meta?: Record<string, unknown>): Doc {
  if (!projection || Object.keys(projection).length === 0) return doc;

  const entries = Object.entries(projection);
  const isMeta = (v: unknown) => isPlainObject(v) && "$meta" in v;
  const inclusive = entries.some(([k, v]) => k !== "_id" && !isMeta(v) && v !== 0 && v !== false);

  if (inclusive) {
    const out: Doc = {};
    if (projection._id !== 0 && projection._id !== false && doc._id !== undefined) out._id = doc._id;
    for (const [k, v] of entries) {
      if (k === "_id") continue;
      if (isMeta(v)) {
        out[k] = meta?.[String((v as Doc).$meta)];
        continue;
      }
      if (v === 0 || v === false) continue;
      if (isPlainObject(v)) throw new UnsupportedOperatorError(`projection ${JSON.stringify(v)}`);
      const value = getPath(doc, k);
      if (value !== undefined) setPathRaw(out, k, value);
    }
    return out;
  }

  const out: Doc = { ...doc };
  for (const [k, v] of entries) {
    if (isMeta(v)) out[k] = meta?.[String((v as Doc).$meta)];
    else if (k.includes(".")) unsetPathRaw(out, k);
    else delete out[k];
  }
  return out;
}
