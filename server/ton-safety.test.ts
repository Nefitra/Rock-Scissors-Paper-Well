import test from 'node:test';
import assert from 'node:assert/strict';
import {Address,beginCell} from '@ton/ton';
import {parseNativeAmount,canonicalNativeAddress,normalizeChainTransaction,matchesNativeReceipt,nativeComment,transactionCacheKey} from './ton-safety';
const a=new Address(0,Buffer.alloc(32,1)),b=new Address(0,Buffer.alloc(32,2));
const expected={source:a.toRawString(),destination:b.toRawString(),amountNano:1000000003,comment:'VIRAL_ARENA_DEP_A1B2C3',network:'mainnet',createdAt:new Date(Date.now()-10000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
const receipt=()=>({hash:'ab'.repeat(32),lt:'12345',now:Math.floor(Date.now()/1000),mc_block_seqno:100,description:{aborted:false},in_msg:{source:a.toString(),destination:b.toString(),value:String(expected.amountNano),decoded_body:{text:expected.comment},bounced:false}});
test('native decimal parsing never rounds nanograms or accepts partial numeric text',()=>{
 assert.equal(parseNativeAmount('1.000000003',1e9,1e12),1000000003);
 assert.equal(parseNativeAmount('1000.000000000',1e9,1e12),1e12);
 for(const value of ['1.0000000001','1abc','1e1','-1',Infinity,NaN,{},null,'',true,'0.999999999','1000.000000001'])assert.throws(()=>parseNativeAmount(value,1e9,1e12));
});
test('addresses validate checksum and test-only flag; account and chain cache keys are distinct',()=>{
 assert.equal(canonicalNativeAddress(a.toString()),a.toRawString());
 assert.throws(()=>canonicalNativeAddress(a.toString().slice(0,-1)+'!'));
 assert.throws(()=>canonicalNativeAddress(a.toString({testOnly:true}),'mainnet'));
 assert.notEqual(transactionCacheKey(a.toString(),'mainnet'),transactionCacheKey(b.toString(),'mainnet'));
 assert.notEqual(transactionCacheKey(a.toString(),'mainnet'),transactionCacheKey(a.toString(),'testnet'));
});
test('only exact, successful, finalized native receipts may credit or confirm',()=>{
 assert.ok(matchesNativeReceipt(receipt(),expected));
 for(const changes of [{hash:''},{mc_block_seqno:undefined},{description:{}},{description:{aborted:true}},{lt:''},{now:0},{now:Math.floor(Date.now()/1000)+600}])assert.equal(matchesNativeReceipt({...receipt(),...changes},expected),false);
 for(const changes of [{source:b.toString()},{destination:a.toString()},{value:'1000000000'},{bounced:true},{decoded_body:{text:'OTHER'}},{value:'NaN'}])assert.equal(matchesNativeReceipt({...receipt(),in_msg:{...receipt().in_msg,...changes}},expected),false);
});
test('normalization preserves outgoing evidence and canonicalizes v2/v3 hashes',()=>{
 const out={destination:b.toString(),value:'1000000000'};
 const tx=normalizeChainTransaction({...receipt(),hash:Buffer.alloc(32,171).toString('base64'),out_msgs:[out]},'v3');
 assert.equal(tx.hash,'ab'.repeat(32));assert.deepEqual(tx.out_msgs,[out]);assert.equal(tx.description.aborted,false);
 const v2=normalizeChainTransaction({transaction_id:{hash:'ab'.repeat(32),lt:'45'},utime:12,out_msgs:[out]},'v2');assert.equal(v2.lt,'45');assert.equal(v2.now,12);
});
test('comments decode from real BoC bodies and v2 text, not malformed payloads',()=>{
 const body=beginCell().storeUint(0,32).storeStringTail(expected.comment).endCell().toBoc().toString('base64');
 assert.equal(nativeComment({message_content:{body}}),expected.comment);
 assert.equal(nativeComment({msg_data:{text:Buffer.from(expected.comment).toString('base64')}}),expected.comment);
 assert.equal(nativeComment({body:'broken'}),'');
});
