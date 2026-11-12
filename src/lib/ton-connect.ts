export function buildTextCommentBoc(comment: string): string {
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(comment);
    if(textBytes.length>123)throw new Error('Comment exceeds a single TON cell.');
    
    // Total bits of data: (4 bytes zero prefix + text length) * 8
    const dataLen = 4 + textBytes.length;
    
    const d1 = 0;
    const d2 = dataLen * 2;
    
    const cellData = new Uint8Array(2 + dataLen);
    cellData[0] = d1;
    cellData[1] = d2;
    cellData[2] = 0;
    cellData[3] = 0;
    cellData[4] = 0;
    cellData[5] = 0;
    cellData.set(textBytes, 6);
    
    const header = new Uint8Array([
      0xb5, 0xee, 0x9c, 0x72, // magic
      0x01,                   // flags (size_bytes=1)
      0x01,                   // off_bytes=1
      0x01,                   // cells=1
      0x01,                   // roots=1
      0x00,                   // absent=0
      cellData.length,        // tot_cells_size
      0x00                    // root_idx=0
    ]);
    
    const boc = new Uint8Array(header.length + cellData.length);
    boc.set(header, 0);
    boc.set(cellData, header.length);
    
    let binary = '';
    const len = boc.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(boc[i]);
    }
    return btoa(binary);
  }

export function depositTransaction(network:string,wallet:{account:{chain:string;address:string}},intent:{address:string;amountNano:string;comment:string},now=Date.now()) {
  const chain=network==='mainnet'?'-239':network==='testnet'?'-3':null;
  if(!chain||wallet.account.chain!==chain)throw new Error('Connected wallet is on the wrong TON network.');
  if(!intent.address||!/^\d+$/.test(intent.amountNano)||BigInt(intent.amountNano)<=0n||!intent.comment)throw new Error('Invalid deposit intent.');
  return {network:chain,from:wallet.account.address,validUntil:Math.floor(now/1000)+300,messages:[{address:intent.address,amount:intent.amountNano,payload:buildTextCommentBoc(intent.comment)}]};
}
