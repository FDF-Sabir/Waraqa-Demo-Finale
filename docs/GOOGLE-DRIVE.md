# Google Drive — mise en service (≈ 5 minutes, une seule fois)

Waraqa tourne sur votre poste mais envoie automatiquement dans **votre** Google Drive
(`saberrochdi509@gmail.com`) :

```
Mon Drive/
└── Waraqa/
    ├── Pièces/AAAA-MM/        originaux importés (PDF, photos, Excel, CSV, JSON)
    ├── Exports/AAAA-MM/       chaque export téléchargé (Excel, CSV Tableau5, CSV Sage, PDF)
    ├── Snapshots/             PDF de chaque snapshot (figé à sa création)
    └── Sauvegardes/           sauvegarde complète quotidienne (base + pièces), 14 conservées
```

Google impose que chaque application déclare un **identifiant OAuth** créé avec votre compte.
C'est la seule étape manuelle ; ensuite tout est automatique.

## 1. Créer l'identifiant dans Google Cloud (avec saberrochdi509@gmail.com)

1. Ouvrir <https://console.cloud.google.com/> → sélecteur de projet → **Nouveau projet** → nom `Waraqa` → Créer.
2. **API et services → Bibliothèque** → rechercher **Google Drive API** → **Activer**.
3. **API et services → Écran de consentement OAuth** (ou « Google Auth Platform ») :
   - Type d'utilisateur : **Externe** → Créer.
   - Nom de l'application : `Waraqa` ; e-mail d'assistance et e-mail du développeur : `saberrochdi509@gmail.com`.
   - Accès aux données / Scopes : ajouter `.../auth/drive.file` (et `openid`, `email` s'ils sont proposés). **Ne pas** ajouter `drive` complet.
   - Audience → **Publier l'application** (« En production »). Important : en mode « Test », Google
     expire l'autorisation au bout de **7 jours**. La portée `drive.file` étant non sensible, la
     publication ne demande **aucune validation** Google.
4. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - Type : **Application Web** ; nom : `Waraqa local`.
   - **URI de redirection autorisés** → ajouter exactement :
     `http://localhost:3000/api/workspace/drive/callback`
     (si vous avez changé `WARAQA_PORT`, remplacez `3000` ; l'écran Intégrations affiche l'URI exacte à copier).
   - Créer → **Télécharger le JSON** (`client_secret_….json`).

## 2. Le déclarer dans Waraqa

1. Lancer Waraqa, se connecter en administrateur, ouvrir `http://localhost:3000` (pas `127.0.0.1`).
2. **Réglages → Intégrations → Étape 1** : choisir le fichier JSON téléchargé → **Enregistrer les identifiants**
   (ou coller Client ID et Client secret). Ils sont écrits dans `backend/.env`, jamais renvoyés au navigateur.
3. **Étape 2 → Connecter Google Drive** : Google s'ouvre, choisir `saberrochdi509@gmail.com`,
   cocher l'accès aux fichiers Drive créés par l'application → **Continuer**.
   Si Google affiche « application non validée », cliquer **Paramètres avancés → Accéder à Waraqa** : c'est votre propre application.
4. Retour automatique sur Réglages → « Google Drive connecté ». Toutes les pièces et snapshots déjà
   présents, plus une première sauvegarde, partent aussitôt ; le bouton **Ouvrir le dossier Waraqa dans Drive** apparaît.

## Sécurité et comportement

- **Compte verrouillé** : seul `GOOGLE_ALLOWED_EMAIL` (dans `backend/.env`, par défaut `saberrochdi509@gmail.com`)
  est accepté, d'après l'e-mail vérifié renvoyé par Google. Un autre compte est refusé et son accès révoqué immédiatement.
- **Droits minimaux** (`drive.file`) : Waraqa ne voit ni ne modifie **rien d'autre** dans votre Drive.
- Jetons Google chiffrés (AES-256-GCM) dans la base locale ; la clé Anthropic et `backend/.env` ne sont **jamais** envoyés dans Drive.
- **File durable** : sans Internet, tout reste en file et part au retour du réseau (nouvel essai 2, 4, 8… min, plafonné à 6 h ;
  « Synchroniser maintenant » force l'envoi). Aucun doublon : chaque fichier porte son empreinte SHA-256.
- Dossier `Waraqa` supprimé par erreur : il est recréé au cycle suivant pour les nouveaux envois.
- Accès révoqué ou expiré : l'écran affiche **Reconnecter Google Drive**, rien n'est perdu, la file reprend après reconnexion.
- **Déconnecter** révoque l'accès chez Google ; les fichiers déjà envoyés restent dans votre Drive.
- Réglages → Intégrations : couper la synchro automatique, la sauvegarde quotidienne, ou changer le nombre de sauvegardes conservées (1 à 90).

## Dépannage

| Message | Cause | Correction |
|---|---|---|
| `redirect_uri_mismatch` chez Google | URI absente ou différente | Ajouter exactement l'URI affichée dans Intégrations, attendre 1 min |
| « Compte Google refusé : seul … est autorisé » | Mauvais compte choisi | Recommencer avec `saberrochdi509@gmail.com` |
| « Accès Drive non accordé » | Case Drive décochée sur l'écran Google | Recommencer et cocher l'accès aux fichiers |
| Reconnexion demandée chaque semaine | Application restée en mode « Test » | Google Cloud → Audience → Publier l'application |
| « Autorisation Drive illisible » | `WARAQA_JWT_SECRET` modifié | Reconnecter Google Drive |
| Session perdue après le retour de Google | Waraqa ouvert via `127.0.0.1` | Toujours ouvrir `http://localhost:3000` |
