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
//  - POST /api/decision : un conducteur valide/refuse/prolonge/arrete un
//    contrat directement depuis la page publique. Enregistre sur disque
//    (decisions.json) et applique immediatement, sans e-mail ni copier-coller.
//  - GET /api/conducteurs (RH) + POST /api/reassign (RH) : attribuer ou
//    reattribuer le conducteur responsable d'un contrat.
//  - POST /api/refresh : webhook protege par un jeton secret (en-tete
//    x-refresh-token), appele periodiquement pour pousser des donnees
//    fraiches sans avoir besoin de redeployer le site. Les decisions et
//    attributions deja enregistrees sont reappliquees par-dessus a chaque
//    fois, pour ne jamais perdre une validation ou une reattribution au
//    rafraichissement suivant.
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
const DECISIONS_FILE = path.join(__dirname, 'decisions.json');
const ASSIGNMENTS_FILE = path.join(__dirname, 'assignments.json');

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

let rawData = readJsonSafe(DATA_FILE, EMPTY_PUBLIC);
let rawDashboard = readJsonSafe(DASHBOARD_FILE, EMPTY_DASHBOARD);

// decisions : { [contrat]: { statut, commentaire, valideLe, nouvelleDateFin } }
// assignments : { [contrat]: { conducteur, conducteurMail } }
let decisions = readJsonSafe(DECISIONS_FILE, {});
let assignments = readJsonSafe(ASSIGNMENTS_FILE, {});

const DECISION_LABELS = {
  ok: 'valide',
  no: 'refuse',
  prolonger: 'prolonge',
  arreter: 'arrete',
  attente: 'attente',
};

function todayFR() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

function slugify(nom) {
  const s = String(nom || 'rh')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'rh';
}

function forEachNestedItem(data, fn) {
  Object.keys(data.conducteurs || {}).forEach((slug) => {
    (data.conducteurs[slug].items || []).forEach(fn);
  });
  Object.keys(data.echeances || {}).forEach((slug) => {
    (data.echeances[slug].chantiers || []).forEach((g) => {
      (g.items || []).forEach(fn);
    });
  });
}

function forEachFlatItem(dashboard, fn) {
  (dashboard.items || []).forEach(fn);
  (dashboard.echeances || []).forEach(fn);
}

function applyDecisionsOverlay(data, dashboard) {
  function patch(item) {
    const d = decisions[item.contrat];
    if (!d) return;
    item.statut = d.statut;
    item.commentaire = d.commentaire || null;
    item.valideLe = d.valideLe || null;
    if (d.nouvelleDateFin) item.nouvelleDateFin = d.nouvelleDateFin;
    else delete item.nouvelleDateFin;
  }
  forEachNestedItem(data, patch);
  forEachFlatItem(dashboard, patch);
}

function moveItemToSlug(groupsBySlug, contrat, targetSlug, targetNom, isChantierGrouped, chantierOf) {
  Object.keys(groupsBySlug).forEach((slug) => {
    if (isChantierGrouped) {
      const chantiers = groupsBySlug[slug].chantiers || [];
      chantiers.forEach((g) => {
        const idx = (g.items || []).findIndex((it) => it.contrat === contrat);
        if (idx === -1) return;
        const item = g.items[idx];
        g.items.splice(idx, 1);
        if (!groupsBySlug[targetSlug]) groupsBySlug[targetSlug] = { chantiers: [] };
        let targetGroup = groupsBySlug[targetSlug].chantiers.find((x) => x.chantier === g.chantier);
        if (!targetGroup) {
          targetGroup = { chantier: g.chantier, items: [] };
          groupsBySlug[targetSlug].chantiers.push(targetGroup);
        }
        targetGroup.items.push(item);
      });
    } else {
      const items = groupsBySlug[slug].items || [];
      const idx = items.findIndex((it) => it.contrat === contrat);
      if (idx === -1) return;
      const item = items[idx];
      items.splice(idx, 1);
      if (!groupsBySlug[targetSlug]) groupsBySlug[targetSlug] = { nom: targetNom, items: [] };
      groupsBySlug[targetSlug].items.push(item);
    }
  });
}

function recomputeApercu(data, dashboard) {
  const apercu = Object.keys(data.conducteurs).map((slug) => {
    const g = data.conducteurs[slug];
    const c = { nom: g.nom, enAttente: 0, valides: 0, refuses: 0 };
    (g.items || []).forEach((it) => {
      if (it.statut === 'valide') c.valides++;
      else if (it.statut === 'refuse') c.refuses++;
      else c.enAttente++;
    });
    return c;
  }).sort((a, b) => b.enAttente - a.enAttente);
  data.apercu = apercu;
  dashboard.apercu = apercu;
}

function applyAssignmentsOverlay(data, dashboard) {
  function patchFlat(item) {
    const a = assignments[item.contrat];
    if (!a) return;
    item.conducteur = a.conducteur;
    if (a.conducteurMail) item.conducteurMail = a.conducteurMail;
  }
  forEachFlatItem(dashboard, patchFlat);

  Object.keys(assignments).forEach((contrat) => {
    const a = assignments[contrat];
    const targetSlug = slugify(a.conducteur);
    // patch conducteur name/mail on the item wherever it currently sits, then move it
    forEachNestedItem(data, (item) => {
      if (item.contrat === contrat) {
        item.conducteur = a.conducteur;
        if (a.conducteurMail) item.conducteurMail = a.conducteurMail;
      }
    });
    moveItemToSlug(data.conducteurs, contrat, targetSlug, a.conducteur, false);
    moveItemToSlug(data.echeances, contrat, targetSlug, a.conducteur, true);
  });

  recomputeApercu(data, dashboard);
}

function buildServed() {
  const data = JSON.parse(JSON.stringify(rawData));
  const dashboard = JSON.parse(JSON.stringify(rawDashboard));
  applyAssignmentsOverlay(data, dashboard);
  applyDecisionsOverlay(data, dashboard);
  return { data, dashboard };
}

let served = buildServed();

function rebuildServed() {
  served = buildServed();
}

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
app.get('/api/data.json', (req, res) => res.json(served.data));
app.get('/api/dashboard.json', requireRhAuth, (req, res) => res.json(served.dashboard));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  dernierRafraichissement: served.data.genereLe,
}));

// ---------------------------------------------------------------------
// Decision d'un conducteur (valider / refuser / prolonger / arreter /
// pas encore decide), prise directement sur le site. Pas d'authentification
// specifique ici : meme niveau de confiance que la page publique elle-meme,
// qui n'identifie pas nommement qui clique (comme avant, avec les liens
// personnels par conducteur a venir, cela se fera naturellement).
// ---------------------------------------------------------------------
app.post('/api/decision', (req, res) => {
  const { contrat, decision, commentaire, nouvelleDateFin } = req.body || {};
  if (!contrat || !decision || !DECISION_LABELS[decision]) {
    return res.status(400).json({ error: 'corps attendu : { contrat, decision, commentaire?, nouvelleDateFin? }' });
  }
  if (decision === 'prolonger' && nouvelleDateFin && !/^\d{2}\/\d{2}\/\d{4}$/.test(nouvelleDateFin)) {
    return res.status(400).json({ error: 'nouvelleDateFin attendue au format JJ/MM/AAAA' });
  }
  decisions[String(contrat)] = {
    statut: DECISION_LABELS[decision],
    commentaire: commentaire && String(commentaire).trim() ? String(commentaire).trim() : null,
    valideLe: todayFR(),
    nouvelleDateFin: decision === 'prolonger' ? (nouvelleDateFin || null) : undefined,
  };
  writeJsonSafe(DECISIONS_FILE, decisions);
  rebuildServed();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Attribution / reattribution du conducteur responsable d'un contrat
// (espace RH uniquement).
// ---------------------------------------------------------------------
app.get('/api/conducteurs', requireRhAuth, (req, res) => {
  const seen = {};
  (served.dashboard.items || []).forEach((it) => {
    if (!it.conducteur) return;
    seen[it.conducteur] = it.conducteurMail || seen[it.conducteur] || null;
  });
  const list = Object.keys(seen).map((nom) => ({ nom, mail: seen[nom] })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  res.json({ conducteurs: list });
});

app.post('/api/reassign', requireRhAuth, (req, res) => {
  const { contrat, conducteur, conducteurMail } = req.body || {};
  if (!contrat || !conducteur) {
    return res.status(400).json({ error: 'corps attendu : { contrat, conducteur, conducteurMail? }' });
  }
  assignments[String(contrat)] = { conducteur: String(conducteur).trim(), conducteurMail: conducteurMail ? String(conducteurMail).trim() : null };
  writeJsonSafe(ASSIGNMENTS_FILE, assignments);
  rebuildServed();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// Webhook de rafraichissement : appele periodiquement avec les donnees
// fraiches (ne declenche jamais de redeploiement, juste une mise a jour
// en memoire + sur disque). Les decisions et attributions deja enregistrees
// sont reappliquees automatiquement par-dessus (voir buildServed), donc
// un rafraichissement ne peut jamais effacer une validation ou une
// reattribution faite entre-temps.
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
  rawData = data;
  rawDashboard = dashboard;
  writeJsonSafe(DATA_FILE, rawData);
  writeJsonSafe(DASHBOARD_FILE, rawDashboard);
  rebuildServed();
  res.json({ ok: true, genereLe: served.data.genereLe });
});

app.listen(PORT, () => {
  console.log('STAM contrats interim - serveur demarre sur le port ' + PORT);
});
