/**
 * SQLite-backed implementation of the MongoDB driver surface that mongoose
 * calls (Db / Collection / Cursor / ClientSession).
 *
 * Every collection lives in one `documents` table as EJSON. The process owning
 * the file keeps a parsed in-memory copy and writes through on every mutation,
 * so reads never touch disk. The desktop app is the only writer.
 */
import { DatabaseSync, type StatementSync } from "node:sqlite";
import mongoose from "mongoose";
import {
  equalityFields,
  getPath,
  isBsonValue,
  isPlainObject,
  matchesFilter,
  normalizeSort,
  projectDoc,
  sortDocs,
  UnsupportedOperatorError,
  valuesEqual,
  type Doc,
  type Filter,
} from "./query";
import { applyUpdate, isUpdateDocument } from "./update";

const { EJSON } = mongoose.mongo.BSON;
const ObjectId = mongoose.Types.ObjectId;

// ── Cloning / keys ───────────────────────────────────────────────────────────

export function cloneValue<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date) return new Date(v.getTime()) as T;
  if (isBsonValue(v) || v instanceof RegExp) return v;
  // Mongoose documents/arrays expose toBSON() — exactly what the real driver
  // serializes. (Mongoose overrides Array#map, so never map its arrays directly.)
  const toBSON = (v as { toBSON?: () => unknown }).toBSON;
  if (typeof toBSON === "function") return cloneValue(toBSON.call(v)) as T;
  if (Array.isArray(v)) return Array.from(v, (x) => cloneValue(x)) as T;
  if (Buffer.isBuffer(v)) return Buffer.from(v) as T;
  if (v instanceof Map) {
    const out: Doc = {};
    for (const [k, val] of v) out[String(k)] = cloneValue(val);
    return out as T;
  }
  const out: Doc = {};
  for (const k of Object.keys(v as Doc)) {
    const val = (v as Doc)[k];
    if (val !== undefined) out[k] = cloneValue(val);
  }
  return out as T;
}

function idKey(id: unknown): string {
  if (isBsonValue(id) && id._bsontype === "ObjectId") return `o:${(id as unknown as { toHexString(): string }).toHexString()}`;
  if (typeof id === "string") return `s:${id}`;
  if (typeof id === "number") return `n:${id}`;
  return `j:${EJSON.stringify(id as Doc, { relaxed: false })}`;
}

function duplicateKeyError(collection: string, keys: Doc, doc: Doc): Error {
  const keyValue: Doc = {};
  for (const k of Object.keys(keys)) keyValue[k] = getPath(doc, k);
  const err = new Error(
    `E11000 duplicate key error collection: ${collection} index: ${Object.keys(keys).join("_")} dup key: ${EJSON.stringify(keyValue)}`,
  );
  return Object.assign(err, { name: "MongoServerError", code: 11000, keyPattern: keys, keyValue });
}

type IndexSpec = {
  name: string;
  key: Doc;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Filter;
};

type FindOptions = {
  sort?: unknown;
  limit?: number;
  skip?: number;
  projection?: Doc;
  [k: string]: unknown;
};

// ── Cursor ───────────────────────────────────────────────────────────────────

export class SqliteCursor<T = Doc> {
  private _sort: unknown;
  private _limit = 0;
  private _skip = 0;
  private _projection: Doc | undefined;
  private _maps: Array<(d: unknown) => unknown> = [];
  private buffer: T[] | null = null;

  constructor(private readonly source: () => Doc[], opts: FindOptions = {}) {
    this._sort = opts.sort;
    this._limit = opts.limit ?? 0;
    this._skip = opts.skip ?? 0;
    this._projection = opts.projection;
  }

  sort(s: unknown) { this._sort = s; return this; }
  limit(n: number) { this._limit = n; return this; }
  skip(n: number) { this._skip = n; return this; }
  project(p: Doc) { this._projection = p; return this; }
  map<U>(fn: (d: T) => U): SqliteCursor<U> {
    this._maps.push(fn as (d: unknown) => unknown);
    return this as unknown as SqliteCursor<U>;
  }
  batchSize() { return this; }
  maxTimeMS() { return this; }
  allowDiskUse() { return this; }
  addCursorFlag() { return this; }
  hint() { return this; }
  collation() { return this; }
  comment() { return this; }

  private materialize(): T[] {
    if (this.buffer) return this.buffer;
    let docs = sortDocs(this.source(), normalizeSort(this._sort));
    if (this._skip) docs = docs.slice(this._skip);
    if (this._limit) docs = docs.slice(0, Math.abs(this._limit));
    let out: unknown[] = docs.map((d) => projectDoc(cloneValue(d), this._projection, (d as { __meta?: Doc }).__meta));
    for (const fn of this._maps) out = out.map(fn);
    this.buffer = out as T[];
    return this.buffer;
  }

  async toArray(): Promise<T[]> { return [...this.materialize()]; }
  async next(): Promise<T | null> { return this.materialize().shift() ?? null; }
  async tryNext(): Promise<T | null> { return this.next(); }
  async hasNext(): Promise<boolean> { return this.materialize().length > 0; }
  async forEach(fn: (d: T) => unknown): Promise<void> { for (const d of this.materialize()) await fn(d); }
  async count(): Promise<number> { return this.materialize().length; }
  async close(): Promise<void> { this.buffer = []; }
  rewind(): void { this.buffer = null; }
  get closed(): boolean { return this.buffer !== null && this.buffer.length === 0; }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (const d of this.materialize()) yield d;
  }
}

// ── Collection ───────────────────────────────────────────────────────────────

export class SqliteCollection {
  readonly docs = new Map<string, Doc>();
  readonly indexSpecs = new Map<string, IndexSpec>([["_id_", { name: "_id_", key: { _id: 1 } }]]);

  constructor(
    readonly collectionName: string,
    private readonly db: SqliteDb,
  ) {}

  get namespace(): string { return `${this.db.databaseName}.${this.collectionName}`; }
  get dbName(): string { return this.db.databaseName; }

  // internal ---------------------------------------------------------------

  private matching(filter: Filter | undefined): Doc[] {
    const f = filter ?? {};
    // Fast path for _id lookups, which is what save()/findById emit.
    const keys = Object.keys(f);
    if (keys.length === 1 && keys[0] === "_id" && !isPlainObject(f._id)) {
      const d = this.docs.get(idKey(f._id));
      return d ? [d] : [];
    }
    const out: Doc[] = [];
    for (const d of this.docs.values()) if (matchesFilter(d, f)) out.push(d);
    return out;
  }

  private first(filter: Filter | undefined, sort?: unknown): Doc | undefined {
    const docs = this.matching(filter);
    return sort ? sortDocs(docs, normalizeSort(sort))[0] : docs[0];
  }

  private checkUnique(doc: Doc, selfKey: string): void {
    for (const idx of this.indexSpecs.values()) {
      if (!idx.unique || idx.name === "_id_") continue;
      const fields = Object.keys(idx.key);
      if (idx.partialFilterExpression && !matchesFilter(doc, idx.partialFilterExpression)) continue;
      const values = fields.map((f) => getPath(doc, f));
      if (idx.sparse && values.every((v) => v === undefined)) continue;
      for (const [k, other] of this.docs) {
        if (k === selfKey) continue;
        if (idx.partialFilterExpression && !matchesFilter(other, idx.partialFilterExpression)) continue;
        if (fields.every((f, i) => valuesEqual(getPath(other, f), values[i]))) {
          throw duplicateKeyError(this.namespace, idx.key, doc);
        }
      }
    }
  }

  private put(doc: Doc, isNew: boolean): void {
    const key = idKey(doc._id);
    if (isNew && this.docs.has(key)) throw duplicateKeyError(this.namespace, { _id: 1 }, doc);
    this.checkUnique(doc, key);
    this.docs.set(key, doc);
    this.db.persist(this.collectionName, key, doc);
  }

  private remove(doc: Doc): void {
    const key = idKey(doc._id);
    this.docs.delete(key);
    this.db.unpersist(this.collectionName, key);
  }

  private prepareInsert(raw: Doc): Doc {
    const doc = cloneValue(raw);
    if (doc._id === undefined) doc._id = new ObjectId();
    raw._id ??= doc._id; // driver mutates the input like this too
    return doc;
  }

  /** Apply update to a copy; commit only if every constraint passes. */
  private updateDoc(existing: Doc, update: Doc | Doc[], isInsert: boolean): Doc {
    if (Array.isArray(update)) throw new UnsupportedOperatorError("update pipeline");
    const next = cloneValue(existing);
    if (isUpdateDocument(update)) {
      applyUpdate(next, update, isInsert, cloneValue);
    } else {
      for (const k of Object.keys(next)) if (k !== "_id") delete next[k];
      Object.assign(next, cloneValue(update));
    }
    if (!valuesEqual(next._id, existing._id) && !isInsert) {
      throw new Error("Performing an update on the path '_id' would modify the immutable field '_id'");
    }
    return next;
  }

  private upsertSeed(filter: Filter | undefined): Doc {
    const seed: Doc = {};
    for (const [path, value] of equalityFields(filter)) {
      applyUpdate(seed, { $set: { [path]: value } }, true, cloneValue);
    }
    return seed;
  }

  private doUpdate(filter: Filter, update: Doc | Doc[], opts: Doc, many: boolean) {
    const targets = many ? this.matching(filter) : [this.first(filter, opts.sort)].filter(Boolean) as Doc[];
    if (targets.length === 0 && opts.upsert) {
      const seed = this.upsertSeed(filter);
      const doc = this.updateDoc(seed, update, true);
      if (doc._id === undefined) doc._id = new ObjectId();
      this.db.transaction(() => this.put(doc, true));
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: doc._id, doc, before: null };
    }
    let modified = 0;
    let last: { doc: Doc; before: Doc } | null = null;
    this.db.transaction(() => {
      for (const t of targets) {
        const next = this.updateDoc(t, update, false);
        if (!valuesEqual(next, t)) {
          this.put(next, false);
          modified++;
        }
        last = { doc: next, before: t };
      }
    });
    const l = last as { doc: Doc; before: Doc } | null;
    return {
      acknowledged: true,
      matchedCount: targets.length,
      modifiedCount: modified,
      upsertedCount: 0,
      upsertedId: null,
      doc: l?.doc ?? null,
      before: l?.before ?? null,
    };
  }

  private modifyResult(value: Doc | null, opts: Doc, meta: Doc) {
    const projected = value ? projectDoc(cloneValue(value), opts.projection as Doc | undefined) : null;
    return opts.includeResultMetadata ? { value: projected, ok: 1, lastErrorObject: meta } : projected;
  }

  // driver API -------------------------------------------------------------

  find(filter?: Filter, opts: FindOptions = {}) {
    return new SqliteCursor(() => this.matching(filter), opts);
  }

  async findOne(filter?: Filter, opts: FindOptions = {}): Promise<Doc | null> {
    const docs = await this.find(filter, { ...opts, limit: 1 }).toArray();
    return docs[0] ?? null;
  }

  async countDocuments(filter?: Filter, opts: FindOptions = {}): Promise<number> {
    let n = this.matching(filter).length - (opts.skip ?? 0);
    if (opts.limit) n = Math.min(n, opts.limit);
    return Math.max(0, n);
  }

  async estimatedDocumentCount(): Promise<number> {
    return this.docs.size;
  }

  async distinct(key: string, filter?: Filter): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const d of this.matching(filter)) {
      const v = getPath(d, key);
      for (const item of Array.isArray(v) ? v : [v]) {
        if (item === undefined) continue;
        if (!out.some((o) => valuesEqual(o, item))) out.push(cloneValue(item));
      }
    }
    return out;
  }

  async insertOne(raw: Doc) {
    const doc = this.prepareInsert(raw);
    this.db.transaction(() => this.put(doc, true));
    return { acknowledged: true, insertedId: doc._id };
  }

  async insertMany(raws: Doc[], opts: Doc = {}) {
    const insertedIds: Record<number, unknown> = {};
    const ordered = opts.ordered !== false;
    const errors: Error[] = [];
    this.db.transaction(() => {
      raws.forEach((raw, i) => {
        try {
          const doc = this.prepareInsert(raw);
          this.put(doc, true);
          insertedIds[i] = doc._id;
        } catch (err) {
          if (ordered) throw err;
          errors.push(err as Error);
        }
      });
    });
    if (errors.length) throw errors[0];
    return { acknowledged: true, insertedCount: Object.keys(insertedIds).length, insertedIds };
  }

  async updateOne(filter: Filter, update: Doc, opts: Doc = {}) {
    const { doc: _d, before: _b, ...res } = this.doUpdate(filter, update, opts, false);
    return res;
  }

  async updateMany(filter: Filter, update: Doc, opts: Doc = {}) {
    const { doc: _d, before: _b, ...res } = this.doUpdate(filter, update, opts, true);
    return res;
  }

  async replaceOne(filter: Filter, replacement: Doc, opts: Doc = {}) {
    if (isUpdateDocument(replacement)) throw new Error("Replacement document must not contain atomic operators");
    return this.updateOne(filter, replacement, opts);
  }

  async findOneAndUpdate(filter: Filter, update: Doc, opts: Doc = {}) {
    const res = this.doUpdate(filter, update, opts, false);
    const after = opts.returnDocument === "after" || opts.returnOriginal === false;
    const value = res.upsertedCount ? (after ? res.doc : null) : after ? res.doc : res.before;
    return this.modifyResult(value, opts, {
      n: res.matchedCount || res.upsertedCount,
      updatedExisting: res.matchedCount > 0,
      ...(res.upsertedCount ? { upserted: res.upsertedId } : {}),
    });
  }

  async findOneAndReplace(filter: Filter, replacement: Doc, opts: Doc = {}) {
    if (isUpdateDocument(replacement)) throw new Error("Replacement document must not contain atomic operators");
    return this.findOneAndUpdate(filter, replacement, opts);
  }

  async findOneAndDelete(filter: Filter, opts: Doc = {}) {
    const doc = this.first(filter, opts.sort) ?? null;
    if (doc) this.db.transaction(() => this.remove(doc));
    return this.modifyResult(doc, opts, { n: doc ? 1 : 0 });
  }

  async deleteOne(filter?: Filter) {
    const doc = this.first(filter);
    if (doc) this.db.transaction(() => this.remove(doc));
    return { acknowledged: true, deletedCount: doc ? 1 : 0 };
  }

  async deleteMany(filter?: Filter) {
    const docs = this.matching(filter);
    this.db.transaction(() => docs.forEach((d) => this.remove(d)));
    return { acknowledged: true, deletedCount: docs.length };
  }

  async bulkWrite(ops: Doc[]) {
    const res = { insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, insertedIds: {} as Doc, upsertedIds: {} as Doc };
    for (const [i, op] of ops.entries()) {
      const [kind, a] = Object.entries(op)[0] as [string, Doc];
      if (kind === "insertOne") {
        const r = await this.insertOne(a.document as Doc);
        res.insertedCount++;
        res.insertedIds[i] = r.insertedId;
      } else if (kind === "updateOne" || kind === "updateMany" || kind === "replaceOne") {
        const update = (kind === "replaceOne" ? a.replacement : a.update) as Doc;
        const r = this.doUpdate(a.filter as Filter, update, a, kind === "updateMany");
        res.matchedCount += r.matchedCount;
        res.modifiedCount += r.modifiedCount;
        if (r.upsertedCount) {
          res.upsertedCount++;
          res.upsertedIds[i] = r.upsertedId;
        }
      } else if (kind === "deleteOne") {
        res.deletedCount += (await this.deleteOne(a.filter as Filter)).deletedCount;
      } else if (kind === "deleteMany") {
        res.deletedCount += (await this.deleteMany(a.filter as Filter)).deletedCount;
      } else {
        throw new UnsupportedOperatorError(`bulkWrite ${kind}`);
      }
    }
    return { ok: 1, ...res, isOk: () => true, hasWriteErrors: () => false, getWriteErrors: () => [] };
  }

  aggregate(pipeline: Doc[]) {
    return new SqliteCursor(() => this.runPipeline(pipeline));
  }

  private runPipeline(pipeline: Doc[]): Doc[] {
    let docs: Doc[] = [...this.docs.values()];
    for (const stage of pipeline) {
      const [op, arg] = Object.entries(stage)[0] as [string, Doc];
      switch (op) {
        case "$match":
          docs = docs.filter((d) => matchesFilter(d, arg));
          break;
        case "$vectorSearch":
          docs = vectorSearch(docs, arg);
          break;
        case "$sort":
          docs = sortDocs(docs, normalizeSort(arg));
          break;
        case "$skip":
          docs = docs.slice(Number(arg));
          break;
        case "$limit":
          docs = docs.slice(0, Number(arg));
          break;
        case "$project":
          docs = docs.map((d) => projectDoc(cloneValue(d), arg, (d as { __meta?: Doc }).__meta));
          break;
        case "$count":
          docs = [{ [String(arg)]: docs.length }];
          break;
        default:
          throw new UnsupportedOperatorError(`aggregate stage ${op}`);
      }
    }
    return docs;
  }

  async createIndex(key: Doc | string, opts: Doc = {}): Promise<string> {
    const k: Doc = typeof key === "string" ? { [key]: 1 } : key;
    const name = (opts.name as string) ?? Object.entries(k).map(([f, d]) => `${f}_${d}`).join("_");
    this.indexSpecs.set(name, {
      name,
      key: k,
      unique: Boolean(opts.unique),
      sparse: Boolean(opts.sparse),
      ...(typeof opts.expireAfterSeconds === "number" ? { expireAfterSeconds: opts.expireAfterSeconds } : {}),
      ...(opts.partialFilterExpression ? { partialFilterExpression: opts.partialFilterExpression as Filter } : {}),
    });
    return name;
  }

  async createIndexes(specs: Array<Doc & { key: Doc }>): Promise<string[]> {
    const names: string[] = [];
    for (const { key, ...opts } of specs) names.push(await this.createIndex(key, opts));
    return names;
  }

  listIndexes() {
    return new SqliteCursor(() => [...this.indexSpecs.values()].map((i) => ({ v: 2, ...i }) as Doc));
  }

  async indexes(): Promise<Doc[]> { return this.listIndexes().toArray(); }
  async indexExists(names: string | string[]): Promise<boolean> {
    return (Array.isArray(names) ? names : [names]).every((n) => this.indexSpecs.has(n));
  }
  async indexInformation(): Promise<Doc> {
    return Object.fromEntries([...this.indexSpecs.values()].map((i) => [i.name, Object.entries(i.key)]));
  }
  async dropIndex(name: string): Promise<Doc> { this.indexSpecs.delete(name); return { ok: 1 }; }
  async dropIndexes(): Promise<boolean> {
    for (const n of [...this.indexSpecs.keys()]) if (n !== "_id_") this.indexSpecs.delete(n);
    return true;
  }
  async drop(): Promise<boolean> { await this.deleteMany({}); return true; }

  watch(): never {
    throw new UnsupportedOperatorError("change streams");
  }

  /** Delete documents whose TTL index field has expired. */
  sweepExpired(now = Date.now()): number {
    let removed = 0;
    for (const idx of this.indexSpecs.values()) {
      if (idx.expireAfterSeconds === undefined) continue;
      const field = Object.keys(idx.key)[0];
      const expired = [...this.docs.values()].filter((d) => {
        const v = getPath(d, field);
        return v instanceof Date && v.getTime() + idx.expireAfterSeconds! * 1000 <= now;
      });
      if (expired.length) {
        this.db.transaction(() => expired.forEach((d) => this.remove(d)));
        removed += expired.length;
      }
    }
    return removed;
  }
}

/** In-process stand-in for Atlas $vectorSearch: exact cosine over the candidate set. */
function vectorSearch(docs: Doc[], spec: Doc): Doc[] {
  const path = String(spec.path);
  const q = spec.queryVector as number[];
  const limit = Number(spec.limit ?? 10);
  const qNorm = Math.hypot(...q) || 1;
  const filtered = spec.filter ? docs.filter((d) => matchesFilter(d, spec.filter as Filter)) : docs;

  const scored: Array<{ d: Doc; score: number }> = [];
  for (const d of filtered) {
    const v = getPath(d, path);
    if (!Array.isArray(v) || v.length !== q.length) continue;
    let dot = 0;
    let norm = 0;
    for (let i = 0; i < q.length; i++) {
      dot += q[i] * (v[i] as number);
      norm += (v[i] as number) ** 2;
    }
    if (!norm) continue;
    const cosine = dot / (qNorm * Math.sqrt(norm));
    // Atlas reports cosine similarity normalised to [0, 1].
    scored.push({ d, score: (1 + cosine) / 2 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ d, score }) => Object.assign(Object.create(null), d, { __meta: { vectorSearchScore: score } }) as Doc);
}

// ── Session / client / db ────────────────────────────────────────────────────

class SqliteSession {
  readonly id = { id: new ObjectId() };
  hasEnded = false;
  transaction = { state: "NO_TRANSACTION", isActive: false, isCommitted: false };
  inTransaction(): boolean { return false; }
  startTransaction(): void {}
  async commitTransaction(): Promise<void> {}
  async abortTransaction(): Promise<void> {}
  async endSession(): Promise<void> { this.hasEnded = true; }
  /**
   * Single-writer local store: run the callback directly. Each driver call is
   * already atomic; cross-call rollback is not provided.
   */
  async withTransaction<T>(fn: (s: SqliteSession) => Promise<T>): Promise<T> {
    return fn(this);
  }
  [Symbol.asyncDispose] = () => this.endSession();
}

export class SqliteDb {
  readonly databaseName = "capscreen";
  private readonly sql: DatabaseSync;
  private readonly collections = new Map<string, SqliteCollection>();
  private readonly upsertStmt: StatementSync;
  private readonly deleteStmt: StatementSync;
  private txDepth = 0;
  private ttlTimer: NodeJS.Timeout | null = null;

  constructor(readonly file: string) {
    this.sql = new DatabaseSync(file);
    this.sql.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        body       TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, id)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
    `);
    this.upsertStmt = this.sql.prepare(
      `INSERT INTO documents (collection, id, body, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (collection, id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    );
    this.deleteStmt = this.sql.prepare(`DELETE FROM documents WHERE collection = ? AND id = ?`);
    this.load();
  }

  private load(): void {
    const rows = this.sql.prepare(`SELECT collection, id, body FROM documents`).all() as Array<{
      collection: string;
      id: string;
      body: string;
    }>;
    for (const row of rows) {
      this.collection(row.collection).docs.set(row.id, EJSON.parse(row.body, { relaxed: true }) as Doc);
    }
  }

  persist(collection: string, id: string, doc: Doc): void {
    this.upsertStmt.run(collection, id, EJSON.stringify(doc, { relaxed: true }), Date.now());
  }

  unpersist(collection: string, id: string): void {
    this.deleteStmt.run(collection, id);
  }

  /** Synchronous SQLite transaction; nested calls join the outer one. */
  transaction(fn: () => void): void {
    if (this.txDepth > 0) {
      fn();
      return;
    }
    this.txDepth++;
    this.sql.exec("BEGIN");
    try {
      fn();
      this.sql.exec("COMMIT");
    } catch (err) {
      this.sql.exec("ROLLBACK");
      // Memory may have partially applied; reload this process's view from disk.
      for (const c of this.collections.values()) c.docs.clear();
      this.load();
      throw err;
    } finally {
      this.txDepth--;
    }
  }

  collection(name: string): SqliteCollection {
    let c = this.collections.get(name);
    if (!c) {
      c = new SqliteCollection(name, this);
      this.collections.set(name, c);
    }
    return c;
  }

  async createCollection(name: string): Promise<SqliteCollection> {
    return this.collection(name);
  }

  listCollections() {
    return new SqliteCursor(() => [...this.collections.keys()].map((name) => ({ name, type: "collection" })));
  }

  async dropCollection(name: string): Promise<boolean> {
    await this.collection(name).drop();
    this.collections.delete(name);
    return true;
  }

  async dropDatabase(): Promise<boolean> {
    for (const name of [...this.collections.keys()]) await this.dropCollection(name);
    return true;
  }

  async command(cmd: Doc): Promise<Doc> {
    if ("ping" in cmd) return { ok: 1 };
    if ("buildInfo" in cmd || "buildinfo" in cmd) return { ok: 1, version: "7.0.0", versionArray: [7, 0, 0, 0] };
    if ("hello" in cmd || "isMaster" in cmd) return { ok: 1, isWritablePrimary: true, maxWireVersion: 21 };
    throw new UnsupportedOperatorError(`command ${Object.keys(cmd)[0]}`);
  }

  admin() {
    return { command: (cmd: Doc) => this.command(cmd), ping: () => this.command({ ping: 1 }) };
  }

  startTtlSweeper(intervalMs = 60_000): void {
    const sweep = () => {
      for (const c of this.collections.values()) c.sweepExpired();
    };
    sweep();
    this.ttlTimer = setInterval(sweep, intervalMs);
    this.ttlTimer.unref();
  }

  /** Consistent single-file copy (safe while the app is running). */
  backupTo(target: string): void {
    this.sql.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }

  close(): void {
    if (this.ttlTimer) clearInterval(this.ttlTimer);
    this.sql.close();
  }
}

/** Minimal MongoClient stand-in: mongoose only needs db(), startSession() and close(). */
export class SqliteClient {
  constructor(readonly sqliteDb: SqliteDb) {}
  db(): SqliteDb { return this.sqliteDb; }
  startSession(): SqliteSession { return new SqliteSession(); }
  async close(): Promise<void> { this.sqliteDb.close(); }
  on(): this { return this; }
  once(): this { return this; }
  removeListener(): this { return this; }
}
