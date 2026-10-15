// STAM - serveur de la page de validation des contrats interim.
//
// Architecture volontairement simple, et volontairement a plat (tous les
// fichiers a la racine du depot, pas de sous-dossiers) pour que le depot
// GitHub reste facile a mettre a jour a la main depuis l'interface web :
//  - GET /            sert index.html : page PUBLIQUE, conducteurs, sans
//    montants pour la vue d'ensemble.
//  - GET /dashboard (+ /api/dashboard.json) : page PRIVEE RH, avec montants,
//    protegee par une authentification HTTP Basic (identifiant/mot de passe
//    definis uniquement via des variables d'environnement Render, jamais
//    dans ce code source).
//  - GET /api/data.json : donnees publiques (contrats a valider + echeances
//    + apercu sans montants), lues depuis data.json.
//  - POST /api/refresh : webhook protege par un jeton secret (en-tete
//    x-refresh-token), appele periodiquement pour pousser des donnees
//    fraiches sans avoir besoin de redeployer le site. Les donnees recues
//    sont ecrites sur disque (data.json / dashboard.json) pour survivre a
//    un redemarrage du service.
//
// Important : il n'y a volontairement AUCUN middleware express.static ici.
// Servir tout le dossier en statique exposerait data.json et dashboard.json
// (qui contiennent les salaires) sans authentification. Seules les routes
// explicites ci-dessous repondent, chacune avec son propre controle d'acces.
//
// Rien ici ne depend de Claude ou de claude.ai : une fois ce service
// deploye sur Render, il continue de fonctionner (avec les dernieres
// donnees recues) meme si la source qui appelle /api/refresh s'arrete.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const DASHBOARD_FILE = path.join(__dirname, 'dashboard.json');

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

function writeJsonSafe(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

const EMPTY_PUBLIC = { genereLe: '—', conducteurs: {}, echeances: {}, apercu: [], historique: [] };
const EMPTY_DASHBOARD = { genereLe: '—', items: [], echeances: [], apercu: [] };

let currentData = readJsonSafe(DATA_FILE, EMPTY_PUBLIC);
let currentDashboard = readJsonSafe(DASHBOARD_FILE, EMPTY_DASHBOARD);

app.use(express.json({ limit: '15mb' }));

// ---------------------------------------------------------------------
// Authentification HTTP Basic pour l'espace RH (montants, salaires).
// Si les identifiants ne sont pas configures sur Render, on bloque tout
// l'espace RH par defaut (fail-safe : jamais ouvert par erreur).
// ---------------------------------------------------------------------
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireRhAuth(req, res, next) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;
  if (!user || !pass) {
    return res.status(503).send(
      'Espace RH non configure : definissez DASHBOARD_USER et DASHBOARD_PASS ' +
      'dans les variables d\'environnement du service Render.'
    );
  }
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const sep = decoded.indexOf(':');
    const u = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const p = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (timingSafeEqual(u, user) && timingSafeEqual(p, pass)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="STAM RH"');
  return res.status(401).send('Authentification requise.');
}

// ---------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', requireRhAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ---------------------------------------------------------------------
// Donnees
// ---------------------------------------------------------------------
app.get('/api/data.json', (req, res) => res.json(currentData));
app.get('/api/dashboard.json', requireRhAuth, (req, res) => res.json(currentDashboard));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  dernierRafraichissement: currentData.genereLe,
}));

// ---------------------------------------------------------------------
// Webhook de rafraichissement : appele periodiquement avec les donnees
// fraiches (ne declenche jamais de redeploiement, juste une mise a jour
// en memoire + sur disque).
// ---------------------------------------------------------------------
app.post('/api/refresh', (req, res) => {
  const token = req.headers['x-refresh-token'];
  if (!process.env.REFRESH_SECRET) {
    return res.status(503).json({ error: 'REFRESH_SECRET non configure sur le service Render.' });
  }
  if (!token || !timingSafeEqual(token, process.env.REFRESH_SECRET)) {
    return res.status(401).json({ error: 'jeton invalide' });
  }
  const { data, dashboard } = req.body || {};
  if (!data || !dashboard) {
    return res.status(400).json({ error: 'corps attendu : { data, dashboard }' });
  }
  currentData = data;
  currentDashboard = dashboard;
  writeJsonSafe(DATA_FILE, currentData);
  writeJsonSafe(DASHBOARD_FILE, currentDashboard);
  res.json({ ok: true, genereLe: currentData.genereLe });
});

app.listen(PORT, () => {
  console.log('STAM contrats interim - serveur demarre sur le port ' + PORT);
});
