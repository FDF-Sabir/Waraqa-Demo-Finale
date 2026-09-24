## 1. Résumé

Waraqa est passé de la version 4.5.0 (« l’agent fait le travail ») à la version 4.7.0 (« l’intelligence comptable pilote le dossier ») en seize checkpoints commités et poussés sur la branche `claude/charming-knuth-gum8u3` du dépôt `FDF-Sabir/Waraqa-Demo-Finale`. Rien n’a été fusionné dans `main` : vous vérifiez, puis vous décidez.

Le plan directeur (`00_PLAN_DIRECTEUR_WARAQA_INTELLIGENCE_COMPTABLE.md`) fixait l’objectif : une opération peut être faite dans l’interface, demandée à l’IA ou proposée par l’IA, avec **les mêmes services métier, permissions, calculs et preuves**. Cette itération livre les fondations de cet objectif et la plupart des lots P0, avec une preuve automatisée pour chaque point.

| Indicateur | 4.5.0 | 4.7.0 |
|---|---|---|
| Outils de l’assistant | 26 | 42 (25 lecture, 16 actions, 1 proposition) |
| Types de propositions confirmables | 14 | 16 |
| Tests unitaires | 121 | 139 |
| Tests e2e (client IA simulé) | 100 | 129 |
| Parcours navigateur | 1 script | 2 scripts (historique + cockpit) |
| Rôles documentaires | aucun | 8 |
| Versions figées de relevé | hash XML seul | version complète, exports depuis la version |

## 2. Ce que le comptable voit de nouveau

- **Tableau de bord** : plan de travail en six étapes (À classer → À compléter → À contrôler → Prêt pour revue → Relevé → Clôture) avec compteurs, identifiants, état, boutons « Ouvrir » et « Confier à l’IA » (demande déjà rédigée) ; liste des blocages avec l’action qui les lève.
- **Import** : rôle des documents (pièce, paiement, modèle, historique, référentiel, justificatif annexe, vérité terrain, à classer), rôle imposable au dépôt, reclassement, alerte d’identité de société contradictoire, bouton « Comptabiliser » pour une pièce jointe au chat, « Reprendre le lot » après une interruption.
- **Relevé de déduction** : précontrôle avec blocages, versions figées (numéro, empreintes, règles, réouvertures motivées), réouverture avec motif obligatoire.
- **Discussion IA** : rôle de chaque pièce jointe, « Que sait faire Waraqa ? » (catalogue réel), bilan de chaque réponse, missions de la discussion, fichiers rédigés (Markdown, PDF, HTML, classeur Excel).

## 3. Ce que l’assistant fait de nouveau

| Famille | Outils |
|---|---|
| Comprendre le système | `capacites`, `precontroler_releve`, `plan_de_travail`, `qualite_extraction`, `etat_mission`, `consignes` |
| Lire sans limite | `lire_piece` (paginé), `lire_classeur`, `lire_plage` (blocs de 200 lignes, couverture total/couvert/reste), `pieces` (paginé, filtré par rôle, statut, lot) |
| Décider avec preuve | `comparer_doublons`, `corriger_ligne` (provenance + version obligatoires), `corriger_lignes` (masse), `calculer` |
| Importer | `importer_drive` (dossier, fichier, Google Sheets, rôle), `comptabiliser_piece` |
| Produire | `generer_rapport` (md, pdf, html), `generer_classeur`, `generer_fichier`, `generer_tableau` |
| Mémoriser | `memoriser_consigne`, `oublier_consigne` (sur demande explicite, révocable) |
| Proposer | `lever_doublon` (motif), `autoriser_drive` (administrateur) en plus des 14 propositions existantes |

Règles ajoutées aux instructions : consulter le catalogue avant d’affirmer qu’une fonction n’existe pas ; distinguer fonction absente, accès manquant et erreur technique ; annoncer la couverture d’une lecture ; ne jamais copier l’identité d’un document de référence ; une pièce jointe reste en attente jusqu’à la demande de comptabilisation ; tout calcul passe par le serveur.

## 4. Ce que le serveur garantit de nouveau

1. **Verrou de période** sur tous les chemins : une ligne déclarée dans un relevé clôturé ne peut être modifiée, archivée, liée, affectée ni déplacée, que la demande vienne des routes, de l’atelier ou de l’agent.
2. **Clôture versionnée** : chaque clôture fige en-tête, lignes, contrôles, écartées, alertes, totaux, règles et empreintes XML/XLSX ; les fichiers définitifs proviennent de la version ; la réouverture conserve la version et son motif.
3. **Comprendre avant de comptabiliser** : un modèle, un historique, un référentiel ou un fichier de vérité terrain ne crée aucune ligne ; un classeur d’une autre société reste « à classer » ; une pièce jointe au chat attend la décision.
4. **Provenance et version** de chaque correction de l’agent, tracées avant/après au journal ; idempotence d’une action répétée dans une réponse ; missions persistées avec statut et coût ; budget réservé avant chaque appel et libéré en toute issue.
5. **Import durable** : archive conservée, reprise après redémarrage sans rejouer, manifeste avant traitement.
6. **Sauvegarde complète** : SQLite, originaux, fichiers livrés, boîte d’envoi Drive, archives de lots ; restauration qui refuse une sauvegarde incomplète.
7. **Décisions réservées au comptable** : revue, clôture, réouverture, archivage, levée de doublon, identité de société, droits et secrets.

## 5. Chronologie des checkpoints

| Checkpoint | Contenu | Preuve |
|---|---|---|
| CP01 | Baseline verte | build, 121 unitaires, 100 e2e |
| CP02 | Verrou de période commun | `closed-period.e2e-spec.ts` |
| CP03 | Sauvegarde complète et restauration | `integrity.e2e-spec.ts` |
| CP04 | Rôles documentaires, contrat Drive, catalogue | `document-role.spec.ts`, `document-roles.e2e-spec.ts` |
| CP05 | Gros classeurs par index et plages | `workbook-reader.spec.ts`, `workbook-chat.e2e-spec.ts` |
| CP06 | Précontrôle et plan de travail | `cockpit.e2e-spec.ts` |
| CP07 | Clôture versionnée | `releve-version.e2e-spec.ts` |
| CP08–09 | Doublons explicables, rapports Markdown/PDF | `doublons-rapport.e2e-spec.ts`, `report-pdf.spec.ts` |
| CP10 | Provenance, idempotence, missions, budget | `missions.e2e-spec.ts` |
| CP11 | Interface pilotée | `ui-test-cockpit.mjs` (8 étapes, 0 erreur console) |
| CP12 | Version 4.6.0, documentation, recette complète | `docs/checkpoints/CP12-*.log` |
| CP13 | Pièces en attente, corrections en masse, calcul, consignes, classeur, HTML, autorisation Drive | `staging-consignes.e2e-spec.ts`, `agent-extras.spec.ts` |
| CP14 | Import durable, manifeste ZIP, archives sauvegardées | `lot-reprise.e2e-spec.ts` |
| CP15 | Qualité d’extraction, fiabilité des lignes, bilan quotidien | `qualite.e2e-spec.ts` |
| CP16 | Version 4.7.0, analyse des manques, recette complète, ce rapport | `docs/checkpoints/CP16-*.log` |

## 6. Comment vérifier sur votre poste

1. `git fetch origin` puis `git checkout claude/charming-knuth-gum8u3`.
2. `npm run setup` puis `npm run start` ; votre base `backend/data/` et votre `.env` ne sont pas modifiés. Les documents déjà importés restent des pièces comptables ; aucun reclassement automatique n’est appliqué à l’existant.
3. Dans l’application : tableau de bord (plan de travail), Importer (rôles), Relevé de déduction (précontrôle, versions), Discussion IA (« Que sait faire Waraqa ? », pièce jointe en attente).
4. `npm test`, `npm run test:ui`, `npm run test:ui:cockpit` rejouent la recette ; `npm run test:ia` exécute la recette avec votre clé Anthropic réelle sous plafond de dépense (non exécutée ici, aucune clé dans l’environnement de développement).

## 7. Ce qui reste et ce que cette itération n’a pas fait

Le détail est dans `docs/ANALYSE-DES-MANQUES-4.7.md`. En résumé : format Word natif, recherche web (volontairement absente tant qu’une base de références validées n’existe pas), envoi d’e-mails, écran « analyser avant d’importer », adaptation du modèle Excel personnel, règles fiscales à confirmer par le comptable référent, essai de dépôt SIMPL, banque et fournisseurs (L6), veille paramétrable (L7), multi-sociétés (L9), intégration continue (L10). Aucun de ces points n’est déclaré réalisé.

Deux mises en garde. Les règles fiscales du relevé (taux, délai d’un an, plafonds espèces) sont un comportement logiciel archivé avec chaque version, pas une validation juridique. Et l’assistant de votre instance, en 4.5, a annoncé le 24/09 à 16:26 des capacités qui n’existaient pas : la 4.7 les rend réelles ou les écarte explicitement, et impose désormais la consultation du catalogue avant toute affirmation.
