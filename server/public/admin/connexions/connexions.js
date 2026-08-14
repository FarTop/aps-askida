// APS — admin/connexions/connexions.js — 2026-06-23

const API = '/api/connexions';
let connexions = [];
let editingId  = null;

// ── Chargement ───────────────────────────────────────────────
async function charger() {
  try {
    const r = await fetch(API);
    connexions = await r.json();
    afficher(connexions);
  } catch(e) {
    document.getElementById('conn-list').innerHTML =
      `<div class="adm-error">Erreur de chargement : ${e.message}</div>`;
  }
}

// ── Affichage liste ──────────────────────────────────────────
function afficher(list) {
  const el = document.getElementById('conn-list');
  if (!list.length) {
    el.innerHTML = '<div class="adm-empty">Aucune connexion. Cliquez sur "+ Nouvelle connexion" pour commencer.</div>';
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="conn-card ${c.isActive ? '' : 'inactive'}" data-id="${c.id}">
      <div class="conn-card-left">
        <div class="conn-icon">${typeIcon(c.type)}</div>
        <div class="conn-info">
          <div class="conn-name">${escHtml(c.name)}</div>
          <div class="conn-meta">
            <span class="badge badge-type">${c.type}</span>
            <span class="badge badge-dir ${c.direction}">${c.direction === 'outbound' ? 'Sortante' : 'Entrante'}</span>
            ${c.endpoint ? `<span class="conn-url">${escHtml(c.endpoint)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="conn-card-right">
        <span class="conn-status ${c.isActive ? 'active' : 'inactive'}">${c.isActive ? '● Actif' : '○ Inactif'}</span>
        <button class="btn-icon" onclick="editer('${c.id}')" title="Éditer">✏️</button>
        <button class="btn-icon danger" onclick="supprimer('${c.id}', '${escHtml(c.name)}')" title="Supprimer">🗑</button>
      </div>
    </div>
  `).join('');
}

function typeIcon(type) {
  return { iconik: '🎬', aws_s3: '☁️', http: '🌐', mcp: '🧩', listener: '👂' }[type] || '🔌';
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Filtres ──────────────────────────────────────────────────
function filtrer() {
  const q    = document.getElementById('search').value.toLowerCase();
  const type = document.getElementById('filter-type').value;
  const dir  = document.getElementById('filter-dir').value;
  afficher(connexions.filter(c =>
    (!q    || c.name.toLowerCase().includes(q) || (c.endpoint||'').toLowerCase().includes(q)) &&
    (!type || c.type === type) &&
    (!dir  || c.direction === dir)
  ));
}

// ── Panneau latéral ──────────────────────────────────────────
function ouvrirPanel(conn = null) {
  editingId = conn?.id || null;
  document.getElementById('panel-title').textContent = conn ? 'Éditer la connexion' : 'Nouvelle connexion';

  // Remplir les champs
  document.getElementById('f-name').value        = conn?.name        || '';
  document.getElementById('f-type').value        = conn?.type        || 'iconik';
  document.getElementById('f-direction').value   = conn?.direction   || 'outbound';
  document.getElementById('f-baseurl').value     = conn?.endpoint    || '';
  document.getElementById('f-authtype').value    = conn?.authType    || '';
  document.getElementById('f-authvalue').value   = conn?.authValue   || '';
  // Pré-remplir les champs AWS si type aws_s3
  if (conn?.type === 'aws_s3') {
    try {
      const aws = JSON.parse(conn.authValue || '{}');
      document.getElementById('f-aws-key').value    = aws.key    || '';
      document.getElementById('f-aws-secret').value = aws.secret || '';
      document.getElementById('f-aws-region').value = aws.region || '';
      document.getElementById('f-aws-bucket').value = aws.bucket || '';
    } catch(_) {}
  } else {
    document.getElementById('f-aws-key').value    = '';
    document.getElementById('f-aws-secret').value = '';
    document.getElementById('f-aws-region').value = '';
    document.getElementById('f-aws-bucket').value = '';
  }
  document.getElementById('f-description').value = conn?.description || '';
  document.getElementById('f-active').checked    = conn?.isActive !== false;

  document.getElementById('f-platform').value = conn?.platformId || '';
  rendreChampsPlateforme({ champs: conn?.champs || {}, secret: conn?.authValue || '' });

  onTypeChange();
  onAuthChange();

  document.getElementById('btn-test').dataset.visible = editingId ? '1' : '0';
  afficherResultatTest('', '');

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  document.getElementById('f-name').focus();
}

function fermerPanel() {
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  editingId = null;
}

function editer(id) {
  const conn = connexions.find(c => c.id === id);
  if (conn) ouvrirPanel(conn);
}

// ── Outil (Infrastructure) ───────────────────────────────────
// Une plateforme peut déclarer COMMENT elle s'authentifie et comment son URL
// se forme (Platform.authSpec). Le schéma appartient au produit, le secret à
// la connexion — c'est ce partage qui évite d'allonger la liste fermée des
// types d'authentification à chaque nouvel outil.
let plateformes = [];

async function chargerPlateformes() {
  try {
    const r = await fetch('/api/platforms');
    plateformes = await r.json();
  } catch (_) { plateformes = []; }
  const sel = document.getElementById('f-platform');
  plateformes.forEach(function (p) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = (p.icon ? p.icon + ' ' : '') + p.name + (p.authSpec ? '' : ' (sans schéma)');
    sel.appendChild(o);
  });
}

function plateformeChoisie() {
  const id = document.getElementById('f-platform').value;
  return plateformes.find(function (p) { return p.id === id; }) || null;
}

// Rend les champs déclarés par le schéma. `valeurs` pré-remplit en édition :
// les non-secrets viennent de `champs`, le secret de `authValue`.
function rendreChampsPlateforme(valeurs) {
  const hote  = document.getElementById('fields-plateforme');
  const aide  = document.getElementById('platform-aide');
  const panel = document.getElementById('side-panel');
  while (hote.firstChild) hote.removeChild(hote.firstChild);

  const p    = plateformeChoisie();
  const spec = p && p.authSpec;
  if (!spec) {
    hote.dataset.visible = '0';
    panel.removeAttribute('data-mode');
    aide.textContent = p ? 'Cet outil ne déclare pas encore de schéma — renseignez l\'authentification à la main.' : '';
    return;
  }

  panel.dataset.mode = 'plateforme';
  hote.dataset.visible = '1';
  aide.textContent = spec.baseUrlPattern
    ? 'URL de base déduite : ' + spec.baseUrlPattern + ' — laissez le champ URL vide pour l\'utiliser.'
    : '';
  // Le champ URL gardait le repère « https://app.iconik.io » quel que soit
  // l'outil choisi, ce qui désignait la mauvaise plateforme.
  const url = document.getElementById('f-baseurl');
  if (url && spec.baseUrlPattern) url.placeholder = spec.baseUrlPattern;

  (spec.fields || []).forEach(function (f) {
    const bloc = document.createElement('div');
    bloc.className = 'field';

    const lab = document.createElement('label');
    lab.textContent = (f.label || f.name) + (f.required ? ' *' : '');
    bloc.appendChild(lab);

    const inp = document.createElement('input');
    inp.type = f.secret ? 'password' : 'text';
    inp.id = 'f-spec-' + f.name;
    inp.dataset.champ = f.name;
    if (f.secret) inp.dataset.secret = '1';
    inp.placeholder = f.help || '';
    inp.value = f.secret ? ((valeurs && valeurs.secret) || '')
                         : (((valeurs && valeurs.champs) || {})[f.name] || '');
    if (f.secret) {
      // Même bouton que sur le champ fixe : un secret déclaré par un schéma se
      // récupère aussi mal que l'autre, et c'est là que vivent les jetons des
      // plateformes qui en déclarent un.
      const ligne = document.createElement('div');
      ligne.className = 'champ-secret';
      const cop = document.createElement('button');
      cop.type = 'button';
      cop.className = 'btn-copier';
      cop.dataset.etat = '';
      cop.title = 'Copier la valeur dans le presse-papiers';
      cop.textContent = '📋';
      cop.addEventListener('click', function () { copierSecret(inp.id, cop); });
      ligne.appendChild(inp);
      ligne.appendChild(cop);
      bloc.appendChild(ligne);
    } else {
      bloc.appendChild(inp);
    }

    if (f.help) {
      const h = document.createElement('div');
      h.className = 'field-aide';
      h.textContent = f.help;
      bloc.appendChild(h);
    }
    hote.appendChild(bloc);
  });
}

// Ce que le formulaire renvoie quand un schéma pilote la saisie.
function valeursDesChampsPlateforme() {
  const champs = {};
  let secret = null;
  document.querySelectorAll('#fields-plateforme input[data-champ]').forEach(function (inp) {
    if (inp.dataset.secret === '1') secret = inp.value;
    else champs[inp.dataset.champ] = inp.value.trim();
  });
  return { champs: champs, secret: secret };
}

// ── Changements de type/auth ─────────────────────────────────
// Quand un schéma de plateforme pilote le formulaire, ces deux fonctions ne
// doivent RIEN afficher : leurs champs feraient doublon avec ceux du schéma.
// Elles posaient un `style.display` en ligne, qui l'emporte sur la feuille de
// style — d'où l'ancien champ « Auth Token » resté visible sous les champs de
// Make. On efface l'inline et on laisse le CSS décider (convention du dépôt :
// la visibilité se pilote par data-*, pas par style.display).
function modePlateforme() {
  return document.getElementById('side-panel').dataset.mode === 'plateforme';
}

function libererInline(ids) {
  ids.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.removeProperty('display');
  });
}

function onTypeChange() {
  if (modePlateforme()) { libererInline(['fields-iconik', 'fields-aws']); return; }
  const type = document.getElementById('f-type').value;
  document.getElementById('fields-iconik').style.display = type === 'iconik'  ? 'block' : 'none';
  document.getElementById('fields-aws').style.display    = type === 'aws_s3'  ? 'block' : 'none';
  if (type === 'iconik')  document.getElementById('f-authtype').value = 'iconik';
  if (type === 'aws_s3')  document.getElementById('f-authtype').value = 'aws_s3';
  onAuthChange();
}

function onAuthChange() {
  if (modePlateforme()) { libererInline(['field-authvalue', 'field-authtype']); return; }
  const auth = document.getElementById('f-authtype').value;
  const show = ['bearer', 'apikey_header', 'iconik'].includes(auth);
  document.getElementById('field-authvalue').style.display = show ? 'flex' : 'none';
  const labels = { bearer: 'Bearer Token', apikey_header: 'API Key', iconik: 'Auth Token' };
  document.getElementById('authvalue-label').textContent = labels[auth] || 'Token';
}

function toggleReveal() {
  const inp = document.getElementById('f-authvalue');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── Copier un secret ─────────────────────────────────────────
// APS chiffre ces valeurs et ne les rendait lisibles nulle part : monter une
// connexion EventBridge le 2026-08-13 a demandé de passer par la console du
// navigateur pour récupérer un jeton qu'APS avait sous la main. Le champ était
// masqué, la sélection impossible. Un bouton coûte moins cher que ce détour, et
// il se reproduira à chaque plateforme cliente.
//
// Le retour se dit par `data-etat`, lu par le CSS — pas en touchant à
// l'apparence depuis ici.
async function copierSecret(idChamp, bouton) {
  const inp = document.getElementById(idChamp);
  if (!inp || !inp.value) return marquerCopie(bouton, 'vide');
  try {
    await navigator.clipboard.writeText(inp.value);
    marquerCopie(bouton, 'ok');
  } catch (_) {
    // Presse-papiers refusé (contexte non sécurisé, permission) : on démasque
    // et on sélectionne, l'opérateur finit au clavier. Un bouton qui échoue en
    // silence est pire que pas de bouton.
    const masque = inp.type === 'password';
    inp.type = 'text';
    inp.select();
    if (masque) setTimeout(function () { inp.type = 'password'; }, 5000);
    marquerCopie(bouton, 'manuel');
  }
}

function marquerCopie(bouton, etat) {
  if (!bouton) return;
  bouton.dataset.etat = etat;
  setTimeout(function () { bouton.dataset.etat = ''; }, 2500);
}

// ── Test de connexion ────────────────────────────────────────
// La route existe depuis longtemps (POST /api/connexions/:id/test) et n'était
// appelée par rien. Elle valide la CONNEXION — joignabilité + poignée de main
// d'authentification — pas un endpoint précis.
function afficherResultatTest(texte, etat) {
  const el = document.getElementById('test-resultat');
  el.textContent = texte;
  el.dataset.etat = etat || '';
}

async function tester() {
  if (!editingId) return;
  const btn = document.getElementById('btn-test');
  btn.disabled = true;
  afficherResultatTest('Test en cours…', 'attente');
  try {
    const r = await fetch(`${API}/${editingId}/test`, { method: 'POST' });
    const d = await r.json();
    // Trois issues distinctes, à ne pas confondre : joignable et authentifié,
    // joignable mais refusé (souvent une portée de jeton), injoignable.
    const etat = d.state === 'ok' ? 'ok'
               : d.state === 'auth' ? 'auth'
               : d.state === 'untestable' ? 'attente'
               : 'error';
    const prefixe = { ok: '✅ ', auth: '⚠️ ', attente: 'ℹ️ ', error: '❌ ' }[etat] || '';
    afficherResultatTest(prefixe + (d.message || 'Réponse sans message'), etat);
  } catch (e) {
    afficherResultatTest('❌ ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ── Sauvegarde ───────────────────────────────────────────────
async function sauvegarder() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { alert('Le nom est obligatoire'); return; }

  const spec  = plateformeChoisie() && plateformeChoisie().authSpec;
  const saisi = spec ? valeursDesChampsPlateforme() : null;

  const payload = {
    name,
    platformId:  document.getElementById('f-platform').value || null,
    ...(saisi ? { champs: saisi.champs } : {}),
    type:        document.getElementById('f-type').value,
    direction:   document.getElementById('f-direction').value,
    endpoint:    document.getElementById('f-baseurl').value.trim(),
    authType: (function () {
      // Quand la plateforme déclare la NATURE de son authentification, elle
      // fait foi. Le menu est masqué en mode plateforme : en lire la valeur
      // revenait à réécrire ce que la page portait au chargement, si bien qu'un
      // onglet resté ouvert ramenait une valeur périmée à chaque sauvegarde
      // (constaté le 2026-08-14 — la fiche Step Functions repassait en aws_s3).
      //
      // Seuls les `kind` qui SONT des valeurs d'authType comptent : `headers`,
      // déclaré par Make, Iconik et VOD Factory, décrit une mécanique d'en-têtes
      // dont l'authType réel varie (iconik, bearer…) — on laisse le menu.
      const kind = spec && spec.auth && spec.auth.kind;
      if (['aws_sigv4', 'bearer', 'apikey_header', 'iconik'].indexOf(kind) !== -1) return kind;
      return document.getElementById('f-authtype').value;
    })(),
    authValue: (function() {
      // Un schéma déclaré l'emporte, TOUJOURS et en premier. L'ordre inverse a
      // coûté un piège le 2026-08-14 : sur une fiche à authSpec (Step Functions),
      // passer le Type sur « AWS S3 » faisait lire les champs S3 hérités, vides
      // et masqués dans ce mode — le secret saisi partait à la poubelle, et
      // comme '' vaut « ne touche à rien » côté serveur, l'ancien restait. Le
      // champ ne se modifiait plus, sans un mot d'explication.
      if (saisi && saisi.secret !== null) return saisi.secret;
      const type = document.getElementById('f-type').value;
      if (type === 'aws_s3') {
        const key    = document.getElementById('f-aws-key').value.trim();
        const secret = document.getElementById('f-aws-secret').value.trim();
        const region = document.getElementById('f-aws-region').value.trim();
        const bucket = document.getElementById('f-aws-bucket').value.trim();
        if (key || secret) return JSON.stringify({ key, secret, region, bucket });
        return '';
      }
      return document.getElementById('f-authvalue').value;
    })(),
    description: document.getElementById('f-description').value,
    isActive:    document.getElementById('f-active').checked,
  };

  const btn = document.getElementById('btn-save');
  btn.textContent = '⏳'; btn.disabled = true;

  try {
    const url    = editingId ? `${API}/${editingId}` : API;
    const method = editingId ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    fermerPanel();
    await charger();
  } catch(e) {
    alert('Erreur : ' + e.message);
  } finally {
    btn.textContent = '✓ Sauvegarder'; btn.disabled = false;
  }
}

// ── Suppression ──────────────────────────────────────────────
async function supprimer(id, name) {
  if (!confirm(`Supprimer la connexion "${name}" ?`)) return;
  try {
    const r = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    await charger();
  } catch(e) {
    alert('Erreur : ' + e.message);
  }
}

// ── Events ───────────────────────────────────────────────────
document.getElementById('btn-new').onclick        = () => ouvrirPanel();
document.getElementById('btn-close-panel').onclick = fermerPanel;
document.getElementById('btn-cancel').onclick      = fermerPanel;
document.getElementById('btn-save').onclick        = sauvegarder;
document.getElementById('btn-test').onclick        = tester;
document.getElementById('overlay').onclick         = fermerPanel;
document.getElementById('search').oninput          = filtrer;
document.getElementById('filter-type').onchange    = filtrer;
document.getElementById('filter-dir').onchange     = filtrer;
document.getElementById('f-platform').onchange     = function () {
  rendreChampsPlateforme(null);
  // Repasser de « Make » à « aucun outil » doit rendre au formulaire ses
  // champs d'origine : c'est onTypeChange/onAuthChange qui les repositionnent.
  onTypeChange();
  onAuthChange();
};

// ── Boot ─────────────────────────────────────────────────────
// Les plateformes AVANT les connexions : ouvrir une connexion existante doit
// pouvoir retrouver son outil dans une liste déjà peuplée.
chargerPlateformes().then(charger);
