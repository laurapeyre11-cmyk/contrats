// Mails aux conducteurs, sur le modele du brouillon que prepare
// STAM_MOTEUR_V6 (« Contrats interim a valider - N contrat(s) - date »),
// mais avec le lien personnel vers le site au lieu du fichier Excel.
// Ce module ne fait que PREPARER les mails : ils sont envoyes depuis
// Outlook par POUSSER_SITE_CONTRATS.vbs, sur le PC de RH, avec les PDF
// signes en pieces jointes.
//
// Pour ne jamais envoyer deux fois le meme contrat, le PC garde la liste
// des contrats deja annonces et la transmet a chaque envoi ("connus").
// Premier envoi (liste absente) : un seul mail de lancement par conducteur
// avec son lien, sans le detail des centaines de contrats deja en attente.

const MAX_LIGNES = 40;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function prix(v) {
  return typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '—';
}

function prenom(nom) {
  const mots = String(nom || '').trim().split(/\s+/);
  const p = mots.find((m) => m && m !== m.toUpperCase());
  return p || mots[0] || '';
}

function aujourdhuiFR(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

const STYLE_TABLE = 'border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:10.5pt';
const STYLE_TH = 'background:#1f3864;color:#ffffff;padding:5px 8px;border:1px solid #bfbfbf;text-align:left;white-space:nowrap';
const STYLE_TD = 'padding:5px 8px;border:1px solid #bfbfbf;vertical-align:top';
const STYLE_BOUTON = 'display:inline-block;background:#1f7a4d;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:6px;font-family:Calibri,Arial,sans-serif;font-size:12pt';

function bouton(lien, texte) {
  return '<p style="margin:18px 0"><a href="' + esc(lien) + '" style="' + STYLE_BOUTON + '">' + esc(texte) + '</a></p>' +
    '<p style="font-size:9.5pt;color:#595959">Si le bouton ne s\'ouvre pas, copiez ce lien : <a href="' + esc(lien) + '">' + esc(lien) + '</a><br>' +
    'Ce lien est personnel : merci de ne pas le transférer.</p>';
}

function corps(html) {
  return '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000000">' + html + '<p>Cordialement,</p></div>';
}

function tableau(items) {
  const lignes = items.slice(0, MAX_LIGNES).map((it) =>
    '<tr>' +
      '<td style="' + STYLE_TD + '"><b>' + esc(it.interimaire) + '</b></td>' +
      '<td style="' + STYLE_TD + '">' + esc(it.qualification || '—') + '</td>' +
      '<td style="' + STYLE_TD + '">' + esc(it.chantier || '—') + '</td>' +
      '<td style="' + STYLE_TD + ';white-space:nowrap">' + esc(it.debutMission || '—') + '</td>' +
      '<td style="' + STYLE_TD + ';white-space:nowrap">' + esc(it.finFerme || '—') +
        (it.finSouplesse ? '<br><span style="font-size:9pt;color:#595959">souplesse jusqu\'au ' + esc(it.finSouplesse) + '</span>' : '') + '</td>' +
      '<td style="' + STYLE_TD + ';text-align:right;white-space:nowrap"><b>' + prix(it.thm42) + '</b></td>' +
      '<td style="' + STYLE_TD + ';text-align:right;white-space:nowrap">' + prix(it.thm39) + '</td>' +
      '<td style="' + STYLE_TD + ';white-space:nowrap">' + esc(it.contrat) + '</td>' +
    '</tr>').join('');
  const reste = items.length > MAX_LIGNES
    ? '<p>… et ' + (items.length - MAX_LIGNES) + ' autres contrats, visibles sur le site.</p>' : '';
  return '<table style="' + STYLE_TABLE + '"><tr>' +
    ['Intérimaire', 'Qualification', 'Chantier', 'Du', 'Au', 'THM 42h', 'THM 39h', 'N° contrat']
      .map((h) => '<th style="' + STYLE_TH + '">' + h + '</th>').join('') +
    '</tr>' + lignes + '</table>' + reste;
}

// data : donnees du site (decisions deja appliquees)
// mails : { slug: adresse }   fichiers : { contrat: nom du PDF signe }
// connus : Set des contrats deja annonces, ou null au tout premier envoi
// lienDe(slug) : URL complete du lien personnel
function preparerMails({ data, mails, fichiers, connus, lienDe, maintenant }) {
  const date = aujourdhuiFR(maintenant || new Date());
  const resultat = [];
  const tous = [];
  Object.keys(data.conducteurs || {}).forEach((slug) => {
    const c = data.conducteurs[slug];
    (c.items || []).forEach((it) => tous.push(String(it.contrat)));
    if (slug === 'rh') return; // contrats non attribues : pas de conducteur a prevenir
    const a = mails[slug];
    if (!a) return;
    const enAttente = (c.items || []).filter((it) => !it.statut || it.statut === 'attente');
    if (!enAttente.length) return;
    const lien = lienDe(slug);
    const bonjour = '<p>Bonjour ' + esc(prenom(c.nom)) + ',</p>';

    if (!connus) {
      resultat.push({
        a,
        objet: 'Contrats intérim à valider - ' + enAttente.length + ' contrat(s) en attente - ' + date,
        html: corps(bonjour +
          '<p>Les contrats d\'intérim de vos chantiers se valident désormais en ligne, depuis votre téléphone ou votre ordinateur.</p>' +
          '<p>Vous avez actuellement <b>' + enAttente.length + ' contrat' + (enAttente.length > 1 ? 's' : '') + '</b> en attente de validation. ' +
          'Merci de vérifier en particulier le chantier, les dates et le THM, puis de valider ou refuser chaque contrat.</p>' +
          bouton(lien, 'Ouvrir mes contrats à valider') +
          '<p>À chaque nouveau contrat signé, vous recevrez un mail comme celui-ci.</p>'),
        pj: [],
      });
      return;
    }

    const nouveaux = enAttente.filter((it) => !connus.has(String(it.contrat)));
    if (!nouveaux.length) return;
    const n = nouveaux.length;
    const pj = nouveaux.map((it) => fichiers[it.contrat]).filter(Boolean);
    resultat.push({
      a,
      objet: 'Contrats intérim à valider - ' + n + ' contrat(s) - ' + date,
      html: corps(bonjour +
        '<p>Voici ' + n + ' contrat' + (n > 1 ? 's' : '') + ' d\'intérim signé' + (n > 1 ? 's' : '') + ' sur vos chantiers. ' +
        'Merci de vérifier les informations ci-dessous, en particulier le chantier, les dates et le <b>THM</b>.</p>' +
        tableau(nouveaux) +
        bouton(lien, n > 1 ? 'Valider ces contrats sur le site' : 'Valider ce contrat sur le site') +
        (enAttente.length > n ? '<p>Vous avez au total ' + enAttente.length + ' contrats en attente sur le site.</p>' : '') +
        (pj.length ? '<p>' + (pj.length > 1 ? 'Les contrats signés sont joints' : 'Le contrat signé est joint') + ' à ce message.</p>' : '')),
      pj,
    });
  });
  return { mails: resultat, connus: Array.from(new Set(tous)) };
}

module.exports = { preparerMails, prenom };
