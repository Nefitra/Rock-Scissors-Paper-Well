import {Address,Cell,loadTransaction} from '@ton/ton';

/** All stored amounts remain integer nanograms (legacy fields are named *Nano). */
export function parseNativeAmount(value:unknown,min:number,max:number):number {
  if(typeof value!=='string'&&typeof value!=='number')throw new Error('Invalid TON amount.');
  const text=String(value).trim();
  if(!/^\d{1,7}(?:\.\d{1,9})?$/.test(text))throw new Error('Use a decimal amount with at most 9 fractional digits.');
  const [whole,fraction='']=text.split('.');
  const nano=BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));
  if(nano<BigInt(min)||nano>BigInt(max)||nano>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('TON amount is outside the allowed range.');
  return Number(nano);
}
export function canonicalNativeAddress(value:unknown,network?:string):string {
  if(typeof value!=='string'||!value.trim())throw new Error('Invalid TON address.');
  const text=value.trim();
  if(Address.isRaw(text))return Address.parseRaw(text).toRawString();
  const parsed=Address.parseFriendly(text);
  if(network==='mainnet'&&parsed.isTestOnly)throw new Error('Testnet address cannot be used on mainnet.');
  return parsed.address.toRawString();
}
export function normalizeHash(value:unknown):string {
  if(typeof value!=='string')return '';
  if(/^[a-fA-F0-9]{64}$/.test(value))return value.toLowerCase();
  if(!/^[\w+/=-]{43,44}$/.test(value))return '';
  const bytes=Buffer.from(value,'base64url');return bytes.length===32?bytes.toString('hex'):'';
}
export function nativeComment(message:any):string {
  const decoded=message?.decoded_body?.text??message?.message_content?.decoded?.comment??message?.message_content?.decoded?.text;
  if(typeof decoded==='string')return decoded;
  if(typeof message?.message==='string')return message.message;
  const encoded=message?.msg_data?.text;
  if(typeof encoded==='string')return Buffer.from(encoded,'base64').toString('utf8');
  try{
    const body=message?.message_content?.body??message?.msg_data?.body??message?.body;
    if(typeof body==='string'){
      const slice=Cell.fromBase64(body).beginParse();
      if(slice.loadUint(32)===0)return slice.loadStringTail();
    }
  }catch{/* Malformed bodies are not payment evidence. */}
  return '';
}
/** Keep outgoing messages and success evidence: old normalization silently discarded both. */
export function normalizeChainTransaction(tx:any,version:'v2'|'v3') {
  let description=tx.description;
  if(version==='v2'&&tx.data){try{const parsed=loadTransaction(Cell.fromBase64(tx.data).beginParse());description=parsed.description.type==='generic'?{aborted:parsed.description.aborted}:undefined;}catch{}}
  return {...tx,version,hash:normalizeHash(tx.hash??tx.transaction_id?.hash),lt:String(tx.lt??tx.transaction_id?.lt??''),now:tx.now??tx.utime,description,in_msg:tx.in_msg??null,out_msgs:Array.isArray(tx.out_msgs)?tx.out_msgs:[]};
}
export type NativeTransfer={source:string;destination:string;amountNano:number;comment:string;createdAt:string;expiresAt?:string;network:string};
/** Only a finalized, successful inbound payment to its intended recipient proves receipt. */
export function matchesNativeReceipt(tx:any,expected:NativeTransfer):boolean {
  try{
    if(!normalizeHash(tx.hash)||!/^\d+$/.test(String(tx.lt))||tx.description?.aborted!==false)return false;
    if(!Number.isSafeInteger(tx.mc_block_seqno)||tx.mc_block_seqno<=0)return false;
    const msg=tx.in_msg;if(!msg||msg.bounced===true)return false;
    if(canonicalNativeAddress(msg.source,expected.network)!==canonicalNativeAddress(expected.source,expected.network))return false;
    if(canonicalNativeAddress(msg.destination,expected.network)!==canonicalNativeAddress(expected.destination,expected.network))return false;
    if(!/^\d+$/.test(String(msg.value))||BigInt(msg.value)!==BigInt(expected.amountNano))return false;
    const time=Number(tx.now)*1000,start=Date.parse(expected.createdAt),end=expected.expiresAt?Date.parse(expected.expiresAt):Date.now()+60000;
    return Number.isFinite(time)&&Number.isFinite(start)&&Number.isFinite(end)&&time>=start-60000&&time<=end&&nativeComment(msg)===expected.comment;
  }catch{return false;}
}
/** Cache keys include both chain and account; never share history across wallets. */
export function transactionCacheKey(address:string,network:string){return `${network}:${canonicalNativeAddress(address,network)}`;}
