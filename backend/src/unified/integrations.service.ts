import { BadGatewayException, BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { WorkspaceRecord } from './record.entity';
import { UtilisateurEntity } from '../utilisateurs/utilisateur.entity';
import { JournalService } from '../journal/journal.service';
import { protect, reveal } from '../auth/totp';
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
@Injectable()
export class IntegrationsService {
 private syncing=false;
 constructor(@InjectRepository(WorkspaceRecord) private records:Repository<WorkspaceRecord>,@InjectRepository(UtilisateurEntity) private users:Repository<UtilisateurEntity>,private journal:JournalService){}
 private key(){if(!process.env.WARAQA_JWT_SECRET)throw new BadRequestException('Secret serveur requis.');return process.env.WARAQA_JWT_SECRET;}
 private configured(){return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);}
 private async admin(u:any){if((await this.users.findOneBy({id:u.sub}))?.role!=='admin')throw new ForbiddenException('Administrateur requis.');}
 private async call(url:string,init:RequestInit={}){
  try{const r=await fetch(url,{...init,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('status');return r;}catch{throw new BadGatewayException('Service Google indisponible ou autorisation refusée. Aucun succès confirmé.');}
 }
 async status(u:any){await this.admin(u);const token=await this.records.findOneBy({id:'drive-token'});return {drive:{configured:this.configured(),authorized:Boolean(token),lastVerified:token?.data.updatedAt || null},email:{mode:'local',externalEnabled:false},push:{externalEnabled:false,reason:'Aucun serveur Web Push/VAPID configuré.'}};}
 async start(u:any){
  await this.admin(u);if(!this.configured())throw new BadRequestException('Configurez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_REDIRECT_URI côté serveur.');
  const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
  await this.records.save({id:'oauth-'+hash(state),kind:'oauth_state',data:{userId:u.sub,sessionVersion:(await this.users.findOneBy({id:u.sub}))!.sessionVersion,expires:Date.now()+600000,verifier:protect(verifier,this.key())}});
  const query=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:process.env.GOOGLE_REDIRECT_URI!,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+query};
 }
 async callback(state:string,code:string){
  if(typeof state!=='string' || !/^[a-f0-9]{64}$/.test(state) || typeof code!=='string')throw new BadRequestException('Autorisation refusée ou état invalide.');
  const id='oauth-'+hash(state),r=await this.records.findOneBy({id});
  if(!r || r.data.expires<Date.now())throw new BadRequestException('Autorisation expirée. Recommencez depuis Réglages.');
  const owner=await this.users.findOneBy({id:r.data.userId});if(owner?.role!=='admin' || owner.sessionVersion!==r.data.sessionVersion)throw new ForbiddenException('Session ayant demandé l’autorisation révoquée.');
  if(!(await this.records.delete(id)).affected)throw new BadRequestException('Autorisation déjà utilisée.');
  const response=await this.call('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,redirect_uri:process.env.GOOGLE_REDIRECT_URI!,grant_type:'authorization_code',code_verifier:reveal(r.data.verifier,this.key())})});
  const tokens=await response.json() as any;if(!tokens.access_token || !tokens.refresh_token)throw new BadGatewayException('Autorisation Google incomplète ; redemandez le consentement.');
  await this.records.save({id:'drive-token',kind:'integration_secret',data:{encrypted:protect(JSON.stringify(tokens),this.key()),expires:Date.now()+tokens.expires_in*1000,updatedAt:new Date().toISOString()}});
  await this.journal.ecrire({action:'drive_autorise',utilisateurId:owner.id,saisiPar:owner.nom});return {ok:true};
 }
 private async token(){
  const record=await this.records.findOneBy({id:'drive-token'});if(!record)throw new BadRequestException('Google Drive non autorisé.');
  let tokens=JSON.parse(reveal(record.data.encrypted,this.key()));
  if(record.data.expires<Date.now()+60000){const r=await this.call('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,refresh_token:tokens.refresh_token,grant_type:'refresh_token'})});tokens={...tokens,...await r.json() as any};record.data.encrypted=protect(JSON.stringify(tokens),this.key());record.data.expires=Date.now()+tokens.expires_in*1000;await this.records.save(record);}
  return tokens.access_token as string;
 }
 async disconnect(u:any){await this.admin(u);const r=await this.records.findOneBy({id:'drive-token'});if(r){const t=JSON.parse(reveal(r.data.encrypted,this.key()));await this.call('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:t.refresh_token})});await this.records.delete('drive-token');}await this.journal.ecrire({action:'drive_deconnecte',utilisateurId:u.sub,saisiPar:u.nom});return {ok:true};}
 async upload(u:any,doc:any,file:{buffer:Buffer;name:string},folder:string){
  await this.admin(u);if(this.syncing)throw new BadRequestException('Transfert Drive en cours.');if(!/^[a-zA-Z0-9_-]{10,200}$/.test(folder || ''))throw new BadRequestException('Identifiant de dossier Drive requis. Ce dossier doit avoir été autorisé pour cette application.');
  this.syncing=true;
  try{
   const token=await this.token(),headers={Authorization:'Bearer '+token};
   const query=new URLSearchParams({q:`trashed=false and '${folder}' in parents and appProperties has { key='waraqaHash' and value='${doc.data.hash}' }`,fields:'files(id)'});
   const existing=await (await this.call('https://www.googleapis.com/drive/v3/files?'+query,{headers})).json() as any;
   if(existing.files?.length)return {id:existing.files[0].id,duplicate:true};
   const begin=await this.call('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Upload-Content-Length':String(file.buffer.length),'X-Upload-Content-Type':'application/octet-stream'},body:JSON.stringify({name:file.name,parents:[folder],appProperties:{waraqaHash:doc.data.hash}})});
   const location=begin.headers.get('location');if(!location || new URL(location).origin!=='https://www.googleapis.com')throw new BadGatewayException('Session de transfert Google invalide.');
   const result=await (await this.call(location,{method:'PUT',headers:{...headers,'Content-Type':'application/octet-stream'},body:new Uint8Array(file.buffer)})).json() as any;
   await this.journal.ecrire({action:'document_drive_transfere',lotId:doc.id,utilisateurId:u.sub,saisiPar:u.nom,details:{remoteId:result.id}});return {id:result.id,duplicate:false};
  }finally{this.syncing=false;}
 }
 async localMail(u:any){const user=await this.users.findOneBy({id:u.sub});if(!user)throw new ForbiddenException();const id='mail-'+randomBytes(12).toString('hex');await this.records.save({id,kind:'mail_outbox',data:{userId:u.sub,to:user.email,subject:'Diagnostic Waraqa',text:'Message de contrôle local. Aucun email externe envoyé.',createdAt:new Date().toISOString(),state:'local'}});await this.journal.ecrire({action:'email_test_local',utilisateurId:u.sub,saisiPar:user.nom});return {id,state:'local'};}
 async outbox(u:any){return (await this.records.findBy({kind:'mail_outbox'})).filter(r=>r.data.userId===u.sub);}
}
