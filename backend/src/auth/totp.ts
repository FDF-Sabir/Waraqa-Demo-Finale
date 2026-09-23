import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer): string {
 let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;
}
export function unbase32(secret:string):Buffer {
 let bits=0,value=0;const out:number[]=[];for(const c of secret){const index=alphabet.indexOf(c);if(index<0)throw Error('Secret invalide');value=(value<<5)|index;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);
}
export function totp(secret:string,step:number,digits=6):string {
 const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const mac=createHmac('sha1',unbase32(secret)).update(b).digest();const offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
export function protect(value:string,key:string):string {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update('waraqa-secrets-v1:'+key).digest(),iv);
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
}
export function reveal(value:string,key:string):string {
 const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',createHash('sha256').update('waraqa-secrets-v1:'+key).digest(),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');
}
