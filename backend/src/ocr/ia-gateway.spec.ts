import { IaGateway } from './ia-gateway';
import { ExtractionIaLiveService } from './extraction-ia-live.service';
const params: any = { model: 'test-only', messages: [{role: 'user', content: 'test'}], max_tokens: 10 };
describe('Contrats IA sans réseau', () => {
  it('refuse toute création sans clé', () => { expect(() => new IaGateway('')).toThrow('non configurée'); });
  it('accepte une réponse complète et conserve les tokens', async () => {
    const r = { stop_reason: 'end_turn', content: [{type: 'text', text: 'OK'}], usage: {input_tokens: 2, output_tokens: 1} };
    const g = new IaGateway('test-only', {messages: {create: jest.fn().mockResolvedValue(r)}} as any);
    expect(await g.message(params)).toEqual(r);
  });
  it.each(['max_tokens', 'refusal', null])('refuse une réponse incomplète %s', async reason => {
    const g = new IaGateway('test-only', {messages: {create: jest.fn().mockResolvedValue({stop_reason: reason, content: [{type: 'text', text: 'partial'}]})}} as any);
    await expect(g.message(params)).rejects.toThrow('incomplète');
  });
  it.each([401,403,429,500,undefined])('masque données et secrets des erreurs %s', async status => {
    const g = new IaGateway('test-only', {messages: {create: jest.fn().mockRejectedValue({status, message: 'SECRET_PRIVATE_DOCUMENT'})}} as any);
    try { await g.message(params); throw Error('expected rejection'); } catch(e: any) { expect(e.message).not.toContain('SECRET_PRIVATE_DOCUMENT'); expect(e.getStatus()).toBe(502); }
  });
  it('annulation et concurrence bornée', async () => {
    let finish: any;
    const client = {messages: {create: jest.fn().mockImplementation(() => new Promise((_,reject) => { finish = reject; }))}};
    const g = new IaGateway('test-only', client as any), controller = new AbortController();
    const pending = g.message(params, controller.signal);
    await expect(g.message(params)).rejects.toThrow('occupée');
    controller.abort(); finish(Error('cancelled'));
    await expect(pending).rejects.toThrow('annulé');
  });
  it.each(['not json', 'null', '{"sousType":"facture_fournisseur","lignes":[null]}', '{"sousType":"facture_fournisseur","lignes":[{"iceFrs":123}]}'])('rejette une extraction malformée', value => {
    const service: any = new ExtractionIaLiveService('test-only');
    expect(() => service.parserReponse(value)).toThrow();
  });
  it('préserve les zéros et élimine les calculs du modèle', () => {
    const service: any = new ExtractionIaLiveService('test-only');
    const r = service.parserReponse(JSON.stringify({sousType:'facture_fournisseur', confiance:0.8, lignes:[{iceFrs:'0012',mTtc:120,taux:0.2,mHt:999}]}));
    expect(r.lignes[0]).toEqual({iceFrs:'0012',mTtc:120,taux:0.2});
  });
});
