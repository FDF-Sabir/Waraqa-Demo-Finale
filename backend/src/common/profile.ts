/**
 * Profil d'exécution de Waraqa.
 *
 * - `online` (défaut) : l'application tourne sur le poste mais se comporte comme une
 *   version hébergée — l'IA connectée est active dès qu'une clé est présente dans
 *   backend/.env, et Google Drive est synchronisé automatiquement une fois autorisé.
 * - `local` : comportement historique « démo » (bascule manuelle du mode connecté,
 *   aucun transfert automatique). Utilisé par les tests existants.
 */
export type Profile = 'online' | 'local';

export function profile(): Profile {
  return (process.env.WARAQA_PROFILE || 'online').trim().toLowerCase() === 'local' ? 'local' : 'online';
}

export function onlineProfile(): boolean {
  return profile() === 'online';
}

/** L'ancienne route /api/ocr passe en extraction réelle en profil en ligne ou avec WARAQA_IA_MODE=live. */
export function liveOcrWanted(): boolean {
  return process.env.WARAQA_IA_MODE === 'live' || onlineProfile();
}

/** Adresse locale du serveur, utilisée pour l'URI de retour OAuth par défaut. */
export function localBaseUrl(): string {
  return `http://localhost:${process.env.WARAQA_PORT || 3000}`;
}

/** Compte Google autorisé pour Drive (vide = tout compte accepté). */
export function allowedGoogleEmail(): string {
  return (process.env.GOOGLE_ALLOWED_EMAIL || '').trim().toLowerCase();
}
