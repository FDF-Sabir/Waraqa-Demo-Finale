import { useEffect, useState } from "react";
import { api } from "./api";
import type { Run } from "./App";

const usd = (n: number) => (n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " $";
const FEATURES: Record<string, string> = { chat: "Discussion", extraction: "Lecture des pièces", test: "Tests de connexion" };

/**
 * Réglages → Assistant IA : clé (enregistrée côté serveur, jamais relue), test de
 * connexion, modèle, niveau de réflexion, budget mensuel, cache et consommation.
 */
export default function AiSettings({
  form,
  set,
  admin,
  run,
  refresh,
}: {
  form: any;
  set: (section: string, key: string, value: any) => void;
  admin: boolean;
  run: Run;
  refresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState<any>(null),
    [key, setKey] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [test, setTest] = useState<any>(null),
    [testing, setTesting] = useState(false);
  const load = async () => setStatus(await api("/workspace/ai"));
  useEffect(() => {
    run(load);
  }, []);
  const presets: any[] = form.ai.presets || [];
  const custom = !presets.some((p) => p.id === form.ai.model);
  async function saveKey() {
    const body: any = { key: key.trim() };
    if (advanced) body.workspaceId = workspace.trim();
    setStatus(await api("/workspace/ai/key", "PUT", body));
    setKey("");
    setTest(null);
    await refresh();
  }
  async function testKey() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api("/workspace/ai/test", "POST"));
    } catch (e: any) {
      setTest({ ok: false, error: e.message });
    } finally {
      setTesting(false);
      await load().catch(() => undefined);
    }
  }
  const usage = status?.usage;
  const ratio = usage && usage.inputTokens + usage.cacheReadTokens > 0
    ? Math.round((usage.cacheReadTokens / (usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)) * 100)
    : 0;
  return (
    <>
      <h2>Assistant IA (Claude)</h2>
      <section className="u-ai-card">
        <header>
          <span className={"u-dot " + (status?.keyConfigured ? "ok" : "")} />
          <div>
            <b>{status?.keyConfigured ? "Clé API enregistrée" : "Aucune clé API"}</b>
            <small>
              {status?.keyConfigured
                ? `${status.keyMask} · conservée dans backend/.env sur ce poste, jamais renvoyée au navigateur.`
                : "Sans clé, Waraqa fonctionne en mode démo (analyses locales, saisie manuelle)."}
            </small>
          </div>
        </header>
        {admin ? (
          <form
            className="u-form u-key-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(saveKey, "Clé enregistrée. Cliquez sur « Tester la connexion ».");
            }}
          >
            <label>
              {status?.keyConfigured ? "Remplacer la clé" : "Coller votre clé API Anthropic"}
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-api03-…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <button type="button" className="u-text-button" onClick={() => setAdvanced(!advanced)}>
              {advanced ? "Masquer l’option avancée" : "Clé de portée « Organisation » ?"}
            </button>
            {advanced && (
              <label>
                Identifiant d’espace de travail (uniquement pour une clé de portée Organisation ; laisser vide sinon)
                <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="wrkspc_…" />
              </label>
            )}
            <div className="u-actions">
              <button className="primary" disabled={!key.trim().startsWith("sk-ant-")}>
                Enregistrer la clé
              </button>
              <button type="button" className="secondary" disabled={!status?.keyConfigured || testing} onClick={testKey}>
                {testing ? "Test en cours…" : "Tester la connexion"}
              </button>
              {status?.keyConfigured && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      setStatus(await api("/workspace/ai/key", "DELETE"));
                      setTest(null);
                      await refresh();
                    }, "Clé supprimée, mode démo réactivé")
                  }
                >
                  Supprimer la clé
                </button>
              )}
            </div>
          </form>
        ) : (
          <p>Seul un administrateur peut enregistrer ou tester la clé.</p>
        )}
        {test && (
          <div className={"u-alert " + (test.ok ? "u-success" : "u-error")} role="status">
            {test.ok
              ? `Connexion réussie : ${test.model} a répondu « ${test.reply} » en ${(test.latencyMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s (coût ≈ ${usd(test.costUsd)}). `
              : test.error}
          </div>
        )}
        {test?.ok && form.ai.mode !== "live" && admin && (
              <button
                type="button"
                className="primary u-activate"
                onClick={() =>
                  run(async () => {
                    await api("/workspace/settings", "PUT", { ai: { mode: "live" } });
                    await refresh();
                  }, "Mode connecté activé : la discussion utilise Claude")
                }
              >
                Activer le mode connecté
              </button>
        )}
      </section>

      <div className="u-form">
        <label>
          Mode
          <select disabled={!admin} value={form.ai.mode} onChange={(e) => set("ai", "mode", e.target.value)}>
            <option value="demo">Démo — analyses locales, aucun appel externe</option>
            <option value="live" disabled={!form.ai.keyConfigured}>
              Connecté — Claude lit les pièces et répond dans la discussion
            </option>
          </select>
        </label>
        <label>
          Modèle
          <select
            disabled={!admin}
            value={custom ? "__custom" : form.ai.model}
            onChange={(e) => set("ai", "model", e.target.value === "__custom" ? "" : e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="__custom">Autre identifiant…</option>
          </select>
        </label>
        {custom && (
          <label>
            Identifiant du modèle Anthropic
            <input disabled={!admin} value={form.ai.model} placeholder="claude-…" onChange={(e) => set("ai", "model", e.target.value.trim())} />
          </label>
        )}
        <label>
          Niveau de réflexion
          <select disabled={!admin} value={form.ai.effort} onChange={(e) => set("ai", "effort", e.target.value)}>
            <option value="low">Rapide — questions simples, coût minimal</option>
            <option value="medium">Équilibré — recommandé</option>
            <option value="high">Approfondi — audits complexes, plus lent et plus cher</option>
          </select>
        </label>
        <label>
          Budget mensuel maximum (USD)
          <input
            type="number"
            min={0.01}
            max={1000}
            step={0.5}
            disabled={!admin}
            value={form.ai.monthlyBudgetUsd}
            onChange={(e) => set("ai", "monthlyBudgetUsd", Number(e.target.value))}
          />
        </label>
        <label className="u-ai-check">
          <input
            type="checkbox"
            disabled={!admin}
            checked={form.ai.cacheAnswers}
            onChange={(e) => set("ai", "cacheAnswers", e.target.checked)}
          />
          Réutiliser une réponse identique tant que les données n’ont pas changé (0 $, bouton « Régénérer » disponible)
        </label>
        <label>
          Consignes de l’entreprise pour l’assistant
          <textarea rows={5} disabled={!admin} value={form.ai.instructions} onChange={(e) => set("ai", "instructions", e.target.value)} />
        </label>
      </div>

      {usage && (
        <section className="u-ai-usage">
          <h3>Consommation estimée — {usage.month}</h3>
          <div className="u-ai-meter" aria-label="Budget consommé">
            <i style={{ width: Math.min(100, (usage.costUsd / Math.max(0.01, status.budgetUsd)) * 100) + "%" }} />
          </div>
          <p>
            <b>{usd(usage.costUsd)}</b> sur {status.budgetUsd} $ · {usage.calls} appel(s) · {usage.cacheHits || 0} réponse(s) réutilisée(s) sans coût
            {ratio ? ` · ${ratio} % des tokens lus depuis le cache` : ""}
          </p>
          {Object.keys(usage.byFeature || {}).length > 0 && (
            <ul>
              {Object.entries(usage.byFeature).map(([k, v]: any) => (
                <li key={k}>
                  {FEATURES[k] || k} : {usd(v)}
                </li>
              ))}
            </ul>
          )}
          <small>
            Estimation selon les tarifs publics (Sonnet 5 : 2 $ / 10 $ par million de tokens entrants / sortants). La facture réelle
            est dans la Console Claude → Billing. Les appels sont bloqués une fois le budget atteint.
          </small>
        </section>
      )}
    </>
  );
}
