import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { resolve } from 'path';

/**
 * Clé Anthropic et tarification — côté serveur uniquement.
 *
 * La clé est lue dans process.env (chargé depuis backend/.env) et peut être
 * remplacée par un administrateur depuis Réglages → Assistant IA : elle est alors
 * écrite dans backend/.env (droits 600) et appliquée sans redémarrage.
 * Elle n'est jamais renvoyée au navigateur : seul un masque « sk-ant-…ABCD » l'est.
 */
export const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

export function envPath() {
  return resolve(process.env.WARAQA_ENV_PATH || resolve(process.cwd(), '.env'));
}

export function apiKey(): string {
  return (process.env.ANTHROPIC_API_KEY || '').trim();
}

export function maskedKey(): string {
  const k = apiKey();
  return k ? `sk-ant-…${k.slice(-4)}` : '';
}

/** Identifiant d'espace de travail, requis seulement pour une clé de portée « Organisation ». */
export function workspaceId(): string {
  return (process.env.ANTHROPIC_WORKSPACE_ID || '').trim();
}

export type EnvName = 'ANTHROPIC_API_KEY' | 'ANTHROPIC_WORKSPACE_ID' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET';

/** Remplace (ou ajoute) une ligne NOM=valeur dans .env sans toucher au reste, puis l'applique. */
export function writeEnv(name: EnvName, value: string) {
  if (/[\r\n]/.test(value)) throw new Error('Valeur multiligne refusée.');
  const path = envPath();
  const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  const next = re.test(content)
    ? content.replace(re, line)
    : (content && !content.endsWith('\n') ? content + '\n' : content) + line + '\n';
  writeFileSync(path, next, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* Windows : droits gérés par le profil utilisateur */ }
  process.env[name] = value;
}

/** Tarifs publics en USD par million de tokens [entrée, sortie] (docs Anthropic, sept. 2026). */
const PRICES: Array<[RegExp, number, number]> = [
  [/fable|mythos/, 10, 50],
  [/opus-5/, 4, 20],
  [/opus/, 5, 25],
  [/sonnet-5/, 2, 10],
  [/sonnet/, 3, 15],
  [/haiku/, 1, 5],
];

export function price(model: string) {
  const m = model.toLowerCase();
  const hit = PRICES.find(([re]) => re.test(m));
  // Modèle inconnu : tarif le plus élevé, pour ne jamais sous-estimer le budget.
  return hit ? { input: hit[1], output: hit[2], known: true } : { input: 10, output: 50, known: false };
}

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Coût estimé : écriture cache ×1,25 et lecture cache ×0,1 du prix d'entrée. */
export function cost(usage: UsageLike, model: string) {
  const p = price(model);
  const input = usage.input_tokens || 0, output = usage.output_tokens || 0;
  const write = usage.cache_creation_input_tokens || 0, read = usage.cache_read_input_tokens || 0;
  const usd = (input * p.input + write * p.input * 1.25 + read * p.input * 0.1 + output * p.output) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export const MODEL_PRESETS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — recommandé (équilibre qualité / coût)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — économique, questions simples' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — analyses complexes, 2× plus cher' },
];
