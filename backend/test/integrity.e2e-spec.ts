import { TwoFactorService } from "../src/auth/two-factor.service";
import { totp } from "../src/auth/totp";
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UnifiedService } from '../src/unified/unified.service';
import { AuthService } from '../src/auth/auth.service';
import { FacturesService } from '../src/factures/factures.service';
import { SousType } from '../src/common/types';

describe('Intégrité de finalisation',()=>{
 let app:INestApplication, dir:string, service:UnifiedService, factures:FacturesService, user:any, token:string, id:number;
 beforeAll(async()=>{
  dir=await mkdtemp(join(tmpdir(),'waraqa-integrity-'));process.env.WARAQA_DB_PATH=join(dir,'db.sqlite');process.env.WARAQA_FILES_PATH=join(dir,'files');
  process.env.WARAQA_JWT_SECRET='test-only-integrity-secret';
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.init();
  service=app.get(UnifiedService);factures=app.get(FacturesService);
  const a=await app.get(AuthService).inscrire({nom:'Test',email:'integrity@example.test',motDePasse:'IntegrityTest2026!'});user={sub:a.utilisateur.id,nom:a.utilisateur.nom};token=a.accessToken;
  const row=await factures.creer({factNum:'TEST-1',libFrss:'Fictif',iceFrs:'000123',iff:'00012',designation:'ACHAT',mTtc:120,taux:0.2,dateFac:'2026-09-01',sousType:SousType.FACTURE_FOURNISSEUR},service.actor(user));id=row.id;
 });
 afterAll(async()=>{await app?.close();await rm(dir,{recursive:true,force:true});delete process.env.WARAQA_DB_PATH;delete process.env.WARAQA_FILES_PATH;});
 it('migrations versionnées et index persistants',async()=>{expect((await app.get(DataSource).query('SELECT * FROM migrations')).length).toBe(2);});
 it('rejette les éditions périmées et concurrentes',async()=>{
  const row=await factures.trouver(id);
  const results=await Promise.allSettled([factures.modifier(id,{designation:'ACHAT A',expectedVersion:row.version},service.actor(user)),factures.modifier(id,{designation:'ACHAT B',expectedVersion:row.version},service.actor(user))]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  await expect(factures.modifier(id,{designation:'OLD',expectedVersion:row.version},service.actor(user))).rejects.toThrow('changé');
 });
 it('restaure une archive sans conserver sa revue',async()=>{await factures.validerLigne(id,service.actor(user));await service.archive(id,user);await service.restoreInvoice(id,user);expect((await factures.trouver(id)).revueHumaine).toBe(false);});
 it('sépare les exemples des exports par défaut',async()=>{
  await service.seed('2026-10',user);
  await expect(service.export('2026-10','csv','all',user)).rejects.toThrow('Aucune ligne');
  expect((await service.export('2026-10','csv','all',user,true)).name).toContain('EXEMPLES');
 });
 it('sauvegarde incluant SQLite et originaux, restauration contrôlée',async()=>{
  const buffer=Buffer.from('%PDF-fictif-test');
  const doc=await service.upload({originalname:'fictif.pdf',size:buffer.length,buffer} as any,user);
  const archive=await service.backup(user), data=JSON.parse(gunzipSync(archive).toString());
  expect(data.files['files/'+doc.id+'.pdf']).toBe(buffer.toString('base64'));
  const filename=join(dir,'backup.gz');await writeFile(filename,archive);
  const {restore}=require('../../scripts/restore.cjs');
  expect((await restore(filename,join(dir,'restored'))).integrity).toBe('ok');
  await expect(restore(filename,join(dir,'restored'))).rejects.toThrow();
 });
 it('aperçu, mapping et reprise idempotente des lignes acceptées',async()=>{
  const buffer=Buffer.from('Référence;Prix;TAUX;DATE_FAC\nMAPPING-1;120;20;2026-09-01\nMAPPING-2;bad;20;2026-09-01');
  const doc=await service.upload({originalname:'mapping.csv',size:buffer.length,buffer} as any,user,true);
  expect(doc.data.status).toBe('apercu');expect(doc.data.invoiceIds).toHaveLength(0);
  const preview=await service.importPreview(doc.id,{'Référence':'factNum',Prix:'mTtc'});expect(preview.total).toBe(2);expect(preview.errors).toHaveLength(1);
  const committed=await service.resumeImport(doc.id,user);expect(committed.data.invoiceIds).toHaveLength(1);expect(committed.data.status).toBe('partiel');
  const resumed=await service.resumeImport(doc.id,user);expect(resumed.data.invoiceIds).toEqual(committed.data.invoiceIds);
 });
 it('paiements partiels et groupés, reliquat et annulation tracée',async()=>{
  const inv=await factures.creer({factNum:'PARTIAL',libFrss:'Fictif',iceFrs:'012',designation:'ACHAT',mTtc:120,taux:0.2,dateFac:'2026-09-01',sousType:SousType.FACTURE_FOURNISSEUR},service.actor(user));
  const pay=await factures.creer({mTtc:150,taux:0,datePaie:'2026-09-03',idPaie:4,sousType:SousType.AVIS_DEBIT_VIREMENT},service.actor(user));
  const first=await service.reconcile(pay.id,inv.id,user,50);expect(first.remainingInvoice).toBe(70);
  await expect(factures.modifier(inv.id,{mTtc:100},service.actor(user))).rejects.toThrow('affectations');
  const second=await service.reconcile(pay.id,inv.id,user,70);expect(second.remainingPayment).toBe(30);
  await expect(service.reconcile(pay.id,inv.id,user,1)).rejects.toThrow('invalide');
  await service.cancelAllocation(first.allocationId,'Correction du rapprochement',user);
  expect((await factures.trouver(inv.id)).revueHumaine).toBe(false);
 });
 it('avoir relié et dates calendaires strictes',async()=>{
  await expect(factures.creer({mTtc:12,taux:0.2,dateFac:'2026-02-30',sousType:SousType.FACTURE_FOURNISSEUR},service.actor(user))).rejects.toThrow('Date');
  const credit=await factures.creer({creditOf:id,mTtc:-12,taux:0.2,sousType:SousType.FACTURE_FOURNISSEUR},service.actor(user));expect(credit.mHt).toBe(-10);expect(credit.tva).toBe(-2);
  await expect(factures.creer({mTtc:-12,taux:0.2,sousType:SousType.FACTURE_FOURNISSEUR},service.actor(user))).rejects.toThrow('avoir');
 });
 it('2FA : enrôlement vérifié, révocation, secours à usage unique',async()=>{
  const member=await service.createUser({nom:'TOTP',email:'totp@example.test',motDePasse:'TotpTest2026!',role:'comptable'},user);
  const two=app.get(TwoFactorService), auth=app.get(AuthService);
  const setup=await two.begin(member.id,'TotpTest2026!');expect((await two.status(member.id)).enabled).toBe(false);
  const codes=await two.confirm(member.id,totp(setup.secret,Math.floor(Date.now()/30000)));expect(codes.recoveryCodes).toHaveLength(8);
  await expect(auth.connecter({email:'totp@example.test',motDePasse:'TotpTest2026!'})).rejects.toThrow('2FA');
  expect((await auth.connecter({email:'totp@example.test',motDePasse:'TotpTest2026!',otp:codes.recoveryCodes[0]})).accessToken).toBeTruthy();
  await expect(auth.connecter({email:'totp@example.test',motDePasse:'TotpTest2026!',otp:codes.recoveryCodes[0]})).rejects.toThrow('2FA');
  await two.disable(member.id,'TotpTest2026!',codes.recoveryCodes[1]);expect((await two.status(member.id)).enabled).toBe(false);
 });
 it('interdit sauvegarde et originaux sans session',async()=>{
  await request(app.getHttpServer()).get('/workspace/backup').expect(401);
  await request(app.getHttpServer()).get('/workspace/documents/unknown/file').expect(401);
 });
 it('ne permet pas à un comptable de télécharger tous les comptes',async()=>{
  const member=await service.createUser({nom:'Membre',email:'member@example.test',motDePasse:'MemberTest2026!',role:'comptable'},user);
  await expect(service.backup({sub:member.id})).rejects.toThrow('Administrateur');
 });
});
