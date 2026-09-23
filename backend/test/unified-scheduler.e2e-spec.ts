import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { UnifiedService } from '../src/unified/unified.service';
import { AuthService } from '../src/auth/auth.service';
import { ReglagesService } from '../src/reglages/reglages.service';
describe('Snapshots automatiques locaux',()=>{
 let app:INestApplication, service:UnifiedService, dir:string, user:any;
 beforeAll(async()=>{
  dir=await mkdtemp(join(tmpdir(),'waraqa-scheduler-'));process.env.WARAQA_DB_PATH=join(dir,'db.sqlite');process.env.WARAQA_FILES_PATH=join(dir,'files');
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();service=app.get(UnifiedService);
  const auth=await app.get(AuthService).inscrire({nom:'Admin scheduler',email:'scheduler@example.test',motDePasse:'SchedulerTest2026!'});user={sub:auth.utilisateur.id,nom:auth.utilisateur.nom};
  await service.seed('2026-09',user);await app.get(ReglagesService).modifier(user.sub,{frequenceSnapshot:'fin_de_mois'});
 });
 afterAll(async()=>{await app?.close();await rm(dir,{recursive:true,force:true});delete process.env.WARAQA_DB_PATH;delete process.env.WARAQA_FILES_PATH;});
 it('ne crée aucun snapshot quand désactivé',async()=>{await service.schedule(new Date('2026-09-30T12:00:00Z'));expect(await service.list('snapshot')).toHaveLength(0);});
 it('respecte la date d’échéance et persiste un seul snapshot par échéance',async()=>{
  await service.updateSettings({integrations:{autoExport:true}},user);
  await service.schedule(new Date('2026-09-29T12:00:00Z'));expect(await service.list('snapshot')).toHaveLength(0);
  await service.schedule(new Date('2026-09-30T12:00:00Z'));await service.schedule(new Date('2026-09-30T13:00:00Z'));
  const records=await service.list('snapshot');expect(records).toHaveLength(1);expect(records[0].data.summary.count).toBe(6);expect(records[0].data.month).toBe('2026-09');
 });
 it('ne confond pas un paiement bancaire avec une charge dans le snapshot',async()=>{const records=await service.list('snapshot');expect(records[0].data.summary.bank).toBe(1);expect(records[0].data.summary.totalTtc).toBe(19090);});
});
