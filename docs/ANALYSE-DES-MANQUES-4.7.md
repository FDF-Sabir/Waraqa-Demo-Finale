# Analyse des manques — Waraqa 4.7 (24 septembre 2026)

Source : les échanges du 24/09 entre le comptable et l’assistant (15:51 → 16:29), relus face au code de la branche `claude/charming-knuth-gum8u3`. Trois familles : ce que l’assistant a dit à tort, ce qui manquait réellement et a été construit, ce qui manque encore.

## 1. Ce que les échanges révèlent

| Constat dans l’échange | Vérité dans le code | Traitement |
|---|---|---|
| « Mon outil Drive attend un lien de dossier » (15:51) | Faux depuis 4.6 : `importer_drive` accepte dossier, fichier unique et Google Sheets | Instance en 4.5 ; corrigé en 4.6 |
| « L’import n’a pas pu démarrer : autorisation Drive manquante » (15:54) | Vrai, mais aucun bouton ne menait à l’autorisation | 4.7 : proposition `autoriser_drive` (administrateur) |
| « Pas d’insertion de fichier unique dans le chat » (15:59) puis « si, via pièce jointe » (16:26) | La pièce jointe existait mais créait des lignes immédiatement, avant toute décision | 4.7 : pièce en attente, `comptabiliser_piece` sur demande |
| « Correction en masse jusqu’à 100 lignes », « calculatrice exacte », « mémoriser / oublier une consigne », « classeur Excel libre 20 feuilles », « Word / HTML », « recherche web » (16:26) | Aucune de ces capacités n’existait dans le dépôt : l’assistant les a annoncées sans catalogue | 4.7 : toutes construites sauf Word natif et recherche web (voir §3) ; règle : consulter `capacites` avant d’affirmer |
| « Pas de scoring de confiance », « pas de validation assistée par seuil » (15:59) | Vrai | 4.7 : `qualite_extraction`, lignes fiables / à examiner dans le plan de travail |
| « Pas d’automatisation programmée ni de notification proactive » (15:59) | Vrai (seuls les snapshots étaient planifiés) | 4.7 : bilan quotidien notifié, dédupliqué |
| « Pas d’apprentissage des corrections » (15:59) | Vrai | 4.7 : consignes par fournisseur mémorisées sur demande ; l’apprentissage automatique reste hors périmètre (§3) |
| « Aucun bouton n’a été préparé » sous des réponses purement informatives | Filet de sécurité trop large | 4.7 : n’apparaît que si le texte invite à cliquer |

Leçon retenue : l’assistant ne doit décrire ses capacités qu’à partir du registre réel (`capacites`, généré depuis le code). Le message de 16:26 est l’exemple exact de ce que le plan directeur voulait empêcher.

## 2. Ce qui a été construit (4.6 + 4.7)

Fonctionnalités : rôles documentaires et références sans ligne ; plan de travail et précontrôle ; lecture des gros classeurs ; clôture versionnée ; doublons explicables ; rapports Markdown/PDF/HTML ; missions persistées ; catalogue des capacités ; pièce jointe en attente ; corrections en masse ; calcul exact ; consignes ; classeur libre ; import durable ; manifeste ZIP ; qualité d’extraction ; bilan quotidien ; autorisation Drive proposée.

Services : sauvegarde complète (originaux, livrables, boîte d’envoi, archives de lots) ; restauration contrôlée ; verrou de période commun ; budget réservé ; réponses avec bilan structuré.

Logique métier : comprendre avant de comptabiliser ; identité de société jamais copiée ; règles du relevé archivées avec chaque version ; décisions humaines tracées (revue, clôture, archivage, levée de doublon) ; provenance et version obligatoires pour toute correction.

Preuves : 139 tests unitaires et 129 e2e (client Anthropic simulé), smoke test, deux parcours navigateur ; voir `01_CHECKPOINTS_DEVELOPPEMENT.md`.

## 3. Ce qui manque encore (par ordre de valeur)

### 3.1 Fonctionnalités

1. **Format Word natif (.docx)** : le rapport existe en Markdown, PDF et HTML ; un .docx demande une bibliothèque supplémentaire et une recette de mise en page. Le HTML s’ouvre et se colle dans Word.
2. **Recherche web / sources officielles** : volontairement absente. L’assistant ne doit pas citer un texte fiscal non vérifié ; une bibliothèque locale de références DGI validées par le comptable serait la bonne réponse (L5.1).
3. **Envoi d’e-mails** (expert-comptable, tiers) : aucun serveur de messagerie n’est configuré ; la boîte d’envoi locale existe pour les tests. À cadrer avec la politique d’autorisation (plan §7.1).
4. **Prévisualisation d’un lot hétérogène dans l’interface** : le manifeste existe (`?dryRun=true`) mais n’a pas encore d’écran « analyser avant d’importer » ni de sélection d’entrées à exclure.
5. **Adaptation du modèle Excel du comptable** (L3.2) : le modèle DGI est fixe ; la reprise de la présentation d’un classeur personnel reste manuelle.
6. **Vues multi-mois et comparaisons annuelles** (L8.2) : `generer_tableau` couvre une période libre ; le tableau de bord reste mensuel.
7. **Brouillons et captures durables côté navigateur** (L8.3), accessibilité approfondie et recette sur appareil réel (L8.4).

### 3.2 Services

1. **Règles fiscales validées** (L5.1, L5.2) : les taux, délais, plafonds espèces, avoirs, acomptes et prorata sont un comportement logiciel archivé avec chaque version ; un comptable référent doit les confirmer et signer des jeux d’exemples.
2. **Essai contrôlé de dépôt SIMPL** (L5.5) : le fichier XML est produit selon le modèle Excel DGI ; aucun dépôt réel n’a été testé.
3. **Banque et fournisseurs** (L6) : transactions bancaires typées, soldes, devises, référentiel fournisseurs avec alias, classement des candidats de rapprochement, avoirs assistés.
4. **Veille paramétrable** (L7.2–L7.4) : le bilan quotidien existe ; les alertes d’échéances, la simulation d’une politique d’autonomie et le résumé hebdomadaire restent à faire.
5. **Multi-sociétés** (L9) et **pré-comptabilisation** (L9.4) : un espace = une société ; l’export Sage reste le seul pont comptable.
6. **CI, recette sécurité et charge, installation reproductible** (L10.1–L10.3) : les tests tournent localement ; aucune intégration continue n’est configurée dans le dépôt.
7. **Recette avec la clé Anthropic réelle** (`npm run test:ia`) : non exécutée dans cette itération, faute de clé dans l’environnement de développement.

### 3.3 Logique métier

1. **Apprentissage des corrections** : une correction confirmée sur un fournisseur ne modifie pas encore la lecture des pièces suivantes ; les consignes par fournisseur en sont la première brique, à relier à l’extraction.
2. **Fusion de lignes en facture** (plan §8.2 `Invoice/InvoiceLine`) : l’entité reste une ligne Tableau5.
3. **Effet fiscal des paiements partiels** (D16) : l’allocation existe, la déduction au prorata du payé n’est pas spécifiée.
4. **Gestion des devises** : montants en MAD uniquement.
5. **Signature ou horodatage qualifié** : empreintes SHA-256 seulement, sans valeur probante légale.

## 4. Prochaine action exacte

Dans l’ordre : (1) écran « analyser avant d’importer » sur le manifeste ZIP ; (2) atelier de règles fiscales avec le comptable référent (L5.1) ; (3) recette `npm run test:ia` sur le poste du comptable ; (4) L6.1 transactions bancaires.
