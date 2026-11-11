// Isolated staging only. The production database and real Telegram token are never used.
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createHmac,randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const database=new URL(process.env.DATABASE_URL);database.pathname='/cyberduel_admin_validation';
const pool=new Pool({connectionString:database.href});
const owner='890000000001',ordinary='890000000002',token='admin-validation-token';
const base='http://127.0.0.1:3110',prefix='stage1_'+randomUUID().replaceAll('-','');
let child,logs='';const created=[];const userBase=890100000000+Math.floor(Math.random()*10000000);
function identity(id=owner){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id),username:'stage1'})});const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update([...p.keys()].sort().map(k=>`${k}=${p.get(k)}`).join('\n')).digest('hex'));return p.toString();}
async function call(path,body,id=owner){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(id?{'x-telegram-init-data':identity(id)}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json().catch(()=>null)};}
async function start(){child=spawn(process.execPath,['build/server.cjs'],{env:{...process.env,DATABASE_URL:database.href,DATABASE_PROVIDER:'postgres',NODE_ENV:'production',PORT:'3110',APP_WRITES_ENABLED:'true',FINANCIAL_ACTIONS_ENABLED:'false',TELEGRAM_BOT_ENABLED:'false',TELEGRAM_BOT_TOKEN:token,ADMIN_TELEGRAM_IDS:owner,APP_URL:'https://play.cyberduel.app',EMERGENCY_PAUSE_TON_GAMES:'true',EMERGENCY_PAUSE_TON_DEPOSITS:'true',EMERGENCY_PAUSE_TON_WITHDRAWALS:'true',TON_DEPOSIT_MONITOR_ENABLED:'false',TON_WITHDRAWAL_WORKER_ENABLED:'false'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/health/ready')).ok)return;}catch{}await delay(100);}throw new Error(logs);}
async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}child=undefined;}
async function put(collection,id,data){const path=collection+'/'+id;created.push(path);await pool.query('INSERT INTO arena_documents(path,collection_path,data) VALUES($1,$2,$3::jsonb)',[path,collection,JSON.stringify(data)]);}
(async()=>{try{
 await start();
 const baseline=(await call('/api/admin/metrics')).data.stats;
 const now=new Date().toISOString();
 for(let i=0;i<137;i++)await put('users',String(userBase+i),{telegramId:String(userBase+i),username:prefix+'_'+i,vViral:500,gamesPlayed:0,wins:0,losses:0,createdAt:now});
 const user=String(userBase);
 await put('users',String(userBase+200),{telegramId:String(userBase+200),username:{invalid:true},vViral:{invalid:true},walletAddress:{invalid:true},createdAt:now});
 await put('games',prefix+'_placeholder',{player1Id:user,player2Id:'waiting',status:'searching',createdAt:now});
 await put('games',prefix+'_match',{player1Id:user,player2Id:ordinary,player1Move:'rock',player2Move:'',status:'resolving',mode:'free',createdAt:now});
 await put('transactions',prefix+'_points',{userId:user,type:'credit',amount:20,prevBalance:480,newBalance:500,source:'validation',status:'completed',timestamp:now});
 await put('ledgerTransactions',prefix+'_ledger',{telegramUserId:user,amountNano:'9007199254740993123',type:'validation',status:'posted',transactionHash:'test-hash',transactionLt:'123456789',createdAt:now});
 await put('tonDeposits',prefix+'_deposit',{telegramUserId:user,expectedAmountNano:'1000000000',status:'created',createdAt:now});
 await put('tonWithdrawals',prefix+'_withdrawal',{telegramUserId:user,amountNano:'1000000000',status:'requested',createdAt:now});
 await put('matchmakingQueue',prefix+'_ton',{telegramUserId:user,gameMode:'ton',status:'waiting',expiresAt:'2020-01-01T00:00:00.000Z',createdAt:now});
 const balanceBefore=(await pool.query("SELECT data FROM arena_documents WHERE collection_path IN ('users','transactions','ledgerTransactions','tonDeposits','tonWithdrawals','games') ORDER BY path")).rows;
 for(const route of ['/api/admin/metrics','/api/admin/players','/api/admin/transactions','/api/admin/games','/api/admin/settings','/api/admin/audit']){
  assert.equal((await call(route,undefined,'')).status,401,route);
  assert.equal((await call(route,undefined,ordinary)).status,403,route);
 }
 const metrics=(await call('/api/admin/metrics')).data;
 assert.equal(metrics.stats.totalUsers,baseline.totalUsers+138);assert.equal(metrics.stats.totalGames,baseline.totalGames+1);assert.equal(metrics.runtime.financialActionsEnabled,false);
 const players=await call('/api/admin/players?q='+prefix+'&limit=25&page=6');assert.equal(players.data.total,137);assert.equal(players.data.items.length,12);
 assert.equal((await call('/api/admin/players?q='+encodeURIComponent("%' OR true --"))).data.total,0);
 assert.equal((await call('/api/admin/players?limit=101')).status,400);
 const detail=await call('/api/admin/players/'+user);assert.equal(detail.data.player.vViral,500);const malformed=await call('/api/admin/players/'+(userBase+200));assert.equal(malformed.data.player.username,'');assert.equal(malformed.data.player.vViral,'—');
 const notes=await Promise.all([call('/api/admin/players/'+user+'/note',{note:'first',expectedVersion:0}),call('/api/admin/players/'+user+'/note',{note:'second',expectedVersion:0})]);assert.deepEqual(notes.map(r=>r.status).sort(),[200,409]);
 const ledger=await call('/api/admin/transactions?currency=TON&kind=ledgerTransactions&userId='+user);assert.equal(ledger.data.items.find(x=>x.id===prefix+'_ledger').amount,'9007199254740993123');assert.equal(ledger.data.items.find(x=>x.id===prefix+'_ledger').transactionHash,'test-hash');
 const points=await call('/api/admin/transactions?currency=vVIRAL&userId='+user);assert.ok(points.data.items.some(x=>x.id===prefix+'_points'));assert.ok(points.data.items.every(x=>x.currency==='vVIRAL'));
 assert.equal((await call('/api/admin/transactions?from=invalid')).status,400);
 const masked=await call('/api/admin/games?userId='+user);assert.equal(masked.data.items.find(x=>x.id===prefix+'_match').player1Move,'secret');
 let settings=(await call('/api/admin/settings')).data.settings;
 assert.equal((await call('/api/admin/settings',{appName:'forged',expectedVersion:settings.version},ordinary)).status,403);
 assert.equal((await call('/api/settings',{appName:'forged',expectedVersion:settings.version},ordinary)).status,403);
 for(const patch of [{financialActionsEnabled:true},{welcomeBonus:999999},{webUrl:'https://evil.invalid/'}])assert.equal((await call('/api/admin/settings',{...patch,expectedVersion:settings.version})).status,400);
 const saved=await call('/api/admin/settings',{appName:'Stage 1 validation',expectedVersion:settings.version});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.settings.webUrl,settings.webUrl);assert.equal(saved.data.settings.botUsername,settings.botUsername);
 assert.equal((await call('/api/admin/settings',{appName:'stale',expectedVersion:settings.version})).status,409);
 const publicSettings=await call('/api/settings',undefined,'');assert.equal(publicSettings.data.appName,'Stage 1 validation');
 const cleanup=await call('/api/admin/matchmaking/cleanup',{});assert.equal(cleanup.status,200);await delay(100);
 assert.equal((await pool.query('SELECT data FROM arena_documents WHERE path=$1',['matchmakingQueue/'+prefix+'_ton'])).rows[0].data.status,'waiting');
 const audit=await call('/api/admin/audit');assert.ok(audit.data.items.some(x=>x.action==='settings.updated'&&x.actorId===owner));assert.equal(audit.data.items.filter(x=>x.action==='player.note.updated'&&x.target===user).length,1);assert.ok(audit.data.items.some(x=>x.action==='legacy/matchmaking/cleanup'&&x.status==='completed'));
 assert.deepEqual((await pool.query("SELECT data FROM arena_documents WHERE collection_path IN ('users','transactions','ledgerTransactions','tonDeposits','tonWithdrawals','games') ORDER BY path")).rows,balanceBefore);
 await stop();await start();assert.equal((await call('/api/admin/players/'+user)).data.note.version,1);assert.equal((await call('/api/admin/settings')).data.settings.appName,'Stage 1 validation');
 for(const route of ['/api/ton/deposit/intent','/api/ton/withdrawal/request','/api/ton/admin/adjustment'])assert.equal((await call(route,{})).status,503);
 console.log('ADMIN_VALIDATION_PASSED: >100-player totals, pagination/search, exact TON amounts, auth, hidden moves, atomic audit/notes/settings, conflict protection, cache invalidation, restart persistence, unchanged game/balance rows, TON disabled');
}finally{await stop();if(created.length){await pool.query('DELETE FROM arena_documents WHERE path=ANY($1::text[])',[created]);await pool.query("DELETE FROM arena_documents WHERE collection_path='adminPlayerNotes' AND path=$1",['adminPlayerNotes/'+userBase]);}await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
