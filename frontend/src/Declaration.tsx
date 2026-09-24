import { useEffect, useState } from "react";
import { api, download, money } from "./api";
import { Empty, Modal, PageHead, Status, type Page, type Run } from "./App";
import { Blocages } from "./Cockpit";

const MODES: Record<number, string> = { 1: "Espèces", 2: "Chèque", 3: "Prélèvement", 4: "Virement", 5: "Effet", 6: "Compensation", 7: "Autre" };
const pct = (t: number) => Math.round(t * 100) + " %";

/** Relevé de déduction TVA (DGI, modèle ADC082F-15I) : contrôle, rattachement, fichiers de dépôt. */
export default function Declaration({
  month,
  user,
  run,
  go,
  openInvoice,
  refresh,
}: {
  month: string;
  user: any;
  run: Run;
  go: (p: Page) => void;
  openInvoice: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(null),
    [pre, setPre] = useState<any>(null),
    [draft, setDraft] = useState(false),
    [picked, setPicked] = useState<number[]>([]),
    [confirm, setConfirm] = useState<"close" | "validate" | "reopen" | null>(null),
    [motif, setMotif] = useState(""),
    [showAll, setShowAll] = useState(false);
  const scope = draft ? "all" : "reviewed";
  async function load() {
    const [r, p] = await Promise.all([api(`/workspace/releve?month=${month}&scope=${scope}`), api(`/workspace/precontrole?month=${month}`).catch(() => null)]);
    setData(r); setPre(p);
  }
  useEffect(() => {
    setPicked([]);
    run(load);
  }, [month, draft]);
  useEffect(() => {
    const changed = () => run(load);
    window.addEventListener("workspace-changed", changed);
    return () => window.removeEventListener("workspace-changed", changed);
  }, [month, draft]);
  const admin = user.role === "admin";
  const file = (format: string) =>
    run(
      () => download(`/workspace/releve/export?month=${month}&format=${format}&scope=${scope}`, `Releve-deduction-${month}${draft ? "-BROUILLON" : ""}.${format}`),
      "Fichier téléchargé",
    );
  // Lignes écartées uniquement parce qu'elles n'ont pas encore été revues : validables en lot.
  const onlyReview = (data?.ecartees || []).filter((e: any) => e.controles.filter((c: any) => c.niveau === "erreur").every((c: any) => c.code === "revue"));
  const regime = data?.header.regime === 2 ? "Régime des débits" : "Régime de l’encaissement";
  if (!data) return <Empty text="Chargement du relevé…" />;
  const lines = showAll ? data.lignes : data.lignes.slice(0, 100);
  return (
    <>
      <PageHead
        eyebrow="DÉCLARATION TVA · ARTICLE 112 DU CGI"
        title="Relevé de déduction."
        subtitle={`${data.header.raisonSociale || "Entreprise à renseigner"} · IF ${data.header.identifiantFiscal || "—"} · Période ${String(data.header.periode).padStart(2, "0")}/${data.header.annee} · ${regime}`}
      >
        <label className="u-check">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
          Brouillon (inclure les lignes non revues)
        </label>
      </PageHead>
      {!data.entrepriseComplete && (
        <div className="u-alert u-error" role="alert">
          Raison sociale et identifiant fiscal (IF) de l’entreprise requis pour produire le relevé.
          {admin && <button className="secondary small" onClick={() => go("reglages")}>Compléter</button>}
        </div>
      )}
      {data.cloture && (
        <div className="u-info">
          <b>Relevé clôturé</b> le {new Date(data.cloture.createdAt).toLocaleString("fr-FR")} par {data.cloture.author} · version {data.cloture.version || 1} · {data.cloture.ids.length} ligne(s) · TVA {money(data.cloture.totaux.tva)} MAD · empreinte XML {String(data.cloture.xmlSha256 || "").slice(0, 12)}…
          <br /><small>Les fichiers définitifs proviennent de cette version figée ; toute modification exige une réouverture motivée.</small>
          {admin && <button className="secondary small" onClick={() => { setMotif(""); setConfirm("reopen"); }}>Rouvrir</button>}
        </div>
      )}
      {pre && <Blocages items={pre.blocages} go={go} run={run} done={load} title="Précontrôle de la période" />}
      <div className="u-stats">
        {[
          ["Lignes retenues", String(data.totaux.lignes), `${data.ecartees.length} écartée(s)`],
          ["TVA déductible", money(data.totaux.tva) + " MAD", "Total du relevé"],
          ["Montant HT", money(data.totaux.mHt) + " MAD", "Hors taxes"],
          ["Montant TTC", money(data.totaux.mTtc) + " MAD", `${data.alertes.length} alerte(s)`],
        ].map(([label, value, hint]) => (
          <div className="u-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      <section className="panel u-pad">
        <div className="u-row">
          <h2>Fichiers de dépôt</h2>
          <div className="u-actions">
            <button className="primary" disabled={!data.lignes.length || !data.entrepriseComplete} onClick={() => file("xml")}>XML EDI (SIMPL)</button>
            <button className="secondary" disabled={!data.lignes.length || !data.entrepriseComplete} onClick={() => file("xlsx")}>Excel modèle DGI</button>
            <button className="secondary" disabled={!data.lignes.length || !data.entrepriseComplete} onClick={() => file("pdf")}>PDF</button>
            {admin && !data.cloture && !draft && (
              <button className="secondary" disabled={!data.lignes.length || !data.entrepriseComplete} onClick={() => setConfirm("close")}>Clôturer la période</button>
            )}
          </div>
        </div>
        <p className="u-muted">
          Seules les lignes revues et conformes figurent dans les fichiers. Le XML reprend la structure « DeclarationReleveDeduction » du modèle Excel DGI (Tableau5) ; l’Excel conserve le mappage XML pour un export depuis Excel si besoin.
        </p>
        {data.totaux.parTaux.length > 0 && (
          <div className="u-table-scroll">
            <table className="u-table">
              <thead><tr><th>Taux</th><th>Lignes</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead>
              <tbody>
                {data.totaux.parTaux.map((t: any) => (
                  <tr key={t.taux}><td>{pct(t.taux)}</td><td>{t.lignes}</td><td>{money(t.mHt)}</td><td><b>{money(t.tva)}</b></td><td>{money(t.mTtc)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {data.versions?.length > 0 && (
        <section className="panel u-pad">
          <h2>Versions figées ({data.versions.length})</h2>
          <p className="u-muted">Chaque clôture crée une version immuable (en-tête, lignes, contrôles, totaux, règles, empreintes). Une réouverture conserve la version et son motif.</p>
          <div className="u-table-scroll">
            <table className="u-table u-versions">
              <thead><tr><th>Version</th><th>Clôturée le</th><th>Par</th><th>Lignes</th><th>TVA</th><th>Écartées</th><th>Règles</th><th>État</th></tr></thead>
              <tbody>
                {data.versions.map((v: any) => (
                  <tr key={v.id}>
                    <td><b>n° {v.version}</b><small>{String(v.empreintes?.xml || "").slice(0, 12)}…</small></td>
                    <td>{new Date(v.createdAt).toLocaleString("fr-FR")}</td>
                    <td>{v.author}</td>
                    <td>{v.lignes}</td>
                    <td><b>{money(v.tva)}</b></td>
                    <td>{v.ecartees}</td>
                    <td><small>{v.regles}</small></td>
                    <td>{v.reouverte ? <><Status tone="amber">rouverte</Status><small>{new Date(v.reouverte.le).toLocaleDateString("fr-FR")} · {v.reouverte.motif}</small></> : <Status tone="green">en vigueur</Status>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data.ecartees.length > 0 && (
        <section className="panel u-pad">
          <div className="u-row">
            <h2>Lignes écartées ({data.ecartees.length})</h2>
            {onlyReview.length > 0 && (
              <button className="secondary small" onClick={() => setConfirm("validate")}>Valider {onlyReview.length} ligne(s) conforme(s)</button>
            )}
          </div>
          <p className="u-muted">Corrigez la ligne (ouvrir) ou validez-la après contrôle de la pièce : elle rejoint alors le relevé.</p>
          <div className="u-table-scroll">
            <table className="u-table">
              <thead><tr><th>Ligne</th><th>Fournisseur</th><th>TTC</th><th>Motifs</th><th></th></tr></thead>
              <tbody>
                {data.ecartees.slice(0, 300).map((e: any) => (
                  <tr key={e.ligne.id}>
                    <td><b>#{e.ligne.id}</b><small>{e.ligne.factNum || "Sans n°"}</small></td>
                    <td>{e.ligne.libFrss || "—"}<small>{e.ligne.iceFrs || ""}</small></td>
                    <td>{money(e.ligne.mTtc)}</td>
                    <td>{e.controles.map((c: any, i: number) => <small key={i} className={c.niveau === "erreur" ? "u-bad" : "u-warn"}>{c.message}</small>)}</td>
                    <td><button className="secondary small" onClick={() => run(() => openInvoice(e.ligne.id))}>Ouvrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data.alertes.length > 0 && (
        <section className="panel u-pad">
          <h2>Alertes à vérifier ({data.alertes.length})</h2>
          {data.alertes.slice(0, 100).map((a: any, i: number) => (
            <div className="u-task" key={i}>
              <span>#{a.id} · {a.message}</span>
              <button className="secondary small" onClick={() => run(() => openInvoice(a.id))}>Ouvrir</button>
            </div>
          ))}
        </section>
      )}
      {data.reports.length > 0 && !data.cloture && (
        <section className="panel u-pad">
          <div className="u-row">
            <h2>Déductions tardives possibles ({data.reports.length})</h2>
            <button className="secondary small" disabled={!picked.length} onClick={() => run(async () => { setData(await api("/workspace/releve/attach", "POST", { ids: picked, month })); setPicked([]); if (draft) await load(); }, "Lignes rattachées à la période")}>
              Rattacher {picked.length || ""} à {month}
            </button>
          </div>
          <p className="u-muted">Paiements des 12 derniers mois non encore déclarés (art. 101-3° CGI : délai d’un an). Cochez ceux à déclarer sur cette période.</p>
          <div className="u-table-scroll">
            <table className="u-table">
              <thead><tr><th></th><th>Ligne</th><th>Fournisseur</th><th>Mois d’origine</th><th>TVA</th><th>Contrôles</th></tr></thead>
              <tbody>
                {data.reports.slice(0, 300).map((r: any) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" aria-label={"Rattacher #" + r.id} checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} /></td>
                    <td><b>#{r.id}</b><small>{r.factNum || "Sans n°"}</small></td>
                    <td>{r.libFrss || "—"}</td>
                    <td>{r.moisOrigine}</td>
                    <td>{money(r.tva)}</td>
                    <td>{r.controles.filter((c: any) => c.niveau === "erreur").length ? <Status tone="amber">à corriger</Status> : <Status tone="green">conforme</Status>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel u-pad">
        <h2>Lignes du relevé ({data.lignes.length})</h2>
        {data.lignes.length === 0 ? (
          <Empty text="Aucune ligne conforme sur cette période : importez vos pièces, puis corrigez ou validez les lignes écartées." />
        ) : (
          <div className="u-table-scroll">
            <table className="u-table">
              <thead><tr><th>OR</th><th>Facture</th><th>Fournisseur</th><th>IF / ICE</th><th>Taux</th><th>TTC</th><th>TVA</th><th>Paiement</th><th>Facture du</th></tr></thead>
              <tbody>
                {lines.map((l: any) => (
                  <tr key={l.id} onClick={() => run(() => openInvoice(l.id))} style={{ cursor: "pointer" }}>
                    <td>{l.ord}</td>
                    <td><b>{l.factNum}</b><small>{l.designation}</small></td>
                    <td>{l.libFrss}{l.fiscalMonth && l.fiscalMonth !== (l.datePaie || "").slice(0, 7) && <small>rattachée à {l.fiscalMonth}</small>}</td>
                    <td><small>{l.iff}</small><small>{l.iceFrs}</small></td>
                    <td>{pct(l.taux)}</td>
                    <td>{money(l.mTtc)}</td>
                    <td><b>{money(l.tva)}</b></td>
                    <td>{l.datePaie}<small>{MODES[l.idPaie]}</small></td>
                    <td>{l.dateFac}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!showAll && data.lignes.length > 100 && <button className="secondary small" onClick={() => setShowAll(true)}>Afficher les {data.lignes.length} lignes</button>}
          </div>
        )}
      </section>
      {confirm === "close" && (
        <Modal title="Clôturer le relevé" close={() => setConfirm(null)}>
          <p>{data.lignes.length} ligne(s) · TVA déductible {money(data.totaux.tva)} MAD. Les lignes restent rattachées à {month} et ne seront plus proposées en déduction tardive. Vous pourrez rouvrir la période.</p>
          <div className="u-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>Annuler</button>
            <button className="primary" onClick={() => run(async () => { setData(await api("/workspace/releve/close", "POST", { month })); setConfirm(null); }, "Relevé clôturé")}>Clôturer</button>
          </div>
        </Modal>
      )}
      {confirm === "reopen" && (
        <Modal title="Rouvrir la période" close={() => setConfirm(null)}>
          <p>La version {data.cloture?.version || 1} reste conservée avec votre motif. Les lignes déclarées redeviennent modifiables ; une nouvelle clôture créera la version suivante.</p>
          <label className="u-form">Motif de la réouverture
            <input aria-label="Motif de la réouverture" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : correction d’une désignation sur la ligne #12" />
          </label>
          <div className="u-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>Annuler</button>
            <button className="primary" disabled={motif.trim().length < 5} onClick={() => run(async () => { await api("/workspace/releve/reopen", "POST", { month, motif: motif.trim() }); setConfirm(null); await load(); await refresh(); }, "Relevé rouvert")}>Rouvrir</button>
          </div>
        </Modal>
      )}
      {confirm === "validate" && (
        <Modal title="Valider les lignes conformes" close={() => setConfirm(null)}>
          <p>{onlyReview.length} ligne(s) passent tous les contrôles DGI mais n’ont pas été revues. Confirmez que vous avez vérifié les pièces correspondantes : elles seront marquées revues et rejoindront le relevé.</p>
          <div className="u-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>Annuler</button>
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  for (const e of onlyReview) await api(`/factures/${e.ligne.id}/valider`, "POST");
                  setConfirm(null);
                  await load();
                  await refresh();
                }, "Lignes validées")
              }
            >
              Valider {onlyReview.length} ligne(s)
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
