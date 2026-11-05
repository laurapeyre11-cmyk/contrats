// Import direct du fichier VALIDATION_CONTRATS.xlsx produit par
// STAM_MOTEUR_V6 (onglet « A valider ») : le site se met a jour a chaque
// lancement du moteur, sans passer par un script intermediaire.
//
// Colonnes de l'onglet « A valider » (ligne 1 = en-tetes) :
//  A Date de traitement   B N. contrat      C Interimaire     D Agence
//  E Chantier             F Conducteur      G Qualification   H Debut de mission
//  I Fin ferme            J Debut souplesse K Fin souplesse   L Heures / sem.
//  M Salaire EUR/h        N Tarif facture   O MTT 42h         P THM 42h
//  Q MTT 39h              R THM 39h         S VALIDATION      T COMMENTAIRE
//  U DECISION LE
// Les colonnes sont retrouvees par leur en-tete (et a defaut par leur
// position), pour resister a l'ajout d'une colonne par le moteur.

const ExcelJS = require('exceljs');

const ECHEANCE_JOURS = 30; // "Fins proches" : contrats qui finissent dans les 30 jours

// Libelles d'en-tete (sans accents, en minuscules) -> champ
const COLONNES = [
  ['traitement', ['date de traitement'], 0],
  ['contrat', ['n. contrat', 'n contrat', 'numero de contrat'], 1],
  ['interimaire', ['interimaire'], 2],
  ['agence', ['agence'], 3],
  ['chantier', ['chantier'], 4],
  ['conducteur', ['conducteur de travaux', 'conducteur'], 5],
  ['qualification', ['qualification'], 6],
  ['debutMission', ['debut de mission'], 7],
  ['finFerme', ['fin ferme'], 8],
  ['debutSouplesse', ['debut souplesse'], 9],
  ['finSouplesse', ['fin souplesse'], 10],
  ['heuresSemaine', ['heures / sem.', 'heures / sem', 'heures'], 11],
  ['salaire', ['salaire eur/h', 'salaire'], 12],
  ['tarifFacture', ['tarif facture eur/h', 'tarif facture'], 13],
  ['mtt42', ['mtt 42h'], 14],
  ['thm42', ['thm 42h eur/h', 'thm 42h'], 15],
  ['mtt39', ['mtt 39h'], 16],
  ['thm39', ['thm 39h eur/h', 'thm 39h'], 17],
  ['validation', ['validation', 'valide (o/n)'], 18],
  ['commentaire', ['commentaire'], 19],
  ['decisionLe', ['decision le (date + heure)', 'decision le', 'valide le'], 20],
  ['fichier', ['fichier signe'], 21],
];

function sansAccent(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function slugify(nom) {
  const s = sansAccent(nom || 'rh').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'rh';
}

// Valeur brute d'une cellule exceljs (formule -> resultat, texte riche -> texte)
function brut(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return brut(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if (v.error) return null;
  }
  return v;
}

function pad(n) { return String(n).padStart(2, '0'); }

// -> "JJ/MM/AAAA" ou null
function dateFR(v) {
  v = brut(v);
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    return pad(v.getUTCDate()) + '/' + pad(v.getUTCMonth() + 1) + '/' + v.getUTCFullYear();
  }
  if (typeof v === 'number') { // numero de serie Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return dateFR(d);
  }
  // "31/08/2026" ou "31/08/26" (le moteur ecrit parfois l'annee sur 2 chiffres)
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/.exec(String(v));
  if (m) return pad(m[1]) + '/' + pad(m[2]) + '/' + (m[3].length === 2 ? '20' + m[3] : m[3]);
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : null;
}

function nombre(v) {
  v = brut(v);
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function texte(v) {
  v = brut(v);
  if (v == null) return null;
  if (v instanceof Date) return dateFR(v);
  const s = String(v).trim();
  return s || null;
}

function jourUTC(fr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fr || '');
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
}

function statutDepuisExcel(v) {
  const s = sansAccent(texte(v));
  if (!s) return 'attente';
  if (s.startsWith('valid') || s === 'o' || s === 'oui') return 'valide';
  if (s.startsWith('refus') || s === 'n' || s === 'non') return 'refuse';
  return 'attente';
}

async function lireClasseur(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

// Adresse mail de chaque conducteur, lue dans CONDUCTEURS.xlsx (facultatif)
async function lireMails(buf, corrections) {
  const mails = {};
  if (!buf) return mails;
  const wb = await lireClasseur(buf);
  const ws = wb.getWorksheet('CONDUCTEURS') || wb.worksheets[0];
  if (!ws) return mails;
  let colNom = 2, colMail = 3;
  ws.eachRow((row) => {
    const vals = row.values.map((v) => sansAccent(texte(v)));
    const iNom = vals.findIndex((v) => v && v.startsWith('conducteur'));
    const iMail = vals.findIndex((v) => v && (v === 'e-mail' || v === 'email' || v === 'mail'));
    if (iNom > 0 && iMail > 0) { colNom = iNom; colMail = iMail; return; }
    const nom = texte(row.getCell(colNom).value);
    const mail = texte(row.getCell(colMail).value);
    if (nom && mail && mail.includes('@')) {
      const k = slugify(corrections[slugify(nom)] || nom);
      if (!mails[k]) mails[k] = mail;
    }
  });
  return mails;
}

// options.corrections : { "aleaxandre-queyras": "Alexandre QUEYRAS" } pour
// rassembler sous un seul nom un conducteur ecrit de plusieurs facons.
async function construireDepuisExcel(validationBuf, conducteursBuf, options = {}) {
  const corrections = options.corrections || {};
  const maintenant = options.maintenant || new Date();
  const wb = await lireClasseur(validationBuf);
  const ws = wb.getWorksheet('A valider') || wb.worksheets.find((w) => w.state !== 'hidden') || wb.worksheets[0];
  if (!ws) throw new Error('onglet « A valider » introuvable');

  // reperage des colonnes par en-tete
  const entetes = (ws.getRow(1).values || []).map((v) => sansAccent(texte(v)));
  const col = {};
  COLONNES.forEach(([champ, libelles, positionParDefaut]) => {
    const i = entetes.findIndex((h) => h && libelles.includes(h));
    col[champ] = i > 0 ? i : positionParDefaut + 1; // exceljs : colonnes numerotees a partir de 1
  });
  if (!entetes.some((h) => h && h.startsWith('n') && h.includes('contrat'))) {
    throw new Error('en-tete « N. contrat » introuvable en ligne 1 de l\'onglet « A valider »');
  }

  const mails = await lireMails(conducteursBuf, corrections);
  const nomsCanon = {}; // slug -> nom affiche
  const parContrat = new Map(); // un contrat present plusieurs fois : la derniere ligne gagne

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = (champ) => row.getCell(col[champ]).value;
    const contrat = texte(v('contrat'));
    const interimaire = texte(v('interimaire'));
    if (!contrat || !interimaire) return;
    let conducteur = texte(v('conducteur')) || 'rh';
    if (corrections[slugify(conducteur)]) conducteur = corrections[slugify(conducteur)];
    const slug = slugify(conducteur);
    if (!nomsCanon[slug]) nomsCanon[slug] = conducteur;
    // THM calcule par le moteur (= MTT 42h / 42) ; recalcule si la formule
    // n'a pas de valeur enregistree dans le fichier.
    const mtt42 = nombre(v('mtt42'));
    const mtt39 = nombre(v('mtt39'));
    let thm42 = nombre(v('thm42'));
    let thm39 = nombre(v('thm39'));
    if (thm42 == null && mtt42 != null) thm42 = Math.round((mtt42 / 42) * 100) / 100;
    if (thm39 == null && mtt39 != null) thm39 = Math.round((mtt39 / 39) * 100) / 100;
    parContrat.set(contrat, {
      slug,
      fichier: texte(v('fichier')),
      item: {
        contrat,
        interimaire,
        agence: texte(v('agence')),
        chantier: texte(v('chantier')),
        conducteur, // remplace par le nom canonique plus bas
        qualification: texte(v('qualification')),
        debutMission: dateFR(v('debutMission')),
        finFerme: dateFR(v('finFerme')),
        debutSouplesse: dateFR(v('debutSouplesse')),
        finSouplesse: dateFR(v('finSouplesse')),
        heuresSemaine: nombre(v('heuresSemaine')),
        salaire: nombre(v('salaire')),
        tarifFacture: nombre(v('tarifFacture')),
        thm42,
        thm39,
        statut: statutDepuisExcel(v('validation')),
        commentaire: texte(v('commentaire')),
        valideLe: dateFR(v('decisionLe')),
      },
    });
  });

  const genereLe = pad(maintenant.getDate()) + '/' + pad(maintenant.getMonth() + 1) + '/' + maintenant.getFullYear();
  const aujourdhui = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());

  const data = { genereLe, conducteurs: {}, echeances: {}, apercu: [], historique: [] };
  const dashboard = { genereLe, items: [], echeances: [], apercu: [] };

  const fichiers = {}; // n° de contrat -> nom du PDF signe (pieces jointes des mails)
  for (const { slug, item, fichier } of parContrat.values()) {
    if (fichier) fichiers[item.contrat] = fichier;
    const nom = nomsCanon[slug] || item.conducteur;
    item.conducteur = nom;
    const mail = mails[slug] || null;

    if (!data.conducteurs[slug]) data.conducteurs[slug] = { nom, items: [] };
    data.conducteurs[slug].items.push(Object.assign({}, item));
    dashboard.items.push(Object.assign({}, item, mail ? { conducteurMail: mail } : {}));

    const fin = jourUTC(item.finFerme);
    if (fin != null) {
      const jours = Math.round((fin - aujourdhui) / 86400000);
      if (jours >= 0 && jours <= ECHEANCE_JOURS) {
        const ech = {
          contrat: item.contrat, interimaire: item.interimaire, qualification: item.qualification,
          agence: item.agence, chantier: item.chantier, conducteur: nom,
          debutMission: item.debutMission, finFerme: item.finFerme,
          joursRestants: jours, enRetard: false, thm42: item.thm42, thm39: item.thm39,
          statut: item.statut, commentaire: item.commentaire, valideLe: item.valideLe,
        };
        if (!data.echeances[slug]) data.echeances[slug] = { nom, chantiers: [] };
        let g = data.echeances[slug].chantiers.find((x) => x.chantier === (item.chantier || '—'));
        if (!g) { g = { chantier: item.chantier || '—', items: [] }; data.echeances[slug].chantiers.push(g); }
        g.items.push(ech);
        dashboard.echeances.push(Object.assign({}, ech, mail ? { conducteurMail: mail } : {},
          { salaire: item.salaire, tarifFacture: item.tarifFacture }));
      }
    }
  }

  return { data, dashboard, fichiers, nombre: parContrat.size };
}

module.exports = { construireDepuisExcel, slugify };
