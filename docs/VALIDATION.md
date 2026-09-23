# Validation du livrable

## Résultats observés

- Compilation NestJS : réussie.
- Contrôle TypeScript strict du frontend : réussi.
- Build Vite : réussi ; assets compilés inclus dans `backend/public/`.
- **50 tests unitaires** hérités : réussis.
- **53 tests API/e2e** : réussis, dont 3 tests du planificateur de snapshots ajouté.
- **17 parcours d’intégration** sur base temporaire et serveur de production : réussis.
- Lanceur livré : démarrage réussi sur une base neuve, création du secret de session et écran de première configuration vérifiés.
- **8 groupes de contrôles navigateur** : réussis, bureau 1440 × 1000 et mobile 390 × 844, sans erreur JavaScript.

Les tests ont été effectués sous Linux avec Node.js 24.19.0 et Chromium headless. Le lancement Windows est fourni, mais n’a pas été exécuté sur une machine Windows.

## Points contrôlés

Authentification et fermeture des inscriptions après le premier compte ; clé jamais exposée et activation live refusée sans clé ; données d’exemple marquées et chargement idempotent ; revue des lignes incomplètes refusée ; revue annulée à modification ; équilibre des centimes ; rattachement par mois de paiement ; champs calculés non acceptés en entrée ; doublons ; import CSV réel et conservation des zéros de l’ICE ; erreurs partielles de lot ; déduplication des documents ; scan sans fausse extraction ; pièce liée à saisie manuelle ; rapprochement ; exclusion bancaire des totaux d’achats ; exports Excel et Sage ; immutabilité des snapshots ; modèles de prompts ; conversations et pièces jointes ; autorisations et confidentialité des conversations ; suppression de compte ; persistance après redémarrage ; changement de mot de passe révoquant les sessions.

Le planificateur est testé avec des dates contrôlées : aucune exécution quand il est désactivé, respect de l’échéance, absence de répétition à échéance identique, totaux hors double comptage bancaire.

Le navigateur vérifie la création du compte, les exemples, le dashboard, l’insertion de modèle, l’envoi et le rechargement du chat, une saisie manuelle, une validation humaine, le téléchargement Excel, un upload CSV, les dix pages, les onglets de réglages, leur persistance et la navigation mobile sans débordement horizontal de la page.

## Reproduction

Après `npm run setup` :

```sh
npm test
```

Les tests utilisent des bases temporaires et ne modifient pas votre dossier comptable. Les résultats détaillés sont dans `tests-integration.json` et `tests-interface.json`.

Pour rejouer les tests navigateur, installer Playwright dans le dossier racine, installer son Chromium, puis exécuter `npm run test:ui`. Ce test produit les captures `docs/apercu-*.png` et utilise une base temporaire. Le test UI est optionnel et n’est pas nécessaire au lancement de la démo.

## Non validé avec des services réels

Aucun appel Anthropic payant : pas de clé fournie, conformément à la demande. La qualité OCR, les droits du modèle, les quotas et la latence devront être vérifiés lors de l’activation. Aucune certification DGI et aucun import dans un vrai dossier Sage 100. Aucun Google Drive, SMTP, push ou 2FA connecté.

Les captures du dossier `docs/` montrent uniquement des utilisateurs et pièces fictifs créés pour les tests. Elles ne constituent pas des données comptables réelles.
