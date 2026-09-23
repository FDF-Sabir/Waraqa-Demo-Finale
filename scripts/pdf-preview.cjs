/* Synthetic examples only. Run after npm run build. */
const { archivePdf } = require('../backend/dist/unified/archive-pdf');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1, factNum: 'DEMO-2026-' + String(i + 1).padStart(3, '0'),
    libFrss: ['Atlas Services', 'Électricité du Maroc', 'Bureau & Fournitures', 'Technologie Casablanca', 'Maintenance Pro'][i % 5],
    designation: ['Entretien des équipements électriques', 'Abonnement logiciel et assistance', 'Fournitures de bureau'][i % 3],
    mHt: (i + 1) * 1000, tva: (i + 1) * 200, mTtc: (i + 1) * 1200, taux: 0.2,
    iceFrs: '000123456000012', iff: '0012345', dateFac: '2026-09-01', datePaie: '2026-09-15', idPaie: 4,
    sousType: 'facture_fournisseur', statut: 'validee', revueHumaine: i % 3 !== 0, demonstration: true,
  }));
  rows.push({ ...rows[0], id: 13, factNum: 'AVOIR-001', mHt: -25000, tva: -5000, mTtc: -30000, libFrss: 'Retour fournisseur', creditOf: 1 });
  const directory = path.resolve(__dirname, '../docs/exemples-exports');
  await mkdir(directory, { recursive: true });
  const common = { createdAt: '2026-09-23T10:00:00.000Z', month: '2026-09', author: 'Équipe Démonstration', company: { name: 'Entreprise de démonstration', ice: '000123456000012' }, rows };
  for (const [filename, title, extras] of [
    ['releve-demo.pdf', 'Relevé comptable et synthèse', { selection: 'BROUILLON — toutes lignes hors banque' }],
    ['archive-demo.pdf', 'Sauvegarde des lignes archivées', { rows: rows.map(row => ({ ...row, archivee: true })) }],
    ['snapshot-demo.pdf', 'Archive du snapshot', { reference: 'DEMONSTRATION-2026-09' }],
  ]) {
    await writeFile(path.join(directory, filename), await archivePdf({ ...common, title, ...extras }));
    console.log('Generated synthetic example: ' + filename);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
