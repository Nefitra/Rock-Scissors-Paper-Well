export const unavailableMessage = 'Financial services are temporarily unavailable. Please try again later.';

export class StoreUnavailable extends Error {
  constructor() { super(unavailableMessage); }
}

// Process-wide breaker. A failed write is NEVER replayed outside an SDK transaction.
export class FirestoreCircuit {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'OPEN';
  nextProbeAt = 0;
  private failures = 0;
  private probing?: Promise<boolean>;
  constructor(private clock = Date.now, private random = Math.random) {}
  get ready() { return this.state === 'CLOSED'; }
  assertReady() { if (!this.ready) throw new StoreUnavailable(); }
  fail(error: unknown) {
    if (error instanceof StoreUnavailable) return;
    if (this.state === 'OPEN' && this.nextProbeAt > this.clock()) return;
    this.state = 'OPEN';
    const delay = [60_000, 300_000, 900_000][Math.min(this.failures++, 2)];
    this.nextProbeAt = this.clock() + delay + Math.floor(this.random() * delay * 0.1);
    console.error(JSON.stringify({ event: 'DEGRADED_MODE_ENABLED', state: this.state, retryAfterMs: this.nextProbeAt - this.clock() }));
  }
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.assertReady();
    try { return await operation(); }
    catch (error: any) {
      const code = String(error?.code ?? '').toLowerCase();
      const message = String(error?.message ?? '').toLowerCase();
      if (['4','7','8','14','16','permission-denied','resource-exhausted','unavailable','deadline-exceeded','unauthenticated'].includes(code) || /quota|resource_exhausted|permission_denied|credentials/.test(message)) {
        this.fail(error);
        throw new StoreUnavailable();
      }
      throw error;
    }
  }
  probe(operation: () => Promise<unknown>): Promise<boolean> {
    if (this.probing) return this.probing;
    if (this.ready) return Promise.resolve(true);
    if (this.clock() < this.nextProbeAt) return Promise.resolve(false);
    this.state = 'HALF_OPEN';
    this.probing = (async () => {
      // Yield before invoking the SDK, including synchronous credential errors.
      await Promise.resolve();
      console.log(JSON.stringify({ event: 'FIRESTORE_HEALTH_PROBE', state: this.state }));
      try {
        await operation();
        this.state = 'CLOSED'; this.failures = 0; this.nextProbeAt = 0;
        console.log(JSON.stringify({ event: 'FIRESTORE_ADMIN_READY', state: this.state }));
        return true;
      } catch {
        console.error(JSON.stringify({ event: 'FIRESTORE_ADMIN_FAILED' }));
        this.fail(new Error('Preflight failed'));
        return false;
      } finally { this.probing = undefined; }
    })();
    return this.probing;
  }
}

// Keep native Admin SDK reference/transaction semantics; unwrap reference arguments
// before passing them to the SDK. Snapshots and stored data are returned untouched.
export function guardedFirestore(nativeDb: any, circuit: FirestoreCircuit): any {
  const originals = new WeakMap<object, any>();
  const proxies = new WeakMap<object, any>();
  const unwrap = (value: any) => value && typeof value === 'object' ? originals.get(value) ?? value : value;
  const chain = new Set(['collection', 'doc', 'where', 'orderBy', 'limit', 'startAfter', 'startAt', 'endAt', 'endBefore', 'select', 'batch']);
  const io = new Set(['get', 'getAll', 'set', 'update', 'delete', 'create', 'add', 'commit']);
  const wrap = (target: any, transaction = false): any => {
    if (proxies.has(target)) return proxies.get(target);
    const proxy = new Proxy(target, { get(obj, name) {
      const value = Reflect.get(obj, name, obj);
      if (typeof value !== 'function') return value;
      if (name === 'runTransaction') return (callback: any, ...options: any[]) => circuit.execute(() => obj.runTransaction((tx: any) => callback(wrap(tx, true)), ...options));
      if (chain.has(String(name))) return (...args: any[]) => wrap(value.apply(obj, args.map(unwrap)), name === 'batch');
      if (io.has(String(name))) return (...args: any[]) => {
        circuit.assertReady();
        if (transaction && ['set','update','delete','create'].includes(String(name))) {
          value.apply(obj, args.map(unwrap)); return proxy;
        }
        return circuit.execute(() => value.apply(obj, args.map(unwrap))).then(result => name === 'add' ? wrap(result) : result);
      };
      if (['onSnapshot', 'stream'].includes(String(name))) return () => { throw new Error('Streaming is disabled on the production store'); };
      return value.bind(obj);
    }});
    originals.set(proxy, target); proxies.set(target, proxy); return proxy;
  };
  return wrap(nativeDb);
}

export function workerRegistry(circuit: FirestoreCircuit) {
  const workers = new Map<string, ReturnType<typeof setInterval>>();
  return {
    start(name: string, intervalMs: number, work: () => Promise<unknown>) {
      if (workers.has(name)) return;
      let running = false;
      const timer = setInterval(async () => {
        if (!circuit.ready || running) return;
        running = true;
        try { await work(); } catch { console.error(JSON.stringify({ event: 'WORKER_FAILED', worker: name })); }
        finally { running = false; }
      }, intervalMs);
      workers.set(name, timer);
      console.log(JSON.stringify({ event: 'WORKER_STARTED', worker: name, instanceId: process.env.HOSTNAME, intervalMs }));
    },
    stop() { for (const timer of workers.values()) clearInterval(timer); workers.clear(); }
  };
}
