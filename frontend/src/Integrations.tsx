import { useEffect, useRef, useState } from 'react';
import { api, type RecordItem } from './api';
import { type Run } from './App';

const kinds: Record<string, string> = { document: 'Pièce', export: 'Export', snapshot: 'Snapshot', backup: 'Sauvegarde' };
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function Integrations({ run }: { run: Run }) {
  const [status, setStatus] = useState<any>(), [outbox, setOutbox] = useState<RecordItem[]>([]), [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState({ clientId: '', clientSecret: '', json: '' }), [editCreds, setEditCreds] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  async function load() { setStatus(await api('/workspace/integrations')); setOutbox(await api('/workspace/email/outbox')); }
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('drive')) {
      setNotice(q.get('drive') === 'ok' ? { ok: true, text: 'Google Drive connecté. La synchronisation démarre automatiquement.' } : { ok: false, text: q.get('message') || 'Autorisation Google impossible.' });
      history.replaceState(null, '', location.pathname + location.hash);
    }
    run(load);
    return () => clearInterval(poll.current);
  }, []);
  const d = status?.drive;
  useEffect(() => {
    clearInterval(poll.current);
    if (d?.authorized && (d.queue.pending > 0 || d.syncing)) poll.current = setInterval(() => api('/workspace/integrations').then(setStatus).catch(() => undefined), 5000);
  }, [d?.authorized, d?.queue?.pending, d?.syncing]);
  async function action(fn: () => Promise<void>, ok?: string) { if (busy) return; setBusy(true); await run(fn, ok); setBusy(false); }
  async function readJson(file?: File) { if (file) setCreds({ clientId: '', clientSecret: '', json: await file.text() }); }
  const connected = d?.authorized && !d?.needsReauth;
  const showCreds = d && (!d.configured || editCreds);
  return <>
    {notice && <div className={'u-alert ' + (notice.ok ? 'u-success' : 'u-error')} role="status">{notice.text}</div>}
    <section className="u-ai-card">
      <header>
        <span className={'u-dot ' + (connected ? 'ok' : '')} />
        <div>
          <b>{connected ? `Google Drive connecté · ${d.email || 'compte vérifié'}` : d?.needsReauth ? 'Google Drive : reconnexion nécessaire' : d?.configured ? 'Google Drive prêt à être connecté' : 'Google Drive non configuré'}</b>
          <small>
            {connected
              ? (d.autoSync ? 'Pièces, exports, snapshots et sauvegarde quotidienne sont envoyés automatiquement dans le dossier Waraqa.' : 'Synchronisation automatique désactivée : utilisez « Synchroniser maintenant ».')
              : `Compte autorisé : ${d?.allowedEmail || 'tout compte Google'}. Waraqa n’accède qu’aux fichiers qu’il crée (droit drive.file).`}
          </small>
        </div>
      </header>

      {showCreds && <div className="u-form">
        <p><b>Étape 1 — Identifiant OAuth Google</b> (une seule fois). Dans Google Cloud Console → API et services → Identifiants → « ID client OAuth » de type <b>Application Web</b>, ajoutez cette URI de redirection autorisée :</p>
        <code>{d.redirectUri}</code>
        <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(d.redirectUri).then(() => setNotice({ ok: true, text: 'URI copiée.' }))}>Copier l’URI</button>
        <label>Fichier JSON téléchargé depuis Google (client_secret_….json)<input type="file" accept="application/json,.json" onChange={e => readJson(e.target.files?.[0])} /></label>
        {creds.json && <small>Fichier chargé. Cliquez sur Enregistrer.</small>}
        <p>ou saisissez les deux valeurs :</p>
        <label>Client ID<input value={creds.clientId} placeholder="…apps.googleusercontent.com" onChange={e => setCreds({ ...creds, clientId: e.target.value.trim(), json: '' })} /></label>
        <label>Client secret<input type="password" autoComplete="off" value={creds.clientSecret} placeholder="GOCSPX-…" onChange={e => setCreds({ ...creds, clientSecret: e.target.value.trim(), json: '' })} /></label>
        <button className="primary" disabled={busy || !(creds.json || (creds.clientId && creds.clientSecret))} onClick={() => action(async () => {
          const s = await api('/workspace/drive/credentials', 'PUT', creds.json ? { json: creds.json } : { clientId: creds.clientId, clientSecret: creds.clientSecret });
          setStatus(s); setCreds({ clientId: '', clientSecret: '', json: '' }); setEditCreds(false);
        }, 'Identifiants Google enregistrés dans backend/.env')}>Enregistrer les identifiants</button>
      </div>}

      {d?.configured && !editCreds && !connected && <div className="u-form">
        <p><b>Étape 2 — Autoriser le compte</b>. Google s’ouvre dans cet onglet ; connectez-vous avec <b>{d.allowedEmail || 'votre compte'}</b> et acceptez l’accès aux fichiers créés par Waraqa.</p>
        <button className="primary" disabled={busy} onClick={() => action(async () => { const r = await api('/workspace/drive/start', 'POST'); location.assign(r.url); })}>{d.needsReauth ? 'Reconnecter Google Drive' : 'Connecter Google Drive'}</button>
        <button type="button" className="secondary" onClick={() => setEditCreds(true)}>Modifier les identifiants OAuth ({d.clientIdHint})</button>
      </div>}

      {d?.authorized && <div className="u-form">
        <p><b>Synchronisation</b> · dernière : {when(d.lastSyncAt)} · en file : {d.queue.pending} · envoyés : {d.queue.done}{d.queue.error ? ` · en échec : ${d.queue.error}` : ''}{d.syncing ? ' · transfert en cours…' : ''}</p>
        {d.lastError && <div className="u-alert u-error" role="status">{d.lastError}</div>}
        <div className="u-actions">
          {d.folderUrl && <a className="secondary" href={d.folderUrl} target="_blank" rel="noreferrer noopener">Ouvrir le dossier Waraqa dans Drive</a>}
          <button className="primary" disabled={busy} onClick={() => action(async () => { const r = await api('/workspace/drive/sync', 'POST'); setStatus({ ...status, drive: r.status }); if (r.failed) throw Error(`${r.failed} élément(s) non transférés : ${r.status.lastError || 'nouvel essai automatique'}`); }, 'Synchronisation terminée')}>Synchroniser maintenant</button>
          <button className="secondary" disabled={busy} onClick={() => confirm('Déconnecter Google Drive ? Les fichiers déjà envoyés restent dans votre Drive.') && action(async () => { await api('/workspace/drive/disconnect', 'POST'); await load(); }, 'Google Drive déconnecté')}>Déconnecter</button>
        </div>
        {d.recent?.length > 0 && <table className="u-mini-table"><thead><tr><th>Élément</th><th>Type</th><th>État</th><th>Date</th></tr></thead><tbody>
          {d.recent.map((j: any, i: number) => <tr key={i}><td>{j.name}</td><td>{kinds[j.type] || j.type}</td><td title={j.lastError || ''}>{j.state === 'done' ? (j.duplicate ? 'déjà présent' : 'envoyé') : j.state === 'error' ? 'échec' : j.attempts ? `nouvel essai (${j.attempts})` : 'en file'}</td><td>{when(j.at)}</td></tr>)}
        </tbody></table>}
      </div>}
    </section>

    <div className="u-card"><h3>Email — boîte de test locale</h3><p>Aucun destinataire externe n’est contacté. Ces messages permettent de vérifier le parcours local.</p><button className="secondary" disabled={busy} onClick={() => action(async () => { await api('/workspace/email/test-local', 'POST'); await load(); })}>Créer un message de test local</button>{outbox.map(m => <p key={m.id}>{m.data.subject} · {m.data.state} · {m.data.text}</p>)}</div>
    <div className="u-info">Push externe : non configuré (service Web Push/VAPID requis). La cloche interne reste active.</div>
  </>;
}
