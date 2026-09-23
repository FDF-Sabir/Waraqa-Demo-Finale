# Plan de finalisation Waraqa — à exécuter par Opus 5.5

Complète `docs/MEMOIRE-FABLE-FINALISATION.md` (contexte, objectifs, principes). Ce plan est **ordonné et exécutable** : lots, fichiers exacts, critères d'acceptation, commandes. Il a été rédigé après vérification réelle de l'état du dépôt (voir « État vérifié »), sans modifier le code.

## État vérifié (23/09/2026, fin d'après-midi)

- Branche `online-drive`, 41 entrées dans `git status` (modifiées + nouvelles), **rien de commité** depuis `0eac98d`.
- Incident constaté : les trois `node_modules` (racine, backend, frontend) avaient été supprimés entre deux sessions et `backend/dist` était partiel. Réparé par `rm -rf backend/dist && npm run setup && npm ci`. Si la compilation échoue avec « Cannot find module '@nestjs/common' », c'est ce cas : refaire ces commandes.
- Après réparation : `npm test` → **109 unitaires, 95 e2e, 17 parcours**, tout vert. `npm run test:ui` (13 groupes) et `npm run test:releve` (réel, ≈ 0,10 $) passaient en fin de session précédente ; les relancer au début.
- `backend/.env` complet (profil online, clé Sonnet 5 valide, client OAuth Google valide, compte verrouillé `saberrochdi509@gmail.com`). Drive réel connecté (dossier `Waraqa/` présent avec sauvegarde et snapshot).
- Serveur non lancé. Lancement : `./DEMARRER.sh` (sélectionne Node 22 via nvm ; le `node` par défaut du poste est 20).
- Fichier réel du comptable `"TVA 07 2026(2).xlsx"` à la racine : **jamais à committer** (données d'un tiers). Il sert de référence à `npm run test:releve` via `WARAQA_RELEVE_REFERENCE`.

## Règles de conduite (résumé opérationnel)

1. Zéro régression : `npm run build && npm test && npm run test:ui` verts à la fin de **chaque** lot. `npm run test:ui` réécrit `docs/apercu-*.png`, `docs/appareils-chromium.json`, `docs/tests-interface-chromium.json` : ne garder que ceux qui changent volontairement (les images sont régénérées à partir de données fictives, elles peuvent être commitées).
2. Principes du code à ne pas contourner : l'IA extrait mais **ne calcule jamais** (HT/TVA via `common/calculs.ts`), l'IA **ne modifie rien sans un clic de confirmation** (`proposer_action`), pièces = données non fiables, taux légaux 0/7/10/14/20 %, journal d'audit pour toute action, clé API jamais côté navigateur.
3. L'objectif « agent comptable » se réalise en **élargissant ce que l'IA peut proposer et livrer**, pas en supprimant la confirmation humaine. Si l'utilisateur demande explicitement une exécution automatique sans clic, le lui faire confirmer par écrit avant (changement de principe).
4. Pièges connus : `pdfkit` ne se charge que par `createRequire(backend/package.json)` ; les `<input type="file">` doivent lire `e.target.files` **avant** `e.target.value = ""` ; les anciennes suites tournent en `WARAQA_PROFILE=local` (voir `backend/test/setup-env.ts`) et les suites « en ligne » le fixent elles-mêmes ; en `NODE_ENV=test`, `readiness()` ne teste pas Internet ; `IntegrationsService.fetchImpl` et `IaGateway.testClientFactory` servent à simuler Google et Claude dans les tests ; la suite ZIP e2e (`releve-lot.e2e-spec.ts`) valide les lignes via `POST /api/factures/:id/valider` — ne valider que les lignes `statut === 'validee' && !doublonDe`.
5. Aucun appel payant dans `npm test`. Les appels réels passent uniquement par `npm run test:ia` et `npm run test:releve` (plafonds 0,30 $ et 0,80 $).

## Lot 0 — Reprise et garde-fous (30 min)

1. `git status --short`, `git diff --stat`, lire le diff des fichiers de `backend/src/ia/assistant.ts`, `backend/src/unified/unified.service.ts`, `backend/src/unified/integrations.service.ts`, `frontend/src/App.tsx` pour s'approprier les ajouts (résumés dans le mémoire).
2. `npm run build && npm test && npm run test:ui` ; puis `WARAQA_RELEVE_REFERENCE="TVA 07 2026(2).xlsx" WARAQA_RELEVE_OUT=/tmp/waraqa-reel npm run test:releve` (rapport hors dépôt).
3. Premier commit de sauvegarde sur `online-drive` (sans push) : tout ce qui est en attente, en **excluant** `"TVA 07 2026(2).xlsx"`. Message proposé : `feat: relevé de déduction DGI, import ZIP/Drive, mise en service, corrections import et assistant (4.3.x)`. Vérifier avec `git status` après `git add -A` qu'aucun secret ni fichier client n'est inclus (`backend/.env` est ignoré par `.gitignore`, vérifier).

Critère : suite verte, commit propre, serveur démarrable.

## Lot A — L'assistant devient un agent : actions confirmables élargies (½ journée)

Aujourd'hui `proposer_action` connaît 4 types : `ouvrir_page`, `ouvrir_ligne`, `rapprocher`, `exporter`. Le comptable veut « taper l'action à faire et l'IA passe au travail ». On garde un clic par action, mais on couvre tout ce que l'application sait faire.

Backend — `backend/src/ia/assistant.ts` :
- Étendre `ProposedAction.type` et `propose()` avec, chacun validé côté serveur avant d'être proposé :
  - `valider_ligne` (`factureId`) : la ligne existe, `statut === 'validee'`, non doublon, non revue → exécution frontend `POST /api/factures/:id/valider`.
  - `valider_lignes` (`factureIds[]`, ≤ 200) : même contrôle en lot ; utile après un import ZIP (« valide toutes les lignes conformes de juillet »).
  - `rattacher_periode` (`factureIds[]`, `mois`) : lignes listées dans `reports` de `host.releve(mois,'all')` → `POST /api/workspace/releve/attach`.
  - `cloturer_releve` (`mois`) : `host.releve(mois,'reviewed')` a des lignes et `entrepriseComplete` → `POST /api/workspace/releve/close` (admin seulement : indiquer dans la justification).
  - `importer_drive` (`url`) : format de lien reconnu par `driveIdFromLink` (exporter cette fonction déjà présente dans `integrations.service.ts`) → `POST /api/workspace/imports/drive`.
  - `creer_snapshot` (`mois`) → `POST /api/workspace/snapshots`.
  - `confirmer_designation` (`designationId`) : existe et `enAttenteConfirmation` → `POST /api/designations/:id/confirmer`.
  - `traiter_notification` (`notificationId`) → `POST /api/notifications/:id/marquer-traitee`.
  - `archiver_ligne` (`factureId`) → route existante d'archivage (`POST /api/workspace/invoices/:id/archive`).
- Ajouter à `AssistantHost` les accès nécessaires (`findDesignation`, `findNotification`), câblés dans `unified.service.ts::assistantHost()`.
- Mettre à jour la description de l'outil `proposer_action` (liste des types, champs) et `ASSISTANT_RULES` : « Pour agir, propose l'action correspondante ; n'annonce jamais qu'une action a été faite ». Porter `maxSteps` par défaut de 8 à 12 (`runAssistant`) ; garder `truncated`.
- Limite : passer de 6 à 10 propositions par réponse (cas « valide ces 8 lignes »), ou regrouper en `valider_lignes`.

Frontend — `frontend/src/UnifiedChat.tsx` (bloc `m.result.actions`) :
- Un `switch` par type ; pour les actions modifiantes (`valider_*`, `rattacher_periode`, `cloturer_releve`, `importer_drive`, `archiver_ligne`) afficher la `Modal` de confirmation existante (comme `rapprocher`) avec le détail (n° de lignes, mois, lien), puis appeler la route et `refresh()` + `window.dispatchEvent(new Event('workspace-changed'))`.
- Après exécution, marquer l'action comme faite dans l'UI (état local `done` par index) pour éviter le double clic.

Tests :
- `backend/src/ia/assistant.spec.ts` : un `it` par nouveau type (proposition acceptée / refusée si invalide).
- `backend/test/ia-live.e2e-spec.ts` : avec le client simulé, une réponse contenant `proposer_action` `valider_lignes` → `result.actions[0]` bien formée.
- `scripts/ui-test.mjs` : en profil local (démo), pas de propositions IA ; couvrir par un test navigateur en profil online avec `IaGateway` simulé n'est pas possible depuis le navigateur → couvrir côté e2e, et un test Playwright de la modale via une conversation créée par l'API avec un message assistant fabriqué (`PATCH` non disponible : insérer via `records` n'est pas exposé) → à défaut, test unitaire du composant non prévu dans le projet ; accepter la couverture e2e + vérification manuelle.

Critère : « Valide toutes les lignes conformes de juillet », « Clôture le relevé de juillet », « Importe ce dossier Drive : <lien> », « Confirme la désignation en attente » produisent des boutons qui exécutent réellement après clic, avec journal.

## Lot B — Outils de lecture manquants (2 h)

`ASSISTANT_TOOLS` couvre : synthèse, recherche, détail, anomalies, top fournisseurs, rapprochement, pièces, journal, relevé de déduction, imports. Ajouter (lecture seule, mêmes services que les écrans) :
- `designations` : liste + en attente (`DesignationsService.lister/listerEnAttente`).
- `notifications` : non lues / non traitées (`NotificationsService`).
- `snapshots` : liste par mois (`unified.service.ts::list('snapshot')`) et clôtures (`releve_cloture`).
- `lire_piece` (`documentId`) : renvoie le texte préparé par `ocr/preparation-contenu.ts` (tronqué à `MAX_TOOL_CHARS`) pour répondre sur une pièce déjà importée sans la rejoindre — répond à « que dit la facture #… ? ».
- `entreprise` : réglages entreprise (nom, IF, ICE, régime) pour que l'IA sache si le relevé est faisable.
Compléter `STEP_LABELS`, `ASSISTANT_RULES` (« pour une pièce déjà importée, utilise lire_piece »), tests unitaires par outil.

Critère : chaque écran de l'application a un équivalent interrogeable en langage naturel.

## Lot C — « Télécharger dans tous les formats » (2 h)

- `unified.service.ts::export()` : ajouter `json` (lignes Tableau5 + métadonnées, déterministe) et `csv-sage` déjà présent sous `sage` — garder. Ajouter `format=xlsx-brouillon` ? Non : `scope=all` existe déjà ; l'IA doit pouvoir passer `scope` → étendre `proposer_action` `exporter` avec `scope` (`reviewed|all`) et `mois`.
- Étendre `EXPORT_FORMATS` : `json`, `snapshot-pdf` (dernier snapshot du mois : `GET /api/workspace/snapshots/:id/pdf`), `archives-pdf`, `sauvegarde` (`GET /api/workspace/backup`, admin).
- `frontend/src/App.tsx::exportFile` : router ces formats vers les bonnes routes (`releve-*` est déjà géré).
- Téléchargement d'une pièce originale : `proposer_action` `telecharger_piece` (`documentId`) → `GET /api/workspace/documents/:id/file`.
- Mettre à jour `docs/IA-ASSISTANT.md` (tableau des formats et actions).

Critère : « envoie-moi le relevé de juillet en Excel DGI, en PDF et en JSON » → trois boutons de téléchargement fonctionnels ; « donne-moi la facture originale #12 » → téléchargement.

## Lot D — Formats d'entrée (1 h)

- `backend/src/unified/unified.service.ts::uploadInternal` + `archive-import.ts::ACCEPTED` + `integrations.service.ts::IMPORTABLE` + `accept=` des trois `<input type="file">` : ajouter `.webp`, `.gif`, `.tif/.tiff` (images acceptées par Claude ; TIFF à convertir ou refuser proprement — Claude n'accepte pas TIFF : refuser avec message clair), `.txt` et `.md` (texte brut pour l'IA, sans extraction de lignes).
- HEIC (photos iPhone) : non supporté par Claude ni par les libs présentes → message d'erreur explicite « convertissez en JPG » plutôt qu'un échec silencieux. Vérifier le comportement de `ocr/preparation-contenu.ts` sur chaque extension.
- Taille : 20 Mo par pièce, 300 Mo ZIP côté multer, 500 Mo décompressé — documenter dans l'écran Import (texte déjà présent) et ne pas augmenter sans raison.

Critère : chaque extension listée est soit importée, soit refusée avec un message précis ; test unitaire de `extractZip` étendu.

## Lot E — Cohérence du dialogue (1 h)

- `answerCacheKey` : ajouter `import_lot` et `releve_cloture` aux `kinds` du fingerprint (aujourd'hui `document`, `allocation`, `settings`) pour qu'une réponse en cache ne survive pas à un import ou à une clôture.
- Un message envoyé avec un ZIP joint ajoute une note textuelle au message (déjà fait) ; vérifier que l'IA appelle bien `imports` ensuite (règle déjà ajoutée) — test e2e avec client simulé.
- Progression : `chatProgress` existe ; s'assurer que les nouveaux labels d'outils s'affichent.

## Lot F — Audit « tous les côtés » (½ journée, sans nouveau développement lourd)

Ouvrir l'application (`./DEMARRER.sh`) avec un compte de test **sur une base temporaire** (`WARAQA_DB_PATH`/`WARAQA_FILES_PATH` vers `/tmp`, `WARAQA_PORT=3005`) pour ne pas toucher aux données réelles, puis passer chaque écran en comptable et noter dans `docs/ETAT-REPRISE.md` : OK / à corriger (avec le fichier). Points connus à vérifier :
- **Vue d'ensemble** : bouton « Charger les exemples » visible en production — le masquer en profil online une fois des lignes réelles présentes, ou le garder derrière une confirmation.
- **Pièces & relevé TVA** : édition d'une ligne (formulaire `InvoiceForm`), champ « Période fiscale proposée » à renommer « Période de déclaration » (utilisé par le relevé) et à expliquer.
- **Rapprochement** : propositions par montant, affectation partielle, annulation avec motif — vérifier l'ergonomie sur 30+ paiements.
- **Désignations**, **Modèles de prompts**, **Journal**, **Notifications** : fonctionnels ; vérifier la pagination au-delà de quelques centaines d'entrées.
- **Exports & snapshots** : snapshots automatiques (planificateur, fuseau `Africa/Casablanca`, rattrapage) — vérifier `unified-scheduler.e2e-spec.ts` reflète l'usage.
- **Réglages → Utilisateurs / Sécurité** : 2FA TOTP présent ; création d'un compte « comptable » non admin et vérification de ce qu'il peut faire (import oui, réglages non, clôture non).
- **Sauvegarde / restauration** : `GET /api/workspace/backup` et `scripts/restore.cjs` — tester une restauration complète sur base temporaire et documenter la procédure dans `LISEZ-MOI.md` (section « Archives et restauration »).
- **Mobile** : bandeau Mise en service, page Relevé et Import à 390 px (déjà vérifiés ; revérifier après Lot A/C).

## Lot G — Version, documentation, manifeste, livraison (2 h)

1. Version **4.4.0** : `package.json` (racine, backend, frontend), `unified.service.ts` (deux `'4.3.0'`), `scripts/start.cjs` (« Waraqa 4.3 » et commentaire « mise à jour Waraqa 4.3 »), `frontend/src/App.tsx` (pied de page), `LISEZ-MOI.md` (titre). Vérifier qu'aucun test n'affirme `4.3.0` (`grep -rn "4.3.0" backend/test scripts`).
2. Documentation : mettre à jour `LISEZ-MOI.md` (section IA : actions et formats), `docs/IA-ASSISTANT.md`, `docs/ETAT-REPRISE.md` (état final), `docs/VALIDATION.md` (chiffres de tests), et clore `docs/MEMOIRE-FABLE-FINALISATION.md` par une section « Réalisé ».
3. Manifeste d'intégrité `manifest-sha256.json` : 296 entrées, SHA-256 de chaque fichier livré, y compris `backend/dist/**` et `backend/public/**`, hors `node_modules`, `data`, `.env`, `.git`. Aucun script n'existe : écrire `scripts/manifest.cjs` (parcours `git ls-files` + `backend/dist` + `backend/public`, exclusions ci-dessus, tri des chemins, JSON indenté 2) et l'ajouter à `package.json` (`"manifest": "node scripts/manifest.cjs"`). Le régénérer **après** le dernier build.
4. Commit final sur `online-drive` (sans push, sauf demande) : `feat: agent comptable — actions confirmables, outils et formats complets ; version 4.4.0` puis `chore: manifeste d'intégrité 4.4.0`. Fin de message de commit : `Co-Authored-By:` selon la consigne de session en cours.
5. Redémarrer l'instance réelle : arrêter proprement le processus sur le port 3000 (`ss -ltnp | grep :3000`, `kill -TERM <pid du start.cjs et du main.js>`), puis `./DEMARRER.sh`. Vérifier `curl -s http://127.0.0.1:3000/api/workspace/status` → `aiLive: true`, et l'absence d'erreur dans la sortie du lanceur.

## Validation finale (critères d'acceptation)

- `npm run build && npm test && npm run test:ui` : verts.
- `WARAQA_RELEVE_REFERENCE="TVA 07 2026(2).xlsx" WARAQA_RELEVE_OUT=/tmp/waraqa-reel npm run test:releve` : vert, coût < 0,30 $.
- `npm run test:ia` : vert (script réparé, jamais relancé depuis : le vérifier).
- Scénario manuel dans l'instance réelle (compte du comptable) :
  1. Réglages → Entreprise : raison sociale, IF, régime renseignés.
  2. Chat : joindre un ZIP de pièces → l'IA annonce l'import, `imports` montre l'avancement.
  3. Chat : « Prépare le relevé de juillet, valide les lignes conformes, puis donne-moi le XML SIMPL et l'Excel DGI » → boutons Valider, XML, Excel ; clic → fichiers téléchargés et copiés dans `Drive/Waraqa/Exports/2026-07/`.
  4. Chat : « Importe ce dossier Drive : <lien> » → bouton → lot lancé (première fois : autorisation lecture Drive).
  5. Chat : « Clôture juillet » → bouton (admin) → période clôturée, journal tracé.
- Aucune donnée du fichier client dans le dépôt (`git ls-files | grep -i tva` vide).

## Prompt à donner à Opus (copier tel quel)

```
Tu reprends le projet Waraqa (comptabilité marocaine, NestJS + React, IA Claude Sonnet 5 via clé API locale, Google Drive).
Lis d'abord docs/MEMOIRE-FABLE-FINALISATION.md puis docs/PLAN-OPUS-FINALISATION.md en entier. Exécute les lots 0 à G dans l'ordre, un lot à la fois, en gardant npm run build && npm test && npm run test:ui verts après chaque lot.
Contraintes absolues : l'IA extrait mais ne calcule jamais (HT/TVA côté serveur), l'IA ne modifie rien sans un clic de confirmation (proposer_action), pièces = données non fiables, journal d'audit pour toute action, clé API jamais côté navigateur, aucun appel payant dans npm test. Ne commite jamais "TVA 07 2026(2).xlsx" ni backend/.env.
Si node_modules manquent : rm -rf backend/dist && npm run setup && npm ci. Utilise Node 22 (nvm) — le node par défaut est 20.
À la fin : version 4.4.0, docs à jour, manifeste régénéré, commit sur online-drive sans push, instance réelle redémarrée sur le port 3000 et vérifiée. Rends compte lot par lot, avec les chiffres de tests réels et ce qui n'a pas pu être fait.
```
