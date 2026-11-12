import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Address} from '@ton/ton';
import {PostgresStore} from './postgres-store';
import {reserveNativeWithdrawal} from './ton-withdrawal';

test('PostgreSQL withdrawal reservations are atomic, idempotent and enforce daily limits concurrently',{skip:!process.env.DATABASE_TEST_URL},async()=>{
 const url=new URL(process.env.DATABASE_TEST_URL!);
 assert.ok(url.pathname.endsWith('_validation')||url.pathname.endsWith('_test'),'Dedicated test database required.');
 const db=new PostgresStore(url.href);await db.initialize();
 const user='toncheck_'+randomUUID(),address=new Address(0,Buffer.alloc(32,3)).toString();
 const userRef=db.collection('users').doc(user);
 const input={userId:user,amount:'1.000000003',walletAddress:address,requestKey:randomUUID(),network:'testnet',min:1e9,max:1e11,dailyLimit:3e9+9};
 const move=async(tx:any,amount:number)=>{
  const profile=await tx.get(userRef);const data=profile.data();
  if(data!.available<amount)throw new Error('Insufficient funds.');
  tx.update(userRef,{available:data!.available-amount,pending:data!.pending+amount});
 };
 try{
  await userRef.set({available:10e9,pending:0});
  const duplicates=await Promise.all(Array.from({length:20},()=>reserveNativeWithdrawal(db,input,move)));
  assert.equal(new Set(duplicates.map(x=>x.withdrawalId)).size,1);
  assert.equal((await userRef.get()).data()!.pending,1000000003);
  await assert.rejects(reserveNativeWithdrawal(db,{...input,amount:'2'},move),/conflicts/);
  const race=await Promise.allSettled(Array.from({length:5},()=>reserveNativeWithdrawal(db,{...input,requestKey:randomUUID()},move)));
  assert.equal(race.filter(x=>x.status==='fulfilled').length,2);
  assert.equal((await userRef.get()).data()!.pending,3000000009);
  await assert.rejects(reserveNativeWithdrawal(db,{...input,requestKey:randomUUID(),dailyLimit:50e9},async(tx,amount)=>{await move(tx,amount);throw new Error('Injected storage failure');}),/Injected/);
  assert.equal((await userRef.get()).data()!.pending,3000000009,'Failed request must roll back the balance change.');
  const all=await db.collection('tonWithdrawals').where('telegramUserId','==',user).get();assert.equal(all.size,3,'No orphan or duplicate payout request.');
 }finally{
  const all=await db.collection('tonWithdrawals').where('telegramUserId','==',user).get();for(const row of all.docs)await row.ref.delete();await userRef.delete();await db.terminate();
 }
});
