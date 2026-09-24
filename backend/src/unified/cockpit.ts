import { FactureEntity } from '../factures/facture.entity';
import { Releve } from './releve';
import { StatutFacture } from '../common/types';

/**
 * Précontrôle métier et plan de travail (plan directeur L1.1 et L8.1) : les mêmes raisons de
 * blocage, les mêmes compteurs et les mêmes identifiants pour l'interface et pour l'assistant.
 * Tout est calculé par le serveur ; l'assistant ne fait que les restituer et proposer les actions.
 */
export interface Blocage {
  code: string; gravite: 'bloquant' | 'attention' | 'info'; message: string;
  action?: { type: 'ouvrir_page'; page: string; libelle: string } | { type: 'valider_lignes'; factureIds: number[]; libelle: string } | { type: 'ouvrir_ligne'; factureId: number; libelle: string };
  ids?: number[];
}
export interface PrecontroleInput {
  month: string;
  company: { name?: string; iff?: string; ice?: string; regime?: number };
  rows: FactureEntity[];
  isBank: (f: FactureEntity) => boolean;
  releve: Releve & { cloture: any };
  documents: { id: string; data: any }[];
  lots: { id: string; data: any }[];
}
const MOTIFS: Record<string, string> = {
  revue: 'Lignes non revues par le comptable', ice: 'ICE fournisseur manquant ou invalide', if: 'IF fournisseur manquant ou invalide', taux: 'Taux non déductible',
  mode_paiement: 'Mode de paiement manquant', date_facture: 'Date de facture manquante', date_paiement: 'Date de paiement manquante', paiement_futur: 'Paiement postérieur à la période',
  delai: 'Délai d’un an dépassé', doublon: 'Doublon non traité', statut: 'Ligne incomplète', numero: 'N° de facture manquant', designation: 'Désignation manquante',
  fournisseur: 'Nom du fournisseur manquant', equilibre: 'HT + TVA différent du TTC', especes_jour: 'Espèces au-delà du plafond journalier', especes_mois: 'Espèces au-delà du plafond mensuel',
  montant: 'Montant nul ou négatif', avance: 'Facture postérieure au paiement',
};
const cap = (ids: number[]) => ids.slice(0, 200);

export function buildPrecontrole(i: PrecontroleInput) {
  const { rows, releve } = i;
  const tax = rows.filter(f => !i.isBank(f));
  const manques: string[] = [];
  if (!String(i.company.name || '').trim()) manques.push('raison sociale');
  if (!/^\d{1,10}$/.test(String(i.company.iff || '').trim())) manques.push('identifiant fiscal (IF)');
  const societe = { raisonSociale: i.company.name || '', iff: i.company.iff || '', ice: i.company.ice || '', regime: i.company.regime === 2 ? 2 : 1, complete: manques.length === 0, manques, iceRenseigne: /^\d{15}$/.test(String(i.company.ice || '').trim()) };
  const nonRevues = tax.filter(f => !f.revueHumaine && f.statut === StatutFacture.VALIDEE && !f.doublonDe && !f.archivee);
  const incompletes = tax.filter(f => f.statut !== StatutFacture.VALIDEE);
  const doublons = tax.filter(f => f.doublonDe);
  const vigilance = tax.filter(f => f.vigilanceRenforcee && !f.revueHumaine);
  const docs = i.documents.map(d => d.data);
  const compte = (pred: (d: any) => boolean) => docs.filter(pred).length;
  const sources = {
    documents: docs.length,
    aReprendre: { a_saisir: compte(d => d.status === 'a_saisir'), erreur: compte(d => d.status === 'erreur'), partiel: compte(d => d.status === 'partiel'), interrompu: compte(d => d.status === 'interrompu'), apercu: compte(d => d.status === 'apercu') },
    references: compte(d => d.status === 'reference'), aClassifier: compte(d => (d.role || 'piece_comptable') === 'a_classifier'), identitesContradictoires: compte(d => Boolean(d.identiteContradictoire)),
    importsEnCours: i.lots.filter(l => l.data.status === 'en_cours').length,
  };
  const ecarteesParMotif: Record<string, number> = {};
  for (const e of releve.ecartees) for (const c of e.controles) if (c.niveau === 'erreur') ecarteesParMotif[c.code] = (ecarteesParMotif[c.code] || 0) + 1;
  const blocages: Blocage[] = [];
  if (releve.cloture) blocages.push({ code: 'periode_cloturee', gravite: 'info', message: `Relevé ${i.month} clôturé le ${String(releve.cloture.createdAt).slice(0, 10)} par ${releve.cloture.author} : aucune modification sans réouverture (administrateur).`, action: { type: 'ouvrir_page', page: 'declaration', libelle: 'Voir le relevé clôturé' } });
  if (!societe.complete) blocages.push({ code: 'societe_incomplete', gravite: 'bloquant', message: `Fiche entreprise incomplète : ${manques.join(' et ')} à renseigner (Réglages → Entreprise, administrateur). Le brouillon reste possible ; le fichier définitif non.`, action: { type: 'ouvrir_page', page: 'reglages', libelle: 'Compléter la fiche entreprise' } });
  if (sources.importsEnCours) blocages.push({ code: 'import_en_cours', gravite: 'attention', message: `${sources.importsEnCours} import(s) en cours : les compteurs évolueront jusqu’à leur fin.`, action: { type: 'ouvrir_page', page: 'import', libelle: 'Suivre les imports' } });
  if (sources.aClassifier) blocages.push({ code: 'documents_a_classifier', gravite: 'attention', message: `${sources.aClassifier} document(s) à classer : conservés sans ligne tant que leur rôle (pièce, modèle, historique…) n’est pas choisi.`, action: { type: 'ouvrir_page', page: 'import', libelle: 'Classer les documents' } });
  if (sources.identitesContradictoires) blocages.push({ code: 'identite_contradictoire', gravite: 'attention', message: `${sources.identitesContradictoires} document(s) portent une raison sociale différente de la société configurée : leur identité n’est jamais recopiée ; vérifier qu’ils appartiennent bien à ce dossier.`, action: { type: 'ouvrir_page', page: 'import', libelle: 'Vérifier les documents' } });
  const aReprendre = Object.values(sources.aReprendre).reduce((a, b) => a + b, 0);
  if (aReprendre) blocages.push({ code: 'pieces_a_reprendre', gravite: 'attention', message: `${aReprendre} pièce(s) à reprendre (${Object.entries(sources.aReprendre).filter(([, n]) => n).map(([k, n]) => `${n} ${k.replace('_', ' ')}`).join(', ')}) : lignes manquantes ou partielles.`, action: { type: 'ouvrir_page', page: 'import', libelle: 'Reprendre les pièces' } });
  if (!tax.length && !releve.cloture) blocages.push({ code: 'aucune_ligne', gravite: 'bloquant', message: `Aucune ligne d’achat sur ${i.month} : importez les pièces du mois.`, action: { type: 'ouvrir_page', page: 'import', libelle: 'Importer des pièces' } });
  if (incompletes.length) blocages.push({ code: 'lignes_incompletes', gravite: 'bloquant', message: `${incompletes.length} ligne(s) incomplète(s) (champ manquant) : à compléter depuis la pièce avant revue.`, ids: cap(incompletes.map(f => f.id)), action: { type: 'ouvrir_page', page: 'releve', libelle: 'Compléter les lignes' } });
  if (doublons.length) blocages.push({ code: 'doublons_non_traites', gravite: 'bloquant', message: `${doublons.length} ligne(s) marquée(s) doublon : décision du comptable requise (ligne distincte confirmée ou archivage).`, ids: cap(doublons.map(f => f.id)), action: { type: 'ouvrir_page', page: 'releve', libelle: 'Traiter les doublons' } });
  if (vigilance.length) blocages.push({ code: 'vigilance_douane', gravite: 'attention', message: `${vigilance.length} pièce(s) douanière(s) à revoir (vigilance renforcée).`, ids: cap(vigilance.map(f => f.id)) });
  if (nonRevues.length && !releve.cloture) blocages.push({ code: 'lignes_non_revues', gravite: 'bloquant', message: `${nonRevues.length} ligne(s) complète(s) attendent la revue du comptable : elles n’entrent dans le relevé définitif qu’une fois marquées revues.`, ids: cap(nonRevues.map(f => f.id)), action: { type: 'valider_lignes', factureIds: cap(nonRevues.map(f => f.id)), libelle: `Marquer ${nonRevues.length} ligne(s) revue(s)` } });
  const autres = Object.entries(ecarteesParMotif).filter(([code]) => !['revue', 'doublon', 'statut'].includes(code));
  if (autres.length) blocages.push({ code: 'controles_dgi', gravite: 'bloquant', message: 'Lignes écartées par les contrôles DGI : ' + autres.map(([code, n]) => `${n} × ${MOTIFS[code] || code}`).join(' ; ') + '.', action: { type: 'ouvrir_page', page: 'declaration', libelle: 'Voir les lignes écartées' } });
  if (releve.reports.length && !releve.cloture) blocages.push({ code: 'reports_possibles', gravite: 'attention', message: `${releve.reports.length} paiement(s) antérieur(s) (≤ 12 mois) déductible(s) sur cette période : à rattacher si souhaité.`, ids: cap(releve.reports.map(r => r.id)), action: { type: 'ouvrir_page', page: 'declaration', libelle: 'Voir les déductions tardives' } });
  const especes = releve.alertes.filter(a => a.code.startsWith('especes'));
  if (especes.length) blocages.push({ code: 'alertes_especes', gravite: 'attention', message: `${especes.length} alerte(s) espèces (plafonds art. 106-II CGI) : à vérifier par le comptable.`, ids: cap([...new Set(especes.map(a => a.id))]) });
  const bloquants = blocages.filter(b => b.gravite === 'bloquant');
  return {
    mois: i.month, calculeLe: new Date().toISOString(), societe,
    periode: { cloture: releve.cloture ? { le: releve.cloture.createdAt, par: releve.cloture.author, lignes: releve.cloture.ids?.length } : null, lignes: tax.length, bancaires: rows.length - tax.length, revues: tax.filter(f => f.revueHumaine).length, nonRevues: nonRevues.length, incompletes: incompletes.length, doublons: doublons.length, vigilance: vigilance.length },
    sources,
    releve: { retenues: releve.lignes.length, ecartees: releve.ecartees.length, ecarteesParMotif, motifs: Object.fromEntries(Object.keys(ecarteesParMotif).map(k => [k, MOTIFS[k] || k])), alertes: releve.alertes.length, reportsPossibles: releve.reports.length, tva: releve.totaux.tva, ht: releve.totaux.mHt, ttc: releve.totaux.mTtc },
    pret: {
      brouillon: tax.length > 0,
      definitif: societe.complete && releve.lignes.length > 0 && !bloquants.some(b => ['lignes_non_revues', 'lignes_incompletes', 'doublons_non_traites', 'controles_dgi'].includes(b.code)),
      cloture: societe.complete && releve.lignes.length > 0 && !releve.cloture && bloquants.length === 0,
    },
    blocages,
    resume: bloquants.length ? `${bloquants.length} point(s) bloquant(s), ${blocages.length - bloquants.length} à surveiller.` : releve.cloture ? 'Période clôturée.' : `Aucun blocage : ${releve.lignes.length} ligne(s) prêtes, TVA déductible ${releve.totaux.tva.toFixed(2)} MAD.`,
  };
}

export interface EtapePlan { code: string; libelle: string; nombre: number; ids?: number[]; documentIds?: string[]; page: string; invite?: string; etat: 'a_faire' | 'fait' | 'attention' | 'bloque' }

/** Entonnoir de travail : À classer → À compléter → À contrôler → Prêt pour revue → Relevé → Clôture. */
export function buildPlan(i: PrecontroleInput) {
  const p = buildPrecontrole(i);
  const tax = i.rows.filter(f => !i.isBank(f));
  const docs = i.documents;
  const aClasser = docs.filter(d => (d.data.role || 'piece_comptable') === 'a_classifier');
  const aReprendre = docs.filter(d => ['a_saisir', 'erreur', 'partiel', 'interrompu', 'apercu'].includes(d.data.status));
  const incompletes = tax.filter(f => f.statut !== StatutFacture.VALIDEE);
  const aControler = tax.filter(f => f.doublonDe || (f.vigilanceRenforcee && !f.revueHumaine));
  const pretes = tax.filter(f => !f.revueHumaine && f.statut === StatutFacture.VALIDEE && !f.doublonDe);
  const m = i.month;
  const etapes: EtapePlan[] = [
    { code: 'a_classer', libelle: 'À classer', nombre: aClasser.length, documentIds: aClasser.map(d => d.id).slice(0, 200), page: 'import', etat: aClasser.length ? 'attention' : 'fait',
      invite: aClasser.length ? `Pour ${m} : liste les documents à classer (outil pieces, rôle a_classifier), lis leur index (lire_classeur) et propose pour chacun le rôle adapté avec ses indices ; ne crée aucune ligne sans ma décision.` : undefined },
    { code: 'a_completer', libelle: 'À compléter', nombre: incompletes.length + aReprendre.length, ids: incompletes.map(f => f.id).slice(0, 200), documentIds: aReprendre.map(d => d.id).slice(0, 200), page: 'releve', etat: incompletes.length + aReprendre.length ? 'a_faire' : 'fait',
      invite: incompletes.length + aReprendre.length ? `Pour ${m} : complète les ${incompletes.length} ligne(s) incomplète(s) depuis leurs pièces (lire_piece) en ne corrigeant que ce que la pièce prouve, relis les ${aReprendre.length} pièce(s) à reprendre, puis rends compte ligne par ligne.` : undefined },
    { code: 'a_controler', libelle: 'À contrôler', nombre: aControler.length, ids: aControler.map(f => f.id).slice(0, 200), page: 'releve', etat: aControler.length ? 'attention' : 'fait',
      invite: aControler.length ? `Pour ${m} : explique chaque doublon possible (comparer_doublons) et chaque pièce douanière en vigilance ; propose la décision à prendre sans rien supprimer.` : undefined },
    { code: 'pret_revue', libelle: 'Prêt pour revue', nombre: pretes.length, ids: pretes.map(f => f.id).slice(0, 200), page: 'releve', etat: pretes.length ? 'a_faire' : 'fait',
      invite: pretes.length ? `Pour ${m} : contrôle les ${pretes.length} ligne(s) complètes non revues (anomalies, cohérence pièce/ligne) et propose-moi le bouton pour marquer revues celles qui sont conformes.` : undefined },
    { code: 'releve', libelle: 'Relevé de déduction', nombre: p.releve.retenues, page: 'declaration', etat: p.pret.definitif ? 'fait' : p.releve.retenues ? 'a_faire' : 'bloque',
      invite: `Pour ${m} : produis le relevé de déduction (precontroler_releve puis releve_deduction), explique chaque ligne écartée par son motif, puis livre le fichier XML SIMPL et l’Excel modèle DGI${p.pret.definitif ? '' : ' en brouillon'}.` },
    { code: 'cloture', libelle: 'Clôture', nombre: p.periode.cloture ? 1 : 0, page: 'declaration', etat: p.periode.cloture ? 'fait' : p.pret.cloture ? 'a_faire' : 'bloque',
      invite: p.pret.cloture ? `Pour ${m} : vérifie une dernière fois le relevé et propose la clôture de la période (administrateur).` : undefined },
  ];
  return { mois: m, calculeLe: p.calculeLe, etapes, blocages: p.blocages, pret: p.pret, resume: p.resume, prochaineEtape: etapes.find(e => e.etat !== 'fait') || null };
}
