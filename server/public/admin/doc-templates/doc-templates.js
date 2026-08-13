// APS — admin/doc-templates/doc-templates.js — 2026-08-13
//
// Écran des gabarits de document (DocTemplate). Pendant de doc-assets : là où
// une ressource graphique dit à quoi un document ressemble, un gabarit dit ce
// qu'il DÉCRIT.
//
// POURQUOI IL COMPLÈTE L'AUTRE. `DocTemplate.brandAssetId` est le lien qui
// remplace les chartes écrites en dur dans les exports de WFD. Tant qu'aucun
// écran ne pouvait le poser, la charte était corrigeable mais rattachable à
// rien — la moitié du mécanisme. C'est ce champ qui justifie cet écran plus
// que le reste.
//
// LA PORTÉE EST LA VRAIE DÉCISION DE CET ÉCRAN. Un gabarit sans organisation
// est visible de toutes ; un gabarit d'organisation n'est visible que d'elle.
// Le corriger n'engage donc pas les mêmes gens, et c'est pour ça que la case
// est encadrée, expliquée en toutes lettres, et que la liste le marque.
//
// Discipline du dépôt : aucun style inline, aucun basculement d'apparence
// depuis JS, DOM construit par création d'éléments.
(function () {
  'use strict';

  const API       = '/api/doc-templates';
  const API_ASSET = '/api/doc-assets';
  const API_PLAT  = '/api/platforms';

  const RENDUS = ['docx', 'pptx', 'xlsx', 'pdf', 'html', 'mermaid'];

  let liste       = [];
  let ressources  = [];
  let plateformes = [];
  let courant     = null;

  let elListe, elEditeur, elVide, elNom, elRendu, elPlat, elBrand,
      elPartage, elPorteeNote, elContent, elContentEtat, elFeedback, elSupprimer;

  function dire(texte, ton) {
    elFeedback.textContent = texte || '';
    if (ton) elFeedback.setAttribute('data-ton', ton);
    else     elFeedback.removeAttribute('data-ton');
  }

  // ── Chargement ─────────────────────────────────────────────────
  async function charger() {
    try {
      const [rT, rA, rP] = await Promise.all([fetch(API), fetch(API_ASSET), fetch(API_PLAT)]);
      if (!rT.ok) throw new Error('HTTP ' + rT.status);
      liste = await rT.json();
      // Ni les ressources ni les plateformes ne sont indispensables pour
      // éditer un nom : leur absence ne doit pas vider l'écran.
      ressources  = rA.ok ? await rA.json() : [];
      const p     = rP.ok ? await rP.json() : [];
      plateformes = Array.isArray(p) ? p : (p.items || []);
      remplirSelects();
      rendreListe();
    } catch (e) {
      liste = [];
      rendreListe();
      dire('Chargement impossible : ' + e.message, 'erreur');
    }
  }

  function optionsDe(select, items, libelle, vide) {
    select.textContent = '';
    const aucun = document.createElement('option');
    aucun.value = '';
    aucun.textContent = vide;
    select.appendChild(aucun);
    items.forEach(function (it) {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = libelle(it);
      select.appendChild(o);
    });
  }

  function remplirSelects() {
    optionsDe(elPlat, plateformes, function (p) { return p.name; },
      '— aucune : ne décrit aucun outil');
    optionsDe(elBrand, ressources, function (a) { return a.name + '  (' + a.type + ')'; },
      '— aucune : rendu par défaut');
  }

  function rendreListe() {
    elListe.textContent = '';
    if (!liste.length) {
      const vide = document.createElement('div');
      vide.className = 'da-liste-vide';
      vide.textContent = 'Aucun gabarit.';
      elListe.appendChild(vide);
      return;
    }
    liste.forEach(function (t) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'da-liste-item';
      if (courant && courant.id === t.id) item.classList.add('da-liste-item-actif');

      const nom = document.createElement('div');
      nom.className = 'da-liste-nom';
      nom.textContent = t.name;
      item.appendChild(nom);

      const ligne = document.createElement('div');
      ligne.className = 'dt-liste-ligne';
      const portee = document.createElement('span');
      portee.className = t.partage ? 'dt-marque-partage' : 'dt-marque-org';
      portee.textContent = t.partage ? 'partagé' : 'org';
      ligne.appendChild(portee);
      const rendu = document.createElement('span');
      rendu.className = 'da-liste-meta';
      rendu.textContent = t.renderer || '';
      ligne.appendChild(rendu);
      item.appendChild(ligne);

      item.addEventListener('click', function () { editer(t); });
      elListe.appendChild(item);
    });
  }

  // ── Édition ────────────────────────────────────────────────────
  function editer(t) {
    courant = t;
    elNom.value     = t.name || '';
    elRendu.value   = RENDUS.indexOf(t.renderer) !== -1 ? t.renderer : 'docx';
    elPlat.value    = t.platformId || '';
    elBrand.value   = t.brandAssetId || '';
    elPartage.checked = !!t.partage;
    elContent.value = t.content ? JSON.stringify(t.content, null, 2) : '';
    // La portée d'un gabarit EXISTANT ne se change pas ici : la route ne le
    // permet pas (PUT ne touche pas à orgId), et faire croire le contraire par
    // une case active serait un mensonge d'interface. On la fige en le disant.
    elPartage.disabled = !!t.id;
    validerContent();
    majPorteeNote();
    elSupprimer.hidden = !t.id;
    elEditeur.hidden = false;
    elVide.hidden = true;
    dire('');
    rendreListe();
  }

  function nouveau() {
    editer({ id: null, name: '', renderer: 'docx', platformId: '', brandAssetId: '',
             partage: false, content: null });
    elNom.focus();
  }

  function majPorteeNote() {
    if (courant && courant.id) {
      elPorteeNote.textContent = elPartage.checked
        ? 'Ce gabarit est partagé : le corriger touche toutes les organisations. '
          + 'La portée se fixe à la création et ne se change plus ici.'
        : 'Ce gabarit appartient à l\'organisation courante. La portée se fixe à '
          + 'la création et ne se change plus ici.';
      return;
    }
    elPorteeNote.textContent = elPartage.checked
      ? 'Il ira dans la bibliothèque commune, visible de toutes les organisations.'
      : 'Il appartiendra à l\'organisation courante, et ne sera visible que d\'elle. '
        + 'C\'est le défaut : on ne verse pas dans le commun sans le dire.';
  }

  // ── `content` : libre, mais valide ─────────────────────────────
  function validerContent() {
    const brut = elContent.value.trim();
    if (!brut) {
      elContent.removeAttribute('data-invalide');
      elContentEtat.textContent = 'vide';
      elContentEtat.removeAttribute('data-ton');
      return { ok: true, valeur: {} };
    }
    try {
      const v = JSON.parse(brut);
      elContent.removeAttribute('data-invalide');
      // `owners` est le seul champ déjà lu par le Doc Builder : on le dit
      // plutôt que de laisser croire que tout le JSON est interprété.
      const proprios = Array.isArray(v && v.owners) ? v.owners : null;
      elContentEtat.textContent = proprios
        ? 'JSON valide — visible par : ' + (proprios.length ? proprios.join(', ') : 'aucun owner')
        : 'JSON valide — sans `owners`, seul Transverse le verra';
      elContentEtat.removeAttribute('data-ton');
      return { ok: true, valeur: v };
    } catch (e) {
      elContent.setAttribute('data-invalide', '1');
      elContentEtat.textContent = 'JSON invalide — ' + e.message;
      elContentEtat.setAttribute('data-ton', 'erreur');
      return { ok: false, valeur: null };
    }
  }

  // ── Enregistrer / supprimer ────────────────────────────────────
  async function enregistrer() {
    if (!courant) return;
    const nom = elNom.value.trim();
    if (!nom) { dire('Le nom est requis.', 'erreur'); elNom.focus(); return; }
    const contenu = validerContent();
    if (!contenu.ok) { dire('Corrigez le JSON du contenu avant d\'enregistrer.', 'erreur'); return; }

    const corps = {
      name: nom,
      renderer: elRendu.value,
      platformId: elPlat.value || null,
      brandAssetId: elBrand.value || null,
      content: contenu.valeur,
    };
    if (!courant.id) corps.partage = elPartage.checked;

    try {
      const r = courant.id
        ? await fetch(API + '/' + courant.id, { method: 'PUT',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
        : await fetch(API, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const rep = await r.json();
      if (!r.ok) throw new Error(rep.error || ('HTTP ' + r.status));
      await charger();
      editer(liste.find(function (t) { return t.id === rep.id; }) || rep);
      dire('Enregistré.', 'ok');
    } catch (e) {
      dire('Enregistrement impossible : ' + e.message, 'erreur');
    }
  }

  async function supprimer() {
    if (!courant || !courant.id) return;
    const avertissement = courant.partage
      ? 'Ce gabarit est PARTAGÉ : le supprimer le retire de toutes les organisations.\n\n'
      : '';
    if (!window.confirm(avertissement + 'Supprimer « ' + courant.name + ' » ?')) return;
    try {
      const r = await fetch(API + '/' + courant.id, { method: 'DELETE' });
      const rep = await r.json();
      if (!r.ok) throw new Error(rep.error || ('HTTP ' + r.status));
      courant = null;
      elEditeur.hidden = true;
      elVide.hidden = false;
      await charger();
    } catch (e) {
      dire('Suppression impossible : ' + e.message, 'erreur');
    }
  }

  // ── Démarrage ──────────────────────────────────────────────────
  function init() {
    elListe       = document.getElementById('da-liste-items');
    elEditeur     = document.getElementById('da-editeur');
    elVide        = document.getElementById('da-vide');
    elNom         = document.getElementById('dt-nom');
    elRendu       = document.getElementById('dt-renderer');
    elPlat        = document.getElementById('dt-platform');
    elBrand       = document.getElementById('dt-brand');
    elPartage     = document.getElementById('dt-partage');
    elPorteeNote  = document.getElementById('dt-portee-note');
    elContent     = document.getElementById('dt-content');
    elContentEtat = document.getElementById('dt-content-etat');
    elFeedback    = document.getElementById('da-feedback');
    elSupprimer   = document.getElementById('da-supprimer');

    document.getElementById('da-nouveau').addEventListener('click', nouveau);
    document.getElementById('da-enregistrer').addEventListener('click', enregistrer);
    elSupprimer.addEventListener('click', supprimer);
    elContent.addEventListener('input', validerContent);
    elPartage.addEventListener('change', majPorteeNote);

    charger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
