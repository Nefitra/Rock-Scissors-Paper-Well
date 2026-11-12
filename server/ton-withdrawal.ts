import {createHash} from 'node:crypto';
import {canonicalNativeAddress,parseNativeAmount} from './ton-safety';

type Input={userId:string;amount:unknown;walletAddress:unknown;requestKey:unknown;network:string;min:number;max:number;dailyLimit:number};
/** Reservation, daily allowance and durable request are one commit, including retry deduplication. */
export async function reserveNativeWithdrawal(db:any,input:Input,moveBalance:(tx:any,amount:number,withdrawalId:string,address:string)=>Promise<void>){
  const amountNano=parseNativeAmount(input.amount,input.min,input.max);
  const address=canonicalNativeAddress(input.walletAddress,input.network);
  if(typeof input.requestKey!=='string'||!/^[a-zA-Z0-9_-]{20,100}$/.test(input.requestKey))throw new Error('A valid withdrawal request key is required.');
  const withdrawalId='WD_'+createHash('sha256').update(`${input.userId}:${input.requestKey}`).digest('hex');
  const ref=db.collection('tonWithdrawals').doc(withdrawalId);
  const day=new Date().toISOString().slice(0,10);
  return db.runTransaction(async(tx:any)=>{
    const existing=await tx.get(ref);
    if(existing.exists){
      const record=existing.data();
      if(record.telegramUserId!==input.userId||record.amountNano!==amountNano||record.network!==input.network||canonicalNativeAddress(record.walletAddress,input.network)!==address)throw new Error('Withdrawal request key conflicts with another request.');
      return {...record,idempotent:true};
    }
    const today=await tx.get(db.collection('tonWithdrawals').where('telegramUserId','==',input.userId).where('createdAt','>=',day));
    let used=0n;
    today.forEach((snapshot:any)=>{const record=snapshot.data();if(record.status!=='failed')used+=BigInt(record.amountNano);});
    if(used+BigInt(amountNano)>BigInt(input.dailyLimit))throw new Error('Daily withdrawal limit exceeded.');
    await moveBalance(tx,amountNano,withdrawalId,address);
    const now=new Date().toISOString();
    const request={withdrawalId,telegramUserId:input.userId,walletAddress:address,amountNano,network:input.network,status:'requested',suspicious:amountNano>50000000000,createdAt:now,updatedAt:now};
    tx.create(ref,request);
    return {...request,idempotent:false};
  });
}
