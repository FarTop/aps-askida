/**
 * identite.js — Qui est connecté (partagé)
 *
 * Pendant du sélecteur d'organisation : l'un dit OÙ l'on est, l'autre QUI l'on
 * est. Les deux vivent dans le header, côte à côte, sur toutes les pages.
 *
 * CE QU'IL AFFICHE QUAND ON EST CONNECTÉ, et c'est le point :
 *
 *     Farid Radi · SuperAdmin · 12 outils
 *
 * — c'est-à-dire ce qu'on OBTIENDRAIT si les accès étaient appliqués, pendant
 * qu'APS reste grand ouvert. On vérifie le modèle sur de vrais comptes sans
 * rien risquer, et le jour où la porte se ferme, rien ne change à l'écran.
 *
 * Il signale aussi ce qui ne va pas AVANT que ça bloque quelqu'un : un compte
 * sans groupe, ou des groupes qui ne couvrent aucune organisation. Ces deux cas
 * se lisent aujourd'hui dans l'écran d'administration ; ici ils se lisent sur
 * soi, ce qui est plus difficile à ignorer.
 *
 * MONTAGE : `<div data-role="identite"></div>` si l'on veut choisir la place ;
 * sinon le composant s'insère seul dans `.aps-header-right`, avant la
 * navigation. Le repli existe pour ne pas avoir à toucher treize en-têtes —
 * mais un emplacement explicite l'emporte toujours.
 */
(function () {

  async function _identite() {
    try {
      const r = await fetch('/api/auth/moi');
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  function _hote() {
    const explicite = document.querySelector('[data-role="identite"]');
    if (explicite) return explicite;
    const droite = document.querySelector('.aps-header-right');
    if (!droite) return null;
    const d = document.createElement('div');
    d.setAttribute('data-role', 'identite');
    droite.insertBefore(d, droite.firstChild);
    return d;
  }

  function _lien(texte, href) {
    const a = document.createElement('a');
    a.className = 'idt-lien';
    a.href = href;
    a.textContent = texte;
    return a;
  }

  async function _monter() {
    const hote = _hote();
    if (!hote) return;
    const moi = await _identite();

    const wrap = document.createElement('div');
    wrap.className = 'idt';

    if (!moi) {
      // Pas connecté : on le DIT, plutôt que de ne rien afficher. Une barre
      // muette laisse croire qu'il n'y a rien à savoir.
      wrap.setAttribute('data-etat', 'anonyme');
      const t = document.createElement('span');
      t.className = 'idt-anonyme';
      t.textContent = 'Non connecté';
      wrap.appendChild(t);
      wrap.appendChild(_lien('Se connecter', _racine() + 'connexion.html'));
      hote.textContent = '';
      hote.appendChild(wrap);
      return;
    }

    wrap.setAttribute('data-etat', 'connecte');

    const nom = document.createElement('span');
    nom.className = 'idt-nom';
    nom.textContent = moi.name;
    wrap.appendChild(nom);

    const detail = document.createElement('span');
    detail.className = 'idt-detail';
    const groupes = (moi.groupes || []).map(g => g.nom).join(', ');
    const nOutils = (moi.outils || []).length;
    detail.textContent = (groupes || 'aucun groupe') + ' · ' + nOutils + ' outil'
                       + (nOutils > 1 ? 's' : '');
    wrap.appendChild(detail);

    // Les deux configurations qui ne bloquent rien aujourd'hui et bloqueraient
    // tout demain. Mieux vaut les voir maintenant.
    const manques = [];
    if (!(moi.groupes || []).length)       manques.push('aucun groupe');
    if (!(moi.organisations || []).length) manques.push('aucune organisation');
    if (manques.length) {
      const alerte = document.createElement('span');
      alerte.className = 'idt-alerte';
      alerte.textContent = '⚠ ' + manques.join(' · ');
      alerte.title = 'Sans cela, ce compte n\'aurait accès à rien le jour où les '
                   + 'accès seront appliqués.';
      wrap.appendChild(alerte);
    }

    const sortir = document.createElement('button');
    sortir.type = 'button';
    sortir.className = 'idt-lien idt-bouton';
    sortir.textContent = 'Se déconnecter';
    sortir.addEventListener('click', async function () {
      await fetch('/api/auth/deconnexion', { method: 'POST' });
      window.location.reload();
    });
    wrap.appendChild(sortir);

    hote.textContent = '';
    hote.appendChild(wrap);
  }

  // Les pages vivent à des profondeurs différentes (`/index.html`,
  // `/admin/x/y.html`) : on vise la racine du site plutôt qu'un chemin relatif
  // qui serait juste sur une page et faux sur les douze autres.
  function _racine() { return '/'; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _monter);
  } else {
    _monter();
  }

})();
