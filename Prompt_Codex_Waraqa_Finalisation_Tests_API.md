# Prompt Codex — Finalisation complète de Waraqa et validation après réception de la clé API

Tu reprends le développement de **Waraqa**, application de préparation comptable pour FEM au Maroc, destinée à alimenter le travail du comptable et ses imports Sage 100. Agis comme architecte logiciel senior, développeur full stack et responsable qualité. Ta mission est de livrer une application cohérente, interactive, persistante et vérifiée, avec tous les services métier du périmètre raccordés au frontend.

**Exécute le travail. Ne te limite pas à un audit, une liste de conseils ou un plan.** Prends les décisions techniques courantes et documente les hypothèses métier. Travaille jusqu’à terminer tout ce qui est réalisable sans clé API. Prépare ensuite les essais réels approfondis à lancer dès que je fournis la clé dans un canal de configuration sûr. Ne promets pas une exécution autonome demain si aucune session ou automatisation ne la permet.

## 1. Sources, continuité et protection de l’existant

Le livrable de départ est `Waraqa-Demo-Finale.zip`, version annoncée `4.0.0-demo`. Les sources historiques sont `Waraqa V2(1).zip` et `Waraqa-FrontEnd.zip`. Inspecte leurs contenus disponibles et la version de travail la plus récente avant toute modification. Une V3 Local a été évoquée, mais ne suppose pas disposer de son code si son archive est absente.

Lis les instructions du dépôt, `LISEZ-MOI.md`, `docs/FUSION-ET-ARCHITECTURE.md`, `docs/VALIDATION.md`, les contrats API, les schémas de données et les tests. La base annoncée est NestJS/TypeORM/SQLite et React/Vite. Les anciens résultats annoncés sont 50 tests unitaires, 53 API/e2e, 17 parcours intégrés et 8 groupes de contrôles navigateur : établis ton propre état de référence, sans les présenter comme des résultats de la nouvelle version.

L’objectif reste **un seul produit réunissant les capacités utiles des deux sources**, avec backend et frontend communs. Ne reconstruis pas inutilement l’ensemble. Conserve les fonctions opérationnelles, les données, les documents et les historiques. Établis une matrice source → fonction → état réel → service backend → écran → test → travail restant.

Avant de modifier les données, prépare une sauvegarde cohérente et vérifie la restauration sur une copie. Travaille sur une branche dédiée si Git est disponible, préserve les modifications existantes et crée des étapes de retour identifiables. Aucune remise à zéro de base, suppression de fonctionnalité ou modification destructive pour faciliter un test. Toute évolution de schéma exige une migration versionnée et une stratégie de restauration vérifiée.

## 2. Mode opératoire et gestion des limites

Avance par lots verticaux terminés : modèle de données, règles, API, interface, erreurs et vérification. Priorité : intégrité des données et sécurité, justesse métier, parcours complets, services manquants, finition visuelle, performances.

Après chaque lot, exécute les contrôles pertinents et corrige les régressions avant de poursuivre. Ne désactive pas les assertions pour faire passer les tests. Réserve les tests supplémentaires aux risques réels et aux comportements utiles.

Maintiens `docs/ETAT-REPRISE.md` avec la version/commit, les modifications, les migrations, les résultats datés, les blocages, les commandes reproductibles et la prochaine action exacte. Avant une limite de contexte ou une interruption, termine l’opération atomique en cours, sauvegarde un état compilable et mets ce fichier à jour. Ne lance pas une refonte risquant de laisser l’application inutilisable. Tu ne peux pas garantir l’absence absolue de bugs ou l’absence de limite de session : apporte des preuves, des points de reprise et un périmètre vérifié.

Communique brièvement les résultats concrets. Ne demande pas de confirmation pour chaque choix réversible déjà couvert par cette mission. Respecte cependant les contrôles d’accès, les secrets, les actions externes et les autorisations réellement disponibles.

## 3. Styles, cohérence et interactivité de bout en bout

Finalise l’identité Waraqa existante : typographie, couleurs, espacements, densité, icônes, bordures, ombres, tableaux, formulaires et composants réutilisables. Harmonise toutes les pages, modales et menus, y compris les états rarement visibles.

Le chat doit proposer une expérience soignée inspirée des usages de Claude : conversations persistantes, historique, recherche, renommage, suppression confirmée, modèles éditables, pièces jointes avec aperçu et retrait, copie, nouvelle tentative et navigation vers les pièces concernées. Prévois l’annulation et le streaming lorsque le connecteur les permet ; un flux interrompu ne doit pas être affiché comme une réponse complète. Préserve les brouillons et explique les limites de contexte.

Inventorie chaque contrôle visible : bouton, lien, onglet, filtre, sélection, action contextuelle, menu et réglage. Chacun doit produire une action réelle, afficher un état utile, ou expliquer une dépendance manquante. Aucun faux succès, faux indicateur de connexion ou réglage sans effet.

Traite systématiquement les états chargement, vide, succès, erreur, hors connexion, session expirée, droits insuffisants, traitement partiel et confirmation. Empêche les doubles soumissions et les écrasements silencieux lors d’éditions concurrentes. Conserve la saisie après une erreur récupérable. Harmonise les messages en français, les formats de dates, les montants et les séparateurs.

Vérifie les parcours complets : inscription initiale → configuration → import → classement/extraction → correction → revue humaine → rapprochement → export → journal → sauvegarde/restauration. Les modifications doivent se refléter dans tous les écrans concernés et persister après rechargement et redémarrage.

## 4. Compatibilité avec les appareils et accessibilité

Vérifie les formats 320, 375, 390, 768, 1024, 1440 et 1920 pixels, portrait/paysage, tactile, souris et clavier. Traite téléphone, tablette et ordinateur, zoom 200 %, clavier virtuel, menus repliés, modales, tableaux larges, graphiques et pièces jointes. Les tableaux peuvent défiler dans leur conteneur, sans faire déborder toute la page.

Teste Chromium, Firefox et WebKit lorsque disponibles. Distingue émulation et essai sur appareil réel ; n’affirme pas avoir validé iOS, Android, Windows ou macOS sans preuve. Vérifie les lanceurs sur les environnements accessibles et documente le reste.

Assure labels, navigation clavier, focus visible, fermeture des dialogues, contrastes, erreurs associées aux champs et cibles tactiles utilisables. Prévois des solutions de repli pour la caméra, le presse-papiers, les téléchargements et les permissions refusées. Optimise pagination, recherche et rendu des grands volumes. N’ajoute pas un mode hors connexion qui prétend enregistrer des écritures non synchronisées.

## 5. Logique métier explicite, robuste et traçable

Waraqa dépasse le seul relevé TVA : documents, achats, ventes si prévues par les sources, frais, douane, avoirs, paiements, banque, classement, contrôle et préparation comptable. Couvre les six sous-types existants sans perdre leurs particularités. N’invente pas des règles fiscales pour combler un manque.

Formalise les invariants et les transitions d’état. Distingue original, extraction, données corrigées, complétude, contrôle arithmétique, revue humaine, rapprochement et admissibilité à l’export. Une extraction IA n’est jamais une validation comptable ou fiscale.

Implémente ou complète les besoins suivants avec leur interface :

- Plusieurs lignes et plusieurs taux de TVA par document, remises et frais, avoirs reliés à la facture source, annulations et corrections traçables. Calculs décimaux/centimes explicites, politique d’arrondi documentée et équilibre HT + TVA = TTC.
- Paiements partiels, fractionnés, groupés, trop-perçus et reliquats ; relations entre plusieurs paiements et plusieurs pièces. Aucune création artificielle de charge ou double comptabilisation d’une banque et de sa facture.
- Dates de facture, paiement, période comptable et période fiscale séparées. Préserve la règle historique de période tant qu’une migration métier justifiée ne la remplace pas. Documente les cas de paiement incomplet et d’avoir.
- Doublons binaires et doublons métier avec raisons compréhensibles, revue manuelle et traitement idempotent des reprises d’import.
- Identifiants ICE/IF conservés comme chaînes, zéros initiaux préservés ; champs inconnus laissés inconnus. Fournisseurs, désignations, catégories et comptes cohérents, avec contrôle des fusions et références.
- Import CSV/Excel/JSON avec aperçu, mapping de colonnes mémorisable, validation par ligne, rapport de rejets et reprise sans duplication. PDF/images multipages reliés aux résultats et à leur provenance.
- Archivage/restauration contrôlés ; séparation explicite des exemples fictifs et données réelles, notamment dans les exports.
- Exports reproductibles et filtrés, sélection des lignes effectivement revues, brouillons identifiés, mapping Sage versionné et vérification de l’équilibre. Une modification d’une pièce revue impose une nouvelle revue.

Vérifie les règles marocaines applicables auprès de sources officielles avant d’introduire des décisions fiscales ; conserve référence, date et hypothèses. Les cas non résolus doivent apparaître « à vérifier » et bloquer l’export concerné si nécessaire. Ne transforme pas cette mission en offre fiscale multi-pays ni en SaaS multi-entreprises sans besoin établi.

## 6. Backend : terminer les services manquants et les raccorder

Inspecte d’abord l’implémentation réelle. Pour chaque manque, livre schéma, service, contrat typé, validation serveur, autorisations, journalisation, interface, configuration et test de parcours. Ne considère pas un endpoint isolé ou un écran décoratif comme un service terminé.

Complète notamment : traitement durable des lots et reprises après incident ; progression et annulation ; sauvegarde/restauration cohérentes ; migrations ; planificateur persistant avec fuseau horaire explicite, rattrapage maîtrisé et prévention des doublons ; recherche et pagination serveur ; gestion des rôles et sessions ; contrôle d’accès aux originaux ; diagnostics et journaux sans données sensibles.

Les limites connues incluent OAuth Google Drive, email, notifications push externes, 2FA, connexion directe Sage et dépôt DGI. Pour chacune, évalue le besoin hérité et implémente ce qui est concrètement documenté et réalisable :

- Drive : OAuth côté serveur, droits minimaux, destination, état, déconnexion, gestion des erreurs et déduplication. Prépare les écrans et essais de contrat sans prétendre à une connexion réelle sans compte autorisé.
- Email : adaptateur configuré côté serveur et boîte de test locale ; pas d’envoi réel à des tiers sans autorisation. Push : capacités du navigateur, abonnement/désabonnement et dépendances clairement exposés si ce service appartient au périmètre.
- 2FA : TOTP, enrôlement vérifié, codes de secours protégés et récupération maîtrisée ; aucun secret dans les logs.
- Sage : termine d’abord l’export compatible avec le format réellement connu. Une synchronisation directe exige une interface documentée et un environnement accessible ; ne l’invente pas.
- DGI : implémente un format officiel uniquement avec sa spécification vérifiée et ses validations. Aucun dépôt réel ni affirmation de certification sans autorisation et preuve.

Quand un identifiant externe manque, termine le code testable, la configuration et les tests avec doublures explicites ; indique précisément ce qui reste à activer et à vérifier. Poursuis les autres modules. Conserve l’exploitation locale simple ; justifie toute nouvelle infrastructure indispensable.

## 7. IA : préparer maintenant, tester avec la clé ensuite

Maintiens deux modes explicites : analyses locales sans LLM et IA connectée. Sans clé, aucun appel externe, extraction inventée ni réponse fictive présentée comme réelle.

Centralise le fournisseur IA côté backend : secrets, modèle configurable, délais, limites de fichiers/contexte, validation des réponses structurées, gestion des erreurs 401/403/429/5xx, reprises bornées, annulation, comptage des tokens et coûts estimés. Vérifie la documentation officielle actuelle pour les choix de SDK et modèles. N’insère jamais de clé dans le frontend, un ZIP, Git, un screenshot ou un rapport.

Traite factures, pièces jointes et texte OCR comme données non fiables : leurs instructions ne doivent pas piloter l’application. Limite les données transmises à celles nécessaires et autorisées. Le chat ne doit accéder ni aux discussions d’un autre utilisateur ni aux documents hors droits. Les mutations proposées doivent passer par une action utilisateur contrôlée et les règles serveur.

Résous les limites actuelles de contexte, notamment l’analyse silencieuse des seules premières lignes d’un mois volumineux : requêtes ciblées, agrégations déterministes, sélection explicite des pièces et indication du périmètre effectivement analysé. Rends les conclusions traçables vers leurs documents. Toute troncature doit être visible.

Avant la clé : tests de contrat simulant réponses valides, malformées, incomplètes, délais, déconnexion, limites et pannes. La simulation reste confinée aux tests et identifiée.

Après réception de la clé : vérifie sa configuration sans l’afficher, teste un appel minimal, puis lance progressivement la campagne réelle préparée. Utilise des documents fictifs. Exige un plafond de dépense et de concurrence configurable ; si aucun budget n’est défini, demande uniquement ce plafond avant la campagne payante lourde. Ne fais pas de stress test massif du fournisseur : exerce la charge principalement sur nos services avec un fournisseur simulé, et réserve les appels réels à la validation de qualité et de robustesse.

## 8. Campagne de tests approfondie et mesurable

Prépare des jeux reproductibles : multi-taux, avoirs, paiements partiels, doublons, ICE avec zéros, manuscrit, cachet, photo inclinée, faible lisibilité, PDF multipage, montants contradictoires et fichier invalide. Si les 40 factures historiques et `verite_terrain.json` sont disponibles, vérifie leur correspondance avant utilisation ; sinon crée un jeu synthétique clairement distinct.

Mesure l’extraction par champ et par document : exactitude des références, dates, identifiants, lignes, taux et montants ; montants comparés avec tolérance d’arrondi explicitée. Rapporte erreurs critiques, omissions et cas nécessitant revue. Ne change pas la vérité terrain pour améliorer le score et ne revendique pas de précision non mesurée.

Teste installation propre, mise à niveau d’une copie existante, persistance, restauration, accès non autorisé, sessions révoquées, fichiers privés, requêtes concurrentes, double clic, redémarrage pendant un import, erreurs partielles et export de grands volumes. Teste la chaîne UI → API → base → fichier exporté, y compris les situations dégradées.

Pour la charge locale, monte progressivement sur 100, 1 000 puis 10 000 écritures fictives et plusieurs sessions dans les limites de la machine. Mesure latence médiane/p95, mémoire, durée d’import/export, erreurs et verrous SQLite. Fixe des seuils adaptés à l’environnement avant de conclure. Aucune charge sur les données réelles.

Classe les défauts : P0 perte de données ou accès indu ; P1 résultat comptable faux ou parcours bloqué ; P2 défaut fonctionnel ou accessibilité significatif ; P3 finition. Corrige tous les P0/P1 connus et reproduis le scénario après correction. Documente les autres écarts et leur impact. Aucun test ignoré ou non exécuté ne doit être compté comme réussi.

## 9. Livrables et réception

Livre une nouvelle version identifiée dans un ZIP unique : sources, builds cohérents avec les sources, dépendances verrouillées, lanceurs, exemples, migrations, configuration sans secrets, guide français, procédures de sauvegarde/restauration et commandes de tests.

Ajoute la matrice des services, les règles métier et hypothèses, les résultats de validation datés, la matrice appareils/navigateurs réellement vérifiée, les limites externes, le journal des modifications et `docs/ETAT-REPRISE.md`. Vérifie l’intégrité du ZIP et son démarrage depuis une extraction propre. Aucun `node_modules`, secret ou dossier comptable personnel dans l’archive.

La réception avant clé exige : build réussi, tests critiques réussis, parcours sans clé opérationnels, données préservées, styles harmonisés, contrôles réellement raccordés et services externes prêts à configurer avec leur état exact.

La réception après clé exige en plus : essais réels OCR/chat, mesures de qualité et consommation, gestion des erreurs vérifiée, corrections puis non-régression. Ne qualifie pas de « validé » ce qui attend encore une clé, un compte tiers, un appareil ou une spécification.

**Commence maintenant par examiner la version disponible et établir l’état de référence, puis développe et termine les lots autorisés. N’attends pas la clé pour finaliser tout le reste.**
