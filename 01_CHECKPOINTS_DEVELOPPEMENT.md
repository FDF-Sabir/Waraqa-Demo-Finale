# Reprise du développement Waraqa

Demande du 24/09/2026 : appliquer le plan directeur `00_PLAN_DIRECTEUR_WARAQA_INTELLIGENCE_COMPTABLE.md`, travailler par checkpoints et ne jamais perdre l'avancement.

## État durable

- Base initiale : `b74d060` (4.5.0), plan directeur commité en `3a28438`.
- Branche de développement : `claude/charming-knuth-gum8u3` (poussée sur `origin` après chaque checkpoint).
- Environnement : dépôt cloné sans `backend/data/` ni `.env` ; toutes les vérifications utilisent une base SQLite et un stockage temporaires (tests e2e) — aucune donnée réelle, aucun appel IA payant (client Anthropic simulé).
- Node 22, dépendances installées par `npm ci` dans `backend/` et `frontend/`.
- Preuves : `docs/checkpoints/CP*.log` (build et tests), datées du commit qui les contient.

## Règles de reprise

1. Lire ce fichier, puis `git log --oneline -15` sur la branche.
2. Chaque checkpoint = code + tests ciblés + mise à jour de ce fichier + commit + push.
3. Tests toujours sur base temporaire, profil `local`, fournisseurs simulés.
4. Une limite de contexte n'est pas une validation : ne cocher que ce qui est démontré par un test ou un log.
5. Ne jamais réécrire l'historique de la branche.

## Journal des checkpoints

| Checkpoint | Lot du plan | État | Preuve |
|---|---|---|---|
| CP01 — Baseline | L0 | Réalisé | `docs/checkpoints/CP01-*.log` : build OK, 121 unitaires, 100 e2e |
| CP02 — Verrou de clôture commun | L1.4 | À faire | Reproduire puis fermer tous les chemins de mutation d'une période clôturée |
| CP03 — Sauvegarde complète | L1.5 | À faire | Livrables et boîte d'envoi Drive dans la sauvegarde ; restauration vérifiée |
| CP04 — Rôles documentaires, contrat Drive, catalogue | L1.2, L1.3, L2.1 | À faire | Un modèle/historique/référentiel ne crée aucune ligne ; catalogue réel des capacités |
| CP05 — Lecture des gros classeurs | L3.1 | À faire | Index + lecture par plages avec couverture ; plus de refus à 50 000 caractères |
| CP06 — Précontrôle et plan de travail | L1.1, L8.1 | À faire | Blocages harmonisés UI/IA ; entonnoir À classer → Clôture |
| CP07 — Clôture versionnée | L5.3 | À faire | Version figée complète, export depuis la version, réouverture tracée |
| CP08 — Doublons explicables | L2.4 | À faire | Groupe de comparaison, décision humaine réversible |
| CP09 — Rapports rédactionnels | L3.4 | À faire | Markdown/PDF téléchargeables depuis le chat |
| CP10 — Orchestrateur fiable | L4.2, L4.3, L4.4 | À faire | Pagination avec couverture, provenance des corrections, missions persistées, bilan structuré |
| CP11 — Interface pilotée | L8 | À faire | Cockpit, rôles à l'import, capacités, missions |
| CP12 — Documentation et recette | L10 | À faire | Suite complète verte, version, manifeste |

## Prochaine action exacte

CP02 : créer `backend/src/common/period-lock.ts`, l'appliquer dans `FacturesService` (modifier, validerLigne, confirmerSansFacture) et `UnifiedService` (archive, restore, reconcile, cancelAllocation, releveAttach, releveDetach, linkDocument), écrire `backend/test/closed-period.e2e-spec.ts`.
