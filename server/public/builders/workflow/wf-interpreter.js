/**
 * wf-interpreter.js — Vue Interpreter du canevas.
 *
 * Ce que CE workflow deviendrait chez une cible, sans rien y produire. Un plan
 * au sens de `terraform plan` : on lit, on approuve, on soumet ensuite.
 *
 * ── UNE VUE, DEUX ÉCHELLES ───────────────────────────────────────────────
 * Les cinq présentations d'essai ont fait leur travail : elles ont montré que
 * le graphe redisait la carte, et que le côte à côte ne valait que par son lien
 * actif. Il reste donc une seule vue, à deux échelles :
 *
 *   En haut   deux CARTES face à face — la source APS, la destination — reliées
 *             au survol. On y lit la forme : combien de scénarios, où passe la
 *             couture, où sont les points chauds.
 *   En bas    le DÉTAIL, ligne à ligne : ce que chaque étape devient, sous quel
 *             module, et ce qu'elle perd au passage.
 *
 * Le survol relie les trois endroits d'un coup — les deux pastilles et la ligne
 * de détail. C'est ce qui remplace les cinq onglets : un geste, trois échos.
 *
 * Rien n'est construit par innerHTML : les libellés viennent de la base et d'un
 * document utilisateur.
 */

const WfInterpreter = (() => {

  let cibleCourante = 'make';
  let avecNotes     = false;
  let donnees       = null;

  function el(balise, classe, texte) {
    const n = document.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined && texte !== null) n.textContent = String(texte);
    return n;
  }
  function vider(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function fluxId() { return new URLSearchParams(window.location.search).get('id'); }

  // Trois issues distinctes — « — » ne disait pas si le verbe était pris en
  // charge autrement ou pas pris en charge du tout.
  function texteCible(e) {
    return e.module ? e.module : e.natif ? 'outil natif' : 'aucun module';
  }

  // ── Bandeau ────────────────────────────────────────────────────────────
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
    sel.addEventListener('change', function () { cibleCourante = sel.value; charger(); });
    gauche.appendChild(sel);

    // Le plan en texte survit à ses confrères : c'est la seule sortie qui quitte
    // l'écran, et un plan collé dans un ticket vaut mieux qu'une capture qu'on
    // décrit. Il devient un bouton, plus un onglet.
    const copier = el('button', 'itp-copier', 'Copier le plan');
    copier.type = 'button';
    copier.addEventListener('click', async function () {
      try { await navigator.clipboard.writeText(texteDuPlan(d)); copier.textContent = 'Copié'; }
      catch (_) { copier.textContent = 'Copie refusée'; }
      setTimeout(function () { copier.textContent = 'Copier le plan'; }, 1800);
    });
    gauche.appendChild(copier);

    // Porter les post-its : une case, rien de plus. Make sait les recevoir —
    // `POST /scenarios/{id}/notes` accepte une note accrochée à des modules —
    // et ce sont eux qui portent le POURQUOI, exactement ce qui se perd quand
    // un collègue reprend le travail ailleurs. L'écran est déjà chargé : pas
    // d'explication ici, la case suffit.
    const opt = el('label', 'itp-option');
    const coche = document.createElement('input');
    coche.type = 'checkbox';
    coche.checked = avecNotes;
    coche.addEventListener('change', function () { avecNotes = coche.checked; charger(); });
    opt.appendChild(coche);
    opt.appendChild(el('span', null, 'Porter les post-its'));
    if (d.notes && d.notes.demandees) {
      opt.title = d.notes.total + ' post-it(s), dont ' + d.notes.orphelines
                + ' sans nœud identifiable';
    }
    gauche.appendChild(opt);
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

  // Une pastille, des deux côtés. Le MÊME objet visuel à gauche et à droite :
  // c'est ce qui rend la correspondance lisible sans tracer un seul trait.
  function pastille(e, cote) {
    const p = el('div', 'itp-pastille');
    p.dataset.etat  = e.etat;
    p.dataset.etape = e.id || '';
    p.dataset.cote  = cote;
    p.appendChild(el('span', 'itp-pastille-nom',
      cote === 'source' ? e.label : texteCible(e)));
    p.appendChild(el('span', 'itp-pastille-cible',
      cote === 'source' ? (e.verbe || e.core || '') : (e.construit ? e.construit.dit : '')));
    if (cote === 'source' && (e.depuis || []).length) {
      p.title = e.depuis.map(x => '← ' + x.de + ' · port ' + x.port).join('\n');
    }
    if ((e.ecarts || []).length) p.appendChild(el('span', 'itp-pastille-nb', e.ecarts.length));
    return p;
  }

  // ── Haut : les deux cartes ─────────────────────────────────────────────
  function rendreCartes(hote, d) {
    const zone = el('div', 'itp-zone-haute');
    const etapes = (d.groupes || []).flatMap(g => g.etapes);

    // Source : le workflow d'un bloc — il n'a qu'une forme, la sienne.
    const src = el('section', 'itp-carte-cote');
    const teteS = el('header', 'itp-carte-tete');
    teteS.appendChild(el('h3', null, 'Source'));
    teteS.appendChild(el('span', 'itp-role', d.flux.nom));
    teteS.appendChild(el('span', 'itp-carte-compte', etapes.length + ' étapes'));
    src.appendChild(teteS);
    const grilleS = el('div', 'itp-pastilles');
    etapes.forEach(function (e) { grilleS.appendChild(pastille(e, 'source')); });
    src.appendChild(grilleS);
    zone.appendChild(src);

    // Destination : découpée en scénarios, avec la couture et sa raison.
    const dst = el('section', 'itp-carte-cote');
    const teteD = el('header', 'itp-carte-tete');
    teteD.appendChild(el('h3', null, 'Destination'));
    teteD.appendChild(el('span', 'itp-role', d.cible.nom));
    teteD.appendChild(el('span', 'itp-carte-compte',
      (d.verdict.scenarios || 1) + ' scénario(s)'));
    dst.appendChild(teteD);
    (d.groupes || []).forEach(function (g, i) {
      if (i > 0 && g.raison) {
        const c = el('div', 'itp-couture');
        c.appendChild(el('span', 'itp-couture-signe', '⚡'));
        const t = el('div', 'itp-couture-texte');
        t.appendChild(el('b', null, 'webhook'));
        t.appendChild(el('p', null, g.raison));
        c.appendChild(t);
        dst.appendChild(c);
      }
      const bloc = el('div', 'itp-scenario');
      bloc.appendChild(el('div', 'itp-scenario-tete', g.nom + ' · ' + g.role));
      const grille = el('div', 'itp-pastilles');
      (g.etapes || []).forEach(function (e) { grille.appendChild(pastille(e, 'cible')); });
      bloc.appendChild(grille);
      dst.appendChild(bloc);
    });
    zone.appendChild(dst);
    hote.appendChild(zone);
  }

  function libelleStatut(cle) {
    const t = (donnees && donnees.statuts || []).find(s => s.cle === cle);
    return t ? t.libelle : cle;
  }

  // ── Bas : le détail ────────────────────────────────────────────────────
  function rendreDetail(hote, d) {
    const zone = el('section', 'itp-zone-basse');
    const tete = el('header', 'itp-carte-tete');
    tete.appendChild(el('h3', null, 'Détail'));
    tete.appendChild(el('span', 'itp-role', 'étape par étape'));
    // Le compte par statut vit ICI, avec les écarts, et non dans le bandeau du
    // haut : c'est la répartition qui dit s'il y a deux obstacles ou vingt-deux.
    const somme = el('span', 'itp-statuts');
    (d.statuts || []).forEach(function (st) {
      const c = el('span', 'itp-statut');
      c.dataset.statut = st.cle;
      c.appendChild(el('b', null, st.nombre));
      c.appendChild(el('span', null, ' ' + st.libelle));
      somme.appendChild(c);
    });
    tete.appendChild(somme);
    zone.appendChild(tete);

    const table = el('div', 'itp-table');
    const enTete = el('div', 'itp-tr itp-tr-tete');
    ['Étape APS', 'Devient', 'Module', 'Ce qu\'elle perd'].forEach(function (t) {
      enTete.appendChild(el('div', 'itp-td', t));
    });
    table.appendChild(enTete);

    // Une raison de forme se répète autant qu'il y a d'étapes qui la subissent
    // — vingt fois pour le gestionnaire d'erreur. On ne l'écrit qu'à sa
    // PREMIÈRE occurrence : la deuxième n'apprend rien et noie les autres.
    const dejaDit = new Set();

    (d.groupes || []).forEach(function (g) {
      const sep = el('div', 'itp-tr itp-tr-sep');
      sep.appendChild(el('div', 'itp-td', g.nom + ' · ' + g.role));
      table.appendChild(sep);

      (g.etapes || []).forEach(function (e) {
        const tr = el('div', 'itp-tr');
        tr.dataset.etape = e.id || '';
        tr.dataset.etat = e.etat;

        const nom = el('div', 'itp-td itp-td-nom');
        nom.appendChild(el('span', null, e.label));
        // La provenance lève l'ambiguïté entre deux nœuds de même libellé — une
        // copie et son original ne se distinguent que par ce qui les précède.
        if ((e.depuis || []).length) {
          nom.appendChild(el('span', 'itp-depuis',
            e.depuis.map(x => '← ' + x.de + ' · ' + x.port).join('  ')));
        } else if (!e.injoignable) {
          nom.appendChild(el('span', 'itp-depuis', '← entrée du workflow'));
        }
        if (e.injoignable) nom.appendChild(el('span', 'itp-depuis', '⚠ aucune arête n\'y mène'));
        if ((e.notes || []).length) {
          const m = el('span', 'itp-note-marque', ' 📝');
          m.title = e.notes.map(n => n.texte).join('\n\n');
          nom.appendChild(m);
        }
        tr.appendChild(nom);

        const forme = el('div', 'itp-td');
        forme.appendChild(el('span', null, e.construit ? e.construit.dit : '—'));
        if (e.construit && e.construit.pourquoi) {
          forme.title = e.construit.pourquoi;          // toujours au survol
          if (!dejaDit.has(e.construit.forme)) {
            dejaDit.add(e.construit.forme);
            forme.appendChild(el('span', 'itp-pourquoi', e.construit.pourquoi));
          }
        }
        tr.appendChild(forme);

        const mod = el('div', 'itp-td');
        const m = el('span', 'itp-module', texteCible(e));
        if (e.natif) m.dataset.natif = '1';
        if (e.orphelin) m.dataset.orphelin = '1';
        mod.appendChild(m);
        tr.appendChild(mod);

        const perte = el('div', 'itp-td');
        if ((e.ecarts || []).length) {
          const ul = el('ul', 'itp-ecarts');
          e.ecarts.forEach(function (x) {
            const li = el('li', 'itp-ecart');
            li.dataset.gravite = x.gravite;
            li.dataset.statut = x.statut || '';
            // Le statut d'abord : c'est lui qui dit s'il y a quelque chose à
            // faire, et quoi. La description vient après.
            if (x.statut) {
              const chip = el('span', 'itp-statut', libelleStatut(x.statut));
              if (x.voie) chip.title = x.voie;
              li.appendChild(chip);
            }
            li.appendChild(el('code', null, x.quoi));
            li.appendChild(el('span', null, ' ' + x.pourquoi));
            ul.appendChild(li);
          });
          perte.appendChild(ul);
        } else {
          perte.appendChild(el('span', 'itp-rien', 'rien'));
        }
        tr.appendChild(perte);
        table.appendChild(tr);
      });
    });
    zone.appendChild(table);
    hote.appendChild(zone);
  }

  // ── Le plan en texte, pour le presse-papier ────────────────────────────
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
        L.push('    ' + signe + ' ' + e.label.padEnd(30).slice(0, 30) + ' -> '
               + texteCible(e) + '  [' + (e.construit ? e.construit.dit : '') + ']');
        (e.ecarts || []).forEach(function (x) {
          L.push('        ' + (x.gravite === 'bloquant' ? 'x' : '!') + ' ['
                 + libelleStatut(x.statut) + '] ' + x.quoi + ' : ' + x.pourquoi
                 + (x.voie ? '  →  ' + x.voie : ''));
        });
        (e.notes || []).forEach(function (n) {
          String(n.texte || '').split('\n').forEach(function (l, i) {
            L.push('        ' + (i ? '  ' : '# ') + l);
          });
        });
      });
      L.push('');
    });
    L.push('Aucune écriture n\'a été faite chez la cible.');
    return L.join('\n');
  }

  // ── Assemblage + synchronisation ───────────────────────────────────────
  function rendre() {
    const hote = document.querySelector('[data-role="itp-hote"]');
    if (!hote || !donnees) return;
    vider(hote);
    rendreBarre(hote, donnees);
    rendreCartes(hote, donnees);
    rendreDetail(hote, donnees);

    // Le survol relie les TROIS endroits — pastille source, pastille cible,
    // ligne de détail. C'est ce qui remplace les onglets : un geste, trois
    // échos, aucune lecture à apparier soi-même.
    hote.addEventListener('mouseover', function (ev) {
      const cible = ev.target.closest('[data-etape]');
      if (!cible) return;
      hote.querySelectorAll('.est-lie').forEach(x => x.classList.remove('est-lie'));
      hote.querySelectorAll('[data-etape="' + CSS.escape(cible.dataset.etape) + '"]')
        .forEach(x => x.classList.add('est-lie'));
    });
    hote.addEventListener('mouseleave', function () {
      hote.querySelectorAll('.est-lie').forEach(x => x.classList.remove('est-lie'));
    });

    // Cliquer une pastille amène à sa ligne de détail : le passage d'une
    // échelle à l'autre, sans avoir à chercher.
    hote.addEventListener('click', function (ev) {
      const p = ev.target.closest('.itp-pastille');
      if (!p) return;
      const ligne = hote.querySelector('.itp-tr[data-etape="' + CSS.escape(p.dataset.etape) + '"]');
      if (ligne) ligne.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

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

  // Toujours relire. Le cache d'origine gardait le premier résultat pour un
  // couple (workflow, cible) : on éditait dans Builder, on revenait ici, et
  // l'écran montrait l'état d'avant sans rien dire. Une interprétation périmée
  // est pire qu'une seconde d'attente — c'est un plan qui décrit autre chose
  // que ce qu'on regarde.
  async function charger() {
    const id = fluxId();
    if (!id) { message('Enregistrez ce workflow pour l\'interpréter.'); return; }

    message('Lecture en cours…');
    try {
      const r = await fetch('/api/builder-flows/' + encodeURIComponent(id)
        + '/interpretation?cible=' + encodeURIComponent(cibleCourante)
        + (avecNotes ? '&postits=1' : ''));
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
