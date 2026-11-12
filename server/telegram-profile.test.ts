import {test} from 'node:test';
import assert from 'node:assert/strict';
import {telegramProfile,safeTelegramPhoto,telegramAvatars} from './telegram-profile';
test('Telegram names and handles are separate and avatar URLs must be HTTPS',()=>{
  assert.deepEqual(telegramProfile({id:123,first_name:'Boris',last_name:'0',username:'real_user',photo_url:'https://t.me/i/userpic/320/test.jpg'}),{telegramUsername:'real_user',telegramDisplayName:'Boris 0',telegramPhotoUrl:'https://t.me/i/userpic/320/test.jpg'});
  assert.equal(telegramProfile({id:123,first_name:'Boris'}).telegramUsername,'');
  for(const value of ['javascript:alert(1)','data:image/svg+xml,a','http://t.me/a','https://secret@t.me/a',{},null])assert.equal(safeTelegramPhoto(value),'');
});
test('avatar fallback reads only the requested user, hides token URLs and deduplicates calls',async()=>{
  const calls:any[]=[];
  const loader=telegramAvatars((async(url:any,options:any)=>{calls.push([url,options]);if(url.endsWith('getUserProfilePhotos'))return Response.json({ok:true,result:{photos:[[{file_id:'photo-id',width:320}]]}});if(url.endsWith('getFile'))return Response.json({ok:true,result:{file_path:'photos/test.jpg'}});return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});}) as typeof fetch);
  const [a,b]=await Promise.all([loader.get('123','test-token'),loader.get('123','test-token')]);
  assert.equal(a,b);assert.equal(a?.type,'image/jpeg');assert.equal(calls.length,3);
  assert.deepEqual(JSON.parse(calls[0][1].body),{user_id:123,limit:1});
  assert.equal(JSON.stringify(a).includes('test-token'),false);
  await loader.get('123','test-token');assert.equal(calls.length,3);
});
test('private or absent photos return no image and unsafe file paths never get downloaded',async()=>{
  const absent=telegramAvatars((async()=>Response.json({ok:true,result:{photos:[]}})) as typeof fetch);
  assert.equal(await absent.get('123','test-token'),null);
  let calls=0;
  const unsafe=telegramAvatars((async()=>{calls++;return Response.json({ok:true,result:calls===1?{photos:[[{file_id:'x',width:320}]]}:{file_path:'../secret.jpg'}});}) as typeof fetch);
  await assert.rejects(unsafe.get('123','test-token'));assert.equal(calls,2);
});
