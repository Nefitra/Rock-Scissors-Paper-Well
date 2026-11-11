import express from 'express';
import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {StoreUnavailable} from './firestore-safety';

class InputError extends Error { constructor(message: string, public status=400) {super(message);} }
type Options = {
  db: any; pool?: Pool; circuit: any; adminIds: string[];
  identity: (req: express.Request)=>{userId:string;isVerified:boolean};
  appUrl: string; economy: Record<string,any>; ton: Record<string,any>;
  financialActionsEnabled: boolean; invalidateSettings: ()=>void;
};
export function pageInput(query: any) {
  const page=Number(query.page ?? 1),limit=Number(query.limit ?? 25);
  if(!Number.isInteger(page)||page<1||page>40000||!Number.isInteger(limit)||limit<1||limit>100) throw new InputError('Invalid pagination');
  return {page,limit,offset:(page-1)*limit};
}
function text(value: any, maximum=100) {
  if(value===undefined) return '';
  if(typeof value!=='string'||value.length>maximum) throw new InputError('Invalid filter');
  return value.trim();
}
function telegramId(value: any) {if(typeof value!=='string'||!/^\d{1,20}$/.test(value))throw new InputError('Invalid Telegram ID');return value;}
export function settingsPatch(body: any,current: any,appUrl: string) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new InputError('Invalid settings');
  if(Object.keys(body).some(k=>!['appName','botUsername','webUrl','expectedVersion','requestorId'].includes(k)))throw new InputError('Only application display settings can be changed in stage 1');
  const result={...current};
  if(body.appName!==undefined) {result.appName=text(body.appName,60);if(!result.appName)throw new InputError('Application name is required');}
  if(body.botUsername!==undefined) {
    const bot=text(body.botUsername,32).replace(/^@/,'');
    if(bot!=='CyberDuellitebot') throw new InputError('The connected bot must remain CyberDuellitebot');
    result.botUsername=bot;
  }
  if(body.webUrl!==undefined) {
    let url: URL; try {url=new URL(body.webUrl);} catch {throw new InputError('A valid HTTPS application URL is required');}
    if(url.protocol!=='https:'||url.origin!==new URL(appUrl).origin||url.pathname!==new URL(appUrl).pathname||url.username||url.password||url.search||url.hash)throw new InputError('The application URL must stay on the current HTTPS origin');
    result.webUrl=url.href;
  }
  return result;
}
export function registerAdmin(app: express.Express,o: Options) {
  const router=express.Router();
  const query=(sql:string,args:any[]=[])=>o.circuit.execute(()=>o.pool!.query(sql,args));
  const defaults={botUsername:'CyberDuellitebot',appName:'CyberDuel Lite',webUrl:o.appUrl};
  const gate: express.RequestHandler=(req,res,next)=>{
    const user=o.identity(req);
    if(!user.isVerified)return void res.status(401).json({error:'Please reopen the game inside Telegram.'});
    if(!o.adminIds.includes(user.userId))return void res.status(403).json({error:'Administrators only.'});
    if(!o.pool||!o.circuit.ready)return void res.status(503).json({error:'Administration is temporarily unavailable.'});
    res.locals.adminActor=user.userId;next();
  };
  const handle=(fn:(req:express.Request,res:express.Response,next:express.NextFunction)=>Promise<any>):express.RequestHandler=> (req,res,next)=>{
    void fn(req,res,next).catch(error=>{
      if(error instanceof InputError)return res.status(error.status).json({error:error.message});
      if(!(error instanceof StoreUnavailable))console.error('ADMIN_REQUEST_FAILED',error?.code||error?.name);
      res.status(503).json({error:'Administration is temporarily unavailable. Please retry.'});
    });
  };
  const audit=(actor:string,action:string,target:string,before:any,after:any)=>({
    id:randomUUID(),actorId:actor,action,target,before,after,status:'completed',createdAt:new Date().toISOString()
  });
  const paged=async(req:express.Request,where:string,args:any[],order:string,project:(r:any)=>any)=>{
    const {page,limit,offset}=pageInput(req.query);
    // The count and rows share one SQL snapshot, including an empty page.
    const result=await query(`WITH filtered AS (SELECT path,collection_path,data FROM arena_documents WHERE ${where}), selected AS (SELECT * FROM filtered ORDER BY ${order} LIMIT $${args.length+1} OFFSET $${args.length+2}) SELECT (SELECT count(*)::text FROM filtered) AS total,coalesce((SELECT json_agg(selected) FROM selected),'[]'::json) AS items`,[...args,limit,offset]);
    const row=result.rows[0];return {items:row.items.map(project),total:Number(row.total),page,limit};
  };
  const idOf=(row:any)=>row.path.split('/').at(-1);
  const userRow=(row:any)=>{const d=row.data;return {id:idOf(row),telegramId:d.telegramId||idOf(row),username:d.username||'',walletAddress:d.walletAddress||'',createdAt:d.createdAt||null,gamesPlayed:d.gamesPlayed||0,wins:d.wins||0,losses:d.losses||0,vViral:d.vViral??0,xp:d.xp||0,referredBy:d.referredBy||'',referralsCountL1:d.referralsCountL1||0,referralsCountL2:d.referralsCountL2||0,tonAccount:d.tonAccount||null};};
  const gameRow=(row:any)=>{const d=row.data;return {id:idOf(row),player1Id:d.player1Id,player2Id:d.player2Id,player1Username:d.player1Username,player2Username:d.player2Username,status:d.status,mode:d.mode,stake:d.stake||0,winnerId:d.winnerId||'',createdAt:d.createdAt,updatedAt:d.updatedAt,player1Move:d.status==='completed'?d.player1Move:(d.player1Move?'secret':''),player2Move:d.status==='completed'?d.player2Move:(d.player2Move?'secret':'')};};
  const txRow=(row:any)=>{const d=row.data;return {id:idOf(row),kind:row.collection_path,currency:row.collection_path==='transactions'?'vVIRAL':'TON',userId:d.userId||d.telegramUserId||'',type:d.type||d.source||row.collection_path,status:d.status||'',amount:row.collection_path==='transactions'?String(d.amount??0):String(d.amountNano??d.expectedAmountNano??0),prevBalance:d.prevBalance===undefined?null:String(d.prevBalance),newBalance:d.newBalance===undefined?null:String(d.newBalance),referenceId:d.referenceId||d.idempotencyKey||d.transactionHash||'',createdAt:d.createdAt||d.timestamp||null};};
  router.use(gate);
  router.get('/metrics',handle(async(_req,res)=>{
    const r=await query(`SELECT
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='users') AS "totalUsers",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='users' AND coalesce(data->>'walletAddress','')<>'') AS "totalWallets",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='users' AND coalesce(data->>'referredBy','')<>'') AS "totalReferrals",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='users' AND data->>'createdAt'>=$1) AS "newUsers24h",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='games' AND coalesce(data->>'player2Id','') NOT IN ('','waiting')) AS "totalGames",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='games' AND data->>'status'='completed') AS "completedGames",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='games' AND data->>'status' IN ('matched','countdown','move_selection','resolving')) AS "activeGames",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='transactions') AS "pointTransactions",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='ledgerTransactions') AS "tonLedgerTransactions",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='tonDeposits') AS "tonDeposits",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='tonWithdrawals') AS "tonWithdrawals",
      (SELECT coalesce(sum(CASE WHEN data->>'vViral' ~ '^[0-9]+([.][0-9]+)?$' THEN (data->>'vViral')::numeric ELSE 0 END),0)::text FROM arena_documents WHERE collection_path='users') AS "totalPoints",
      (SELECT count(*)::int FROM arena_documents WHERE collection_path='matchmakingQueue' AND data->>'status'='waiting' AND data->>'expiresAt'>$2) AS "usersWaiting"`,[new Date(Date.now()-86400000).toISOString(),new Date().toISOString()]);
    res.json({authorized:true,stats:r.rows[0],generatedAt:new Date().toISOString(),runtime:{database:'PostgreSQL',financialActionsEnabled:o.financialActionsEnabled,tonPaused:{deposits:o.ton.pauseDeposits,games:o.ton.pauseGames,withdrawals:o.ton.pauseWithdrawals}}});
  }));
  router.get('/players',handle(async(req,res)=>{
    const search=text(req.query.q);const args:any[]=['users'];let where='collection_path=$1';
    if(search){args.push('%'+search.replace(/[\\%_]/g,'\\$&')+'%');where+=" AND (split_part(path,'/',2) ILIKE $2 OR coalesce(data->>'username','') ILIKE $2)";}
    res.json(await paged(req,where,args,"coalesce(data->>'createdAt','') DESC,path",userRow));
  }));
  router.get('/players/:id',handle(async(req,res)=>{
    const id=telegramId(req.params.id);const [profile,note]=await Promise.all([o.db.collection('users').doc(id).get(),o.db.collection('adminPlayerNotes').doc(id).get()]);
    if(!profile.exists)throw new InputError('Player not found',404);
    res.json({player:userRow({path:'users/'+id,data:profile.data()}),note:note.data()||{note:'',version:0}});
  }));
  router.post('/players/:id/note',handle(async(req,res)=>{
    const id=telegramId(req.params.id),note=text(req.body?.note,2000),version=req.body?.expectedVersion;
    if(!Number.isInteger(version)||version<0)throw new InputError('A current note version is required');
    const ref=o.db.collection('adminPlayerNotes').doc(id);
    const result=await o.db.runTransaction(async(tx:any)=>{
      if(!(await tx.get(o.db.collection('users').doc(id))).exists)throw new InputError('Player not found',404);
      const current=(await tx.get(ref)).data()||{note:'',version:0};
      if(current.version!==version)throw new InputError('Note changed. Reload before saving.',409);
      const next={note,version:version+1,updatedBy:res.locals.adminActor,updatedAt:new Date().toISOString()};
      const event=audit(res.locals.adminActor,'player.note.updated',id,{note:current.note}, {note});
      tx.set(ref,next);tx.create(o.db.collection('adminAudit').doc(event.id),event);return next;
    });res.json({success:true,note:result});
  }));
  router.get('/games',handle(async(req,res)=>{
    const args:any[]=['games'];let where='collection_path=$1';
    const user=text(req.query.userId),status=text(req.query.status,40);
    if(user){telegramId(user);args.push(user);where+=` AND (data->>'player1Id'=$${args.length} OR data->>'player2Id'=$${args.length})`;}
    if(status){args.push(status);where+=` AND data->>'status'=$${args.length}`;}
    res.json(await paged(req,where,args,"coalesce(data->>'createdAt','') DESC,path",gameRow));
  }));
  router.get('/transactions',handle(async(req,res)=>{
    const currency=text(req.query.currency,10),kind=text(req.query.kind,30),user=text(req.query.userId),status=text(req.query.status,40);
    if(currency&&!['vVIRAL','TON'].includes(currency))throw new InputError('Invalid currency');
    const kinds=['transactions','ledgerTransactions','tonDeposits','tonWithdrawals'];if(kind&&!kinds.includes(kind))throw new InputError('Invalid transaction kind');
    const args:any[]=[kind?[kind]:currency==='vVIRAL'?['transactions']:currency==='TON'?kinds.slice(1):kinds];let where='collection_path=ANY($1::text[])';
    if(currency){args.push('transactions');where+=currency==='vVIRAL'?` AND collection_path=$${args.length}`:` AND collection_path<>$${args.length}`;}
    if(user){telegramId(user);args.push(user);where+=` AND (data->>'userId'=$${args.length} OR data->>'telegramUserId'=$${args.length} OR data#>>'{metadata,player1Id}'=$${args.length} OR data#>>'{metadata,player2Id}'=$${args.length})`;}
    if(status){args.push(status);where+=` AND data->>'status'=$${args.length}`;}
    for(const key of ['from','to']){const value=text(req.query[key],30);if(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new InputError('Invalid date');args.push(date.toISOString());where+=` AND coalesce(data->>'createdAt',data->>'timestamp','') ${key==='from'?'>=':'<='} $${args.length}`;}}
    res.json(await paged(req,where,args,"coalesce(data->>'createdAt',data->>'timestamp','') DESC,path",txRow));
  }));
  router.get('/audit',handle(async(req,res)=>{
    const actor=text(req.query.actorId),action=text(req.query.action,80);const args:any[]=['adminAudit'];let where='collection_path=$1';
    if(actor){telegramId(actor);args.push(actor);where+=` AND data->>'actorId'=$${args.length}`;}
    if(action){args.push(action);where+=` AND data->>'action'=$${args.length}`;}
    res.json(await paged(req,where,args,"coalesce(data->>'createdAt','') DESC,path",r=>({...r.data,id:idOf(r)})));
  }));
  router.get('/settings',handle(async(_req,res)=>{
    const settings=(await o.db.collection('settings').doc('global_settings').get()).data()||{};
    res.json({settings:{...defaults,...settings,version:settings.version||0},economy:o.economy,ton:{network:o.ton.network,pauseDeposits:o.ton.pauseDeposits,pauseGames:o.ton.pauseGames,pauseWithdrawals:o.ton.pauseWithdrawals,financialActionsEnabled:o.financialActionsEnabled},rules:{rock:['scissors'],scissors:['paper'],paper:['rock','well'],well:['rock','scissors']}});
  }));
  const save=handle(async(req,res)=>{
    const version=req.body?.expectedVersion;
    if(!Number.isInteger(version)||version<0)throw new InputError('A current settings version is required');
    const ref=o.db.collection('settings').doc('global_settings');
    const settings=await o.db.runTransaction(async(tx:any)=>{
      const before={...defaults,...((await tx.get(ref)).data()||{})};
      if((before.version||0)!==version)throw new InputError('Settings changed. Reload before saving.',409);
      const next={...settingsPatch(req.body,before,o.appUrl),version:version+1};
      const event=audit(res.locals.adminActor,'settings.updated','global_settings',before,next);
      tx.set(ref,next);tx.create(o.db.collection('adminAudit').doc(event.id),event);return next;
    });o.invalidateSettings();res.json({success:true,settings});
  });
  router.post('/settings',save);
  // Keep legacy admin tools available. Record intent before side effects and a
  // separate completion event after the response; do not log message contents.
  router.use(handle(async(req,res,next)=>{
    if(req.method!=='POST')return next();
    const event=audit(res.locals.adminActor,'legacy'+req.path,text(req.body?.gameId||req.body?.challengeId,100),null,null);
    event.status='started';await o.db.collection('adminAudit').doc(event.id).create(event);
    res.once('finish',()=>{const done={...event,id:randomUUID(),operationId:event.id,status:res.statusCode<400?'completed':'failed',httpStatus:res.statusCode,createdAt:new Date().toISOString()};void o.db.collection('adminAudit').doc(done.id).create(done).catch(()=>console.error('ADMIN_AUDIT_COMPLETION_FAILED',event.id));});
    next();
  }));
  app.use('/api/admin',router);
  app.post('/api/settings',gate,save);
}
