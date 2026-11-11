import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyTelegram} from './telegram-auth';
function sign(time: number) {
  const p = new URLSearchParams({auth_date:String(time),signature:'test-ed25519-signature',user:JSON.stringify({id:123,username:'test'})});
  const secret=createHmac('sha256','WebAppData').update('test-token').digest();
  p.set('hash',createHmac('sha256',secret).update([...p.keys()].sort().map(k=>`${k}=${p.get(k)}`).join('\n')).digest('hex'));return p.toString();
}
test('signed Telegram identity is verified; spoofed, expired and future identities are rejected',()=>{
 const now=1800000000000; const data=sign(now/1000);
 assert.equal(verifyTelegram(data,'test-token',now).user.id,123);
 assert.equal(verifyTelegram(data.replace('test','other'),'test-token',now).verified,false);
 assert.equal(verifyTelegram(data,'other-token',now).verified,false);
 assert.equal(verifyTelegram(sign(now/1000-90000),'test-token',now).verified,false);
 assert.equal(verifyTelegram(sign(now/1000+1000),'test-token',now).verified,false);
});
