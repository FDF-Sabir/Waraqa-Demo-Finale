import { useEffect, useRef, useState } from "react";
import { api, money, token, type RecordItem } from "./api";
import { Icon } from "./Icons";
import { InvoiceTable, Modal, type Page, type Run } from "./App";
import Markdown from "./Markdown";

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
};
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
    [files, setFiles] = useState<File[]>([]),
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
      (files.length ? "Analyse les pièces jointes." : "");
    if (!question || busy) return;
    setBusy(true);
    const pendingFiles = [...files];
    const sentText = text;
    const ok = await run(async () => {
      let c = active;
      if (!c || c.data.month !== month) c = await create();
      pendingConversation.current = c!.id;
      const documentIds: string[] = [...retryIds];
      let note = "";
      for (const file of pendingFiles) {
        const data = new FormData();
        data.append("file", file);
        if (/\.zip$/i.test(file.name)) {
          // Dossier compressé : import en lot en arrière-plan (suivi dans Importer et via l’assistant).
          const lot = await api("/workspace/imports/zip", "POST", data);
          note += `\n\n[Dossier « ${file.name} » : import de ${lot.data.total} pièce(s) lancé.]`;
          continue;
        }
        const d = await api("/workspace/documents?reuse=true", "POST", data);
        documentIds.push(d.id);
      }
      editDraft("");
      setFiles([]);
      const updated = await api(
        "/workspace/conversations/" + c!.id + "/messages",
        "POST",
        { text: question + note, documentIds, ...(noCache ? { noCache: true } : {}) },
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
            {sameMonth && (
              <div className="u-actions">
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
              </div>
            )}
          </div>
          <div className="u-chat-scroll" ref={scroll}>
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
                  {m.role === "user" ? "Vous" : "و"}
                </div>
                <div className="u-message-body">
                  <div className="u-message-meta">
                    <b>{m.role === "user" ? "Vous" : "Waraqa"}</b>
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
                      {m.result.actions.map((a: any, n: number) => (
                        <button
                          key={n}
                          className="secondary small"
                          title={a.justification || ""}
                          disabled={busy}
                          onClick={() => {
                            if (a.type === "ouvrir_page") go(a.page);
                            else if (a.type === "ouvrir_ligne") run(() => openInvoice(a.factureId));
                            else if (a.type === "exporter") run(() => exportFile(a.format), "Fichier téléchargé");
                            else if (a.type === "rapprocher") setConfirm(a);
                          }}
                        >
                          {a.libelle}
                        </button>
                      ))}
                    </div>
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
                    {f.name}
                    <button
                      aria-label={"Retirer " + f.name}
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
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.json,.zip"
                    disabled={busy}
                    onChange={(e) => {
                      // Liste lue avant la remise à zéro du champ : la mise à jour d'état peut être différée.
                      const picked = Array.from(e.target.files || []);
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
      {confirm && (
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
