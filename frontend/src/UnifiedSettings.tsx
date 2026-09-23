import Integrations from "./Integrations";
import TwoFactor from "./TwoFactor";
import AiSettings from "./AiSettings";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Modal, PageHead, type Run } from "./App";
export default function Settings({
  settings,
  user,
  run,
  refresh,
  initialTab,
}: {
  initialTab?: string;
  settings: any;
  user: any;
  run: Run;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("drive") ? "integrations" : initialTab || "company"),
    [form, setForm] = useState<any>(structuredClone(settings)),
    [prefs, setPrefs] = useState<any>(null),
    [users, setUsers] = useState<any[]>([]),
    [newUser, setNewUser] = useState(false),
    [remove, setRemove] = useState<any>(null),
    [dirty, setDirty] = useState(false);
  const admin = user.role === "admin";
  useEffect(() => {
    setForm(structuredClone(settings));
    setDirty(false);
  }, [settings]);
  useEffect(() => {
    run(async () => {
      setPrefs(await api("/reglages"));
      if (admin) setUsers(await api("/workspace/users"));
    });
  }, []);
  function set(section: string, key: string, value: any) {
    setForm((p: any) => ({ ...p, [section]: { ...p[section], [key]: value } }));
    setDirty(true);
  }
  function field(section: string, key: string, label: string, type = "text") {
    return (
      <label>
        {label}
        <input
          type={type}
          value={form[section][key]}
          disabled={!admin}
          onChange={(e) => set(section, key, e.target.value)}
        />
      </label>
    );
  }
  async function save() {
    await api("/workspace/settings", "PUT", form);
    await refresh();
  }
  const tabs = [
    ["company", "Entreprise"],
    ["ai", "Assistant IA"],
    ["preferences", "Préférences"],
    ["exports", "Exports & snapshots"],
    ["users", "Utilisateurs"],
    ["security", "Sécurité"],
    ["integrations", "Intégrations"],
  ];
  return (
    <>
      <PageHead
        title="Un espace à votre mesure."
        subtitle="Les réglages sont enregistrés sur le serveur. La clé API s’ajoute dans l’onglet Assistant IA."
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          {tabs.map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </aside>
        <section className="panel u-pad u-settings">
          {tab === "company" && (
            <>
              <h2>Votre entreprise</h2>
              <p>
                Ces informations figurent en tête du relevé de déduction (XML
                SIMPL et modèle Excel DGI) et dans les exports.
              </p>
              <div className="formgrid u-form">
                {field("company", "name", "Raison sociale")}
                {field("company", "ice", "ICE")}
                {field("company", "iff", "Identifiant fiscal (IF)")}
                <label>
                  Régime TVA (relevé de déduction)
                  <select
                    value={form.company.regime ?? 1}
                    disabled={!admin}
                    onChange={(e) => set("company", "regime", Number(e.target.value))}
                  >
                    <option value={1}>1 — Encaissement (déduction au mois du paiement)</option>
                    <option value={2}>2 — Débits (déduction au mois de la facture)</option>
                  </select>
                </label>
                {field("company", "city", "Ville")}
                {field("company", "address", "Adresse")}
              </div>
            </>
          )}
          {tab === "ai" && (
            <AiSettings form={form} set={set} admin={admin} run={run} refresh={refresh} />
          )}
          {tab === "preferences" && (
            <>
              <h2>Affichage et notifications</h2>
              <div className="formgrid u-form">
                <label>
                  Densité des tableaux
                  <select
                    disabled={!admin}
                    value={form.preferences.density}
                    onChange={(e) =>
                      set("preferences", "density", e.target.value)
                    }
                  >
                    <option value="compact">Compacte</option>
                    <option value="normal">Normale</option>
                    <option value="comfortable">Confortable</option>
                  </select>
                </label>
                <label>
                  Devise
                  <input disabled value="MAD — pas de conversion automatique" />
                </label>
                <label>
                  Langue
                  <input disabled value="Français" />
                </label>
              </div>
              {prefs && (
                <>
                  <div className="u-task">
                    <span>Notifications dans l’application</span>
                    <input
                      type="checkbox"
                      aria-label="Notifications dans l’application"
                      checked={prefs.notif_push_web}
                      onChange={(e) =>
                        setPrefs({ ...prefs, notif_push_web: e.target.checked })
                      }
                    />
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      run(async () => {
                        await api("/reglages", "PUT", prefs);
                        await refresh();
                      }, "Préférences de notification enregistrées")
                    }
                  >
                    Enregistrer mes notifications
                  </button>
                  <p>
                    La cloche conserve l’historique. Cette préférence active le
                    badge de la cloche. Les emails et le push hors application
                    nécessitent un service externe.
                  </p>
                </>
              )}
            </>
          )}
          {tab === "exports" && (
            <>
              <h2>Préparation Sage 100</h2>
              <p>Paramétrez vos comptes selon le plan comptable du dossier.</p>
              <div className="formgrid u-form">
                {field("export", "journal", "Code journal")}
                {field("export", "charge", "Compte de charge")}
                {field("export", "tva", "Compte TVA")}
                {field("export", "fournisseur", "Compte fournisseur")}
              </div>
              <div className="u-info">
                CSV de préparation, à mapper dans Sage 100. Testez sur une copie
                du dossier avant tout import comptable.
              </div>
              {prefs && (
                <>
                  <h3>Snapshots automatiques</h3>
                  <label>
                    Fréquence
                    <select
                      value={prefs.frequence_snapshot}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          frequence_snapshot: e.target.value,
                        })
                      }
                    >
                      <option value="hebdomadaire">Hebdomadaire</option>
                      <option value="bi_mensuel">Bi-mensuel (1 et 16)</option>
                      <option value="fin_de_mois">Fin de mois</option>
                    </select>
                  </label>
                  <button
                    className="secondary"
                    onClick={() =>
                      run(
                        () => api("/reglages", "PUT", prefs),
                        "Cadence enregistrée",
                      )
                    }
                  >
                    Enregistrer la cadence
                  </button>
                  <p>
                    La cadence du premier administrateur est utilisée pour les
                    snapshots automatiques de cet espace, quand l’option est
                    activée et le serveur démarré.
                  </p>
                </>
              )}
            </>
          )}
          {tab === "users" && (
            <>
              <div className="u-row">
                <h2>Membres de l’espace</h2>
                {admin && (
                  <button className="primary" onClick={() => setNewUser(true)}>
                    Ajouter un compte
                  </button>
                )}
              </div>
              <p>
                Tous les membres accèdent au même dossier comptable local. Les
                discussions sont privées à leur auteur.
              </p>
              {!admin ? (
                <p>Seul un administrateur gère les comptes.</p>
              ) : (
                users.map((u) => (
                  <div className="u-task" key={u.id}>
                    <span>
                      <b>{u.nom}</b>
                      <small>
                        {u.email} · {u.role}
                      </small>
                    </span>
                    <button
                      className="secondary small"
                      disabled={u.id === user.id}
                      onClick={() => setRemove(u)}
                    >
                      Supprimer
                    </button>
                  </div>
                ))
              )}
            </>
          )}
          {tab === "security" && (
            <>
              <h2>Sécurité du compte</h2>
              <form
                className="u-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const body = Object.fromEntries(new FormData(el));
                  run(async () => {
                    await api("/workspace/password", "POST", body);
                    el.reset();
                  }, "Mot de passe modifié");
                }}
              >
                <label>
                  Mot de passe actuel
                  <input
                    name="current"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  Nouveau mot de passe
                  <input
                    name="next"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                  />
                </label>
                <button className="primary">Modifier le mot de passe</button>
              </form>
              <TwoFactor run={run} />
            </>
          )}
          {tab === "integrations" && (
            <>
              <h2>Connexions & automatisation</h2>
              {user.role === 'admin' ? <Integrations run={run} /> : <p>Les connecteurs externes sont gérés par l’administrateur.</p>}
              <div className="u-task">
                <span><b>Synchronisation Google Drive automatique</b><small>Chaque pièce importée, export, snapshot est envoyé dès que possible (file durable, reprise après coupure).</small></span>
                <input type="checkbox" aria-label="Synchronisation Drive automatique" disabled={!admin} checked={form.integrations.driveAutoSync !== false} onChange={e=>set('integrations','driveAutoSync',e.target.checked)} />
              </div>
              <div className="u-task">
                <span><b>Sauvegarde complète quotidienne dans Drive</b><small>Base et pièces originales (sans la clé API ni backend/.env), dossier Waraqa/Sauvegardes.</small></span>
                <input type="checkbox" aria-label="Sauvegarde Drive quotidienne" disabled={!admin} checked={form.integrations.driveDailyBackup !== false} onChange={e=>set('integrations','driveDailyBackup',e.target.checked)} />
              </div>
              <label>Sauvegardes conservées dans Drive (1 à 90)<input type="number" min="1" max="90" disabled={!admin} value={form.integrations.driveBackupKeep ?? 14} onChange={e=>set('integrations','driveBackupKeep',Number(e.target.value))} /></label>
              <label>Fuseau du planificateur<input value={form.integrations.timeZone || 'Africa/Casablanca'} onChange={e=>set('integrations','timeZone',e.target.value)} /></label>
              <label>Rattrapage au démarrage (jours, maximum 7)<input type="number" min="0" max="7" value={form.integrations.catchUpDays || 0} onChange={e=>set('integrations','catchUpDays',Number(e.target.value))} /></label>
              <p>Un rattrapage photographie les données au moment du redémarrage. Il ne reconstitue pas leur état historique.</p>
              <div className="u-task">
                <span>
                  <b>Snapshots automatiques locaux</b>
                  <small>
                    Exécution à la cadence choisie tant que le serveur tourne.
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Activer snapshots automatiques"
                  disabled={!admin}
                  checked={form.integrations.autoExport}
                  onChange={(e) =>
                    set("integrations", "autoExport", e.target.checked)
                  }
                />
              </div>
            </>
          )}
          {["company", "ai", "preferences", "exports", "integrations"].includes(
            tab,
          ) && (
            <div className="u-modal-footer">
              <span>
                {admin
                  ? "Les changements s’appliquent à cet espace."
                  : "Réglages partagés en lecture seule."}
              </span>
              <button
                className="primary"
                disabled={!admin || !dirty}
                onClick={() => run(save, "Réglages enregistrés")}
              >
                Enregistrer
              </button>
            </div>
          )}
        </section>
      </div>
      {newUser && (
        <Modal
          title="Ajouter un utilisateur local"
          close={() => setNewUser(false)}
        >
          <form
            className="u-form"
            onSubmit={(e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                await api("/workspace/users", "POST", b);
                setUsers(await api("/workspace/users"));
                setNewUser(false);
              }, "Compte créé");
            }}
          >
            <label>
              Nom
              <input name="nom" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Mot de passe initial
              <input
                name="motDePasse"
                type="password"
                required
                minLength={10}
              />
            </label>
            <label>
              Rôle
              <select name="role">
                <option value="comptable">Comptable</option>
                <option value="admin">Administrateur</option>
              </select>
            </label>
            <button className="primary">Créer le compte</button>
            <p>Aucun email d’invitation n’est envoyé.</p>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="Supprimer ce compte ?" close={() => setRemove(null)}>
          <p>
            {remove.nom} · {remove.email}
          </p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await api("/workspace/users/" + remove.id, "DELETE");
                setUsers(await api("/workspace/users"));
                setRemove(null);
              }, "Compte supprimé")
            }
          >
            Confirmer
          </button>
        </Modal>
      )}
    </>
  );
}
