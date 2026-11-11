// Run only against the dedicated cyberduel_validation database, never real users.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {createHmac} = require('node:crypto');
const {setTimeout: delay} = require('node:timers/promises');
const token = 'isolated-validation-token';
const database = new URL(process.env.DATABASE_URL);
database.pathname = '/cyberduel_validation';
const id = String(800000000000 + Math.floor(Math.random()*1000000));
const base = 'http://127.0.0.1:3100';
let child;
let logs = '';
function identity(userId=id) {
  const p = new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),signature:'validation-signature',user:JSON.stringify({id:Number(userId),username:'validation'})});
  const secret = createHmac('sha256','WebAppData').update(token).digest();
  p.set('hash',createHmac('sha256',secret).update([...p.keys()].sort().map(k=>`${k}=${p.get(k)}`).join('\n')).digest('hex'));
  return p.toString();
}
async function call(path, body, signed=true, userId=id) {
  const headers = {'Content-Type':'application/json'};
  if(signed) headers['x-telegram-init-data']=identity(userId);
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json().catch(()=>null)};
}
async function start(owner='') {
  child=spawn(process.execPath,['build/server.cjs'],{env:{...process.env,DATABASE_URL:database.href,PORT:'3100',DATABASE_PROVIDER:'postgres',APP_WRITES_ENABLED:'true',FINANCIAL_ACTIONS_ENABLED:'false',TELEGRAM_BOT_ENABLED:'false',TELEGRAM_BOT_TOKEN:token,ADMIN_TELEGRAM_IDS:owner,EMERGENCY_PAUSE_TON_GAMES:'true'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  for(let i=0;i<100;i++) {try {if((await fetch(base+'/health/ready')).ok)return;} catch {} await delay(100);}
  throw new Error('Validation server did not become ready: '+logs);
}
async function stop() {if(child && child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}child=undefined;}
(async()=>{
  try {
    await start();
    assert.equal((await call('/api/user/sync',{telegramId:id},false)).status,401);
    assert.equal((await call('/api/user/sync',{telegramId:'123'})).status,403);
    assert.equal((await call('/api/admin/metrics')).status,403);
    assert.equal((await call('/api/ton/deposit/intent',{})).status,503);
    const created=await call('/api/user/sync',{telegramId:id,username:'validation',lang:'en'});
    assert.equal(created.status,200,JSON.stringify(created));
    assert.equal(created.data.isAdmin,false);
    assert.ok(created.data.profile.vViral>0);
    const again=await call('/api/user/sync',{telegramId:id});
    assert.equal(again.data.profile.vViral,created.data.profile.vViral);
    const joined=await call('/api/matchmaking/join',{mode:'free',stake:0,playWithBot:true});
    assert.equal(joined.status,200,JSON.stringify(joined));
    const gameId=joined.data.game.id;
    const moved=await call('/api/game/move',{gameId,userId:id,move:'rock'});
    assert.equal(moved.status,200,JSON.stringify(moved));
    assert.equal(moved.data.game.status,'completed');
    assert.equal((await call('/api/game/move',{gameId,userId:id,move:'paper'})).status,400);
    const profile=await call('/api/user/'+id);
    assert.equal(profile.data.profile.gamesPlayed,1);
    const other=String(Number(id)+1);
    assert.equal((await call('/api/user/sync',{telegramId:other},true,other)).status,200);
    const queued=await call('/api/matchmaking/join',{mode:'free',stake:0,playWithBot:false});
    assert.equal(queued.data.status,'waiting');
    const paired=await call('/api/matchmaking/join',{mode:'free',stake:0,playWithBot:false},true,other);
    assert.equal(paired.data.status,'matched',JSON.stringify(paired));
    const pvpId=paired.data.game.id;
    const status=await call('/api/matchmaking/status');
    assert.equal(status.data.status,'matched');
    await delay(3100);
    assert.equal((await call('/api/game/move',{gameId:pvpId,userId:id,move:'rock'})).status,200);
    const masked=await call('/api/game/'+pvpId,undefined,true,other);
    assert.ok(!masked.data.game.player1Move,'Opponent move must remain hidden');
    const finished=await call('/api/game/move',{gameId:pvpId,userId:other,move:'scissors'},true,other);
    assert.equal(finished.status,200,JSON.stringify(finished));
    assert.equal(finished.data.game.status,'completed');
    assert.equal(finished.data.game.winnerId,id);
    const beforeRestart=await call('/api/user/'+id);
    assert.equal(beforeRestart.data.profile.gamesPlayed,2);
    await stop();await start(id);
    const persisted=await call('/api/user/'+id);
    assert.equal(persisted.data.profile.gamesPlayed,2);
    assert.equal(persisted.data.profile.vViral,beforeRestart.data.profile.vViral);
    assert.equal((await call('/api/user/sync',{telegramId:id})).data.isAdmin,true);
    assert.equal((await call('/api/admin/metrics')).status,200);
    assert.equal((await call('/api/admin/metrics',undefined,true,other)).status,403);
    console.log('GAME_VALIDATION_PASSED: registration, single welcome bonus, free bot/PvP matches, hidden opponent moves, duplicate move rejection, restart persistence, auth/admin/TON gates');
  } finally {await stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
