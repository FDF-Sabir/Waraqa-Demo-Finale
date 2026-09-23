import { readFileSync } from 'fs';
import { join } from 'path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { FactureEntity } from '../factures/facture.entity';
import { IF_ICE_CONVENTION_DOUANE, SousType, StatutFacture } from '../common/types';

/**
 * Relevé de déduction TVA (DGI, modèle ADC082F-15I, article 112 du CGI).
 *
 * - Rattachement : période fiscale saisie (fiscalMonth), sinon mois du paiement (régime de
 *   l'encaissement, 1) ou de la facture (régime des débits, 2).
 * - Contrôles bloquants : une ligne en erreur est écartée du relevé officiel et listée à part.
 * - Sorties : XML EDI « DeclarationReleveDeduction » (dépôt SIMPL-TVA) et classeur Excel au
 *   modèle officiel (Tableau5 + mappage XML conservés, l'export XML d'Excel reste possible).
 * Aucun montant n'est recalculé ici : HT et TVA viennent de common/calculs.ts (arrondis au centime).
 */

export type Regime = 1 | 2;
export interface ReleveHeader { raisonSociale: string; identifiantFiscal: string; annee: number; periode: number; regime: Regime }
export interface Controle { id: number; niveau: 'erreur' | 'alerte'; code: string; message: string }
export interface LigneReleve {
  id: number; ord: number; factNum: string; designation: string; mHt: number; tva: number; mTtc: number;
  iff: string; libFrss: string; iceFrs: string; taux: number; idPaie: number; datePaie: string; dateFac: string;
  fiscalMonth?: string; revueHumaine: boolean;
}
export interface Releve {
  month: string; regime: Regime; scope: 'reviewed' | 'all';
  lignes: LigneReleve[];
  ecartees: { ligne: Partial<LigneReleve> & { id: number }; controles: Controle[] }[];
  alertes: Controle[];
  reports: { id: number; factNum?: string; libFrss?: string; mTtc?: number; tva?: number; moisOrigine: string; controles: Controle[] }[];
  totaux: { lignes: number; mHt: number; tva: number; mTtc: number; parTaux: { taux: number; lignes: number; mHt: number; tva: number; mTtc: number }[] };
}

export const TAUX_DEDUCTIBLES = [0.07, 0.1, 0.14, 0.2];
const cents = (n?: number | null) => Math.round((n || 0) * 100);
const money = (c: number) => c / 100;
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function isBank(f: Pick<FactureEntity, 'sousType' | 'designation'>) {
  return [SousType.RELEVE_BANCAIRE, SousType.AVIS_DEBIT_VIREMENT].includes(f.sousType) && f.designation !== 'COMMISSION';
}
export function isCustoms(f: Pick<FactureEntity, 'iff' | 'iceFrs' | 'sousType'>) {
  return (clean(f.iff) === IF_ICE_CONVENTION_DOUANE && clean(f.iceFrs) === IF_ICE_CONVENTION_DOUANE)
    || [SousType.DECLARATION_DOUANIERE, SousType.QUITTANCE_DOUANE].includes(f.sousType);
}
/** Mois naturel de rattachement selon le régime (sans tenir compte d'une période fiscale saisie). */
export function naturalMonth(f: Pick<FactureEntity, 'datePaie' | 'dateFac'>, regime: Regime) {
  const d = regime === 1 ? f.datePaie : f.dateFac || f.datePaie;
  return d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null;
}
export function declarationMonth(f: Pick<FactureEntity, 'datePaie' | 'dateFac' | 'fiscalMonth'>, regime: Regime) {
  return f.fiscalMonth || naturalMonth(f, regime);
}
/** Écart en mois entre deux périodes AAAA-MM (b - a). */
export function monthGap(a: string, b: string) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}
function lastDay(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Contrôles DGI d'une ligne pour la période déclarée. */
export function controlerLigne(f: FactureEntity, month: string, regime: Regime): Controle[] {
  const out: Controle[] = [];
  const add = (niveau: Controle['niveau'], code: string, message: string) => out.push({ id: f.id, niveau, code, message });
  const douane = isCustoms(f);
  if (!clean(f.factNum)) add('erreur', 'numero', 'N° de facture (FACT_NUM) manquant.');
  if (!clean(f.designation)) add('erreur', 'designation', 'Désignation manquante.');
  if (!clean(f.libFrss)) add('erreur', 'fournisseur', 'Nom du fournisseur (LIB_FRSS) manquant.');
  if (!douane && !/^\d{1,10}$/.test(clean(f.iff))) add('erreur', 'if', clean(f.iff) ? 'IF fournisseur invalide (chiffres uniquement).' : 'IF fournisseur manquant.');
  if (!douane && !/^\d{15}$/.test(clean(f.iceFrs))) add('erreur', 'ice', clean(f.iceFrs) ? `ICE invalide : 15 chiffres attendus (${clean(f.iceFrs).length} saisis).` : 'ICE fournisseur manquant.');
  if (!TAUX_DEDUCTIBLES.some(t => Math.abs(t - (f.taux ?? -1)) < 1e-9)) add('erreur', 'taux', (f.taux ?? 0) === 0 ? 'Taux 0 % : aucune TVA à déduire.' : `Taux ${f.taux} non déductible (7, 10, 14 ou 20 %).`);
  if (!Number.isInteger(f.idPaie) || f.idPaie! < 1 || f.idPaie! > 7) add('erreur', 'mode_paiement', 'Mode de paiement (ID_PAIE 1 à 7) manquant.');
  if (!f.dateFac) add('erreur', 'date_facture', 'Date de facture manquante.');
  if (regime === 1 && !f.datePaie) add('erreur', 'date_paiement', 'Date de paiement manquante (régime de l’encaissement).');
  if (regime === 1 && f.datePaie && f.datePaie > lastDay(month)) add('erreur', 'paiement_futur', `Paiement du ${f.datePaie} postérieur à la période ${month}.`);
  const origin = naturalMonth(f, regime);
  if (origin && monthGap(origin, month) > 12) add('erreur', 'delai', `Délai d’un an dépassé (paiement ${origin}) : déduction prescrite (art. 101-3° CGI).`);
  if (cents(f.mTtc) <= 0) add('alerte', 'montant', 'Montant nul ou négatif (avoir) : vérifier le traitement.');
  if (f.doublonDe) add('erreur', 'doublon', `Doublon de la ligne #${f.doublonDe}.`);
  if (f.statut && f.statut !== StatutFacture.VALIDEE && !out.some(c => c.niveau === 'erreur')) add('erreur', 'statut', 'Ligne incomplète ou en attente.');
  if (f.dateFac && f.datePaie && f.dateFac > f.datePaie) add('alerte', 'avance', 'Facture postérieure au paiement (acompte ?) : vérifier.');
  if (cents(f.mHt) + cents(f.tva) !== cents(f.mTtc)) add('erreur', 'equilibre', 'HT + TVA différent du TTC.');
  return out;
}

/** Espèces : au-delà de 5 000 DH par jour et 50 000 DH par mois et par fournisseur (art. 106-II CGI). */
export function controlerEspeces(rows: FactureEntity[]): Controle[] {
  const out: Controle[] = [];
  const key = (f: FactureEntity) => clean(f.iceFrs) || clean(f.iff) || clean(f.libFrss).toUpperCase();
  const cash = rows.filter(f => f.idPaie === 1 && f.datePaie);
  const group = (k: (f: FactureEntity) => string) => {
    const m = new Map<string, FactureEntity[]>();
    for (const f of cash) m.set(k(f), [...(m.get(k(f)) || []), f]);
    return m;
  };
  for (const [, list] of group(f => key(f) + '|' + f.datePaie)) {
    const total = list.reduce((n, f) => n + cents(f.mTtc), 0);
    if (total > 500000) for (const f of list) out.push({ id: f.id, niveau: 'alerte', code: 'especes_jour', message: `Espèces : ${money(total).toFixed(2)} DH le ${f.datePaie} chez ce fournisseur (plafond 5 000 DH/jour, art. 106-II CGI).` });
  }
  for (const [, list] of group(f => key(f) + '|' + f.datePaie!.slice(0, 7))) {
    const total = list.reduce((n, f) => n + cents(f.mTtc), 0);
    if (total > 5000000) for (const f of list) out.push({ id: f.id, niveau: 'alerte', code: 'especes_mois', message: `Espèces : ${money(total).toFixed(2)} DH sur le mois chez ce fournisseur (plafond 50 000 DH/mois, art. 106-II CGI).` });
  }
  return out;
}

function ligne(f: FactureEntity, ord: number): LigneReleve {
  return {
    id: f.id, ord, factNum: clean(f.factNum), designation: clean(f.designation), mHt: f.mHt || 0, tva: f.tva || 0, mTtc: f.mTtc || 0,
    iff: clean(f.iff), libFrss: clean(f.libFrss), iceFrs: clean(f.iceFrs), taux: f.taux || 0, idPaie: f.idPaie || 0,
    datePaie: f.datePaie || '', dateFac: f.dateFac || '', fiscalMonth: f.fiscalMonth || undefined, revueHumaine: Boolean(f.revueHumaine),
  };
}

/** Construit le relevé d'une période à partir de toutes les lignes non archivées. */
export function construireReleve(all: FactureEntity[], month: string, regime: Regime, scope: 'reviewed' | 'all' = 'reviewed', examples = false): Releve {
  const fiscal = all.filter(f => !isBank(f) && !f.archivee && (examples || !f.demonstration));
  const periode = fiscal.filter(f => declarationMonth(f, regime) === month);
  const cash = controlerEspeces(fiscal.filter(f => declarationMonth(f, regime) === month));
  const lignes: LigneReleve[] = [], ecartees: Releve['ecartees'] = [], alertes: Controle[] = [...cash];
  const sorted = [...periode].sort((a, b) => (a.datePaie || a.dateFac || '').localeCompare(b.datePaie || b.dateFac || '') || a.id - b.id);
  for (const f of sorted) {
    const controles = controlerLigne(f, month, regime);
    if (scope === 'reviewed' && !f.revueHumaine) controles.push({ id: f.id, niveau: 'erreur', code: 'revue', message: 'Ligne non revue par le comptable.' });
    const erreurs = controles.filter(c => c.niveau === 'erreur');
    if (erreurs.length) ecartees.push({ ligne: ligne(f, 0), controles });
    else { lignes.push(ligne(f, lignes.length + 1)); alertes.push(...controles); }
  }
  const reports = fiscal
    .filter(f => !f.fiscalMonth && !f.doublonDe)
    .map(f => ({ f, origin: naturalMonth(f, regime) }))
    .filter(x => x.origin && monthGap(x.origin, month) >= 1 && monthGap(x.origin, month) <= 12)
    .map(({ f, origin }) => ({ id: f.id, factNum: f.factNum, libFrss: f.libFrss, mTtc: f.mTtc, tva: f.tva, moisOrigine: origin!, controles: controlerLigne(f, month, regime) }));
  const byRate = new Map<number, { taux: number; lignes: number; mHt: number; tva: number; mTtc: number }>();
  for (const l of lignes) {
    const r = byRate.get(l.taux) || { taux: l.taux, lignes: 0, mHt: 0, tva: 0, mTtc: 0 };
    r.lignes++; r.mHt += cents(l.mHt); r.tva += cents(l.tva); r.mTtc += cents(l.mTtc);
    byRate.set(l.taux, r);
  }
  const sum = (k: 'mHt' | 'tva' | 'mTtc') => money(lignes.reduce((n, l) => n + cents(l[k]), 0));
  return {
    month, regime, scope, lignes, ecartees, alertes, reports,
    totaux: {
      lignes: lignes.length, mHt: sum('mHt'), tva: sum('tva'), mTtc: sum('mTtc'),
      parTaux: [...byRate.values()].sort((a, b) => b.taux - a.taux).map(r => ({ ...r, mHt: money(r.mHt), tva: money(r.tva), mTtc: money(r.mTtc) })),
    },
  };
}

const xml = (s: unknown) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const num = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
/** Taux tel qu'exporté par le mappage XML du modèle Excel (0,2 pour 20 %). */
const rate = (n: number) => String(Math.round(n * 10000) / 10000);

/** Fichier EDI « DeclarationReleveDeduction » (même structure que l'export XML du modèle Excel DGI). */
export function releveXml(h: ReleveHeader, lignes: LigneReleve[]) {
  const rd = lignes.map(l =>
    `<rd><ord>${l.ord}</ord><num>${xml(l.factNum)}</num><des>${xml(l.designation)}</des><mht>${num(l.mHt)}</mht><tva>${num(l.tva)}</tva><ttc>${num(l.mTtc)}</ttc>` +
    `<refF><if>${xml(l.iff)}</if><nom>${xml(l.libFrss)}</nom><ice>${xml(l.iceFrs)}</ice></refF><tx>${rate(l.taux)}</tx><mp><id>${l.idPaie}</id></mp>` +
    `<dpai>${xml(l.datePaie)}</dpai><dfac>${xml(l.dateFac)}</dfac></rd>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<DeclarationReleveDeduction><identifiantFiscal>${xml(h.identifiantFiscal)}</identifiantFiscal><annee>${h.annee}</annee><periode>${h.periode}</periode><regime>${h.regime}</regime><releveDeductions>\n${rd}\n</releveDeductions></DeclarationReleveDeduction>\n`;
}

/** Numéro de série Excel (système 1900) d'une date ISO, sans décalage de fuseau. */
export function excelDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000 + 25569;
}
let template: Buffer | undefined;
function modele() {
  return (template ??= readFileSync(join(__dirname, '..', 'assets', 'releve-deduction-modele.xlsx')));
}

/** Classeur au modèle officiel : en-tête, Tableau5 (formules HT/TVA), ligne Total et mappage XML. */
export function releveXlsx(h: ReleveHeader, lignes: LigneReleve[]) {
  if (!lignes.length) throw new Error('Relevé vide.');
  const files = unzipSync(new Uint8Array(modele()));
  const first = 9, total = first + lignes.length;
  const s = (ref: string, style: number, value: string) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const n = (ref: string, style: number, value: number | string) => `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  const rows = lignes.map((l, i) => {
    const r = first + i;
    return `<row r="${r}" spans="1:13" ht="18.75" customHeight="1">` +
      n('A' + r, 15, l.ord) + s('B' + r, 7, l.factNum) + s('C' + r, 10, l.designation) +
      `<c r="D${r}" s="9"><f>ROUND(Tableau5[[#This Row],[M_TTC]]/(1+Tableau5[[#This Row],[TAUX]]),2)</f><v>${num(l.mHt)}</v></c>` +
      `<c r="E${r}" s="9"><f>Tableau5[[#This Row],[M_TTC]]-Tableau5[[#This Row],[M_HT]]</f><v>${num(l.tva)}</v></c>` +
      n('F' + r, 9, num(l.mTtc)) + (/^\d+$/.test(l.iff) ? n('G' + r, 4, l.iff) : s('G' + r, 4, l.iff)) + s('H' + r, 6, l.libFrss) + s('I' + r, 6, l.iceFrs) +
      n('J' + r, 5, rate(l.taux)) + n('K' + r, 17, l.idPaie) +
      (l.datePaie ? n('L' + r, 18, excelDate(l.datePaie)) : '') + (l.dateFac ? n('M' + r, 18, excelDate(l.dateFac)) : '') + '</row>';
  }).join('');
  const sum = (k: 'mHt' | 'tva' | 'mTtc') => num(lignes.reduce((a, l) => a + cents(l[k]), 0) / 100);
  const totalRow = `<row r="${total}" spans="1:13">${s('A' + total, 15, 'Total')}` +
    `<c r="D${total}" s="3"><f>SUM(Tableau5[M_HT])</f><v>${sum('mHt')}</v></c>` +
    `<c r="E${total}" s="3"><f>SUBTOTAL(109,Tableau5[TVA])</f><v>${sum('tva')}</v></c>` +
    `<c r="F${total}" s="3"><f>SUBTOTAL(109,Tableau5[M_TTC])</f><v>${sum('mTtc')}</v></c></row>`;
  const fill = (name: string, map: Record<string, string>) => {
    let t = strFromU8(files[name]);
    for (const [k, v] of Object.entries(map)) t = t.split(k).join(v);
    files[name] = strToU8(t);
  };
  fill('xl/worksheets/sheet1.xml', {
    __RAISON__: xml(h.raisonSociale), __IF__: /^\d+$/.test(h.identifiantFiscal) ? h.identifiantFiscal : '0', __ANNEE__: String(h.annee),
    __PERIODE__: String(h.periode), __REGIME__: String(h.regime), __DIMENSION__: `A1:M${total}`, __LIGNES__: rows + totalRow,
  });
  fill('xl/tables/table1.xml', { __FIN_TABLE__: String(total), __FIN_DONNEES__: String(total - 1) });
  fill('xl/workbook.xml', { __FIN_TABLE__: String(total) });
  return Buffer.from(zipSync(files, { level: 6 }));
}
