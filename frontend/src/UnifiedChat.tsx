import { useEffect, useRef, useState } from "react";
import { api, download, money, token, type RecordItem } from "./api";
import { Icon } from "./Icons";
import { InvoiceTable, Modal, type Page, type Run } from "./App";
import Markdown from "./Markdown";
import { Capabilities, Missions, ROLE_SHORT } from "./Cockpit";

type Attached = { file: File; role: string };
const ATTACH_ROLES = ["", "piece_comptable", "modele", "historique", "referentiel"];
const attachLabel = (r: string) => (r ? ROLE_SHORT[r] : "rôle détecté");

const usd = (n: number) =>
  n < 0.01 && n > 0 ? "< 0,01 $" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " $";

/** Consommation d'une réponse : nouveau format (appels, coût) et ancien (tokens bruts). */
function UsageLine({ usage, cached }: { usage: any; cached?: any }) {
  if (cached) return <small className="u-usage">Réponse réutilisée (données inchangées depuis le {new Date(cached.createdAt).toLocaleString("fr-FR")}) · 0 $</small>;
  if (!usage) return null;
  if (usage.calls !== undefined) {
    const input = (usage.inputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0);
    const ratio = input ? Math.round(((usage.cacheReadTokens || 0) / input) * 100) : 0;
    return <small className="u-usage">≈ {usd(usage.costUsd || 0)} · {usage.calls} appel(s) · {input.toLocaleString("fr-FR")} tokens lus{ratio ? ` dont ${ratio} % en cache` : ""} · {(usage.outputTokens || 0).toLocaleString("fr-FR")} écrits</small>;
  }
  return <small className="u-usage">Consommation : {usage.input_tokens} tokens entrants · {usage.output_tokens} sortants.</small>;
}
const SOURCE_LABELS: Record<string, string> = {
  synthese_mois: "Synthèse", rechercher_lignes: "Lignes", detail_ligne: "Détail", anomalies: "Anomalies",
  top_fournisseurs: "Fournisseurs", rapprochement: "Rapprochement", pieces: "Pièces", journal: "Journal", proposer_action: "Action",
  releve_deduction: "Relevé de déduction", imports: "Imports", designations: "Désignations", notifications: "Notifications",
  snapshots: "Snapshots", precontroler_releve: "Précontrôle", plan_de_travail: "Plan de travail", qualite_extraction: "Qualité d’extraction", lire_piece: "Pièce", lire_classeur: "Classeur", lire_plage: "Plage du classeur", entreprise: "Entreprise",
  corriger_ligne: "Correction", rattacher_periode: "Rattachement", rapprocher: "Rapprochement", creer_snapshot: "Snapshot",
  relire_piece: "Relecture", confirmer_designation: "Désignation", traiter_notification: "Notification",
  importer_dossier_drive: "Import Drive", importer_drive: "Import Drive", capacites: "Capacités", generer_fichier: "Fichier", generer_tableau: "Tableau", generer_rapport: "Rapport", comparer_doublons: "Doublons", comptabiliser_piece: "Comptabilisation", corriger_lignes: "Corrections en masse", calculer: "Calcul", consignes: "Consignes", memoriser_consigne: "Consigne", oublier_consigne: "Consigne", generer_classeur: "Classeur",
};

/** Actions proposées par l'assistant qui modifient les données : confirmation explicite avant exécution. */
const MODIFYING = ["valider_ligne", "valider_lignes", "rattacher_periode", "cloturer_releve", "importer_drive", "creer_snapshot", "confirmer_designation", "traiter_notification", "archiver_ligne", "lever_doublon", "autoriser_drive"];
function describeAction(a: any) {
  const list = (ids: number[]) => ids.slice(0, 12).map((id) => "#" + id).join(", ") + (ids.length > 12 ? ` … (${ids.length} au total)` : "");
  switch (a.type) {
    case "valider_ligne": return `Marquer la ligne #${a.factureId} comme revue (vous confirmez avoir contrôlé la pièce).`;
    case "valider_lignes": return `Marquer ${a.factureIds.length} ligne(s) comme revues : ${list(a.factureIds)}. Vous confirmez avoir contrôlé les pièces.`;
    case "rattacher_periode": return `Déclarer ${a.factureIds.length} paiement(s) antérieur(s) sur le relevé de ${a.mois} : ${list(a.factureIds)}.`;
    case "cloturer_releve": return `Clôturer le relevé de déduction de ${a.mois} : les lignes déclarées restent rattachées à cette période.`;
    case "importer_drive": return `Importer depuis Google Drive (dossier, fichier ou feuille Google Sheets) : ${a.url}`;
    case "creer_snapshot": return `Créer un snapshot figé de ${a.mois} (copié dans Google Drive si connecté).`;
    case "confirmer_designation": return `Confirmer la désignation en attente #${a.designationId}.`;
    case "traiter_notification": return `Marquer la notification #${a.notificationId} comme traitée.`;
    case "archiver_ligne": return `Archiver la ligne #${a.factureId} (restaurable depuis Exports & snapshots).`;
    case "autoriser_drive": return "Ouvrir l’autorisation Google (lecture seule des dossiers que vous indiquez) : vous serez redirigé vers Google puis ramené dans Waraqa.";
    case "lever_doublon": return `Confirmer que la ligne #${a.factureId} est une opération distincte : le marquage « doublon » est levé, votre motif est tracé et la ligne repasse à revoir.`;
    default: return a.libelle;
  }
}
export default function Chat({
  month,
  go,
  mode,
  profile,
  templates,
  draft,
  clearDraft,
  run,
  refresh,
  exportFile,
  openInvoice,
}: {
  month: string;
  go: (p: Page) => void;
  mode: string;
  profile?: string;
  templates: RecordItem[];
  draft: string;
  clearDraft: () => void;
  run: Run;
  refresh: () => Promise<void>;
  exportFile: (f: string) => Promise<void>;
  openInvoice: (id: number) => Promise<void>;
}) {
  const draftKey = 'waraqa-draft-' + token().split('.')[1] + '-' + month;
  const [conversations, setConversations] = useState<RecordItem[]>([]),
    [activeId, setActiveId] = useState(""),
    [text, setText] = useState(() => sessionStorage.getItem(draftKey) || ""),
    [files, setFiles] = useState<Attached[]>([]),
    [showCap, setShowCap] = useState(false),
    [busy, setBusy] = useState(false),
    [rename, setRename] = useState(false),
    [remove, setRemove] = useState(false),
    [convSearch, setConvSearch] = useState(""),
    [steps, setSteps] = useState<string[]>([]),
    [budget, setBudget] = useState<any>(null),
    [confirm, setConfirm] = useState<any>(null);
  const pendingConversation = useRef("");
  const scroll = useRef<HTMLDivElement>(null),
    area = useRef<HTMLTextAreaElement>(null),
    monthRef = useRef(month);
  monthRef.current = month;
  const active = conversations.find((c) => c.id === activeId);
  const sameMonth = active?.data.month === month;
  const messages = sameMonth ? active.data.messages : [];
  async function load() {
    const data = await api<RecordItem[]>("/workspace/conversations");
    setConversations(data);
    setActiveId((prev) =>
      data.some((c) => c.id === prev && c.data.month === monthRef.current)
        ? prev
        : data.find((c) => c.data.month === monthRef.current)?.id || "",
    );
  }
  useEffect(() => {
    setText(sessionStorage.getItem(draftKey) || '');
    run(load);
  }, [month]);
  async function loadBudget() {
    if (mode !== "live") return setBudget(null);
    try { setBudget(await api("/workspace/ai")); } catch { setBudget(null); }
  }
  useEffect(() => { loadBudget(); }, [mode]);
  // Import en cours puis reprise automatique : la discussion se met à jour seule.
  const last = messages[messages.length - 1];
  const waiting = Boolean(sameMonth && (active?.data.pending || (last?.role === "user" && last?.auto)));
  const [pendingLots, setPendingLots] = useState<any[]>([]);
  useEffect(() => {
    if (!waiting) { setPendingLots([]); return; }
    const ids: string[] = active?.data.pending?.lotIds || [];
    const tick = async () => {
      setPendingLots((await Promise.all(ids.map((id) => api(`/workspace/imports/${id}`).catch(() => null)))).filter(Boolean));
      await load().catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => clearInterval(timer);
  }, [waiting, activeId, active?.data.pending?.since]);
  useEffect(() => {
    // Réponse reprise arrivée : écrans et budget rafraîchis (lignes importées, fichiers).
    if (!waiting && last?.role === "assistant" && last?.result?.executees?.length) { refresh(); loadBudget(); }
  }, [waiting, last?.id]);
  // Progression de l'assistant (outils consultés) pendant la réponse.
  useEffect(() => {
    if (!busy || mode !== "live") { setSteps([]); return; }
    const timer = setInterval(async () => {
      if (!pendingConversation.current) return;
      try { const p = await api("/workspace/conversations/" + pendingConversation.current + "/progress"); setSteps(p.steps || []); } catch { /* sans effet */ }
    }, 1200);
    return () => clearInterval(timer);
  }, [busy, mode]);
  useEffect(() => {
    if (draft) {
      setText(draft);
      clearDraft();
      area.current?.focus();
    }
  }, [draft]);
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages?.length, busy]);
  function editDraft(value: string) { setText(value); sessionStorage.setItem(draftKey, value); }
  async function create() {
    const c = await api("/workspace/conversations", "POST", { month });
    setConversations((p) => [c, ...p]);
    setActiveId(c.id);
    return c;
  }
  async function send(retryText?: string, retryIds: string[] = [], noCache = false) {
    const question =
      (retryText || text).trim() ||
      (files.length ? (files.every((f) => f.role && f.role !== "piece_comptable") ? "Analyse ces documents de référence (aucune ligne à créer)." : "Analyse les pièces jointes.") : "");
    if (!question || busy) return;
    setBusy(true);
    const pendingFiles = [...files];
    const sentText = text;
    const ok = await run(async () => {
      let c = active;
      if (!c || c.data.month !== month) c = await create();
      pendingConversation.current = c!.id;
      const documentIds: string[] = [...retryIds];
      const lotIds: string[] = [];
      let note = "";
      for (const { file, role } of pendingFiles) {
        const data = new FormData();
        data.append("file", file);
        const roleQuery = role ? `&role=${role}` : "";
        if (/\.zip$/i.test(file.name)) {
          // Dossier compressé : import en lot en arrière-plan (suivi dans Importer et via l’assistant).
          const lot = await api("/workspace/imports/zip?x=1" + roleQuery, "POST", data);
          lotIds.push(lot.id);
          note += `\n\n[Dossier « ${file.name} » : ${lot.data.total} fichier(s) à traiter${role ? ", rôle imposé : " + ROLE_SHORT[role] : ", rôles détectés automatiquement"}.]`;
          continue;
        }
        // Pièce jointe : conservée en attente ; l'agent la comptabilise seulement si vous le demandez.
        const d = await api("/workspace/documents?reuse=true&staging=true" + roleQuery, "POST", data);
        documentIds.push(d.id);
        if (d.data?.status === "reference") note += `\n\n[« ${file.name} » conservé comme ${ROLE_SHORT[d.data.role] || d.data.role} : aucune ligne créée.]`;
        else if (d.data?.status === "a_comptabiliser") note += `\n\n[« ${file.name} » conservé en attente : dites « comptabilise-la » pour créer les lignes.]`;
      }
      editDraft("");
      setFiles([]);
      const updated = await api(
        "/workspace/conversations/" + c!.id + "/messages",
        "POST",
        { text: question + note, documentIds, ...(lotIds.length ? { lotIds } : {}), ...(noCache ? { noCache: true } : {}) },
      );
      setConversations((p) =>
        p.map((x) => (x.id === updated.id ? updated : x)),
      );
      await refresh();
      await loadBudget();
    });
    if (!ok) {
      editDraft(sentText || question);
      setFiles(pendingFiles);
      await run(load);
    }
    setBusy(false);
    pendingConversation.current = "";
  }
  const [done, setDone] = useState<Record<string, boolean>>({});
  function downloadAction(a: any) {
    const m = a.mois || month, scope = a.scope || "reviewed", f = a.format;
    if (a.type === "telecharger_piece") return download(`/workspace/documents/${a.documentId}/file`, a.nom || "piece");
    if (f.startsWith("releve-")) return download(`/workspace/releve/export?month=${m}&format=${f.slice(7)}&scope=${scope}`, `Releve-deduction-${m}${scope === "all" ? "-BROUILLON" : ""}.${f.slice(7)}`);
    if (f === "snapshot-pdf") return download(`/workspace/snapshots/${a.snapshotId}/pdf`, `Waraqa-snapshot-${m}.pdf`);
    if (f === "archives-pdf") return download("/workspace/archives/pdf", "Waraqa-archives.pdf");
    if (f === "sauvegarde") return download("/workspace/backup", "Waraqa-sauvegarde.waraqa.gz");
    const ext = f === "xlsx" ? "xlsx" : f === "pdf" ? "pdf" : f === "json" ? "json" : "csv";
    return download(`/workspace/export?month=${m}&format=${f}&scope=${scope}`, `Waraqa-${f}-${m}${scope === "all" ? "-BROUILLON" : ""}.${ext}`);
  }
  async function executeAction(a: any) {
    switch (a.type) {
      case "valider_ligne": await api(`/factures/${a.factureId}/valider`, "POST"); break;
      case "valider_lignes": {
        const failed: string[] = [];
        for (const id of a.factureIds) await api(`/factures/${id}/valider`, "POST").catch((e) => failed.push(`#${id} : ${e.message}`));
        if (failed.length) throw new Error(`${a.factureIds.length - failed.length}/${a.factureIds.length} ligne(s) validée(s). Refus : ${failed.slice(0, 5).join(" ; ")}`);
        break;
      }
      case "rattacher_periode": await api("/workspace/releve/attach", "POST", { ids: a.factureIds, month: a.mois }); break;
      case "cloturer_releve": await api("/workspace/releve/close", "POST", { month: a.mois }); break;
      case "importer_drive":
        try { await api("/workspace/imports/drive", "POST", { url: a.url }); }
        catch (e: any) {
          if (e.code !== "drive_lecture_requise") throw e;
          const r = await api("/workspace/drive/start", "POST", { readonly: true });
          location.href = r.url;
          return;
        }
        break;
      case "creer_snapshot": await api("/workspace/snapshots", "POST", { month: a.mois }); break;
      case "confirmer_designation": await api(`/designations/${a.designationId}/confirmer`, "POST"); break;
      case "traiter_notification": await api(`/notifications/${a.notificationId}/marquer-traitee`, "POST"); break;
      case "archiver_ligne": await api(`/workspace/invoices/${a.factureId}/archive`, "POST"); break;
      case "lever_doublon": await api(`/workspace/invoices/${a.factureId}/doublon/lever`, "POST", { motif: a.justification || "Ligne distincte confirmée par le comptable" }); break;
      case "autoriser_drive": { const r = await api("/workspace/drive/start", "POST", { readonly: true }); location.href = r.url; return; }
    }
    await refresh();
    window.dispatchEvent(new Event("workspace-changed"));
  }
  const select = (id: string) => {
    setActiveId(id);
    setText("");
    setFiles([]);
  };
  return (
    <div className="u-chat-page">
      <div className="u-chat-heading">
        <div>
          <span className="eyebrow">VOTRE ASSISTANT COMPTABLE</span>
          <h1>Discussion avec Waraqa</h1>
        </div>
        <span className="u-chat-status">
          {budget && (
            <span className={"u-budget " + (budget.usage.costUsd >= budget.budgetUsd * 0.8 ? "warn" : "")} title="Consommation estimée du mois / budget fixé dans Réglages → Assistant IA">
              {usd(budget.usage.costUsd)} / {budget.budgetUsd} $ ce mois
            </span>
          )}
          <span className={"u-ai-label " + (mode === "live" ? "live" : profile === "online" ? "off" : "")}>
            {mode === "live" ? "IA connectée" : profile === "online" ? "IA non connectée" : "Démo · analyses locales"}
          </span>
        </span>
      </div>
      <div className="u-chat-layout">
        <aside className="u-chat-list">
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(create)}
          >
            <Icon name="plus" size={16} />
            Nouvelle discussion
          </button>
          <input
            placeholder="Rechercher une discussion…"
            aria-label="Rechercher une discussion"
            value={convSearch}
            onChange={(e) => setConvSearch(e.target.value)}
          />
          <small>DISCUSSIONS · {month}</small>
          {conversations
            .filter(
              (c) =>
                c.data.month === month &&
                c.data.title.toLowerCase().includes(convSearch.toLowerCase()),
            )
            .map((c) => (
              <button
                className={
                  "u-conversation " + (c.id === activeId ? "active" : "")
                }
                key={c.id}
                disabled={busy}
                onClick={() => select(c.id)}
              >
                <Icon name="chatbubble" size={16} />
                <span>
                  <b>{c.data.title}</b>
                  <small>
                    {c.data.messages.length} messages ·{" "}
                    {new Date(c.updatedAt).toLocaleDateString("fr-FR")}
                  </small>
                </span>
              </button>
            ))}
          <div className="u-chat-tip">
            <b>Un espace par mois</b>
            <p>
              La période sélectionnée définit les données analysées. Vos
              discussions restent enregistrées.
            </p>
          </div>
        </aside>
        <section className="panel u-chat-panel">
          <div className="u-chat-panel-head">
            <span>
              <b>
                {sameMonth ? active.data.title : "Votre prochaine discussion"}
              </b>
              <small>{month}</small>
            </span>
            <div className="u-actions">
              <button className="secondary small" onClick={() => setShowCap(true)} title="Catalogue réel des capacités de l’application et de l’assistant">
                Que sait faire Waraqa ?
              </button>
              {sameMonth && (
                <>
                  <button
                    className="secondary small"
                    disabled={busy}
                    onClick={() => setRename(true)}
                  >
                    Renommer
                  </button>
                  <button
                    className="secondary small"
                    disabled={busy}
                    onClick={() => setRemove(true)}
                  >
                    Supprimer
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="u-chat-scroll" ref={scroll}>
            {sameMonth && <Missions conversationId={activeId} refreshKey={messages.length + ":" + busy} />}
            {!messages.length && (
              <div className="u-chat-welcome">
                <div className="u-spark">✳</div>
                <h2>
                  Que souhaitez-vous
                  <br />
                  clarifier aujourd’hui ?
                </h2>
                <p>
                  Une synthèse, un contrôle ou vos prochaines actions.
                  <br />
                  {mode === "live"
                    ? "Waraqa consulte directement vos lignes, anomalies, paiements et pièces, puis vous propose des actions à confirmer. Joignez un scan pour le faire lire."
                    : profile === "online"
                      ? "L’IA Claude sera disponible dès la clé Anthropic enregistrée (Réglages → Assistant IA)."
                      : "Commencez sans clé avec les analyses locales de votre dossier. Activez l’IA dans Réglages → Assistant IA."}
                </p>
                <div className="u-prompt-grid">
                  {templates.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setText(t.data.prompt.replaceAll("{{mois}}", month));
                        area.current?.focus();
                      }}
                    >
                      <Icon name="file" size={18} />
                      <b>{t.data.title}</b>
                      <span>{t.data.category} ↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m: any) => (
              <article className={"u-message " + m.role} key={m.id}>
                <div className="u-message-avatar">
                  {m.auto ? "↻" : m.role === "user" ? "Vous" : "و"}
                </div>
                <div className="u-message-body">
                  <div className="u-message-meta">
                    <b>{m.auto ? "Reprise automatique" : m.role === "user" ? "Vous" : "Waraqa"}</b>
                    <span>
                      {m.mode === "demo"
                        ? "Analyse locale · sans IA externe"
                        : m.mode === "live"
                          ? m.result?.cached ? "Réponse IA · réutilisée" : "Réponse IA" + (m.result?.model ? " · " + m.result.model : "")
                          : m.mode === "error"
                            ? m.result?.type === "setup" ? "Mise en service requise" : "Connexion en erreur"
                            : ""}
                    </span>
                  </div>
                  {m.role === "assistant" && m.mode === "live" ? (
                    <div className="u-message-text u-message-md"><Markdown text={m.content} /></div>
                  ) : (
                    <div className="u-message-text">{m.content}</div>
                  )}
                  {m.result?.actions?.length > 0 && (
                    <div className="u-ai-actions">
                      <small>Actions proposées — rien n’est exécuté sans votre clic</small>
                      {m.result.actions.map((a: any, n: number) => {
                        const key = m.id + ":" + n;
                        return (
                          <button
                            key={n}
                            className="secondary small"
                            title={a.justification || ""}
                            disabled={busy || done[key]}
                            onClick={() => {
                              if (a.type === "ouvrir_page") go(a.page);
                              else if (a.type === "ouvrir_ligne") run(() => openInvoice(a.factureId));
                              else if (a.type === "exporter" || a.type === "telecharger_piece") run(() => downloadAction(a), "Fichier téléchargé");
                              else setConfirm({ ...a, key });
                            }}
                          >
                            {done[key] ? "✓ " : ""}{a.libelle}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {m.result?.livrables?.length > 0 && (
                    <div className="u-ai-actions u-livrables">
                      <small>Fichiers produits par l’agent</small>
                      {m.result.livrables.map((l: any) => (
                        <button key={l.id} className="primary small" onClick={() => run(() => download(`/workspace/livrables/${l.id}`, l.nom), "Fichier téléchargé")}>
                          <Icon name="download" size={15} /> {l.nom}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.result?.executees?.length > 0 && (
                    <details className="u-sources" open={m.result.executees.length <= 6}>
                      <summary>Fait par l’agent ({m.result.executees.length}) — tracé au journal</summary>
                      <ul>{m.result.executees.map((e: any, i: number) => <li key={i}>{e.resume}</li>)}</ul>
                    </details>
                  )}
                  {m.result?.bilan && (
                    <small className="u-usage">
                      Bilan : {m.result.bilan.etapes} étape(s) · {m.result.bilan.outils.length} outil(s) · {m.result.bilan.actions} action(s) · {m.result.bilan.fichiers} fichier(s) · {m.result.bilan.propositions} proposition(s)
                      {m.result.bilan.tronques?.length ? ` · résultats tronqués (lecture partielle) : ${m.result.bilan.tronques.join(", ")}` : ""}{m.result.bilan.erreurs ? ` · ${m.result.bilan.erreurs} refus d’outil` : ""}
                    </small>
                  )}
                  {m.result?.sources?.length > 0 && (
                    <details className="u-sources">
                      <summary>Données consultées ({m.result.sources.length})</summary>
                      <ul>
                        {m.result.sources.map((src: any, n: number) => (
                          <li key={n}><b>{SOURCE_LABELS[src.name] || src.name}</b> · {src.summary}{src.truncated ? " (tronqué)" : ""}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {m.documentIds?.length > 0 && (
                    <small>
                      {m.documentIds.length} document(s) joint(s) et conservé(s)
                    </small>
                  )}
                  {m.result?.scope && m.result.scope.detailRows !== undefined && <p className="u-info">Périmètre : {m.result.scope.totalRows} lignes au total ; {m.result.scope.detailRows} lignes détaillées.{m.result.scope.historyMessages !== undefined ? ` Historique transmis : ${m.result.scope.historyMessages} messages maximum.` : ''}</p>}
                  {(m.result?.usage || m.result?.cached) && <UsageLine usage={m.result.usage} cached={m.result.cached} />}
                  {m.result?.type === "table" && (
                    <InvoiceTable rows={m.result.rows} />
                  )}{" "}
                  {m.result?.type === "chart" && (
                    <div className="u-chart">
                      {m.result.items.map((item: any) => (
                        <div key={item.label}>
                          <span>{item.label}</span>
                          <div>
                            <i
                              style={{
                                width: `${Math.max(1, (item.value / Math.max(1, ...m.result.items.map((x: any) => x.value))) * 100)}%`,
                              }}
                            />
                          </div>
                          <b>{money(item.value)}</b>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && (
                    <div className="u-actions u-message-actions">
                      <button
                        className="u-text-button"
                        onClick={() =>
                          run(
                            async () => { if (!navigator.clipboard) throw new Error("Presse-papiers indisponible. Sélectionnez le texte puis utilisez Copier."); await navigator.clipboard.writeText(m.content); },
                            "Réponse copiée",
                          )
                        }
                      >
                        Copier
                      </button>
                      {m.mode === "live" && (
                        <button
                          className="u-text-button"
                          disabled={busy}
                          title="Nouvelle réponse sans réutiliser le cache"
                          onClick={() => {
                            const idx = messages.findIndex((x: any) => x.id === m.id);
                            const original = messages.slice(0, idx).reverse().find((x: any) => x.role === "user");
                            send(original?.content, original?.documentIds || [], true);
                          }}
                        >
                          Régénérer
                        </button>
                      )}
                      {m.mode === "error" && (
                        <button
                          className="u-text-button"
                          disabled={busy}
                          onClick={() => {
                            const idx = messages.findIndex(
                              (x: any) => x.id === m.id,
                            );
                            const original = messages.slice(0, idx).reverse().find((x: any) => x.role === 'user');
                            send(original?.content, original?.documentIds || []);
                          }}
                        >
                          Réessayer
                        </button>
                      )}
                      <button
                        className="u-text-button"
                        onClick={() => go("releve")}
                      >
                        Voir les pièces
                      </button>
                      <button
                        className="u-text-button"
                        onClick={() => go("banque")}
                      >
                        Rapprochement
                      </button>
                      <button
                        className="u-text-button"
                        onClick={() =>
                          run(() => exportFile("xlsx"), "Excel téléchargé")
                        }
                      >
                        Exporter Excel
                      </button>
                      <button className="u-text-button" onClick={() => run(() => exportFile('pdf'), 'Relevé PDF téléchargé')}>
                        Exporter PDF
                      </button>
                    </div>
                  )}
                  <time>
                    {new Date(m.timestamp).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </article>
            ))}
            {busy && (
              <div className="u-working" role="status">
                {steps.length ? steps[steps.length - 1] + "…" : "Waraqa prépare la réponse…"}
                {steps.length > 1 && <small> ({steps.length} étapes)</small>}
              </div>
            )}
          </div>
          <div className="u-composer-wrap">
            {files.length > 0 && (
              <div className="u-file-chips">
                {files.map((f, i) => (
                  <span key={i}>
                    {f.file.name}
                    <button
                      className="u-text-button"
                      title="Rôle du document : détecté automatiquement, pièce à comptabiliser, ou modèle / historique / référentiel consulté sans créer de ligne"
                      disabled={busy}
                      onClick={() => setFiles((p) => p.map((x, j) => j === i ? { ...x, role: ATTACH_ROLES[(ATTACH_ROLES.indexOf(x.role) + 1) % ATTACH_ROLES.length] } : x))}
                    >
                      · {attachLabel(f.role)}
                    </button>
                    <button
                      aria-label={"Retirer " + f.file.name}
                      disabled={busy}
                      onClick={() =>
                        setFiles((p) => p.filter((_, j) => i !== j))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {waiting && (
              <div className="u-info u-waiting" role="status">
                {pendingLots.length ? (
                  pendingLots.map((l: any) => (
                    <div key={l.id}>
                      <b>Import « {l.data.label} » : {l.data.processed}/{l.data.total} pièce(s)</b>
                      <progress max={l.data.total || 1} value={l.data.processed} />
                    </div>
                  ))
                ) : (
                  <b>L’agent reprend votre demande…</b>
                )}
                <small>La demande sera traitée automatiquement à la fin de l’import ; vous pouvez naviguer ailleurs.</small>
              </div>
            )}
            <div className="u-composer">
              <textarea
                ref={area}
                aria-label="Message à Waraqa"
                placeholder="Posez votre question ou joignez vos pièces…"
                rows={3}
                value={text}
                disabled={busy}
                onChange={(e) => editDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {busy && <button className="secondary" onClick={() => run(() => api('/workspace/conversations/' + pendingConversation.current + '/cancel', 'POST'))}>Annuler la réponse</button>}
              <div className="u-composer-tools">
                <label className="u-attach" title="Joindre des pièces">
                  <Icon name="plus" size={20} />
                  <input
                    type="file"
                    aria-label="Joindre des pièces au chat"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.csv,.json,.zip"
                    disabled={busy}
                    onChange={(e) => {
                      // Liste lue avant la remise à zéro du champ : la mise à jour d'état peut être différée.
                      const picked = Array.from(e.target.files || []).map((file) => ({ file, role: "" }));
                      setFiles((p) => [...p, ...picked]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <select
                  aria-label="Choisir un modèle de prompt"
                  value=""
                  onChange={(e) => {
                    const t = templates.find((t) => t.id === e.target.value);
                    if (t) setText(t.data.prompt.replaceAll("{{mois}}", month));
                  }}
                >
                  <option value="">Modèles de prompts</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.data.title}
                    </option>
                  ))}
                </select>
                <span className="u-key-hint">Ctrl + Entrée</span>
                <button
                  className="primary u-send"
                  aria-label="Envoyer le message"
                  disabled={busy || (!text.trim() && !files.length)}
                  onClick={() => send()}
                >
                  <Icon name="arrow" size={19} />
                </button>
              </div>
            </div>
            <p className="u-chat-disclaimer">
              {mode === "live"
                ? "Les réponses IA nécessitent votre contrôle. Les données utiles sont envoyées à Anthropic uniquement pendant la réponse."
                : profile === "online"
                  ? "IA Claude non connectée : terminez la mise en service pour obtenir des réponses."
                  : "Sans clé, les réponses sont des analyses déterministes, pas une conversation IA libre."}
            </p>
          </div>
        </section>
      </div>
      {showCap && <Capabilities close={() => setShowCap(false)} />}
      {confirm && MODIFYING.includes(confirm.type) && (
        <Modal title="Confirmer l’action proposée ?" close={() => setConfirm(null)}>
          <p>{describeAction(confirm)}</p>
          {confirm.justification && <p className="u-info">{confirm.justification}</p>}
          <p>Les contrôles habituels du serveur s’appliquent et l’action est tracée dans le journal.</p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                const key = confirm.key;
                await executeAction(confirm);
                setDone((d) => ({ ...d, [key]: true }));
                setConfirm(null);
              }, "Action effectuée")
            }
          >
            Confirmer
          </button>
        </Modal>
      )}
      {confirm?.type === "rapprocher" && (
        <Modal title="Confirmer le rapprochement proposé ?" close={() => setConfirm(null)}>
          <p>
            Paiement <b>#{confirm.paymentId}</b> → facture <b>#{confirm.invoiceId}</b> pour <b>{money(confirm.montant)} MAD</b>.
          </p>
          {confirm.justification && <p className="u-info">{confirm.justification}</p>}
          <p>Les contrôles habituels du serveur s’appliquent ; la ligne devra être revue à nouveau.</p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await api("/workspace/reconciliation", "POST", { paymentId: confirm.paymentId, invoiceId: confirm.invoiceId, amount: confirm.montant });
                setDone((d) => ({ ...d, [confirm.key]: true }));
                setConfirm(null);
                await refresh();
              }, "Rapprochement enregistré")
            }
          >
            Confirmer le rapprochement
          </button>
        </Modal>
      )}
      {rename && (
        <Modal title="Renommer la discussion" close={() => setRename(false)}>
          <form
            className="u-form"
            onSubmit={(e) => {
              e.preventDefault();
              const title = new FormData(e.currentTarget).get("title");
              run(async () => {
                await api("/workspace/conversations/" + activeId, "PATCH", {
                  title,
                });
                setRename(false);
                await load();
              }, "Discussion renommée");
            }}
          >
            <input name="title" required defaultValue={active?.data.title} />
            <button className="primary">Enregistrer</button>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Supprimer cette discussion ?"
          close={() => setRemove(false)}
        >
          <p>
            Les messages seront supprimés. Les pièces importées resteront dans
            votre dossier.
          </p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await api("/workspace/conversations/" + activeId, "DELETE");
                setRemove(false);
                setActiveId("");
                await load();
              }, "Discussion supprimée")
            }
          >
            Confirmer
          </button>
        </Modal>
      )}
    </div>
  );
}
