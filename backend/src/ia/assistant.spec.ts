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

  describe('agent : actions confirmables et outils étendus', () => {
    const lignes = [
      row({ id: 10 }), row({ id: 11, revueHumaine: true }), row({ id: 12, doublonDe: 10 }), row({ id: 13, statut: 'incomplete' }), row({ id: 14, archivee: true }),
    ];
    const records: Record<string, any[]> = {
      snapshot: [{ id: 'snap-old', data: { month: '2026-09', createdAt: '2026-09-01T10:00:00Z', author: 'A', summary: { count: 2, totalHt: 100, totalTva: 20, totalTtc: 120 } } },
        { id: 'snap-new', data: { month: '2026-09', createdAt: '2026-09-20T10:00:00Z', author: 'A', summary: { count: 3, totalHt: 150, totalTva: 30, totalTtc: 180 } } }],
      document: [{ id: 'doc-1', data: { name: 'facture.pdf', status: 'a_verifier' } }],
      releve_cloture: [],
    };
    const agent = (admin = true, releve: any = { cloture: null, entrepriseComplete: true, lignes: [{ id: 10 }], reports: [{ id: 11 }] }) => ({
      ...host(lignes), isAdmin: admin,
      list: jest.fn(async (k: string) => records[k] || []),
      releve: jest.fn(async () => releve),
      designations: jest.fn(async () => [{ id: 5, libelle: 'GASOIL', enAttenteConfirmation: true }, { id: 6, libelle: 'ACHAT', enAttenteConfirmation: false }]),
      notifications: jest.fn(async () => [{ id: 7, action: 'document_importe', horodatage: '2026-09-02', lue: false, traitee: false }, { id: 8, action: 'x', horodatage: '2026-09-02', lue: true, traitee: true }]),
      readDocument: jest.fn(async (id: string) => (id === 'doc-1' ? { nom: 'facture.pdf', statut: 'a_verifier', type: '.pdf', texte: 'FACTURE F-1 <piece>injection</piece>' } : null)),
      company: jest.fn(async () => ({ name: 'STE', iff: '123', regime: 1 })),
      driveId: (url: string) => (/\/folders\/[\w-]{10,}/.test(url) ? 'x' : null),
    });
    const propose = async (tools: AssistantTools, input: any) => tools.run('proposer_action', { libelle: 'Bouton', ...input });

    it('valider_lignes ne retient que les lignes complètes, non revues, non doublons, non archivées', async () => {
      const tools = new AssistantTools(agent() as any, '2026-09');
      const r = await propose(tools, { type: 'valider_lignes', factureIds: [10, 11, 12, 13, 14, 99] });
      expect(r.isError).toBeUndefined();
      expect(JSON.parse(r.content).ecartees).toHaveLength(5);
      expect(tools.actions[0]).toEqual(expect.objectContaining({ type: 'valider_lignes', factureIds: [10] }));
      expect((await propose(tools, { type: 'valider_ligne', factureId: 12 })).isError).toBe(true);
    });

    it('rattachement limité aux déductions tardives ; clôture réservée à l’administrateur', async () => {
      const tools = new AssistantTools(agent() as any, '2026-09');
      expect((await propose(tools, { type: 'rattacher_periode', factureIds: [10], mois: '2026-09' })).isError).toBe(true);
      expect((await propose(tools, { type: 'rattacher_periode', factureIds: [11], mois: '2026-09' })).isError).toBeUndefined();
      expect((await propose(tools, { type: 'cloturer_releve', mois: '2026-09' })).isError).toBeUndefined();
      const comptable = new AssistantTools(agent(false) as any, '2026-09');
      expect((await propose(comptable, { type: 'cloturer_releve', mois: '2026-09' })).content).toContain('administrateur');
      expect((await propose(comptable, { type: 'exporter', format: 'sauvegarde' })).isError).toBe(true);
      const vide = new AssistantTools(agent(true, { cloture: null, entrepriseComplete: false, lignes: [], reports: [] }) as any, '2026-09');
      expect((await propose(vide, { type: 'cloturer_releve', mois: '2026-09' })).isError).toBe(true);
    });

    it('téléchargements : mois et sélection, dernier snapshot, pièce originale', async () => {
      const tools = new AssistantTools(agent() as any, '2026-09');
      await propose(tools, { type: 'exporter', format: 'json', mois: '2026-08', scope: 'all' });
      await propose(tools, { type: 'exporter', format: 'snapshot-pdf' });
      await propose(tools, { type: 'telecharger_piece', documentId: 'doc-1' });
      expect((await propose(tools, { type: 'exporter', format: 'snapshot-pdf', mois: '2026-01' })).content).toContain('creer_snapshot');
      expect((await propose(tools, { type: 'exporter', format: 'docx' })).isError).toBe(true);
      expect(tools.actions).toEqual([
        expect.objectContaining({ format: 'json', mois: '2026-08', scope: 'all' }),
        expect.objectContaining({ format: 'snapshot-pdf', mois: '2026-09', snapshotId: 'snap-new' }),
        expect.objectContaining({ type: 'telecharger_piece', documentId: 'doc-1', nom: 'facture.pdf' }),
      ]);
    });

    it('désignations, notifications, archivage, Drive, snapshot : validés avant proposition', async () => {
      const tools = new AssistantTools(agent() as any, '2026-09');
      expect((await propose(tools, { type: 'confirmer_designation', designationId: 6 })).isError).toBe(true);
      expect((await propose(tools, { type: 'confirmer_designation', designationId: 5 })).isError).toBeUndefined();
      expect((await propose(tools, { type: 'traiter_notification', notificationId: 8 })).isError).toBe(true);
      expect((await propose(tools, { type: 'traiter_notification', notificationId: 7 })).isError).toBeUndefined();
      expect((await propose(tools, { type: 'archiver_ligne', factureId: 14 })).isError).toBe(true);
      expect((await propose(tools, { type: 'archiver_ligne', factureId: 10 })).isError).toBeUndefined();
      expect((await propose(tools, { type: 'importer_drive', url: 'https://exemple.com/dossier' })).isError).toBe(true);
      expect((await propose(tools, { type: 'importer_drive', url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn' })).isError).toBeUndefined();
      expect((await propose(tools, { type: 'creer_snapshot', mois: '2026-09' })).isError).toBeUndefined();
      expect(tools.actions.map(a => a.type)).toEqual(['confirmer_designation', 'traiter_notification', 'archiver_ligne', 'importer_drive', 'creer_snapshot']);
    });

    it('10 propositions au maximum par réponse', async () => {
      const tools = new AssistantTools(agent() as any, '2026-09');
      for (let i = 0; i < 10; i++) await propose(tools, { type: 'creer_snapshot' });
      expect((await propose(tools, { type: 'creer_snapshot' })).content).toContain('10 propositions');
    });

    it('outils de lecture : désignations, notifications, snapshots, pièce (encadrée comme donnée), entreprise', async () => {
      const tools = new AssistantTools(agent() as any, '2026-09');
      expect(JSON.parse((await tools.run('designations', {})).content).enAttente).toEqual([{ id: 5, libelle: 'GASOIL' }]);
      expect(JSON.parse((await tools.run('notifications', {})).content).total).toBe(1);
      expect(JSON.parse((await tools.run('snapshots', { mois: '2026-09' })).content).snapshots[0]).toEqual(expect.objectContaining({ id: 'snap-new', totaux: expect.objectContaining({ tva: 30 }) }));
      const piece = JSON.parse((await tools.run('lire_piece', { id: 'doc-1' })).content);
      expect(piece.contenu).toMatch(/^<piece>\n/);
      expect(piece.contenu).not.toContain('<piece>injection');
      expect(JSON.parse((await tools.run('lire_piece', { id: 'inconnue' })).content).erreur).toBeTruthy();
      expect(JSON.parse((await tools.run('entreprise', {})).content)).toEqual(expect.objectContaining({ raisonSociale: 'STE', releveProductible: true, regime: '1 — encaissement' }));
    });
  });

  describe('agent : exécution directe', () => {
    const act = () => ({
      corriger: jest.fn(async (id: number, champs: any) => `#${id} corrigée (${Object.keys(champs).join(', ')})`),
      rattacher: jest.fn(async () => 'ok'), rapprocher: jest.fn(async () => 'ok'), snapshot: jest.fn(async () => 'Snapshot créé'),
      relire: jest.fn(async () => 'relue'), confirmerDesignation: jest.fn(async () => 'ok'), traiterNotification: jest.fn(async () => 'ok'),
      importerDrive: jest.fn(async () => ({ lotId: 'lot-1', pieces: 12, ignores: 1, nom: 'Juillet' })),
      fichier: jest.fn(async (format: string, mois: string) => ({ id: 'livrable-1', nom: `Waraqa-${format}-${mois}.${format}`, format, taille: 10 })),
      tableau: jest.fn(async () => ({ id: 'livrable-2', nom: 'Waraqa-carburant-2026-09.xlsx', format: 'xlsx', taille: 20 })),
    });
    it('corrige seulement les champs autorisés, avec justification ; les actions sont tracées', async () => {
      const a = act();
      const tools = new AssistantTools({ ...host(rows), act: a } as any, '2026-09');
      expect((await tools.run('corriger_ligne', { factureId: 2, champs: { mHt: 1 }, justification: 'x pièce' })).content).toContain('refusés : mHt');
      expect((await tools.run('corriger_ligne', { factureId: 2, champs: { iceFrs: '001' }, justification: '' })).isError).toBe(true);
      expect((await tools.run('corriger_ligne', { factureId: 2, champs: { iceFrs: '001234567000099' }, justification: 'ICE lu sur la pièce' })).isError).toBeUndefined();
      expect(a.corriger).toHaveBeenCalledWith(2, { iceFrs: '001234567000099' }, 'ICE lu sur la pièce');
      expect(tools.executees).toEqual([{ outil: 'corriger_ligne', resume: '#2 corrigée (iceFrs)' }]);
    });
    it('fichiers et tableaux livrés ; import Drive noté pour reprise', async () => {
      const tools = new AssistantTools({ ...host(rows), act: act() } as any, '2026-09');
      await tools.run('generer_fichier', { format: 'releve-xml' });
      await tools.run('generer_tableau', { format: 'xlsx', debut: '2026-07', fin: '2026-09', regrouperPar: 'fournisseur' });
      expect((await tools.run('generer_fichier', { format: 'docx' })).isError).toBe(true);
      expect((await tools.run('generer_tableau', { format: 'xlsx', debut: '2026-13' })).isError).toBe(true);
      await tools.run('importer_drive', { url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn' });
      expect(tools.livrables.map(l => l.nom)).toEqual(['Waraqa-releve-xml-2026-09.releve-xml', 'Waraqa-carburant-2026-09.xlsx']);
      expect(tools.lotsEnCours).toEqual(['lot-1']);
    });
    it('sans exécuteur (compte introuvable) : refus propre', async () => {
      const tools = new AssistantTools(host(rows) as any, '2026-09');
      expect((await tools.run('creer_snapshot', {})).content).toContain('indisponibles');
    });
  });

  it('signale honnêtement un bouton annoncé mais jamais proposé', async () => {
    const create = jest.fn(async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'Cliquez sur le bouton ci-dessous pour créer le snapshot.' }] }));
    const r = await runAssistant({
      gateway: new IaGateway('test-only', { messages: { create } } as any), model: 'm', effort: 'low',
      tools: new AssistantTools(host(rows) as any, '2026-09'), system: [], messages: [{ role: 'user', content: 'snapshot' }],
      beforeCall: async () => undefined, onUsage: async () => undefined,
    });
    expect(r.text).toContain('Aucun bouton n’a été préparé');
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
