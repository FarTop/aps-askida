/**
 * wf-interpreter.js — Vue Interpreter du canevas.
 *
 * Montre ce que CE workflow deviendrait chez une cible, sans rien y produire.
 * C'est un plan au sens de `terraform plan` : on lit, on approuve, on soumet
 * ensuite — deux gestes séparés.
 *
 * Trois choses à montrer, et une seule est évidente :
 *   — la correspondance étape → module, qui se lit en deux colonnes ;
 *   — le DÉCOUPAGE, quand un workflow devient plusieurs scénarios. La raison de
 *     la coupure est posée SUR la couture, pas en note de bas de page : sans
 *     elle, un lecteur croit à un caprice de l'outil ;
 *   — les ÉCARTS, qui sont l'information la plus utile et la plus facile à
 *     enterrer. Ils restent attachés à leur étape.
 *
 * Rien n'est construit par innerHTML : les libellés viennent de la base et d'un
 * document utilisateur.
 */

const WfInterpreter = (() => {

  let cibleCourante = 'make';
  let charge = null;          // id du flux déjà affiché, pour ne pas recharger

  function el(balise, classe, texte) {
    const n = document.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined && texte !== null) n.textContent = String(texte);
    return n;
  }

  function fluxId() {
    return new URLSearchParams(window.location.search).get('id');
  }

  // ── Bandeau : cible + verdict ──────────────────────────────────────────
  function rendreBarre(hote, d) {
    const barre = el('div', 'itp-barre');

    const gauche = el('div', 'itp-cible');
    gauche.appendChild(el('label', 'itp-etiquette', 'Cible'));
    const sel = el('select', 'itp-select');
    (d.ciblesDisponibles || []).forEach(function (c) {
      const o = el('option', null, c.nom + (c.pret ? '' : ' — pas encore'));
      o.value = c.cle;
      if (!c.pret) o.disabled = true;
      if (c.cle === d.cible.cle) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      cibleCourante = sel.value; charge = null; charger(true);
    });
    gauche.appendChild(sel);
    barre.appendChild(gauche);

    const v = d.verdict || {};
    const droite = el('div', 'itp-verdict');
    [['etapes', v.etapes, 'étapes'],
     ['traduit', v.traduites, 'traduites'],
     ['degrade', v.degradees, 'dégradées'],
     ['bloquant', v.bloquantes, 'bloquantes'],
     ['scenarios', v.scenarios, v.scenarios > 1 ? 'scénarios' : 'scénario']]
      .forEach(function (t) {
        const c = el('span', 'itp-compte');
        c.dataset.genre = t[0];
        c.appendChild(el('b', null, t[1] == null ? '—' : t[1]));
        c.appendChild(el('span', null, ' ' + t[2]));
        droite.appendChild(c);
      });
    barre.appendChild(droite);
    hote.appendChild(barre);
  }

  // ── Un scénario produit ────────────────────────────────────────────────
  function rendreGroupe(hote, g) {
    const carte = el('section', 'itp-groupe');
    const tete = el('header', 'itp-groupe-tete');
    tete.appendChild(el('h3', null, g.nom));
    tete.appendChild(el('span', 'itp-role', g.role));
    if (g.appelePar) tete.appendChild(el('span', 'itp-appel', '← ' + g.appelePar));
    carte.appendChild(tete);

    // La couture porte sa raison. C'est ce qui distingue un découpage subi d'un
    // découpage compris.
    if (g.raison) carte.appendChild(el('p', 'itp-raison', g.raison));

    const liste = el('ol', 'itp-etapes');
    (g.etapes || []).forEach(function (e) {
      const li = el('li', 'itp-etape');
      li.dataset.etat = e.etat;

      const ligne = el('div', 'itp-ligne');
      ligne.appendChild(el('span', 'itp-label', e.label));
      ligne.appendChild(el('span', 'itp-fleche', '→'));
      // Trois issues, trois libellés distincts. « — » ne disait pas si le verbe
      // était pris en charge autrement ou pas pris en charge du tout.
      const texte = e.module ? e.module
                  : e.natif ? 'outil natif de la cible'
                  : 'aucun module — à porter à la main';
      const cible = el('span', 'itp-module', texte);
      if (e.natif) cible.dataset.natif = '1';
      if (e.orphelin) cible.dataset.orphelin = '1';
      ligne.appendChild(cible);
      li.appendChild(ligne);

      // Les écarts restent SOUS leur étape : les regrouper ailleurs en ferait
      // une liste que personne ne relie à rien.
      if ((e.ecarts || []).length) {
        const ul = el('ul', 'itp-ecarts');
        e.ecarts.forEach(function (x) {
          const item = el('li', 'itp-ecart');
          item.dataset.gravite = x.gravite;
          item.appendChild(el('code', null, x.quoi));
          item.appendChild(el('span', null, ' ' + x.pourquoi));
          ul.appendChild(item);
        });
        li.appendChild(ul);
      }
      liste.appendChild(li);
    });
    carte.appendChild(liste);
    hote.appendChild(carte);
  }

  function rendre(hote, d) {
    while (hote.firstChild) hote.removeChild(hote.firstChild);
    rendreBarre(hote, d);
    const corps = el('div', 'itp-corps');
    (d.groupes || []).forEach(function (g) { rendreGroupe(corps, g); });
    hote.appendChild(corps);

    // Le geste de soumission est SÉPARÉ de la lecture, et il est désactivé tant
    // que la cible n'est pas prête. Un bouton qui ment coûte plus cher qu'un
    // bouton absent.
    const pied = el('div', 'itp-pied');
    const btn = el('button', 'itp-soumettre', 'Soumettre à ' + d.cible.nom);
    btn.type = 'button';
    btn.disabled = true;
    btn.title = 'Pas encore branché — la soumission se fera depuis ici';
    pied.appendChild(btn);
    pied.appendChild(el('span', 'itp-pied-note',
      'Lecture seule : rien n\'est écrit chez la cible.'));
    hote.appendChild(pied);
  }

  async function charger(force) {
    const hote = document.querySelector('[data-role="itp-hote"]');
    if (!hote) return;
    const id = fluxId();
    if (!id) { rendreMessage(hote, 'Enregistrez ce workflow pour l\'interpréter.'); return; }
    if (!force && charge === id + '|' + cibleCourante) return;

    rendreMessage(hote, 'Lecture en cours…');
    try {
      const r = await fetch('/api/builder-flows/' + encodeURIComponent(id)
        + '/interpretation?cible=' + encodeURIComponent(cibleCourante));
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      rendre(hote, d);
      charge = id + '|' + cibleCourante;
    } catch (e) {
      rendreMessage(hote, '❌ ' + e.message);
    }
  }

  function rendreMessage(hote, texte) {
    while (hote.firstChild) hote.removeChild(hote.firstChild);
    hote.appendChild(el('p', 'itp-message', texte));
  }

  return { charger };

})();

if (typeof window !== 'undefined') window.WfInterpreter = WfInterpreter;
