# Relevé de déduction TVA — du dossier du mois au dépôt SIMPL

Waraqa produit le **relevé de déduction** (DGI, modèle ADC082F-15I, article 112 du CGI) à partir de toutes les pièces du mois, avec les deux fichiers attendus :

- **XML EDI** `DeclarationReleveDeduction` : le fichier à déposer sur SIMPL-TVA ;
- **Excel au modèle DGI** : même mise en page que votre modèle, avec la zone d'identification, le tableau `Tableau5`, la ligne Total et le mappage XML (Excel peut toujours faire *Développeur → Exporter* comme avant).

## 1. Déposer les pièces du mois

**Importer des pièces**, au choix :

| Source | Comment |
|---|---|
| Dossier compressé | Glisser le `.zip` (sous-dossiers compris, ZIP inclus dépliés). |
| Dossier Google Drive | Coller le lien `https://drive.google.com/drive/folders/…` puis **Importer le dossier**. Sous-dossiers parcourus ; Google Sheets convertis en Excel, Google Docs en PDF. |
| Fichiers isolés | PDF, photos, Excel, CSV, JSON (y compris depuis la discussion). |

Chaque fichier suit le même circuit :

- **Excel, CSV, JSON** : lus directement. Les en-têtes sont cherchés dans les 30 premières lignes, donc un relevé DGI existant (en-têtes en ligne 8) est relu tel quel. La ligne Total est ignorée, et les dates Excel, taux (20 %, 0,2 ou 20) et ICE (zéros de tête) sont normalisés.
- **PDF et photos** : lus par Claude. Une facture à plusieurs taux donne une ligne par taux, et HT et TVA sont toujours recalculés par le serveur.
- **Suivi du lot** : l'avancement, le nombre de lignes et les erreurs de chaque fichier s'affichent dans **Imports de dossiers**. L'assistant les connaît aussi (« où en est l'import ? »).
- **Doublons** : un fichier identique (empreinte SHA-256) n'est jamais importé deux fois.

### Lecture des dossiers Drive (une seule fois)

Par défaut, Waraqa n'accède qu'aux fichiers qu'il crée (`drive.file`). Au premier import par lien, il demande une autorisation de **lecture seule** (`drive.readonly`) : cliquez sur **Autoriser la lecture Drive**, choisissez `saberrochdi509@gmail.com`, cochez l'accès, puis **Continuer**. Google affiche l'avertissement « application non validée » : cliquez sur **Paramètres avancés → Accéder à Waraqa**, c'est votre propre application. Le dossier doit appartenir à ce compte ou être partagé avec lui.

## 2. Contrôler et revoir

La page **Relevé de déduction** ne retient que les lignes **revues** et **conformes**. Les autres sont listées avec leur motif et un bouton **Ouvrir** pour les corriger.

| Contrôle | Règle |
|---|---|
| Identification | N° de facture, désignation, fournisseur ; IF numérique ; ICE à 15 chiffres (convention douane IF = ICE = 1111 acceptée) |
| Taux | 7, 10, 14 ou 20 % (0 % : rien à déduire) |
| Paiement | ID_PAIE 1 à 7 ; date de paiement obligatoire au régime de l'encaissement, non postérieure à la période |
| Délai | Paiement de plus de 12 mois : déduction prescrite (art. 101-3° CGI) |
| Doublons | Même n°, même fournisseur, même TTC et même date de facture. Les commissions bancaires récurrentes (« AVUE ») ne sont pas des doublons. |
| Alertes | Espèces au-delà de 5 000 DH par jour ou de 50 000 DH par mois et par fournisseur (art. 106-II CGI) ; facture postérieure au paiement (acompte) |

**Valider N ligne(s) conforme(s)** marque d'un coup les lignes dont le seul motif d'exclusion est l'absence de revue, après votre contrôle des pièces.

**Déductions tardives** : les paiements des 12 derniers mois non encore déclarés sont proposés. Cochez-les, puis cliquez sur **Rattacher** pour les porter sur la période. Le rattachement est enregistré dans la ligne (« Période fiscale ») et tracé dans le journal.

## 3. Produire les fichiers

Avant tout, renseignez **Réglages → Entreprise** : raison sociale, **identifiant fiscal (IF)** et **régime** (1 encaissement / 2 débits).

- **XML EDI (SIMPL)** : identique à l'export XML de votre modèle Excel (`identifiantFiscal`, `annee`, `periode`, `regime`, puis une balise `<rd>` par ligne, montants au centime, taux au format du modèle, par exemple 0.2 pour 20 %). Vérifiez-le lors de votre premier dépôt SIMPL.
- **Excel modèle DGI** : formules HT/TVA, totaux et mappage XML conservés, sans macros.
- **PDF** : version lisible pour archive ou validation.
- **Brouillon** : case à cocher. Elle inclut les lignes non revues et marque les fichiers « BROUILLON ».
- **Clôturer la période** : fige le rattachement des lignes déclarées, qui ne sont plus proposées en déduction tardive. La période peut être rouverte.

Chaque fichier généré est tracé (empreinte SHA-256) et copié dans `Mon Drive/Waraqa/Exports/AAAA-MM/`.

## 4. Avec l'assistant

Exemples de demandes :

- « Prépare le relevé de déduction de juillet »
- « Pourquoi la ligne #34 est écartée ? »
- « Où en est l'import du dossier ? »

L'assistant consulte les contrôles du serveur et propose les boutons : ouvrir une ligne, ou télécharger le XML SIMPL ou l'Excel DGI. Il ne valide ni ne dépose rien lui-même.

## Validation réelle

`npm run test:releve` vérifie de bout en bout, avec votre clé et sur une base temporaire :

- un dossier ZIP (factures fictives, dont une à deux taux, et une photo) lu par Claude ;
- le relevé et le XML, validé contre le schéma embarqué dans le modèle DGI ;
- l'Excel, ouvert et recalculé par LibreOffice ;
- deux questions à l'assistant.

Le budget est plafonné à 0,80 $ ; le coût constaté est d'environ 0,10 $. Pour comparer à un relevé existant, ajoutez `WARAQA_RELEVE_REFERENCE="TVA 07 2026.xlsx"` et, pour garder le rapport hors du projet, `WARAQA_RELEVE_OUT=<dossier>`.
