import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreCircuit, guardedFirestore, StoreUnavailable, workerRegistry } from './firestore-safety';

test('cold start blocks all store access without invoking the SDK', async () => {
  const circuit = new FirestoreCircuit(); let calls = 0;
  await assert.rejects(circuit.execute(async () => { calls++; }), StoreUnavailable);
  assert.equal(calls, 0);
});

test('simultaneous probes share one operation; failed probes respect backoff', async () => {
  let now = 0; let calls = 0; let release!: () => void;
  const circuit = new FirestoreCircuit(() => now, () => 0);
  const pending = new Promise<void>(resolve => { release = resolve; });
  const probe = async () => { calls++; await pending; throw new Error('IAM denied'); };
  const a = circuit.probe(probe); const b = circuit.probe(probe);
  assert.equal(a, b); release(); assert.equal(await a, false);
  assert.equal(calls, 1); assert.equal(circuit.nextProbeAt, 60000);
  await circuit.probe(probe); assert.equal(calls, 1);
  now = 60000; await circuit.probe(probe);
  assert.equal(circuit.nextProbeAt, 360000);
  now = 360000; await circuit.probe(probe);
  assert.equal(circuit.nextProbeAt, 1260000);
});

test('quota failure is propagated, subsequent calls are blocked, recovery is explicit', async () => {
  let now = 0; const circuit = new FirestoreCircuit(() => now, () => 0);
  await circuit.probe(async () => {}); let calls = 0;
  await assert.rejects(circuit.execute(async () => { calls++; throw { code: 8 }; }), StoreUnavailable);
  await assert.rejects(circuit.execute(async () => { calls++; }), StoreUnavailable);
  assert.equal(calls, 1); assert.equal(circuit.state, 'OPEN');
  now = 60000; await circuit.probe(async () => {});
  assert.equal(await circuit.execute(async () => 7), 7);
});

test('native reference arguments are unwrapped; data and snapshots retain identity', async () => {
  const circuit = new FirestoreCircuit(); await circuit.probe(async () => {});
  const snapshot = { exists: true, data: () => ({ amount: 10 }) };
  const nativeRef = { get: async () => snapshot };
  let written: unknown;
  const tx = { get: async (ref: any) => { assert.equal(ref, nativeRef); return snapshot; }, set: (ref: any, data: any) => { assert.equal(ref, nativeRef); written = data; } };
  const native = { doc: () => nativeRef, runTransaction: async (fn: any) => fn(tx) };
  const db = guardedFirestore(native, circuit); const data = { amount: '1000000000' };
  assert.equal(await db.doc('users/a').get(), snapshot);
  await db.runTransaction(async (transaction: any) => {
    assert.equal(await transaction.get(db.doc('users/a')), snapshot);
    transaction.set(db.doc('users/a'), data);
  });
  assert.equal(written, data);
});

test('failed transactions never run a synthetic fallback callback', async () => {
  const circuit = new FirestoreCircuit(); await circuit.probe(async () => {});
  let callbacks = 0;
  const db = guardedFirestore({ runTransaction: async (fn: any) => { await fn({}); throw { code: 8 }; } }, circuit);
  await assert.rejects(db.runTransaction(async () => { callbacks++; }), StoreUnavailable);
  assert.equal(callbacks, 1);
});

test('batch errors propagate instead of reporting a successful commit', async () => {
  const circuit = new FirestoreCircuit(); await circuit.probe(async () => {});
  const ref = {}; let commits = 0;
  const batch = { set: (r: any) => assert.equal(r, ref), commit: async () => { commits++; throw { code: 8 }; } };
  const db = guardedFirestore({ doc: () => ref, batch: () => batch }, circuit);
  const b = db.batch(); assert.equal(b.set(db.doc('x'), { a: 1 }), b);
  await assert.rejects(b.commit(), StoreUnavailable); assert.equal(commits, 1);
});

test('workers start once, do not overlap, and stop querying when circuit opens', async () => {
  const circuit = new FirestoreCircuit(); await circuit.probe(async () => {});
  const registry = workerRegistry(circuit); let calls = 0; let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const work = async () => { calls++; await pending; };
  try {
    registry.start('test', 5, work); registry.start('test', 5, work);
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(calls, 1);
    circuit.fail(new Error('quota')); release();
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(calls, 1);
  } finally { registry.stop(); }
});


test('synchronous probe failure releases single-flight state for a later retry', async () => {
  let now = 0; const circuit = new FirestoreCircuit(() => now, () => 0);
  assert.equal(await circuit.probe(() => { throw new Error('credentials'); }), false);
  now = 60000;
  assert.equal(await circuit.probe(async () => {}), true);
});
