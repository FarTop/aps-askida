// APS — admin/infrastructure/infrastructure.js — créé le 2026-08-10
// L'écran doit se suffire à lui-même : créer une plateforme, lui donner ses
// accès, puis lui donner sa spécification d'API — sans jamais ouvrir un fichier
// de configuration ni écrire de code. C'est l'exigence posée le 2026-08-10.

'use strict';

let plateformes = [];
let choisie     = null;
let specCourante = null;

const $ = (id) => document.getElementById(id);

function vider(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function message(texte, etat) {
  const el = $('inf-message');
  el.textContent = texte || '';
  el.dataset.etat = etat || '';
}

const LIBELLE_TYPE = {
  integration: 'Intégration',
  runtime:     'Orchestrateur',
  encoder:     'Encodeur',
  ai:          'IA',
};

// ── Liste des outils ─────────────────────────────────────────
async function charger() {
  const hote = $('inf-liste-items');
  vider(hote);
  try {
    const r = await fetch('/api/platforms');
    plateformes = await r.json();
  } catch (e) {
    const err = document.createElement('div');
    err.className = 'inf-vide';
    err.textContent = 'Erreur de chargement : ' + e.message;
    hote.appendChild(err);
    return;
  }
  if (!plateformes.length) {
    const vide = document.createElement('div');
    vide.className = 'inf-vide';
    vide.textContent = 'Aucun outil déclaré. Créez-en un depuis « Gérer les plateformes ».';
    hote.appendChild(vide);
    return;
  }
  plateformes.forEach(function (p) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'inf-item';
    item.dataset.id = p.id;

    const titre = document.createElement('div');
    titre.className = 'inf-item-nom';
    titre.textContent = (p.icon ? p.icon + ' ' : '') + p.name;
    item.appendChild(titre);

    const meta = document.createElement('div');
    meta.className = 'inf-item-meta';
    meta.textContent = LIBELLE_TYPE[p.type] || p.type;
    item.appendChild(meta);

    item.onclick = function () { selectionner(p.id); };
    hote.appendChild(item);
  });
}

function selectionner(id) {
  choisie = plateformes.find(function (p) { return p.id === id; }) || null;
  document.querySelectorAll('.inf-item').forEach(function (el) {
    el.dataset.actif = el.dataset.id === id ? '1' : '0';
  });
  if (!choisie) return;

  $('inf-detail').hidden = false;
  $('inf-nom').textContent = (choisie.icon ? choisie.icon + ' ' : '') + choisie.name;

  const meta = $('inf-meta');
  vider(meta);
  [
    LIBELLE_TYPE[choisie.type] || choisie.type,
    choisie.slug,
    choisie.authSpec ? 'schéma d\'authentification déclaré' : 'aucun schéma d\'authentification',
  ].forEach(function (t) {
    const b = document.createElement('span');
    b.className = 'inf-badge';
    b.textContent = t;
    meta.appendChild(b);
  });

  message('', '');
  $('inf-url').value = '';
  vider($('inf-candidats'));
  vider($('inf-proposition'));
  chargerSpec();
}

// ── Spécification de l'outil choisi ──────────────────────────
async function chargerSpec() {
  const etat = $('inf-spec-etat');
  vider(etat);
  specCourante = null;
  $('inf-bloc-ops').hidden = true;

  let specs = [];
  try {
    const r = await fetch('/api/platforms/' + choisie.id + '/specs');
    specs = await r.json();
  } catch (_) { specs = []; }

  if (!specs.length) {
    const p = document.createElement('div');
    p.className = 'inf-vide';
    p.textContent = 'Aucune spécification importée pour cet outil.';
    etat.appendChild(p);
    return;
  }

  specCourante = specs[0];
  const lignes = [
    ['Nom',        specCourante.name],
    ['Format',     (specCourante.format || '') + (specCourante.version ? ' ' + specCourante.version : '')],
    ['Opérations', String(specCourante.nbOperations)],
    ['URL de base déclarée', specCourante.baseUrl || '—'],
    ['Source',     specCourante.sourceUrl || 'fichier importé'],
    ['Importée le', new Date(specCourante.updatedAt).toLocaleString('fr-FR')],
  ];
  const tbl = document.createElement('div');
  tbl.className = 'inf-fiche';
  lignes.forEach(function (l) {
    const k = document.createElement('div'); k.className = 'inf-fiche-cle';    k.textContent = l[0];
    const v = document.createElement('div'); v.className = 'inf-fiche-valeur'; v.textContent = l[1];
    tbl.appendChild(k); tbl.appendChild(v);
  });
  etat.appendChild(tbl);

  const sup = document.createElement('button');
  sup.type = 'button';
  sup.className = 'inf-btn inf-btn-danger';
  sup.textContent = 'Retirer cette spécification';
  sup.onclick = supprimerSpec;
  etat.appendChild(sup);

  $('inf-bloc-ops').hidden = false;
  chargerOperations('');
}

// `suite` ajoute à la liste au lieu de la remplacer : c'est ce qui permet
// d'atteindre la 201e opération et les suivantes.
let filtreCourant = '';
let decalage = 0;

async function chargerOperations(filtre, suite) {
  const hote = $('inf-ops');
  if (!suite) { vider(hote); decalage = 0; filtreCourant = filtre || ''; }
  if (!specCourante) return;

  const params = new URLSearchParams();
  if (filtreCourant) params.set('q', filtreCourant);
  if (decalage) params.set('offset', String(decalage));
  const url = '/api/specs/' + specCourante.id + '/endpoints'
            + (params.toString() ? '?' + params.toString() : '');
  let d;
  try { d = await (await fetch(url)).json(); } catch (e) { return; }

  decalage += d.affiches;
  $('inf-ops-compteur').textContent = d.total + ' opération(s)'
    + (decalage < d.total ? ' · ' + decalage + ' affichées' : '');

  const btn = $('inf-btn-suite');
  btn.hidden = d.restantes <= 0;
  btn.textContent = 'Charger la suite (' + d.restantes + ' restantes)';

  d.endpoints.forEach(function (op) {
    const ligne = document.createElement('div');
    ligne.className = 'inf-op';

    const m = document.createElement('span');
    m.className = 'inf-op-methode';
    m.dataset.methode = op.method;
    m.textContent = op.method;
    ligne.appendChild(m);

    const c = document.createElement('span');
    c.className = 'inf-op-chemin';
    c.textContent = op.path;
    ligne.appendChild(c);

    const s = document.createElement('span');
    s.className = 'inf-op-resume';
    s.textContent = (op.summary && op.summary.fr) || '';
    ligne.appendChild(s);

    hote.appendChild(ligne);
  });
}

// ── Découverte ───────────────────────────────────────────────
// L'URL d'une spécification n'est presque jamais documentée : celle de Make a
// été trouvée en tâtonnant sur les chemins conventionnels. Autant que le
// tâtonnement soit ici plutôt que dans la tête de quelqu'un.
async function chercher() {
  const btn = $('inf-btn-chercher');
  const hote = $('inf-candidats');
  vider(hote);
  btn.disabled = true;
  message('Recherche en cours…', 'attente');
  try {
    const d = await (await fetch('/api/platforms/' + choisie.id + '/spec-candidates')).json();
    if (d.message) { message(d.message, 'error'); return; }
    if (!d.candidats.length) {
      message(d.sondes + ' emplacements sondés depuis ' + d.base + ' — aucun ne répond. '
            + 'Il faudra trouver l\'URL dans la documentation de l\'éditeur, ou importer un fichier.', '');
      return;
    }
    message(d.candidats.length + ' piste(s) trouvée(s) via la connexion « ' + d.connexion + ' ».', 'ok');
    d.candidats.forEach(function (c) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'inf-candidat';
      b.dataset.verdict = c.verdict;

      const u = document.createElement('span');
      u.className = 'inf-candidat-url';
      u.textContent = c.url;
      b.appendChild(u);

      const v = document.createElement('span');
      v.className = 'inf-candidat-verdict';
      v.textContent = c.verdict + ' (HTTP ' + c.status + ')';
      b.appendChild(v);

      b.onclick = function () {
        $('inf-url').value = c.url;
        message('URL reportée — cliquez sur Importer.', '');
      };
      hote.appendChild(b);
    });
  } catch (e) {
    message('❌ ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Proposition d'authentification ───────────────────────────
// Déduite de `securitySchemes` par l'import. Proposée, jamais appliquée
// d'office : la plateforme porte peut-être déjà un schéma écrit à la main et
// meilleur — celui de Make a une variable {zone} qu'aucune spec ne devine.
function rendreProposition(d) {
  const hote = $('inf-proposition');
  vider(hote);
  const prop = d.authProposee;
  if (!prop) return;

  const carte = document.createElement('div');
  carte.className = 'inf-prop-carte';

  const t = document.createElement('div');
  t.className = 'inf-prop-titre';
  t.textContent = 'Schéma d\'authentification déduit de la spécification';
  carte.appendChild(t);

  const code = document.createElement('div');
  code.className = 'inf-prop-code';
  code.textContent = prop.auth.headers.map(function (h) { return h.name + ': ' + h.value; }).join('\n')
    + (prop.baseUrlPattern ? '\nURL de base : ' + prop.baseUrlPattern : '');
  carte.appendChild(code);

  if (prop.serveursDeclares && prop.serveursDeclares.length > 1) {
    const s = document.createElement('div');
    s.className = 'inf-aide';
    s.textContent = prop.serveursDeclares.length + ' serveurs déclarés (zones) : '
      + prop.serveursDeclares.join(' · ')
      + ' — une variable dans l\'URL sera sans doute préférable.';
    carte.appendChild(s);
  }

  if (prop.prefixeAConfirmer) {
    const a = document.createElement('div');
    a.className = 'inf-prop-alerte';
    a.textContent = '⚠️ Le préfixe a été deviné dans la description en prose : la spécification '
                  + 'ne le déclare pas. À vérifier avant d\'appliquer.';
    carte.appendChild(a);
  }
  if (d.authDejaDeclare) {
    const a = document.createElement('div');
    a.className = 'inf-prop-alerte';
    a.textContent = '⚠️ Cet outil porte déjà un schéma. Appliquer le remplacera.';
    carte.appendChild(a);
  }

  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'inf-btn inf-btn-accent';
  b.textContent = 'Appliquer à la plateforme';
  b.onclick = async function () {
    b.disabled = true;
    try {
      const spec = { baseUrlPattern: prop.baseUrlPattern, fields: prop.fields, auth: prop.auth };
      const r = await fetch('/api/platforms/' + choisie.id + '/auth-spec', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authSpec: spec }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      message('✅ Schéma appliqué — il pilote désormais le formulaire de Connexions.', 'ok');
      vider(hote);
      await charger();
      selectionner(choisie.id);
    } catch (e) { message('❌ ' + e.message, 'error'); b.disabled = false; }
  };
  carte.appendChild(b);
  hote.appendChild(carte);
}

// ── Imports ──────────────────────────────────────────────────
async function envoyerImport(corps, bouton) {
  bouton.disabled = true;
  message('Import en cours…', 'attente');
  try {
    const r = await fetch('/api/platforms/' + choisie.id + '/specs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    message('✅ ' + d.nbOperations + ' opérations importées'
      + (d.reconstitue ? ' — reconstituées depuis ' + d.reconstitue.pagesLues + ' pages de documentation' : '')
      + (d.remplace ? ' (la spécification précédente a été remplacée)' : ''), 'ok');
    await chargerSpec();
    rendreProposition(d);
  } catch (e) {
    message('❌ ' + e.message, 'error');
  } finally {
    bouton.disabled = false;
  }
}

function importerUrl() {
  const url = $('inf-url').value.trim();
  if (!url) { message('Renseignez une URL.', 'error'); return; }
  envoyerImport({ url: url }, $('inf-btn-url'));
}

function importerFichier() {
  const f = $('inf-fichier').files[0];
  if (!f) { message('Choisissez un fichier.', 'error'); return; }
  const lecteur = new FileReader();
  lecteur.onload = function () {
    let contenu;
    try { contenu = JSON.parse(lecteur.result); }
    catch (e) { message('❌ Fichier illisible : JSON attendu', 'error'); return; }
    envoyerImport({ content: contenu }, $('inf-btn-fichier'));
  };
  lecteur.readAsText(f);
}

async function supprimerSpec() {
  if (!specCourante) return;
  if (!confirm('Retirer la spécification « ' + specCourante.name + ' » et ses opérations ?')) return;
  try {
    await fetch('/api/specs/' + specCourante.id, { method: 'DELETE' });
    message('Spécification retirée.', '');
    await chargerSpec();
  } catch (e) { message('❌ ' + e.message, 'error'); }
}

// ── Événements ───────────────────────────────────────────────
$('inf-btn-url').onclick      = importerUrl;
$('inf-btn-chercher').onclick = chercher;
$('inf-btn-suite').onclick    = function () { chargerOperations(filtreCourant, true); };
$('inf-btn-fichier').onclick = importerFichier;

// Filtre différé : chaque frappe déclencherait sinon une requête sur des
// centaines d'opérations.
let minuterieFiltre = null;
$('inf-ops-filtre').oninput = function (e) {
  clearTimeout(minuterieFiltre);
  const v = e.target.value.trim();
  minuterieFiltre = setTimeout(function () { chargerOperations(v); }, 250);
};

charger();
