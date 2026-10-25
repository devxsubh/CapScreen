/**
 * MongoDB update operators applied in place to a plain JS document.
 */
import {
  UnsupportedOperatorError,
  compareValues,
  isPlainObject,
  matchesFilter,
  valuesEqual,
  type Doc,
} from "./query";

function parentOf(doc: Doc, path: string, create: boolean): { parent: Doc | unknown[]; key: string } | null {
  const parts = path.split(".");
  let cur: unknown = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (p === "$" || p.startsWith("$[")) throw new UnsupportedOperatorError(`positional path ${path}`);
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isInteger(idx)) return null;
      if (cur[idx] === undefined || cur[idx] === null) {
        if (!create) return null;
        cur[idx] = {};
      }
      cur = cur[idx];
    } else if (isPlainObject(cur)) {
      if (cur[p] === undefined || cur[p] === null) {
        if (!create) return null;
        cur[p] = {};
      }
      cur = cur[p];
    } else {
      return null;
    }
  }
  if (!Array.isArray(cur) && !isPlainObject(cur)) return null;
  return { parent: cur as Doc | unknown[], key: parts[parts.length - 1] };
}

function getAt(doc: Doc, path: string): unknown {
  const loc = parentOf(doc, path, false);
  if (!loc) return undefined;
  return Array.isArray(loc.parent) ? loc.parent[Number(loc.key)] : loc.parent[loc.key];
}

function setAt(doc: Doc, path: string, value: unknown): void {
  const loc = parentOf(doc, path, true);
  if (!loc) throw new Error(`Cannot set path "${path}"`);
  if (Array.isArray(loc.parent)) loc.parent[Number(loc.key)] = value;
  else loc.parent[loc.key] = value;
}

function unsetAt(doc: Doc, path: string): void {
  const loc = parentOf(doc, path, false);
  if (!loc) return;
  if (Array.isArray(loc.parent)) loc.parent[Number(loc.key)] = null;
  else delete loc.parent[loc.key];
}

function arrayAt(doc: Doc, path: string, op: string): unknown[] {
  const cur = getAt(doc, path);
  if (cur === undefined || cur === null) {
    const arr: unknown[] = [];
    setAt(doc, path, arr);
    return arr;
  }
  if (!Array.isArray(cur)) throw new Error(`${op} on non-array field "${path}"`);
  return cur;
}

function matchesPullCondition(el: unknown, cond: unknown): boolean {
  if (isPlainObject(cond)) {
    const keys = Object.keys(cond);
    if (keys.length && keys.every((k) => k.startsWith("$"))) {
      return matchesFilter({ v: el }, { v: cond });
    }
    return isPlainObject(el) ? matchesFilter(el, cond) : false;
  }
  return valuesEqual(el, cond);
}

export function isUpdateDocument(update: Doc): boolean {
  return Object.keys(update).some((k) => k.startsWith("$"));
}

/**
 * Apply `update` to `doc` in place. `isInsert` enables $setOnInsert.
 * `clone` copies incoming values so stored documents never alias caller objects.
 */
export function applyUpdate(doc: Doc, update: Doc, isInsert: boolean, clone: <T>(v: T) => T): void {
  for (const [op, fields] of Object.entries(update)) {
    const entries = Object.entries((fields ?? {}) as Doc);
    switch (op) {
      case "$set":
        for (const [p, v] of entries) setAt(doc, p, clone(v));
        break;
      case "$setOnInsert":
        if (isInsert) for (const [p, v] of entries) setAt(doc, p, clone(v));
        break;
      case "$unset":
        for (const [p] of entries) unsetAt(doc, p);
        break;
      case "$inc":
        for (const [p, v] of entries) setAt(doc, p, (Number(getAt(doc, p)) || 0) + Number(v));
        break;
      case "$mul":
        for (const [p, v] of entries) setAt(doc, p, (Number(getAt(doc, p)) || 0) * Number(v));
        break;
      case "$min":
        for (const [p, v] of entries) {
          const cur = getAt(doc, p);
          if (cur === undefined || compareValues(v, cur) < 0) setAt(doc, p, clone(v));
        }
        break;
      case "$max":
        for (const [p, v] of entries) {
          const cur = getAt(doc, p);
          if (cur === undefined || compareValues(v, cur) > 0) setAt(doc, p, clone(v));
        }
        break;
      case "$currentDate":
        for (const [p] of entries) setAt(doc, p, new Date());
        break;
      case "$rename":
        for (const [p, to] of entries) {
          const v = getAt(doc, p);
          if (v === undefined) continue;
          unsetAt(doc, p);
          setAt(doc, String(to), v);
        }
        break;
      case "$push":
        for (const [p, v] of entries) {
          const arr = arrayAt(doc, p, op);
          const spec = isPlainObject(v) && "$each" in v ? v : null;
          const items = (spec ? (spec.$each as unknown[]) : [v]).map((x) => clone(x));
          if (spec && typeof spec.$position === "number") arr.splice(spec.$position, 0, ...items);
          else arr.push(...items);
          if (spec && spec.$sort !== undefined) {
            const s = spec.$sort;
            if (typeof s === "number") arr.sort((a, b) => compareValues(a, b) * s);
            else {
              const keys = Object.entries(s as Doc);
              arr.sort((a, b) => {
                for (const [k, d] of keys) {
                  const c = compareValues((a as Doc)?.[k], (b as Doc)?.[k]);
                  if (c) return c * Number(d);
                }
                return 0;
              });
            }
          }
          if (spec && typeof spec.$slice === "number") {
            const n = spec.$slice;
            const kept = n >= 0 ? arr.slice(0, n) : arr.slice(n);
            arr.length = 0;
            arr.push(...kept);
          }
        }
        break;
      case "$addToSet":
        for (const [p, v] of entries) {
          const arr = arrayAt(doc, p, op);
          const items = isPlainObject(v) && "$each" in v ? (v.$each as unknown[]) : [v];
          for (const item of items) {
            if (!arr.some((x) => valuesEqual(x, item))) arr.push(clone(item));
          }
        }
        break;
      case "$pull":
        for (const [p, cond] of entries) {
          const cur = getAt(doc, p);
          if (!Array.isArray(cur)) continue;
          const kept = cur.filter((el) => !matchesPullCondition(el, cond));
          cur.length = 0;
          cur.push(...kept);
        }
        break;
      case "$pullAll":
        for (const [p, values] of entries) {
          const cur = getAt(doc, p);
          if (!Array.isArray(cur)) continue;
          const kept = cur.filter((el) => !(values as unknown[]).some((v) => valuesEqual(el, v)));
          cur.length = 0;
          cur.push(...kept);
        }
        break;
      case "$pop":
        for (const [p, dir] of entries) {
          const cur = getAt(doc, p);
          if (!Array.isArray(cur)) continue;
          if (Number(dir) < 0) cur.shift();
          else cur.pop();
        }
        break;
      default:
        throw new UnsupportedOperatorError(op);
    }
  }
}
