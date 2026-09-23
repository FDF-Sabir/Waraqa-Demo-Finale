import ImportPreview from "./ImportPreview";
import DataMaintenance from "./DataMaintenance";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Icon } from "./Icons";
import {
  api,
  download,
  token,
  type Invoice,
  type RecordItem,
  types,
  payments,
  money,
  bank,
} from "./api";
import Chat from "./UnifiedChat";
import Settings from "./UnifiedSettings";
export { Icon } from "./Icons";
export type Page =
  | "chat"
  | "dashboard"
  | "releve"
  | "import"
  | "designations"
  | "journal"
  | "reglages"
  | "templates"
  | "banque"
  | "exports";
const nav: { id: Page; label: string; icon: any }[] = [
  { id: "chat", label: "Discussion IA", icon: "chatbubble" },
  { id: "dashboard", label: "Vue d’ensemble", icon: "grid" },
  { id: "releve", label: "Pièces & relevé TVA", icon: "table" },
  { id: "import", label: "Importer des pièces", icon: "upload" },
  { id: "banque", label: "Rapprochement", icon: "arrow" },
  { id: "designations", label: "Désignations", icon: "tag" },
  { id: "templates", label: "Modèles de prompts", icon: "file" },
  { id: "exports", label: "Exports & snapshots", icon: "download" },
  { id: "journal", label: "Journal d’activité", icon: "clock" },
  { id: "reglages", label: "Réglages", icon: "settings" },
];
export function PageHead({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        <span className="eyebrow">
          {eyebrow || "WARAQA · ESPACE COMPTABLE"}
        </span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="head-actions">{children}</div>
    </div>
  );
}
export function Status({
  tone,
  children,
}: {
  tone: string;
  children: ReactNode;
}) {
  return (
    <span className={"status " + tone}>
      <span />
      {children}
    </span>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const els = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button,input,select,textarea,[tabindex="0"]',
          ) || [],
        ).filter((x) => !(x as HTMLButtonElement).disabled);
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="u-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="u-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="u-modal-head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={close} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="u-empty">
      <Icon name="file" size={32} />
      <p>{text}</p>
    </div>
  );
}
export type Run = (
  fn: () => Promise<unknown>,
  success?: string,
) => Promise<boolean>;
function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const [setup, setSetup] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/workspace/status")
      .then((d) => setSetup(d.needsSetup))
      .catch((e) => setError(e.message));
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await api(
        "/auth/" + (setup ? "inscription" : "connexion"),
        "POST",
        data,
      );
      sessionStorage.setItem("waraqa-token", r.accessToken);
      onLogin(r.utilisateur);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="u-login">
      <section>
        <div className="brandmark">و</div>
        <span className="eyebrow">VOTRE ESPACE COMPTABLE UNIFIÉ</span>
        <h1>
          Moins de saisie.
          <br />
          Plus de clarté.
        </h1>
        <p>
          Vos pièces, vos contrôles et votre assistant,
          <br />
          réunis dans Waraqa.
        </p>
        <div className="u-login-note">
          Démo locale · Aucune clé API requise
          <br />
          Données persistantes · Validation humaine
        </div>
      </section>
      <form onSubmit={submit}>
        <h2>{setup ? "Créer votre espace" : "Bienvenue dans Waraqa"}</h2>
        <p>
          {setup
            ? "Le premier compte devient administrateur de cet espace local."
            : "Connectez-vous à votre espace de travail."}
        </p>
        {setup && (
          <label>
            Nom
            <input name="nom" required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Mot de passe
          <input
            name="motDePasse"
            type="password"
            required
            minLength={setup ? 10 : 1}
            autoComplete={setup ? "new-password" : "current-password"}
          />
        </label>
        {!setup && <label>Code 2FA ou code de secours (si activé)<input name="otp" autoComplete="one-time-code" maxLength={64} /></label>}
        {error && (
          <p role="alert" className="u-error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Connexion…" : setup ? "Créer et démarrer" : "Se connecter"}
        </button>
        <small>
          Un espace partagé par les utilisateurs de cette installation.
        </small>
      </form>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<any>(null),
    [checking, setChecking] = useState(true),
    [page, setPage] = useState<Page>(() => {
      const p = location.hash.slice(2) as Page;
      return nav.some((n) => n.id === p) ? p : "chat";
    }),
    [month, setMonth] = useState(
      () =>
        localStorage.getItem("waraqa-month") ||
        new Date().toISOString().slice(0, 7),
    ),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [docs, setDocs] = useState<RecordItem[]>([]),
    [designations, setDesignations] = useState<any[]>([]),
    [notes, setNotes] = useState<any[]>([]),
    [settings, setSettings] = useState<any>(null),
    [templates, setTemplates] = useState<RecordItem[]>([]),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [showNotes, setShowNotes] = useState(false),
    [notifyEnabled, setNotifyEnabled] = useState(true),
    [editing, setEditing] = useState<Invoice | null | undefined>(undefined),
    [documentId, setDocumentId] = useState<string | undefined>(),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(0);
  const run: Run = async (fn, success) => {
    setBusy((n) => n + 1);
    try {
      await fn();
      if (success) setNotice(success);
      setError("");
      return true;
    } catch (e: any) {
      setError(e.message || "Action impossible.");
      return false;
    } finally {
      setBusy((n) => n - 1);
    }
  };
  async function refresh() {
    const data = await Promise.all([
      api<Invoice[]>("/factures?mois=" + month),
      api<RecordItem[]>("/workspace/documents"),
      api("/designations"),
      api("/notifications"),
      api("/workspace/settings"),
      api<RecordItem[]>("/workspace/templates"),
      api("/reglages"),
    ]);
    setInvoices(data[0]);
    setDocs(data[1]);
    setDesignations(data[2]);
    setNotes(data[3]);
    setSettings(data[4]);
    setTemplates(data[5]);
    setNotifyEnabled(data[6].notif_push_web);
  }
  useEffect(() => {
    if (token())
      api("/auth/moi")
        .then(setUser)
        .catch(() => {})
        .finally(() => setChecking(false));
    else setChecking(false);
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (user) run(refresh);
    const changed = () => { if (user) run(refresh); };
    window.addEventListener('workspace-changed', changed);
    return () => window.removeEventListener('workspace-changed', changed);
  }, [user, month]);
  useEffect(() => {
    localStorage.setItem("waraqa-month", month);
  }, [month]);
  useEffect(() => {
    const handler = () => {
      const p = location.hash.slice(2) as Page;
      if (nav.some((n) => n.id === p)) setPage(p);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function go(p: Page) {
    setPage(p);
    location.hash = "/" + p;
    setMenu(false);
    setQuery("");
  }
  const rows = useMemo(
    () =>
      invoices.filter((f) => (f.datePaie || f.dateFac || "").startsWith(month)),
    [invoices, month],
  );
  const filtered = rows.filter(
    (f) =>
      !query ||
      [f.factNum, f.libFrss, f.iceFrs, f.designation]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function add(doc?: string) {
    setDocumentId(doc);
    setEditing(null);
  }
  async function saveInvoice(body: any) {
    const saved = await api(
      "/factures" + (editing ? "/" + editing.id : ""),
      editing ? "PUT" : "POST",
      body,
    );
    if (documentId)
      await api(`/workspace/invoices/${saved.id}/document`, "POST", {
        documentId,
      });
    setEditing(undefined);
    await refresh();
  }
  async function exportFile(format: string, scope = "reviewed", examples = false) {
    await download(
      `/workspace/export?month=${month}&format=${format}&scope=${scope}&examples=${examples}`,
      `Waraqa-${format}-${month}${examples ? "-EXEMPLES" : ""}${scope === "all" ? "-BROUILLON" : ""}.${format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv"}`,
    );
    await refresh();
  }
  const selectTemplate = (t: RecordItem) => {
    setDraft(t.data.prompt.replaceAll("{{mois}}", month));
    go("chat");
  };
  if (checking) return <div className="u-empty">Chargement de Waraqa…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return (
    <div
      className={"app density-" + (settings?.preferences?.density || "normal")}
    >
      {menu && (
        <button
          className="scrim"
          onClick={() => setMenu(false)}
          aria-label="Fermer le menu"
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <div className="brand">
          <div className="brandmark">و</div>
          <div>
            <b>Waraqa</b>
            <span>Comptabilité, en clair.</span>
          </div>
        </div>
        <nav>
          <p>ESPACE DE TRAVAIL</p>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
              {n.id === "designations" &&
                designations.some((d) => d.enAttenteConfirmation) && (
                  <i>
                    {designations.filter((d) => d.enAttenteConfirmation).length}
                  </i>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebottom">
          <div className="u-mode">
            <span className={"u-dot" + (settings?.ai.mode === "live" ? " ok" : "")} />
            {settings?.ai.mode === "live"
              ? "IA connectée"
              : settings?.ai.profile === "online" ? "IA : clé à enregistrer" : "Mode démo · sans clé"}
          </div>
          <div className="company">
            <div className="avatar">{user.nom?.slice(0, 2).toUpperCase()}</div>
            <div>
              <b>{user.nom}</b>
              <span>
                {user.role === "admin" ? "Administrateur" : "Comptable"}
              </span>
            </div>
            <button
              className="u-logout"
              aria-label="Déconnexion"
              title="Déconnexion"
              onClick={() => {
                sessionStorage.removeItem("waraqa-token");
                setUser(null);
              }}
            >
              ↗
            </button>
          </div>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Ouvrir le menu"
            onClick={() => setMenu(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <label className="search">
            <Icon name="search" size={18} />
            <input
              placeholder="Rechercher dans le mois…"
              aria-label="Rechercher"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (page !== "releve") setPage("releve");
              }}
            />
          </label>
          <div className="topactions">
            <button
              className="iconbtn"
              aria-label="Actualiser"
              title="Actualiser"
              onClick={() => run(refresh, "Données actualisées")}
            >
              ↻
            </button>
            <div style={{ position: "relative" }}>
              <button
                className="iconbtn"
                aria-label="Notifications"
                onClick={() => setShowNotes(!showNotes)}
              >
                <Icon name="bell" />
                {notifyEnabled && notes.some((n) => !n.lue) && (
                  <span className="notif" />
                )}
              </button>
              {showNotes && (
                <div className="u-notifications">
                  <h3>Notifications</h3>
                  <button
                    className="secondary small"
                    onClick={() =>
                      run(async () => {
                        for (const n of notes.filter((n) => !n.lue))
                          await api(
                            `/notifications/${n.id}/marquer-lue`,
                            "POST",
                          );
                        await refresh();
                      })
                    }
                  >
                    Tout marquer comme lu
                  </button>
                  {notes.length === 0 && <p>Aucune notification.</p>}
                  {notes.slice(0, 30).map((n) => (
                    <div className="u-note" key={n.id}>
                      <b>{n.action.replaceAll("_", " ")}</b>
                      <small>
                        {new Date(n.horodatage).toLocaleString("fr-FR")}
                      </small>
                      <p>
                        {n.factureId ? "Ligne #" + n.factureId : ""}{" "}
                        {n.traitee
                          ? "· Traitée"
                          : n.lue
                            ? "· Lue"
                            : "· Nouvelle"}
                      </p>
                      <button
                        className="secondary small"
                        disabled={n.traitee}
                        onClick={() =>
                          run(async () => {
                            await api(
                              `/notifications/${n.id}/marquer-traitee`,
                              "POST",
                            );
                            await refresh();
                          })
                        }
                      >
                        Marquer traitée
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="u-period">
              Période
              <input
                type="month"
                aria-label="Période"
                value={month}
                onChange={(e) => {
                  if (e.target.value) setMonth(e.target.value);
                }}
              />
            </label>
          </div>
        </header>
        <main>
          {error && (
            <div className="u-alert u-error" role="alert">
              {error}
              <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="u-toast" role="status">
              ✓ {notice}
            </div>
          )}
          {busy > 0 && (
            <div className="u-progress" aria-label="Action en cours" />
          )}
          {page === "chat" && (
            <Chat
              month={month}
              go={go}
              mode={settings?.ai.mode || "demo"}
              templates={templates}
              draft={draft}
              clearDraft={() => setDraft("")}
              run={run}
              refresh={refresh}
              exportFile={exportFile}
              openInvoice={async (id) => {
                setDocumentId(undefined);
                setEditing(await api<Invoice>("/factures/" + id));
              }}
            />
          )}
          {page === "dashboard" && (
            <>
              <PageHead
                title="Votre mois, en un regard."
                subtitle={`Suivi de ${settings?.company.name || "votre entreprise"} · Période ${month}`}
              >
                <button
                  className="secondary"
                  onClick={() =>
                    run(
                      () =>
                        api("/workspace/seed", "POST", { month }).then(refresh),
                      "Exemples chargés",
                    )
                  }
                  disabled={user.role !== "admin"}
                >
                  Charger les exemples
                </button>
                <button className="primary" onClick={() => go("import")}>
                  <Icon name="plus" size={17} />
                  Importer
                </button>
              </PageHead>
              <div className="u-stats">
                {[
                  [
                    "Total HT",
                    money(
                      rows
                        .filter((f) => !bank(f))
                        .reduce((s, f) => s + f.mHt, 0),
                    ) + " MAD",
                  ],
                  [
                    "TVA enregistrée",
                    money(
                      rows
                        .filter((f) => !bank(f))
                        .reduce((s, f) => s + f.tva, 0),
                    ) + " MAD",
                  ],
                  [
                    "Lignes revues",
                    rows.filter((f) => f.revueHumaine && !bank(f)).length +
                      " / " +
                      rows.filter((f) => !bank(f)).length,
                  ],
                  [
                    "À contrôler",
                    rows.filter((f) => !f.revueHumaine || f.doublonDe).length,
                  ],
                ].map(([label, value]) => (
                  <div className="u-stat" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>
                      {label === "TVA enregistrée"
                        ? "Toutes les pièces hors banque"
                        : "Période sélectionnée"}
                    </small>
                  </div>
                ))}
              </div>
              <div className="u-two">
                <section className="panel u-pad">
                  <h2>Avancer sur votre dossier</h2>
                  <p>
                    Importez vos pièces, contrôlez les champs puis validez les
                    lignes.
                  </p>
                  <div className="u-task">
                    <span>01 · Pièces en attente de saisie</span>
                    <b>
                      {
                        docs.filter((d) =>
                          ["a_saisir", "erreur"].includes(d.data.status),
                        ).length
                      }
                    </b>
                    <button
                      className="secondary small"
                      onClick={() => go("import")}
                    >
                      Ouvrir
                    </button>
                  </div>
                  <div className="u-task">
                    <span>02 · Désignations à confirmer</span>
                    <b>
                      {
                        designations.filter((d) => d.enAttenteConfirmation)
                          .length
                      }
                    </b>
                    <button
                      className="secondary small"
                      onClick={() => go("designations")}
                    >
                      Vérifier
                    </button>
                  </div>
                  <div className="u-task">
                    <span>03 · Paiements à rapprocher</span>
                    <b>
                      {rows.filter((f) => bank(f) && !f.rapprocheeA).length}
                    </b>
                    <button
                      className="secondary small"
                      onClick={() => go("banque")}
                    >
                      Rapprocher
                    </button>
                  </div>
                </section>
                <section className="panel u-pad u-insight">
                  <span className="eyebrow">VOTRE ASSISTANT</span>
                  <h2>Un contrôle avant l’export ?</h2>
                  <p>
                    Retrouvez une synthèse chiffrée, les anomalies et les
                    prochaines actions dans votre discussion.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      setDraft("Contrôle les anomalies du mois " + month);
                      go("chat");
                    }}
                  >
                    Analyser ce mois <Icon name="arrow" size={16} />
                  </button>
                </section>
              </div>
              <section className="panel u-pad">
                <div className="u-row">
                  <h2>Dernières lignes du mois</h2>
                  <button
                    className="secondary small"
                    onClick={() => go("releve")}
                  >
                    Tout consulter
                  </button>
                </div>
                <InvoiceTable
                  rows={rows.slice(-5).reverse()}
                  edit={(f) => {
                    setDocumentId(undefined);
                    setEditing(f);
                  }}
                />
              </section>
            </>
          )}
          {page === "releve" && (
            <Ledger
              month={month}
              rows={filtered}
              query={query}
              add={() => add()}
              edit={(f) => {
                setDocumentId(undefined);
                setEditing(f);
              }}
              run={run}
              refresh={refresh}
              exportFile={exportFile}
            />
          )}
          {page === "import" && (
            <Imports
              docs={docs}
              run={run}
              refresh={refresh}
              add={add}
              mode={settings?.ai.mode}
              go={go}
            />
          )}
          {page === "designations" && (
            <Designations items={designations} run={run} refresh={refresh} />
          )}
          {page === "templates" && (
            <Templates
              templates={templates}
              run={run}
              refresh={refresh}
              useTemplate={selectTemplate}
            />
          )}
          {page === "banque" && (
            <Bank
              month={month}
              run={run}
              refresh={refresh}
              invoices={invoices}
            />
          )}
          {page === "exports" && (
            <Exports month={month} run={run} exportFile={exportFile} />
          )}
          {page === "journal" && <Journal run={run} />}
          {page === "reglages" && settings && (
            <Settings
              settings={settings}
              user={user}
              run={run}
              refresh={refresh}
            />
          )}
          <footer>
            Waraqa 4.3 · {settings?.ai.profile === "online" ? "Profil en ligne" : "Profil local"} ·{" "}
            {settings?.ai.mode === "live"
              ? "IA connectée"
              : "Analyses locales sans IA externe"}{" "}
            · Données conservées sur ce poste{settings?.ai.profile === "online" ? ", copie Google Drive une fois connecté" : ""}
          </footer>
        </main>
      </div>
      {editing !== undefined && (
        <InvoiceForm
          invoice={editing}
          documentId={documentId}
          designations={designations}
          month={month}
          close={() => setEditing(undefined)}
          onSave={saveInvoice}
          run={run}
          ask={(text) => {
            setEditing(undefined);
            setDraft(text);
            go("chat");
          }}
        />
      )}
    </div>
  );
}
export function InvoiceTable({
  rows,
  edit,
  selected,
  toggle,
}: {
  rows: Invoice[];
  edit?: (f: Invoice) => void;
  selected?: number[];
  toggle?: (id: number) => void;
}) {
  if (!rows.length) return <Empty text="Aucune ligne pour cette sélection." />;
  return (
    <div className="u-table-scroll">
      <table className="u-table">
        <thead>
          <tr>
            {toggle && <th>Sél.</th>}
            <th>Pièce / Fournisseur</th>
            <th>Date</th>
            <th>Désignation</th>
            <th>HT</th>
            <th>TVA</th>
            <th>TTC</th>
            <th>Contrôle</th>
            {edit && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              {toggle && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={"Sélectionner " + (f.factNum || f.id)}
                    checked={selected?.includes(f.id) || false}
                    onChange={() => toggle(f.id)}
                  />
                </td>
              )}
              <td>
                <b>
                  {f.factNum || "Sans référence"} <small>#{f.id}</small>
                </b>
                <span>{f.libFrss || "Fournisseur non renseigné"}</span>
                {f.demonstration && (
                  <small className="u-demo-label">EXEMPLE FICTIF</small>
                )}
              </td>
              <td>
                {f.datePaie || f.dateFac || "—"}
                <small>{f.datePaie ? "Paiement" : "Facture"}</small>
              </td>
              <td>
                {f.designation || "—"}
                <small>{types[f.sousType]}</small>
              </td>
              <td>{money(f.mHt)}</td>
              <td>
                {money(f.tva)}
                <small>{Number(f.taux * 100).toFixed(0)} %</small>
              </td>
              <td>
                <b>{money(f.mTtc)}</b>
              </td>
              <td>
                <Status
                  tone={
                    f.doublonDe ? "red" : f.revueHumaine ? "green" : "amber"
                  }
                >
                  {f.doublonDe
                    ? "Doublon #" + f.doublonDe
                    : f.revueHumaine
                      ? "Revue"
                      : f.statut === "incomplete"
                        ? "Incomplète"
                        : bank(f)
                          ? f.rapprocheeA
                            ? "Rapprochée"
                            : "À rapprocher"
                          : "À vérifier"}
                </Status>
                {f.vigilanceRenforcee && <small>Vigilance douane</small>}
                {f.champsManquants?.length ? (
                  <small>Manque : {f.champsManquants.join(", ")}</small>
                ) : null}
              </td>
              {edit && (
                <td>
                  <button className="secondary small" onClick={() => edit(f)}>
                    Ouvrir
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Ledger({
  month,
  rows,
  query,
  add,
  edit,
  run,
  refresh,
  exportFile,
}: {
  month: string;
  rows: Invoice[];
  query: string;
  add: () => void;
  edit: (f: Invoice) => void;
  run: Run;
  refresh: () => Promise<void>;
  exportFile: (f: string, s?: string, examples?: boolean) => Promise<void>;
}) {
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<number[]>([]),
    [page, setPage] = useState(1),
    [archive, setArchive] = useState(false),
    [sort, setSort] = useState("recent");
  const ledgerRevision = rows.map(f=>`${f.id}:${f.version}`).join(",");
  const [remote, setRemote] = useState<{rows:Invoice[];total:number}>({rows:[],total:0});
  const [loading,setLoading]=useState(false);
  useEffect(()=>{setPage(1);setSelected([]);},[filter,query,month,sort]);
  useEffect(()=>{
    let current=true;setLoading(true);
    const timer=setTimeout(()=>{run(async()=>{const result=await api('/workspace/invoices?'+new URLSearchParams({month,search:query,filter,page:String(page),size:'15',sort}));if(current)setRemote(result);}).finally(()=>{if(current)setLoading(false);});},120);
    return ()=>{current=false;clearTimeout(timer);};
  },[filter,query,month,page,sort,ledgerRevision]);
  const filtered=remote.rows;
  const pages=Math.max(1,Math.ceil(remote.total/15));
  const ids = selected.filter((id) => filtered.some((r) => r.id === id));
  return (
    <>
      <PageHead
        title="Pièces & relevé TVA"
        subtitle="13 champs Tableau5 · Calculs HT/TVA côté serveur · Période par date de paiement, sinon date de facture."
      >
        <button
          className="secondary"
          onClick={() => run(() => exportFile("xlsx"))}
        >
          <Icon name="download" size={17} />
          Excel des lignes revues
        </button>
        <button className="secondary" onClick={() => run(() => exportFile('pdf'), 'Relevé PDF téléchargé')}>
          <Icon name="download" size={17} />
          PDF des lignes revues
        </button>
        <button className="primary" onClick={add}>
          <Icon name="plus" size={17} />
          Saisie manuelle
        </button>
      </PageHead>
      <section className="panel">
        <div className="u-toolbar">
          <div className="u-tabs">
            {[
              ["all", "Toutes"],
              ["pending", "À vérifier"],
              ["reviewed", "Revues"],
              ["anomaly", "Anomalies"],
              ["bank", "Banque"],
            ].map(([v, l]) => (
              <button
                className={filter === v ? "active" : ""}
                onClick={() => setFilter(v)}
                key={v}
              >
                {l}
              </button>
            ))}
          </div>
          <select
            aria-label="Trier les lignes"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Plus récentes</option>
            <option value="supplier">Fournisseur</option>
            <option value="amount">Montant TTC</option>
          </select>
        </div>
        <div className="u-toolbar">
          <label>
            <input
              type="checkbox"
              checked={
                !!filtered.length && filtered.every((f) => ids.includes(f.id))
              }
              onChange={(e) =>
                setSelected(e.target.checked ? filtered.map((f) => f.id) : [])
              }
            />{" "}
            Sélectionner la page ({filtered.length})
          </label>
          <div className="u-actions">
            <button
              className="secondary small"
              disabled={!ids.length}
              onClick={() =>
                run(async () => {
                  let ok = 0;
                  const errors: string[] = [];
                  for (const id of ids) {
                    try {
                      await api(`/factures/${id}/valider`, "POST");
                      ok++;
                    } catch (e: any) {
                      errors.push(`#${id}: ${e.message}`);
                    }
                  }
                  await refresh();
                  if (errors.length)
                    throw new Error(
                      `${ok} ligne(s) revue(s). ${errors.join(" · ")}`,
                    );
                }, "Lignes revues et journalisées")
              }
            >
              Valider la sélection ({ids.length})
            </button>
            <button
              className="secondary small"
              disabled={!ids.length}
              onClick={() => setArchive(true)}
            >
              Archiver
            </button>
          </div>
        </div>
        <InvoiceTable
          rows={filtered}
          edit={edit}
          selected={ids}
          toggle={(id) =>
            setSelected(
              ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
            )
          }
        />
        <div className="u-pagination">
          <span>{loading ? "Chargement…" : `${remote.total} ligne(s)`}</span>
          <button
            className="secondary small"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Précédent
          </button>
          <b>
            {Math.min(page, pages)} / {pages}
          </b>
          <button
            className="secondary small"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Suivant
          </button>
        </div>
      </section>
      {archive && (
        <Modal
          title="Archiver les lignes sélectionnées"
          close={() => setArchive(false)}
        >
          <p>
            {ids.length} ligne(s) seront retirées des relevés. Leur trace
            restera dans le journal.
          </p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                for (const id of ids)
                  await api(`/workspace/invoices/${id}/archive`, "POST");
                setArchive(false);
                setSelected([]);
                await refresh();
              }, "Lignes archivées")
            }
          >
            Confirmer l’archivage
          </button>
        </Modal>
      )}
    </>
  );
}
function InvoiceForm({
  invoice,
  documentId,
  designations,
  month,
  close,
  onSave,
  run,
  ask,
}: {
  invoice: Invoice | null;
  documentId?: string;
  designations: any[];
  month: string;
  close: () => void;
  onSave: (b: any) => Promise<void>;
  run: Run;
  ask?: (text: string) => void;
}) {
  const [form, setForm] = useState<any>(
    invoice
      ? Object.fromEntries(
          [
            "or",
            "factNum",
            "designation",
            "mTtc",
            "iff",
            "libFrss",
            "iceFrs",
            "taux",
            "idPaie",
            "datePaie",
            "dateFac",
            "sousType", "creditOf", "accountingMonth", "fiscalMonth",
          ].map((k) => [k, (invoice as any)[k] ?? ""]),
        )
      : {
          sousType: "facture_fournisseur",
          dateFac: month + "-01",
          mTtc: "",
          taux: 0.2,
        },
  );
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = { ...form, ...(invoice ? { expectedVersion: invoice.version } : {}), mTtc: Number(form.mTtc), taux: Number(form.taux) };
    if (form.creditOf) data.creditOf = Number(form.creditOf); else delete data.creditOf;
    if (!data.accountingMonth) delete data.accountingMonth;
    if (!data.fiscalMonth) delete data.fiscalMonth;
    if (form.idPaie) data.idPaie = Number(form.idPaie);
    else delete data.idPaie;
    await run(() => onSave(data), "Ligne enregistrée");
    setSaving(false);
  }
  return (
    <Modal
      title={invoice ? "Ligne #" + invoice.id : "Nouvelle ligne"}
      close={close}
    >
      <form onSubmit={submit}>
        <div className="formgrid u-form">
          <label>
            Type de pièce
            <select
              value={form.sousType}
              onChange={(e) => set("sousType", e.target.value)}
            >
              {Object.entries(types).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>Facture source de l’avoir (ID)<input type="number" min="1" value={form.creditOf || ''} disabled={Boolean(invoice)} onChange={e => set('creditOf',e.target.value)} /><small>Avoir : montant négatif, source obligatoire.</small></label>
          <label>Période comptable (repère)<input type="month" value={form.accountingMonth || ''} onChange={e=>set('accountingMonth',e.target.value)} /></label>
          <label>Période fiscale proposée — à vérifier<input type="month" value={form.fiscalMonth || ''} onChange={e=>set('fiscalMonth',e.target.value)} /><small>Ne change pas le rattachement historique par date de paiement ou facture.</small></label>
          <label>
            N° de facture
            <input
              value={form.factNum || ""}
              onChange={(e) => set("factNum", e.target.value)}
            />
          </label>
          <label>
            Fournisseur
            <input
              value={form.libFrss || ""}
              onChange={(e) => set("libFrss", e.target.value)}
            />
          </label>
          <label>
            Désignation
            <input
              list="designations"
              value={form.designation || ""}
              onChange={(e) => set("designation", e.target.value)}
            />
            <datalist id="designations">
              {designations.map((d) => (
                <option key={d.id} value={d.libelle} />
              ))}
            </datalist>
          </label>
          <label>
            ICE fournisseur
            <input
              value={form.iceFrs || ""}
              onChange={(e) => set("iceFrs", e.target.value)}
            />
          </label>
          <label>
            IF fournisseur
            <input
              value={form.iff || ""}
              onChange={(e) => set("iff", e.target.value)}
            />
          </label>
          <label>
            Montant TTC (MAD)
            <input
              type="number"
              required
              min={form.creditOf ? undefined : "0"}
              step="0.01"
              value={form.mTtc}
              onChange={(e) => set("mTtc", e.target.value)}
            />
          </label>
          <label>
            Taux de la pièce
            <select
              value={form.taux}
              onChange={(e) => set("taux", Number(e.target.value))}
            >
              {[0, 0.07, 0.1, 0.14, 0.2].map((r) => (
                <option key={r} value={r}>
                  {r * 100} %
                </option>
              ))}
            </select>
          </label>
          <label>
            Date de facture
            <input
              type="date"
              value={form.dateFac || ""}
              onChange={(e) => set("dateFac", e.target.value)}
            />
          </label>
          <label>
            Date de paiement
            <input
              type="date"
              value={form.datePaie || ""}
              onChange={(e) => set("datePaie", e.target.value)}
            />
          </label>
          <label>
            Mode de paiement
            <select
              value={form.idPaie || ""}
              onChange={(e) => set("idPaie", e.target.value)}
            >
              <option value="">Non renseigné</option>
              {Object.entries(payments).map(([v, l]) => (
                <option key={v} value={v}>
                  {v} · {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ordre (OR)
            <input
              value={form.or || ""}
              onChange={(e) => set("or", e.target.value)}
            />
          </label>
        </div>
        <div className="u-info">
          HT et TVA sont recalculés sur le serveur. Toute modification annule la
          revue humaine. Une facture multi-taux se saisit en plusieurs lignes,
          une par taux.
        </div>
        {invoice?.documentId && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              run(() =>
                download(
                  `/workspace/documents/${invoice.documentId}/file`,
                  "piece-source",
                ),
              )
            }
          >
            Télécharger la pièce source
          </button>
        )}
        {documentId && <p>Cette ligne sera rattachée au document importé.</p>}
        <div className="u-modal-footer">
          {invoice && ask && (
            <button
              type="button"
              className="u-text-button"
              title="Ouvre la discussion avec une question préparée sur cette ligne"
              onClick={() => ask(`Explique les points à vérifier sur la ligne #${invoice.id}${invoice.factNum ? " (" + invoice.factNum + ")" : ""} et ce qu’il faut corriger avant la revue.`)}
            >
              Demander à Waraqa
            </button>
          )}
          <button type="button" className="secondary" onClick={close}>
            Annuler
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer la ligne"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Imports({
  docs,
  run,
  refresh,
  add,
  mode,
  go,
}: {
  docs: RecordItem[];
  run: Run;
  refresh: () => Promise<void>;
  add: (id?: string) => void;
  mode: string;
  go: (p: Page) => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [progress, setProgress] = useState<any[]>([]),
    [working, setWorking] = useState(false),
    [details, setDetails] = useState<RecordItem | null>(null);
  async function upload() {
    setWorking(true);
    setProgress([]);
    for (const file of files) {
      const data = new FormData();
      data.append("file", file);
      try {
        const r = await api("/workspace/documents?preview=true", "POST", data);
        setProgress((p) => [
          ...p,
          { name: file.name, status: r.data.status, errors: r.data.errors },
        ]);
      } catch (e: any) {
        setProgress((p) => [
          ...p,
          { name: file.name, status: "erreur", errors: [e.message] },
        ]);
      }
    }
    setFiles([]);
    await run(refresh);
    setWorking(false);
  }
  return (
    <>
      <PageHead
        title="Chaque pièce a sa place."
        subtitle="Déposez vos documents, seuls ou en lot. Les fichiers originaux sont conservés et reliés aux lignes."
      />
      <section className="panel u-pad">
        <div
          className="u-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!working)
              setFiles((p) => [...p, ...Array.from(e.dataTransfer.files)]);
          }}
        >
          <Icon name="upload" size={36} />
          <h2>Glissez vos pièces ici</h2>
          <p>PDF, JPG, PNG, Excel, CSV ou JSON · 20 Mo par fichier</p>
          <label className="primary u-file-label">
            Choisir des fichiers
            <input
              aria-label="Choisir des fichiers"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.json"
              disabled={working}
              onChange={(e) => {
                setFiles((p) => [...p, ...Array.from(e.target.files || [])]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="secondary u-file-label">
            Prendre une photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={working}
              onChange={(e) =>
                setFiles((p) => [...p, ...Array.from(e.target.files || [])])
              }
            />
          </label>
        </div>
        <div className="u-info">
          {mode === "live"
            ? "Extraction IA activée pour PDF et images. Chaque ligne reste à vérifier."
            : "Sans clé API : Excel/CSV/JSON structurés sont lus réellement. PDF et images sont conservés pour saisie manuelle ou extraction ultérieure."}
        </div>
        {files.map((f, i) => (
          <div className="u-task" key={i}>
            <span>
              {f.name} · {(f.size / 1024).toFixed(0)} Ko
            </span>
            <button
              className="secondary small"
              disabled={working}
              onClick={() => setFiles(files.filter((_, j) => i !== j))}
            >
              Retirer
            </button>
          </div>
        ))}
        {files.length > 0 && (
          <button className="primary" disabled={working} onClick={upload}>
            {working
              ? "Traitement du lot…"
              : `Importer ${files.length} fichier(s)`}
          </button>
        )}
        {progress.map((p, i) => (
          <div className="u-info" key={i}>
            <b>
              {p.name} · {p.status}
            </b>
            {p.errors.map((s: string, j: number) => (
              <p key={j}>{s}</p>
            ))}
          </div>
        ))}
      </section>
      <section className="panel u-pad">
        <div className="u-row">
          <h2>Bibliothèque de pièces ({docs.length})</h2>
          <button className="secondary small" onClick={() => go("releve")}>
            Ouvrir le relevé
          </button>
        </div>
        {docs.length === 0 ? (
          <Empty text="Importez votre premier document." />
        ) : (
          <div className="u-table-scroll">
            <table className="u-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Traitement</th>
                  <th>Lignes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b>{d.data.name}</b>
                      <small>
                        {new Date(d.data.createdAt).toLocaleString("fr-FR")} ·{" "}
                        {d.data.author}
                      </small>
                    </td>
                    <td>
                      <Status tone={d.data.errors.length ? "amber" : "green"}>
                        {d.data.status.replaceAll("_", " ")}
                      </Status>
                      <small>{d.data.mode}</small>
                    </td>
                    <td>{d.data.invoiceIds.length}</td>
                    <td>
                      <div className="u-actions">
                        <button
                          className="secondary small"
                          onClick={() => setDetails(d)}
                        >
                          Détails
                        </button>
                        <button
                          className="secondary small"
                          onClick={() =>
                            run(() =>
                              download(
                                `/workspace/documents/${d.id}/file`,
                                d.data.name,
                              ),
                            )
                          }
                        >
                          Source
                        </button>
                        <button
                          className="secondary small"
                          onClick={() => add(d.id)}
                        >
                          Saisir une ligne
                        </button>
                        {['partiel','interrompu','annule'].includes(d.data.status) && <button className="secondary small" onClick={() => run(async () => {await api(`/workspace/documents/${d.id}/commit`, 'POST');await refresh();}, 'Reprise terminée, consultez les rejets')}>Reprendre sans doublons</button>}
                        {d.data.status === 'en_cours' && <button className="secondary small" onClick={() => run(() => api(`/workspace/documents/${d.id}/cancel`, 'POST'), 'Annulation demandée après la ligne en cours')}>Annuler</button>}
                        {d.data.status === 'apercu' && <button className="primary small" onClick={() => setDetails(d)}>Vérifier l’aperçu</button>}
                        {!d.data.invoiceIds.length && d.data.status !== 'apercu' && (
                          <button
                            className="secondary small"
                            disabled={mode !== "live"}
                            onClick={() =>
                              run(async () => {
                                await api(
                                  `/workspace/documents/${d.id}/retry`,
                                  "POST",
                                );
                                await refresh();
                              }, "Extraction relancée")
                            }
                          >
                            Extraire avec IA
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {details && (
        <Modal title={details.data.name} close={() => setDetails(null)}>
          <p>
            SHA-256 :{" "}
            <code style={{ overflowWrap: "anywhere" }}>
              {details.data.hash}
            </code>
          </p>
          <p>
            Lignes créées : {details.data.invoiceIds.join(", ") || "Aucune"}
          </p>
          {details.data.status === 'apercu' && <ImportPreview id={details.id} run={run} done={async () => {setDetails(null);await refresh();}} />}
          {details.data.errors.map((e: string, i: number) => (
            <p className="u-info" key={i}>
              {e}
            </p>
          ))}
        </Modal>
      )}
    </>
  );
}
function Designations({
  items,
  run,
  refresh,
}: {
  items: any[];
  run: Run;
  refresh: () => Promise<void>;
}) {
  const [label, setLabel] = useState(""),
    [filter, setFilter] = useState("");
  return (
    <>
      <PageHead
        title="Un vocabulaire commun."
        subtitle="Les nouvelles désignations passent par votre confirmation avant d’intégrer le référentiel."
      />
      <section className="panel u-pad">
        <form
          className="u-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api("/workspace/designations", "POST", { libelle: label });
              setLabel("");
              await refresh();
            }, "Désignation ajoutée");
          }}
        >
          <input
            aria-label="Nouvelle désignation"
            placeholder="Nouvelle désignation"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="primary">Ajouter</button>
          <input
            aria-label="Filtrer les désignations"
            placeholder="Rechercher…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </form>
        <div className="u-cards">
          {items
            .filter((d) =>
              d.libelle.toLowerCase().includes(filter.toLowerCase()),
            )
            .map((d) => (
              <div className="u-card" key={d.id}>
                <Icon name="tag" />
                <h3>{d.libelle}</h3>
                <Status tone={d.enAttenteConfirmation ? "amber" : "green"}>
                  {d.enAttenteConfirmation ? "À confirmer" : "Confirmée"}
                </Status>
                {d.enAttenteConfirmation && (
                  <button
                    className="secondary"
                    onClick={() =>
                      run(async () => {
                        await api(`/designations/${d.id}/confirmer`, "POST");
                        await refresh();
                      }, "Désignation confirmée")
                    }
                  >
                    Confirmer
                  </button>
                )}
              </div>
            ))}
        </div>
      </section>
    </>
  );
}
function Templates({
  templates,
  run,
  refresh,
  useTemplate,
}: {
  templates: RecordItem[];
  run: Run;
  refresh: () => Promise<void>;
  useTemplate: (t: RecordItem) => void;
}) {
  const [edit, setEdit] = useState<RecordItem | null | undefined>(),
    [remove, setRemove] = useState<RecordItem | null>(null);
  return (
    <>
      <PageHead
        title="Vos instructions, réutilisables."
        subtitle="Une bibliothèque de modèles pour vos conversations. {{mois}} est remplacé par la période active."
      >
        <button className="primary" onClick={() => setEdit(null)}>
          <Icon name="plus" size={17} />
          Créer un modèle
        </button>
      </PageHead>
      <div className="u-cards">
        {templates.map((t) => (
          <section className="panel u-pad" key={t.id}>
            <span className="eyebrow">{t.data.category}</span>
            <h2>{t.data.title}</h2>
            <p>{t.data.prompt}</p>
            <div className="u-actions">
              <button className="primary" onClick={() => useTemplate(t)}>
                Utiliser
              </button>
              <button className="secondary" onClick={() => setEdit(t)}>
                Modifier
              </button>
              <button className="secondary" onClick={() => setRemove(t)}>
                Supprimer
              </button>
            </div>
          </section>
        ))}
      </div>
      {edit !== undefined && (
        <Modal
          title={edit ? "Modifier le modèle" : "Créer un modèle"}
          close={() => setEdit(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                await api(
                  "/workspace/templates" + (edit ? "/" + edit.id : ""),
                  edit ? "PUT" : "POST",
                  b,
                );
                setEdit(undefined);
                await refresh();
              }, "Modèle enregistré");
            }}
            className="u-form"
          >
            <label>
              Titre
              <input name="title" required defaultValue={edit?.data.title} />
            </label>
            <label>
              Catégorie
              <input
                name="category"
                defaultValue={edit?.data.category || "Personnel"}
              />
            </label>
            <label>
              Instructions
              <textarea
                name="prompt"
                required
                rows={7}
                defaultValue={edit?.data.prompt}
              />
            </label>
            <button className="primary">Enregistrer</button>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="Supprimer le modèle" close={() => setRemove(null)}>
          <p>{remove.data.title}</p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await api("/workspace/templates/" + remove.id, "DELETE");
                setRemove(null);
                await refresh();
              }, "Modèle supprimé")
            }
          >
            Confirmer
          </button>
        </Modal>
      )}
    </>
  );
}
function Bank({
  month,
  run,
  refresh,
  invoices,
}: {
  month: string;
  run: Run;
  refresh: () => Promise<void>;
  invoices: Invoice[];
}) {
  const [items, setItems] = useState<any[]>([]),
    [choice, setChoice] = useState<Record<number, string>>({}),
    [amounts, setAmounts] = useState<Record<number, string>>({}),
    [allocations, setAllocations] = useState<RecordItem[]>([]),
    [cancel, setCancel] = useState<RecordItem | null>(null),
    [orphan, setOrphan] = useState<any>(null);
  async function load() {
    setItems(await api("/workspace/reconciliation?month=" + month));
    setAllocations(await api("/workspace/allocations"));
  }
  useEffect(() => {
    run(load);
  }, [month, invoices]);
  return (
    <>
      <PageHead
        title="Relier paiements et factures."
        subtitle="Affectez chaque montant aux factures concernées. Paiements partiels et reliquats restent visibles ; aucune charge bancaire ajoutée."
      />
      <div className="u-info">
        Les mouvements bancaires ne sont pas additionnés aux achats ni exportés
        en TVA. Les commissions identifiées restent des lignes de charges.
      </div>
      {items.length === 0 ? (
        <section className="panel">
          <Empty text="Aucun paiement non rapproché pour ce mois." />
        </section>
      ) : (
        items.map((item) => (
          <section className="panel u-pad" key={item.payment.id}>
            <div className="u-row">
              <h2>
                Paiement #{item.payment.id} · Disponible {money(item.remaining)} MAD
              </h2>
              <Status tone="amber">À confirmer</Status>
            </div>
            <p>
              {item.payment.libFrss || "Fournisseur non renseigné"} ·{" "}
              {item.payment.datePaie}
            </p>
            <select
              aria-label={"Facture pour paiement " + item.payment.id}
              value={choice[item.payment.id] || ""}
              onChange={(e) =>
                setChoice({ ...choice, [item.payment.id]: e.target.value })
              }
            >
              <option value="">Choisir une facture candidate</option>
              {item.candidates.map((f: any) => (
                <option key={f.id} value={f.id}>
                  #{f.id} · {f.factNum} · {f.libFrss} · Reste {money(f.remaining)} MAD
                </option>
              ))}
            </select>
            <label>Montant affecté (MAD)<input type="number" min="0.01" step="0.01" max={item.remaining} value={amounts[item.payment.id] ?? item.remaining} onChange={e=>setAmounts({...amounts,[item.payment.id]:e.target.value})} /></label>
            <button
              className="primary"
              disabled={!choice[item.payment.id]}
              onClick={() =>
                run(async () => {
                  await api("/workspace/reconciliation", "POST", {
                    paymentId: item.payment.id,
                    invoiceId: Number(choice[item.payment.id]),
                    amount: Number(amounts[item.payment.id] ?? item.remaining),
                  });
                  await refresh();
                  await load();
                }, "Rapprochement enregistré")
              }
            >
              Confirmer ce lien
            </button>
            {item.payment.statut === "en_attente_confirmation_paiement" ? (
              <button
                className="secondary"
                onClick={() => setOrphan(item.payment)}
              >
                Confirmer sans facture source
              </button>
            ) : (
              <p>
                Absence de facture source déjà confirmée. Le paiement reste
                exclu de l’export TVA.
              </p>
            )}
            {!item.candidates.length && (
              <p>
                Aucune correspondance exacte. Corrigez ou ajoutez la facture
                source dans le relevé.
              </p>
            )}
          </section>
        ))
      )}
      {orphan && (
        <Modal
          title="Confirmer un paiement sans facture"
          close={() => setOrphan(null)}
        >
          <p>
            Vous confirmez explicitement l’absence de facture source pour le
            paiement #{orphan.id}. Cette décision sera journalisée. Le paiement
            reste exclu du relevé d’achats exporté.
          </p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await api(
                  `/factures/${orphan.id}/confirmer-sans-facture`,
                  "POST",
                );
                setOrphan(null);
                await refresh();
                await load();
              }, "Absence de facture source confirmée")
            }
          >
            Confirmer
          </button>
        </Modal>
      )}
      <section className="panel u-pad">
        <h2>Affectations enregistrées</h2>
        <p>Une affectation partielle bloque l’export revu de la facture. Le traitement fiscal du paiement partiel reste à vérifier ; le brouillon conserve les montants complets.</p>
        {allocations.map(a=><div className="u-row" key={a.id}><span>Paiement #{a.data.paymentId} → Facture #{a.data.invoiceId} · {money(a.data.cents/100)} MAD {a.data.cancelled ? '· Annulée : '+a.data.reason : ''}</span>{!a.data.cancelled && <button className="secondary small" onClick={()=>setCancel(a)}>Annuler l’affectation</button>}</div>)}
        {cancel && <Modal title="Annuler l’affectation" close={()=>setCancel(null)}><form onSubmit={e=>{e.preventDefault();const reason=new FormData(e.currentTarget).get('reason');run(async()=>{await api(`/workspace/allocations/${cancel.id}/cancel`,'POST',{reason});setCancel(null);await refresh();await load();},'Affectation annulée et journalisée');}}><label>Motif<input name="reason" minLength={5} maxLength={500} required /></label><button className="primary">Confirmer l’annulation</button></form></Modal>}
      </section>
    </>
  );
}
function Exports({
  month,
  run,
  exportFile,
}: {
  month: string;
  run: Run;
  exportFile: (f: string, s?: string, examples?: boolean) => Promise<void>;
}) {
  const [scope, setScope] = useState("reviewed"),
    [examples, setExamples] = useState(false),
    [snapshots, setSnapshots] = useState<RecordItem[]>([]),
    [active, setActive] = useState<RecordItem | null>(null);
  async function load() {
    setSnapshots(await api("/workspace/snapshots"));
  }
  useEffect(() => {
    run(load);
  }, []);
  return (
    <>
      <PageHead
        title="Prêt pour la prochaine étape."
        subtitle="Exports téléchargés et snapshots persistants. Les exemples fictifs restent explicitement identifiés."
      />
      <section className="panel u-pad">
        <h2>Exporter la période {month}</h2>
        <label className="u-checkbox"><input type="checkbox" checked={examples} onChange={e => setExamples(e.target.checked)} />Inclure les exemples fictifs — fichier marqué EXEMPLES</label>
        <label>
          Sélection
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="reviewed">
              Lignes revues humainement, sans doublon
            </option>
            <option value="all">
              Toutes les lignes hors banque — BROUILLON
            </option>
          </select>
        </label>
        <div className="u-cards u-export-cards">
          {[
            [
              "pdf",
              "Relevé PDF illustré",
              "Les mêmes lignes que le relevé Excel, avec synthèse, graphiques, tableaux et contrôles en couleurs.",
            ],
            [
              "xlsx",
              "Relevé Excel",
              "Structure des 13 colonnes Tableau5, feuille EDI et informations de contrôle.",
            ],
            [
              "csv",
              "Tableau CSV",
              "Séparateur point-virgule, UTF-8. Ouvrir les colonnes ICE et IF comme texte.",
            ],
            [
              "sage",
              "Écritures Sage",
              "Trois écritures équilibrées par ligne : charge, TVA et fournisseur. Mapping configurable.",
            ],
          ].map(([f, t, d]) => (
            <div className="u-card" key={f}>
              <Icon name="download" />
              <h3>{t}</h3>
              <p>{d}</p>
              <button
                className="primary"
                onClick={() =>
                  run(() => exportFile(f, scope, examples), "Export téléchargé")
                }
              >
                {f === 'pdf' ? 'Télécharger le PDF' : f === 'xlsx' ? 'Télécharger Excel' : 'Télécharger'}
              </button>
            </div>
          ))}
        </div>
        <div className="u-info">
          Le format Sage est un CSV de préparation à mapper dans votre assistant
          d’import Sage 100. Le fichier TVA est un fichier de travail ; aucun
          dépôt DGI n’est effectué.
        </div>
      </section>
      <section className="panel u-pad">
        <div className="u-row">
          <div>
            <h2>Snapshots de travail</h2>
            <p>
              Une copie immuable des lignes et des totaux au moment de sa
              création, téléchargeable en PDF.
            </p>
          </div>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await api("/workspace/snapshots", "POST", { month });
                await load();
              }, "Snapshot enregistré")
            }
          >
            Créer un snapshot
          </button>
        </div>
        {snapshots.length === 0 ? (
          <Empty text="Aucun snapshot pour le moment." />
        ) : (
          snapshots.map((s) => (
            <div className="u-task u-snapshot" key={s.id}>
              <span>
                <b>{s.data.month}</b> ·{" "}
                {new Date(s.data.createdAt).toLocaleString("fr-FR")} ·{" "}
                {s.data.author}
              </span>
              <button className="secondary small" onClick={() => setActive(s)}>
                Consulter
              </button>
              <button className="secondary small" onClick={() => run(
                () => download(`/workspace/snapshots/${encodeURIComponent(s.id)}/pdf`, `Waraqa-snapshot-${s.data.month}.pdf`),
                'Snapshot PDF téléchargé',
              )}>
                Télécharger le PDF
              </button>
            </div>
          ))
        )}
      </section>
      <DataMaintenance run={run} />
      {active && (
        <Modal
          title={"Snapshot " + active.data.month}
          close={() => setActive(null)}
        >
          <p>
            HT {money(active.data.summary.totalHt)} · TVA{" "}
            {money(active.data.summary.totalTva)} · TTC{" "}
            {money(active.data.summary.totalTtc)} MAD
          </p>
          <InvoiceTable rows={active.data.summary.rows} />
        </Modal>
      )}
    </>
  );
}
function Journal({ run }: { run: Run }) {
  const [events, setEvents] = useState<any[]>([]),
    [query, setQuery] = useState("");
  useEffect(() => {
    run(async () => setEvents((await api("/journal")).reverse()));
  }, []);
  return (
    <>
      <PageHead
        title="Chaque action laisse une trace."
        subtitle="Historique des imports, modifications, validations, rapprochements et exports."
      />
      <section className="panel u-pad">
        <input
          placeholder="Rechercher une action, un auteur, un identifiant…"
          aria-label="Rechercher dans le journal"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {events
          .filter((e) =>
            JSON.stringify(e).toLowerCase().includes(query.toLowerCase()),
          )
          .map((e) => (
            <div className="u-event" key={e.id}>
              <div className="u-event-icon">
                <Icon name="clock" size={17} />
              </div>
              <div>
                <b>{e.action.replaceAll("_", " ")}</b>
                <p>
                  {e.saisiPar || "Système"}{" "}
                  {e.factureId ? "· Ligne #" + e.factureId : ""}
                </p>
                {e.details && (
                  <details>
                    <summary>Détails</summary>
                    <pre>
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(e.details), null, 2);
                        } catch {
                          return e.details;
                        }
                      })()}
                    </pre>
                  </details>
                )}
              </div>
              <time>{new Date(e.horodatage).toLocaleString("fr-FR")}</time>
            </div>
          ))}
        {!events.length && (
          <Empty text="Les premières actions apparaîtront ici." />
        )}
      </section>
    </>
  );
}
