# Validation locale — 23 septembre 2026

Cette validation remplace les résultats antérieurs. Environnement : Linux, Node.js 22.23.1. Les données de test et les documents d’exemple sont fictifs ; les tests utilisent des bases temporaires.

## Résultats

- Compilation NestJS, contrôle TypeScript frontend et build Vite : réussis.
- 78 tests unitaires : réussis.
- 70 tests API/e2e : réussis.
- 17 parcours intégrés sur serveur de production : réussis (`docs/tests-integration.json`).
- Firefox : 11 groupes de contrôles réussis, incluant Excel, relevé PDF, PDF de snapshot et PDF d’archive. La matrice couvre 14 combinaisons taille/orientation × 10 pages et le zoom CSS 200 %. Voir `tests-interface-firefox.json` et `appareils-firefox.json`.
- Volume : import par lots de 100, 1 000 et 10 000 lignes, soit 11 100 lignes cumulées. Au dernier palier : import 156,354 s, lectures p95 274 ms, export Excel 1,559 s, mémoire serveur 298 Mo. Seuils du test respectés (`tests-charge.json`).
- Volume PDF : 1 000 lignes, 278 pages, génération 1,956 s, 596 670 octets ; les 1 000 références ont été retrouvées à la lecture (`tests-volume-pdf.json`). Ce contrôle est distinct du test de volume Excel.

## PDF et cohérence des données

Les PDF d’archive, de snapshot et de relevé partagent une présentation A4 paysage vert/or : synthèse, graphiques vectoriels, tableaux avec en-têtes répétés, numéros de page et polices embarquées. Le relevé financier et le tableau de contrôle conservent les 13 champs Tableau5 ainsi que les identifiants, statuts et liens documentaires. Les textes longs peuvent se poursuivre sur plusieurs pages sans troncature.

La génération utilise les montants enregistrés par le serveur. Les totaux et graphiques n’additionnent pas les paiements bancaires aux achats ; les commissions restent incluses et les avoirs gardent leur signe. Les quatre fournisseurs principaux sont affichés par montant net absolu ; les autres sont regroupés, sans perte de montant. Le graphique de revue décrit l’ensemble des lignes du document, mouvements bancaires compris.

Les tests vérifient l’égalité des sélections PDF/Excel pour les options revue/brouillon et avec/sans exemples, l’accès authentifié, les archives vides, les accents, les zéros initiaux, les montants négatifs, les textes longs, les références de toutes les lignes, et l’immuabilité des snapshots après modification des factures. Les nouveaux snapshots figent aussi l’identité de l’entreprise. Les anciens restent lisibles sans inventer leur ancienne identité.

Les exemples visuellement inspectés sont dans `exemples-exports/` : relevé, archive, snapshot et aperçu PNG. Régénération : `node scripts/pdf-preview.cjs` après compilation. Les originaux importés ne sont pas restylés ni convertis.

## Parcours applicatifs

Authentification et fermeture des inscriptions ; revue humaine et calculs serveur ; doublons ; dates et périodes ; import réel CSV/Excel, aperçu et reprise ; avoirs ; paiements partiels ; rapprochement ; exports Excel/Sage ; snapshots ; conversations ; droits administrateur ; TOTP et codes de secours ; sauvegarde/restauration sur copie ; persistance après redémarrage et révocation des sessions.

Le contrôle navigateur couvre les dix pages, les réglages, la discussion locale, les fichiers, la saisie et revue, les téléchargements et les petits écrans. Deux débordements Firefox à 320 px ont été corrigés : sélecteur de période et actions du snapshot.

## Reproduction

```sh
npm run build
npm test
npm run test:ui
WARAQA_BROWSER=firefox npm run test:ui
WARAQA_BROWSER=webkit npm run test:ui
node scripts/load-test.cjs
node scripts/pdf-preview.cjs
```

Les navigateurs Playwright doivent être installés. `WARAQA_BROWSER_PATH` permet de préciser leur exécutable local.

## Limites de cette validation

Les essais navigateur sont automatisés sur Linux et les petits écrans sont émulés. Ils ne remplacent pas un essai sur téléphone réel, Windows ou macOS. Aucun appel réel Anthropic/OCR, aucune connexion réelle Google Drive, aucun envoi externe et aucun import Sage ou dépôt DGI n’ont été effectués. Les contrats d’intégration sont testés localement ; leurs identifiants et services réels restent à configurer et à valider séparément. Le PDF est un document de consultation ; la restauration intégrale utilise la sauvegarde technique avec SQLite et les pièces originales.
