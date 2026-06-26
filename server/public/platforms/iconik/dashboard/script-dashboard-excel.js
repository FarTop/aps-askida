// script-dashboard-excel.js — Export Excel (Dashboard)
// IMPORTANT : ici on n’utilise PAS window.dbcStore / window.selectionsComparaison
// car ces variables sont déclarées en "let" global (donc pas attachées à window).

function _dbcCollectExportRows() {
  // Force synchro des sélections (si dispo)
  try {
    if (typeof dbcSyncSelectionsComparaison === 'function') dbcSyncSelectionsComparaison();
  } catch (e) {}

  // 1) Source prioritaire : selectionsComparaison.groupes (si existant)
  const sel =
    (typeof selectionsComparaison !== 'undefined' &&
     selectionsComparaison &&
     Array.isArray(selectionsComparaison.groupes))
      ? selectionsComparaison.groupes
      : [];

  if (sel.length) {
    return sel.map(g => {
      const data = g.data || {};
      const isTeam = g.icon === '👥';
      const name = g.nom || data.nom || data.name || '';

      const collections = Array.isArray(data.collections) ? data.collections : [];
      const views = Array.isArray(data.vues) ? data.vues : (Array.isArray(data.metadataViews) ? data.metadataViews : []);
      const roles = Array.isArray(data.fonctionnalites) ? data.fonctionnalites : [];

      return {
        name,
        kind: isTeam ? 'Team' : 'Role Group',
        collections: collections.length,
        md_views: views.length,
        roles: roles.length
      };
    });
  }

  // 2) Fallback : déduire depuis le Store / Canvas (si selectionsComparaison vide)
  const hasStore = (typeof dbcStore !== 'undefined' && Array.isArray(dbcStore) && dbcStore.length);
  const hasCassettes = (typeof dbcCassettes !== 'undefined' && Array.isArray(dbcCassettes));

  const src = hasStore ? dbcStore : (hasCassettes ? dbcCassettes : []);

  const groups = src.filter(x => x && (x.type === 'team' || x.type === 'roleGroup'));

  return groups.map(x => {
    const data = x.data || {};
    const name = x.name || data.nom || data.name || '';
    const kind = x.type === 'team' ? 'Team' : 'Role Group';

    const collections = Array.isArray(data.collections) ? data.collections : [];
    const views = Array.isArray(data.vues) ? data.vues : (Array.isArray(data.metadataViews) ? data.metadataViews : []);
    const roles = Array.isArray(data.fonctionnalites) ? data.fonctionnalites : [];

    return {
      name,
      kind,
      collections: collections.length,
      md_views: views.length,
      roles: roles.length
    };
  });
}

function exporterVersExcel() {
  if (typeof window.askidaExportExcel !== 'function') {
    console.error('[Export Excel] askidaExportExcel() introuvable — vérifier _vendor/exceljs/export-exceljs.browser.js');
    return;
  }

  const rows = _dbcCollectExportRows();

  // Debug léger (utile pendant le raccord post-harmonisation)
  console.log('[Export Excel] rows=', rows.length, rows);

  const org = (localStorage.getItem('organisationName') || localStorage.getItem('nomOrganisation') || 'ORG').trim();
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `dashboard_${org}_${date}.xlsx`;

  const columns = [
    { header: 'Nom', key: 'name', width: 36 },
    { header: 'Type', key: 'kind', width: 14 },
    { header: 'Collections', key: 'collections', width: 14, style: { numFmt: '0' } },
    { header: 'MD Views', key: 'md_views', width: 12, style: { numFmt: '0' } },
    { header: 'Rôles', key: 'roles', width: 10, style: { numFmt: '0' } }
  ];

  window.askidaExportExcel(rows, {
    fileName,
    sheetName: 'Dashboard',
    tableName: 'T_DASHBOARD',
    columns
  });
}