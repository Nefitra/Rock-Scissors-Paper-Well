import React,{useEffect,useState} from 'react';

export default function TelegramAvatar({photoUrl,name,userId,verified,className='w-12 h-12'}:{photoUrl?:string;name:string;userId:string;verified:boolean;className?:string}) {
  const [failedDirect,setFailedDirect]=useState('');
  const [proxy,setProxy]=useState('');
  const [proxyFailed,setProxyFailed]=useState(false);
  const direct=verified&&typeof photoUrl==='string'&&photoUrl.startsWith('https://')?photoUrl:'';
  const useDirect=!!direct&&failedDirect!==direct;
  useEffect(()=>{
    setProxy('');setProxyFailed(false);
    if(!verified||useDirect)return;
    const controller=new AbortController();let blobUrl='';let active=true;
    const initData=(window as any).Telegram?.WebApp?.initData;
    if(!initData)return;
    void fetch('/api/telegram/avatar',{headers:{'x-telegram-init-data':initData},signal:controller.signal})
      .then(async r=>{if(!r.ok||r.status===204)return;const blob=await r.blob();if(!active||!blob.type.startsWith('image/')||blob.size>2000000)return;blobUrl=URL.createObjectURL(blob);setProxy(blobUrl);})
      .catch(()=>{/* Initials remain available when Telegram withholds the photo. */});
    return()=>{active=false;controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);};
  },[userId,verified,useDirect]);
  const src=useDirect?direct:proxyFailed?'':proxy;
  const initials=name.trim().split(/\s+/).slice(0,2).map(p=>Array.from(p)[0]||'').join('').toUpperCase()||'?';
  return <span className={`${className} shrink-0 overflow-hidden rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 inline-flex items-center justify-center font-semibold text-white`}>
    {src?<img src={src} alt={`Фото Telegram: ${name}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={()=>useDirect?setFailedDirect(direct):setProxyFailed(true)}/>:<span role="img" aria-label={`Профиль Telegram: ${name}`}>{initials}</span>}
  </span>;
}
