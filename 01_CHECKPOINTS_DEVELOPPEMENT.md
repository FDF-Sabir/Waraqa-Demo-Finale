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
| CP02 — Verrou de clôture commun | L1.4 | Réalisé | `backend/src/common/period-lock.ts` appliqué à PUT/PATCH /factures, création déclarée, archivage, liaison de pièce, affectation, annulation, rattachement, détachement, agent ; `backend/test/closed-period.e2e-spec.ts` (6 tests) ; `docs/checkpoints/CP02-tests.log` : 106 e2e verts |
| CP03 — Sauvegarde complète | L1.5 | Réalisé | Format `waraqa-backup-2` (SQLite, originaux, livrables, boîte d'envoi) ; `scripts/restore.cjs` refuse un livrable référencé absent ; `docs/checkpoints/CP03-tests.log` |
| CP04 — Rôles documentaires, contrat Drive, catalogue | L1.2, L1.3, L2.1 | Réalisé | `document-role.ts` (8 rôles, signaux chemin/structure/périodes/identité, contradiction de société), statut `reference` sans ligne, reclassement tracé `POST /workspace/documents/:id/role`, outil `importer_drive` (dossier/fichier/Sheets, rôle), outil et route `capacites`, `pieces` paginé ; tests `document-role.spec.ts` (7), `document-roles.e2e-spec.ts` (4) ; `docs/checkpoints/CP04-tests.log` |
| CP05 — Lecture des gros classeurs | L3.1 | Réalisé | `workbook-reader.ts` (index : feuilles, plages, en-têtes, formules, fusions, noms, mappage XML, identité ; plages ≤ 200 lignes avec total/couvert/reste, formules sans cache et dates signalées), outils `lire_classeur`/`lire_plage`, `lire_piece` paginé, classeur joint au chat = index + aperçu (plus de refus) ; tests `workbook-reader.spec.ts` (4), `workbook-chat.e2e-spec.ts` ; `docs/checkpoints/CP05-tests.log` |
| CP06 — Précontrôle et plan de travail | L1.1, L8.1 | Réalisé (backend) | `cockpit.ts` : blocages codés avec gravité, identifiants et action qui les lève ; entonnoir 6 étapes avec invites IA ; routes `precontrole` / `plan-travail`, outils `precontroler_releve` / `plan_de_travail` ; `cockpit.e2e-spec.ts` (3) ; interface en CP11 |
| CP07 — Clôture versionnée | L5.3 | Réalisé | `releve_version` immuable (en-tête, lignes, écartées + contrôles, alertes, totaux, règles versionnées, empreintes XML/XLSX), export définitif depuis la version (`-vN`), réouverture avec motif conservant l'historique, routes `releve/versions` ; `releve-version.e2e-spec.ts` (3) ; `docs/checkpoints/CP07-tests.log` |
| CP08 — Doublons explicables | L2.4 | Réalisé | Groupe de comparaison (critères communs / différences, pièces, décisions possibles) `GET /workspace/invoices/:id/doublon`, outil `comparer_doublons`, décision humaine `lever_doublon` (motif, journal, exemption respectée par la re-détection) ; `doublons-rapport.e2e-spec.ts` |
| CP09 — Rapports rédactionnels | L3.4 | Réalisé | `report-pdf.ts` (Markdown → PDF paginé, métadonnées, sources et limites), outil `generer_rapport` (md + pdf livrés, tracés) ; `report-pdf.spec.ts`, `assistant.spec.ts`, `doublons-rapport.e2e-spec.ts` ; `docs/checkpoints/CP08-tests.log` |
| CP10 — Orchestrateur fiable | L4.2–L4.5 | Réalisé | Provenance obligatoire + `expectedVersion` sur `corriger_ligne` (journal avant/après/source/version), idempotence des actions répétées, missions persistées (`mission-*`, checkpoints à chaque appel, statuts terminee/interrompue/echouee, outil `etat_mission`, route `GET /workspace/missions`), bilan structuré, réservation de budget libérée en toute issue ; `missions.e2e-spec.ts` (3) ; `docs/checkpoints/CP10-tests.log` |
| CP11 — Interface pilotée | L8 | Réalisé | `frontend/src/Cockpit.tsx` (plan de travail, blocages avec actions, rôles, capacités, missions) intégré au tableau de bord, à l'import, au relevé (versions, réouverture motivée) et au chat (rôle des pièces jointes, bilan) ; parcours navigateur `scripts/ui-test-cockpit.mjs` (8 étapes, 0 erreur console, connexion admin@gmail.com) → `docs/tests-interface-cockpit.json`, captures `docs/apercu-plan-de-travail.png`, `apercu-capacites.png`, `apercu-import-roles.png`, `apercu-precontrole.png` ; `npm run test:smoke` vert (`docs/checkpoints/CP11-smoke.log`) |
| CP13 — Compléments agent (itération 2) | L4, L7.1, L3.4 | Réalisé | Pièce jointe au chat en attente (`a_comptabiliser`) puis `comptabiliser_piece` sur demande ; `corriger_lignes` (masse, résultat ligne par ligne) ; `calculer` (exact, sans eval) ; consignes mémorisées sur demande explicite, injectées au prompt, révocables (`/workspace/consignes`) ; `generer_classeur` (Excel libre ≤ 20 feuilles) ; rapport HTML ; proposition `autoriser_drive` ; `agent-extras.spec.ts`, `staging-consignes.e2e-spec.ts` ; `docs/checkpoints/CP13-tests.log` |
| CP14 — Import durable et manifeste | L2.2, L2.5 | Réalisé | Archive ZIP conservée (`data/lots/`, sauvegardée), origine Drive conservée, reprise des lots `en_cours` au démarrage sans rejouer les entrées traitées (`recoverLots`), reprise manuelle `POST /workspace/imports/:id/reprendre`, manifeste `?dryRun=true` (rôles prévus, exclusions, rien stocké), rôle prévu par entrée ; `lot-reprise.e2e-spec.ts` ; `docs/checkpoints/CP14-tests.log` |
| CP12 — Documentation et recette | L10 | Réalisé | Version 4.6.0 (paquets, statut, pied de page, lanceur), `LISEZ-MOI.md`, `docs/IA-ASSISTANT.md`, `docs/ETAT-REPRISE.md`, manifeste SHA-256 régénéré ; recette complète : 136 unitaires, 123 e2e, smoke (17 parcours), navigateur historique (13 groupes, 14 viewports) et cockpit (8 étapes), 0 erreur console — `docs/checkpoints/CP12-*.log` |

## Rapport final de cette itération (24/09/2026)

**Livré et démontré** (tests datés du commit qui les contient) : lots L0, L1 (complet), L2.1 / L2.4, L3.1 / L3.4, L4.2–L4.5 (fondations), L5.3, L8.1 / L8.5, ainsi que le catalogue des capacités et le contrat Drive. Chaque point est vérifié par un test automatisé ou un parcours navigateur listé dans le tableau ci-dessus.

**Ce qui n'a pas été fait dans cette itération et reste au plan** (ne pas le déclarer réalisé) :

- L2.2 / L2.3 / L2.5 : prévisualisation d'un lot hétérogène avant engagement, mapping versionné par source, file d'import durable avec reprise complète après redémarrage (les lots interrompus restent signalés, les pièces déjà traitées acquises).
- L3.2 / L3.3 / L3.5 : adaptation versionnée du modèle du comptable, feuilles de synthèse/contrôles/sources dans l'Excel de travail, vérification visuelle sous Excel/LibreOffice.
- L5.1 / L5.2 / L5.4 / L5.5 : registre de règles fiscales validées par un comptable référent (les règles actuelles sont archivées avec chaque version mais restent un comportement logiciel), paiements partiels / avoirs / prorata, essai contrôlé de dépôt SIMPL.
- L6 (banque, référentiel fournisseurs, avoirs assistés), L7 (mémoire métier, veille), L8.2–L8.4 (vues multi-mois, brouillons durables, accessibilité approfondie), L9 (multi-sociétés), L10.1–L10.3 (CI, recette sécurité/charge, installation reproductible).
- Recette avec la clé Anthropic réelle (`npm run test:ia`) : non exécutée ici (aucune clé dans cet environnement) ; tous les parcours IA de cette itération utilisent le client simulé. À lancer sur le poste du comptable avec le plafond `WARAQA_TEST_BUDGET_USD`.

**Prochaine action exacte** : L2.5 (file d'import durable : persister `load` par entrée — hash + chemin — et reprendre un lot `interrompu` depuis son dernier item au redémarrage), puis L2.2 (aperçu du lot par rôle/période avant engagement des extractions payantes), puis L5.1 avec le comptable référent.
