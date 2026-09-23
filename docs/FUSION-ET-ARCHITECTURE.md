# Fusion et architecture — Waraqa Demo Finale 4.0

## Sources effectivement inspectées

- `Waraqa V2(1).zip` : backend NestJS/TypeORM/SQLite, façade API TanStack, contrôles Tableau5, six sous-types, calculs, doublons, désignations, authentification, journal, notifications et réglages ; interface statique de secours.
- `Waraqa-FrontEnd.zip` : interface React/Vite, shell visuel, dashboard, relevé, import, désignations, journal, onglets de réglages, chat avec pièces jointes, résultats structurés et actions. Les fonctionnalités y reposaient majoritairement sur des mocks et un état React volatil.

La V3 Local évoquée dans les échanges précédents **n’est pas l’une de ces pièces jointes**. Aucun contenu d’une archive absente n’a été inventé.

## Choix d’assemblage

Une nouvelle application racine contient `backend/`, `frontend/`, `scripts/`, `examples/` et `docs/`.

Le backend V2 reste le moteur des factures et de la traçabilité ; les nouveaux services complètent ses contrats. L’interface d’exécution est nouvelle : elle reprend la famille visuelle verte et la navigation du frontend fourni, et réimplémente ses interactions avec une vraie API. L’ancien frontend TanStack et ses composants doublonnés ne sont pas lancés ni embarqués comme un deuxième produit.

| Fonction des sources | Assemblage livré |
|---|---|
| Auth NestJS, JWT, bcrypt | Conservés ; premier compte administrateur, comptes internes, révocation à suppression/changement mot de passe |
| Tableau5 V2 et calculs | Conservés ; centimes équilibrés, date de paiement prioritaire pour le mois, revue humaine distincte |
| Incomplétudes et doublons | Conservés ; doublon persistant, validation interdite tant qu’il subsiste |
| Sous-types et douane | Conservés ; signal de vigilance, décision humaine explicite |
| Paiement orphelin V2 | Conservé ; confirmation sans facture + rapprochement explicite avec une facture |
| Désignations V2 | Seed et confirmation conservés ; ajout manuel disponible |
| Import frontal simulé | Remplacé par dépôt réel, fichiers sources, hash, erreurs par ligne, extraction live configurable |
| OCR mock V2 | Conservé pour ses tests ; jamais utilisé silencieusement sur un scan utilisateur par la nouvelle interface |
| Chat frontal simulé | Historique SQLite par utilisateur/mois ; analyses locales clairement identifiées ; connecteur Anthropic live |
| Actions insérées dans le chat | Boutons reliés aux vrais écrans et à l’export ; aucune confirmation fictive de mutation |
| Modèles conversationnels | Catalogue persistant éditable, substitution de la période, insertion dans le composeur |
| Journal | Service original conservé et alimenté par import, export, snapshot, réglages et rapprochement |
| Notifications V2 | Vraies lectures/traitements par utilisateur ; cloche intégrée |
| Dashboard / synthèse | Calculés depuis les mêmes factures, hors double comptage des mouvements bancaires |
| Réglages entreprise | Persistance serveur, métadonnées sur l’export Excel |
| Réglages préférences | Densité réelle, badge de notification ; français et MAD explicitement fixes |
| Réglages utilisateurs | Comptes réels, rôles serveur, création/suppression ; pas d’invitation email fictive |
| Sécurité | Vrai changement de mot de passe ; 2FA explicitement non implémentée |
| Export simulé | Excel et CSV réels, CSV Sage équilibré et mapping des comptes |
| Snapshot synthétique V2 | Snapshot persistant immuable + planification locale testée |
| Drive simulé | Configuration de destination sauvegardée, connexion indisponible explicitement affichée |

## Données

Les entités originales restent dans leurs tables : `factures`, `utilisateurs`, `designations`, `journal`, `reglages`, `notification_etats` selon le nom défini dans l’entité.

La nouvelle table `workspace_records` stocke des enregistrements JSON typés par `kind` : `settings`, `document`, `template`, `conversation`, `snapshot`, `seed`, `schedule`. Les documents binaires sont hors répertoire public, nommés par UUID et accessibles via une route authentifiée.

Les factures reçoivent les champs `documentId`, `revueHumaine`, `demonstration`, `archivee`, `doublonDe`, `rapprocheeA`. L’état « validee » historique signifie que les champs structurels sont suffisants ; `revueHumaine` signifie qu’un utilisateur a effectué sa revue explicite. Une édition remet cette revue à zéro.

L’export par défaut sélectionne les lignes revues, complètes, non archivées, sans doublon. Les mouvements de relevé/avis bancaire sont exclus, sauf les commissions identifiées. « Toutes les lignes » produit un export marqué BROUILLON. Aucune validation structurelle ne vaut attestation de déductibilité fiscale.

## Routes

Toutes les routes sont sous `/api` ; la SPA est servie sur `/`. Les contrats V2 restent utilisables sous ce préfixe : `auth`, `factures`, `designations`, `journal`, `notifications`, `reglages`, `ocr`, `snapshots/synthese`.

Les nouvelles routes sont sous `/api/workspace` : `status`, `settings`, `summary`, `seed`, `documents`, `templates`, `users`, `password`, `reconciliation`, `snapshots`, `export`, `conversations`, `invoices/:id/archive`, `invoices/:id/document`. Les conversations sont privées à leur auteur. Les pièces et factures sont partagées dans cet espace local.

## IA

- Démo : aucune requête Anthropic ; analyses locales de synthèse, anomalies, fournisseurs, paiements et disponibilité des exports. Les réponses en langage libre qui sortent de ces analyses donnent une synthèse et expliquent la limite.
- Live : SDK Anthropic côté serveur, `messages.create`, historique limité aux 20 derniers messages, contexte limité aux 100 premières lignes du mois et pièces jointes du message courant. Les modèles ne déclenchent aucune mutation métier ; les boutons restent responsables des actions humaines.
- Les imports PDF/images utilisent le préparateur et le parseur V2 ; seules les données brutes autorisées sont acceptées. Les montants dérivés restent des calculs serveur.
- Le modèle est configurable. Les erreurs live sont affichées ; aucune substitution silencieuse par une réponse mock.

Documentation consultée pour le branchement : https://platform.claude.com/docs/en/api/typescript et https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript . Aucune clé réelle utilisée pendant la réalisation.

## Bornes actuelles

Démo locale mono-espace, pas une offre SaaS multi-tenant ni une version fiscalement certifiée. Pas de moteur d’avoir négatif, de paiements fractionnés, de synchronisation Sage directe, de dépôt DGI, d’OAuth Drive, de push/email externe, ni de 2FA. Les imports structurés exigent le schéma documenté ; le système ne devine pas les colonnes arbitraires sans IA.

La planification s’appuie sur la cadence du premier administrateur : lundi UTC, les 1/16 UTC, ou dernier jour du mois UTC. Elle vérifie chaque minute si le serveur tourne ; marqueur persistant anti-répétition par échéance. Il n’y a pas de rattrapage au prochain démarrage.

Les versions de dépendances restent proches des sources pour préserver les tests. Ce livrable n’est pas un audit de sécurité de l’ensemble de ces dépendances ; une industrialisation nécessitera migrations SQL, politique de sauvegarde/restauration, durcissement réseau et mises à jour des dépendances.
