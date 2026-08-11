/**
 * wf-interpreter.js — Vue Interpreter du canevas.
 *
 * Montre ce que CE workflow deviendrait chez une cible, sans rien y produire.
 * C'est un plan au sens de `terraform plan` : on lit, on approuve, on soumet
 * ensuite — deux gestes séparés.
 *
 * ── QUATRE PRÉSENTATIONS, TEMPORAIRES ────────────────────────────────────
 * Les mêmes données, dessinées de quatre façons, pour choisir sur pièces
 * plutôt que sur description. Trois seront retirées.
 *
 *   Carte      les scénarios en boîtes, les étapes en pastilles colorées, la
 *              couture matérialisée. Se lit d'un coup d'œil, ne dit pas tout.
 *   Colonnes   ce qu'on a / ce que ça devient, côte à côte, avec le lien actif
 *              au survol — le mécanisme de Compiler Explorer.
 *   Liste      le rapport détaillé : chaque étape, chaque écart sous elle.
 *   Plan       du texte façon `terraform plan`, copiable tel quel dans un
 *              ticket. C'est la seule vue qui sorte de l'écran.
 *
 * Rien n'est construit par innerHTML : les libellés viennent de la base et
 * d'un document utilisateur.
 */

const WfInterpreter = (() => {

  let cibleCourante = 'make';
  let vueCourante   = 'carte';
  let donnees       = null;

  function el(balise, classe, texte) {
    const n = document.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined && texte !== null) n.textContent = String(texte);
    return n;
  }
  function vider(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function fluxId() { return new URLSearchParams(window.location.search).get('id'); }

  // Ce que devient une étape, en trois issues distinctes — « — » ne disait pas
  // si le verbe était pris en charge autrement ou pas pris en charge du tout.
  function texteCible(e) {
    return e.module ? e.module
         : e.natif  ? 'outil natif de la cible'
                    : 'aucun module — à porter à la main';
  }

  // ── Bandeau : cible, verdict, présentations ────────────────────────────
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
      cibleCourante = sel.value; charger(true);
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

    // Les présentations : un simple rang de mots soulignés. Ni les pastilles
    // des vues du header, ni les étiquettes de bord des volets — c'est un
    // TROISIÈME niveau, il ne doit ressembler à aucun des deux.
    const rang = el('nav', 'itp-presentations');
    rang.appendChild(el('span', 'itp-etiquette', 'Présentation'));
    [['carte', 'Carte'], ['graphe', 'Graphe'], ['colonnes', 'Colonnes'],
     ['liste', 'Liste'], ['plan', 'Plan']]
      .forEach(function (p) {
        const b = el('button', 'itp-pres', p[1]);
        b.type = 'button';
        b.dataset.pres = p[0];
        b.setAttribute('aria-selected', p[0] === vueCourante ? 'true' : 'false');
        b.addEventListener('click', function () { vueCourante = p[0]; rendre(); });
        rang.appendChild(b);
      });
    hote.appendChild(rang);
  }

  // ── 1. Carte : les scénarios en boîtes ─────────────────────────────────
  // La forme du résultat avant son détail : combien de scénarios, où passe la
  // couture, et où sont les points chauds.
  function vueCarte(hote, d) {
    const plan = el('div', 'itp-carte');
    (d.groupes || []).forEach(function (g, i) {
      if (i > 0) {
        // La couture, dessinée. C'est l'information que le rapport enterrait.
        const lien = el('div', 'itp-couture');
        lien.appendChild(el('span', 'itp-couture-signe', '⚡'));
        const t = el('div', 'itp-couture-texte');
        t.appendChild(el('b', null, 'webhook'));
        if (g.raison) t.appendChild(el('p', null, g.raison));
        lien.appendChild(t);
        plan.appendChild(lien);
      }
      const boite = el('section', 'itp-boite');
      const tete = el('header', 'itp-boite-tete');
      tete.appendChild(el('h3', null, g.nom));
      tete.appendChild(el('span', 'itp-role', g.role));
      tete.appendChild(el('span', 'itp-boite-compte',
        (g.etapes || []).length + ' étapes'));
      boite.appendChild(tete);

      const grille = el('div', 'itp-pastilles');
      (g.etapes || []).forEach(function (e) {
        const p = el('div', 'itp-pastille');
        p.dataset.etat = e.etat;
        p.dataset.etape = e.id || '';
        p.title = texteCible(e) + ((e.ecarts || []).length
          ? '\n\n' + e.ecarts.map(x => '⚠ ' + x.quoi + ' — ' + x.pourquoi).join('\n') : '');
        p.appendChild(el('span', 'itp-pastille-nom', e.label));
        p.appendChild(el('span', 'itp-pastille-cible', texteCible(e)));
        if ((e.ecarts || []).length) {
          p.appendChild(el('span', 'itp-pastille-nb', e.ecarts.length));
        }
        grille.appendChild(p);
      });
      boite.appendChild(grille);
      plan.appendChild(boite);
    });
    hote.appendChild(plan);
    hote.appendChild(legende());
  }

  function legende() {
    const l = el('div', 'itp-legende');
    [['traduit', 'traduite'], ['degrade', 'dégradée'], ['bloquant', 'bloquante']]
      .forEach(function (t) {
        const s = el('span', 'itp-legende-item');
        const pastille = el('i', 'itp-legende-carre');
        pastille.dataset.etat = t[0];
        s.appendChild(pastille);
        s.appendChild(el('span', null, t[1]));
        l.appendChild(s);
      });
    return l;
  }

  // ── 2. Colonnes : ce qu'on a / ce que ça devient ───────────────────────
  // Le mécanisme de Compiler Explorer : survoler à gauche allume à droite. Une
  // lecture côte à côte sans lien actif oblige l'œil à apparier lui-même.
  function vueColonnes(hote, d) {
    const cadre = el('div', 'itp-colonnes');

    const gauche = el('div', 'itp-colonne');
    gauche.appendChild(el('h3', 'itp-colonne-tete', 'Ce workflow'));
    const droite = el('div', 'itp-colonne');
    droite.appendChild(el('h3', 'itp-colonne-tete', 'Ce qui serait produit'));

    (d.groupes || []).forEach(function (g) {
      // Le séparateur va dans LES DEUX colonnes. Le mettre à droite seulement
      // décalait la gauche d'une ligne à chaque scénario — or tout l'intérêt de
      // cette vue est que les lignes se fassent face. Et ce n'est pas décoratif :
      // la coupure vient du workflow (le corps de boucle), elle a sa place à
      // gauche aussi.
      gauche.appendChild(el('div', 'itp-col-sep', g.nom + ' · ' + g.role));
      droite.appendChild(el('div', 'itp-col-sep', g.nom + ' · ' + g.role));
      (g.etapes || []).forEach(function (e) {
        const a = el('div', 'itp-col-ligne', e.label);
        a.dataset.etape = e.id || '';
        a.dataset.etat = e.etat;
        gauche.appendChild(a);

        const b = el('div', 'itp-col-ligne');
        b.dataset.etape = e.id || '';
        b.dataset.etat = e.etat;
        b.appendChild(el('span', 'itp-module', texteCible(e)));
        if ((e.ecarts || []).length) {
          b.appendChild(el('span', 'itp-col-nb', ' ' + e.ecarts.length + ' écart(s)'));
        }
        droite.appendChild(b);
      });
    });

    cadre.appendChild(gauche);
    cadre.appendChild(droite);

    // Le lien actif : une classe posée sur les deux côtés, pas un style.
    cadre.addEventListener('mouseover', function (ev) {
      const l = ev.target.closest('.itp-col-ligne');
      if (!l) return;
      cadre.querySelectorAll('.est-lie').forEach(x => x.classList.remove('est-lie'));
      cadre.querySelectorAll('[data-etape="' + CSS.escape(l.dataset.etape) + '"]')
        .forEach(x => x.classList.add('est-lie'));
    });
    cadre.addEventListener('mouseleave', function () {
      cadre.querySelectorAll('.est-lie').forEach(x => x.classList.remove('est-lie'));
    });

    hote.appendChild(cadre);
  }


  // ── 5. Graphe : la forme d'APS face à la forme de la cible ─────────────
  // C'est ici que les deux philosophies se voient. APS est un GRAPHE : un nœud
  // a plusieurs ports, une arête porte un sens (« Aucun résultat », « Erreur »).
  // Make est une CHAÎNE : un embranchement demande un Router, et une erreur
  // n'est pas une arête mais une pièce accrochée au module.
  //
  // Les arêtes d'erreur sont donc dessinées AUTREMENT : ce sont celles qui
  // cessent d'être des arêtes en passant chez la cible.
  const BOITE_L = 168, BOITE_H = 44;

  function estErreur(port) { return /err|erreur|fail|timeout/i.test(port || ''); }

  function vueGraphe(hote, d) {
    const cadre = el('div', 'itp-graphe-cadre');

    const gauche = el('div', 'itp-colonne');
    gauche.appendChild(el('h3', 'itp-colonne-tete', 'Ce workflow — un graphe'));
    const dessin = el('div', 'itp-dessin');
    gauche.appendChild(dessin);

    const droite = el('div', 'itp-colonne');
    droite.appendChild(el('h3', 'itp-colonne-tete', 'Ce que la cible en fait — une chaîne'));

    const etapes = (d.groupes || []).flatMap(g => g.etapes);
    const parId = new Map(etapes.map(e => [e.id, e]));

    (d.groupes || []).forEach(function (g) {
      droite.appendChild(el('div', 'itp-col-sep', g.nom + ' · ' + g.role));
      (g.etapes || []).forEach(function (e) {
        const l = el('div', 'itp-col-ligne');
        l.dataset.etape = e.id || '';
        l.dataset.etat = e.etat;
        l.appendChild(el('span', 'itp-forme', e.construit ? e.construit.dit : ''));
        l.appendChild(el('span', 'itp-col-de', ' ← ' + e.label));
        if (e.construit && e.construit.pourquoi) l.title = e.construit.pourquoi;
        droite.appendChild(l);
      });
    });

    cadre.appendChild(gauche);
    cadre.appendChild(droite);
    hote.appendChild(cadre);

    // Mise en page par dagre — le même moteur que le bouton Tidy du canevas.
    const dagreLib = window.dagre;
    if (!dagreLib) { dessin.appendChild(el('p', 'itp-message', 'dagre absent — graphe indisponible.')); return; }
    const gr = new dagreLib.graphlib.Graph({ multigraph: true });
    gr.setGraph({ rankdir: 'TB', nodesep: 26, ranksep: 44, marginx: 16, marginy: 16 });
    etapes.forEach(e => gr.setNode(e.id, { width: BOITE_L, height: BOITE_H }));
    (d.aretes || []).forEach(function (a, i) {
      if (!parId.has(a.de) || !parId.has(a.vers) || a.de === a.vers) return;
      gr.setEdge(a.de, a.vers, {}, 'a' + i);
    });
    dagreLib.layout(gr);
    const boite = gr.graph();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + Math.ceil(boite.width || 400) + ' ' + Math.ceil(boite.height || 400));
    svg.setAttribute('class', 'itp-svg');
    const svgEl = (n, attrs) => {
      const x = document.createElementNS('http://www.w3.org/2000/svg', n);
      Object.entries(attrs).forEach(([k, v]) => x.setAttribute(k, v));
      return x;
    };

    // Les arêtes d'abord, sous les nœuds.
    (d.aretes || []).forEach(function (a) {
      const u = gr.node(a.de), v = gr.node(a.vers);
      if (!u || !v) return;
      const p = svgEl('path', {
        d: 'M' + u.x + ',' + (u.y + BOITE_H / 2) +
           ' C' + u.x + ',' + (u.y + BOITE_H / 2 + 26) +
           ' ' + v.x + ',' + (v.y - BOITE_H / 2 - 26) +
           ' ' + v.x + ',' + (v.y - BOITE_H / 2),
        class: 'itp-arete',
      });
      if (estErreur(a.port)) p.setAttribute('data-erreur', '1');
      svg.appendChild(p);
    });

    etapes.forEach(function (e) {
      const n = gr.node(e.id);
      if (!n) return;
      const grp = svgEl('g', { class: 'itp-noeud', 'data-etape': e.id, 'data-etat': e.etat });
      grp.appendChild(svgEl('rect', {
        x: n.x - BOITE_L / 2, y: n.y - BOITE_H / 2, width: BOITE_L, height: BOITE_H, rx: 8 }));
      const t1 = svgEl('text', { x: n.x - BOITE_L / 2 + 10, y: n.y - 3, class: 'itp-noeud-nom' });
      t1.textContent = e.label.length > 24 ? e.label.slice(0, 23) + '…' : e.label;
      grp.appendChild(t1);
      const t2 = svgEl('text', { x: n.x - BOITE_L / 2 + 10, y: n.y + 12, class: 'itp-noeud-forme' });
      t2.textContent = e.construit ? e.construit.dit : '';
      grp.appendChild(t2);
      const titre = svgEl('title', {});
      titre.textContent = (e.construit && e.construit.pourquoi) || texteCible(e);
      grp.appendChild(titre);
      svg.appendChild(grp);
    });
    dessin.appendChild(svg);

    // Le lien actif entre le dessin et la colonne.
    cadre.addEventListener('mouseover', function (ev) {
      const cible = ev.target.closest('[data-etape]');
      if (!cible) return;
      cadre.querySelectorAll('.est-lie').forEach(x => x.classList.remove('est-lie'));
      cadre.querySelectorAll('[data-etape="' + CSS.escape(cible.dataset.etape) + '"]')
        .forEach(x => x.classList.add('est-lie'));
    });
    cadre.addEventListener('mouseleave', function () {
      cadre.querySelectorAll('.est-lie').forEach(x => x.classList.remove('est-lie'));
    });

    const nErr = (d.aretes || []).filter(a => estErreur(a.port)).length;
    hote.appendChild(el('p', 'itp-note-graphe',
      nErr + ' arêtes sur ' + (d.aretes || []).length + ' partent d\'un port d\'erreur. '
      + 'Chez Make elles cessent d\'être des arêtes : chacune devient un gestionnaire accroché à son module.'));
  }

  // ── 3. Liste : le rapport détaillé ─────────────────────────────────────
  function vueListe(hote, d) {
    const corps = el('div', 'itp-corps');
    (d.groupes || []).forEach(function (g) {
      const carte = el('section', 'itp-groupe');
      const tete = el('header', 'itp-groupe-tete');
      tete.appendChild(el('h3', null, g.nom));
      tete.appendChild(el('span', 'itp-role', g.role));
      if (g.appelePar) tete.appendChild(el('span', 'itp-appel', '← ' + g.appelePar));
      carte.appendChild(tete);
      if (g.raison) carte.appendChild(el('p', 'itp-raison', g.raison));

      const liste = el('ol', 'itp-etapes');
      (g.etapes || []).forEach(function (e) {
        const li = el('li', 'itp-etape');
        li.dataset.etat = e.etat;
        const ligne = el('div', 'itp-ligne');
        ligne.appendChild(el('span', 'itp-label', e.label));
        ligne.appendChild(el('span', 'itp-fleche', '→'));
        const cible = el('span', 'itp-module', texteCible(e));
        if (e.natif) cible.dataset.natif = '1';
        if (e.orphelin) cible.dataset.orphelin = '1';
        ligne.appendChild(cible);
        li.appendChild(ligne);
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
      corps.appendChild(carte);
    });
    hote.appendChild(corps);
  }

  // ── 4. Plan : du texte, copiable ───────────────────────────────────────
  // La seule vue qui sorte de l'écran. Un plan qu'on colle dans un ticket vaut
  // mieux qu'une capture qu'on décrit.
  function texteDuPlan(d) {
    const v = d.verdict || {};
    const L = [];
    L.push('Interprétation : ' + d.flux.nom);
    L.push('Cible          : ' + d.cible.nom);
    L.push('Plan           : ' + v.traduites + ' traduites, ' + v.degradees
           + ' dégradées, ' + v.bloquantes + ' bloquantes, ' + v.scenarios + ' scénario(s)');
    L.push('');
    (d.groupes || []).forEach(function (g) {
      L.push('  scénario "' + g.nom + '" (' + g.role + ')');
      if (g.raison) L.push('    # ' + g.raison);
      (g.etapes || []).forEach(function (e) {
        const signe = e.etat === 'traduit' ? '+' : e.etat === 'degrade' ? '~' : '!';
        L.push('    ' + signe + ' ' + e.label.padEnd(30).slice(0, 30) + ' -> ' + texteCible(e));
        (e.ecarts || []).forEach(function (x) {
          L.push('        ' + (x.gravite === 'bloquant' ? 'x' : '!') + ' ' + x.quoi + ' : ' + x.pourquoi);
        });
      });
      L.push('');
    });
    L.push('Aucune écriture n\'a été faite chez la cible.');
    return L.join('\n');
  }

  function vuePlan(hote, d) {
    const texte = texteDuPlan(d);
    const outils = el('div', 'itp-plan-outils');
    const btn = el('button', 'itp-copier', 'Copier le plan');
    btn.type = 'button';
    btn.addEventListener('click', async function () {
      try { await navigator.clipboard.writeText(texte); btn.textContent = 'Copié'; }
      catch (_) { btn.textContent = 'Copie refusée par le navigateur'; }
      setTimeout(function () { btn.textContent = 'Copier le plan'; }, 1800);
    });
    outils.appendChild(btn);
    hote.appendChild(outils);
    hote.appendChild(el('pre', 'itp-plan', texte));
  }

  // ── Assemblage ─────────────────────────────────────────────────────────
  function rendre() {
    const hote = document.querySelector('[data-role="itp-hote"]');
    if (!hote || !donnees) return;
    vider(hote);
    rendreBarre(hote, donnees);

    if (vueCourante === 'carte')         vueCarte(hote, donnees);
    else if (vueCourante === 'graphe')   vueGraphe(hote, donnees);
    else if (vueCourante === 'colonnes') vueColonnes(hote, donnees);
    else if (vueCourante === 'plan')     vuePlan(hote, donnees);
    else                                 vueListe(hote, donnees);

    // Le geste de soumission est séparé de la lecture, et désactivé tant que
    // rien n'est branché. Un bouton qui ment coûte plus cher qu'un bouton absent.
    const pied = el('div', 'itp-pied');
    const soumettre = el('button', 'itp-soumettre', 'Soumettre à ' + donnees.cible.nom);
    soumettre.type = 'button';
    soumettre.disabled = true;
    soumettre.title = 'Pas encore branché — la soumission se fera depuis ici';
    pied.appendChild(soumettre);
    pied.appendChild(el('span', 'itp-pied-note',
      'Lecture seule : rien n\'est écrit chez la cible.'));
    hote.appendChild(pied);
  }

  function message(texte) {
    const hote = document.querySelector('[data-role="itp-hote"]');
    if (!hote) return;
    vider(hote);
    hote.appendChild(el('p', 'itp-message', texte));
  }

  async function charger(force) {
    const id = fluxId();
    if (!id) { message('Enregistrez ce workflow pour l\'interpréter.'); return; }
    if (!force && donnees && donnees.cible.cle === cibleCourante
        && donnees.flux.id === id) { rendre(); return; }

    message('Lecture en cours…');
    try {
      const r = await fetch('/api/builder-flows/' + encodeURIComponent(id)
        + '/interpretation?cible=' + encodeURIComponent(cibleCourante));
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      donnees = d;
      rendre();
    } catch (e) {
      message('❌ ' + e.message);
    }
  }

  return { charger };

})();

if (typeof window !== 'undefined') window.WfInterpreter = WfInterpreter;
