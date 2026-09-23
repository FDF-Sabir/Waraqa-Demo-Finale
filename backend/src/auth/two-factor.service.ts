import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { WorkspaceRecord } from '../unified/record.entity';
import { UtilisateurEntity } from '../utilisateurs/utilisateur.entity';
import { base32, protect, reveal, totp } from './totp';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
@Injectable()
export class TwoFactorService {
 private busy=new Set<number>();
 constructor(@InjectRepository(WorkspaceRecord) private records:Repository<WorkspaceRecord>,@InjectRepository(UtilisateurEntity) private users:Repository<UtilisateurEntity>,private config:ConfigService){}
 private key(){const key=this.config.get<string>('WARAQA_JWT_SECRET');if(!key)throw new BadRequestException('Secret serveur requis pour activer la 2FA.');return key;}
 private id(user:number){return 'two-factor-'+user;}
 async status(user:number){const r=await this.records.findOneBy({id:this.id(user)});return {enabled:Boolean(r?.data.enabled),recoveryRemaining:r?.data.recovery?.length || 0};}
 private async password(user:number,password:string){const u=await this.users.findOneBy({id:user});if(!u || typeof password!=='string' || !await bcrypt.compare(password,u.motDePasseHache))throw new UnauthorizedException('Mot de passe actuel invalide.');return u;}
 async begin(user:number,password:string){
  const u=await this.password(user,password);if((await this.status(user)).enabled)throw new ConflictException('La 2FA est déjà active.');
  const secret=base32(randomBytes(20));
  await this.records.save({id:this.id(user),kind:'two_factor',data:{secret:protect(secret,this.key()),enabled:false,expires:Date.now()+10*60_000,failures:0}});
  return {secret,uri:`otpauth://totp/${encodeURIComponent('Waraqa:'+u.email)}?secret=${secret}&issuer=Waraqa&algorithm=SHA1&digits=6&period=30`};
 }
 async verify(user:number,code?:string,enrolling=false){
  if(this.busy.has(user))throw new UnauthorizedException('Vérification déjà en cours.');this.busy.add(user);
  try{
   const r=await this.records.findOneBy({id:this.id(user)});
   if(!r?.data.enabled && !enrolling)return;
   if(!r || (enrolling && (!r.data.expires || r.data.expires<Date.now())))throw new BadRequestException('Enrôlement expiré. Recommencez.');
   if(r.data.blockedUntil>Date.now())throw new UnauthorizedException('Trop de tentatives. Réessayez dans cinq minutes.');
   const step=Math.floor(Date.now()/30000),secret=reveal(r.data.secret,this.key());
   let matched=-1;
   if(typeof code==='string' && /^\d{6}$/.test(code))for(const n of [step-1,step,step+1])if(n>(r.data.lastStep ?? -1) && timingSafeEqual(Buffer.from(totp(secret,n)),Buffer.from(code)))matched=n;
   const recovery=typeof code==='string' && !enrolling ? (r.data.recovery || []).indexOf(digest(code)) : -1;
   if(matched<0 && recovery<0){r.data.failures=(r.data.failures || 0)+1;if(r.data.failures>=5){r.data.blockedUntil=Date.now()+300000;r.data.failures=0;}await this.records.save(r);throw new UnauthorizedException('Code 2FA requis, invalide ou déjà utilisé.');}
   if(matched>=0)r.data.lastStep=matched;if(recovery>=0)r.data.recovery.splice(recovery,1);r.data.failures=0;r.data.blockedUntil=0;
   await this.records.save(r);return r;
  }finally{this.busy.delete(user);}
 }
 async confirm(user:number,code:string){
  if((await this.status(user)).enabled)throw new ConflictException('2FA déjà active.');
  const r=await this.verify(user,code,true);const codes=Array.from({length:8},()=>randomBytes(16).toString('hex'));
  r!.data.enabled=true;r!.data.recovery=codes.map(digest);delete r!.data.expires;
  await this.records.save(r!);await this.users.increment({id:user},'sessionVersion',1);return {recoveryCodes:codes};
 }
 async disable(user:number,password:string,code:string){await this.password(user,password);await this.verify(user,code);await this.records.delete(this.id(user));await this.users.increment({id:user},'sessionVersion',1);return {ok:true};}
}
