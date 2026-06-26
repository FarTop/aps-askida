
async function exporterComparaisonPDF() {
  if (selectionsComparaison.groupes.length === 0 && 
      selectionsComparaison.collections.length === 0 &&
      selectionsComparaison.mdViews.length === 0 &&
      selectionsComparaison.roles.length === 0 &&
      selectionsComparaison.metadonnees.length === 0) {
    alert('Aucun élément à exporter. Sélectionnez des éléments d\'abord.');
    return;
  }
  
  console.log('window.jspdf:', window.jspdf);
  
  if (typeof window.jspdf === 'undefined') {
    alert('Erreur: Librairie jsPDF non chargée. Vérifiez votre connexion internet et rechargez la page.');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  let yPos = 15;
  
  // ============ HEADER stylisé ASKI-DA ============
  // Fond noir
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, 210, 35, 'F');
  
  // Texte ASKI-DA en blanc GRAS
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text('ASKI-DA', 15, 22);
  
  // Managed Services en jaune NORMAL - aligné avec le tiret (après "ASKI")
  doc.setFontSize(24); // Même taille
  doc.setFont(undefined, 'normal'); // Pas gras
  doc.setTextColor(237, 220, 61);
  const tiretX = 15 + doc.getTextWidth('ASKI'); // Position du tiret
  doc.text('Managed Services', tiretX, 30);
  
  // Titre à droite
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Matrice Permissions', 110, 20);
  
  // Date
  doc.setFontSize(9);
  doc.setTextColor(149, 165, 166);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 150, 28);
  
  yPos = 45;
  
  // ========== PAGE 1 : SOMMAIRE ==========
  genererPageSommaire(doc);
  
  // ========== PAGE 2 : RÉSUMÉ EXÉCUTIF ==========
  doc.addPage();
  genererPageResume(doc);

  // ========== PAGE 3 : GLOSSAIRE ==========
  doc.addPage();
  genererPageGlossaire(doc);
  
  // Réinitialiser couleurs
  doc.setTextColor(44, 62, 80);
  
  // Générer une page par groupe
  if (selectionsComparaison.groupes.length > 0) {
    selectionsComparaison.groupes.forEach((item, index) => {
      const groupe = item.data || item;
      const nomGroupe = item.nom || groupe.nom;
      
      // Nouvelle page pour chaque groupe (y compris le premier)
      doc.addPage();
      
      let yPos = 45;
      
      // ========== BANDEAU GROUPE ==========
      doc.setFillColor(0, 212, 170);
      doc.rect(10, yPos - 5, 190, 10, 'F');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      doc.text(`GROUPE : ${nomGroupe}`, 15, yPos + 2);
      yPos += 15;
      
      doc.setFont(undefined, 'normal');
      doc.setTextColor(44, 62, 80);
      doc.setFontSize(10);
      
      // ========== CARTE COLLECTIONS ==========
      yPos = ajouterCartePDF(doc, yPos, 'COLLECTIONS', groupe.collections, (col) => {
        return {
          texte: col.chemin,
          couleur: col.permission === 'Read Only' ? [52, 152, 219] : [46, 204, 113],
          label: col.permission === 'Read Only' ? 'Lecture' : 'Lecture/Écriture'
        };
      });
      
      // ========== CARTE METADATA VIEWS ==========
      const vues = groupe.vues || (groupe.metadataViews ? groupe.metadataViews.map(v => ({nom: v})) : []);
      yPos = ajouterCartePDF(doc, yPos, 'METADATA VIEWS', vues, (vue) => {
        return { texte: vue.nom || vue };
      });
      
      // ========== CARTE MÉTADONNÉES (juste après MD Views) ==========
      const metasSet = new Set();
      vues.forEach(v => {
        const nomVue = v.nom || v;
        metadonneesData.metadonnees.forEach(m => {
          const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
          if (views.includes(nomVue)) metasSet.add(m.nom);
        });
      });
      yPos = ajouterCartePDF(doc, yPos, 'MÉTADONNÉES', Array.from(metasSet), (meta) => {
        return { texte: meta };
      });
      
      // ========== CARTE RÔLES ==========
      const roles = groupe.fonctionnalites || [];
      yPos = ajouterCartePDF(doc, yPos, 'RÔLES', roles, (role) => {
        return { texte: role };
      });
      
      // ========== CARTE ITEMS ==========
      const itemsMap = new Map();
      itemsAdvancedData.items.forEach(it => {
        if (!it.assignations) return;
        const assignations = it.assignations.filter(a => roles.includes(a.role));
        if (assignations.length > 0) {
          const perms = new Set();
          assignations.forEach(a => a.permissions.forEach(p => perms.add(p)));
          itemsMap.set(it.nom, Array.from(perms));
        }
      });
      
      const itemsList = Array.from(itemsMap.entries()).map(([nom, perms]) => ({ 
        nom, 
        permissions: perms 
      }));
      
      yPos = ajouterCartePDF(doc, yPos, 'ITEMS', itemsList, (it) => {
        return { 
          texte: it.nom, 
          permissions: it.permissions 
        };
      });
      
      // ========== CARTE WORKFLOWS ==========
      const workflows = getWorkflowsPourGroupe(groupe);
      yPos = ajouterCartePDF(doc, yPos, 'WORKFLOWS', workflows, (wf) => {
        let details = wf.nom;
        const parts = [];
        if (wf.collections && wf.collections.length > 0) {
          parts.push(`Collections: ${wf.collections.join(', ')}`);
        }
        if (wf.metadonnees && wf.metadonnees.length > 0) {
          parts.push(`Metadonnees: ${wf.metadonnees.join(', ')}`);
        }
        if (parts.length > 0) {
          details += ` - ${parts.join(' | ')}`;
        }
        return { texte: details };
      });

      // ========== CARTE SAVED SEARCHES ==========
      const savedSearchesDuGroupe = savedSearchesData.savedSearches.filter(s =>
        s.groupes && s.groupes.some(g => g.nom === nomGroupe)
      );
      yPos = ajouterCartePDF(doc, yPos, 'SAVED SEARCHES', savedSearchesDuGroupe, (s) => {
        const perm = (s.groupes.find(g => g.nom === nomGroupe) || {}).permission || '';
        const detail = [s.nom];
        if (s.metadataView) detail.push(`Vue: ${s.metadataView}`);
        if (perm) detail.push(perm);
        return {
          texte: detail.join(' — '),
          couleur: perm === 'Read Only' ? [52, 152, 219] : [46, 204, 113],
          label: perm === 'Read Only' ? 'Lecture' : 'L/E'
        };
      });

      // ========== CARTE STORAGES ==========
      const storagesDuGroupe = storagesData.storages.filter(s =>
        s.groupes && s.groupes.some(g => g.nom === nomGroupe)
      );
      yPos = ajouterCartePDF(doc, yPos, 'STORAGES', storagesDuGroupe, (s) => {
        const perm = (s.groupes.find(g => g.nom === nomGroupe) || {}).permission || '';
        return {
          texte: s.nom,
          couleur: perm === 'Read Only' ? [52, 152, 219] : [46, 204, 113],
          label: perm === 'Read Only' ? 'Lecture' : 'L/E'
        };
      });
    });
    
    // ========== PAGE ARBORESCENCE COLLECTIONS + GROUPES ==========
    doc.addPage();
    genererPageArborescenceGroupes(doc);
    
    // ========== PAGE ARBORESCENCE COLLECTIONS + METADATA VIEWS ==========
    doc.addPage();
    genererPageArborescenceMetadataViews(doc);
    
    
  } else {
    let yPos = 45;
    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text('Aucun groupe sélectionné.', 15, yPos);
  }
  
  doc.save(`matrice-permissions_${new Date().toISOString().split('T')[0]}.pdf`);
}

function ajouterCartePDF(doc, yPos, titre, items, formatFn) {
  // Vérifier si assez d'espace pour au moins le titre + 2 lignes
  if (yPos > 250) {
    doc.addPage();
    yPos = 50;
  }
  
  const startY = yPos;
  let currentPageStart = yPos;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  
  // Titre de carte
  doc.setFillColor(245, 245, 245);
  doc.rect(15, yPos, 180, 8, 'F');
  doc.rect(15, yPos, 180, 8, 'S');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.setFont(undefined, 'bold');
  doc.text(titre, 18, yPos + 5.5);
  yPos += 10;
  
  // Contenu
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  
  if (!items || items.length === 0) {
    doc.text('Aucun élément', 18, yPos + 3);
    yPos += 5;
  } else {
    items.forEach((item, idx) => {
      // Vérifier si on doit changer de page AVANT d'écrire l'item
      if (yPos > 265) {
        // Fermer la carte sur cette page
        doc.rect(15, currentPageStart, 180, yPos - currentPageStart, 'S');
        
        // Nouvelle page
        doc.addPage();
        yPos = 50;
        currentPageStart = yPos;
        
        // Redessiner titre de carte (continuation)
        doc.setFillColor(245, 245, 245);
        doc.rect(15, yPos, 180, 8, 'F');
        doc.rect(15, yPos, 180, 8, 'S');
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        doc.setFont(undefined, 'bold');
        doc.text(`${titre} (suite)`, 18, yPos + 5.5);
        yPos += 10;
        
        // Réinitialiser style contenu
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
      }
      
      const data = formatFn(item);
      let xPos = 18;
      
      // Si couleur/label (pour collections)
      if (data.couleur) {
        doc.setFillColor(data.couleur[0], data.couleur[1], data.couleur[2]);
        doc.rect(xPos, yPos, 3, 3, 'F');
        xPos += 5;
        doc.setTextColor(data.couleur[0], data.couleur[1], data.couleur[2]);
        doc.setFont(undefined, 'bold');
        doc.text(data.label, xPos, yPos + 2.5);
        xPos += doc.getTextWidth(data.label) + 3;
        doc.setTextColor(80, 80, 80);
        doc.setFont(undefined, 'normal');
      }
      
      // Texte principal
      const lines = doc.splitTextToSize(data.texte, 170 - (xPos - 18));
      lines.forEach((line, idx) => {
        doc.text(line, xPos, yPos + 2.5 + (idx * 4));
      });
      yPos += 4 * lines.length;
      
      // Si permissions (pour items)
      if (data.permissions) {
        xPos = 23;
        const maxWidth = 185; // Largeur max de la carte
        
        data.permissions.forEach(perm => {
          let couleur, label;
          if (perm === 'Read') { couleur = [52, 152, 219]; label = 'Read'; }
          else if (perm === 'Write') { couleur = [243, 156, 18]; label = 'Write'; }
          else if (perm === 'Delete' || perm === 'Purge') { couleur = [231, 76, 60]; label = perm; }
          else if (perm === 'Create') { couleur = [155, 89, 182]; label = 'Create'; }
          else if (perm === 'Restore') { couleur = [100, 100, 100]; label = 'Restore'; }
          else if (perm === 'Reindex') { couleur = [150, 150, 150]; label = 'Reindex'; }
          else if (perm === 'Archive') { couleur = [120, 120, 120]; label = 'Archive'; }
          else { couleur = [100, 100, 100]; label = perm; }
          
          doc.setFontSize(8);
          const labelWidth = doc.getTextWidth(label);
          const badgeWidth = 3 + labelWidth + 4; // carré + texte + espace
          
          // Vérifier si on dépasse - retour à la ligne si nécessaire
          if (xPos + badgeWidth > maxWidth) {
            xPos = 23;
            yPos += 4;
          }
          
          doc.setFillColor(couleur[0], couleur[1], couleur[2]);
          doc.rect(xPos, yPos - 1, 2, 2, 'F');
          xPos += 3;
          doc.setTextColor(couleur[0], couleur[1], couleur[2]);
          doc.text(label, xPos, yPos + 1);
          xPos += labelWidth + 4;
        });
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        yPos += 4;
      }
      
      yPos += 1;
    });
  }
  
  // Fermer la carte finale
  doc.rect(15, currentPageStart, 180, yPos - currentPageStart, 'S');
  return yPos + 8;
}

// ==================== ARBORESCENCES ====================

function construireArborescenceCollections() {
  const racine = { nom: 'ROOT', enfants: {}, collections: [] };
  
  // Parcourir UNIQUEMENT les groupes sélectionnés
  const groupesSelectionnes = selectionsComparaison.groupes.map(item => item.data || item);
  const groupesATraiter = groupesSelectionnes.length > 0 ? groupesSelectionnes : groupesData.groupes;
  groupesATraiter.forEach(groupe => {
    if (!groupe.collections) return;
    
    groupe.collections.forEach(col => {
      const chemin = col.chemin;
      const parties = chemin.split('/').filter(p => p);
      
      let noeud = racine;
      parties.forEach((partie, idx) => {
        if (!noeud.enfants[partie]) {
          noeud.enfants[partie] = { 
            nom: partie, 
            enfants: {}, 
            collections: [],
            cheminComplet: parties.slice(0, idx + 1).join('/')
          };
        }
        noeud = noeud.enfants[partie];
      });
      
      // Ajouter info groupe à cette collection
      noeud.collections.push({
        groupe: groupe.nom,
        permission: col.permission,
        vues: groupe.vues || groupe.metadataViews || []
      });
    });
  });
  
  return racine;
}

function genererPageArborescenceGroupes(doc) {
  appliquerHeaderBayard(doc, 'ARBORESCENCE COLLECTIONS - GROUPES', 'Collections avec droits d\'accès par groupe');
  
  let yPos = 50;
  const arbre = construireArborescenceCollections();
  
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  yPos = dessinerArbreSimple(doc, arbre, 15, yPos, 0, 'groupes');
}

function genererPageArborescenceMetadataViews(doc) {
  appliquerHeaderBayard(doc, 'ARBORESCENCE COLLECTIONS - METADATA VIEWS', 'Collections avec catégories et métadonnées');
  
  let yPos = 50;
  const arbre = construireArborescenceCollections();
  
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  yPos = dessinerArbreSimple(doc, arbre, 15, yPos, 0, 'views');
}

function dessinerArbreSimple(doc, noeud, xPos, yPos, niveau, type) {
  const INDENT = 6;
  const MAX_Y = 270;
  
  const enfantsOrdonnes = Object.keys(noeud.enfants).sort();
  
  enfantsOrdonnes.forEach((cle, idx) => {
    const enfant = noeud.enfants[cle];
    const isLast = (idx === enfantsOrdonnes.length - 1);
    
    if (yPos > MAX_Y) {
      doc.addPage();
      appliquerHeaderBayard(doc, type === 'groupes' ? 'COLLECTIONS - GROUPES' : 'COLLECTIONS - VIEWS', '(suite)');
      yPos = 50;
    }
    
    const xActuel = xPos + (niveau * INDENT);
    
    if (niveau > 0) {
      doc.setDrawColor(...CHARTE_BAYARD.gris);
      doc.setLineWidth(0.3);
      const xLigne = xActuel - 3;
      
      if (!isLast) {
        doc.line(xLigne, yPos - 2, xLigne, yPos + 5);
      } else {
        doc.line(xLigne, yPos - 2, xLigne, yPos + 1);
      }
      
      doc.line(xLigne, yPos + 1, xActuel, yPos + 1);
    }
    
    const hasEnfants = Object.keys(enfant.enfants).length > 0;
    doc.setFillColor(...CHARTE_BAYARD.jaune);
    doc.roundedRect(xActuel, yPos - 1, 2.5, 2.5, 0.5, 0.5, 'F');
    
    doc.setFont(undefined, hasEnfants ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...CHARTE_BAYARD.noir);
    doc.text(enfant.nom, xActuel + 4, yPos + 1.5);
    
    yPos += 5;
    
    if (enfant.collections.length > 0) {
      if (type === 'groupes') {
        yPos = afficherGroupesPourCollection(doc, enfant, xActuel + 10, yPos);
      } else {
        yPos = afficherViewsPourCollection(doc, enfant, xActuel + 10, yPos);
      }
    }
    
    yPos = dessinerArbreSimple(doc, enfant, xPos, yPos, niveau + 1, type);
  });
  
  return yPos;
}

function afficherGroupesPourCollection(doc, collection, xPos, yPos) {
  const MAX_Y = 270;
  
  collection.collections.forEach(info => {
    if (yPos > MAX_Y) {
      doc.addPage();
      appliquerHeaderBayard(doc, 'COLLECTIONS - GROUPES', '(suite)');
      yPos = 50;
    }
    
    const couleur = info.permission === 'Read Only' ? CHARTE_BAYARD.bleuFonce : CHARTE_BAYARD.vertEau;
    doc.setFillColor(...couleur);
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    
    const nom = info.groupe.length > 40 ? info.groupe.substring(0, 40) + '...' : info.groupe;
    const badgeWidth = doc.getTextWidth(nom) + 4;
    
    doc.roundedRect(xPos, yPos - 2, badgeWidth, 3.5, 0.5, 0.5, 'F');
    doc.text(nom, xPos + 2, yPos);
    
    yPos += 4.5;
  });
  
  return yPos + 2;
}

function afficherViewsPourCollection(doc, collection, xPos, yPos) {
  const MAX_Y = 270;
  const MARGE_GAUCHE = 15;   // Fixe — indépendant de l'indentation
  const COL_VUE_WIDTH = 35;
  const COL_META_WIDTH = 145; // 15+35+145=195mm

  const vuesSet = new Set();
  collection.collections.forEach(info => {
    info.vues.forEach(v => vuesSet.add(v.nom || v));
  });

  const categories = new Map();
  Array.from(vuesSet).forEach(vue => {
    const categorie = categoriesData.categories.find(cat =>
      cat.metadataViews && cat.metadataViews.includes(vue) &&
      cat.appliqueeA && cat.appliqueeA.includes('collections')
    );
    const catNom = categorie ? categorie.nom : 'Sans catégorie';
    if (!categories.has(catNom)) categories.set(catNom, []);
    categories.get(catNom).push(vue);
  });

  if (categories.size === 0) return yPos;

  // Wrapping manuel : découpe le texte en lignes qui tiennent dans largeurMm
  // Police DOIT être définie avant d'appeler cette fonction
  function wrapManuel(texte, largeurMm) {
    const mots = texte.split(' ');
    const lignes = [];
    let courante = '';
    for (const mot of mots) {
      const essai = courante ? courante + ' ' + mot : mot;
      if (courante && doc.getTextWidth(essai) > largeurMm) {
        lignes.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    }
    if (courante) lignes.push(courante);
    return lignes;
  }

  categories.forEach((vues, catNom) => {
    if (yPos > MAX_Y) {
      doc.addPage();
      appliquerHeaderBayard(doc, 'COLLECTIONS - VIEWS', '(suite)');
      yPos = 50;
    }

    // Bandeau catégorie
    doc.setFillColor(...CHARTE_BAYARD.jaune);
    doc.roundedRect(MARGE_GAUCHE, yPos, COL_VUE_WIDTH + COL_META_WIDTH, 5, 1, 1, 'F');
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...CHARTE_BAYARD.noir);
    doc.text(catNom, MARGE_GAUCHE + 2, yPos + 3.5);
    yPos += 6;

    vues.forEach(vue => {
      // Collecter métadonnées
      const metas = [];
      metadonneesData.metadonnees.forEach(m => {
        const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
        if (views.includes(vue)) metas.push(m.nom);
      });
      const metasTexte = metas.length > 0 ? metas.join(', ') : 'Aucune métadonnée';

      // Définir police AVANT de mesurer les largeurs
      doc.setFontSize(5.5);
      doc.setFont(undefined, 'normal');
      const largeur = COL_META_WIDTH - 4;
      const lignes = wrapManuel(metasTexte, largeur);

      const hauteurCellule = Math.max(5, lignes.length * 2.5 + 1);

      if (yPos + hauteurCellule > MAX_Y) {
        doc.addPage();
        appliquerHeaderBayard(doc, 'COLLECTIONS - VIEWS', '(suite)');
        yPos = 50;
      }

      // Cellule VUE
      doc.setFillColor(...CHARTE_BAYARD.beige);
      doc.roundedRect(MARGE_GAUCHE, yPos, COL_VUE_WIDTH, hauteurCellule, 0.5, 0.5, 'F');
      doc.setDrawColor(...CHARTE_BAYARD.gris);
      doc.setLineWidth(0.2);
      doc.roundedRect(MARGE_GAUCHE, yPos, COL_VUE_WIDTH, hauteurCellule, 0.5, 0.5, 'S');
      doc.setFontSize(6);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...CHARTE_BAYARD.noir);
      const vueTexte = vue.length > 20 ? vue.substring(0, 20) + '...' : vue;
      doc.text(vueTexte, MARGE_GAUCHE + 1.5, yPos + 3);

      // Cellule MÉTADONNÉES
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(MARGE_GAUCHE + COL_VUE_WIDTH, yPos, COL_META_WIDTH, hauteurCellule, 0.5, 0.5, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.roundedRect(MARGE_GAUCHE + COL_VUE_WIDTH, yPos, COL_META_WIDTH, hauteurCellule, 0.5, 0.5, 'S');

      // Écrire chaque ligne séparément — string simple, jamais tableau
      const xMeta = MARGE_GAUCHE + COL_VUE_WIDTH + 2;
      const c = metas.length > 0 ? 60 : 180;
      let yTexte = yPos + 2.5;
      for (const ligne of lignes) {
        doc.setFontSize(5.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(c, c, c);
        doc.text(ligne, xMeta, yTexte, { maxWidth: COL_META_WIDTH - 4 });
        yTexte += 2.5;
      }

      yPos += hauteurCellule + 0.5;
    });
    yPos += 2;
  });

  return yPos;
}
function genererPageSommaire(doc) {
  let yPos = 50;
  
  // Titre
  doc.setFontSize(28);
  doc.setTextColor(0, 212, 170);
  doc.setFont(undefined, 'bold');
  doc.text('SOMMAIRE', 105, yPos, { align: 'center' });
  
  yPos += 20;
  
  // Ligne séparatrice
  doc.setDrawColor(0, 212, 170);
  doc.setLineWidth(1);
  doc.line(40, yPos, 170, yPos);
  
  yPos += 15;
  
  // Statistiques en haut
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, 'normal');
  
  const nbGroupes = selectionsComparaison.groupes.length;
  const nbCollections = new Set(selectionsComparaison.groupes.flatMap(g => (g.data || g).collections?.map(c => c.chemin) || [])).size;
  const nbVues = new Set(selectionsComparaison.groupes.flatMap(g => {
    const gr = g.data || g;
    return gr.vues?.map(v => v.nom || v) || gr.metadataViews || [];
  })).size;
  const nbWorkflows = workflowsData.workflows.length;
  
  doc.text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 105, yPos, { align: 'center' });
  yPos += 10;
  
  // Encadré statistiques
  doc.setFillColor(245, 245, 245);
  doc.rect(40, yPos, 130, 35, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(40, yPos, 130, 35, 'S');
  
  yPos += 8;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`${nbGroupes} groupe(s) analysé(s)`, 45, yPos);
  yPos += 7;
  doc.text(`${nbCollections} collection(s) référencée(s)`, 45, yPos);
  yPos += 7;
  doc.text(`${nbVues} metadata view(s) configurée(s)`, 45, yPos);
  yPos += 7;
  doc.text(`${nbWorkflows} workflow(s) défini(s)`, 45, yPos);
  
  yPos += 20;
  
  // Table des matières
  doc.setFontSize(14);
  doc.setTextColor(0, 212, 170);
  doc.setFont(undefined, 'bold');
  doc.text('TABLE DES MATIÈRES', 50, yPos);
  
  yPos += 10;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.setFont(undefined, 'normal');
  
  const sections = [
    { titre: 'Résumé exécutif', page: 2 },
    { titre: 'Glossaire', page: 3 },
    { titre: 'Détails des groupes', page: 4 },
    { titre: 'Arborescence Collections - Groupes', page: 4 + nbGroupes },
    { titre: 'Arborescence Collections - Metadata Views', page: 5 + nbGroupes }
  ];
  
  sections.forEach(section => {
    doc.setFont(undefined, 'normal');
    doc.text(`${section.titre}`, 55, yPos);
    doc.setFont(undefined, 'bold');
    const pageText = `Page ${section.page}`;
    doc.text(pageText, 160, yPos, { align: 'right' });
    
    // Pointillés
    doc.setDrawColor(200, 200, 200);
    doc.setLineDash([1, 2]);
    const textWidth = doc.getTextWidth(section.titre);
    doc.line(55 + textWidth + 3, yPos - 1, 160 - doc.getTextWidth(pageText) - 3, yPos - 1);
    doc.setLineDash([]);
    
    yPos += 8;
  });
  
  // Note en bas
  yPos = 260;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setFont(undefined, 'italic');
  doc.text('Ce document présente la configuration des permissions et droits d\'accès', 105, yPos, { align: 'center' });
  yPos += 4;
  doc.text('pour les groupes sélectionnés dans le système Iconik.', 105, yPos, { align: 'center' });
}

function genererPageResume(doc) {
  let yPos = 50;
  
  // Titre
  doc.setFontSize(22);
  doc.setTextColor(0, 212, 170);
  doc.setFont(undefined, 'bold');
  doc.text('RÉSUMÉ EXÉCUTIF', 105, yPos, { align: 'center' });
  
  yPos += 15;
  doc.setDrawColor(0, 212, 170);
  doc.setLineWidth(0.5);
  doc.line(40, yPos, 170, yPos);
  
  yPos += 12;
  
  // Texte dynamique
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.setFont(undefined, 'normal');
  
  const nbGroupes = selectionsComparaison.groupes.length;
  const groupesNoms = selectionsComparaison.groupes.map(g => (g.data || g).nom).slice(0, 3).join(', ');
  const plusGroupes = nbGroupes > 3 ? ` et ${nbGroupes - 3} autre(s)` : '';
  
  const allCollections = new Set();
  const allVues = new Set();
  selectionsComparaison.groupes.forEach(g => {
    const gr = g.data || g;
    (gr.collections || []).forEach(c => allCollections.add(c.chemin));
    (gr.vues?.map(v => v.nom || v) || gr.metadataViews || []).forEach(v => allVues.add(v));
  });
  
  const collectionsExemples = Array.from(allCollections).slice(0, 2).join(', ');
  const vuesExemples = Array.from(allVues).slice(0, 2).join(', ');
  
  const paragraphes = [
    `Ce document analyse la configuration des permissions pour ${nbGroupes} groupe(s) : ${groupesNoms}${plusGroupes}.`,
    
    `Ces groupes disposent d'accès à ${allCollections.size} collection(s) distincte(s)${allCollections.size > 0 ? ` incluant ${collectionsExemples}` : ''} et ${allVues.size} metadata view(s)${allVues.size > 0 ? ` telles que ${vuesExemples}` : ''}.`,
    
    `Les permissions sont structurées en deux niveaux : lecture seule (Read Only) et lecture/écriture (Read/Write). Chaque groupe possède des droits spécifiques sur les collections, ce qui détermine les actions possibles sur les assets contenus.`,
    
    `Les metadata views contrôlent l'accès aux métadonnées. Les groupes avec accès à une vue particulière peuvent consulter et modifier les champs de métadonnées associés à cette vue. ${allVues.size} vue(s) sont configurée(s) pour ces groupes.`,
    
    `${workflowsData.workflows.length} workflow(s) sont défini(s) dans le système. Ces workflows se déclenchent automatiquement lors du dépôt d'assets dans certaines collections ou lors de la mise à jour de métadonnées spécifiques.`,
    
    `Les pages suivantes détaillent, pour chaque groupe, l'ensemble des collections accessibles, les metadata views autorisées, les rôles système attribués, les items manipulables, et les workflows déclenchables.`
  ];
  
  paragraphes.forEach(p => {
    const lines = doc.splitTextToSize(p, 150);
    lines.forEach(line => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 50;
      }
      doc.text(line, 30, yPos);
      yPos += 5;
    });
    yPos += 3; // Espace entre paragraphes
  });
  
  // Encadré important
  yPos += 5;
  if (yPos > 240) {
    doc.addPage();
    yPos = 50;
  }
  
  doc.setFillColor(255, 248, 225);
  doc.rect(30, yPos, 150, 25, 'F');
  doc.setDrawColor(243, 156, 18);
  doc.setLineWidth(1);
  doc.rect(30, yPos, 150, 25, 'S');
  
  yPos += 8;
  doc.setFontSize(9);
  doc.setTextColor(180, 100, 0);
  doc.setFont(undefined, 'bold');
  doc.text('⚠ IMPORTANT', 35, yPos);
  yPos += 5;
  doc.setFont(undefined, 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Les permissions détaillées dans ce document reflètent l\'état de la configuration', 35, yPos);
  yPos += 4;
  doc.text('au moment de la génération. Toute modification ultérieure nécessite une', 35, yPos);
  yPos += 4;
  doc.text('nouvelle extraction pour garantir l\'exactitude des informations.', 35, yPos);
}

function genererPageGlossaire(doc) {
  let yPos = 50;
  
  // Titre
  doc.setFontSize(22);
  doc.setTextColor(0, 212, 170);
  doc.setFont(undefined, 'bold');
  doc.text('GLOSSAIRE', 105, yPos, { align: 'center' });
  
  yPos += 15;
  doc.setDrawColor(0, 212, 170);
  doc.setLineWidth(0.5);
  doc.line(40, yPos, 170, yPos);
  
  yPos += 12;
  
  const termes = [
    {
      terme: 'Collection',
      def: 'Structure hiérarchique permettant d\'organiser les assets. Les permissions peuvent être définies au niveau de chaque collection, déterminant qui peut consulter ou modifier son contenu.'
    },
    {
      terme: 'Metadata View',
      def: 'Vue regroupant un ensemble de champs de métadonnées. Les groupes avec accès à une vue peuvent consulter et éditer les métadonnées associées à cette vue.'
    },
    {
      terme: 'Groupe',
      def: 'Ensemble d\'utilisateurs partageant les mêmes permissions. Chaque groupe se voit attribuer des accès spécifiques aux collections, metadata views, et workflows.'
    },
    {
      terme: 'Read Only',
      def: 'Permission de lecture seule. Les utilisateurs peuvent consulter le contenu mais ne peuvent pas le modifier, le supprimer ou en créer de nouveau.'
    },
    {
      terme: 'Read/Write',
      def: 'Permission de lecture et écriture. Les utilisateurs peuvent consulter, modifier, créer et parfois supprimer le contenu selon les droits spécifiques.'
    },
    {
      terme: 'Workflow',
      def: 'Processus automatisé déclenché par des événements spécifiques (dépôt dans une collection, modification de métadonnée). Utilisé pour automatiser des tâches récurrentes.'
    },
    {
      terme: 'Rôle (Role)',
      def: 'Ensemble prédéfini de permissions système (Core Functionality, Collaborate, Upload, etc.) attribué aux groupes pour définir leurs capacités dans l\'application.'
    },
    {
      terme: 'Item',
      def: 'Objet ou ressource système (Assets, Collections, Files, Formats, etc.) sur lequel des permissions spécifiques peuvent être appliquées (Read, Write, Delete, Create).'
    }
  ];
  
  doc.setFontSize(9);
  
  termes.forEach(t => {
    if (yPos > 260) {
      doc.addPage();
      yPos = 50;
    }
    
    // Terme
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 212, 170);
    doc.text(t.terme, 30, yPos);
    yPos += 5;
    
    // Définition
    doc.setFont(undefined, 'normal');
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(t.def, 150);
    lines.forEach(line => {
      doc.text(line, 30, yPos);
      yPos += 4;
    });
    
    yPos += 5;
  });
}

// ==================== EXPORT WORD ====================
