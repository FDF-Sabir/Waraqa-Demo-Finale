# Waraqa — Démo finale unifiée

Nouvelle application assemblée à partir des **deux archives fournies** : `Waraqa V2(1).zip` et `Waraqa-FrontEnd.zip`. Un seul backend, une seule base, une seule interface ; ce ZIP ne juxtapose pas deux applications à lancer séparément.

## Démarrer aujourd’hui, sans clé API

1. Installer **Node.js 22 ou 24**, puis extraire complètement ce ZIP.
2. Sous Windows : double-cliquer sur `DEMARRER-Windows.bat`.
   Sous Ubuntu/macOS : ouvrir un terminal dans ce dossier et lancer `bash DEMARRER.sh`.
   Autre possibilité : `npm start`.
3. La première ouverture installe les dépendances backend. **Internet est nécessaire pour cette installation**, mais aucune clé IA n’est requise.
4. Ouvrir **http://localhost:3000**. Créer le premier compte : il devient administrateur de cet espace local. Aucun mot de passe prédéfini n’est livré.
5. Dans **Vue d’ensemble**, cliquer sur **Charger les exemples**. Six lignes fictives sont créées dans la période affichée : achats, service, pièce incomplète, douane, paiement orphelin et frais.
6. Ouvrir **Discussion IA**, sélectionner un modèle et envoyer le message. Les analyses locales utilisent les vraies données de votre démo.

Laisser le terminal ouvert. Arrêter avec Ctrl+C. Les prochaines ouvertures ne réinstallent pas les dépendances. Les fichiers compilés de l’interface et du backend sont inclus.

L’application est en français et les montants sont en MAD. Il s’agit d’un espace comptable local partagé entre ses utilisateurs, pas d’une plateforme multi-entreprises isolées.

## Activer la clé demain

1. Arrêter Waraqa.
2. Ouvrir `backend/.env`, créé au premier démarrage.
3. Compléter `ANTHROPIC_API_KEY=` avec votre clé. Ne pas la mettre dans le frontend, dans une conversation, ni dans les sources partagées.
4. Relancer Waraqa.
5. Aller à **Réglages → Assistant IA**, choisir **Connecté — Anthropic Claude**, vérifier le modèle disponible pour votre compte, puis enregistrer.

Le modèle et les instructions sont modifiables. Les appels IA ne partent qu’en mode connecté. Les erreurs de connexion restent visibles ; l’application ne remplace pas silencieusement une réponse live en échec par une réussite de démo.

Les PDF/images déjà conservés sans clé peuvent être extraits avec le bouton **Extraire avec IA**, tant qu’ils n’ont pas déjà de lignes associées. Sinon, corriger les lignes existantes pour éviter de les dupliquer.

**Le connecteur live est implémenté mais n’a pas été testé avec une clé réelle**, conformément à la demande de reporter son utilisation. Les données du mois et les pièces jointes de la discussion sont transmises à Anthropic uniquement lors d’une utilisation live.

## Fonctions réunies

- Discussion avec historique persistant par mois, plusieurs conversations, renommage/suppression, pièces jointes, réponses structurées, copier, réessayer, accès aux pièces et export Excel.
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
- Snapshots immuables et snapshots automatiques pendant que le serveur est actif.
- Entreprise, assistant, préférences, exports, utilisateurs, changement du mot de passe et statut des intégrations.

## Ce qui est démontré, ce qui exige un service externe

| Fonction | État livré |
|---|---|
| Données, pièces, chat et réglages | SQLite/fichiers persistants, pas de mock en mémoire |
| Analyses du chat sans clé | Déterministes et identifiées « Analyse locale » ; pas un LLM local |
| Conversation libre et OCR PDF/images | Connecteur Claude implémenté, activation à faire avec votre clé |
| Excel/CSV/JSON structurés | Import réel sans IA ; voir `examples/` |
| Exports | Fichiers réellement générés et téléchargés |
| Sage 100 | CSV équilibré à mapper dans l’assistant d’import ; aucune connexion directe à Sage |
| DGI | Tableau de travail EDI, aucun XML officiel ni dépôt automatique/certification |
| Google Drive | Dossier de destination mémorisable ; OAuth non implémenté, bouton désactivé et état non connecté |
| Email / push hors application | Non raccordés ; la cloche interne fonctionne |
| 2FA | Non implémentée, état explicite ; pas de faux interrupteur de sécurité |
| Snapshots planifiés | Réels, locaux, uniquement serveur ouvert ; aucun rattrapage des exécutions manquées |

Ces limites existaient sous forme de simulations dans les interfaces d’origine ; elles ne sont pas présentées comme des services opérationnels.

## Parcours de démonstration

1. Choisir septembre 2026 ou une période de votre choix, charger les exemples.
2. Tableau de bord → constater les lignes à contrôler.
3. Discussion IA → « Contrôle mensuel », puis « Top fournisseurs ».
4. Relevé → compléter l’ICE de la pièce incomplète, enregistrer, sélectionner et valider les lignes revues.
5. Rapprochement → choisir la facture candidate au paiement de 12 000 MAD et confirmer le lien.
6. Importer `examples/import-factures.csv` puis `examples/import-paiement.json` ; sélectionner septembre 2026 pour voir ces lignes. Ce sont des données d’exemple à ne pas réutiliser en comptabilité réelle.
7. Importer un scan : sans clé, il est conservé, puis « Saisir une ligne » permet de le compléter.
8. Exports & snapshots → télécharger Excel ou Sage, créer un snapshot, puis vérifier qu’une modification ultérieure ne change pas le snapshot.
9. Réglages → personnaliser l’entreprise et les comptes ; recharger la page pour vérifier la persistance.

## Données et sauvegarde

`backend/data/waraqa.sqlite` contient les utilisateurs, factures, conversations, modèles et réglages. `backend/data/files/` contient les pièces originales. Arrêter le serveur avant de copier **tout `backend/data/`** pour une sauvegarde cohérente. Ne pas supprimer la base pour résoudre un problème d’affichage.

Le secret de session se trouve dans `backend/.env`, jamais livré prérempli. Un changement de mot de passe invalide les anciennes sessions. La suppression d’un compte révoque son accès ; ses actions historiques restent dans le journal.

L’archivage retire une ligne des vues actives et des exports ; le journal est conservé. Il n’y a pas encore de bouton de restauration d’archive. Les données des archives d’origine et leur ancienne base SQLite ne sont pas copiées dans le nouveau dossier : la démo démarre proprement.

## Développement

- `npm run setup` : installer les dépendances de développement et recompiler.
- `npm run build` : compiler NestJS, vérifier TypeScript frontend et construire React/Vite.
- `npm test` : tests unitaires, API héritée et parcours intégrés sur base temporaire.
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
