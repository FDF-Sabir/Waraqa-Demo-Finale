import { IntegrationsService } from './integrations.service';
import { reveal } from '../auth/totp';
describe('Contrats des connecteurs, aucun service réel',()=>{
 let service:IntegrationsService, records:any, users:any, journal:any, mock:jest.SpyInstance;
 beforeEach(()=>{
  const db=new Map<string,any>();records={findOneBy:jest.fn(async(q:any)=>db.get(q.id)),save:jest.fn(async(r:any)=>{db.set(r.id,r);return r;}),delete:jest.fn(async(id:string)=>({affected:db.delete(id)?1:0})),findBy:jest.fn(async(q:any)=>[...db.values()].filter(r=>r.kind===q.kind))};
  users={findOneBy:jest.fn(async()=>({id:1,role:'admin',sessionVersion:0,nom:'Test',email:'test@example.test'}))};journal={ecrire:jest.fn()};service=new IntegrationsService(records,users,journal);
  process.env.GOOGLE_CLIENT_ID='123456789-abcdefghijklmnop.apps.googleusercontent.com';process.env.GOOGLE_ALLOWED_EMAIL='';process.env.GOOGLE_CLIENT_SECRET='fake-test-secret';process.env.GOOGLE_REDIRECT_URI='http://localhost:3000/api/workspace/drive/callback';process.env.WARAQA_JWT_SECRET='test-encryption-only';
  mock=jest.spyOn(global,'fetch').mockRejectedValue(new Error('No network in tests'));
 });
 afterEach(()=>{mock.mockRestore();delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_ALLOWED_EMAIL;delete process.env.GOOGLE_CLIENT_SECRET;delete process.env.GOOGLE_REDIRECT_URI;delete process.env.WARAQA_JWT_SECRET;});
 it('consentement avec état unique, PKCE et portée limitée',async()=>{
  const start=await service.start({sub:1});const url=new URL(start.url);expect(url.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/drive.file');expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(mock).not.toHaveBeenCalled();
  mock.mockResolvedValue(new Response(JSON.stringify({access_token:'fake-access',refresh_token:'fake-refresh',expires_in:3600,scope:'openid https://www.googleapis.com/auth/drive.file'}),{status:200}));
  await service.callback(url.searchParams.get('state')!,'fake-code');expect((await service.status({sub:1})).drive.authorized).toBe(true);
  const r=await records.findOneBy({id:'drive-token'});expect(JSON.stringify(r)).not.toContain('fake-refresh');expect(JSON.parse(reveal(r.data.encrypted,'test-encryption-only')).refresh_token).toBe('fake-refresh');
  await expect(service.callback(url.searchParams.get('state')!,'fake-code')).rejects.toThrow('expirée');
 });
 it('refuse état invalide et accès non admin',async()=>{await expect(service.callback('invalid','code')).rejects.toThrow('invalide');users.findOneBy.mockResolvedValue({role:'comptable'});await expect(service.start({sub:2})).rejects.toThrow('Administrateur');expect(mock).not.toHaveBeenCalled();});
 it('boîte locale sans envoi externe',async()=>{await service.localMail({sub:1});expect(await service.outbox({sub:1})).toHaveLength(1);expect(await service.outbox({sub:2})).toHaveLength(0);expect(mock).not.toHaveBeenCalled();});
});
