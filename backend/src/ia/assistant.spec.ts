import { AssistantTools, runAssistant, ASSISTANT_TOOLS } from './assistant';
import { IaGateway } from '../ocr/ia-gateway';

const row = (over: any = {}) => ({
  id: 1, factNum: 'F-1', libFrss: 'Atlas', iceFrs: '001234567000012', iff: '12345678', designation: 'ACHAT',
  mHt: 100, tva: 20, mTtc: 120, taux: 0.2, idPaie: 4, dateFac: '2026-09-03', datePaie: '2026-09-07',
  sousType: 'facture_fournisseur', statut: 'validee', champsManquants: [], revueHumaine: false, vigilanceRenforcee: false,
  demonstration: false, archivee: false, ...over,
});

function host(rows: any[]) {
  const bank = (f: any) => ['releve_bancaire', 'avis_debit_virement'].includes(f.sousType) && f.designation !== 'COMMISSION';
  const tax = rows.filter(f => !bank(f));
  return {
    summary: jest.fn(async (month: string) => ({
      month, count: rows.length, rows, bank: rows.filter(bank).length, reviewed: 0, anomalies: 1,
      totalHt: tax.reduce((s, f) => s + f.mHt, 0), totalTva: tax.reduce((s, f) => s + f.tva, 0), totalTtc: tax.reduce((s, f) => s + f.mTtc, 0),
    })),
    searchInvoices: jest.fn(async (_m: string, _q = '', filter = 'all', page = 1, size = 25) => {
      const list = filter === 'anomaly' ? rows.filter(f => f.statut !== 'validee') : rows;
      return { rows: list.slice((page - 1) * size, page * size), total: list.length, page, size };
    }),
    reconcileCandidates: jest.fn(async () => [{ payment: rows.find(bank), remaining: 120, candidates: [{ id: 1, factNum: 'F-1', libFrss: 'Atlas', mTtc: 120, remaining: 120 }] }]),
    list: jest.fn(async () => []),
    findInvoice: jest.fn(async (id: number) => rows.find(f => f.id === id) || null),
    journalFor: jest.fn(async () => [{ action: 'facture_creee', saisiPar: 'Test', horodatage: '2026-09-01T10:00:00Z', factureId: 1 }]),
    bank,
  };
}

describe('Assistant comptable connecté (outils en lecture seule)', () => {
  const rows = [
    row(),
    row({ id: 2, factNum: 'F-2', libFrss: 'Bureau Plus', mHt: 50, tva: 5, mTtc: 55, taux: 0.1, statut: 'incomplete', champsManquants: ['iceFrs'] }),
    row({ id: 3, factNum: undefined, libFrss: 'Atlas', sousType: 'avis_debit_virement', mHt: 120, tva: 0, mTtc: 120, taux: 0 }),
  ];

  it('déclare des outils au schéma strict', () => {
    for (const t of ASSISTANT_TOOLS) expect((t.input_schema as any).additionalProperties).toBe(false);
    expect(ASSISTANT_TOOLS.map(t => t.name)).toContain('proposer_action');
  });

  it('synthèse : totaux serveur, banque exclue, répartition par taux', async () => {
    const tools = new AssistantTools(host(rows) as any, '2026-09');
    const r = JSON.parse((await tools.run('synthese_mois', {})).content);
    expect(r.achats.totalTtc).toBe(175);
    expect(r.mouvementsBancaires).toBe(1);
    expect(r.parTaux['20 %'].lignes).toBe(1);
    expect(r.parTaux['10 %'].tva).toBe(5);
    expect(tools.traces[0].summary).toContain('2026-09');
  });

  it('anomalies avec raisons compréhensibles', async () => {
    const tools = new AssistantTools(host(rows) as any, '2026-09');
    const r = JSON.parse((await tools.run('anomalies', {})).content);
    expect(r.total).toBe(1);
    expect(r.lignes[0].raisons.join(' ')).toContain('iceFrs');
  });

  it('refuse un mois invalide sans planter la boucle', async () => {
    const tools = new AssistantTools(host(rows) as any, '2026-09');
    const r = await tools.run('synthese_mois', { mois: '2026-13' });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('AAAA-MM');
  });

  it('les propositions sont validées et jamais exécutées', async () => {
    const h = host(rows);
    const tools = new AssistantTools(h as any, '2026-09');
    expect((await tools.run('proposer_action', { type: 'ouvrir_ligne', factureId: 2, libelle: 'Compléter #2' })).isError).toBeUndefined();
    expect((await tools.run('proposer_action', { type: 'ouvrir_ligne', factureId: 99, libelle: 'Inexistante' })).isError).toBe(true);
    expect((await tools.run('proposer_action', { type: 'rapprocher', paymentId: 3, invoiceId: 1, libelle: 'Rapprocher' })).isError).toBeUndefined();
    expect((await tools.run('proposer_action', { type: 'rapprocher', paymentId: 3, invoiceId: 2, libelle: 'Non candidat' })).isError).toBe(true);
    expect((await tools.run('proposer_action', { type: 'exporter', format: 'exe', libelle: 'x' })).isError).toBe(true);
    expect(tools.actions).toEqual([
      expect.objectContaining({ type: 'ouvrir_ligne', factureId: 2 }),
      expect.objectContaining({ type: 'rapprocher', paymentId: 3, invoiceId: 1, montant: 120 }),
    ]);
  });

  it('boucle outil → réponse, cache sur le dernier bloc, consommation comptée', async () => {
    const calls: any[] = [];
    const create = jest.fn(async (params: any) => {
      calls.push(JSON.parse(JSON.stringify(params)));
      if (calls.length === 1) return { stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10 }, content: [
        { type: 'thinking', thinking: '…', signature: 'sig' },
        { type: 'tool_use', id: 'tu1', name: 'anomalies', input: {} },
      ] };
      return { stop_reason: 'end_turn', usage: { input_tokens: 150, output_tokens: 40, cache_read_input_tokens: 90 }, content: [{ type: 'text', text: 'Une anomalie : #2 (ICE manquant).' }] };
    });
    const gateway = new IaGateway('test-only', { messages: { create } } as any);
    const tools = new AssistantTools(host(rows) as any, '2026-09');
    const usage: any[] = [];
    const steps: string[] = [];
    const r = await runAssistant({
      gateway, model: 'claude-sonnet-5', effort: 'medium', tools,
      system: [{ type: 'text', text: 'règles', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'Quelles anomalies ?' }],
      beforeCall: async () => undefined,
      onUsage: async u => { usage.push(u); },
      onStep: s => steps.push(s),
    });
    expect(r).toEqual({ text: 'Une anomalie : #2 (ICE manquant).', truncated: false });
    expect(usage).toHaveLength(2);
    expect(steps).toContain('Contrôle des anomalies');
    // 2e appel : la réponse outil est renvoyée, blocs de réflexion conservés, un seul point de cache dans les messages.
    const second = calls[1];
    expect(second.messages[1].content[0].type).toBe('thinking');
    expect(second.messages[2].content[0]).toEqual(expect.objectContaining({ type: 'tool_result', tool_use_id: 'tu1', cache_control: { type: 'ephemeral' } }));
    const marks = JSON.stringify(second.messages).match(/cache_control/g) || [];
    expect(marks).toHaveLength(1);
    expect(second.output_config).toEqual({ effort: 'medium' });
  });

  it('conserve l’analyse rédigée avant un dernier appel d’outil, omet les courtes annonces', async () => {
    const analyse = 'Relevé de juillet : 100 lignes retenues, TVA déductible 806 472,11 MAD. ' + 'Détail des lignes écartées et des contrôles DGI à corriger avant dépôt. '.repeat(3);
    const steps = [
      { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Je consulte le relevé.' }, { type: 'tool_use', id: 'a', name: 'synthese_mois', input: {} }] },
      { stop_reason: 'tool_use', content: [{ type: 'text', text: analyse }, { type: 'tool_use', id: 'b', name: 'proposer_action', input: { type: 'ouvrir_page', page: 'declaration', libelle: 'Ouvrir le relevé' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Le bouton ci-dessus ouvre le relevé.' }] },
    ];
    const create = jest.fn(async () => ({ usage: { input_tokens: 1, output_tokens: 1 }, ...steps.shift()! }));
    const r = await runAssistant({
      gateway: new IaGateway('test-only', { messages: { create } } as any), model: 'm', effort: 'low',
      tools: new AssistantTools(host(rows) as any, '2026-09'), system: [], messages: [{ role: 'user', content: 'relevé' }],
      beforeCall: async () => undefined, onUsage: async () => undefined,
    });
    expect(r.text).toBe(analyse.trim() + '\n\nLe bouton ci-dessus ouvre le relevé.');
  });

  it('s’arrête à la limite d’étapes et le signale', async () => {
    const create = jest.fn(async () => ({ stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 'x' + Math.random(), name: 'synthese_mois', input: {} }] }));
    const r = await runAssistant({
      gateway: new IaGateway('test-only', { messages: { create } } as any), model: 'm', effort: 'low',
      tools: new AssistantTools(host(rows) as any, '2026-09'), system: [], messages: [{ role: 'user', content: 'boucle' }],
      beforeCall: async () => undefined, onUsage: async () => undefined, maxSteps: 3,
    });
    expect(create).toHaveBeenCalledTimes(3);
    expect(r.truncated).toBe(true);
    expect(r.text).toContain('limite');
  });

  it('le budget peut bloquer avant un appel payant', async () => {
    const create = jest.fn();
    await expect(runAssistant({
      gateway: new IaGateway('test-only', { messages: { create } } as any), model: 'm', effort: 'low',
      tools: new AssistantTools(host(rows) as any, '2026-09'), system: [], messages: [{ role: 'user', content: 'x' }],
      beforeCall: async () => { throw new Error('Budget IA mensuel atteint'); }, onUsage: async () => undefined,
    })).rejects.toThrow('Budget');
    expect(create).not.toHaveBeenCalled();
  });
});
