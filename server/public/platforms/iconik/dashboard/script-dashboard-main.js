// script-dashboard-main.js — variables globales définies dans script-dashboard-shared.js
(function () {
  const q = new URLSearchParams(window.location.search);
  let org = q.get('org');
  let domain = q.get('domain');

  if (!org || !domain) {
    try {
      const ctx = JSON.parse(localStorage.getItem('aps:context') || 'null');
      if (ctx) {
        org = org || ctx.org || localStorage.getItem('organisationName');
        domain = domain || ctx.domain || '';
      }
    } catch {}
  }

  // Expose pour debug/usage
  window.APS_CTX = { org, domain };

  console.log('[APS→Iconik] ctx =', window.APS_CTX);
})();

// Charger les données depuis localStorage (robuste) — SoT Settings
function chargerDonnees() {
  // 1) Priorité au loader partagé (safe try/catch)
  if (typeof chargerDonneesShared === 'function') {
    chargerDonneesShared();
  } else {
    // 2) Fallback safe si jamais shared n'est pas chargé
    const safeGet = (k, def) => {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    };

    teamsData         = safeGet('teamsData',         { teams: [] });
    roleGroupsData    = safeGet('roleGroupsData',    { roleGroups: [] });
    groupesData       = safeGet('groupesData',       { groupes: [] }); // rétrocompat
    savedSearchesData = safeGet('savedSearchesData', { savedSearches: [] });
    storagesData      = safeGet('storagesData',      { storages: [] });
    collectionsData   = safeGet('collectionsData',   { collections: [] });
    metadataViewsData = safeGet('metadataViewsData', { metadataViews: [] });
    rolesData         = safeGet('rolesData',         { roles: [] });
    metadonneesData   = safeGet('metadonneesData',   { metadonnees: [] });
    itemsAdvancedData = safeGet('itemsAdvancedData', { items: [] });
    workflowsData     = safeGet('workflowsData',     { workflows: [] });
    automationsData   = safeGet('automationsData',   { automations: [] });
    webhooksData      = safeGet('webhooksData',      { webhooks: [] });
    customActionsData = safeGet('customActionsData', { customActions: [] });
    categoriesData    = safeGet('categoriesData',    { categories: [] });
    appTokensData     = safeGet('appTokensData',     { appTokens: [] });
  }

  // Normalisations minimales attendues par le canvas
  if (!teamsData.teams) teamsData.teams = [];
  if (!roleGroupsData.roleGroups) roleGroupsData.roleGroups = [];

  // Alias rétrocompatibilité (certains morceaux utilisent groupesData)
  groupesData = { groupes: teamsData.teams };
}

// Remplir une liste déroulante
function remplirListe(selectId, data, property = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">-- Sélectionnez --</option>';
  if (!data) return;
  data.forEach(item => {
    const option = document.createElement('option');
    option.value = property ? item[property] : item;
    option.textContent = property ? item[property] : item;
    select.appendChild(option);
  });
}

// Fonction pour afficher les données par groupe
function afficherDonneesParTeam() {
  // Ancienne UI — géré par canvas
}

// Alias pour compatibilité HTML
function afficherDonneesParRoleGroup() {
  // Ancienne UI — géré par canvas
}

// Fonction pour afficher les collections liées à un groupe dans la carte COLLECTION
function afficherCollectionsPourGroupe(groupe) {
  const badgesEl = document.getElementById('automationsBadgesCollection');
  if (badgesEl) badgesEl.innerHTML = '';

  if (!groupe || !groupe.collections || groupe.collections.length === 0) {
    (document.getElementById('permissionsCollection')||{}).innerHTML = '<p>Aucune collection associée.</p>';
    return;
  }

  let html = '<h3>Collections liées à ce groupe :</h3><ul>';
  groupe.collections.forEach(collection => {
    const permissionClass = collection.permission === 'Read Only' ? 'permission-readonly' : 'permission-readwrite';
    html += `<li><span class="${permissionClass}">${collection.chemin}</span></li>`;
  });
  html += '</ul>';
  (document.getElementById('permissionsCollection')||{}).innerHTML = html;

  // Badges automations — agrégat sur toutes les collections de la Team
  if (badgesEl) {
    const chemins = groupe.collections.map(c => typeof c === 'string' ? c : c.chemin);
    const autoLiees = (automationsData.automations || []).filter(a =>
      (a.triggers || []).some(t => {
        const cfg = t.config || {};
        return (t.type === 'asset.added_to_collection' && (cfg.collections || []).some(c => chemins.includes(c))) ||
               ['asset.new','asset.archived','asset.restored','asset.shared','asset.not_modified','approval.status_changed','asset.created_days_ago'].includes(t.type);
      })
    );
    const whLiees = (webhooksData.webhooks || []).filter(wh => ['Assets','Collections'].includes(wh.eventType));
    const caLiees = (customActionsData.customActions || []).filter(ca => ['Asset','Collection','Bulk'].includes(ca.context));

    badgesEl.innerHTML =
      genererBadgesAutomations(autoLiees, '#00d4aa', '⚙️') +
      genererBadgesAutomations(whLiees, '#e67e22', '🔔') +
      genererBadgesAutomations(caLiees, '#9b59b6', '⚡');
  }
}

// Fonction pour afficher les MD Views liées à un groupe dans la carte MD VIEW
function afficherMDViewsPourGroupe(groupe) {
  const badgesEl = document.getElementById('automationsBadgesMDView');
  if (badgesEl) badgesEl.innerHTML = '';

  if (!groupe || !groupe.vues || groupe.vues.length === 0) {
    (document.getElementById('permissionsMDView')||{}).innerHTML = '<p>Aucune MD View associée.</p>';
    return;
  }

  let html = '<h3>MD Views liées à ce groupe :</h3><ul>';
  groupe.vues.forEach(mv => {
    const permissionClass = mv.permission === 'Read Only' ? 'permission-readonly' : 'permission-readwrite';
    html += `<li><span class="${permissionClass}">${mv.nom}</span></li>`;
  });
  html += '</ul>';
  (document.getElementById('permissionsMDView')||{}).innerHTML = html;

  // Badges automations — agrégat sur toutes les MD Views de la Team
  if (badgesEl) {
    const nomsMDViews = groupe.vues.map(v => typeof v === 'string' ? v : v.nom);
    // Métadonnées appartenant à ces views
    const metas = metadonneesData.metadonnees
      .filter(m => { const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []); return views.some(v => nomsMDViews.includes(v)); })
      .map(m => m.nom);

    const autoLiees = (automationsData.automations || []).filter(a =>
      (a.triggers || []).some(t =>
        t.type === 'metadata.changed' && (!t.config?.metadataField || metas.includes(t.config.metadataField))
      )
    );
    const whLiees = (webhooksData.webhooks || []).filter(wh =>
      ['Metadata','Metadata Fields','Metadata Views'].includes(wh.realm) || wh.eventType === 'Metadata'
    );
    const caLiees = (customActionsData.customActions || []).filter(ca =>
      nomsMDViews.includes(ca.metadataView)
    );

    badgesEl.innerHTML =
      genererBadgesAutomations(autoLiees, '#00d4aa', '⚙️') +
      genererBadgesAutomations(whLiees, '#e67e22', '🔔') +
      genererBadgesAutomations(caLiees, '#9b59b6', '⚡');
  }
}

// Fonction pour afficher les rôles liés à un groupe dans la carte ROLE
function afficherRolesPourGroupe(groupe) {
  if (!groupe || !groupe.fonctionnalites || groupe.fonctionnalites.length === 0) {
    (document.getElementById('permissionsRole')||{}).innerHTML = '<p>Aucun rôle associé.</p>';
    return;
  }

  let html = '<h3>Rôles liés à ce groupe :</h3><ul>';
  groupe.fonctionnalites.forEach(role => {
    html += `<li><span class="permission-readwrite">${role}</span></li>`;
  });
  html += '</ul>';
  (document.getElementById('permissionsRole')||{}).innerHTML = html;
}

// Fonction pour afficher les items (permissions avancées) pour un groupe
function afficherItemsPourGroupe(groupe) {
  console.log('=== afficherItemsPourGroupe ===');
  console.log('Groupe:', groupe.nom);
  
  if (!groupe || !groupe.fonctionnalites || groupe.fonctionnalites.length === 0) {
    (document.getElementById('permissionsItems')||{}).innerHTML = '<p>Ce groupe n\'a aucun rôle, donc aucun item accessible.</p>';
    return;
  }

  console.log('Rôles du groupe:', groupe.fonctionnalites);

  // Récupérer tous les items accessibles via les rôles du groupe
  const itemsAccessibles = [];
  const itemsMap = new Map(); // Pour éviter les doublons et merger les rôles

  itemsAdvancedData.items.forEach(item => {
    if (!item.assignations || item.assignations.length === 0) return;
    
    // Vérifier si l'item a au moins un rôle du groupe
    const assignationsCorrespondantes = item.assignations.filter(assignation => 
      groupe.fonctionnalites.includes(assignation.role)
    );
    
    if (assignationsCorrespondantes.length > 0) {
      // Merger toutes les permissions des différents rôles
      const toutesPermissions = new Set();
      const rolesCommuns = [];
      
      assignationsCorrespondantes.forEach(assignation => {
        rolesCommuns.push(assignation.role);
        assignation.permissions.forEach(perm => toutesPermissions.add(perm));
      });
      
      itemsMap.set(item.nom, {
        nom: item.nom,
        permissions: Array.from(toutesPermissions),
        rolesCommuns: rolesCommuns,
        id: item.id
      });
    }
  });

  // Convertir la Map en array et trier par nom
  const itemsArray = Array.from(itemsMap.values()).sort((a, b) => a.nom.localeCompare(b.nom));

  console.log('Items accessibles:', itemsArray.length);

  if (itemsArray.length === 0) {
    (document.getElementById('permissionsItems')||{}).innerHTML = '<p>Aucun item accessible avec les rôles de ce groupe.</p>';
    return;
  }

  let html = `<h3>Items accessibles (${itemsArray.length}) :</h3>`;
  html += '<div style="max-height: 500px; overflow-y: auto;">';
  
  itemsArray.forEach(item => {
    html += '<div style="background-color: rgba(155, 89, 182, 0.1); padding: 12px; margin: 8px 0; border-left: 3px solid #9b59b6; border-radius: 4px;">';
    html += `<div style="margin-bottom: 5px;"><strong>📄 ${item.nom}</strong></div>`;
    
    // Afficher les rôles donnant accès
    html += '<div style="font-size: 12px; color: #666; margin-bottom: 5px;">';
    html += `<strong>Via rôle(s) :</strong> ${item.rolesCommuns.join(', ')}`;
    html += '</div>';
    
    // Afficher les permissions
    html += '<div style="font-size: 12px; color: #444;">';
    html += '<strong>Permissions :</strong> ';
    
    // Afficher les permissions avec des badges colorés
    const permissionsBadges = item.permissions.map(perm => {
      let color = '#3498db'; // Bleu par défaut
      if (perm === 'Read') color = '#2ecc71';
      if (perm === 'Write') color = '#f39c12';
      if (perm === 'Delete' || perm === 'Purge') color = '#e74c3c';
      if (perm === 'Create') color = '#9b59b6';
      
      return `<span style="background-color: ${color}; color: white; padding: 2px 6px; border-radius: 3px; margin-right: 4px; font-size: 10px; display: inline-block; margin-bottom: 2px;">${perm}</span>`;
    }).join('');
    
    html += permissionsBadges;
    html += '</div>';
    html += '</div>';
  });
  
  html += '</div>';
  (document.getElementById('permissionsItems')||{}).innerHTML = html;
}

// Fonction helper pour afficher les métadonnées des MD Views
function afficherMetadonneesPourMDViews(mdViews) {
  const badgesEl = document.getElementById('automationsBadgesMetadata');
  if (badgesEl) badgesEl.innerHTML = '';

  if (!mdViews || mdViews.length === 0) {
    (document.getElementById('permissionsMetadata')||{}).innerHTML = '<p>Aucune MD View.</p>';
    return;
  }

  const metadonneesSet = new Map();
  metadonneesData.metadonnees.forEach(m => {
    const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
    const found = views.some(v => mdViews.includes(v));
    if (found) metadonneesSet.set(m.nom, m);
  });

  if (metadonneesSet.size === 0) {
    (document.getElementById('permissionsMetadata')||{}).innerHTML = '<p>Aucune métadonnée.</p>';
    return;
  }

  let html = `<h3>Métadonnées (${metadonneesSet.size}) :</h3><ul>`;
  metadonneesSet.forEach(m => html += `<li>${m.nom}</li>`);
  html += '</ul>';
  (document.getElementById('permissionsMetadata')||{}).innerHTML = html;

  // Badges automations — triggers metadata.changed sur ces métadonnées
  if (badgesEl) {
    const nomsMetas = Array.from(metadonneesSet.keys());
    const autoLiees = (automationsData.automations || []).filter(a =>
      (a.triggers || []).some(t =>
        t.type === 'metadata.changed' && (!t.config?.metadataField || nomsMetas.includes(t.config.metadataField))
      )
    );
    const whLiees = (webhooksData.webhooks || []).filter(wh =>
      wh.eventType === 'Metadata' || wh.realm === 'Metadata'
    );
    badgesEl.innerHTML =
      genererBadgesAutomations(autoLiees, '#00d4aa', '⚙️') +
      genererBadgesAutomations(whLiees, '#e67e22', '🔔');
  }
}

// Fonction pour afficher les workflows accessibles par un groupe
// Fonction pour récupérer workflows accessibles par un groupe
function getWorkflowsPourGroupe(groupe) {
  const workflows = [];
  
  // Via collections
  if (groupe.collections) {
    groupe.collections.forEach(col => {
      const wfs = workflowsData.workflows.filter(wf => 
        wf.collections && wf.collections.includes(col.chemin)
      );
      workflows.push(...wfs);
    });
  }
  
  // Via métadonnées (via MD Views)
  const vues = groupe.vues || groupe.metadataViews || [];
  vues.forEach(vue => {
    const nomVue = typeof vue === 'string' ? vue : vue.nom;
    const metas = metadonneesData.metadonnees.filter(m => 
      (m.metadataViews && m.metadataViews.includes(nomVue)) || m.metadataView === nomVue
    );
    metas.forEach(meta => {
      const wfs = workflowsData.workflows.filter(wf => 
        wf.metadonnees && wf.metadonnees.includes(meta.nom)
      );
      workflows.push(...wfs);
    });
  });
  
  // Dédupliquer par nom
  const unique = [];
  const noms = new Set();
  workflows.forEach(wf => {
    if (!noms.has(wf.nom)) {
      noms.add(wf.nom);
      unique.push(wf);
    }
  });
  
  return unique;
}

function afficherWorkflowsPourGroupe(groupe) {
  // Conservé pour rétrocompatibilité exports — redirige vers la nouvelle fonction
  afficherAutomationsPourTeam(groupe);
}

// ==================== MOTEUR DE CORRÉLATION AUTOMATIONS ====================

function getTeamCollections(team) {
  return (team.collections || []).map(c => typeof c === 'string' ? c : c.chemin).filter(Boolean);
}

function getTeamMDViews(team) {
  return (team.vues || team.metadataViews || []).map(v => typeof v === 'string' ? v : v.nom).filter(Boolean);
}

function getTeamStorages(team) {
  return (team.storages || []).map(s => typeof s === 'string' ? s : s.nom).filter(Boolean);
}

function getTeamMetadonnees(team) {
  const vues = getTeamMDViews(team);
  const metas = new Set();
  metadonneesData.metadonnees.forEach(m => {
    const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
    if (views.some(v => vues.includes(v))) metas.add(m.nom);
  });
  return Array.from(metas);
}

function correlationsAutomations(team) {
  const collections = getTeamCollections(team);
  const mdViews = getTeamMDViews(team);
  const storages = getTeamStorages(team);
  const metadonnees = getTeamMetadonnees(team);

  const resultats = { automations: [], webhooks: [], customActions: [] };

  // ── AUTOMATIONS ICONIK ──
  (automationsData.automations || []).forEach(auto => {
    const chemins = [];
    (auto.triggers || []).forEach(trigger => {
      const cfg = trigger.config || {};
      switch (trigger.type) {
        case 'asset.added_to_collection':
          (cfg.collections || []).forEach(c => {
            if (collections.includes(c)) chemins.push({ via: 'Collection', valeur: c, trigger: 'Asset ajouté à la collection' });
          });
          break;
        case 'asset.new':
        case 'asset.archived':
        case 'asset.restored':
        case 'asset.shared':
        case 'asset.not_modified':
        case 'asset.created_days_ago':
          // Ces triggers s'appliquent globalement — on les corrèle si la team a au moins une collection
          if (collections.length > 0) chemins.push({ via: 'Collections de la Team', valeur: collections.join(', '), trigger: trigger.type });
          break;
        case 'metadata.changed':
          if (cfg.metadataField && metadonnees.includes(cfg.metadataField)) {
            chemins.push({ via: 'Métadonnée', valeur: cfg.metadataField, trigger: 'Métadonnée modifiée' });
          } else if (!cfg.metadataField && metadonnees.length > 0) {
            chemins.push({ via: 'Métadonnées de la Team', valeur: metadonnees.join(', '), trigger: 'Métadonnée modifiée' });
          }
          break;
        case 'asset.transferred':
          (cfg.storages || []).forEach(s => {
            if (storages.includes(s)) chemins.push({ via: 'Storage', valeur: s, trigger: 'Asset transféré' });
          });
          if (!cfg.storages && storages.length > 0) chemins.push({ via: 'Storages de la Team', valeur: storages.join(', '), trigger: 'Asset transféré' });
          break;
        case 'approval.status_changed':
          if (collections.length > 0) chemins.push({ via: 'Collections de la Team', valeur: collections.join(', '), trigger: 'Statut approbation modifié' });
          break;
      }
    });
    if (chemins.length > 0) resultats.automations.push({ ...auto, chemins });
  });

  // ── WEBHOOKS ──
  (webhooksData.webhooks || []).forEach(wh => {
    const chemins = [];
    const et = wh.eventType || '';
    const realm = wh.realm || '';

    if ((et === 'Assets' || et === 'Collections' || realm === 'Entity' || realm === 'Contents') && collections.length > 0) {
      chemins.push({ via: 'Collections de la Team', valeur: collections.join(', '), trigger: `Event: ${et}${realm ? ' / Realm: ' + realm : ''}` });
    }
    if ((et === 'Metadata' || realm === 'Metadata' || realm === 'Metadata Fields' || realm === 'Metadata Views') && metadonnees.length > 0) {
      chemins.push({ via: 'Métadonnées de la Team', valeur: metadonnees.join(', '), trigger: `Event: ${et}${realm ? ' / Realm: ' + realm : ''}` });
    }
    if ((et === 'Storages' || realm === 'Storages') && storages.length > 0) {
      chemins.push({ via: 'Storages de la Team', valeur: storages.join(', '), trigger: `Event: ${et}` });
    }
    if (chemins.length > 0) resultats.webhooks.push({ ...wh, chemins });
  });

  // ── CUSTOM ACTIONS ──
  (customActionsData.customActions || []).forEach(ca => {
    const chemins = [];
    if (ca.metadataView && mdViews.includes(ca.metadataView)) {
      chemins.push({ via: 'MD View', valeur: ca.metadataView, trigger: `Context: ${ca.context || 'N/A'}` });
    }
    if (ca.context === 'Collection' && collections.length > 0) {
      chemins.push({ via: 'Collections de la Team', valeur: collections.join(', '), trigger: 'Context: Collection' });
    }
    if ((ca.context === 'Asset' || ca.context === 'Bulk') && collections.length > 0) {
      chemins.push({ via: 'Collections de la Team', valeur: collections.join(', '), trigger: `Context: ${ca.context}` });
    }
    if (chemins.length > 0 && !resultats.customActions.find(x => x.title === ca.title)) {
      resultats.customActions.push({ ...ca, chemins });
    }
  });

  return resultats;
}

// ── Badge inline pour les cartes individuelles ──
function genererBadgesAutomations(items, couleur, emoji) {
  if (!items || items.length === 0) return '';
  return `
    <div style="margin-top:12px;border-top:1px solid #2a2a2a;padding-top:10px;">
      <div style="font-size:11px;color:${couleur};font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${emoji} Automations liées</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${items.map(item => {
          const nom = item.nom || item.name || item.title || 'Sans nom';
          const chemin = item.chemins && item.chemins[0] ? item.chemins[0].trigger : '';
          return `<span style="background:rgba(${couleur === '#00d4aa' ? '0,212,170' : couleur === '#e67e22' ? '230,126,34' : '155,89,182'},0.12);border:1px solid ${couleur};color:${couleur};padding:3px 8px;border-radius:4px;font-size:11px;" title="${chemin}">${emoji} ${nom}</span>`;
        }).join('')}
      </div>
    </div>`;
}

// ── Corrélations par collection individuelle ──
function getAutomationsParCollection(chemin) {
  const res = { automations: [], webhooks: [], customActions: [] };
  (automationsData.automations || []).forEach(auto => {
    const match = (auto.triggers || []).some(t => {
      const cfg = t.config || {};
      return (t.type === 'asset.added_to_collection' && (cfg.collections || []).includes(chemin)) ||
             (['asset.new','asset.archived','asset.restored','asset.shared','asset.not_modified','approval.status_changed'].includes(t.type));
    });
    if (match) res.automations.push(auto);
  });
  (webhooksData.webhooks || []).forEach(wh => {
    if (['Assets','Collections'].includes(wh.eventType)) res.webhooks.push(wh);
  });
  (customActionsData.customActions || []).forEach(ca => {
    if (['Asset','Collection','Bulk'].includes(ca.context)) res.customActions.push(ca);
  });
  return res;
}

function getAutomationsParMDView(nomMDView) {
  const res = { automations: [], webhooks: [], customActions: [] };
  const metas = metadonneesData.metadonnees.filter(m => {
    const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
    return views.includes(nomMDView);
  }).map(m => m.nom);

  (automationsData.automations || []).forEach(auto => {
    const match = (auto.triggers || []).some(t =>
      t.type === 'metadata.changed' && (!t.config?.metadataField || metas.includes(t.config.metadataField))
    );
    if (match) res.automations.push(auto);
  });
  (webhooksData.webhooks || []).forEach(wh => {
    if (['Metadata','Metadata Fields','Metadata Views'].includes(wh.realm) || wh.eventType === 'Metadata') res.webhooks.push(wh);
  });
  (customActionsData.customActions || []).forEach(ca => {
    if (ca.metadataView === nomMDView) res.customActions.push(ca);
  });
  return res;
}

function getAutomationsParMetadonnee(nomMeta) {
  const res = { automations: [], webhooks: [] };
  (automationsData.automations || []).forEach(auto => {
    const match = (auto.triggers || []).some(t =>
      t.type === 'metadata.changed' && (!t.config?.metadataField || t.config.metadataField === nomMeta)
    );
    if (match) res.automations.push(auto);
  });
  (webhooksData.webhooks || []).forEach(wh => {
    if (wh.eventType === 'Metadata' || wh.realm === 'Metadata') res.webhooks.push(wh);
  });
  return res;
}

function getAutomationsParStorage(nomStorage) {
  const res = { automations: [] };
  (automationsData.automations || []).forEach(auto => {
    const match = (auto.triggers || []).some(t =>
      t.type === 'asset.transferred' && (!t.config?.storages || (t.config.storages || []).includes(nomStorage))
    );
    if (match) res.automations.push(auto);
  });
  return res;
}

// ── Affichage carte dédiée AUTOMATIONS ──
function afficherAutomationsPourTeam(team) {
  const container = document.getElementById('permissionsAutomations');
  if (!container) return;

  const { automations, webhooks, customActions } = correlationsAutomations(team);
  const total = automations.length + webhooks.length + customActions.length;

  if (total === 0) {
    container.innerHTML = '<p style="color:#888;font-style:italic;">Aucune automation corrélée à cette Team.</p>';
    return;
  }

  const renderBloc = (items, couleur, emoji, typeLabel, getNom) => {
    if (items.length === 0) return '';
    let html = `<div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:bold;color:${couleur};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${emoji} ${typeLabel} (${items.length})</div>`;
    items.forEach(item => {
      html += `<div style="background:#1a1a1a;border-left:3px solid ${couleur};border-radius:0 6px 6px 0;padding:10px 14px;margin-bottom:8px;">
        <div style="font-weight:bold;color:#fff;font-size:13px;margin-bottom:6px;">${getNom(item)}</div>
        ${(item.chemins || []).map(ch => `
          <div style="font-size:12px;color:#888;display:flex;align-items:baseline;gap:6px;margin-bottom:3px;">
            <span style="color:#555;">via</span>
            <span style="color:${couleur};">${ch.via}</span>
            <span style="color:#555;">→</span>
            <span style="color:#aaa;">${ch.valeur}</span>
            <span style="color:#555;font-style:italic;">(${ch.trigger})</span>
          </div>`).join('')}
      </div>`;
    });
    html += '</div>';
    return html;
  };

  container.innerHTML =
    `<div style="font-size:12px;color:#888;margin-bottom:12px;">${total} automation(s) corrélée(s) à cette Team</div>` +
    renderBloc(automations, '#00d4aa', '⚙️', 'Automations Iconik', i => i.nom || 'Sans nom') +
    renderBloc(webhooks, '#e67e22', '🔔', 'Webhooks', i => i.name || 'Sans nom') +
    renderBloc(customActions, '#9b59b6', '⚡', 'Custom Actions', i => i.title || 'Sans titre');
}

// Fonction pour afficher les catégories pertinentes pour un groupe

function afficherSavedSearchesPourGroupe(groupe) {
  const searches = savedSearchesData.savedSearches.filter(s =>
    s.groupes && s.groupes.some(g => g.nom === groupe.nom)
  );
  if (searches.length === 0) {
    (document.getElementById('permissionsSavedSearch')||{}).innerHTML = '<p>Aucune saved search associée.</p>';
    return;
  }
  let html = '<h3>Saved Searches :</h3><ul>';
  searches.forEach(s => {
    const perm = (s.groupes.find(g => g.nom === groupe.nom) || {}).permission || '';
    const cls = perm === 'Read Only' ? 'permission-readonly' : 'permission-readwrite';
    html += '<li><span class="' + cls + '">' + s.nom + (perm ? ' (' + perm + ')' : '') + '</span></li>';
  });
  html += '</ul>';
  (document.getElementById('permissionsSavedSearch')||{}).innerHTML = html;
}

function afficherStoragesPourGroupe(groupe) {
  const badgesEl = document.getElementById('automationsBadgesStorage');
  if (badgesEl) badgesEl.innerHTML = '';

  const storages = storagesData.storages.filter(s =>
    s.groupes && s.groupes.some(g => g.nom === groupe.nom)
  );
  if (storages.length === 0) {
    (document.getElementById('permissionsStorage')||{}).innerHTML = '<p>Aucun storage associé.</p>';
    return;
  }
  let html = '<h3>Storages :</h3><ul>';
  storages.forEach(s => {
    const perm = (s.groupes.find(g => g.nom === groupe.nom) || {}).permission || '';
    const cls = perm === 'Read Only' ? 'permission-readonly' : 'permission-readwrite';
    html += '<li><span class="' + cls + '">' + s.nom + (perm ? ' (' + perm + ')' : '') + '</span></li>';
  });
  html += '</ul>';
  (document.getElementById('permissionsStorage')||{}).innerHTML = html;

  // Badges automations — triggers asset.transferred sur ces storages
  if (badgesEl) {
    const nomsStorages = storages.map(s => s.nom);
    const autoLiees = (automationsData.automations || []).filter(a =>
      (a.triggers || []).some(t =>
        t.type === 'asset.transferred' && (!t.config?.storages?.length || (t.config.storages || []).some(s => nomsStorages.includes(s)))
      )
    );
    badgesEl.innerHTML = genererBadgesAutomations(autoLiees, '#00d4aa', '⚙️');
  }
}

function afficherCategoriesPourGroupe(groupe) {
  const vues = groupe.vues?.map(v => v.nom || v) || groupe.metadataViews || [];
  
  if (vues.length === 0) {
    (document.getElementById('permissionsCategories')||{}).innerHTML = '<p>Aucune metadata view.</p>';
    return;
  }
  
  // Trouver catégories qui contiennent les vues du groupe
  const categoriesRelevantes = categoriesData.categories.filter(cat => 
    cat.metadataViews && cat.metadataViews.some(mv => vues.includes(mv))
  );
  
  if (categoriesRelevantes.length === 0) {
    (document.getElementById('permissionsCategories')||{}).innerHTML = '<p>Aucune catégorie associée aux metadata views de ce groupe.</p>';
    return;
  }
  
  let html = `<h3>Catégories (${categoriesRelevantes.length}) :</h3><ul>`;
  categoriesRelevantes.forEach(cat => {
    html += `<li><strong>📋 ${cat.nom}</strong><br>`;
    html += `<small style="color: #666;">`;
    
    if (cat.appliqueeA && cat.appliqueeA.length > 0) {
      html += `Objets: ${cat.appliqueeA.join(', ')}<br>`;
    }
    
    // Afficher seulement les vues que le groupe possède
    const vuesDansCategorie = cat.metadataViews.filter(mv => vues.includes(mv));
    if (vuesDansCategorie.length > 0) {
      html += `📊 Views: ${vuesDansCategorie.join(', ')}<br>`;
      
      // Afficher métadonnées associées
      const metasSet = new Set();
      vuesDansCategorie.forEach(v => {
        metadonneesData.metadonnees.forEach(m => {
          const views = m.metadataViews || (m.metadataView ? [m.metadataView] : []);
          if (views.includes(v)) metasSet.add(m.nom);
        });
      });
      
      if (metasSet.size > 0) {
        html += `🏷️ Métadonnées: ${Array.from(metasSet).join(', ')}`;
      }
    }
    
    html += `</small></li>`;
  });
  html += '</ul>';
  (document.getElementById('permissionsCategories')||{}).innerHTML = html;
}

// Fonction helper pour afficher les items par rôles
function afficherItemsParRoles(roles) {
  if (!roles || roles.length === 0) {
    (document.getElementById('permissionsItems')||{}).innerHTML = '<p>Aucun rôle.</p>';
    return;
  }
  
  const itemsMap = new Map();
  itemsAdvancedData.items.forEach(item => {
    if (!item.assignations) return;
    const assignations = item.assignations.filter(a => roles.includes(a.role));
    if (assignations.length > 0) {
      const perms = new Set();
      const rolesCommuns = [];
      assignations.forEach(a => {
        rolesCommuns.push(a.role);
        a.permissions.forEach(p => perms.add(p));
      });
      itemsMap.set(item.nom, {
        nom: item.nom,
        permissions: Array.from(perms),
        rolesCommuns: rolesCommuns
      });
    }
  });
  
  if (itemsMap.size === 0) {
    (document.getElementById('permissionsItems')||{}).innerHTML = '<p>Aucun item.</p>';
    return;
  }
  
  const itemsArray = Array.from(itemsMap.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  let html = `<h3>Items (${itemsArray.length}) :</h3><div style="max-height: 500px; overflow-y: auto;">`;
  itemsArray.forEach(item => {
    html += '<div style="background-color: rgba(155, 89, 182, 0.1); padding: 12px; margin: 8px 0; border-left: 3px solid #9b59b6; border-radius: 4px;">';
    html += `<div style="margin-bottom: 5px;"><strong>📄 ${item.nom}</strong></div>`;
    html += `<div style="font-size: 12px; color: #666; margin-bottom: 5px;"><strong>Via :</strong> ${item.rolesCommuns.join(', ')}</div>`;
    html += '<div style="font-size: 12px;"><strong>Permissions :</strong> ';
    const badges = item.permissions.map(p => {
      let color = '#3498db';
      if (p === 'Read') color = '#2ecc71';
      if (p === 'Write') color = '#f39c12';
      if (p === 'Delete' || p === 'Purge') color = '#e74c3c';
      if (p === 'Create') color = '#9b59b6';
      return `<span style="background-color: ${color}; color: white; padding: 2px 6px; border-radius: 3px; margin-right: 4px; font-size: 10px; display: inline-block;">${p}</span>`;
    }).join('');
    html += badges + '</div></div>';
  });
  html += '</div>';
  (document.getElementById('permissionsItems')||{}).innerHTML = html;
}

// Fonction pour afficher les données par collection
function afficherDonneesParCollection() {
  // Ancienne UI — géré par canvas
}

// Fonction pour afficher les données par MD View
function afficherDonneesParMDView() {
  // Ancienne UI — géré par canvas
}

// Fonction pour afficher les données par rôle

// ==================== SAVED SEARCHES ====================
function afficherDonneesParSavedSearch() {
  // Ancienne UI — géré par canvas
}

// ==================== STORAGES ====================
function afficherDonneesParStorage() {
  // Ancienne UI — géré par canvas
}

function afficherDonneesParRole() {
  // Ancienne UI — géré par canvas
}

// Fonction pour afficher les données par métadonnée
function afficherDonneesParMetadata() {
  // Ancienne UI — géré par canvas
}

// Fonction pour remplir la liste des métadonnées
function remplirListeMetadata() {
  const selectMetadata = document.getElementById('selectMetadata');
  if (!selectMetadata) return;

  selectMetadata.innerHTML = '<option value="">-- Sélectionnez une métadonnée --</option>';
  if (metadonneesData.metadonnees && metadonneesData.metadonnees.length > 0) {
    metadonneesData.metadonnees.forEach(metadata => {
      const option = document.createElement('option');
      option.value = metadata.nom;
      option.textContent = metadata.nom;
      selectMetadata.appendChild(option);
    });
  }
}

// ==================== FONCTIONS DE COMPARAISON ====================

// Fonction pour ajouter un élément à la comparaison
function ajouterAComparaison(type, nom, data) {
  // Géré par script-dashboard-canvas.js
}

// Fonction pour afficher la carte de comparaison
function afficherComparaison() {
  // Géré par script-dashboard-canvas.js
}

// Fonction pour retirer un élément de la comparaison
function retirerDeComparaison(type, index) {
  // Géré par script-dashboard-canvas.js
}

// Fonction pour vider toute la comparaison
function viderComparaison() {
  // Géré par script-dashboard-canvas.js
}

// Charger les données au démarrage
// DOMContentLoaded géré par script-dashboard-canvas.js

// Export Excel géré par script-dashboard-excel.js
// Export Word géré par script-dashboard-word.js

//Bouton Retour vers AFS
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-return-afs');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // Depuis platforms/iconik/dashboard/ vers public/index.html
    window.location.href = '../../../index.html';
  });
});
