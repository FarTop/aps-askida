// APS — admin/utilisateurs/utilisateurs.js — 2026-08-13
//
// Écran des GROUPES et des COMPTES. Deux onglets, un seul écran : on passe son
// temps à aller de l'un à l'autre — on coche les outils d'un groupe en
// regardant qui est dedans, on ajoute quelqu'un à un groupe en regardant ce
// qu'il ouvre.
//
// CE QUE CET ÉCRAN MONTRE ET QU'AUCUNE ROUTE NE DIT : ce dont une personne
// HÉRITE. Ses organisations et ses outils ne sont écrits nulle part — ils sont
// l'union de ceux de ses groupes. Un administrateur qui coche « Admin » sans
// voir ce que ça ouvre coche à l'aveugle ; la ligne d'héritage est donc
// recalculée à chaque case cochée, avant d'enregistrer.
//
// Discipline du dépôt : aucun style inline, aucun basculement d'apparence
// depuis JS, DOM construit par création d'éléments.
(function () {
  'use strict';

  const API_G = '/api/groupes';
  const API_U = '/api/utilisateurs';

  let onglet     = 'groupes';   // 'groupes' | 'comptes'
  let groupes    = [];
  let comptes    = [];
  let orgs       = [];
  let outils     = [];
  let courant    = null;        // l'élément édité ; { id: null } = création

  let elListe, elVide, elEdG, elEdC;

  function $(id) { return document.getElementById(id); }

  function dire(champ, texte, ton) {
    const el = $(champ);
    el.textContent = texte || '';
    if (ton) el.setAttribute('data-ton', ton); else el.removeAttribute('data-ton');
  }

  async function api(chemin, options) {
    const r = await fetch(chemin, Object.assign(
      { headers: { 'Content-Type': 'application/json' } }, options || {}));
    let corps = null;
    try { corps = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((corps && corps.error) || ('HTTP ' + r.status));
    return corps;
  }

  // ── Chargement ─────────────────────────────────────────────────
  async function charger() {
    try {
      const [g, u, o, c] = await Promise.all([
        api(API_G), api(API_U), fetch('/api/organisations').then(r => r.json()),
        api(API_G + '/outils'),
      ]);
      groupes = g;
      comptes = u;
      orgs    = Array.isArray(o) ? o : (o.items || []);
      outils  = c;
      rendreListe();
    } catch (e) {
      dire('da-feedback', 'Chargement impossible : ' + e.message, 'erreur');
    }
  }

  function rendreListe() {
    elListe.textContent = '';
    const items = onglet === 'groupes' ? groupes : comptes;
    if (!items.length) {
      const vide = document.createElement('div');
      vide.className = 'da-liste-vide';
      vide.textContent = onglet === 'groupes' ? 'Aucun groupe.' : 'Aucun compte.';
      elListe.appendChild(vide);
      return;
    }
    items.forEach(function (it) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'da-liste-item';
      if (courant && courant.id === it.id) item.classList.add('da-liste-item-actif');

      const nom = document.createElement('div');
      nom.className = 'da-liste-nom';
      nom.textContent = onglet === 'groupes' ? it.nom : it.name;
      item.appendChild(nom);

      const ligne = document.createElement('div');
      ligne.className = 'ut-liste-ligne';
      if (onglet === 'groupes') {
        if (it.systeme) ligne.appendChild(marque('système', 'systeme'));
        const meta = document.createElement('span');
        meta.className = 'da-liste-meta';
        meta.textContent = it.membres.length + ' membre(s) · ' + it.outils.length + ' outil(s)';
        ligne.appendChild(meta);
      } else {
        if (it.etat !== 'active') {
          ligne.appendChild(marque(it.etat === 'expire' ? 'expiré' : 'invité', it.etat));
        }
        const meta = document.createElement('span');
        meta.className = 'da-liste-meta';
        meta.textContent = it.email;
        ligne.appendChild(meta);
      }
      item.appendChild(ligne);

      item.addEventListener('click', function () {
        onglet === 'groupes' ? editerGroupe(it) : editerCompte(it);
      });
      elListe.appendChild(item);
    });
  }

  function marque(texte, ton) {
    const s = document.createElement('span');
    s.className = 'ut-marque';
    s.setAttribute('data-ton', ton);
    s.textContent = texte;
    return s;
  }

  // ── Cases à cocher ─────────────────────────────────────────────
  function caseACocher(valeur, libelle, aide, coche, surChangement) {
    const l = document.createElement('label');
    l.className = 'ut-case';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.value = valeur;
    c.checked = !!coche;
    if (surChangement) c.addEventListener('change', surChangement);
    l.appendChild(c);
    const t = document.createElement('span');
    t.textContent = libelle;
    l.appendChild(t);
    if (aide) {
      const a = document.createElement('span');
      a.className = 'ut-case-aide';
      a.textContent = aide;
      l.appendChild(a);
    }
    return l;
  }

  function coches(conteneur) {
    return Array.prototype.slice
      .call(conteneur.querySelectorAll('input[type="checkbox"]'))
      .filter(c => c.checked).map(c => c.value);
  }

  // ── Éditeur de GROUPE ──────────────────────────────────────────
  function editerGroupe(g) {
    courant = g;
    $('gr-nom').value  = g.nom || '';
    $('gr-desc').value = g.description || '';
    $('gr-systeme-note').hidden = !g.systeme;
    $('gr-supprimer').hidden = !g.id || g.systeme;

    const ids = (g.organisations || []).map(o => o.id);
    const co = $('gr-orgs');
    co.textContent = '';
    if (!orgs.length) {
      const v = document.createElement('div');
      v.className = 'ut-vide';
      v.textContent = 'Aucune organisation déclarée.';
      co.appendChild(v);
    }
    orgs.forEach(function (o) {
      co.appendChild(caseACocher(o.id, o.name, null, ids.indexOf(o.id) !== -1, majEtatsGroupe));
    });

    const cou = $('gr-outils');
    cou.textContent = '';
    const familles = [];
    outils.forEach(function (o) { if (familles.indexOf(o.famille) === -1) familles.push(o.famille); });
    familles.forEach(function (f) {
      const bloc = document.createElement('div');
      bloc.className = 'ut-famille';
      const t = document.createElement('div');
      t.className = 'ut-famille-titre';
      t.textContent = f;
      bloc.appendChild(t);
      const grille = document.createElement('div');
      grille.className = 'ut-cases';
      outils.filter(o => o.famille === f).forEach(function (o) {
        const l = caseACocher(o.cle, o.nom, o.aide, (g.outils || []).indexOf(o.cle) !== -1, majEtatsGroupe);
        if (o.reserve) {
          const r = document.createElement('span');
          r.className = 'ut-reserve';
          r.textContent = '⚠ réservé';
          l.appendChild(r);
        }
        grille.appendChild(l);
      });
      bloc.appendChild(grille);
      cou.appendChild(bloc);
    });

    const m = $('gr-membres');
    m.textContent = '';
    if (!g.id) {
      m.hidden = true;
    } else {
      m.hidden = false;
      if (!g.membres.length) {
        m.textContent = 'Personne dans ce groupe.';
      } else {
        const tete = document.createElement('strong');
        tete.textContent = g.membres.length + ' membre(s) : ';
        m.appendChild(tete);
        m.appendChild(document.createTextNode(
          g.membres.map(x => x.name + (x.invite ? ' (invité)' : '')).join(', ')));
      }
    }

    majEtatsGroupe();
    elEdG.hidden = false; elEdC.hidden = true; elVide.hidden = true;
    dire('da-feedback', '');
    rendreListe();
  }

  function majEtatsGroupe() {
    const nOrgs = coches($('gr-orgs')).length;
    const nOut  = coches($('gr-outils')).length;
    dire('gr-orgs-etat', nOrgs ? nOrgs + ' cochée(s)' : 'aucune — le groupe ne couvre rien');
    dire('gr-outils-etat', nOut ? nOut + ' coché(s)' : 'aucun — le groupe n\'ouvre rien');
  }

  async function enregistrerGroupe() {
    if (!courant) return;
    const nom = $('gr-nom').value.trim();
    if (!nom) { dire('da-feedback', 'Le nom est requis.', 'erreur'); $('gr-nom').focus(); return; }
    const corps = {
      nom: nom,
      description: $('gr-desc').value.trim(),
      outils: coches($('gr-outils')),
      organisations: coches($('gr-orgs')),
    };
    try {
      const rep = courant.id
        ? await api(API_G + '/' + courant.id, { method: 'PUT', body: JSON.stringify(corps) })
        : await api(API_G, { method: 'POST', body: JSON.stringify(corps) });
      await charger();
      editerGroupe(groupes.find(g => g.id === rep.id) || rep);
      dire('da-feedback', 'Enregistré.', 'ok');
    } catch (e) { dire('da-feedback', e.message, 'erreur'); }
  }

  async function supprimerGroupe() {
    if (!courant || !courant.id) return;
    if (!window.confirm('Supprimer le groupe « ' + courant.nom + ' » ?')) return;
    try {
      await api(API_G + '/' + courant.id, { method: 'DELETE' });
      courant = null; elEdG.hidden = true; elVide.hidden = false;
      await charger();
    } catch (e) { dire('da-feedback', e.message, 'erreur'); }
  }

  // ── Éditeur de COMPTE ──────────────────────────────────────────
  function editerCompte(u) {
    courant = u;
    $('cp-nom').value    = u.name || '';
    $('cp-email').value  = u.email || '';
    // L'adresse identifie le compte et sert de cible au lien : la changer après
    // coup enverrait l'invitation à quelqu'un d'autre. Elle se fixe à la
    // création — la route ne la modifie pas non plus.
    $('cp-email').readOnly = !!u.id;
    $('cp-profil').value = u.profile || 'mixed';
    $('cp-langue').value = u.lang || 'fr';
    $('cp-actif').checked = u.actif !== false;
    $('cp-actif-ligne').hidden = !u.id;
    $('cp-supprimer').hidden = !u.id;

    const ids = (u.groupes || []).map(g => g.id);
    const cg = $('cp-groupes');
    cg.textContent = '';
    groupes.forEach(function (g) {
      cg.appendChild(caseACocher(g.id, g.nom, g.description || null,
        ids.indexOf(g.id) !== -1, majHeritage));
    });

    rendreInvitation(u);
    majHeritage();
    elEdC.hidden = false; elEdG.hidden = true; elVide.hidden = true;
    dire('cp-feedback', '');
    rendreListe();
  }

  // CE DONT LA PERSONNE HÉRITE — l'union de ses groupes. Recalculé à chaque
  // case cochée : c'est la seule façon de savoir ce qu'on est en train de
  // donner avant de l'avoir donné.
  function majHeritage() {
    const choisis = coches($('cp-groupes'));
    dire('cp-groupes-etat', choisis.length ? choisis.length + ' groupe(s)' : 'aucun groupe');
    const lesGroupes = groupes.filter(g => choisis.indexOf(g.id) !== -1);
    const o = {}, t = {};
    lesGroupes.forEach(function (g) {
      (g.organisations || []).forEach(x => { o[x.name || x.id] = true; });
      (g.outils || []).forEach(x => { t[x] = true; });
    });
    const lesOrgs = Object.keys(o), lesOutils = Object.keys(t);
    const note = $('cp-herite');
    if (!lesGroupes.length) {
      note.textContent = 'Sans groupe, cette personne n\'a accès à aucune organisation '
        + 'ni à aucun outil.';
      return;
    }
    const nomsOutils = lesOutils.map(function (c) {
      const def = outils.find(x => x.cle === c);
      return def ? def.nom : c;
    });
    note.textContent = 'Hérite de ' + (lesOrgs.length ? lesOrgs.join(', ') : 'aucune organisation')
      + ' — et de ' + (nomsOutils.length ? nomsOutils.length + ' outil(s) : ' + nomsOutils.join(', ')
                                         : 'aucun outil') + '.';
  }

  function rendreInvitation(u) {
    const bloc = $('cp-invitation');
    if (!u.id) { bloc.hidden = true; return; }
    bloc.hidden = false;
    const etat = $('cp-etat');
    etat.setAttribute('data-etat', u.etat);
    etat.textContent = u.etat === 'active' ? 'activé'
                     : u.etat === 'expire' ? 'invitation expirée' : 'invité';

    dire('cp-expire', u.invitationExpire && u.etat === 'invite'
      ? 'expire le ' + new Date(u.invitationExpire).toLocaleDateString('fr-FR') : '');

    $('cp-lien-ligne').hidden = !u.lienActivation;
    $('cp-lien').value = u.lienActivation || '';

    $('cp-invitation-note').textContent =
      u.etat === 'active'
        ? 'Cette personne a choisi son mot de passe' +
          (u.derniereConnexion ? '.' : ' mais ne s\'est jamais connectée.')
      : u.etat === 'expire'
        ? 'Le lien n\'est plus valable. Régénérez-en un et transmettez-le.'
        : 'Transmettez ce lien par le canal que vous voulez : APS n\'envoie pas '
          + 'd\'e-mail. Il vaut sept jours et ne sert qu\'une fois.';

    $('cp-reinitialiser').hidden = u.etat !== 'active';
    $('cp-inviter').hidden = u.etat === 'active';
  }

  async function enregistrerCompte() {
    if (!courant) return;
    const nom = $('cp-nom').value.trim();
    const mail = $('cp-email').value.trim();
    if (!nom)  { dire('cp-feedback', 'Le nom est requis.', 'erreur'); $('cp-nom').focus(); return; }
    if (!mail) { dire('cp-feedback', 'L\'adresse est requise.', 'erreur'); $('cp-email').focus(); return; }
    try {
      let rep;
      if (courant.id) {
        rep = await api(API_U + '/' + courant.id, { method: 'PUT', body: JSON.stringify({
          name: nom, profile: $('cp-profil').value, lang: $('cp-langue').value,
          actif: $('cp-actif').checked, groupes: coches($('cp-groupes')),
        }) });
      } else {
        rep = await api(API_U, { method: 'POST', body: JSON.stringify({
          name: nom, email: mail, profile: $('cp-profil').value,
          lang: $('cp-langue').value, groupes: coches($('cp-groupes')),
        }) });
      }
      await charger();
      editerCompte(comptes.find(c => c.id === rep.id) || rep);
      dire('cp-feedback', courant && courant.etat === 'invite' && !courant.derniereConnexion
        ? 'Enregistré — le lien d\'invitation est prêt à être transmis.' : 'Enregistré.', 'ok');
    } catch (e) { dire('cp-feedback', e.message, 'erreur'); }
  }

  async function actionCompte(suffixe, question) {
    if (!courant || !courant.id) return;
    if (question && !window.confirm(question)) return;
    try {
      const rep = await api(API_U + '/' + courant.id + '/' + suffixe, { method: 'POST' });
      await charger();
      editerCompte(comptes.find(c => c.id === rep.id) || rep);
      dire('cp-feedback', 'Nouveau lien généré — l\'ancien ne vaut plus.', 'ok');
    } catch (e) { dire('cp-feedback', e.message, 'erreur'); }
  }

  async function supprimerCompte() {
    if (!courant || !courant.id) return;
    if (!window.confirm('Supprimer le compte de « ' + courant.name + ' » ?')) return;
    try {
      await api(API_U + '/' + courant.id, { method: 'DELETE' });
      courant = null; elEdC.hidden = true; elVide.hidden = false;
      await charger();
    } catch (e) { dire('cp-feedback', e.message, 'erreur'); }
  }

  // ── Onglets & démarrage ────────────────────────────────────────
  function versOnglet(nom) {
    onglet = nom;
    courant = null;
    $('ut-tab-groupes').classList.toggle('ut-onglet-actif', nom === 'groupes');
    $('ut-tab-comptes').classList.toggle('ut-onglet-actif', nom === 'comptes');
    $('ut-tab-groupes').setAttribute('aria-selected', String(nom === 'groupes'));
    $('ut-tab-comptes').setAttribute('aria-selected', String(nom === 'comptes'));
    $('ut-nouveau').textContent = nom === 'groupes' ? 'Nouveau groupe' : 'Nouveau compte';
    elEdG.hidden = true; elEdC.hidden = true; elVide.hidden = false;
    rendreListe();
  }

  function nouveau() {
    if (onglet === 'groupes') {
      editerGroupe({ id: null, nom: '', description: '', outils: [], organisations: [], membres: [], systeme: false });
      $('gr-nom').focus();
    } else {
      editerCompte({ id: null, name: '', email: '', profile: 'mixed', lang: 'fr', actif: true, groupes: [] });
      $('cp-nom').focus();
    }
  }

  function init() {
    elListe = $('da-liste-items');
    elVide  = $('da-vide');
    elEdG   = $('ut-editeur-groupe');
    elEdC   = $('ut-editeur-compte');

    $('ut-tab-groupes').addEventListener('click', function () { versOnglet('groupes'); });
    $('ut-tab-comptes').addEventListener('click', function () { versOnglet('comptes'); });
    $('ut-nouveau').addEventListener('click', nouveau);

    $('gr-enregistrer').addEventListener('click', enregistrerGroupe);
    $('gr-supprimer').addEventListener('click', supprimerGroupe);

    $('cp-enregistrer').addEventListener('click', enregistrerCompte);
    $('cp-supprimer').addEventListener('click', supprimerCompte);
    $('cp-inviter').addEventListener('click', function () {
      actionCompte('inviter', 'Générer un nouveau lien ? L\'ancien cessera de fonctionner.');
    });
    $('cp-reinitialiser').addEventListener('click', function () {
      actionCompte('reinitialiser',
        'Effacer le mot de passe et renvoyer cette personne sur un lien d\'activation ?');
    });
    $('cp-copier').addEventListener('click', function () {
      const champ = $('cp-lien');
      champ.select();
      navigator.clipboard.writeText(champ.value)
        .then(function () { dire('cp-feedback', 'Lien copié.', 'ok'); })
        .catch(function () { dire('cp-feedback', 'Copie refusée par le navigateur — sélectionnez le lien.', 'erreur'); });
    });

    charger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
