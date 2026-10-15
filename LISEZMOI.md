# Page de validation des contrats — version indépendante (Render)

Cette page n'est plus hébergée sur claude.ai : c'est une petite application
qui tourne sur **Render** (hébergeur web gratuit), sous un compte qui
t'appartient entièrement. Une fois en ligne, elle continue de fonctionner
même si tu arrêtes de discuter avec Claude — seule la mise à jour des
données (toutes les heures) dépend de Claude pour l'instant.

Deux pages :
- **Page publique** (lien principal) : les conducteurs, sans montants pour
  la vue d'ensemble.
- **`/dashboard`** : ton tableau de bord RH complet (montants, salaires),
  protégé par un mot de passe que tu choisis toi-même à l'étape 4.

## Étape 1 — Créer un compte GitHub (si tu n'en as pas déjà un)

GitHub est l'endroit où le code de la page sera rangé — gratuit, et c'est
TOI qui en restes propriétaire.

1. Va sur https://github.com/signup
2. Donne une adresse e-mail, un mot de passe, un nom d'utilisateur.
3. Valide l'e-mail de confirmation.

*(Si tu as déjà un compte GitHub, passe directement à l'étape 2.)*

## Étape 2 — Créer le dépôt avec les fichiers de la page

1. Une fois connectée, clique sur le **+** en haut à droite → **New repository**.
2. Nom du dépôt : `contrats` (ou ce que tu veux).
3. Laisse-le en **Public** (c'est juste le code de la page, pas de données
   sensibles dedans — les vrais contrats restent sur ton Excel et ne transitent
   que par la connexion sécurisée Render).
4. Clique **Create repository**.
5. Sur la page qui s'affiche, clique **uploading an existing file**.
6. Fais glisser **tous les fichiers de ce dossier** (`server.js`,
   `package.json`, `render.yaml`, `dashboard.html`, le dossier `public/`,
   le dossier `data/`, `.gitignore`) dans la zone.
7. Clique **Commit changes**.

## Étape 3 — Créer un compte Render et connecter ce dépôt

1. Va sur https://dashboard.render.com/register
2. Choisis **Sign up with GitHub** (le plus simple : ça relie direct ton
   compte GitHub, pas de mot de passe supplémentaire à retenir).
3. Autorise Render à accéder à ton dépôt `contrats`.
4. Une fois dans le tableau de bord Render, clique **New +** → **Blueprint**.
5. Choisis le dépôt `contrats` : Render détecte automatiquement
   le fichier `render.yaml` et propose de créer le service `contrats`.
6. Clique **Apply** / **Create**.

## Étape 4 — Renseigner les 3 réglages secrets

Avant ou juste après la création, Render te demande 3 valeurs
(`DASHBOARD_USER`, `DASHBOARD_PASS`, `REFRESH_SECRET`) — si ce n'est pas
demandé automatiquement, va dans le service créé → **Environment** → **Add
Environment Variable** :

| Nom              | À quoi ça sert                                             | Exemple               |
|------------------|-------------------------------------------------------------|------------------------|
| `DASHBOARD_USER`  | identifiant pour ouvrir `/dashboard` (ton espace RH)        | `rh`                   |
| `DASHBOARD_PASS`  | mot de passe pour `/dashboard`                               | choisis un mot de passe solide |
| `REFRESH_SECRET`  | jeton technique que Claude utilise pour pousser les données fraîches toutes les heures — à choisir toi-même, une suite de caractères aléatoires | ex. `a8f3k2m9x7q1` |

**Donne-moi (à moi, Claude) la valeur que tu choisis pour `REFRESH_SECRET`**
une fois le service créé : j'en ai besoin pour configurer la mise à jour
automatique des données. Les deux autres (`DASHBOARD_USER` / `DASHBOARD_PASS`)
restent seulement entre toi et Render — je n'ai pas besoin de les connaître.

## Étape 5 — Récupérer les deux liens

Render affiche un lien du type `https://contrats.onrender.com`.
- La page conducteurs est à cette adresse directement.
- Ton tableau de bord RH est à `https://contrats.onrender.com/dashboard`
  (il te demandera `DASHBOARD_USER` / `DASHBOARD_PASS`).

Donne-moi ces deux liens (ou juste le premier, je devine le `/dashboard`) et
le `REFRESH_SECRET` choisi : je branche la mise à jour automatique et je
pousse les données actuelles dessus.

**Petit détail du forfait gratuit Render :** si personne ne visite la page
pendant 15 minutes, le service "s'endort" ; la première visite suivante met
20 à 50 secondes à répondre, puis tout redevient instantané. C'est normal,
pas une panne.
