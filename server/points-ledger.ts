import {createHash} from 'node:crypto';

// The profile and its immutable receipt always commit together.
export async function adjustPoints(db: any, userId: string, amount: number, type: string, source: string, referenceId = '', idempotencyKey = '') {
  if (!Number.isFinite(amount)) throw new Error('Invalid point amount');
  const user = db.collection('users').doc(userId);
  const receipt = idempotencyKey
    ? db.collection('transactions').doc(createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex'))
    : db.collection('transactions').doc();
  return db.runTransaction(async (tx: any) => {
    const profile = await tx.get(user);
    if (!profile.exists) throw new Error('User not found');
    const before = Number(profile.data().vViral ?? 0);
    if (idempotencyKey && (await tx.get(receipt)).exists) return {success:true,newBalance:before};
    const after = before + amount;
    if (!Number.isFinite(after) || after < 0) throw new Error('Insufficient points');
    tx.create(receipt, {id:receipt.id,userId,type,amount,prevBalance:before,newBalance:after,source,referenceId,idempotencyKey,status:'completed',timestamp:new Date().toISOString()});
    tx.update(user, {vViral:after});
    return {success:true,newBalance:after};
  });
}
