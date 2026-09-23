# Prompt final — Waraqa 4.2 → version de production locale

> À coller tel quel dans Claude Code (VS Code), ouvert à la racine du dossier `Waraqa-Demo-Finale`.
> Modèle conseillé : **Claude Sonnet 5**, niveau de réflexion moyen. Passer à Opus 5.5 uniquement pour un blocage d’architecture.

---

Tu reprends **Waraqa**, application locale de préparation comptable de FEM (Finder Electronic Morocco, Casablanca) : capture et lecture des pièces, relevé de déduction TVA au format **Tableau5 (13 colonnes, art. 112 CGI)**, rapprochement bancaire, exports Excel/PDF/Sage, journal, snapshots, et un **assistant IA (Claude)** pour le comptable. Tu es architecte, développeur full stack et responsable qualité. **Exécute** : pas d’audit seul, pas de plan qui attend validation. Décide les choix techniques courants et documente-les.

## 0. Règles non négociables

1. **L’IA lit, explique et propose ; elle ne calcule pas et ne décide pas.** HT/TVA, contrôles, doublons, rapprochements, exports = code déterministe testé. Toute mutation passe par un clic humain et une route serveur existante avec ses validations.
2. **Aucune clé** dans le code, le frontend, Git, un ZIP, une capture, un log ou un rapport. La clé vit uniquement dans `backend/.env` (écrite par Réglages → Assistant IA). Ne lis jamais `backend/.env` pour afficher son contenu. Une capture de clé présente dans le dossier (ex. `API KEY*.png`) doit être signalée à l’utilisateur pour suppression et rester exclue de Git et des ZIP.
3. **Aucune perte de données** : sauvegarde de `backend/data/` avant toute évolution, migrations TypeORM versionnées, pas de remise à zéro de base, pas de suppression de fonctionnalité pour faire passer un test.
4. **Aucun faux succès** : un service externe non configuré affiche son état réel ; aucune réponse IA simulée hors des tests.
5. Travail sur une branche Git dédiée, commits atomiques et compilables, un point de retour avant chaque lot.

## 1. État de départ (vérifie-le toi-même avant de modifier)

Lis dans l’ordre : `LISEZ-MOI.md`, `docs/ETAT-REPRISE.md`, `docs/IA-ASSISTANT.md`, `docs/FUSION-ET-ARCHITECTURE.md`, `docs/VALIDATION.md`.

Stack : NestJS 10 + TypeORM + SQLite (`backend/`), React 19 + Vite (`frontend/`, build dans `backend/public`), SDK `@anthropic-ai/sdk` 0.127, Node 22/24.

Livré en 4.2.0 :
- Passerelle IA unique `backend/src/ocr/ia-gateway.ts` (concurrence, délai, reprises, reprise sans options refusées, erreurs traduites, client bloqué en test).
- Clé, tarifs et coût : `backend/src/ia/ia-config.ts`. Routes : `GET /api/workspace/ai`, `PUT|DELETE /api/workspace/ai/key`, `POST /api/workspace/ai/test`, `GET /api/workspace/conversations/:id/progress`.
- Assistant à outils en lecture seule + `proposer_action` : `backend/src/ia/assistant.ts` ; orchestration, budget, consommation, cache des réponses : `UnifiedService.liveReply`, `recordUsage`, `assertBudget`, `answerCacheKey`.
- Extraction structurée : `backend/src/ocr/extraction-ia-live.service.ts` + `prompt-extraction.ts`.
- Interface : `frontend/src/UnifiedChat.tsx` (Markdown sûr, actions, sources, coût, progression, Régénérer), `AiSettings.tsx`, `Markdown.tsx`, bouton « Demander à Waraqa » dans l’éditeur de ligne.

Commandes de référence (toutes doivent rester vertes après chaque lot) :
```sh
npm run setup        # dépendances + build
npm run build
npm test             # unitaires (92) + e2e (78) + parcours intégrés (17)
npm run test:ui      # navigateur (11 groupes) — WARAQA_BROWSER_PATH si besoin
npm run test:ia      # RÉEL avec la clé de backend/.env, données fictives, plafond WARAQA_TEST_BUDGET_USD (0,30 $)
```
Établis ton propre état de référence et note-le dans `docs/ETAT-REPRISE.md` avant toute modification.

## 2. Lot A — Validation réelle de l’IA (priorité absolue)

1. Vérifie que la clé est configurée **sans l’afficher** (`GET /api/workspace/ai` → `keyConfigured`, `keyMask`). Si absente : demande à l’utilisateur de la coller dans Réglages → Assistant IA, rien d’autre.
2. Lance `npm run test:ia`. Analyse `docs/tests-ia-reelle.json` : champs exacts, confiance, coût, tokens lus en cache.
3. Si l’API refuse `output_config` (effort/format) ou `thinking` pour le modèle configuré, la passerelle rappelle sans ces options : vérifie-le dans le rapport, puis corrige la forme du schéma JSON (propriétés optionnelles, `additionalProperties: false`) plutôt que de supprimer la fonctionnalité.
4. Constitue `examples/ia-verite-terrain/` : 10 pièces **fictives** (facture 20 %, facture multi-taux 20 %/10 %, avoir, ticket carburant, DUM douane avec convention IF/ICE `1111`, quittance, avis de virement, extrait de relevé CIH, photo inclinée, scan peu lisible) + `verite_terrain.json`. Écris `scripts/eval-extraction.cjs` : exactitude par champ et par document, montants avec tolérance 0,01, erreurs critiques (montant, ICE, taux), coût total. Ne modifie jamais la vérité terrain pour améliorer un score.
5. Améliore le prompt d’extraction à partir des erreurs mesurées (exemples positifs/négatifs, règles multi-taux : une ligne par taux). Relance la mesure. Consigne avant/après dans `docs/VALIDATION.md`.
6. Assistant : 10 questions types du comptable (anomalies, top fournisseurs, paiements orphelins, comparaison de deux mois, détail d’une ligne, pièce jointe à expliquer, « que faire avant l’export ? »). Vérifie que chaque chiffre cité correspond aux outils, que les lignes sont citées par `#id`, que les actions proposées sont valides. Corrige `ASSISTANT_RULES` ou les outils, jamais en laissant le modèle calculer.

## 3. Lot B — Services IA supplémentaires (sans casser)

Règles : `IaGateway` + `recordUsage('<fonction>')` + `assertBudget()`, sortie structurée filtrée par liste blanche, résultat = **proposition** appliquée seulement après clic via une route existante, test e2e avec `IaGateway.testClientFactory` (cas valide, invalide, budget atteint).

1. **Relevés bancaires PDF** (SGMB, CIH, BMCE) : extraction d’une ligne par mouvement (`releve_bancaire`), solde et frais d’incident identifiés, import idempotent (`importKey`), puis rapprochement proposé (montant exact + fournisseur normalisé + fenêtre de dates) avec confirmation existante.
2. **Mapping de colonnes** d’un Excel/CSV inconnu : l’IA propose, l’écran d’aperçu d’import existant (`importPreview`) le fait accepter ou corriger ; mapping mémorisé.
3. **Désignation proposée** : parmi le référentiel existant, avec justification ; confirmation dans le flux « en attente » des désignations.
4. **Normalisation des fournisseurs** (variantes d’orthographe, ex. « RIYAD HICHAM » / « HICHAM RIYAD ») : dictionnaire d’alias déterministe + suggestion IA de regroupement, fusion uniquement après confirmation, journalisée.
5. **Commentaire de synthèse** mensuel rédigé par l’IA, relu puis inséré dans le PDF de snapshot.
6. **Lots de pièces** : file durable (reprise après redémarrage, annulation, progression par pièce) ; option API **Batches** (−50 %) pour les gros volumes non urgents, avec état visible.

## 4. Lot C — Expérience de l’assistant

1. **Streaming** de la réponse finale (SSE) avec annulation ; une réponse interrompue est marquée incomplète, jamais présentée comme complète. Conserve la progression des outils.
2. Recherche dans le contenu des discussions ; export d’une discussion en PDF.
3. Mémoire d’entreprise : consignes et conventions (comptes Sage, fournisseurs récurrents) éditables dans les réglages et injectées dans le bloc système mis en cache.
4. Accessibilité des nouveaux composants (focus, clavier, contraste, lecteurs d’écran) et formats 320 → 1920 px.

## 5. Lot D — Capture mobile (objectif V1 d’origine)

Application web installable (PWA : manifeste, icône Waraqa, `capture="environment"` sur l’import) servie en local sur le réseau de l’entreprise **uniquement si l’utilisateur l’active** (hôte `0.0.0.0` + avertissement de sécurité) ; photo → pièce conservée → extraction → écran de validation. Pas de mode hors ligne qui prétendrait enregistrer des écritures non synchronisées : file d’attente d’envoi explicite seulement.

## 6. Lot E — Classeur Tableau5 réel et Google Drive

1. Export dans le **classeur réel du comptable** (feuille `EDI`, table `Tableau5`, en-tête société/IF/année/période/régime) en préservant la macro VBA et le XML Map d’export DGI : écrire les valeurs dans la table existante d’une copie, jamais reconstruire le fichier. Test : ouverture du fichier produit, 13 colonnes, formules HT/TVA intactes, totaux identiques à l’export Excel de Waraqa.
2. Google Drive : terminer l’OAuth serveur existant (droits minimaux, dossier dédié, déconnexion, déduplication) et l’archivage des pièces et exports. Ne jamais prétendre à une connexion réelle sans compte autorisé par l’utilisateur.

## 7. Qualité, sécurité, réception

- Après chaque lot : build + `npm test` + `npm run test:ui` verts ; nouveaux tests pour chaque comportement ; aucun test désactivé ou affaibli.
- Défauts classés P0 (perte de données, accès indu, clé exposée) → P3 (finition). Tous les P0/P1 corrigés et rejoués.
- Coûts : budget mensuel respecté, coût réel de chaque campagne `test:ia`/éval consigné ; aucun stress test sur le fournisseur (charge sur nos services avec client simulé).
- Documentation à jour : `LISEZ-MOI.md` (utilisateur, en français simple), `docs/IA-ASSISTANT.md`, `docs/VALIDATION.md` (résultats datés, ce qui n’a pas été vérifié), `docs/ETAT-REPRISE.md` (commit, commandes, prochaine action exacte).
- Livrable : ZIP unique `Waraqa-<version>.zip` sans `node_modules`, `backend/data/`, `.env`, capture de clé ni donnée réelle ; vérifié par extraction propre + `npm run setup` + démarrage.

Réception « production locale » : parcours complet vérifié avec la vraie clé (import de vraies pièces → extraction → correction → revue → rapprochement → export Excel/Tableau5 → snapshot → sauvegarde/restauration), mesures d’extraction publiées, budget et coûts constatés, aucune régression.

**Commence maintenant par l’état de référence, puis le lot A. Rends compte brièvement à la fin de chaque lot : ce qui est fait, preuves (tests, mesures, coûts), ce qui reste.**
