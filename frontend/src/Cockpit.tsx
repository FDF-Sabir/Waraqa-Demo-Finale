import { useEffect, useState } from "react";
import { api } from "./api";
import { Modal, Status, type Page, type Run } from "./App";

/**
 * Cockpit comptable (plan directeur L1.1 / L8.1) : les mêmes blocages, compteurs, identifiants et
 * invites que l'assistant, calculés par le serveur. Chaque étape ouvre l'écran concerné ou confie
 * le travail à l'IA avec une demande déjà rédigée.
 */
export const ROLE_SHORT: Record<string, string> = {
  piece_comptable: "Pièce comptable", paiement: "Paiement / banque", modele: "Modèle", historique: "Historique",
  referentiel: "Référentiel", justificatif_annexe: "Justificatif annexe", evaluation: "Vérité terrain", a_classifier: "À classer",
};
export const ROLE_HELP: Record<string, string> = {
  piece_comptable: "Crée des lignes du relevé (facture, note de frais, douane).",
  paiement: "Crée des lignes bancaires à rapprocher.",
  modele: "Structure et présentation seulement : aucune ligne.",
  historique: "Autre période : consultation et comparaison, aucune ligne.",
  referentiel: "Fournisseurs, plan de comptes, listes : aucune ligne.",
  justificatif_annexe: "BL, BC, devis, proforma : conservé, aucune déduction.",
  evaluation: "Jeu d’évaluation : jamais dans les données métier.",
  a_classifier: "Conservé sans ligne tant que le rôle n’est pas choisi.",
};
export const LINE_ROLES = ["piece_comptable", "paiement"];

export function RoleBadge({ role }: { role?: string }) {
  const r = role || "piece_comptable";
  return <Status tone={LINE_ROLES.includes(r) ? "green" : r === "a_classifier" ? "amber" : "blue"}>{ROLE_SHORT[r] || r}</Status>;
}
export function RoleSelect({ value, onChange, disabled, allowAuto, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; allowAuto?: boolean; label?: string }) {
  return (
    <select aria-label={label || "Rôle du document"} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} title={ROLE_HELP[value] || "Détection automatique par le serveur (chemin, structure, périodes, identité)"}>
      {allowAuto && <option value="">Rôle détecté automatiquement</option>}
      {Object.entries(ROLE_SHORT).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
    </select>
  );
}

const TONE: Record<string, string> = { bloquant: "amber", attention: "blue", info: "green" };
export function Blocages({ items, go, run, done, title }: { items: any[]; go: (p: Page) => void; run: Run; done?: () => Promise<void> | void; title?: string }) {
  const [confirm, setConfirm] = useState<any>(null);
  if (!items?.length) return null;
  return (
    <section className="panel u-pad">
      <h2>{title || "Ce qui bloque ou demande attention"} ({items.length})</h2>
      {items.map((b) => (
        <div className={"u-blocage " + b.gravite} key={b.code}>
          <span>
            <b>{b.gravite === "bloquant" ? "Bloquant" : b.gravite === "attention" ? "À surveiller" : "Information"}</b>
            <p>{b.message}</p>
            {b.ids?.length > 0 && <small className="u-muted">Lignes : {b.ids.slice(0, 15).map((id: number) => "#" + id).join(", ")}{b.ids.length > 15 ? ` … (${b.ids.length})` : ""}</small>}
          </span>
          {b.action?.type === "ouvrir_page" && <button className="secondary small" onClick={() => go(b.action.page)}>{b.action.libelle}</button>}
          {b.action?.type === "valider_lignes" && <button className="primary small" onClick={() => setConfirm(b.action)}>{b.action.libelle}</button>}
        </div>
      ))}
      {confirm && (
        <Modal title="Marquer ces lignes comme revues ?" close={() => setConfirm(null)}>
          <p>{confirm.factureIds.length} ligne(s) complètes et conformes : {confirm.factureIds.slice(0, 20).map((id: number) => "#" + id).join(", ")}{confirm.factureIds.length > 20 ? " …" : ""}.</p>
          <p>Vous attestez avoir contrôlé les pièces correspondantes. Chaque ligne est validée par le serveur avec ses contrôles habituels et tracée au journal.</p>
          <div className="u-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>Annuler</button>
            <button className="primary" onClick={() => run(async () => {
              const failed: string[] = [];
              for (const id of confirm.factureIds) await api(`/factures/${id}/valider`, "POST").catch((e) => failed.push(`#${id} : ${e.message}`));
              setConfirm(null);
              await done?.();
              window.dispatchEvent(new Event("workspace-changed"));
              if (failed.length) throw new Error(`${confirm.factureIds.length - failed.length}/${confirm.factureIds.length} ligne(s) validée(s). Refus : ${failed.slice(0, 5).join(" ; ")}`);
            }, "Lignes marquées revues")}>Confirmer</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

const STEP_TONE: Record<string, string> = { fait: "green", a_faire: "blue", attention: "amber", bloque: "amber" };
const STEP_LABEL: Record<string, string> = { fait: "fait", a_faire: "à faire", attention: "attention", bloque: "bloqué" };
export function WorkPlan({ month, go, ask, run, refreshKey }: { month: string; go: (p: Page) => void; ask: (text: string) => void; run: Run; refreshKey: unknown }) {
  const [plan, setPlan] = useState<any>(null);
  const load = async () => setPlan(await api(`/workspace/plan-travail?month=${month}`));
  useEffect(() => { load().catch(() => setPlan(null)); }, [month, refreshKey]);
  if (!plan) return <p className="u-muted">Plan de travail indisponible pour l’instant.</p>;
  return (
    <>
      <div className="u-row">
        <h2>Plan de travail · {month}</h2>
        <small className="u-muted">{plan.resume}</small>
      </div>
      <div className="u-funnel">
        {plan.etapes.map((e: any) => (
          <div className={"u-step " + e.etat} key={e.code}>
            <span>{e.libelle}</span>
            <strong>{e.nombre}</strong>
            {e.code === "pret_revue" && e.nombre > 0 && <small className="u-muted">{e.fiables?.length || 0} fiable(s) · {e.aExaminer?.length || 0} à examiner</small>}
            <Status tone={STEP_TONE[e.etat]}>{STEP_LABEL[e.etat]}</Status>
            <div className="u-actions">
              <button className="secondary small" onClick={() => go(e.page)}>Ouvrir</button>
              {e.invite && <button className="primary small" onClick={() => ask(e.invite)}>Confier à l’IA</button>}
            </div>
          </div>
        ))}
      </div>
      {plan.prochaineEtape && <p className="u-info">Prochaine étape : <b>{plan.prochaineEtape.libelle}</b> ({plan.prochaineEtape.nombre}). {plan.prochaineEtape.invite ? "Le bouton « Confier à l’IA » prépare la demande ; vous restez décisionnaire pour les revues, doublons et clôtures." : ""}</p>}
      <Blocages items={plan.blocages} go={go} run={run} done={load} />
    </>
  );
}

export function Capabilities({ close }: { close: () => void }) {
  const [cap, setCap] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/workspace/capacites").then(setCap).catch((e) => setError(e.message)); }, []);
  return (
    <Modal title="Ce que Waraqa sait faire" close={close}>
      {error && <p className="u-error">{error}</p>}
      {!cap && !error && <p>Chargement…</p>}
      {cap && (
        <div className="u-capacites">
          <p className="u-info">{cap.resume}</p>
          <details open><summary>Lecture et contrôle ({cap.lecture.length})</summary><ul>{cap.lecture.map((t: any) => <li key={t.nom}><b>{t.nom}</b> — {t.description}</li>)}</ul></details>
          <details><summary>Actions exécutées par l’agent ({cap.actions.length})</summary><ul>{cap.actions.map((t: any) => <li key={t.nom}><b>{t.nom}</b> — {t.description}</li>)}</ul></details>
          <details><summary>Décisions qui vous restent</summary><ul>{cap.reserveAuComptable.map((t: string) => <li key={t}>{t}</li>)}</ul></details>
          <details><summary>Fichiers ({cap.formatsFichiers.length}) et rôles documentaires ({cap.rolesDocumentaires.length})</summary>
            <ul>{cap.formatsFichiers.map((f: any) => <li key={f.code}>{f.libelle}{f.administrateur ? " (administrateur)" : ""}</li>)}</ul>
            <ul>{cap.rolesDocumentaires.map((r: any) => <li key={r.code}><b>{ROLE_SHORT[r.code]}</b> — {r.libelle}</li>)}</ul>
          </details>
          <details><summary>Entrées et accès</summary>
            <ul>{cap.entrees.map((t: string) => <li key={t}>{t}</li>)}</ul>
            <p>IA connectée : {cap.acces.iaConnectee ? "oui" : "non"} · Administrateur : {cap.acces.administrateur ? "oui" : "non"}{cap.acces.googleDrive ? ` · Google Drive : ${cap.acces.googleDrive.etat}` : ""}</p>
          </details>
          <details><summary>Limites</summary><ul>{cap.limites.map((t: string) => <li key={t}>{t}</li>)}</ul></details>
        </div>
      )}
    </Modal>
  );
}

export function Missions({ conversationId, refreshKey }: { conversationId: string; refreshKey: unknown }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { if (!conversationId) { setItems([]); return; } api(`/workspace/missions?conversationId=${conversationId}&limit=5`).then(setItems).catch(() => setItems([])); }, [conversationId, refreshKey]);
  if (!items.length) return null;
  const LABEL: Record<string, string> = { en_cours: "en cours", terminee: "terminée", interrompue: "interrompue", echouee: "échouée" };
  return (
    <details className="u-sources u-missions">
      <summary>Missions de cette discussion ({items.length})</summary>
      <ul>
        {items.map((m) => (
          <li key={m.id}>
            <b>{LABEL[m.status] || m.status}</b> · {new Date(m.startedAt).toLocaleString("fr-FR")} · {m.question.slice(0, 80)}{m.question.length > 80 ? "…" : ""}
            <small> — {m.outils?.length || 0} outil(s), {m.executees?.length || 0} action(s), {m.livrables?.length || 0} fichier(s){m.costUsd ? `, ≈ ${m.costUsd.toFixed(3)} $` : ""}{m.erreur ? ` — ${m.erreur}` : ""}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}
