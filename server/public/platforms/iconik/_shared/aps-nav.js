/**
 * aps-nav.js — Navbar commune APS
 * Usage : apsNav.init({ activePage: 'workflow', extras: 'engines' | 'env-select' | null })
 * Point de retour : commit 2076c6c
 */
const apsNav = (() => {

  const PAGES = [
    { key: 'dashboard',   label: 'DASHBOARD',   href: '../dashboard/dashboard.html'    },
    { key: 'settings',    label: 'SETTINGS',     href: '../settings/settings.html'     },
    { key: 'automations', label: 'AUTOMATIONS',  href: '../automations/automations.html'},
    { key: 'workflow',    label: 'WORKFLOW',     href: '../workflow/workflow.html'      },
    { key: 'recherche',   label: 'RECHERCHE',    href: '../search/search.html'          },
    { key: 'viewer',      label: 'VIEWER',       href: '../viewer/viewer.html'          },
    { key: 'monitoring',  label: 'MONITORING',   href: '../monitoring/monitoring.html'  },
  ];

  function _navButtons(activePage) {
    return PAGES.map(p => {
      if (p.key === activePage) {
        return `<button class="nav-btn active">${p.label}</button>`;
      }
      return `<button class="nav-btn" onclick="location.href='${p.href}'">${p.label}</button>`;
    }).join('\n      ');
  }

  function _extrasHtml(extras) {
    if (extras === 'engines') {
      return `
    <div class="hdr-sep"></div>
    <div class="hdr-engines" id="tb-engines">
      <div class="eng-indicator" id="eng-nr">
        <span class="eng-dot" id="dot-nr"></span>
        <span class="eng-label">Node-RED</span>
        <a class="eng-link" id="link-nr" href="http://192.168.1.102:1881" target="_blank" title="Ouvrir Node-RED">↗</a>
      </div>
      <div class="eng-indicator" id="eng-iconik">
        <span class="eng-dot" id="dot-iconik"></span>
        <span class="eng-label" id="label-iconik">Iconik</span>
      </div>
    </div>`;
    }
    if (extras === 'env-select') {
      return `
    <div class="hdr-sep"></div>
    <div class="hdr-right">
      <select id="env-select" class="aps-select" style="width:180px;font-size:11px;" onchange="onEnvChange()"></select>
    </div>`;
    }
    return '';
  }

  function _headerHtml(activePage, extras) {
    return `<header>
    <div class="hdr-logo">
      <img src="../_images/logo.svg" alt="APS" style="height:26px;width:auto;display:block;">
      <span id="orgBadge" class="hdr-org"></span>
    </div>
    <nav>
      ${_navButtons(activePage)}
    </nav>${_extrasHtml(extras)}
  </header>`;
  }

  function _fetchOrg(pageTitle) {
    fetch('/api/organisation')
      .then(r => r.ok ? r.json() : null)
      .then(org => {
        if (!org) throw new Error('no org');
        const badge = document.getElementById('orgBadge');
        if (badge) badge.textContent = org.name;
        document.title = org.name + ' \u2014 ' + pageTitle;
      })
      .catch(() => {
        const orgName = localStorage.getItem('organisationName')
          || localStorage.getItem('nomOrganisation') || '';
        const badge = document.getElementById('orgBadge');
        if (badge && orgName) badge.textContent = orgName;
        if (orgName) document.title = orgName + ' \u2014 ' + pageTitle;
      });
  }

  function init({ activePage = '', extras = null, pageTitle = 'APS' } = {}) {
    const container = document.getElementById('aps-header');
    if (!container) {
      console.warn('[aps-nav] Élément #aps-header introuvable');
      return;
    }
    container.innerHTML = _headerHtml(activePage, extras);
    _fetchOrg(pageTitle);
  }

  return { init };
})();
