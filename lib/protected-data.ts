import { DomainError } from './domain';
export async function protectIdentity(rawId:string,rawPhone:string,organizationId:string,keyText:string){
 const identity=rawId.trim().replace(/[\s-]/g,'').toUpperCase(),phone=rawPhone.trim().replace(/[\s-]/g,'');if(!/^[A-Z0-9]{5,20}$/.test(identity))throw new DomainError('Enter a valid identity reference with 5–20 letters or digits.');if(phone&&!/^\+?\d{9,15}$/.test(phone))throw new DomainError('Enter a valid payment phone number.');if(!/^[a-f0-9]{64}$/i.test(keyText))throw new DomainError('Protected identity storage is not configured.',503);
 const raw=new Uint8Array(keyText.match(/.{2}/g)!.map(x=>parseInt(x,16))),aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']),hmac=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const encode=(bytes:Uint8Array)=>Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
 async function encrypt(value:string){if(!value)return '';const iv=crypto.getRandomValues(new Uint8Array(12)),aad=new TextEncoder().encode(organizationId);const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},aes,new TextEncoder().encode(value));return encode(iv)+':'+encode(new Uint8Array(encrypted));}
 const fingerprint=encode(new Uint8Array(await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(organizationId+':'+identity))));
 const phoneFingerprint=encode(new Uint8Array(await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(organizationId+':phone:'+phone))));
 return {encryptedId:await encrypt(identity),encryptedPhone:await encrypt(phone),fingerprint,phoneFingerprint,idLast4:identity.slice(-4),phoneLast4:phone.slice(-4),verifiedBy:'',verifiedAt:''};
}
