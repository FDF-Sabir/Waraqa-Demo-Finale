import { useEffect, useState } from 'react';
import { api, download, money, type Invoice } from './api';
import { Modal, type Run } from './App';
export default function DataMaintenance({run}: {run: Run}) {
  const [rows, setRows] = useState<Invoice[]>([]), [selected, setSelected] = useState<Invoice | null>(null), [busy, setBusy] = useState(false);
  async function load() { setRows(await api('/workspace/archives')); }
  useEffect(() => { run(load); }, []);
  return <section className="panel u-pad">
    <h2>Sauvegarde et archives</h2>
    <p>Enregistrez les lignes archivées dans un PDF illustré : synthèse, graphiques, tableaux détaillés et statuts de contrôle.</p>
    <button className="primary" disabled={busy} onClick={async () => {setBusy(true); try {await run(() => download('/workspace/archives/pdf', 'Waraqa-archives.pdf'), 'Archive PDF téléchargée');} finally {setBusy(false);}}}>Sauvegarder les archives en PDF</button>
    <details><summary>Sauvegarde complète et restauration</summary>
      <p>Le PDF sert à consulter les archives. Pour restaurer tout l’espace, la sauvegarde technique contient les comptes, le journal, les conversations et les originaux. Son téléchargement est réservé à l’administrateur.</p>
      <button className="secondary" disabled={busy} onClick={async () => {setBusy(true); try {await run(() => download('/workspace/backup', 'Waraqa-sauvegarde.waraqa.gz'), 'Sauvegarde complète téléchargée');} finally {setBusy(false);}}}>Télécharger la sauvegarde technique</button>
      <p>Dans un terminal du dossier Waraqa, utilisez <code>node scripts/restore.cjs sauvegarde.waraqa.gz nouveau-dossier</code>. La commande refuse un dossier existant, vérifie les empreintes, SQLite et chaque original. Après vérification, arrêtez Waraqa et configurez les chemins de la copie dans backend/.env. La base actuelle reste conservée. Reconnectez-vous : les anciennes sessions sont révoquées.</p>
    </details>
    <h3>Lignes archivées ({rows.length})</h3>
    {!rows.length && <p>Aucune ligne archivée.</p>}
    {rows.map(row => <div className="u-row" key={row.id}><span>#{row.id} · {row.factNum || 'Sans référence'} · {money(row.mTtc)} MAD</span><button className="secondary small" onClick={() => setSelected(row)}>Restaurer</button></div>)}
    {selected && <Modal title="Restaurer la ligne" close={() => setSelected(null)}><p>Restaurer #{selected.id} ? Une nouvelle revue sera nécessaire avant export.</p><button className="primary" disabled={busy} onClick={async () => {setBusy(true);await run(async () => {await api(`/workspace/invoices/${selected.id}/restore`, 'POST');setSelected(null);await load();window.dispatchEvent(new Event('workspace-changed'));}, 'Ligne restaurée, à revoir');setBusy(false);}}>Confirmer la restauration</button></Modal>}
  </section>;
}
