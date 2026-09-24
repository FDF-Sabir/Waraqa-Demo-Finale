import { FactureEntity } from '../factures/facture.entity';
import { SEUIL_CONFIANCE_OCR_STANDARD, StatutFacture } from '../common/types';
import { createsLines } from './document-role';

/**
 * Qualité d'extraction (plan directeur §3.3 et §9.9) : mesurer plutôt que supposer. Les erreurs sont
 * normalisées par cause (pas par occurrence brute), la confiance IA est distribuée par seuil, et
 * chaque ligne reçoit une fiabilité déterministe pour prioriser la revue humaine sur les cas douteux.
 */
export interface QualiteInput { month?: string; documents: { id: string; data: any }[]; rows: FactureEntity[]; isBank: (f: FactureEntity) => boolean }

export const normaliserErreur = (e: string) => String(e).replace(/^Ligne \d+:\s*/, '').replace(/#\d+/g, '#n').trim().slice(0, 120);

/** Fiabilité d'une ligne : complète, sans doublon ni vigilance en attente, issue d'un fichier structuré / d'une saisie ou d'une lecture IA confiante. */
export function fiabilite(f: FactureEntity, doc?: any): { fiable: boolean; raisons: string[] } {
  const raisons: string[] = [];
  if (f.statut !== StatutFacture.VALIDEE) raisons.push('incomplète');
  if (f.doublonDe) raisons.push('doublon possible');
  if (f.vigilanceRenforcee && !f.revueHumaine) raisons.push('vigilance douane');
  if (doc?.mode === 'ia_live') {
    if (typeof doc.confidence !== 'number') raisons.push('confiance IA inconnue');
    else if (doc.confidence < SEUIL_CONFIANCE_OCR_STANDARD) raisons.push(`confiance IA ${Math.round(doc.confidence * 100)} % < ${Math.round(SEUIL_CONFIANCE_OCR_STANDARD * 100)} %`);
  }
  if (!f.documentId && !f.demonstration) raisons.push('sans pièce source');
  return { fiable: raisons.length === 0, raisons };
}

export function buildQualite(i: QualiteInput) {
  const docs = i.documents.map(d => ({ id: d.id, ...d.data })).filter(d => createsLines(d.role || 'piece_comptable'));
  const inMonth = (d: any) => !i.month || String(d.createdAt || '').startsWith(i.month) || (d.invoiceIds || []).some((id: number) => i.rows.some(r => r.id === id));
  const scope = docs.filter(inMonth);
  const parMode: Record<string, number> = {}, parStatut: Record<string, number> = {};
  for (const d of scope) { parMode[d.mode || 'inconnu'] = (parMode[d.mode || 'inconnu'] || 0) + 1; parStatut[d.status] = (parStatut[d.status] || 0) + 1; }
  const ia = scope.filter(d => d.mode === 'ia_live' && typeof d.confidence === 'number');
  const conf = ia.map(d => d.confidence as number);
  const distribution = { faible: conf.filter(c => c < 0.6).length, moyenne: conf.filter(c => c >= 0.6 && c < SEUIL_CONFIANCE_OCR_STANDARD).length, haute: conf.filter(c => c >= SEUIL_CONFIANCE_OCR_STANDARD).length };
  const erreurs: Record<string, number> = {};
  for (const d of scope) for (const e of d.errors || []) { const k = normaliserErreur(e); erreurs[k] = (erreurs[k] || 0) + 1; }
  const topErreurs = Object.entries(erreurs).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([message, occurrences]) => ({ message, occurrences }));
  const docById = new Map(docs.map(d => [d.id, d]));
  const tax = i.rows.filter(f => !i.isBank(f) && !f.archivee);
  const lignes = tax.map(f => ({ id: f.id, ...fiabilite(f, f.documentId ? docById.get(f.documentId) : undefined), revue: f.revueHumaine }));
  const champsManquants: Record<string, number> = {};
  for (const f of tax) for (const c of f.champsManquants || []) champsManquants[c] = (champsManquants[c] || 0) + 1;
  const fiables = lignes.filter(l => l.fiable && !l.revue).map(l => l.id);
  const aExaminer = lignes.filter(l => !l.fiable && !l.revue).map(l => ({ id: l.id, raisons: l.raisons }));
  return {
    mois: i.month || null, calculeLe: new Date().toISOString(), seuilConfiance: SEUIL_CONFIANCE_OCR_STANDARD,
    documents: { total: scope.length, parMode, parStatut, aReprendre: scope.filter(d => ['a_saisir', 'erreur', 'partiel', 'interrompu'].includes(d.status)).map(d => ({ id: d.id, nom: d.name, statut: d.status, erreurs: (d.errors || []).length })).slice(0, 200) },
    confianceIA: { documents: ia.length, moyenne: conf.length ? Math.round((conf.reduce((s, c) => s + c, 0) / conf.length) * 100) / 100 : null, minimum: conf.length ? Math.min(...conf) : null, distribution, sousSeuil: ia.filter(d => d.confidence < SEUIL_CONFIANCE_OCR_STANDARD).map(d => ({ id: d.id, nom: d.name, confiance: d.confidence, lignes: (d.invoiceIds || []).length })).slice(0, 200) },
    erreurs: { occurrences: Object.values(erreurs).reduce((a, b) => a + b, 0), causes: topErreurs, note: 'Occurrences de messages normalisés, pas un nombre de pièces distinctes.' },
    lignes: { total: tax.length, revues: lignes.filter(l => l.revue).length, fiablesNonRevues: fiables.length, aExaminer: aExaminer.length, champsManquants, idsFiables: fiables.slice(0, 200), aExaminerDetail: aExaminer.slice(0, 200) },
    conseil: aExaminer.length ? `Prioriser la revue des ${aExaminer.length} ligne(s) à examiner ; les ${fiables.length} ligne(s) fiables non revues peuvent être proposées en validation groupée après contrôle des pièces.` : fiables.length ? `${fiables.length} ligne(s) fiables attendent la revue.` : 'Aucune ligne en attente de revue.',
  };
}
