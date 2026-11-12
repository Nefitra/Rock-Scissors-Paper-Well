import test from 'node:test';
import assert from 'node:assert/strict';
import {Cell} from '@ton/ton';
import {depositTransaction,buildTextCommentBoc} from './ton-connect';
const wallet={account:{chain:'-239',address:'0:'+'01'.repeat(32)}};
const intent={address:'0:'+'02'.repeat(32),amountNano:'1000000003',comment:'VIRAL_ARENA_DEP_'+'A1'.repeat(16)};
test('TON Connect request binds the wallet, chain, exact amount and real decodable comment',()=>{
 const request=depositTransaction('mainnet',wallet,intent,1000000);
 assert.equal(request.network,'-239');assert.equal(request.from,wallet.account.address);assert.equal(request.validUntil,1300);
 assert.equal(request.messages[0].amount,'1000000003');assert.equal(request.messages[0].address,intent.address);
 const body=Cell.fromBase64(request.messages[0].payload).beginParse();assert.equal(body.loadUint(32),0);assert.equal(body.loadStringTail(),intent.comment);
 assert.throws(()=>depositTransaction('testnet',wallet,intent),/wrong/);
 assert.throws(()=>depositTransaction('other',wallet,intent),/wrong/);
 assert.throws(()=>depositTransaction('mainnet',wallet,{...intent,amountNano:'NaN'}),/Invalid/);
 assert.throws(()=>buildTextCommentBoc('😀'.repeat(100)),/exceeds/);
});
