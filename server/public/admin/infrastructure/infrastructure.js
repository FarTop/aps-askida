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
  vider($('inf-test'));
  chargerSpec();
}

// ── Spécification de l'outil choisi ──────────────────────────
async function chargerSpec() {
  const etat = $('inf-spec-etat');
  vider(etat);
  specCourante = null;
  $('inf-bloc-ops').hidden = true;
  $('inf-bloc-verbes').hidden = true;

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
  chargerVerbes();
  chargerContexte();
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

    // Retenir une opération : elle deviendra un verbe, et le test ciblé ne
    // portera que sur celles-ci.
    const et = document.createElement('button');
    et.type = 'button';
    et.className = 'inf-op-etoile';
    et.title = 'Retenir cette opération';
    et.dataset.retenu = op.apsMapping ? '1' : '0';
    et.textContent = op.apsMapping ? '★' : '☆';
    et.onclick = async function () {
      const nouveau = et.dataset.retenu !== '1';
      try {
        const r = await fetch('/api/endpoints/' + op.id + '/mapping', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retenu: nouveau }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        et.dataset.retenu = nouveau ? '1' : '0';
        et.textContent = nouveau ? '★' : '☆';
        chargerVerbes();
      } catch (e) { message('❌ ' + e.message, 'error'); }
    };
    ligne.appendChild(et);

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

// ── Verbes ───────────────────────────────────────────────────
// Le vocabulaire en cours de constitution : ce qu'un concepteur veut FAIRE,
// en regard de l'appel HTTP qui le réalise. Les deux côte à côte, pour que le
// lien reste visible — c'est tout l'objet de l'écran.
async function chargerVerbes() {
  const hote = $('inf-verbes');
  vider(hote);
  if (!specCourante) return;
  let d;
  try { d = await (await fetch('/api/specs/' + specCourante.id + '/verbes')).json(); }
  catch (_) { return; }

  $('inf-bloc-verbes').hidden = false;
  $('inf-verbes-compteur').textContent = d.total ? d.total + ' retenu(s)' : '';

  if (!d.total) {
    const v = document.createElement('div');
    v.className = 'inf-vide';
    v.textContent = 'Aucun verbe retenu. Cliquez sur l\'étoile d\'une opération, plus bas, pour en faire un.';
    hote.appendChild(v);
    return;
  }

  d.verbes.forEach(function (x) {
    const l = document.createElement('div');
    l.className = 'inf-verbe';

    const nom = document.createElement('input');
    nom.type = 'text';
    nom.className = 'inf-input';
    // Le résumé de la spec sert d'amorce : mieux vaut un point de départ à
    // réécrire qu'un champ vide devant lequel on hésite.
    nom.placeholder = (x.summary && x.summary.fr) || 'Nom du verbe';
    nom.value = (x.apsMapping && x.apsMapping.label) || '';
    let minuterie = null;
    nom.oninput = function () {
      clearTimeout(minuterie);
      minuterie = setTimeout(async function () {
        try {
          await fetch('/api/endpoints/' + x.id + '/mapping', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: nom.value }),
          });
        } catch (e) { message('❌ ' + e.message, 'error'); }
      }, 500);
    };
    l.appendChild(nom);

    const p = document.createElement('span');
    p.className = 'inf-verbe-plomberie';
    p.textContent = '← ' + x.method + ' ' + x.path;
    l.appendChild(p);

    const sup = document.createElement('button');
    sup.type = 'button';
    sup.className = 'inf-ctx-sup';
    sup.title = 'Ne plus retenir';
    sup.textContent = '✕';
    sup.onclick = async function () {
      try {
        await fetch('/api/endpoints/' + x.id + '/mapping', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retenu: false }),
        });
        await chargerVerbes();
        await chargerOperations(filtreCourant);
      } catch (e) { message('❌ ' + e.message, 'error'); }
    };
    l.appendChild(sup);

    hote.appendChild(l);
  });
}

// ── Contexte de test ─────────────────────────────────────────
function ligneContexte(cle, valeur) {
  const l = document.createElement('div');
  l.className = 'inf-ctx-ligne';

  const k = document.createElement('input');
  k.type = 'text'; k.className = 'inf-input'; k.dataset.role = 'cle';
  k.placeholder = 'teamId'; k.value = cle || '';
  l.appendChild(k);

  const v = document.createElement('input');
  v.type = 'text'; v.className = 'inf-input'; v.dataset.role = 'valeur';
  v.placeholder = '411248'; v.value = valeur || '';
  l.appendChild(v);

  const s = document.createElement('button');
  s.type = 'button'; s.className = 'inf-ctx-sup'; s.textContent = '✕';
  s.onclick = function () { l.remove(); };
  l.appendChild(s);

  return l;
}

async function chargerContexte() {
  const hote = $('inf-ctx-lignes');
  vider(hote);
  try {
    const d = await (await fetch('/api/platforms/' + choisie.id + '/test-context')).json();
    const entrees = Object.entries(d.contexte || {});
    if (!entrees.length) hote.appendChild(ligneContexte('', ''));
    else entrees.forEach(function (e) { hote.appendChild(ligneContexte(e[0], e[1])); });
  } catch (_) { hote.appendChild(ligneContexte('', '')); }
}

async function enregistrerContexte() {
  const contexte = {};
  $('inf-ctx-lignes').querySelectorAll('.inf-ctx-ligne').forEach(function (l) {
    const k = l.querySelector('[data-role="cle"]').value.trim();
    const v = l.querySelector('[data-role="valeur"]').value.trim();
    if (k && v) contexte[k] = v;
  });
  try {
    const r = await fetch('/api/platforms/' + choisie.id + '/test-context', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contexte: contexte }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    message('✅ Contexte enregistré (' + Object.keys(d.contexte).length + ' valeur(s)) sur « ' + d.connexion + ' ».', 'ok');
  } catch (e) { message('❌ ' + e.message, 'error'); }
}

// ── Test des endpoints ───────────────────────────────────────
// Forme reprise de l'API Check de WFD : un bandeau de synthèse d'abord — état
// global, comptes — puis le détail ligne à ligne.
async function tester(retenues) {
  const btn = retenues ? $('inf-btn-test-retenues') : $('inf-btn-test');
  const hote = $('inf-test');
  vider(hote);
  btn.disabled = true;
  message('Test en cours…', 'attente');
  try {
    const r = await fetch('/api/specs/' + specCourante.id + '/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 25,
                             q: retenues ? undefined : (filtreCourant || undefined),
                             retenues: !!retenues }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    message('', '');
    rendreTest(d, hote);
  } catch (e) {
    message('❌ ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function rendreTest(d, hote) {
  const res = d.resume;
  // `res.ok === d.testes` valait vrai quand les deux étaient à zéro : un test
  // qui n'a rien pu appeler s'affichait en vert « tout va bien ». Rien testé
  // est un état à part, ni réussite ni échec.
  const etat = d.testes === 0 ? 'rien'
             : res.ok === d.testes ? 'ok'
             : res.ok === 0 ? 'ko' : 'mixte';

  const bandeau = document.createElement('div');
  bandeau.className = 'inf-bandeau';
  bandeau.dataset.etat = etat;

  const ico = document.createElement('span');
  ico.className = 'inf-bandeau-icone';
  ico.textContent = { ok: '✅', ko: '❌', rien: 'ℹ️' }[etat] || '⚠️';
  bandeau.appendChild(ico);

  const bloc = document.createElement('div');
  const t = document.createElement('div');
  t.className = 'inf-bandeau-titre';
  t.textContent = etat === 'rien'
    ? 'Aucune opération testable — rien n\'a été appelé'
    : res.ok + ' joignable(s) sur ' + d.testes + ' testée(s)'
      + (res.auth ? ' · ' + res.auth + ' refus d\'accès' : '')
      + (res.erreur ? ' · ' + res.erreur + ' en erreur' : '')
      + (res.timeout ? ' · ' + res.timeout + ' hors délai' : '');
  bloc.appendChild(t);

  const dt = document.createElement('div');
  dt.className = 'inf-bandeau-detail';
  dt.textContent = d.base + ' via « ' + d.connexion + ' » — '
    + d.testablesTotal + ' opération(s) testables sur ' + d.candidats + ' GET, '
    + d.ecartesTotal + ' écartée(s) faute de valeurs'
    + (d.contexte && d.contexte.length ? ' — contexte : ' + d.contexte.join(', ') : ' — aucun contexte de test défini') + '.';
  bloc.appendChild(dt);
  // Quelles valeurs ajouter pour débloquer, et combien d'opérations chacune
  // débloque. Sans ça, « 24 écartées » est une impasse.
  if (d.aAjouter && d.aAjouter.length) {
    const sug = document.createElement('div');
    sug.className = 'inf-bandeau-detail';
    sug.textContent = 'À ajouter au contexte pour aller plus loin : '
      + d.aAjouter.map(function (x) { return x.nom + ' (' + x.operations + ')'; }).join(' · ');
    bloc.appendChild(sug);
  }

  bandeau.appendChild(bloc);
  hote.appendChild(bandeau);

  d.resultats.forEach(function (x) {
    const l = document.createElement('div');
    l.className = 'inf-res';

    const e = document.createElement('span');
    e.className = 'inf-res-etat';
    e.dataset.etat = x.status;
    e.textContent = { ok: '✅ ok', auth_error: '⚠️ refusé', error: '❌ erreur', timeout: '⏱ délai' }[x.status] || x.status;
    l.appendChild(e);

    const c = document.createElement('span');
    c.className = 'inf-res-note';
    c.textContent = x.statusCode == null ? '—' : String(x.statusCode);
    l.appendChild(c);

    const ms = document.createElement('span');
    ms.className = 'inf-res-note';
    ms.textContent = x.responseMs + ' ms';
    l.appendChild(ms);

    const p = document.createElement('span');
    p.className = 'inf-res-chemin';
    p.textContent = (x.appele || x.path) + (x.count != null ? '  · ' + x.count + ' élément(s)' : '');
    if (x.exemples && x.exemples.length) {
      const e2 = document.createElement('span');
      e2.className = 'inf-res-exemple';
      e2.textContent = '  ⚑ valeur d\'exemple : ' + x.exemples.join(', ');
      p.appendChild(e2);
    }
    l.appendChild(p);

    hote.appendChild(l);
  });
}

// ── Exports ──────────────────────────────────────────────────
function exporterJson() {
  // Passe par le serveur : il détient la spec entière, le navigateur n'en a
  // que la liste des opérations.
  window.location.href = '/api/specs/' + specCourante.id + '/export';
}

// Document imprimable : toutes les opérations, pas seulement celles affichées.
async function exporterHtml() {
  const btn = $('inf-btn-export-html');
  btn.disabled = true;
  try {
    const d = await (await fetch('/api/specs/' + specCourante.id + '/endpoints?limit=1000')).json();
    const w = window.open('', '_blank');
    if (!w) { message('❌ La fenêtre a été bloquée par le navigateur.', 'error'); return; }

    const doc = w.document;
    doc.title = specCourante.name + ' — opérations';
    const style = doc.createElement('style');
    style.textContent = 'body{font-family:system-ui,sans-serif;margin:24px;color:#111}'
      + 'h1{font-size:18px;margin:0 0 4px}.meta{color:#666;font-size:12px;margin-bottom:18px}'
      + 'table{border-collapse:collapse;width:100%;font-size:11.5px}'
      + 'th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}'
      + 'th{background:#f4f4f4}td.m{font-family:ui-monospace,Menlo,monospace;white-space:nowrap}'
      + '@media print{body{margin:8mm}thead{display:table-header-group}}';
    doc.head.appendChild(style);

    const h = doc.createElement('h1');
    h.textContent = specCourante.name;
    doc.body.appendChild(h);

    const meta = doc.createElement('div');
    meta.className = 'meta';
    meta.textContent = (specCourante.format || '') + ' ' + (specCourante.version || '')
      + ' — ' + d.total + ' opérations — base ' + (specCourante.baseUrl || '—')
      + ' — édité le ' + new Date().toLocaleString('fr-FR');
    doc.body.appendChild(meta);

    const tbl = doc.createElement('table');
    const thead = doc.createElement('thead');
    const tr = doc.createElement('tr');
    ['Méthode', 'Chemin', 'Résumé'].forEach(function (x) {
      const th = doc.createElement('th'); th.textContent = x; tr.appendChild(th);
    });
    thead.appendChild(tr); tbl.appendChild(thead);

    const tb = doc.createElement('tbody');
    d.endpoints.forEach(function (op) {
      const r = doc.createElement('tr');
      const a = doc.createElement('td'); a.className = 'm'; a.textContent = op.method;
      const b = doc.createElement('td'); b.className = 'm'; b.textContent = op.path;
      const c = doc.createElement('td'); c.textContent = (op.summary && op.summary.fr) || '';
      r.appendChild(a); r.appendChild(b); r.appendChild(c);
      tb.appendChild(r);
    });
    tbl.appendChild(tb);
    doc.body.appendChild(tbl);
    w.focus();
  } catch (e) {
    message('❌ ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
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
$('inf-btn-test').onclick          = function () { tester(false); };
$('inf-btn-test-retenues').onclick = function () { tester(true); };
$('inf-btn-ctx-ajout').onclick   = function () { $('inf-ctx-lignes').appendChild(ligneContexte('', '')); };
$('inf-btn-ctx-save').onclick    = enregistrerContexte;
$('inf-btn-export-json').onclick = exporterJson;
$('inf-btn-export-html').onclick = exporterHtml;
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
