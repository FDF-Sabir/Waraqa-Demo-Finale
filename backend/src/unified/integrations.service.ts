import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { WorkspaceRecord } from './record.entity';
import { UtilisateurEntity } from '../utilisateurs/utilisateur.entity';
import { JournalService } from '../journal/journal.service';
import { protect, reveal } from '../auth/totp';
import { allowedGoogleEmail, localBaseUrl, onlineProfile, profile } from '../common/profile';
import { writeEnv } from '../ia/ia-config';
import { backupData } from './backup';
import { archivePdf } from './archive-pdf';

const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const now = () => new Date().toISOString();
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';
/** Lecture des dossiers remis par le comptable (import par lien) : demandée seulement à la première utilisation. */
const READONLY = 'https://www.googleapis.com/auth/drive.readonly';
const IMPORTABLE = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls', '.csv', '.json'];
const GOOGLE_EXPORT: Record<string, [string, string]> = {
  'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  'application/vnd.google-apps.document': ['application/pdf', '.pdf'],
};
export interface DriveInputFile { id: string; name: string; path: string; mimeType: string; size: number }

/** Identifiant de dossier ou de fichier depuis un lien Google Drive (ou l'identifiant seul). */
export function driveIdFromLink(link: string) {
  const s = link.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) || /\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s) || /^([A-Za-z0-9_-]{10,})$/.exec(s);
  return m ? m[1] : null;
}
const CLIENT_ID = /^[0-9]{6,30}-[a-z0-9]{10,60}\.apps\.googleusercontent\.com$/;
const CLIENT_SECRET = /^[A-Za-z0-9_-]{10,100}$/;
const MAX_ATTEMPTS = 8;

export type DriveJobType = 'document' | 'export' | 'snapshot' | 'backup';
export interface DriveJob {
  type: DriveJobType;
  ref: string;
  name: string;
  month?: string;
  state: 'pending' | 'done' | 'error';
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  remoteId?: string;
  duplicate?: boolean;
  createdAt: string;
  doneAt?: string;
}

/** Erreur Google porteuse du statut HTTP, pour décider : rafraîchir, recréer, réessayer ou redemander l'accord. */
export class DriveError extends Error {
  constructor(message: string, readonly status: number, readonly reauth = false) { super(message); }
}

/**
 * Google Drive — connecteur OAuth 2.0 (PKCE, portée drive.file) et synchronisation automatique.
 *
 * - Le compte est verrouillé par GOOGLE_ALLOWED_EMAIL (e-mail vérifié par Google, jeton id_token).
 * - L'arborescence Waraqa/{Pièces,Exports,Snapshots,Sauvegardes} est créée par l'application :
 *   la portée drive.file ne donne accès qu'aux fichiers créés par Waraqa, rien d'autre du Drive.
 * - File persistante (SQLite) : chaque pièce, export, snapshot et la sauvegarde quotidienne devient
 *   une tâche idempotente, reprise après redémarrage ou coupure réseau, avec délai croissant.
 * - Dédoublonnage côté Drive par empreinte SHA-256 (appProperties.waraqaHash).
 */
@Injectable()
export class IntegrationsService implements OnModuleInit, OnModuleDestroy {
  private syncing = false;
  private timer?: ReturnType<typeof setInterval>;
  private kickTimer?: ReturnType<typeof setTimeout>;
  private readonly storage = resolve(process.env.WARAQA_FILES_PATH || 'data/files');
  private readonly outboxDir = resolve(process.env.WARAQA_FILES_PATH || 'data/files', '..', 'drive-outbox');
  /** Remplaçable dans les tests : aucun appel réseau réel n'est possible depuis la suite. */
  static fetchImpl: typeof fetch | null = null;

  constructor(
    @InjectRepository(WorkspaceRecord) private records: Repository<WorkspaceRecord>,
    @InjectRepository(UtilisateurEntity) private users: Repository<UtilisateurEntity>,
    private journal: JournalService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.runQueue().catch(() => undefined), 60_000);
    this.timer.unref();
    setTimeout(() => this.runQueue().catch(() => undefined), 5_000).unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.kickTimer) clearTimeout(this.kickTimer);
  }

  // ─── Configuration ──────────────────────────────────────────────────────────
  private key() { if (!process.env.WARAQA_JWT_SECRET) throw new BadRequestException('Secret serveur requis.'); return process.env.WARAQA_JWT_SECRET; }
  private redirectUri() { return (process.env.GOOGLE_REDIRECT_URI || '').trim() || `${localBaseUrl()}/api/workspace/drive/callback`; }
  private configured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
  private async admin(u: any) { if ((await this.users.findOneBy({ id: u.sub }))?.role !== 'admin') throw new ForbiddenException('Administrateur requis.'); }
  private async settings() {
    const s = (await this.records.findOneBy({ id: 'settings' }))?.data || {};
    return {
      autoSync: s.integrations?.driveAutoSync !== false,
      dailyBackup: s.integrations?.driveDailyBackup !== false,
      keep: Number(s.integrations?.driveBackupKeep) || 14,
      timeZone: s.integrations?.timeZone || 'Africa/Casablanca',
      company: s.company || {},
    };
  }
  private async state() { return (await this.records.findOneBy({ id: 'drive-state' }))?.data || {}; }
  private async setState(patch: any) { const data = { ...(await this.state()), ...patch }; await this.records.save({ id: 'drive-state', kind: 'integration_state', data }); return data; }

  /** Enregistre l'identifiant OAuth Google (champs séparés ou fichier JSON téléchargé depuis Google Cloud). */
  async setCredentials(u: any, body: any) {
    await this.admin(u);
    let id = String(body?.clientId || '').trim(), secret = String(body?.clientSecret || '').trim();
    if (body?.json) {
      let parsed: any;
      try { parsed = JSON.parse(String(body.json)); } catch { throw new BadRequestException('Fichier JSON Google illisible.'); }
      const c = parsed.web || parsed.installed || parsed;
      id = String(c.client_id || '').trim(); secret = String(c.client_secret || '').trim();
      const uris: string[] = Array.isArray(c.redirect_uris) ? c.redirect_uris : [];
      if (parsed.web && !uris.includes(this.redirectUri()))
        throw new BadRequestException(`URI de redirection absente du client Google : ajoutez exactement ${this.redirectUri()} dans Google Cloud, puis retéléchargez le JSON.`);
    }
    if (!CLIENT_ID.test(id)) throw new BadRequestException('Client ID Google invalide (format attendu : ….apps.googleusercontent.com).');
    if (!CLIENT_SECRET.test(secret)) throw new BadRequestException('Client secret Google invalide.');
    writeEnv('GOOGLE_CLIENT_ID', id);
    writeEnv('GOOGLE_CLIENT_SECRET', secret);
    await this.journal.ecrire({ action: 'drive_identifiants_enregistres', utilisateurId: u.sub, saisiPar: u.nom, details: { clientId: id.slice(0, 12) + '…' } });
    return this.status(u);
  }

  /** Résumé Drive sans détail sensible, lisible par tout utilisateur connecté (écran de mise en service). */
  async summary() {
    const token = await this.records.findOneBy({ id: 'drive-token' });
    const state = await this.state();
    return { configured: this.configured(), authorized: Boolean(token), needsReauth: Boolean(state.needsReauth), email: token?.data.email || null, canRead: await this.canRead() };
  }

  async status(u: any) {
    await this.admin(u);
    const token = await this.records.findOneBy({ id: 'drive-token' });
    const state = await this.state(), s = await this.settings();
    const jobs = (await this.records.findBy({ kind: 'drive_job' })).map(r => r.data as DriveJob);
    const count = (k: string) => jobs.filter(j => j.state === k).length;
    const folders = (await this.records.findOneBy({ id: 'drive-folders' }))?.data;
    return {
      profile: profile(),
      drive: {
        configured: this.configured(),
        authorized: Boolean(token),
        email: token?.data.email || null,
        allowedEmail: allowedGoogleEmail() || null,
        redirectUri: this.redirectUri(),
        clientIdHint: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.slice(0, 12) + '…' : null,
        lastVerified: token?.data.updatedAt || null,
        folderUrl: folders?.root ? `https://drive.google.com/drive/folders/${folders.root}` : null,
        autoSync: s.autoSync,
        dailyBackup: s.dailyBackup,
        syncing: this.syncing,
        needsReauth: Boolean(state.needsReauth),
        lastSyncAt: state.lastSyncAt || null,
        lastError: state.lastError || null,
        queue: { pending: count('pending'), error: count('error'), done: count('done') },
        recent: jobs.sort((a, b) => (b.doneAt || b.createdAt).localeCompare(a.doneAt || a.createdAt)).slice(0, 12)
          .map(j => ({ type: j.type, name: j.name, state: j.state, attempts: j.attempts, lastError: j.lastError || null, at: j.doneAt || j.createdAt, duplicate: Boolean(j.duplicate) })),
      },
      email: { mode: 'local', externalEnabled: false },
      push: { externalEnabled: false, reason: 'Aucun serveur Web Push/VAPID configuré.' },
    };
  }

  // ─── OAuth ──────────────────────────────────────────────────────────────────
  async start(u: any, opts: { readonly?: boolean } = {}) {
    await this.admin(u);
    if (!this.configured()) throw new BadRequestException('Enregistrez d’abord le Client ID et le Client secret Google (Réglages → Intégrations).');
    const state = randomBytes(32).toString('hex'), verifier = randomBytes(32).toString('base64url');
    const readonly = Boolean(opts.readonly) || await this.canRead();
    await this.records.save({ id: 'oauth-' + hash(state), kind: 'oauth_state', data: { userId: u.sub, sessionVersion: (await this.users.findOneBy({ id: u.sub }))!.sessionVersion, expires: Date.now() + 600000, verifier: protect(verifier, this.key()), returnTo: opts.readonly ? 'import' : 'reglages' } });
    const query = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: this.redirectUri(), response_type: 'code', scope: SCOPES + (readonly ? ' ' + READONLY : ''),
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    });
    if (allowedGoogleEmail()) query.set('login_hint', allowedGoogleEmail());
    return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + query };
  }

  /** Lit l'e-mail du jeton id_token reçu directement de Google en TLS (pas de tiers : signature non requise, OIDC §3.1.3.7). */
  private emailFromIdToken(idToken?: string): { email: string; verified: boolean } | null {
    if (!idToken || idToken.split('.').length !== 3) return null;
    try {
      const p = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
      if (!['accounts.google.com', 'https://accounts.google.com'].includes(p.iss) || p.aud !== process.env.GOOGLE_CLIENT_ID) return null;
      return { email: String(p.email || '').toLowerCase(), verified: p.email_verified === true || p.email_verified === 'true' };
    } catch { return null; }
  }

  async callback(state: string, code: string) {
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || typeof code !== 'string' || !code) throw new BadRequestException('Autorisation refusée ou état invalide.');
    const id = 'oauth-' + hash(state), r = await this.records.findOneBy({ id });
    if (!r || r.data.expires < Date.now()) throw new BadRequestException('Autorisation expirée. Recommencez depuis Réglages.');
    const owner = await this.users.findOneBy({ id: r.data.userId });
    if (owner?.role !== 'admin' || owner.sessionVersion !== r.data.sessionVersion) throw new ForbiddenException('Session ayant demandé l’autorisation révoquée.');
    if (!(await this.records.delete(id)).affected) throw new BadRequestException('Autorisation déjà utilisée.');
    const tokens = await (await this.call('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: this.redirectUri(), grant_type: 'authorization_code', code_verifier: reveal(r.data.verifier, this.key()) }) })).json() as any;
    if (!tokens.access_token || !tokens.refresh_token) throw new BadGatewayException('Autorisation Google incomplète ; redemandez le consentement.');
    if (!String(tokens.scope || '').includes('drive.file')) {
      await this.revoke(tokens.refresh_token);
      throw new BadRequestException('Accès Drive non accordé : cochez l’autorisation « fichiers créés par cette application » sur l’écran Google.');
    }
    const identity = this.emailFromIdToken(tokens.id_token);
    const allowed = allowedGoogleEmail();
    if (allowed && (!identity || !identity.verified || identity.email !== allowed)) {
      await this.revoke(tokens.refresh_token);
      await this.journal.ecrire({ action: 'drive_compte_refuse', utilisateurId: owner.id, saisiPar: owner.nom, details: { compte: identity?.email || 'inconnu' } });
      throw new ForbiddenException(`Compte Google refusé : seul ${allowed} est autorisé pour Waraqa.`);
    }
    const { id_token: _ignored, ...kept } = tokens;
    await this.records.save({ id: 'drive-token', kind: 'integration_secret', data: { encrypted: protect(JSON.stringify(kept), this.key()), expires: Date.now() + (tokens.expires_in || 3600) * 1000, updatedAt: now(), email: identity?.email || null } });
    await this.setState({ needsReauth: false, lastError: null });
    await this.journal.ecrire({ action: 'drive_autorise', utilisateurId: owner.id, saisiPar: owner.nom, details: { compte: identity?.email || null } });
    await this.backfill();
    this.kick();
    return { ok: true, email: identity?.email || null, returnTo: r.data.returnTo === 'import' ? 'import' : 'reglages', canRead: String(tokens.scope || '').includes('drive.readonly') };
  }

  // ─── Import depuis un dossier Drive (lien collé par le comptable) ───────────
  private async tokens() {
    const record = await this.records.findOneBy({ id: 'drive-token' });
    if (!record) return null;
    try { return JSON.parse(reveal(record.data.encrypted, this.key())); } catch { return null; }
  }
  /** Lecture des dossiers autorisée (portée drive.readonly accordée). */
  async canRead() {
    const t = await this.tokens();
    return Boolean(t && /(^|\s)https:\/\/www\.googleapis\.com\/auth\/drive(\.readonly)?(\s|$)/.test(String(t.scope || '')));
  }
  /** Liste récursive des pièces importables d'un dossier (ou d'un fichier) Drive. */
  async readFolder(link: string): Promise<{ name: string; files: DriveInputFile[]; skipped: { name: string; reason: string }[] }> {
    const id = driveIdFromLink(link);
    if (!id) throw new BadRequestException('Lien Google Drive non reconnu : copiez le lien du dossier (drive.google.com/drive/folders/…).');
    if (!(await this.records.findOneBy({ id: 'drive-token' }))) throw new BadRequestException('Google Drive non connecté : un administrateur doit le connecter dans Réglages → Intégrations.');
    if (!(await this.canRead())) throw new ConflictException({ statusCode: 409, code: 'drive_lecture_requise', message: 'Autorisez Waraqa à lire les dossiers Drive que vous lui indiquez (une seule fois), puis relancez l’import.' });
    const fields = 'id,name,mimeType,size,shortcutDetails(targetId,targetMimeType)';
    const get = async (fileId: string) => {
      try { return await (await this.api(`${DRIVE}/files/${encodeURIComponent(fileId)}?` + new URLSearchParams({ fields, supportsAllDrives: 'true' }))).json() as any; }
      catch (e) {
        if (e instanceof DriveError && [403, 404].includes(e.status)) throw new BadRequestException('Dossier introuvable ou non partagé avec ' + (allowedGoogleEmail() || 'le compte Google connecté') + '.');
        throw e;
      }
    };
    const root = await get(id);
    const files: DriveInputFile[] = [], skipped: { name: string; reason: string }[] = [];
    const accept = (f: any, path: string) => {
      const mime = f.shortcutDetails?.targetMimeType || f.mimeType;
      const fileId = f.shortcutDetails?.targetId || f.id;
      const ext = GOOGLE_EXPORT[mime]?.[1] || (/\.[^./]+$/.exec(f.name)?.[0] || '').toLowerCase();
      if (!IMPORTABLE.includes(ext)) return skipped.push({ name: path, reason: 'Format non pris en charge' });
      if (Number(f.size || 0) > 20 * 1024 * 1024) return skipped.push({ name: path, reason: 'Fichier supérieur à 20 Mo' });
      files.push({ id: fileId, name: f.name, path: GOOGLE_EXPORT[mime] && !path.toLowerCase().endsWith(ext) ? path + ext : path, mimeType: mime, size: Number(f.size || 0) });
    };
    if (root.mimeType !== FOLDER) { accept(root, root.name); return { name: root.name, files, skipped }; }
    const queue: { id: string; path: string; depth: number }[] = [{ id: root.id, path: '', depth: 0 }];
    while (queue.length) {
      const dir = queue.shift()!;
      let pageToken = '';
      do {
        const page = await (await this.api(`${DRIVE}/files?` + new URLSearchParams({ q: `'${this.q(dir.id)}' in parents and trashed=false`, fields: `nextPageToken,files(${fields})`, pageSize: '1000', orderBy: 'folder,name', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken } : {}) }))).json() as any;
        for (const f of page.files || []) {
          const path = dir.path + f.name;
          if (f.mimeType === FOLDER) { if (dir.depth < 6) queue.push({ id: f.id, path: path + '/', depth: dir.depth + 1 }); else skipped.push({ name: path, reason: 'Dossier trop profond' }); }
          else accept(f, path);
          if (files.length > 2000) throw new BadRequestException('Dossier trop fourni (2000 pièces maximum) : importez-le en plusieurs fois.');
        }
        pageToken = page.nextPageToken || '';
      } while (pageToken);
    }
    return { name: root.name, files, skipped };
  }
  async download(f: DriveInputFile): Promise<Buffer> {
    const exp = GOOGLE_EXPORT[f.mimeType];
    const url = exp
      ? `${DRIVE}/files/${encodeURIComponent(f.id)}/export?` + new URLSearchParams({ mimeType: exp[0] })
      : `${DRIVE}/files/${encodeURIComponent(f.id)}?` + new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' });
    const buffer = Buffer.from(await (await this.api(url, {}, 300000)).arrayBuffer());
    if (buffer.length > 20 * 1024 * 1024) throw new BadRequestException('Fichier supérieur à 20 Mo.');
    return buffer;
  }

  private async revoke(token?: string) {
    if (!token) return;
    try { await this.fetch()('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token }), signal: AbortSignal.timeout(15000) }); } catch { /* révocation au mieux */ }
  }

  async disconnect(u: any) {
    await this.admin(u);
    const r = await this.records.findOneBy({ id: 'drive-token' });
    if (r) { try { await this.revoke(JSON.parse(reveal(r.data.encrypted, this.key())).refresh_token); } catch { /* jeton illisible : suppression locale quand même */ } await this.records.delete('drive-token'); }
    await this.records.delete('drive-folders');
    await this.setState({ needsReauth: false });
    await this.journal.ecrire({ action: 'drive_deconnecte', utilisateurId: u.sub, saisiPar: u.nom });
    return { ok: true };
  }

  // ─── Appels HTTP Google ─────────────────────────────────────────────────────
  private fetch(): typeof fetch { return IntegrationsService.fetchImpl || fetch; }

  private async call(url: string, init: RequestInit = {}, timeout = 30000) {
    let r: Response;
    try { r = await this.fetch()(url, { ...init, signal: AbortSignal.timeout(timeout) }); }
    catch { throw new DriveError('Google injoignable (réseau ou délai dépassé).', 0); }
    if (r.ok) return r;
    let detail = '';
    try { const body = await r.json() as any; detail = body.error_description || body.error?.message || (typeof body.error === 'string' ? body.error : ''); } catch { /* corps non JSON */ }
    const reauth = /invalid_grant|unauthorized_client|invalid_client/.test(detail) || (url.includes('oauth2.googleapis.com/token') && r.status === 400);
    throw new DriveError(`Google a refusé la requête (${r.status}${detail ? ' : ' + detail : ''}).`, r.status, reauth);
  }

  private async token(force = false) {
    const record = await this.records.findOneBy({ id: 'drive-token' });
    if (!record) throw new DriveError('Google Drive non autorisé.', 401, true);
    let tokens: any;
    try { tokens = JSON.parse(reveal(record.data.encrypted, this.key())); }
    catch { throw new DriveError('Autorisation Drive illisible (secret de session modifié) : reconnectez Google Drive.', 401, true); }
    if (force || record.data.expires < Date.now() + 60000) {
      const r = await this.call('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }) });
      const { id_token: _i, ...fresh } = await r.json() as any;
      tokens = { ...tokens, ...fresh };
      record.data.encrypted = protect(JSON.stringify(tokens), this.key());
      record.data.expires = Date.now() + (fresh.expires_in || 3600) * 1000;
      await this.records.save(record);
    }
    return tokens.access_token as string;
  }

  /** Appel authentifié : un 401 déclenche un seul rafraîchissement du jeton puis un nouvel essai. */
  private async api(url: string, init: RequestInit = {}, timeout = 30000): Promise<Response> {
    const go = async (force: boolean) => this.call(url, { ...init, headers: { ...(init.headers as any), Authorization: 'Bearer ' + await this.token(force) } }, timeout);
    try { return await go(false); }
    catch (e) { if (e instanceof DriveError && e.status === 401 && !e.reauth) return go(true); throw e; }
  }

  // ─── Arborescence ───────────────────────────────────────────────────────────
  private q(v: string) { return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  private async findOrCreateFolder(name: string, key: string, parent?: string): Promise<string> {
    const clauses = [`mimeType='${FOLDER}'`, 'trashed=false', `appProperties has { key='waraqaFolder' and value='${this.q(key)}' }`];
    if (parent) clauses.push(`'${this.q(parent)}' in parents`);
    const found = await (await this.api(`${DRIVE}/files?` + new URLSearchParams({ q: clauses.join(' and '), fields: 'files(id)', spaces: 'drive' }))).json() as any;
    if (found.files?.length) return found.files[0].id;
    const created = await (await this.api(`${DRIVE}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}), appProperties: { waraqaFolder: key } }) })).json() as any;
    if (!created.id) throw new DriveError('Création de dossier Drive non confirmée.', 502);
    return created.id;
  }

  /** Vérifie la racine (une fois par cycle) ; la recrée avec ses sous-dossiers si elle a été supprimée. */
  private async folders(verify: boolean) {
    const rec = await this.records.findOneBy({ id: 'drive-folders' });
    let f = rec?.data;
    if (f?.root && verify) {
      try {
        const meta = await (await this.api(`${DRIVE}/files/${encodeURIComponent(f.root)}?fields=id,trashed`)).json() as any;
        if (meta.trashed) f = null;
      } catch (e) { if (e instanceof DriveError && e.status === 404) f = null; else throw e; }
    }
    if (!f?.root) {
      const root = await this.findOrCreateFolder('Waraqa', 'root');
      f = {
        root,
        pieces: await this.findOrCreateFolder('Pièces', 'pieces', root),
        exports: await this.findOrCreateFolder('Exports', 'exports', root),
        snapshots: await this.findOrCreateFolder('Snapshots', 'snapshots', root),
        backups: await this.findOrCreateFolder('Sauvegardes', 'backups', root),
        months: {},
      };
      await this.records.save({ id: 'drive-folders', kind: 'integration_state', data: f });
    }
    return f;
  }

  private async monthFolder(f: any, section: 'pieces' | 'exports', month: string) {
    const k = `${section}/${month}`;
    if (f.months?.[k]) return f.months[k];
    const id = await this.findOrCreateFolder(month, k, f[section]);
    f.months = { ...(f.months || {}), [k]: id };
    await this.records.save({ id: 'drive-folders', kind: 'integration_state', data: f });
    return id;
  }

  private async uploadFile(folder: string, name: string, buffer: Buffer, props: Record<string, string>, mime = 'application/octet-stream') {
    const contentHash = hash(buffer);
    const existing = await (await this.api(`${DRIVE}/files?` + new URLSearchParams({ q: `trashed=false and '${this.q(folder)}' in parents and appProperties has { key='waraqaHash' and value='${contentHash}' }`, fields: 'files(id)' }))).json() as any;
    if (existing.files?.length) return { id: existing.files[0].id as string, duplicate: true };
    const begin = await this.api(`${UPLOAD}/files?uploadType=resumable&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(buffer.length), 'X-Upload-Content-Type': mime }, body: JSON.stringify({ name, parents: [folder], appProperties: { ...props, waraqaHash: contentHash } }) });
    const location = begin.headers.get('location');
    if (!location || new URL(location).origin !== 'https://www.googleapis.com') throw new DriveError('Session de transfert Google invalide.', 502);
    const result = await (await this.api(location, { method: 'PUT', headers: { 'Content-Type': mime }, body: new Uint8Array(buffer) }, 600000)).json() as any;
    if (!result.id) throw new DriveError('Transfert Drive non confirmé.', 502);
    return { id: result.id as string, duplicate: false };
  }

  // ─── File de synchronisation ────────────────────────────────────────────────
  private jobId(type: DriveJobType, ref: string) { return `drive-job-${type}-${ref}`; }

  private async authorized() { return Boolean(await this.records.findOneBy({ id: 'drive-token' })); }

  /** Ajoute une tâche idempotente (ignorée si Drive n'est pas autorisé ou si la synchro auto est coupée). */
  async enqueue(type: DriveJobType, ref: string, name: string, month?: string, force = false) {
    if (!force && (!(await this.authorized()) || !(await this.settings()).autoSync)) return null;
    const id = this.jobId(type, ref);
    const existing = await this.records.findOneBy({ id });
    if (existing) return existing.data as DriveJob;
    const job: DriveJob = { type, ref, name, month, state: 'pending', attempts: 0, nextAttemptAt: 0, createdAt: now() };
    await this.records.save({ id, kind: 'drive_job', data: job });
    return job;
  }

  /** Export généré : copie dans la boîte d'envoi locale jusqu'au transfert confirmé. */
  async enqueueExport(name: string, buffer: Buffer, month: string) {
    try {
      if (!(await this.authorized()) || !(await this.settings()).autoSync) return;
      const ref = hash(buffer);
      await mkdir(this.outboxDir, { recursive: true });
      await writeFile(resolve(this.outboxDir, ref + '.bin'), buffer, { mode: 0o600 });
      await this.enqueue('export', ref, name, month);
      this.kick();
    } catch { /* la synchronisation ne doit jamais faire échouer un export local */ }
  }

  async enqueueSafe(type: DriveJobType, ref: string, name: string, month?: string) {
    try { if (await this.enqueue(type, ref, name, month)) this.kick(); } catch { /* idem */ }
  }

  /** À la première autorisation : toutes les pièces et snapshots existants, plus une sauvegarde immédiate. */
  async backfill() {
    for (const d of await this.records.findBy({ kind: 'document' }))
      await this.enqueue('document', d.id, d.data.name, String(d.data.createdAt || now()).slice(0, 7), true);
    for (const s of await this.records.findBy({ kind: 'snapshot' }))
      await this.enqueue('snapshot', s.id, `Waraqa-snapshot-${s.data.month}-${s.id.slice(-8)}.pdf`, s.data.month, true);
    await this.enqueue('backup', this.today(await this.settings()), `Waraqa-sauvegarde-${this.today(await this.settings())}.waraqa.gz`, undefined, true);
  }

  private today(s: { timeZone: string }, date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: s.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const p = (k: string) => parts.find(x => x.type === k)!.value;
    return `${p('year')}-${p('month')}-${p('day')}`;
  }

  /** Déclenche un cycle peu après une nouvelle tâche (regroupe les imports multiples). */
  kick(delay = 1500) {
    if (process.env.NODE_ENV === 'test') return;
    if (this.kickTimer) clearTimeout(this.kickTimer);
    this.kickTimer = setTimeout(() => this.runQueue().catch(() => undefined), delay);
    this.kickTimer.unref?.();
  }

  async syncNow(u: any) {
    await this.admin(u);
    if (!(await this.authorized())) throw new BadRequestException('Google Drive non autorisé.');
    for (const r of await this.records.findBy({ kind: 'drive_job' }))
      if (r.data.state !== 'done') { r.data.state = 'pending'; r.data.nextAttemptAt = 0; if (r.data.attempts >= MAX_ATTEMPTS) r.data.attempts = 0; await this.records.save(r); }
    const result = await this.runQueue(true);
    return { ...result, status: (await this.status(u)).drive };
  }

  /** Cycle de synchronisation. Séquentiel, borné, sans jamais lever vers l'appelant planifié. */
  async runQueue(manual = false, limit = 25) {
    if (this.syncing) return { processed: 0, failed: 0, skipped: 'en_cours' };
    if (!(await this.authorized())) return { processed: 0, failed: 0, skipped: 'non_autorise' };
    const s = await this.settings();
    if (!s.autoSync && !manual) return { processed: 0, failed: 0, skipped: 'desactive' };
    if (!manual && (await this.state()).needsReauth) return { processed: 0, failed: 0, skipped: 'reconnexion_requise' };
    this.syncing = true;
    let processed = 0, failed = 0;
    try {
      if (s.dailyBackup) await this.enqueue('backup', this.today(s), `Waraqa-sauvegarde-${this.today(s)}.waraqa.gz`, undefined, true);
      const due = (await this.records.findBy({ kind: 'drive_job' }))
        .filter(r => r.data.state === 'pending' && r.data.nextAttemptAt <= Date.now())
        .sort((a, b) => (a.data.type === 'backup' ? 1 : 0) - (b.data.type === 'backup' ? 1 : 0) || a.data.createdAt.localeCompare(b.data.createdAt))
        .slice(0, limit);
      if (!due.length) { await this.setState({ lastSyncAt: now() }); return { processed, failed }; }
      const f = await this.folders(true);
      for (const r of due) {
        const job = r.data as DriveJob;
        try {
          const res = await this.process(job, f, s);
          Object.assign(job, { state: 'done', remoteId: res.id, duplicate: res.duplicate, doneAt: now(), lastError: undefined });
          processed++;
          await this.journal.ecrire({ action: 'drive_synchronise', lotId: job.type === 'document' ? job.ref : undefined, details: { type: job.type, nom: job.name, remoteId: res.id, doublon: res.duplicate } });
        } catch (e: any) {
          failed++;
          job.attempts++;
          job.lastError = String(e?.message || e).slice(0, 300);
          if (e instanceof DriveError && e.status === 404 && /Pièce|Export/.test(job.lastError)) job.state = 'error';
          else if (job.attempts >= MAX_ATTEMPTS) job.state = 'error';
          job.nextAttemptAt = Date.now() + Math.min(6 * 3600_000, 60_000 * 2 ** job.attempts);
          if (e instanceof DriveError && e.reauth) {
            await this.records.save(r);
            await this.setState({ needsReauth: true, lastError: 'Accès Google expiré ou révoqué : reconnectez Google Drive.' });
            return { processed, failed };
          }
          if (e instanceof DriveError && e.status === 0) { await this.records.save(r); await this.setState({ lastError: job.lastError }); return { processed, failed }; }
        }
        await this.records.save(r);
      }
      await this.setState({ lastSyncAt: now(), lastError: failed ? `${failed} élément(s) en échec, nouvel essai automatique.` : null, needsReauth: false });
      return { processed, failed };
    } catch (e: any) {
      const reauth = e instanceof DriveError && e.reauth;
      await this.setState({ lastError: reauth ? 'Accès Google expiré ou révoqué : reconnectez Google Drive.' : String(e?.message || e).slice(0, 300), ...(reauth ? { needsReauth: true } : {}) });
      return { processed, failed: failed + 1 };
    } finally {
      this.syncing = false;
    }
  }

  private async process(job: DriveJob, f: any, s: Awaited<ReturnType<IntegrationsService['settings']>>) {
    if (job.type === 'document') {
      const doc = await this.records.findOneBy({ id: job.ref });
      if (!doc) throw new DriveError('Pièce supprimée localement.', 404);
      let buffer: Buffer;
      try { buffer = await readFile(resolve(this.storage, doc.id + doc.data.ext)); } catch { throw new DriveError('Pièce originale introuvable sur le disque.', 404); }
      const folder = await this.monthFolder(f, 'pieces', job.month || String(doc.data.createdAt).slice(0, 7));
      return this.uploadFile(folder, doc.data.name, buffer, { waraqaKind: 'document', waraqaId: doc.id });
    }
    if (job.type === 'export') {
      const path = resolve(this.outboxDir, job.ref + '.bin');
      let buffer: Buffer;
      try { buffer = await readFile(path); } catch { throw new DriveError('Export absent de la boîte d’envoi.', 404); }
      const mime = job.name.endsWith('.pdf') ? 'application/pdf' : job.name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
      const res = await this.uploadFile(await this.monthFolder(f, 'exports', job.month || now().slice(0, 7)), job.name, buffer, { waraqaKind: 'export' }, mime);
      await unlink(path).catch(() => undefined);
      return res;
    }
    if (job.type === 'snapshot') {
      const snap = await this.records.findOneBy({ id: job.ref });
      if (!snap) throw new DriveError('Snapshot introuvable.', 404);
      const pdf = await archivePdf({ title: 'Archive du snapshot', reference: snap.id, month: snap.data.month, createdAt: snap.data.createdAt, author: snap.data.author, company: snap.data.company, rows: snap.data.summary.rows, totals: snap.data.summary });
      return this.uploadFile(f.snapshots, job.name, pdf, { waraqaKind: 'snapshot', waraqaId: snap.id }, 'application/pdf');
    }
    const buffer = await backupData(this.records.manager.connection, this.storage);
    const res = await this.uploadFile(f.backups, job.name, buffer, { waraqaKind: 'backup' }, 'application/gzip');
    await this.pruneBackups(f.backups, s.keep);
    return res;
  }

  /** Conserve les N sauvegardes les plus récentes créées par Waraqa ; les plus anciennes vont à la corbeille Drive. */
  private async pruneBackups(folder: string, keep: number) {
    const list = await (await this.api(`${DRIVE}/files?` + new URLSearchParams({ q: `trashed=false and '${this.q(folder)}' in parents and appProperties has { key='waraqaKind' and value='backup' }`, fields: 'files(id,createdTime)', orderBy: 'createdTime desc', pageSize: '200' }))).json() as any;
    for (const old of (list.files || []).slice(keep))
      await this.api(`${DRIVE}/files/${encodeURIComponent(old.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }

  /** Compatibilité : envoi immédiat d'une pièce choisie (ajoutée à la file puis synchronisée). */
  async upload(u: any, doc: any) {
    await this.admin(u);
    if (!(await this.authorized())) throw new BadRequestException('Google Drive non autorisé.');
    await this.enqueue('document', doc.id, doc.data.name, String(doc.data.createdAt || now()).slice(0, 7), true);
    await this.runQueue(true);
    const job = (await this.records.findOneBy({ id: this.jobId('document', doc.id) }))?.data as DriveJob;
    if (job?.state !== 'done') throw new BadGatewayException(job?.lastError || 'Transfert non confirmé ; nouvel essai automatique.');
    return { id: job.remoteId, duplicate: Boolean(job.duplicate) };
  }

  // ─── Email local (inchangé) ─────────────────────────────────────────────────
  async localMail(u: any) { const user = await this.users.findOneBy({ id: u.sub }); if (!user) throw new ForbiddenException(); const id = 'mail-' + randomBytes(12).toString('hex'); await this.records.save({ id, kind: 'mail_outbox', data: { userId: u.sub, to: user.email, subject: 'Diagnostic Waraqa', text: 'Message de contrôle local. Aucun email externe envoyé.', createdAt: now(), state: 'local' } }); await this.journal.ecrire({ action: 'email_test_local', utilisateurId: u.sub, saisiPar: user.nom }); return { id, state: 'local' }; }
  async outbox(u: any) { return (await this.records.findBy({ kind: 'mail_outbox' })).filter(r => r.data.userId === u.sub); }
  get online() { return onlineProfile(); }
}
