# Waraqa 4.2 — espace comptable local avec assistant IA

Nouvelle application assemblée à partir des **deux archives fournies** : `Waraqa V2(1).zip` et `Waraqa-FrontEnd.zip`. Un seul backend, une seule base, une seule interface ; ce ZIP ne juxtapose pas deux applications à lancer séparément.

## Démarrer (sans clé API)

1. Installer **Node.js 22 ou 24**, puis extraire complètement ce ZIP.
2. Sous Windows : double-cliquer sur `DEMARRER-Windows.bat`.
   Sous Ubuntu/macOS : ouvrir un terminal dans ce dossier et lancer `bash DEMARRER.sh`.
   Autre possibilité : `npm start`.
3. La première ouverture installe les dépendances backend. **Internet est nécessaire pour cette installation**, mais aucune clé IA n’est requise.
4. Ouvrir **http://localhost:3000**. Créer le premier compte : il devient administrateur de cet espace local. Aucun mot de passe prédéfini n’est livré.
5. Dans **Vue d’ensemble**, cliquer sur **Charger les exemples**. Six lignes fictives sont créées dans la période affichée : achats, service, pièce incomplète, douane, paiement orphelin et frais.
6. Ouvrir **Discussion IA**, sélectionner un modèle de prompt et envoyer le message. Sans clé, les analyses locales utilisent les vraies données de votre démo ; avec la clé (section suivante), Claude répond en consultant ces mêmes données.

Laisser le terminal ouvert. Arrêter avec Ctrl+C. Les prochaines ouvertures ne réinstallent pas les dépendances. Les fichiers compilés de l’interface et du backend sont inclus.

L’application est en français et les montants sont en MAD. Il s’agit d’un espace comptable local partagé entre ses utilisateurs, pas d’une plateforme multi-entreprises isolées.

## Activer l’IA avec votre clé (2 minutes, sans redémarrer)

1. Créer la clé dans la **Console Claude** (platform.claude.com → API keys), de préférence dans l’espace de travail **Default**. Copier la clé entière : elle n’est affichée qu’une fois.
2. Vérifier que l’organisation a du **crédit API** (Console → Billing → Add funds). Les crédits achetés sur claude.ai pour le chat ne financent pas l’API.
3. Dans Waraqa, connecté en administrateur : **Réglages → Assistant IA** → coller la clé → **Enregistrer la clé**.
4. **Tester la connexion** : le message indique le modèle, le délai et le coût du test, ou la cause exacte d’un refus (clé invalide, crédit insuffisant, modèle introuvable, portée « Organisation »…).
5. **Activer le mode connecté**. Régler au besoin le modèle (Sonnet 5 recommandé), le niveau de réflexion et le **budget mensuel** (10 $ par défaut ; au-delà, les appels sont bloqués).

La clé est enregistrée dans `backend/.env` sur ce poste, jamais renvoyée au navigateur ni écrite dans le journal. Ne la mettez jamais dans une capture d’écran, un ZIP, un dépôt Git ou une conversation. **Supprimer la clé** dans les réglages repasse l’application en mode démo.

Validation réelle facultative (données fictives, base temporaire, plafond 0,30 $) : `npm run test:ia`. Le rapport est écrit dans `docs/tests-ia-reelle.json`.

Détails, coûts et cache : `docs/IA-ASSISTANT.md`.

## Fonctions réunies

- **Assistant IA connecté** (Claude) : consulte vos lignes, anomalies, paiements, pièces et journal via des outils en lecture seule, cite les lignes (#id), montre les données consultées et le coût, et **propose des actions** (ouvrir une ligne, rapprocher, exporter) que vous confirmez d’un clic.
- **Lecture des pièces par l’IA** : PDF, scans et photos classés et lus en sortie structurée ; HT/TVA toujours recalculés par le serveur ; revue humaine obligatoire.
- **Cache** : réponses identiques réutilisées tant que les données n’ont pas changé (0 $, bouton Régénérer) ; prompts mis en cache chez le fournisseur (relus à 10 % du prix). **Budget mensuel** et consommation détaillée.
- Discussion avec historique persistant par mois, plusieurs conversations, renommage/suppression, pièces jointes, réponses mises en forme, progression en direct, copier, réessayer, régénérer, accès aux pièces et export Excel.
- Modèles de prompts : utiliser, créer, modifier, supprimer ; variable `{{mois}}`.
- Tableau de bord calculé depuis les données, recherche et sélection de période.
- Import multiple, dépôt glissé, capture photo mobile si le navigateur l’autorise ; conservation des originaux et détection de fichiers identiques par SHA-256.
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
| Google Drive | Connecteur OAuth implémenté ; configuration et essai sur compte réel restent nécessaires |
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

Extraire ce ZIP **par-dessus** le dossier existant : il ne contient ni `backend/data/` ni `backend/.env`, vos comptes, pièces, conversations et secrets sont donc conservés. Les nouveaux réglages IA prennent leurs valeurs par défaut. Relancer avec `DEMARRER-Windows.bat` ou `bash DEMARRER.sh`.

## Développement

- `npm run setup` : installer les dépendances de développement et recompiler.
- `npm run build` : compiler NestJS, vérifier TypeScript frontend et construire React/Vite.
- `npm test` : tests unitaires, API/e2e (dont l’IA avec client simulé) et parcours intégrés sur base temporaire. Aucun appel payant n’est possible pendant les tests.
- `npm run test:ia` : validation **réelle** avec votre clé (données fictives, plafond `WARAQA_TEST_BUDGET_USD`, 0,30 $ par défaut).
- `npm run test:smoke` : parcours complets sans modifier votre base.
- Développement séparé : `npm run start:dev --prefix backend` et `npm run dev --prefix frontend`. Le proxy frontend cible `127.0.0.1:3000`.

Les dépendances sont verrouillées par les deux `package-lock.json`. Aucun `node_modules`, secret ou fichier de comptabilité personnelle n’est inclus dans le ZIP.

### Dépannage

- `node` introuvable : installer Node.js, rouvrir le terminal.
- Port 3000 occupé : changer `WARAQA_PORT` dans `backend/.env`, puis ouvrir le port choisi.
- Erreur d’installation `sqlite3` : utiliser Node.js 22/24 et les outils de compilation natifs de votre système si un binaire précompilé n’est pas disponible. Ubuntu : outils de compilation C/C++ et Python ; Windows : Build Tools C++.
- Écran vide : ouvrir `http://localhost:3000` ; ne pas ouvrir directement `index.html` depuis le disque.
- Aucune donnée : vérifier la période. Les lignes sont rattachées au mois de paiement lorsqu’il est renseigné, sinon au mois de facture.
- Format tabulaire refusé : suivre exactement les exemples, conserver ICE/IF comme texte et les dates en `AAAA-MM-JJ`. Une ligne sans montant TTC ou taux est rejetée avec une erreur visible.

Voir `docs/FUSION-ET-ARCHITECTURE.md` pour la correspondance des deux versions et `docs/VALIDATION.md` pour le périmètre des tests.
