# Reprise du développement Waraqa

Demande du 24/09/2026 : appliquer le plan directeur, travailler avec des checkpoints et conserver chaque avancement. Le plan reste `00_PLAN_DIRECTEUR_WARAQA_INTELLIGENCE_COMPTABLE.md`.

## État durable

- Base initiale : `b74d060`, version 4.5.0.
- Application active : dossier principal, port 3000. Ne pas utiliser sa base pour les tests.
- Développement isolé prévu : `../Waraqa-Intelligence-Developpement`, branche `intelligence-checkpoints`.
- Sauvegarde complète locale : `../sauvegarde-avant-intelligence-20260924T113137Z` (répertoire privé, non versionné).
- Sauvegarde vérifiée : SQLite `integrity_check=ok`, 2 341 lignes, 782 enregistrements de travail, 3 223 événements ; 257 fichiers contrôlés, originaux et livrables présents.
- Aucun secret copié dans les checkpoints Git. Ne pas copier `.env` dans la copie de développement.
- Node à utiliser : `/home/izo/.nvm/versions/node/v22.23.1/bin` en tête de PATH.

## Prochaine action exacte

Créer la copie Git isolée, lancer la baseline sans services externes, puis L1 : verrou de clôture commun, sauvegardes des livrables, contrat Drive, documents de référence, précontrôle métier. Continuer ensuite L2/L3 et les lots suivants selon dépendances. Cocher uniquement les critères démontrés.

## Journal des checkpoints

| Checkpoint | État | Preuve / prochaine étape |
|---|---|---|
| CP00 — Préservation | Réalisé | Sauvegarde SQLite cohérente + fichiers et manifeste SHA-256 ; source initiale préservée |
| CP01 — Baseline isolée | À faire | Compiler et exécuter les tests sur la copie isolée |
| CP02 — Invariants de clôture | À faire | Reproduire puis fermer tous les chemins de mutation |
| CP03 — Sauvegarde complète | À faire | Vérifier originaux, livrables et boîte d’envoi après restauration |
| CP04 — Contrats et références | À faire | Drive fichier, catalogue, rôles et précontrôle |

## Règles de reprise

1. Lire ce fichier avant de relancer quoi que ce soit ; vérifier `git status` dans les deux dossiers.
2. Lire les derniers commits de `intelligence-checkpoints` et les preuves dans `docs/checkpoints/`.
3. Ne jamais réinitialiser `backend/data/`, réimporter le lot actif ni écraser `.env`.
4. Tests avec base et stockage temporaires, profil local et fournisseurs simulés ; pas d’appel payant réel.
5. Après chaque lot cohérent : tests ciblés, mise à jour de ce fichier, commit de checkpoint.
6. En cas d’interruption : les fichiers du worktree sont persistants même avant commit. Reprendre la tâche notée, sans refaire les migrations ou les imports déjà terminés.
7. Une limite de contexte n’est pas une validation : ne jamais déclarer un lot terminé sans preuves.
