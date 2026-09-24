# État de reprise — 24 septembre 2026 · version 4.7.0 (intelligence comptable pilotée)

## Ajouté en 4.7.0 (checkpoints CP13–CP16)

- Pièce jointe au chat en attente (`a_comptabiliser`, `?staging=true`), `comptabiliserPiece`, route `POST /api/workspace/documents/:id/comptabiliser`.
- `unified/agent-extras.ts` : `calculer`, `classeurLibre`, `markdownHtml` ; outils `corriger_lignes`, `calculer`, `generer_classeur`, rapport `html`.
- Consignes mémorisées (`consigne-*`, `GET/POST/DELETE /api/workspace/consignes`), injectées au prompt système.
- Import durable : `data/lots/<lot>.zip` conservé et sauvegardé, `recoverLots()` au démarrage, `POST /api/workspace/imports/:id/reprendre`, `?dryRun=true` (manifeste), `rolePrevu` par entrée.
- `unified/qualite.ts` : qualité d’extraction et fiabilité ; `GET /api/workspace/qualite`, outil `qualite_extraction` ; bilan quotidien (`brief-*`, `GET /api/workspace/briefs`, réglage `integrations.dailyBrief`).
- Analyse des manques restants : `docs/ANALYSE-DES-MANQUES-4.7.md` ; rapport des travaux : `docs/RAPPORT-TRAVAUX-WARAQA-4.7.pdf`.

## Ajouté en 4.6.0 (branche `claude/charming-knuth-gum8u3`, checkpoints CP01–CP12)

Suivi détaillé, preuves et prochaine action : `01_CHECKPOINTS_DEVELOPPEMENT.md` ; diagnostic et backlog : `00_PLAN_DIRECTEUR_WARAQA_INTELLIGENCE_COMPTABLE.md`.

- **Verrou de période commun** (`backend/src/common/period-lock.ts`) appliqué à toutes les mutations d’une ligne déclarée dans un relevé clôturé (routes `/factures`, atelier, agent) — `closed-period.e2e-spec.ts`.
- **Sauvegarde format 2** (`backup.ts`, `scripts/restore.cjs`) : originaux + fichiers livrés + boîte d’envoi Drive, livrable référencé absent refusé à la restauration.
- **Rôles documentaires** (`unified/document-role.ts`) : classification déterministe (chemin, structure Tableau5, périodes, identité), statut `reference` sans ligne, contradiction de société signalée, reclassement `POST /api/workspace/documents/:id/role` — `document-roles.e2e-spec.ts`.
- **Lecteur de classeurs** (`unified/workbook-reader.ts`) : index et plages ; chat sans refus à 50 000 caractères — `workbook-chat.e2e-spec.ts`.
- **Cockpit** (`unified/cockpit.ts`, `frontend/src/Cockpit.tsx`) : précontrôle et plan de travail, routes `precontrole` / `plan-travail`, outils `precontroler_releve` / `plan_de_travail` — `cockpit.e2e-spec.ts`, parcours `scripts/ui-test-cockpit.mjs`.
- **Clôture versionnée** (`releve_version`, `GET /api/workspace/releve/versions`, réouverture motivée) — `releve-version.e2e-spec.ts`.
- **Doublons explicables** (`GET /api/workspace/invoices/:id/doublon`, `POST …/doublon/lever`, outil `comparer_doublons`, proposition `lever_doublon`) et **rapports** (`unified/report-pdf.ts`, outil `generer_rapport`) — `doublons-rapport.e2e-spec.ts`.
- **Orchestrateur** : provenance + `expectedVersion`, idempotence, missions (`mission-*`, `GET /api/workspace/missions`, outil `etat_mission`), bilan, réservation de budget — `missions.e2e-spec.ts`.
- Catalogue des capacités (`GET /api/workspace/capacites`, outil `capacites`), outil `importer_drive` (dossier, fichier, Sheets, rôle).
- Résultats : voir `01_CHECKPOINTS_DEVELOPPEMENT.md` (suite unitaire, e2e, smoke, navigateur).

## Historique — version 4.5.0 (l’agent fait le travail)

### Ajouté en 4.5.0

- Choix de l’utilisateur : **agent + 2 validations**. L’agent exécute lui-même les traitements réversibles (`AgentActions` dans `backend/src/ia/assistant.ts`, implémentées par `UnifiedService.agentActions`) ; seuls « lignes revues », clôture et archivage passent par un bouton confirmé.
- Fichiers livrés (`livrable`, stockés dans `data/livrables/`, route `GET /api/workspace/livrables/:id`, propriétaire ou administrateur) ; tableau sur mesure `UnifiedService.customTable` (route `POST /api/workspace/tableau`).
- Reprise automatique après import (`chatInternal` : `lotIds`, `pending` ; `runLot` → `resumeConversations`), message « Reprise automatique » dans le chat, suivi de l’import pendant l’attente.
- Résultats : 121 unitaires, 100 e2e, 17 parcours, 13 groupes navigateur ; parcours réel ZIP → agent → validation → XML définitif réussi.


## Historique — version 4.4.0 (branche `online-drive`)

- **Relevé de déduction DGI** (modèle ADC082F-15I, art. 112 CGI) — `backend/src/unified/releve.ts`, page `frontend/src/Declaration.tsx` : contrôles DGI, lignes écartées avec motif, déductions tardives ≤ 12 mois, XML SIMPL, Excel au modèle officiel (`backend/src/assets/releve-deduction-modele.xlsx`, régénérable par `scripts/build-releve-template.cjs`), PDF, clôture. Guide : `docs/RELEVE-DEDUCTION.md`.
- **Import de dossiers** : ZIP (`archive-import.ts`) ou lien de dossier Google Drive (`integrations.service.ts::readFolder`, portée `drive.readonly` demandée à la première utilisation), traités en arrière-plan (`startLot`/`runLot`). Lecture tolérante des tableaux (`table-import.ts`). Entrées : PDF, JPG, PNG, GIF, WEBP, XLSX, XLS, CSV, JSON ; HEIC/TIFF/Word/e-mail refusés avec la conversion à faire.
- **Agent comptable** (`backend/src/ia/assistant.ts`) : 16 outils en lecture, 14 types d’actions proposées (validation, rattachement, clôture, import Drive, snapshot, désignation, notification, archivage, rapprochement, téléchargements en 11 formats, pièce originale), vérifiées côté serveur puis exécutées après confirmation dans le chat (`UnifiedChat.tsx::executeAction`). Principe inchangé : l’IA ne calcule ni ne modifie rien elle-même.
- **Mise en service** : `GET /api/workspace/readiness` et bandeau ; sans clé, plus aucune réponse préenregistrée en profil en ligne. `DEMARRER.sh` choisit Node ≥ 22 via nvm.
- Corrections : sauvegarde pendant un import (`backup.ts`), sélecteurs de fichiers, doublons des commissions bancaires, réponse tronquée de l’assistant, bouton annoncé sans proposition, listes longues (journal, pièces) affichées par tranches, libellés comptables.

Résultats 4.4.0 : 118 unitaires, 98 e2e, 17 parcours intégrés, 13 groupes navigateur ; validations réelles `test:ia` et `test:releve` réussies (détail dans `VALIDATION.md`).

Reste à faire côté poste : renseigner Réglages → Entreprise (raison sociale, IF, régime) ; au premier import par lien Drive, autoriser la lecture ; vérifier le premier dépôt du XML sur SIMPL.

---

## Historique — version 4.3.0


### Ajouté en 4.3.0

- **Profil `online`** (`WARAQA_PROFILE`, défaut) — `backend/src/common/profile.ts` : clé présente ⇒ mode IA `live` imposé (réglages, extraction des pièces, route historique `/api/ocr`). `WARAQA_PROFILE=local` restaure le comportement 4.2.
- **Google Drive** — `backend/src/unified/integrations.service.ts` : OAuth PKCE `openid email drive.file`, compte verrouillé par `GOOGLE_ALLOWED_EMAIL` (e-mail vérifié du id_token, révocation si refus), identifiants saisis dans l’UI (JSON Google ou champs) écrits dans `backend/.env`, arborescence `Waraqa/{Pièces/AAAA-MM, Exports/AAAA-MM, Snapshots, Sauvegardes}` créée et recréée si supprimée.
- **File durable** `drive_job` (table `workspace_records`, aucune migration) : pièces (à l’import), exports (boîte d’envoi `data/drive-outbox/`), snapshots PDF, sauvegarde quotidienne + rotation (14) ; reprise 2^n min plafonnée à 6 h, 8 essais ; dédoublonnage SHA-256 ; rafraîchissement du jeton sur 401 ; `invalid_grant` ⇒ « reconnexion nécessaire » sans perte ; cycle toutes les 60 s et 1,5 s après chaque ajout.
- Routes : `PUT /api/workspace/drive/credentials`, `POST /api/workspace/drive/sync` ; callback redirigé vers `/?drive=ok|erreur#/reglages`.
- Interface : Réglages → Intégrations (étapes 1-2-3, état, historique, Synchroniser maintenant, Déconnecter) ; Assistant IA verrouillé en connecté ; libellés profil.
- Lanceur : complète `backend/.env` avec les nouvelles variables sans modifier les existantes, affiche Internet/IA/Drive, ouvre le navigateur.

Résultats 4.3.0 : 92 unitaires, **87 e2e** (dont 9 `online-drive.e2e-spec.ts`, Google simulé), 17 parcours intégrés, 11 groupes navigateur — tous réussis.

**Non vérifié ici** : appel réel à l’API Anthropic et à Google (réseau du bac à sable fermé, clé non utilisée). Prochaine action : sur le poste, lancer, vérifier « IA Claude connectée » au démarrage, **Tester la connexion**, puis suivre `docs/GOOGLE-DRIVE.md` et contrôler `Mon Drive/Waraqa/`.

---

## Historique — version 4.2.0

## Où en est Waraqa

Application locale unifiée (NestJS/TypeORM/SQLite + React/Vite), fonctionnelle sans clé et **prête pour l’IA réelle** :

- Clé Anthropic saisie dans **Réglages → Assistant IA**, écrite dans `backend/.env`, appliquée sans redémarrage, jamais renvoyée ; test de connexion (modèle + crédit) ; suppression.
- **Assistant comptable** : Claude + 9 outils en lecture seule (`backend/src/ia/assistant.ts`), actions proposées confirmées par l’utilisateur, sources consultées, progression, Markdown sûr.
- **Extraction** des pièces en sortie structurée, HT/TVA recalculés par le serveur.
- **Cache** des réponses (empreinte des données) + prompt caching Anthropic ; **budget mensuel** bloquant ; consommation par fonction.
- Garde-fou : aucun appel réseau possible pendant les tests automatisés.

Résultats : 92 unitaires, 78 e2e, 17 parcours intégrés, 11 groupes navigateur — tous réussis (`VALIDATION.md`).

## Commits de cette étape (branche `finalisation-ia-4.2`)

1. `chore: état reçu 4.1.0-rc.1 avant finalisation IA` — point de retour.
2. `feat(ia): assistant avec outils, cache, budget, clé depuis les réglages (backend)`.
3. `feat(ia): interface — clé et test dans les réglages, réponses markdown, actions proposées, sources, consommation`.
4. `docs+tests: validation réelle npm run test:ia, documentation IA, version 4.2.0`.

Aucune migration de schéma : les nouveaux enregistrements (`ia_usage`, `ia_cache`) utilisent la table existante `workspace_records`. Les réglages IA absents d’une ancienne base prennent leurs valeurs par défaut.

## Prochaine action exacte

1. Enregistrer la clé dans Réglages → Assistant IA, **Tester la connexion**.
2. `npm run test:ia` → lire `docs/tests-ia-reelle.json` (champs exacts, coût réel).
3. Déposer 5 à 10 vraies pièces FEM variées (facture 20 %, multi-taux, ticket, DUM, avis de virement, relevé CIH/SGMB) et noter les écarts.
4. Suite du développement : voir `PROMPT-FINAL-Waraqa.md` (lots A à E).
