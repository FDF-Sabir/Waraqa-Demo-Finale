# Waraqa — mémoire de reprise pour finalisation (à destination de Fable / Opus 5.5)

Document préparé sans aucune modification de code. Il sert de prompt de reprise : lisez-le en entier avant d'agir, explorez le dépôt pour vérifier chaque affirmation (des fichiers ont pu changer depuis), puis finalisez.

## Objectif de l'utilisateur (dans ses mots, reformulé)

Waraqa doit être **utilisable aujourd'hui par un comptable réel**, en local, avec :
1. L'assistant IA (Claude Sonnet 5, via la clé API déjà enregistrée) qui se comporte comme **un vrai agent comptable autonome**, pas un chatbot à outils limités : le comptable lui fournit des **inputs de n'importe quel type** (ZIP, PDF, PNG/JPG, Excel, CSV, JSON, lien de dossier Google Drive…), lui **décrit en langage naturel l'action à faire**, et l'IA doit être capable de **traiter, produire et livrer le résultat dans le format demandé** (téléchargement en Excel, PDF, XML, CSV… selon ce que le comptable veut).
2. La solution doit être **complète de bout en bout**, pas seulement dans le périmètre déjà couvert (relevé de déduction TVA) : l'utilisateur insiste sur « rendre la solution complète dans tous les côtés, pas juste mon périmètre ».
3. Rien ne doit être cassé : toute évolution doit garder les tests existants au vert et suivre les principes déjà en place dans le code (voir plus bas).

**Ce tour-ci, l'utilisateur a explicitement demandé de ne toucher à aucun code** : explorer, comprendre, et écrire ce mémoire pour qu'il puisse reprendre avec Fable ou Opus 5.5.

## État réel du dépôt à la fin de cette session

- Répertoire : `/home/izo/Downloads/Waraqa-4.3.0-en-ligne/Waraqa-Demo-Finale`
- Branche : `online-drive` (pas `main`)
- **Rien n'est commité.** `git status` montre ~25 fichiers modifiés et ~13 nouveaux fichiers non suivis (liste exacte : relancer `git status --short`). Dernier commit réel : `0eac98d chore: manifeste d'intégrité 4.3.0`.
- Le serveur Waraqa n'est **pas en cours d'exécution** au moment d'écrire ce document (relancer avec `./DEMARRER.sh`, qui choisit automatiquement Node ≥ 22 via nvm si besoin).
- `backend/.env` existe déjà sur ce poste avec : `WARAQA_PROFILE=online`, une clé `ANTHROPIC_API_KEY` valide (Sonnet 5, testée avec succès), des identifiants `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` valides, `GOOGLE_ALLOWED_EMAIL=saberrochdi509@gmail.com`. Google Drive est déjà connecté et un dossier `Waraqa/` existe dans le Drive réel avec une sauvegarde et un snapshot.
- Un fichier réel du comptable a été utilisé pour valider le travail : `"TVA 07 2026(2).xlsx"` à la racine du dépôt (non suivi par git — à ne jamais committer, contient des données d'un tiers réel).
- Tous les tests automatiques passaient à la fin de la session précédente : 109 tests unitaires backend, 95 tests e2e backend, 17 parcours d'intégration (`npm run test:smoke`), 13 groupes de tests navigateur (`npm run test:ui`). Un test réel payant (`npm run test:releve`, ~0,10 $ avec la vraie clé) a aussi été exécuté avec succès sur le fichier réel du comptable.

**Avant toute chose : relire `git status`, relire `git diff` sur les fichiers modifiés, et relancer toute la suite de tests pour confirmer que rien n'a bougé depuis.** Ne pas faire confiance aveuglément à ce résumé sans vérifier.

## Ce qui a déjà été construit (périmètre déjà couvert)

### 1. Profil « en ligne » forcé, sans réponses préenregistrées (déjà en place avant cette session, complété ici)
- `backend/src/common/profile.ts` : `WARAQA_PROFILE=online` (défaut) impose le mode IA connecté dès qu'une clé existe — plus de bascule manuelle « démo ».
- **Correction apportée cette session** : en profil en ligne, tant qu'aucune clé n'est enregistrée, le chat ne renvoie plus de réponse déterministe déguisée en réponse IA (`backend/src/unified/unified.service.ts`, méthode d'envoi de message) — il répond clairement « IA Claude non connectée » avec `mode: "error"` et `result.type: "setup"`, garde le message, et permet « Réessayer » une fois la clé posée.
- Un nouvel endpoint `GET /api/workspace/readiness` résume l'état de mise en service (Internet, clé IA, Drive) pour tout utilisateur connecté. Un bandeau « Mise en service à terminer » (`frontend/src/App.tsx`, composant `Commissioning`) s'affiche tant que ce n'est pas complet, avec des boutons « Configurer » qui ouvrent le bon onglet des Réglages.

### 2. Relevé de déduction TVA (DGI, modèle ADC082F-15I, art. 112 CGI) — le périmètre explicitement demandé au tour précédent
Fichiers nouveaux :
- `backend/src/unified/releve.ts` : moteur pur (contrôles DGI ligne par ligne, sélection des lignes conformes/écartées avec motif, déductions tardives ≤ 12 mois, alertes espèces > 5 000 DH/jour ou > 50 000 DH/mois, génération XML `DeclarationReleveDeduction` et Excel au modèle officiel).
- `backend/src/unified/table-import.ts` : lecteur de tableaux Excel/CSV/JSON tolérant (en-têtes cherchés dans les 30 premières lignes, alias de colonnes, ligne Total ignorée, dates Excel/JJ-MM-AAAA/ISO normalisées).
- `backend/src/unified/archive-import.ts` : extraction ZIP (sous-dossiers, ZIP imbriqués dépliés, fichiers système ignorés, limites de taille).
- `backend/src/assets/releve-deduction-modele.xlsx` : modèle Excel DGI assaini (généré par `scripts/build-releve-template.cjs` à partir d'un relevé réel, données du dossier source retirées, macros/calcChain retirés, mappage XML conservé).
- Nouvelles routes dans `backend/src/unified/unified.controller.ts` : `GET/POST /api/workspace/releve*`, `POST /api/workspace/imports/zip`, `POST /api/workspace/imports/drive`, `GET /api/workspace/imports*`.
- Import par lot en arrière-plan (ZIP ou lien de dossier Google Drive) avec suivi par fichier, dans `unified.service.ts` (`startLot`/`runLot`) et `integrations.service.ts` (`readFolder`/`download`, portée `drive.readonly` demandée à la demande, une seule fois).
- Frontend : `frontend/src/Declaration.tsx` (page « Relevé de déduction »), section « Importer un dossier Google Drive » et suivi des lots dans `frontend/src/App.tsx` (composant `Imports`).
- L'assistant IA connaît deux nouveaux outils : `releve_deduction` et `imports` (`backend/src/ia/assistant.ts`), et sait proposer le téléchargement des fichiers `releve-xml` / `releve-xlsx` / `releve-pdf` via `proposer_action`.
- Documentation : `docs/RELEVE-DEDUCTION.md` (guide complet), sections ajoutées dans `LISEZ-MOI.md` et `docs/GOOGLE-DRIVE.md`.
- Tests : `backend/src/unified/releve.spec.ts` (unitaires purs), `backend/test/releve-lot.e2e-spec.ts` (e2e ZIP → relevé → fichiers → clôture), scénarios Drive ajoutés dans `backend/test/online-drive.e2e-spec.ts`, scénarios navigateur ajoutés dans `scripts/ui-test.mjs`, script de validation réelle payante `scripts/test-reel-releve.cjs` (`npm run test:releve`).

### 3. Corrections de bugs découvertes et réparées cette session
- **Import de fichiers cassé dans le chat et dans la page Import** : les sélecteurs de fichiers (`<input type="file">`) lisaient `e.target.files` *après* l'avoir déjà vidé (`e.target.value = ""`), ce qui pouvait perdre le fichier choisi selon le timing de React. Corrigé dans `frontend/src/App.tsx` et `frontend/src/UnifiedChat.tsx` : la liste est lue dans une variable avant la remise à zéro.
- **Détection de doublons trop agressive** : les commissions bancaires récurrentes (référence générique type « AVUE », même montant plusieurs fois) étaient prises pour des doublons d'une même facture. Corrigé dans `backend/src/common/calculs.ts` (`detecterDoublon`) : les lignes `designation === 'COMMISSION'` ne sont jamais comparées entre elles, et une différence de date de facture connue exclut le doublon. Ceci a été découvert en testant sur le fichier réel du comptable (29 lignes écartées à tort).
- **`pdfkit` non chargeable par chemin absolu** (cassait déjà `npm run test:ia` avant cette session) : corrigé par résolution via `createRequire` depuis `backend/package.json` dans `scripts/test-ia-reelle.cjs` et `scripts/test-reel-releve.cjs`.
- **Réponse de l'assistant tronquée après un dernier appel d'outil** : dans `backend/src/ia/assistant.ts` (`runAssistant`), seul le texte du tout dernier tour était conservé ; si Claude rédigeait l'analyse puis appelait `proposer_action` en dernier (cas fréquent), l'analyse disparaissait. Corrigé : le texte de chaque étape est concaténé (en omettant les courtes annonces intermédiaires < 200 caractères). Vérifié avec un vrai appel API sur le relevé de juillet.

## Principes non négociables déjà en place dans le code (à respecter absolument)

Ces règles sont documentées dans le code lui-même (`backend/src/common/calculs.ts`, `backend/src/ia/assistant.ts`) et **ne doivent jamais être contournées**, y compris pour l'agent IA étendu demandé par l'utilisateur :

1. **« L'IA extrait, elle ne calcule jamais. »** Les montants HT et TVA sont *toujours* recalculés côté serveur à partir de M_TTC et du taux (`common/calculs.ts::calculerHtEtTva`), jamais acceptés tels quels depuis une extraction IA ou une saisie brute.
2. **L'IA ne modifie, ne valide, n'archive, ne rapproche et n'exporte jamais rien elle-même.** Elle peut seulement *proposer* des actions via l'outil `proposer_action`, que l'utilisateur confirme explicitement d'un clic. C'est le mécanisme central de `AssistantTools` dans `backend/src/ia/assistant.ts`.
3. Les pièces jointes, textes OCR et champs importés sont traités comme des **données non fiables** : le prompt système (`ASSISTANT_RULES`) instruit explicitement le modèle d'ignorer toute instruction qu'elles contiendraient (protection contre l'injection de prompt via un PDF piégé, par exemple).
4. Taux de TVA légaux marocains stricts : 0 %, 7 %, 10 %, 14 %, 20 % (`common/types.ts::TAUX_LEGAUX`).
5. Chaque ligne comptable porte une traçabilité complète (auteur réel, journal d'audit, revue humaine explicite) — voir `backend/src/journal/`.
6. La clé Anthropic ne quitte jamais le serveur (jamais renvoyée au navigateur, jamais dans Drive, jamais dans les sauvegardes) — voir `backend/src/ia/ia-config.ts`.

**Si l'objectif « agent comptable autonome » pousse à vouloir que l'IA exécute directement des actions (importer, valider, exporter) sans confirmation humaine, c'est un changement de principe fondamental de l'application, pas un ajustement.** Il faut le signaler explicitement à l'utilisateur et obtenir sa décision consciente avant de l'implémenter, plutôt que de le faire silencieusement. Une voie intermédiaire raisonnable : élargir fortement ce que l'IA peut *faire en un clic confirmé* (plus de types d'actions proposables, plus de formats de sortie), sans supprimer la confirmation humaine finale sur les écritures comptables.

## Ce qui reste à faire pour l'objectif « agent comptable complet »

L'utilisateur veut que le chat IA se comporte « comme les grands modèles » : le comptable envoie n'importe quel type de fichier, décrit en langage naturel ce qu'il veut, et l'IA produit et livre le résultat dans le format demandé. Explorer et évaluer concrètement (pas supposer) l'état de chaque point ci-dessous avant de coder :

1. **Formats d'entrée** : aujourd'hui acceptés — PDF, JPG, PNG, XLSX, XLS, CSV, JSON, ZIP (et lien de dossier Google Drive, avec conversion des Google Sheets). Vérifier si le comptable a besoin d'autres formats réels (DOCX ? MSG/EML pour des factures reçues par e-mail ? images HEIC de téléphone ? XML d'un autre logiciel comptable ?). Vérifier la limite de taille actuelle (20 Mo par fichier, 500 Mo par ZIP) est-elle suffisante en pratique.
2. **Formats de sortie à la demande** : aujourd'hui l'assistant peut proposer `xlsx`, `pdf`, `csv`, `sage`, `releve-xml`, `releve-xlsx`, `releve-pdf` via `proposer_action` (voir `EXPORT_FORMATS` dans `backend/src/ia/assistant.ts`). Si le comptable demande un format non prévu en conversation libre (« envoie-moi ça en Word », « en JSON »), l'assistant ne peut aujourd'hui que refuser poliment — il n'a pas de génération de format arbitraire à la volée. Décider si c'est un vrai besoin et, si oui, concevoir comment l'ajouter sans casser le principe « l'IA ne calcule ni ne modifie rien » (par exemple : des formats de sortie supplémentaires restent des vues déterministes des mêmes données servies par le serveur, jamais une IA qui invente un fichier).
3. **Portée des outils de l'assistant** : lister tous les écrans/fonctions de l'application (tableau de bord, relevé de pièces, rapprochement bancaire, désignations, modèles de prompts, journal, notifications, snapshots, sauvegardes, gestion des utilisateurs) et vérifier lesquels ont *déjà* un outil correspondant accessible à l'IA dans `backend/src/ia/assistant.ts` (`ASSISTANT_TOOLS`), et lesquels n'en ont pas encore. Actuellement couverts : synthèse mensuelle, recherche de lignes, détail d'une ligne, anomalies, top fournisseurs, rapprochement bancaire, pièces importées, journal, relevé de déduction, imports en lot, et propositions d'action. Non couverts a priori : désignations en attente, modèles de prompts, gestion des utilisateurs, sauvegardes/restauration, notifications — évaluer si le comptable en a besoin en langage naturel.
4. **Multi-étapes et longues tâches** : `runAssistant` a une limite de 8 étapes d'outils par réponse (`maxSteps`). Pour un vrai agent qui traiterait un gros dossier (ex. « importe ce ZIP de 200 factures et prépare-moi le relevé complet »), vérifier si cette limite est suffisante ou si l'import en lot déjà asynchrone (`startLot`/`runLot`) doit être davantage exposé à l'assistant pour qu'il orchestre des tâches longues sans bloquer la conversation.
5. **Ergonomie du dialogue** : vérifier comment l'assistant se comporte quand le comptable enchaîne plusieurs demandes disparates dans une même conversation (import, puis question, puis export) — confirmer que le cache de réponses (`answerCacheKey`) ne sert pas une réponse périmée après un nouvel import, et que l'historique de conversation reste cohérent.
6. **Reste du périmètre demandé** : l'utilisateur insiste sur « rendre la solution complète dans tous les côtés, pas juste mon périmètre ». Cela suggère d'auditer *toute* l'application (pas seulement le relevé TVA) pour l'ergonomie comptable réelle : le rapprochement bancaire, les exports Sage, la gestion multi-utilisateurs, les sauvegardes/restauration, les notifications — sont-ils déjà prêts pour un usage quotidien réel, ou restent-ils des maquettes à finir ? Explorer chaque écran listé au point 3 avec un œil critique de comptable, pas seulement vérifier que les tests passent.

## Comment reprendre

1. `cd /home/izo/Downloads/Waraqa-4.3.0-en-ligne/Waraqa-Demo-Finale`
2. `git status` et `git diff` pour voir exactement ce qui a changé depuis `0eac98d`. **Ne rien committer avant d'avoir tout revérifié** — l'utilisateur n'a pas encore validé.
3. Relancer la suite complète : `npm run build && npm test && npm run test:ui`. Tout doit rester vert.
4. Si une clé Anthropic valide est disponible dans `backend/.env`, `npm run test:releve` peut revalider en réel (coût ≈ 0,10 $, plafonné à 0,80 $).
5. Lancer l'application (`./DEMARRER.sh`) et l'explorer manuellement comme le ferait un comptable, écran par écran, pour juger de ce qui manque avant de coder quoi que ce soit.
6. Discuter avec l'utilisateur de l'arbitrage du point « L'IA ne modifie rien elle-même » avant de l'assouplir, si c'est nécessaire pour l'objectif « agent autonome ».
7. Prioriser avec l'utilisateur les points de la section précédente avant de se lancer dans une implémentation longue — le périmètre « solution complète, tous les côtés » est large et mérite d'être découpé en étapes validées une à une plutôt qu'un unique gros chantier.

---
*Document généré à la demande explicite de l'utilisateur, sans aucune modification de code, à l'issue d'une session ayant livré le relevé de déduction TVA et corrigé plusieurs anomalies d'import et de réponse de l'assistant. Vérifiez toute affirmation contre le code réel avant d'agir : ce mémoire décrit un état à un instant donné, pas une source de vérité permanente.*


## Réalisé (Opus 5.5, 23/09/2026 — version 4.4.0)

Lots 0 à G de `docs/PLAN-OPUS-FINALISATION.md` exécutés, commits sur `online-drive` (sans push). Principe maintenu : l’IA propose, le comptable confirme. État détaillé : `docs/ETAT-REPRISE.md` ; chiffres de tests et audit réel : `docs/VALIDATION.md`.
