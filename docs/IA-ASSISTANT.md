# Waraqa 4.7 — IA connectée (Claude) : agent comptable, coûts, extensions

> **4.7 — 42 outils, 16 propositions confirmables.** Ajoutés : `comptabiliser_piece` (pièce jointe en attente → lignes, sur demande), `corriger_lignes` (masse ≤ 100), `calculer` (arithmétique exacte, sans eval), `consignes` / `memoriser_consigne` / `oublier_consigne` (mémoire sourcée et révocable, injectée aux instructions, jamais un secret ni une règle fiscale), `generer_classeur` (Excel libre ≤ 20 feuilles, feuille « À propos »), `qualite_extraction` (confiance par seuil, erreurs par cause, fiabilité des lignes), rapport en `html`, proposition `autoriser_drive`. Le pied « Aucun bouton n’a été préparé » n’apparaît plus que si le texte invite réellement à cliquer.

> **4.6 — l’agent comprend, planifie et rend compte.** Nouveaux outils : `capacites` (catalogue réel généré depuis le registre des outils : distinguer fonction absente, accès manquant, erreur technique), `precontroler_releve` et `plan_de_travail` (mêmes blocages, compteurs, identifiants et invites que le tableau de bord), `lire_classeur` / `lire_plage` (index et lecture par blocs ≤ 200 lignes avec couverture total/couvert/reste, cellules référencées, formules sans cache et dates signalées), `lire_piece` paginé, `comparer_doublons`, `etat_mission`, `generer_rapport` (Markdown + PDF), `importer_drive` (dossier, fichier unique ou Google Sheets, rôle documentaire imposable). `pieces` est paginé et filtrable par rôle, statut, lot. `corriger_ligne` exige une **provenance** (`source` : pièce + identifiant, cellule du classeur, demande de l’utilisateur) et accepte `expectedVersion` ; avant/après, source et version sont tracés. Une action identique répétée dans une réponse n’est pas rejouée. Chaque réponse est une **mission persistée** (`GET /api/workspace/missions`) avec étapes, actions, fichiers, coût et statut, et se termine par un **bilan** structuré. Le budget est **réservé** avant chaque appel et libéré en toute issue. Nouvelle décision réservée au comptable : `lever_doublon` (motif obligatoire). Un document joint comme modèle, historique, référentiel ou vérité terrain est présenté avec son rôle et **ne crée aucune ligne** ; un classeur joint arrive sous forme d’index + aperçu, jamais en texte intégral.


> **4.5 — l’agent fait le travail.** Outils « AGIT » exécutés directement (réversibles, contrôles serveur habituels, journal « Agent IA (pour …) » avec valeurs avant/après) : `corriger_ligne`, `rattacher_periode`, `rapprocher`, `creer_snapshot`, `relire_piece`, `confirmer_designation`, `traiter_notification`, `importer_dossier_drive`, `generer_fichier`, `generer_tableau`. Fichiers livrés en téléchargement direct (`GET /api/workspace/livrables/:id`) ; tableau sur mesure aussi via `POST /api/workspace/tableau`. Dossier joint au chat ou importé par l’agent : réponse d’attente, puis **reprise automatique** de la demande à la fin de l’import. Restent au comptable, par bouton confirmé : `valider_lignes`, `cloturer_releve`, `archiver_ligne`. Une réponse qui a agi n’est jamais resservie depuis le cache. Jusqu’à 25 étapes par réponse.

Ce document décrit ce qui est livré dans la version 4.2.0 et comment ajouter de l’IA ailleurs **sans casser** le principe fondateur du projet :

> **L’IA lit et explique. Elle ne calcule pas et ne décide pas.** Les montants dérivés (HT, TVA), les contrôles, les doublons, les rapprochements et les exports restent du code déterministe testé ; toute mutation passe par un clic humain et les règles serveur existantes.

## 1. Activer l’IA (sans toucher à un fichier)

1. **Réglages → Assistant IA** → coller la clé (`sk-ant-…`) → **Enregistrer la clé**.
   La clé est écrite dans `backend/.env` (droits 600) et appliquée immédiatement. Le navigateur ne la reçoit jamais en retour : seul un masque `sk-ant-…ABCD` est affiché.
2. **Tester la connexion** : vérifie la clé, l’accès au modèle choisi et le crédit disponible (un appel minimal, moins de 0,01 $).
3. **Activer le mode connecté**.

Clé créée avec la portée « Organisation » : ouvrir « Clé de portée Organisation ? » et renseigner l’identifiant d’espace de travail, ou recréer la clé dans l’espace **Default** (recommandé).

Crédits : les crédits achetés sur claude.ai (abonnement chat) **ne financent pas** l’API. L’API se recharge dans la Console Claude → *Billing → Add funds*. Un crédit insuffisant est signalé en clair par le test de connexion.

## 2. Ce que fait l’IA dans l’application

| Service | Où | Ce que fait Claude | Ce qui reste déterministe |
|---|---|---|---|
| Lecture des pièces (PDF, scans, photos) | Importer des pièces, « Extraire avec IA » | Classe la pièce (6 sous-types) et lit les champs visibles (réf., fournisseur, ICE, IF, TTC, taux, dates, mode de paiement) en **sortie JSON structurée** | HT/TVA calculés par le serveur ; tout champ `mHt`/`tva` renvoyé par le modèle est supprimé ; taux et dates validés ; doublons ; revue humaine obligatoire |
| Assistant comptable (agent) | Discussion IA | Répond en interrogeant **16 outils en lecture seule** : synthèse, recherche de lignes, détail d’une ligne, anomalies, top fournisseurs, rapprochement, pièces, lecture d’une pièce importée, imports de dossiers, relevé de déduction, désignations, notifications, snapshots, entreprise, journal, proposition d’action ; jusqu’à 12 étapes par réponse | Chaque chiffre vient d’une requête serveur (mêmes fonctions que les écrans) |
| Actions proposées | Sous la réponse | Jusqu’à **10 boutons** : ouvrir une ligne ou une page ; valider une ou plusieurs lignes ; rattacher des paiements antérieurs au relevé ; clôturer le relevé (administrateur) ; importer un dossier Google Drive ; créer un snapshot ; confirmer une désignation ; traiter une notification ; archiver une ligne ; rapprocher un paiement ; télécharger | Chaque proposition est **vérifiée par le serveur avant d’être affichée** (ligne complète, non revue, non doublon ; déduction tardive possible ; droits…). Au clic, une fenêtre récapitule l’action ; après confirmation, c’est la route habituelle (mêmes contrôles, journal) qui s’exécute. Un bouton annoncé dans le texte sans proposition réelle est signalé |
| Téléchargements à la demande | Sous la réponse | Un bouton par format demandé, pour le mois et la sélection voulus (lignes revues ou brouillon) : Excel, PDF, CSV Tableau5, CSV Sage, **JSON**, **XML SIMPL** et **Excel modèle DGI** du relevé de déduction, PDF du relevé, dernier snapshot, archives, sauvegarde complète (administrateur), pièce originale | Fichiers produits par le serveur à partir des mêmes données que les écrans : l’IA ne fabrique jamais un fichier. Un format inexistant (Word…) est signalé avec le plus proche |
| Pièces jointes au chat | Discussion IA | Lit la pièce jointe (vision ou texte), la relie aux lignes existantes | La pièce est une **donnée** : ses éventuelles instructions sont ignorées (balises `<piece>` / `<document>`) |
| « Demander à Waraqa » | Fenêtre d’édition d’une ligne | Prépare une question sur la ligne et ouvre la discussion | — |

L’assistant n’est plus limité aux « 100 premières lignes » de la version précédente : il pagine et filtre côté serveur, et indique ce qu’il a consulté (**Données consultées**) et si un résultat a été tronqué.

## 3. Coûts et cache

### Cache côté fournisseur (prompt caching)
- Règles + outils de l’assistant et prompt d’extraction sont marqués `cache_control` : relus à **10 % du prix** d’une question à l’autre (durée 5 min, renouvelée à chaque usage).
- Le dernier bloc de chaque requête est aussi marqué : dans une conversation, l’historique déjà envoyé et les résultats d’outils sont relus depuis le cache à chaque étape.

### Cache des réponses (Waraqa)
- Première question d’une discussion, sans pièce jointe : si la même question (casse et espaces ignorés) a déjà été posée **et que rien n’a changé** (lignes, versions, pièces, affectations, réglages, modèle, consignes), la réponse est réutilisée **sans appel** (0 $, 7 jours).
- Le bouton **Régénérer** force une nouvelle réponse. Désactivable dans les réglages.

### Budget et consommation
- **Budget mensuel** (10 $ par défaut) : au-delà, tout appel est bloqué avec un message clair — y compris au milieu d’une boucle d’outils.
- Chaque appel est comptabilisé (tokens entrants, sortants, lus/écrits en cache, coût estimé, par fonction). Visible dans Réglages → Assistant IA et dans l’en-tête de la discussion.
- Tarifs utilisés pour l’estimation (USD par million de tokens, entrée/sortie) : Sonnet 5 2/10, Haiku 4.5 1/5, Opus 5.5 4/20, Fable 5.1 10/50 ; écriture cache ×1,25, lecture ×0,1. Modèle inconnu : tarif le plus élevé.

Ordres de grandeur attendus avec Sonnet 5 (à confirmer par `npm run test:ia`, qui mesure le coût réel) : une question à l’assistant ≈ 0,01 à 0,04 $ ; une pièce extraite ≈ 0,005 à 0,02 $. Pour 150 pièces et quelques dizaines de questions par mois : quelques dollars.

## 4. Choix du modèle

| Modèle | Usage conseillé |
|---|---|
| **Claude Sonnet 5** (défaut) | Extraction et assistant au quotidien : meilleur rapport qualité/coût |
| Claude Haiku 4.5 | Questions simples, volume élevé ; sans réglage de réflexion (l’application retire automatiquement les options non prises en charge) |
| Claude Opus 5.5 | Audits complexes ponctuels ; environ 2× le coût de Sonnet 5 |

**Niveau de réflexion** : Rapide / Équilibré (défaut) / Approfondi. Un modèle qui refuse une option (réflexion, format structuré) est rappelé une fois sans elle.

## 5. Robustesse et sécurité

- Point de passage unique : `backend/src/ocr/ia-gateway.ts` (concurrence bornée, délai 180 s, 2 reprises SDK sur 429/5xx, annulation).
- Erreurs traduites sans recopier le texte du fournisseur : clé refusée, modèle introuvable, crédit insuffisant, portée de clé, contexte trop long, quota, surcharge.
- Tests automatisés : **aucun appel réseau possible** (client bloqué en `NODE_ENV=test`, clé vidée par `test/setup-env.ts`).
- Conversations privées à leur auteur ; les outils n’exposent que les données de l’espace local, jamais les discussions d’autres utilisateurs.
- La clé n’apparaît ni dans les réponses API, ni dans le journal, ni dans les rapports de test.

## 6. Ajouter de l’IA ailleurs sans casser la solution

Règles communes, à respecter pour toute nouvelle fonction IA :

1. Passer par `IaGateway` avec `onUsage: (u, m) => this.recordUsage('<fonction>', u, m)` et `beforeCall: () => this.assertBudget()`.
2. Sortie **structurée** (`output_config.format`) et filtrée par une liste blanche de champs ; jamais de montant dérivé accepté du modèle.
3. Le résultat est une **proposition** stockée et affichée ; l’application ne l’applique qu’après clic, via une route existante et ses validations.
4. Un test e2e avec client simulé (`IaGateway.testClientFactory`) et un cas « réponse invalide ».

Extensions prêtes à brancher (par ordre de valeur pour le comptable) :

| Extension | Point d’entrée | Proposition de l’IA | Validation humaine |
|---|---|---|---|
| Mapping de colonnes d’un Excel/CSV inconnu | `importPreview` (aperçu d’import) | Correspondance colonnes → 13 champs Tableau5 | L’utilisateur accepte le mapping dans l’écran d’aperçu existant |
| Désignation proposée | `DesignationsService` | Libellé parmi le référentiel + justification | Confirmation dans l’écran Désignations (flux « en attente » existant) |
| Relevé bancaire PDF multi-lignes (SGMB, CIH, BMCE) | Import → extraction | Une ligne par mouvement (`releve_bancaire`) | Revue ligne à ligne ; rapprochement proposé puis confirmé |
| Rapprochement assisté | outil `rapprochement` + `proposer_action` | Paire paiement/facture + justification | Fenêtre de confirmation existante |
| Synthèse mensuelle rédigée pour la direction | Exports & snapshots | Texte de commentaire du snapshot | Relecture avant export PDF |

Hors périmètre volontaire : dépôt DGI, écriture directe dans Sage, décision fiscale automatique.
