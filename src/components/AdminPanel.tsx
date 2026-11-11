import React, {useEffect,useState} from 'react';

type Row=Record<string,any>;
type Page={items:Row[];total:number;page:number;limit:number};
type Tab='overview'|'players'|'transactions'|'games'|'settings'|'audit';
const tabs:[Tab,string][]=[['overview','Обзор'],['players','Игроки'],['transactions','Транзакции'],['games','Матчи'],['settings','Настройки'],['audit','Журнал']];
const input='w-full rounded-xl border border-[#344253] bg-[#101923] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500';
const button='rounded-xl border border-[#344253] bg-[#233143] px-3 py-2 text-sm text-white hover:bg-[#2c4159] disabled:opacity-40 disabled:cursor-not-allowed';
const card='rounded-2xl border border-[#2b3948] bg-[#17232f] p-4';
const emptyPage:Page={items:[],total:0,page:1,limit:25};
function date(value:any){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU');}
function amount(row:Row) {
  if(row.currency!=='TON')return `${row.amount} vVIRAL`;
  try {const n=BigInt(row.amount),absolute=n<0n?-n:n;return `${n<0n?'-':''}${absolute/1000000000n}.${String(absolute%1000000000n).padStart(9,'0').replace(/0+$/,'')||'0'} TON`;}catch{return 'Некорректная сумма';}
}
async function api(path:string,body?:unknown,signal?:AbortSignal) {
  const initData=(window as any).Telegram?.WebApp?.initData;
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(initData?{'x-telegram-init-data':initData}:{})},body:body===undefined?undefined:JSON.stringify(body),signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||`Ошибка запроса (${response.status})`);
  return data;
}
function Pager({data,page,setPage,loading}:{data:Page;page:number;setPage:(n:number)=>void;loading:boolean}) {
  return <nav aria-label="Страницы результатов" className="flex items-center justify-between gap-2 pt-2 text-xs text-slate-400">
    <button className={button} disabled={loading||page===1} onClick={()=>setPage(page-1)}>Назад</button>
    <span>Стр. {page} из {Math.max(1,Math.ceil(data.total/data.limit))} · {data.total} записей</span>
    <button className={button} disabled={loading||page*data.limit>=data.total} onClick={()=>setPage(page+1)}>Далее</button>
  </nav>;
}
export default function AdminPanel({children,onSettingsSaved}:{children?:React.ReactNode;onSettingsSaved?:(s:Row)=>void}) {
  const [tab,setTab]=useState<Tab>('overview');
  const [metrics,setMetrics]=useState<Row|null>(null),[data,setData]=useState<Page>(emptyPage);
  const [page,setPage]=useState(1),[query,setQuery]=useState(''),[draftQuery,setDraftQuery]=useState('');
  const [currency,setCurrency]=useState(''),[kind,setKind]=useState(''),[status,setStatus]=useState('');
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const [settings,setSettings]=useState<Row|null>(null),[config,setConfig]=useState<Row|null>(null);
  const [player,setPlayer]=useState<Row|null>(null),[note,setNote]=useState(''),[noteVersion,setNoteVersion]=useState(0);
  const [saving,setSaving]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setLoading(true);setError('');
    (async()=>{
      const params=new URLSearchParams({page:String(page),limit:'25'});
      if(query)params.set(tab==='players'?'q':tab==='audit'?'actorId':'userId',query);
      if(status)params.set('status',status);
      if(tab==='transactions'){
        if(currency)params.set('currency',currency);if(kind)params.set('kind',kind);
        if(from)params.set('from',new Date(from+'T00:00:00Z').toISOString());
        if(to)params.set('to',new Date(to+'T23:59:59.999Z').toISOString());
      }
      const result=await api('/api/admin/'+(tab==='overview'?'metrics':tab)+(tab==='overview'||tab==='settings'?'':'?'+params),undefined,controller.signal);
      if(!active)return;
      if(tab==='overview')setMetrics(result);
      else if(tab==='settings'){setSettings(result.settings);setConfig(result);}
      else setData(result);
    })().catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[tab,page,query,currency,kind,status,from,to,refresh]);
  const selectTab=(next:Tab)=>{setTab(next);setPage(1);setQuery('');setDraftQuery('');setStatus('');setCurrency('');setKind('');setFrom('');setTo('');setPlayer(null);setMessage('');};
  const openPlayer=async(id:string)=>{
    setError('');setSaving(true);
    try{const result=await api('/api/admin/players/'+encodeURIComponent(id));setPlayer(result.player);setNote(result.note.note);setNoteVersion(result.note.version);setMessage('');}
    catch(e:any){setError(e.message);}finally{setSaving(false);}
  };
  const saveNote=async()=>{
    if(!player)return;setSaving(true);setError('');setMessage('');
    try{const result=await api('/api/admin/players/'+encodeURIComponent(player.telegramId)+'/note',{note,expectedVersion:noteVersion});setNoteVersion(result.note.version);setMessage('Заметка сохранена. Действие записано в журнал.');}
    catch(e:any){setError(e.message);}finally{setSaving(false);}
  };
  const saveSettings=async(e:React.FormEvent)=>{
    e.preventDefault();if(!settings)return;setSaving(true);setError('');setMessage('');
    try{const result=await api('/api/admin/settings',{appName:settings.appName,botUsername:settings.botUsername,webUrl:settings.webUrl,expectedVersion:settings.version});setSettings(result.settings);onSettingsSaved?.(result.settings);setMessage('Настройки сохранены. Предыдущие значения доступны в журнале.');}
    catch(e:any){setError(e.message);}finally{setSaving(false);}
  };
  return <section className="space-y-4 pb-4" aria-label="Администрирование CyberDuel Lite">
    <header className="flex items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-white">Управление игрой</h2><p className="mt-1 text-xs text-slate-400">CyberDuel Lite · доступ владельца</p></div>
      <button className={button} disabled={loading||saving} onClick={()=>{if(player)void openPlayer(player.telegramId);setRefresh(n=>n+1);}} aria-label="Обновить данные">Обновить</button>
    </header>
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-200">Реальные TON-операции выключены. Балансы и расчёт матчей здесь доступны только для просмотра.</div>
    <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Разделы админки">{tabs.map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>selectTab(key)} disabled={saving} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${tab===key?'bg-sky-600 text-white':'bg-[#1c2b3a] text-slate-300 hover:bg-[#294157]'}`}>{label}</button>)}</nav>
    {error?<div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error} <button className="ml-2 underline" onClick={()=>{if(player)void openPlayer(player.telegramId);setRefresh(n=>n+1);}}>Повторить / загрузить актуальные данные</button></div>:null}
    {message?<p role="status" className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p>:null}
    {loading?<p role="status" className="py-5 text-center text-sm text-slate-400">Загрузка данных…</p>:null}
    {!loading&&!error&&tab==='overview'&&metrics?<>
      <p className="text-xs text-slate-400">Все записи PostgreSQL · обновлено {date(metrics.generatedAt)}</p>
      <div className="grid grid-cols-2 gap-2">{[
        ['Игроки',metrics.stats.totalUsers],['Новые за 24 ч',metrics.stats.newUsers24h],['Игроки с кошельком',metrics.stats.totalWallets],['Приглашённые игроки',metrics.stats.totalReferrals],['Матчи',metrics.stats.totalGames],['Завершённые',metrics.stats.completedGames],['Активные матчи',metrics.stats.activeGames],['Ожидают соперника',metrics.stats.usersWaiting],['Записи vVIRAL',metrics.stats.pointTransactions],['Всего vVIRAL',metrics.stats.totalPoints]
      ].map(([label,value])=><div key={String(label)} className={card}><p className="text-xs text-slate-400">{label}</p><p className="mt-2 break-all text-xl font-semibold text-white">{String(value)}</p></div>)}</div>
      <div className={card}><h3 className="font-semibold text-white">TON: просмотр учёта</h3><p className="mt-2 text-sm text-slate-300">Журнал: {metrics.stats.tonLedgerTransactions} · депозиты: {metrics.stats.tonDeposits} · выводы: {metrics.stats.tonWithdrawals}</p><p className="mt-2 text-xs text-slate-400">Депозиты и выводы показаны отдельно от проводок, без повторного суммирования.</p></div>
    </>:null}
    {['players','transactions','games','audit'].includes(tab)?<>
      <form className="flex gap-2" onSubmit={e=>{e.preventDefault();setQuery(draftQuery.trim());setPage(1);setPlayer(null);}}>
        <label className="min-w-0 flex-1"><span className="mb-1 block text-xs text-slate-400">{tab==='players'?'Поиск по имени или Telegram ID':tab==='audit'?'Telegram ID администратора':'Telegram ID игрока'}</span><input className={input} value={draftQuery} onChange={e=>setDraftQuery(e.target.value)} maxLength={100} placeholder={tab==='players'?'Имя или ID':'Все игроки'} /></label>
        <button className={button+' self-end'} disabled={loading||saving}>Найти</button>
      </form>
      {tab==='transactions'?<div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">Валюта<select className={input+' mt-1'} value={currency} onChange={e=>{setCurrency(e.target.value);setPage(1);}}><option value="">Все</option><option value="vVIRAL">vVIRAL</option><option value="TON">TON</option></select></label>
        <label className="text-xs text-slate-400">Раздел<select className={input+' mt-1'} value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}><option value="">Все</option><option value="transactions">Начисления vVIRAL</option><option value="ledgerTransactions">Проводки TON</option><option value="tonDeposits">Депозиты TON</option><option value="tonWithdrawals">Выводы TON</option></select></label>
        <label className="text-xs text-slate-400">С даты (UTC)<input type="date" className={input+' mt-1'} value={from} onChange={e=>{setFrom(e.target.value);setPage(1);}} /></label>
        <label className="text-xs text-slate-400">По дату (UTC)<input type="date" className={input+' mt-1'} value={to} onChange={e=>{setTo(e.target.value);setPage(1);}} /></label>
      </div>:null}
      {tab==='games'||tab==='transactions'?<label className="block text-xs text-slate-400">Статус<select className={input+' mt-1'} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Все статусы</option>{(tab==='games'?['searching','waiting','matched','resolving','completed','expired','canceled']:['completed','posted','created','submitted','requested','credited','confirmed','sent','failed','rejected']).map(s=><option key={s}>{s}</option>)}</select></label>:null}
      {player&&tab==='players'?<article className={card+' space-y-3'}>
        <div className="flex justify-between gap-2"><h3 className="font-semibold text-white">{player.username||'Игрок'} · {player.telegramId}</h3><button className={button} onClick={()=>setPlayer(null)}>Закрыть</button></div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-300"><div><dt className="text-xs text-slate-400">vVIRAL</dt><dd>{player.vViral}</dd></div><div><dt className="text-xs text-slate-400">Матчи / победы / поражения</dt><dd>{player.gamesPlayed} / {player.wins} / {player.losses}</dd></div></dl>
        <p className="break-all text-xs text-slate-400">Кошелёк: {player.walletAddress||'не подключён'}</p>
        <p className="text-xs text-slate-400">Регистрация: {date(player.createdAt)} · Пригласил: {player.referredBy||'—'}</p>
        <div className="rounded-xl bg-[#101923] p-3 text-xs text-slate-300">TON учёт (nanoton): доступно {String(player.tonAccount?.availableNano??'0')}, зарезервировано {String(player.tonAccount?.reservedNano??'0')}, к выводу {String(player.tonAccount?.pendingWithdrawalNano??'0')}</div>
        <label className="block text-xs text-slate-400">Внутренняя заметка администратора<textarea className={input+' mt-1'} rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} disabled={saving}/></label>
        <button className={button} disabled={saving} onClick={saveNote}>{saving?'Сохранение…':'Сохранить заметку'}</button>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>{selectTab('transactions');setQuery(player.telegramId);setDraftQuery(player.telegramId);}}>Транзакции игрока</button><button className={button} onClick={()=>{selectTab('games');setQuery(player.telegramId);setDraftQuery(player.telegramId);}}>Матчи игрока</button></div>
      </article>:null}
      {!loading&&!error?<div className="space-y-2">{data.items.length===0?<p className={card+' text-center text-sm text-slate-400'}>Записей по этим условиям нет.</p>:data.items.map(row=><article key={row.kind?row.kind+':'+row.id:row.id} className={card+' space-y-2 text-sm'}>
        {tab==='players'?<><div className="flex justify-between gap-3"><div><p className="break-all font-semibold text-white">{row.username||'Без имени'}</p><p className="font-mono text-xs text-slate-400">{row.telegramId}</p></div><button className={button} disabled={saving} onClick={()=>openPlayer(row.telegramId)}>Карточка</button></div><p className="text-slate-300">{row.vViral} vVIRAL · {row.gamesPlayed} матчей · {row.wins} побед</p><p className="text-xs text-slate-400">{date(row.createdAt)}</p></>:null}
        {tab==='transactions'?<><div className="flex justify-between gap-2"><strong className="break-all text-white">{amount(row)}</strong><span className="text-xs text-sky-300">{row.status}</span></div><p className="text-xs text-slate-300">{row.type} · {row.kind}</p><p className="font-mono text-xs text-slate-400">Игрок: {row.userId||'системная запись'}</p><p className="break-all font-mono text-xs text-slate-400">ID: {row.id}</p>{row.prevBalance!==null?<p className="text-xs text-slate-400">Баланс: {row.prevBalance} → {row.newBalance}</p>:null}<p className="break-all text-xs text-slate-400">Связь: {row.referenceId||'—'} · {date(row.createdAt)}</p>{row.transactionHash?<p className="break-all font-mono text-xs text-slate-400">Hash: {row.transactionHash}{row.transactionLt?' · LT: '+row.transactionLt:''}</p>:null}</>:null}
        {tab==='games'?<><p className="font-semibold text-white">{row.player1Username||row.player1Id} vs {row.player2Username||row.player2Id}</p><p className="text-sky-300">{row.status} · {row.mode} · {row.stake} {row.mode==='ton'?'TON':'vVIRAL'}</p><p className="text-xs text-slate-300">Ходы: {row.player1Move||'—'} / {row.player2Move||'—'}</p><p className="break-all text-xs text-slate-400">Победитель: {row.winnerId||'—'} · {date(row.createdAt)}</p><p className="break-all font-mono text-xs text-slate-400">{row.id}</p></>:null}
        {tab==='audit'?<><p className="font-semibold text-white">{row.action}</p><p className="text-xs text-slate-300">Администратор {row.actorId} · {row.status}</p><p className="break-all text-xs text-slate-400">Объект: {row.target||'—'} · {date(row.createdAt)}</p><details className="text-xs text-slate-400"><summary className="cursor-pointer">Изменения</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[#101923] p-2">{JSON.stringify({before:row.before,after:row.after,operationId:row.operationId,httpStatus:row.httpStatus},null,2)}</pre></details></>:null}
      </article>)}<Pager data={data} page={page} setPage={setPage} loading={loading}/></div>:null}
    </>:null}
    {tab==='settings'&&!loading&&settings&&config?<>
      <form className={card+' space-y-3'} onSubmit={saveSettings}>
        <h3 className="font-semibold text-white">Настройки приложения</h3>
        <fieldset className="space-y-3" disabled={saving}>
          <label className="block text-xs text-slate-400">Название приложения<input className={input+' mt-1'} required maxLength={60} value={settings.appName} onChange={e=>setSettings({...settings,appName:e.target.value})}/></label>
          <label className="block text-xs text-slate-400">Подключённый бот<input className={input+' mt-1 opacity-70'} readOnly value={settings.botUsername}/></label>
          <label className="block text-xs text-slate-400">HTTPS-адрес приложения<input className={input+' mt-1'} type="url" required value={settings.webUrl} onChange={e=>setSettings({...settings,webUrl:e.target.value})}/></label>
          <p className="text-xs text-slate-400">Адрес сохраняется в пределах текущего домена. Одновременные изменения защищены версией настроек.</p>
          <button className={button} type="submit">{saving?'Сохранение…':'Сохранить настройки'}</button>
        </fieldset>
      </form>
      <div className={card+' space-y-3'}><h3 className="font-semibold text-white">Текущая экономика и правила</h3><p className="text-xs text-slate-400">Просмотр работающих параметров. Изменение экономики и включение TON в этапе 1 недоступны.</p><dl className="grid grid-cols-2 gap-3 text-sm text-slate-300">{[['Приветственный бонус',config.economy.welcomeBonus],['Награда за победу',config.economy.freeMatchWinReward],['Ничья',config.economy.freeMatchDrawReward],['Участие',config.economy.freeMatchParticipationReward],['Комиссия, %',config.economy.platformFeePercent],['Ставки vVIRAL',config.economy.stakePresets.join(', ')]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd>{value}</dd></div>)}</dl><p className="text-xs text-slate-400">Бумага побеждает камень и колодец; колодец — камень и ножницы; камень — ножницы; ножницы — бумагу.</p><p className="text-xs text-amber-200">TON: {config.ton.network}. Депозиты, выводы и TON-матчи приостановлены.</p></div>
    </>:null}
    {children?<details className={card}><summary className="cursor-pointer text-sm text-slate-300">Инструменты сообщества</summary><div className="mt-4">{children}</div></details>:null}
  </section>;
}
