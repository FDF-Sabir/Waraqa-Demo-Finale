# Waraqa 4.4 — application locale, fonctionnement en ligne

Waraqa s’installe et se lance **sur votre poste**, mais dès son démarrage il travaille comme une version hébergée (**profil en ligne**, par défaut) :

- **IA Claude connectée en permanence** dès que votre clé est dans `backend/.env` : lecture des pièces, discussion, actions proposées. Aucun mode démo à basculer.
- **Google Drive de saberrochdi509@gmail.com synchronisé automatiquement** : pièces importées, exports, snapshots PDF et sauvegarde complète quotidienne dans `Mon Drive/Waraqa/`.
- Données de travail sur le poste (SQLite + pièces originales) : l’application reste utilisable sans Internet ; l’IA et Drive reprennent au retour du réseau.
- **Relevé de déduction TVA** (DGI, art. 112 CGI) produit depuis le dossier du mois (ZIP ou lien de dossier Google Drive) : contrôles DGI, déductions tardives, **XML EDI pour SIMPL** et **Excel au modèle DGI**. Mode d’emploi : **`docs/RELEVE-DEDUCTION.md`**.

## Démarrer

1. Installer **Node.js 22 ou 24**, puis extraire complètement ce ZIP.
   **Mise à jour** : extraire **par-dessus** votre dossier Waraqa existant. `backend/.env` (votre clé API, votre secret) et `backend/data/` (comptes, pièces, conversations) sont conservés ; les nouveaux réglages sont ajoutés automatiquement au démarrage sans toucher aux valeurs existantes.
2. Windows : double-cliquer sur `DEMARRER-Windows.bat`. Ubuntu/macOS : `bash DEMARRER.sh`. Ou `npm start`.
3. Le lanceur affiche l’état **Internet / IA Claude / Google Drive** puis ouvre le navigateur sur **http://localhost:3000** (toujours `localhost`, pas `127.0.0.1`, pour le retour de Google).
4. Première installation uniquement : créer le premier compte (il devient administrateur).

Laisser la fenêtre ouverte (la synchronisation Drive tourne tant que Waraqa est lancé). Ctrl+C pour arrêter.

## IA Claude

- Clé déjà présente dans `backend/.env` : rien à faire, le lanceur affiche « IA Claude connectée en permanence (sk-ant-…XXXX) ».
- Sinon : **Réglages → Assistant IA** → coller la clé → **Enregistrer la clé** → **Tester la connexion**. Le mode connecté s’active immédiatement, sans redémarrage.
- La clé reste dans `backend/.env` sur ce poste : jamais renvoyée au navigateur, jamais écrite dans le journal, **jamais envoyée dans Google Drive** ni incluse dans les sauvegardes. Ne la mettez pas dans un ZIP, une capture ou une conversation.
- Budget mensuel (10 $ par défaut), modèle et niveau de réflexion : Réglages → Assistant IA. Au-delà du budget, les appels sont bloqués.
- Crédit API requis (Console Claude → Billing) : les crédits du chat claude.ai ne financent pas l’API.

## Google Drive

Une seule mise en service de 5 minutes : créer l’identifiant OAuth dans Google Cloud avec votre compte, le charger dans **Réglages → Intégrations**, puis **Connecter Google Drive**. Pas-à-pas complet : **`docs/GOOGLE-DRIVE.md`**.

- Seul `saberrochdi509@gmail.com` est accepté (réglable par `GOOGLE_ALLOWED_EMAIL` dans `backend/.env`).
- Droit minimal `drive.file` : Waraqa ne voit que les fichiers qu’il crée. L’import par lien de dossier demande en plus, une seule fois et seulement à sa première utilisation, la **lecture seule** des dossiers que vous lui indiquez.
- File durable, reprises automatiques, aucun doublon ; état, historique et « Synchroniser maintenant » dans Réglages → Intégrations.

## Revenir au comportement démo

Dans `backend/.env` : `WARAQA_PROFILE=local`, puis relancer. Le mode connecté redevient manuel et aucun transfert Drive automatique n’a lieu.

## Fonctions réunies

- **Agent comptable IA** (Claude Sonnet 5) : joignez vos pièces (PDF, photos, Excel, CSV, JSON, dossier ZIP) ou le lien d’un dossier Drive, demandez en langage courant (« valide les lignes conformes de juillet, puis donne-moi le XML SIMPL et l’Excel »). L’assistant consulte 16 outils, cite les lignes (#id), montre les données consultées et le coût, et prépare les **boutons d’action** (valider, rattacher, clôturer, importer un dossier Drive, snapshot, désignation, archivage, rapprochement) et de **téléchargement** (Excel, PDF, CSV, Sage, JSON, XML SIMPL, Excel DGI, snapshot, sauvegarde, pièce originale). Chaque action est vérifiée par le serveur et exécutée seulement après votre confirmation. Détail : `docs/IA-ASSISTANT.md`.
- **Lecture des pièces par l’IA** : PDF, scans et photos classés et lus en sortie structurée ; HT/TVA toujours recalculés par le serveur ; revue humaine obligatoire.
- **Cache** : réponses identiques réutilisées tant que les données n’ont pas changé (0 $, bouton Régénérer) ; prompts mis en cache chez le fournisseur (relus à 10 % du prix). **Budget mensuel** et consommation détaillée.
- Discussion avec historique persistant par mois, plusieurs conversations, renommage/suppression, pièces jointes, réponses mises en forme, progression en direct, copier, réessayer, régénérer, accès aux pièces et export Excel.
- Modèles de prompts : utiliser, créer, modifier, supprimer ; variable `{{mois}}`.
- Tableau de bord calculé depuis les données, recherche et sélection de période.
- Import multiple, dépôt glissé, capture photo mobile si le navigateur l’autorise ; conservation des originaux et détection de fichiers identiques par SHA-256.
- **Import d’un dossier complet** : ZIP (sous-dossiers, ZIP inclus) ou lien de dossier Google Drive (Google Sheets convertis), traité en arrière-plan avec suivi par fichier.
- **Relevé de déduction** : page dédiée (lignes retenues, écartées avec motif, alertes, déductions tardives à rattacher, totaux par taux), XML SIMPL, Excel modèle DGI, PDF, clôture de période ; l’assistant sait le préparer et l’expliquer.
- Lecture **réelle sans clé** des fichiers Excel/CSV/JSON suivant les colonnes d’exemple ; erreurs isolées par ligne.
- PDF/images sans clé : conservation et saisie manuelle, **aucune extraction inventée**.
- Six sous-types V2 : facture fournisseur, déclaration douanière, quittance douane, note de frais, relevé bancaire et avis de débit/virement.
- Relevé avec les 13 champs Tableau5, saisie/correction, calculs serveur, doublons, statut de complétude, revue humaine, filtrage, tri, pagination et archivage.
- Propositions de rapprochement par montant exact, confirmation explicite et conservation du paiement source. Les paiements bancaires hors commissions ne gonflent pas les achats/exports TVA.
- Confirmation explicite d’un paiement sans facture source, journalisée et distincte d’une déduction fiscale.
- Désignations existantes V2, nouvelles propositions et confirmation ; ajout manuel.
- Journal, notifications réellement persistantes, états lue/traitée.
- Export Excel `.xlsx`, CSV Tableau5, CSV de préparation Sage avec mapping des comptes et écritures équilibrées au centime.
- Relevés, archives et snapshots PDF en couleurs : synthèse HT/TVA/TTC, graphiques fournisseurs et revue, tableaux paginés. Les relevés PDF reprennent exactement la sélection Excel ; les fichiers Excel importés ne sont pas convertis.
- Snapshots immuables et snapshots automatiques pendant que le serveur est actif.
- Entreprise, assistant, préférences, exports, utilisateurs, changement du mot de passe et statut des intégrations.

## Ce qui est démontré, ce qui exige un service externe

| Fonction | État livré |
|---|---|
| Données, pièces, chat et réglages | SQLite/fichiers persistants, pas de mock en mémoire |
| Analyses du chat sans clé | Déterministes et identifiées « Analyse locale » ; pas un LLM local |
| Assistant IA et lecture des pièces | Implémentés et testés avec un fournisseur simulé (contrats, outils, cache, budget, erreurs) ; message d’erreur réel vérifié contre l’API Anthropic ; qualité mesurable avec `npm run test:ia` et votre clé |
| Excel/CSV/JSON structurés | Import réel sans IA ; voir `examples/` |
| Exports | Fichiers réellement générés et téléchargés |
| Sage 100 | CSV équilibré à mapper dans l’assistant d’import ; aucune connexion directe à Sage |
| DGI | Tableau de travail EDI, aucun XML officiel ni dépôt automatique/certification |
| Google Drive | Synchronisation automatique implémentée et testée contre un Google simulé (OAuth, compte verrouillé, dossiers, reprises, jeton expiré/révoqué) ; première connexion réelle à faire avec votre identifiant OAuth (`docs/GOOGLE-DRIVE.md`) |
| Email / push hors application | Non raccordés ; la cloche interne fonctionne |
| 2FA | TOTP et codes de secours implémentés, vérifiés par tests automatisés locaux |
| Snapshots planifiés | Locaux, avec paramètres de fuseau horaire et rattrapage ; nécessitent le serveur actif |

Ces limites existaient sous forme de simulations dans les interfaces d’origine ; elles ne sont pas présentées comme des services opérationnels.

## Parcours de démonstration

1. Choisir septembre 2026 ou une période de votre choix, charger les exemples.
2. Tableau de bord → constater les lignes à contrôler.
3. Discussion IA → « Contrôle mensuel », puis « Top fournisseurs ». En mode connecté : demander « Que dois-je corriger avant l’export ? » puis cliquer sur les actions proposées.
4. Relevé → compléter l’ICE de la pièce incomplète, enregistrer, sélectionner et valider les lignes revues.
5. Rapprochement → choisir la facture candidate au paiement de 12 000 MAD et confirmer le lien.
6. Importer `examples/import-factures.csv` puis `examples/import-paiement.json` ; sélectionner septembre 2026 pour voir ces lignes. Ce sont des données d’exemple à ne pas réutiliser en comptabilité réelle.
7. Importer un scan : sans clé, il est conservé, puis « Saisir une ligne » permet de le compléter.
8. Exports & snapshots → télécharger Excel ou Sage, créer un snapshot, puis vérifier qu’une modification ultérieure ne change pas le snapshot.
9. Réglages → personnaliser l’entreprise et les comptes ; recharger la page pour vérifier la persistance.

## Données et sauvegarde

### Relevé Excel ou PDF

Dans **Exports & snapshots**, choisissez la même sélection pour **Relevé Excel** ou **Relevé PDF illustré**. Les exemples sont exclus par défaut. L’option « Toutes les lignes hors banque » marque le document **BROUILLON**. Les graphiques proviennent uniquement des lignes exportées ; les avoirs conservent leur signe et les paiements bancaires n’augmentent pas les achats. Les 13 champs Tableau5 sont répartis dans deux tableaux lisibles, avec les mêmes identifiants de ligne.

Le PDF est aussi disponible dans **Pièces & relevé TVA → PDF des lignes revues** et dans les actions de la discussion. Les boutons de la discussion exportent le relevé de la période, pas le texte de la conversation. Les originaux importés restent disponibles dans leur format initial.

Des exemples entièrement fictifs sont fournis dans `docs/exemples-exports/`. Pour les régénérer après compilation : `node scripts/pdf-preview.cjs`.

### Archives et restauration

Dans **Exports & snapshots → Sauvegarde et archives**, **Sauvegarder les archives en PDF** télécharge les lignes archivées avec leurs références, montants et statuts. Chaque snapshot dispose aussi d’un bouton **Télécharger le PDF** : il reprend les lignes et les totaux figés à sa création, même si les factures ont changé depuis.

Le PDF est une copie de consultation. Pour restaurer l’espace complet avec ses comptes et pièces originales, utilisez le téléchargement distinct dans **Sauvegarde complète et restauration**.

`backend/data/waraqa.sqlite` contient les utilisateurs, factures, conversations, modèles et réglages. `backend/data/files/` contient les pièces originales. Arrêter le serveur avant de copier **tout `backend/data/`** pour une sauvegarde cohérente. Ne pas supprimer la base pour résoudre un problème d’affichage.

Le secret de session se trouve dans `backend/.env`, jamais livré prérempli. Un changement de mot de passe invalide les anciennes sessions. La suppression d’un compte révoque son accès ; ses actions historiques restent dans le journal.

L’archivage retire une ligne des vues actives et des exports ; le journal est conservé. Dans **Sauvegarde et archives**, le bouton **Restaurer** réactive la ligne et impose une nouvelle revue. La sauvegarde technique complète inclut SQLite et les pièces originales ; sa restauration se fait dans un dossier distinct avec contrôle des empreintes.

## Mise à jour depuis une version précédente

Extraire ce ZIP **par-dessus** le dossier existant : il ne contient ni `backend/data/` ni `backend/.env`, vos comptes, pièces, conversations, clé API et secrets sont donc conservés. Les variables nouvelles (`WARAQA_PROFILE`, `GOOGLE_ALLOWED_EMAIL`, `WARAQA_OPEN_BROWSER`) sont ajoutées automatiquement à `backend/.env` au démarrage. Relancer avec `DEMARRER-Windows.bat` ou `bash DEMARRER.sh`.

## Développement

- `npm run setup` : installer les dépendances de développement et recompiler.
- `npm run build` : compiler NestJS, vérifier TypeScript frontend et construire React/Vite.
- `npm test` : tests unitaires, API/e2e (dont l’IA avec client simulé) et parcours intégrés sur base temporaire. Aucun appel payant n’est possible pendant les tests.
- `npm run test:ia` : validation **réelle** avec votre clé (données fictives, plafond `WARAQA_TEST_BUDGET_USD`, 0,30 $ par défaut).
- `npm run test:releve` : validation **réelle** de bout en bout (dossier ZIP lu par Claude → relevé → XML validé contre le schéma DGI → Excel ouvert par LibreOffice → assistant), plafond 0,80 $.
- `npm run test:smoke` : parcours complets sans modifier votre base.
- Développement séparé : `npm run start:dev --prefix backend` et `npm run dev --prefix frontend`. Le proxy frontend cible `127.0.0.1:3000`.

Les dépendances sont verrouillées par les deux `package-lock.json`. Aucun `node_modules`, secret ou fichier de comptabilité personnelle n’est inclus dans le ZIP.

### Dépannage

- `node` introuvable : installer Node.js, rouvrir le terminal.
- Port 3000 occupé : changer `WARAQA_PORT` dans `backend/.env`, puis ouvrir le port choisi.
- Erreur d’installation `sqlite3` : utiliser Node.js 22/24 et les outils de compilation natifs de votre système si un binaire précompilé n’est pas disponible. Ubuntu : outils de compilation C/C++ et Python ; Windows : Build Tools C++.
- Écran vide : ouvrir `http://localhost:3000` ; ne pas ouvrir directement `index.html` depuis le disque.
- Aucune donnée : vérifier la période. Les lignes sont rattachées au mois de paiement lorsqu’il est renseigné, sinon au mois de facture.
- Format tabulaire refusé : les en-têtes reconnus (FACT_NUM, LIB_FRSS, ICE_FRS, IF, M_TTC, TAUX, ID_PAIE, DATE_PAIE, DATE_FAC ou leurs équivalents « N° facture », « Fournisseur », « Montant TTC »…) doivent figurer dans les 30 premières lignes. Dates `JJ/MM/AAAA`, `AAAA-MM-JJ` ou dates Excel. Une ligne sans montant TTC ou taux est rejetée avec une erreur visible.
- Linux : `DEMARRER.sh` choisit automatiquement une version de Node.js ≥ 22 installée par nvm si le `node` par défaut est plus ancien.

Voir `docs/FUSION-ET-ARCHITECTURE.md` pour la correspondance des deux versions et `docs/VALIDATION.md` pour le périmètre des tests.
