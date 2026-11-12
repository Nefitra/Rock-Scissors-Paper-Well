// Call only with a user from successfully verified Telegram initData.
export function telegramProfile(user: any) {
  const clean=(v:unknown,n:number)=>typeof v==='string'?v.trim().slice(0,n):'';
  const username=clean(user.username,32);
  const displayName=[clean(user.first_name,64),clean(user.last_name,64)].filter(Boolean).join(' ')||username||String(user.id);
  return {telegramUsername:/^[a-zA-Z0-9_]{1,32}$/.test(username)?username:'',telegramDisplayName:displayName,telegramPhotoUrl:safeTelegramPhoto(user.photo_url)};
}
export function safeTelegramPhoto(value:unknown) {
  if(typeof value!=='string'||value.length>2048)return '';
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}

type Avatar={bytes:Buffer;type:string}|null;
export function telegramAvatars(fetcher:typeof fetch=fetch,clock=Date.now) {
  const cache=new Map<string,{until:number;value:Avatar}>();
  const pending=new Map<string,Promise<Avatar>>();
  const load=async(userId:string,token:string):Promise<Avatar>=>{
    const call=async(method:string,body:Record<string,unknown>)=>{
      const r=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
      if(!r.ok)throw new Error('Telegram photo unavailable');const data=await r.json();if(!data.ok)throw new Error('Telegram photo unavailable');return data.result;
    };
    const photos=await call('getUserProfilePhotos',{user_id:Number(userId),limit:1});
    const sizes=photos.photos?.[0];if(!Array.isArray(sizes)||!sizes.length)return null;
    const photo=sizes.find(p=>p.width>=160&&p.width<=640)||sizes[0];
    if(photo.file_size>2_000_000)throw new Error('Telegram photo too large');
    const file=await call('getFile',{file_id:photo.file_id});
    if(typeof file.file_path!=='string'||!/^photos\/[a-zA-Z0-9_/-]+\.(jpg|jpeg|png|webp)$/i.test(file.file_path)||file.file_size>2_000_000)throw new Error('Invalid Telegram photo');
    const r=await fetcher(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{signal:AbortSignal.timeout(8000),redirect:'error'});
    const type=(r.headers.get('content-type')||'').split(';')[0];
    if(!r.ok||!['image/jpeg','image/png','image/webp','application/octet-stream'].includes(type)||Number(r.headers.get('content-length')||0)>2_000_000)throw new Error('Invalid Telegram photo');
    const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>2_000_000)throw new Error('Invalid Telegram photo');
    const detected=bytes.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg'
      :bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png'
      :bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':'';
    if(!detected)throw new Error('Invalid Telegram photo');
    return {bytes,type:detected};
  };
  return {
    async get(userId:string,token:string) {
      const hit=cache.get(userId);if(hit&&hit.until>clock())return hit.value;
      if(pending.has(userId))return pending.get(userId)!;
      const job=load(userId,token).then(value=>{if(cache.size>=128)cache.delete(cache.keys().next().value!);cache.set(userId,{until:clock()+(value?600000:60000),value});return value;}).finally(()=>pending.delete(userId));
      pending.set(userId,job);return job;
    }
  };
}
