import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

type Data = Record<string, any>;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function field(data: Data, key: string) { return key.split('.').reduce((v, k) => v?.[k], data); }
function merge(a: Data, b: Data): Data {
  const result = copy(a);
  for (const [k, v] of Object.entries(b)) result[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(result[k] ?? {}, v) : v;
  return result;
}
function patch(data: Data, changes: Data) {
  const result = copy(data);
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split('.'); let parent = result;
    for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
    parent[parts.at(-1)!] = value;
  }
  return result;
}
class Snapshot {
  exists: boolean;
  id: string;
  constructor(public ref: Document, private value?: Data) { this.exists = value !== undefined; this.id = ref.id; }
  data() { return this.value === undefined ? undefined : copy(this.value); }
  get(key: string) { return this.value === undefined ? undefined : field(this.value, key); }
}
class QuerySnapshot {
  size: number; empty: boolean;
  constructor(public docs: Snapshot[]) { this.size = docs.length; this.empty = !docs.length; }
  forEach(fn: (snapshot: Snapshot) => void) { this.docs.forEach(fn); }
}
type Filter = { field: string; op: string; value: any };
export class Query {
  constructor(public store: PostgresStore, public path: string, private filters: Filter[] = [], private orders: { field: string; dir: string }[] = [], private maximum?: number) {}
  where(field: string, op: string, value: any) { return new Query(this.store, this.path, [...this.filters, { field, op, value }], this.orders, this.maximum); }
  orderBy(field: string, dir = 'asc') { if (!['asc','desc'].includes(dir)) throw new Error('Invalid query direction'); return new Query(this.store, this.path, this.filters, [...this.orders, { field, dir }], this.maximum); }
  limit(n: number) { if (!Number.isInteger(n) || n < 1) throw new Error('Invalid query limit'); return new Query(this.store, this.path, this.filters, this.orders, n); }
  doc(id = randomUUID().replaceAll('-', '')) { return this.store.doc(`${this.path}/${id}`); }
  async add(data: Data) { const ref = this.doc(); await ref.create(data); return ref; }
  async get(client?: PoolClient) {
    const args: any[] = [this.path]; const clauses = ['collection_path=$1'];
    const param = (value: any) => { args.push(value); return `$${args.length}`; };
    for (const filter of this.filters) {
      const key = `(data #> ${param(filter.field.split('.'))}::text[])`;
      const value = param(JSON.stringify(filter.value));
      if (['==','!=','<','<=','>','>='].includes(filter.op)) clauses.push(`${key} ${filter.op === '==' ? '=' : filter.op === '!=' ? '<>' : filter.op} ${value}::jsonb`);
      else if (filter.op === 'in') clauses.push(`${key} IN (SELECT value FROM jsonb_array_elements(${value}::jsonb))`);
      else if (filter.op === 'array-contains') clauses.push(`${key} @> jsonb_build_array(${value}::jsonb)`);
      else throw new Error(`Unsupported query operator: ${filter.op}`);
    }
    const orders = this.orders.map(o => { const key = `(data #> ${param(o.field.split('.'))}::text[])`; clauses.push(`${key} IS NOT NULL`); return `${key} ${o.dir}`; });
    const result = await (client ?? this.store.pool).query(`SELECT path,data FROM arena_documents WHERE ${clauses.join(' AND ')} ORDER BY ${[...orders, 'path ASC'].join(',')} ${this.maximum ? `LIMIT ${param(this.maximum)}` : ''}`, args);
    return new QuerySnapshot(result.rows.map(row => new Snapshot(this.store.doc(row.path), row.data)));
  }
}
export class Document {
  id: string;
  constructor(public store: PostgresStore, public path: string) { const parts = path.split('/'); if (parts.some(p => !p) || parts.length % 2) throw new Error('Invalid document path'); this.id = parts.at(-1)!; }
  collection(name: string) { return this.store.collection(`${this.path}/${name}`); }
  async get(client?: PoolClient) { const result = await (client ?? this.store.pool).query('SELECT data FROM arena_documents WHERE path=$1',[this.path]); return new Snapshot(this, result.rows[0]?.data); }
  async set(data: Data, options?: { merge?: boolean }) { await this.store.runTransaction(async tx => { tx.set(this,data,options); }); }
  async update(data: Data) { await this.store.runTransaction(async tx => { tx.update(this,data); }); }
  async create(data: Data) { await this.store.runTransaction(async tx => { tx.create(this,data); }); }
  async delete() { await this.store.runTransaction(async tx => { tx.delete(this); }); }
}
type Write = { ref: Document; kind: 'set' | 'update' | 'delete' | 'create'; data?: Data; merge?: boolean };
class Transaction {
  writes: Write[] = [];
  constructor(private client: PoolClient) {}
  get(ref: Document): Promise<Snapshot>;
  get(ref: Query): Promise<QuerySnapshot>;
  get(ref: Document | Query) { return ref.get(this.client); }
  set(ref: Document,data: Data,options?: { merge?: boolean }) { this.writes.push({ref,kind:'set',data:copy(data),merge:options?.merge}); return this; }
  update(ref: Document,data: Data) { this.writes.push({ref,kind:'update',data:copy(data)}); return this; }
  create(ref: Document,data: Data) { this.writes.push({ref,kind:'create',data:copy(data)}); return this; }
  delete(ref: Document) { this.writes.push({ref,kind:'delete'}); return this; }
  async flush() {
    for (const write of this.writes) {
      if (write.kind === 'delete') { await this.client.query('DELETE FROM arena_documents WHERE path=$1',[write.ref.path]); continue; }
      const snapshot = await write.ref.get(this.client);
      if (write.kind === 'update' && !snapshot.exists) throw new Error('Document not found');
      if (write.kind === 'create' && snapshot.exists) throw new Error('Document already exists');
      const data = write.kind === 'update' ? patch(snapshot.data()!,write.data!) : write.merge ? merge(snapshot.data() ?? {},write.data!) : write.data;
      await this.client.query('INSERT INTO arena_documents(path,collection_path,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(path) DO UPDATE SET data=excluded.data', [write.ref.path,write.ref.path.split('/').slice(0,-1).join('/'),JSON.stringify(data)]);
    }
  }
}
export class PostgresStore {
  pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    this.pool.on('error', () => console.error('POSTGRES_POOL_ERROR'));
  }
  async initialize() {
    await this.pool.query('CREATE TABLE IF NOT EXISTS arena_documents(path text PRIMARY KEY, collection_path text NOT NULL, data jsonb NOT NULL CHECK(jsonb_typeof(data)=\'object\'))');
    await this.pool.query('CREATE INDEX IF NOT EXISTS arena_collection_idx ON arena_documents(collection_path)');
  }
  collection(path: string) { if (path.split('/').length % 2 !== 1) throw new Error('Invalid collection path'); return new Query(this,path); }
  doc(path: string) { return new Document(this,path); }
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // All writers, including individual document writes, share the same lock.
      // Reads run at READ COMMITTED after lock acquisition, so waiters see commits.
      await client.query("SELECT pg_advisory_xact_lock(8819553552)");
      const tx = new Transaction(client); const result = await fn(tx); await tx.flush();
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  batch() {
    const writes: Write[] = []; const batch: any = {};
    for (const kind of ['set','update','delete','create'] as const) batch[kind] = (ref: Document,data?: Data,options?: {merge?: boolean}) => { writes.push({ref,kind,data,merge:options?.merge}); return batch; };
    batch.commit = () => this.runTransaction(async tx => { tx.writes = copyWrites(writes); });
    return batch;
  }
  terminate() { return this.pool.end(); }
}
function copyWrites(writes: Write[]) { return writes.map(w => ({...w,data:w.data === undefined ? undefined : copy(w.data)})); }
