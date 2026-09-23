import { useEffect, useRef, useState } from "react";
import { api, money, type RecordItem } from "./api";
import { Icon } from "./Icons";
import { InvoiceTable, Modal, type Page, type Run } from "./App";
export default function Chat({
  month,
  go,
  mode,
  templates,
  draft,
  clearDraft,
  run,
  refresh,
  exportFile,
}: {
  month: string;
  go: (p: Page) => void;
  mode: string;
  templates: RecordItem[];
  draft: string;
  clearDraft: () => void;
  run: Run;
  refresh: () => Promise<void>;
  exportFile: (f: string) => Promise<void>;
}) {
  const [conversations, setConversations] = useState<RecordItem[]>([]),
    [activeId, setActiveId] = useState(""),
    [text, setText] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [rename, setRename] = useState(false),
    [remove, setRemove] = useState(false),
    [convSearch, setConvSearch] = useState("");
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
    run(load);
  }, [month]);
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
  async function create() {
    const c = await api("/workspace/conversations", "POST", { month });
    setConversations((p) => [c, ...p]);
    setActiveId(c.id);
    return c;
  }
  async function send(retryText?: string) {
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
      const documentIds: string[] = [];
      for (const file of pendingFiles) {
        const data = new FormData();
        data.append("file", file);
        const d = await api("/workspace/documents", "POST", data);
        documentIds.push(d.id);
      }
      setText("");
      setFiles([]);
      const updated = await api(
        "/workspace/conversations/" + c!.id + "/messages",
        "POST",
        { text: question, documentIds },
      );
      setConversations((p) =>
        p.map((x) => (x.id === updated.id ? updated : x)),
      );
      await refresh();
    });
    if (!ok) {
      setText(sentText || question);
      await run(load);
    }
    setBusy(false);
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
        <span className={"u-ai-label " + (mode === "live" ? "live" : "")}>
          {mode === "live" ? "IA connectée" : "Démo · analyses locales"}
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
                    ? "Votre assistant dispose du contexte comptable du mois."
                    : "Commencez sans clé avec les analyses locales de votre dossier."}
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
                          ? "Réponse IA"
                          : m.mode === "error"
                            ? "Connexion en erreur"
                            : ""}
                    </span>
                  </div>
                  <div className="u-message-text">{m.content}</div>
                  {m.documentIds?.length > 0 && (
                    <small>
                      {m.documentIds.length} document(s) joint(s) et conservé(s)
                    </small>
                  )}
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
                            () => navigator.clipboard.writeText(m.content),
                            "Réponse copiée",
                          )
                        }
                      >
                        Copier
                      </button>
                      {m.mode === "error" && (
                        <button
                          className="u-text-button"
                          disabled={busy}
                          onClick={() => {
                            const idx = messages.findIndex(
                              (x: any) => x.id === m.id,
                            );
                            send(
                              messages
                                .slice(0, idx)
                                .reverse()
                                .find((x: any) => x.role === "user")?.content,
                            );
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
                Waraqa prépare la réponse…
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
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div className="u-composer-tools">
                <label className="u-attach" title="Joindre des pièces">
                  <Icon name="plus" size={20} />
                  <input
                    type="file"
                    aria-label="Joindre des pièces au chat"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.json"
                    disabled={busy}
                    onChange={(e) => {
                      setFiles((p) => [
                        ...p,
                        ...Array.from(e.target.files || []),
                      ]);
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
                ? "Les réponses IA nécessitent votre contrôle."
                : "Sans clé, les réponses sont des analyses déterministes, pas une conversation IA libre."}
            </p>
          </div>
        </section>
      </div>
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
