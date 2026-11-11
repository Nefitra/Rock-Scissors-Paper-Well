import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyTelegram(initData: string, token: string, now = Date.now()): {verified: boolean; user?: any} {
  try {
    const params = new URLSearchParams(initData); const hash = params.get('hash') ?? '';
    const time = Number(params.get('auth_date'));
    if (!/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(time) || time < now / 1000 - 86400 || time > now / 1000 + 30) return {verified:false};
    const keys = [...params.keys()]; if (new Set(keys).size !== keys.length) return {verified:false};
    const check = keys.filter(k => k !== 'hash').sort().map(k => `${k}=${params.get(k)}`).join('\n');
    const secret = createHmac('sha256','WebAppData').update(token).digest();
    const expected = createHmac('sha256',secret).update(check).digest();
    if (!timingSafeEqual(expected,Buffer.from(hash,'hex'))) return {verified:false};
    const user = JSON.parse(params.get('user') ?? 'null');
    return user && Number.isSafeInteger(user.id) && user.id > 0 ? {verified:true,user} : {verified:false};
  } catch { return {verified:false}; }
}
