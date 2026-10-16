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
6. Fais glisser **tous les fichiers de ce dossier, un par un ou tous ensemble**
   (`server.js`, `package.json`, `package-lock.json`, `render.yaml`,
   `index.html`, `dashboard.html`, `data.json`, `dashboard.json`,
   `.gitignore`) dans la zone. Tous les fichiers sont à plat, il n'y a pas
   de sous-dossier à gérer — glisse-les tels quels.
7. Vérifie que la liste affichée contient bien ces fichiers (pas de fichier
   `.zip`).
8. Clique **Commit changes**.

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

## Étape 6 — IMPORTANT : empêcher la perte des données

Sur le plan gratuit de Render, le service « s'endort » après 15 minutes
sans visite (voir le petit détail à l'étape 5) — et à chaque réveil, **tout
ce qui avait été poussé depuis `pousser_donnees.html` est effacé** (le
disque du service repart à zéro). Sans cette étape, tu dois repousser les
données après chaque période de calme, et les validations des conducteurs
peuvent disparaître entre-temps.

Pour que les contrats et les décisions survivent à ces réveils, il faut un
petit espace de stockage gratuit à part, chez **Upstash** :

1. Va sur https://console.upstash.com/login et crée un compte gratuit
   (avec Google, GitHub, ou une adresse mail).
2. Clique **Create Database**. Nom libre (ex. `stam-contrats`), type
   **Regional**, région au choix (la plus proche, ex. Europe).
3. Une fois la base créée, reste sur sa page — en bas, section
   **REST API**, tu vois deux valeurs : `UPSTASH_REDIS_REST_URL` et
   `UPSTASH_REDIS_REST_TOKEN`.
4. Dans Render, va dans ton service `contrats` → **Environment** → **Add
   Environment Variable**, et ajoute ces deux-là avec les valeurs copiées
   depuis Upstash :

| Nom              | Valeur                                      |
|------------------|-----------------------------------------------|
| `UPSTASH_REDIS_REST_URL`   | copiée depuis la page Upstash         |
| `UPSTASH_REDIS_REST_TOKEN` | copiée depuis la page Upstash (token) |

5. Clique **Save Changes** — Render redémarre le service automatiquement.
6. Repousse une fois les données avec `pousser_donnees.html` pour les
   mettre dans ce nouvel espace.

Le plan gratuit Upstash (10 000 commandes/jour, largement suffisant ici)
n'a pas de limite de temps ni de carte bancaire à fournir. Sans ces deux
variables, le site continue de fonctionner, mais redevient vide à chaque
réveil — comme avant cette étape.

## Étape 7 — Lien personnel de chaque conducteur

Chaque conducteur a maintenant son propre lien, du type
`https://contrats.onrender.com/c/jean-dupont` : il atterrit directement sur
SES contrats (à valider, échéances, historique), sans jamais voir ceux des
autres. Pour récupérer ces liens : ouvre `/dashboard` → onglet
**"Liens conducteurs"** → bouton **Copier** sur chaque ligne. À toi de les
transmettre (SMS, en main propre, etc. — comme tu préfères).

## Étape 8 — Mail à chaque décision (optionnel)

Pour recevoir un mail dès qu'un conducteur valide/refuse/prolonge/arrête un
contrat, il faut un compte **Resend** (gratuit, pour l'envoi de mails) :

1. Va sur https://resend.com/signup et crée un compte avec **ton adresse
   mail STAM**.
2. Une fois connectée, va dans **API Keys** → **Create API Key** → donne-lui
   un nom (ex. `contrats-stam`) → copie la clé générée (elle commence par
   `re_`).
3. Dans Render, va dans ton service `contrats` → **Environment** → **Add
   Environment Variable**, et ajoute :

| Nom              | Valeur                                                   |
|------------------|------------------------------------------------------------|
| `RESEND_API_KEY` | la clé copiée à l'étape 2 (commence par `re_`)              |
| `NOTIFY_EMAIL`   | ton adresse mail STAM (la même qu'à l'étape 1 — sans compte Resend verifié sur un nom de domaine, Resend n'autorise l'envoi gratuit qu'à l'adresse du compte lui-même) |

4. Clique **Save Changes** — Render redémarre le service automatiquement.

Sans ces deux variables, tout continue de fonctionner normalement : les
décisions sont toujours enregistrées, simplement aucun mail n'est envoyé.
