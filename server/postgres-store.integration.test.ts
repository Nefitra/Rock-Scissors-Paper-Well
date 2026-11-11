import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PostgresStore} from './postgres-store';
import {adjustPoints} from './points-ledger';
import {randomUUID} from 'node:crypto';
test('PostgreSQL persists data, rolls back failures and serializes duplicate/concurrent credits',{skip:!process.env.DATABASE_TEST_URL},async()=>{
 const db=new PostgresStore(process.env.DATABASE_TEST_URL!);await db.initialize();
 const userId='test_'+randomUUID().replaceAll('-','');
 const prefix='integration_'+randomUUID().replaceAll('-','');const account=db.collection(prefix).doc('account');const guard=db.collection(prefix).doc('guard');
 try {
  await db.collection('users').doc(userId).create({vViral:0});
  await Promise.all(Array.from({length:12},()=>adjustPoints(db,userId,50,'credit','integration','','same-key')));
  assert.equal((await db.collection('users').doc(userId).get()).data()!.vViral,50);
  await Promise.all(Array.from({length:10},(_,i)=>adjustPoints(db,userId,1,'credit','integration','',String(i))));
  assert.equal((await db.collection('users').doc(userId).get()).data()!.vViral,60);
  await assert.rejects(adjustPoints(db,userId,-100,'debit','integration'));
  assert.equal((await db.collection('users').doc(userId).get()).data()!.vViral,60);
  await account.set({balance:0,profile:{name:'before'},createdAt:'2026-01-01'});
  await Promise.all(Array.from({length:12},()=>db.runTransaction(async tx=>{
   if((await tx.get(guard)).exists)return;
   const current=await tx.get(account);tx.update(account,{balance:current.data()!.balance+10});tx.create(guard,{posted:true});
  })));
  assert.equal((await account.get()).data()!.balance,10);
  await Promise.all(Array.from({length:10},()=>db.runTransaction(async tx=>{const s=await tx.get(account);tx.update(account,{balance:s.data()!.balance+1});})));
  assert.equal((await account.get()).data()!.balance,20);
  await assert.rejects(db.runTransaction(async tx=>{tx.update(account,{balance:500});throw new Error('abort');}));
  assert.equal((await account.get()).data()!.balance,20);
  await account.update({'profile.name':'after'});
  assert.equal((await db.collection(prefix).where('profile.name','==','after').orderBy('createdAt').limit(1).get()).size,1);
  await account.set({profile:{badge:1}},{merge:true});assert.equal((await account.get()).get('profile.name'),'after');
  const batch=db.batch();batch.update(account,{balance:999});batch.create(guard,{posted:false});await assert.rejects(batch.commit());
  assert.equal((await account.get()).data()!.balance,20);
  const second=new PostgresStore(process.env.DATABASE_TEST_URL!);assert.equal((await second.doc(account.path).get()).data()!.balance,20);await second.terminate();
 } finally {await db.pool.query("DELETE FROM arena_documents WHERE path=$1 OR (collection_path='transactions' AND data->>'userId'=$2)",['users/'+userId,userId]);await db.pool.query('DELETE FROM arena_documents WHERE collection_path=$1',[prefix]);await db.terminate();}
});
