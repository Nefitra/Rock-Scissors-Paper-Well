// Isolated payment verification only. Fake provider responses never enter production code.
// No chain write is possible: no mnemonic, payouts/monitor/bot off, and fetch restricted to GET history.
const assert=require('node:assert/strict');
const {Pool}=require('pg');const {spawn}=require('node:child_process');const {once}=require('node:events');
const {createHmac,randomUUID,randomBytes}=require('node:crypto');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Address}=require('@ton/ton');const {setTimeout:delay}=require('node:timers/promises');
const database=new URL(process.env.DATABASE_URL);database.pathname='/cyberduel_admin_validation';
const pool=new Pool({connectionString:database.href});
const user=String(880000000000+Math.floor(Math.random()*1e9)),other=String(Number(user)+1),token='isolated-ton-validation';
const source=new Address(0,randomBytes(32)),treasury=new Address(0,randomBytes(32));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ton-validation-'));const fixture=path.join(temp,'fixtures.json'),preload=path.join(temp,'provider.cjs');
let child,logs='';const base='http://127.0.0.1:3120';
fs.writeFileSync(fixture,'[]',{mode:0o600});
fs.writeFileSync(preload,`const fs=require('node:fs');global.fetch=async(input,options={})=>{const url=new URL(String(input));if(url.hostname!=='testnet.toncenter.com'||(options.method&&options.method!=='GET'))throw new Error('Validation blocks all external requests except testnet GET fixtures');return new Response(JSON.stringify({transactions:JSON.parse(fs.readFileSync(process.env.TON_TEST_FIXTURE_FILE,'utf8'))}),{status:200,headers:{'Content-Type':'application/json'}});};`,{mode:0o600});
function identity(id=user){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id),username:'ton_validation',first_name:'Test'})});const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update([...p.keys()].sort().map(k=>`${k}=${p.get(k)}`).join('\n')).digest('hex'));return p.toString();}
async function call(route,body,id=user){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-telegram-init-data':identity(id)},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
async function start(enabled=true){
 child=spawn(process.execPath,['--require',preload,'build/server.cjs'],{env:{...process.env,NODE_ENV:'production',DATABASE_PROVIDER:'postgres',DATABASE_URL:database.href,PORT:'3120',APP_WRITES_ENABLED:'true',FINANCIAL_ACTIONS_ENABLED:String(enabled),TON_NETWORK:'testnet',TON_TREASURY_ADDRESS:treasury.toString({testOnly:true}),TON_HOT_WALLET_ADDRESS:'',TON_HOT_WALLET_MNEMONIC:'',TONCENTER_API_KEY:'',TON_DEPOSIT_MONITOR_ENABLED:'false',TON_WITHDRAWAL_WORKER_ENABLED:'false',TELEGRAM_BOT_ENABLED:'false',TELEGRAM_BOT_TOKEN:token,EMERGENCY_PAUSE_TON_DEPOSITS:'false',EMERGENCY_PAUSE_TON_WITHDRAWALS:'false',EMERGENCY_PAUSE_TON_GAMES:'true',TON_TEST_FIXTURE_FILE:fixture},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<150;i++){try{const cfg=await call('/api/ton/config');if(cfg.data.enabled===enabled&&(await fetch(base+'/health/ready')).ok)return;}catch{}await delay(100);}
 throw new Error('Isolated payment server did not become ready.');
}
async function stop(){if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await ended;}child=undefined;}
(async()=>{
 try{
  await start();await call('/api/user/sync',{telegramId:user});await call('/api/user/sync',{telegramId:other},other);
  for(const amount of ['1.0000000001','1garbage','0.9','1001',null])assert.equal((await call('/api/ton/deposit/intent',{amount,walletAddress:source.toString()})).status,400);
  assert.equal((await call('/api/ton/deposit/intent',{amount:'1',walletAddress:'UQ_invalid'})).status,400);
  const cases=['good','sender','receiver','amount','comment','bounced','aborted','unfinalized','bad_hash','duplicate_chain_payment','expired_session'];const intents={},transactions=[];
  for(const name of cases){const response=await call('/api/ton/deposit/intent',{amount:'1.000000003',walletAddress:source.toString()});assert.equal(response.status,200,JSON.stringify(response));intents[name]=response.data;}
  const goodHash=randomBytes(32).toString('hex');
  for(const [index,name]of cases.entries()){
   const tx={hash:name==='duplicate_chain_payment'?goodHash:name==='good'?goodHash:randomBytes(32).toString('hex'),lt:String(100+index),now:Math.floor(Date.now()/1000),mc_block_seqno:100,description:{aborted:false},in_msg:{source:source.toRawString(),destination:treasury.toRawString(),value:'1000000003',decoded_body:{text:intents[name].depositId},bounced:false}};
   if(name==='sender')tx.in_msg.source=treasury.toRawString();if(name==='receiver')tx.in_msg.destination=source.toRawString();if(name==='amount')tx.in_msg.value='1000000000';if(name==='comment')tx.in_msg.decoded_body.text='OTHER';if(name==='bounced')tx.in_msg.bounced=true;if(name==='aborted')tx.description.aborted=true;if(name==='unfinalized')delete tx.mc_block_seqno;if(name==='bad_hash')tx.hash='not-a-chain-hash';
   transactions.push(tx);
  }
  // A payment arrived before invoice expiry but was only indexed after the browser session expired.
  const oldNow=Math.floor(Date.now()/1000)-120;transactions.at(-1).now=oldNow;
  await pool.query("UPDATE arena_documents SET data=jsonb_set(jsonb_set(data,'{createdAt}',to_jsonb($2::text)),'{expiresAt}',to_jsonb($3::text)) WHERE path=$1",['tonDeposits/'+intents.expired_session.depositId,new Date((oldNow-30)*1000).toISOString(),new Date((oldNow+30)*1000).toISOString()]);
  fs.writeFileSync(fixture,JSON.stringify(transactions),{mode:0o600});
  const verify=(name,id=user)=>call('/api/ton/deposit/verify',{depositId:intents[name].depositId},id);
  assert.equal((await verify('good',other)).status,400);
  for(const name of cases.slice(1,9))assert.equal((await verify(name)).data.status,'pending',name);
  const repeated=await Promise.all(Array.from({length:20},()=>verify('good')));assert.ok(repeated.every(x=>x.status===200&&x.data.status==='credited'));
  assert.equal((await call('/api/user/'+user)).data.profile.tonAccount.availableNano,'1000000003');
  assert.notEqual((await verify('duplicate_chain_payment')).status,200,'One chain payment cannot credit two intents.');
  assert.equal((await verify('expired_session')).data.status,'credited');
  const balance=(await call('/api/user/'+user)).data.profile.tonAccount.availableNano;assert.equal(balance,'2000000006');
  assert.equal((await call('/api/ton/withdrawal/request',{amount:'1',walletAddress:source.toString(),requestKey:randomUUID()})).status,503,'No payout wallet means no withdrawal accepted.');
  assert.equal((await call('/api/ton/admin/adjustment',{})).status,503);
  const counts=await pool.query("SELECT collection_path,count(*)::int AS count FROM arena_documents WHERE data->>'telegramUserId'=$1 GROUP BY collection_path",[user]);
  assert.equal(counts.rows.find(x=>x.collection_path==='tonProcessedTransactions').count,2);
  assert.equal(counts.rows.find(x=>x.collection_path==='ledgerTransactions').count,2);
  await stop();await start(false);
  assert.equal((await call('/api/ton/deposit/intent',{})).status,503);
  assert.equal((await call('/api/user/'+user)).data.profile.tonAccount.availableNano,balance);
  console.log('TON VALIDATION PASSED: exact nanograms, strict receipts, replay/20-way duplicate protection, late indexing, durable ledger, missing payout wallet refusal, restart persistence and financial gates. Fixtures only; no blockchain transaction sent.');
 }catch(error){console.error(error.message);process.exitCode=1;}
 finally{await stop();await pool.query("DELETE FROM arena_documents WHERE data->>'telegramUserId'=ANY($1::text[]) OR data->>'userId'=ANY($1::text[]) OR path=ANY($2::text[])",[[user,other],['users/'+user,'users/'+other]]);await pool.end();fs.rmSync(temp,{recursive:true,force:true});}
})();
