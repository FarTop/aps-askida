/* =============================================================================
   APS Data — DataProvider unifié
   Couche d'abstraction sur la persistance locale (localStorage aujourd'hui).

   MIGRATIONS FUTURES :
   - v2 : remplacer _storage par un driver IndexedDB / SQLite
   - v3 : remplacer _storage par un driver API REST (serveur local)
   - v4 : remplacer _storage par un driver API intranet
   → Seul ce fichier change. Tout le reste (moteur, UI) est inchangé.

   Expose : window.APS_Data
   ============================================================================= */
(function () {
  'use strict';
  if (window.APS_Data) return;

  // ── Registre des scopes ────────────────────────────────────────────────────
  // Chaque scope décrit :
  //   key       : clé localStorage (racine)
  //   prop      : propriété dans l'objet stocké qui contient le tableau d'items
  //   empty     : valeur par défaut si absent
  //   globalVar : nom de la variable globale JS correspondante (si hydratée en mémoire)
  //
  // Ordre intentionnel : dépendances avant dépendants (utile pour list() ordonné)
  const SCOPE_REGISTRY = [
    { id: 'collections',      key: 'collectionsData',      prop: 'collections',    empty: [],  globalVar: 'collectionsData'     },
    { id: 'metadataViews',    key: 'metadataViewsData',    prop: 'metadataViews',  empty: [],  globalVar: 'metadataViewsData'   },
    { id: 'metadata',         key: 'metadonneesData',      prop: 'metadonnees',    empty: [],  globalVar: 'metadonneesData'     },
    { id: 'teams',            key: 'teamsData',            prop: 'teams',          empty: [],  globalVar: 'teamsData'           },
    { id: 'users',            key: 'usersData',            prop: 'users',          empty: [],  globalVar: 'usersData'           },
    { id: 'roleGroups',       key: 'roleGroupsData',       prop: 'roleGroups',     empty: [],  globalVar: 'roleGroupsData'      },
    { id: 'roles',            key: 'rolesData',            prop: 'roles',          empty: [],  globalVar: 'rolesData'           },
    { id: 'categories',       key: 'categoriesData',       prop: 'categories',     empty: [],  globalVar: 'categoriesData'      },
    { id: 'savedSearches',    key: 'savedSearchesData',    prop: 'savedSearches',  empty: [],  globalVar: 'savedSearchesData'   },
    { id: 'storages',         key: 'storagesData',         prop: 'storages',       empty: [],  globalVar: 'storagesData'        },
    { id: 'webhooks',         key: 'webhooksData',         prop: 'webhooks',       empty: [],  globalVar: 'webhooksData'        },
    { id: 'customActions',    key: 'customActionsData',    prop: 'customActions',  empty: [],  globalVar: 'customActionsData'   },
    { id: 'automations',      key: 'automationsData',      prop: 'automations',    empty: [],  globalVar: 'automationsData'     },
    { id: 'relationTypes',    key: 'relationTypesData',    prop: 'relationTypes',  empty: [],  globalVar: 'relationTypesData'   },
    { id: 'items',            key: 'itemsAdvancedData',    prop: 'items',          empty: [],  globalVar: 'itemsAdvancedData'   },
    { id: 'apps',             key: 'appsData',             prop: 'apps',           empty: [],  globalVar: 'appsData'            },
    { id: 'workflows',        key: 'workflowsData',        prop: 'workflows',      empty: [],  globalVar: 'workflowsData'       },
    { id: 'exportLocations',  key: 'exportLocationsData',  prop: 'exportLocations',empty: [],  globalVar: 'exportLocationsData' },

    // Scopes scalaires (valeur unique, pas un tableau)
    { id: 'systemSettings',   key: 'systemSettingsData',   prop: 'settings',       empty: {},  globalVar: null                  },
    { id: 'teamAcls',         key: 'teamAclsData',         prop: null,             empty: [],  globalVar: null,  raw: true        },
    { id: 'relationTypesRaw', key: 'automationsData_raw',  prop: 'automations',    empty: [],  globalVar: null                  },
    { id: 'organisation',     key: 'organisationName',     prop: null,             empty: '',  globalVar: null                  },
    { id: 'appTokens',        key: 'appTokensData',        prop: 'appTokens',      empty: [],  globalVar: 'appTokensData'       },
  ];

  // Index rapide par id
  const _byId = {};
  SCOPE_REGISTRY.forEach(s => { _byId[s.id] = s; });

  // ── _storage : driver de persistance (remplacer ici pour migrer) ───────────
  const _storage = {
    /**
     * Lit une valeur brute.
     * @param {string} key
     * @returns {any|null}
     */
    read(key) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    /**
     * Écrit une valeur brute.
     * @param {string} key
     * @param {any} value
     */
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('[APS_Data] write failed for key:', key, e);
        return false;
      }
    },

    /**
     * Supprime une clé.
     * @param {string} key
     */
    remove(key) {
      try { localStorage.removeItem(key); return true; }
      catch { return false; }
    },

    /**
     * Liste toutes les clés connues présentes.
     * @returns {string[]}
     */
    keys() {
      try { return Object.keys(localStorage); }
      catch { return []; }
    }
  };

  // ── API publique ───────────────────────────────────────────────────────────
  const APS_Data = {

    // Référence au registre (utile pour les adaptateurs et le moteur)
    SCOPES: SCOPE_REGISTRY,

    /**
     * Lit les items d'un scope.
     * Priorise la variable globale JS si hydratée (évite le parse JSON inutile).
     *
     * @param {string} scopeId
     * @returns {Array|Object|string} — tableau d'items, objet scalaire, ou ''
     */
    get(scopeId) {
      const def = _byId[scopeId];
      if (!def) {
        console.warn('[APS_Data] scope inconnu :', scopeId);
        return def?.empty ?? [];
      }

      // 1) Variable globale JS (déjà en mémoire, plus rapide)
      if (def.globalVar) {
        const g = window[def.globalVar];
        if (g != null) {
          return def.prop ? (g[def.prop] ?? def.empty) : g;
        }
      }

      // 2) localStorage
      if (def.prop === null) {
        const raw = localStorage.getItem(def.key);
        if (def.raw) {
          // Tableau JSON direct (ex: teamAclsData)
          try { return raw ? JSON.parse(raw) : def.empty; } catch(e) { return def.empty; }
        }
        // Valeur scalaire directe (ex: organisationName)
        return raw ?? def.empty;
      }

      const obj = _storage.read(def.key);
      if (!obj) return def.empty;
      return obj[def.prop] ?? def.empty;
    },

    /**
     * Écrit les items d'un scope dans le storage ET dans la variable globale.
     *
     * @param {string} scopeId
     * @param {Array|Object|string} data
     * @returns {boolean}
     */
    set(scopeId, data) {
      const def = _byId[scopeId];
      if (!def) {
        console.warn('[APS_Data] scope inconnu :', scopeId);
        return false;
      }

      if (def.prop === null) {
        // Scalaire direct
        try { localStorage.setItem(def.key, typeof data === 'string' ? data : JSON.stringify(data)); return true; }
        catch { return false; }
      }

      // Lire l'objet existant pour ne pas écraser les autres propriétés
      const existing = _storage.read(def.key) || {};
      existing[def.prop] = data;
      existing.date_saved = new Date().toISOString();

      const ok = _storage.write(def.key, existing);

      // Sync variable globale si elle existe
      if (ok && def.globalVar && window[def.globalVar] != null) {
        window[def.globalVar][def.prop] = data;
      }

      return ok;
    },

    /**
     * Liste les scopes disponibles (avec données non vides).
     *
     * @param {boolean} [onlyNonEmpty=false] — si true, filtre les scopes vides
     * @returns {Array<{id, label, count}>}
     */
    list(onlyNonEmpty = false) {
      return SCOPE_REGISTRY
        .map(def => {
          const data = APS_Data.get(def.id);
          const count = Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : (data ? 1 : 0));
          return { id: def.id, key: def.key, prop: def.prop, count };
        })
        .filter(s => !onlyNonEmpty || s.count > 0);
    },

    /**
     * Retourne un snapshot complet du storage APS (pour export/comparaison).
     * @returns {Object}
     */
    snapshot() {
      const out = { _aps_snapshot: true, _date: new Date().toISOString() };
      SCOPE_REGISTRY.forEach(def => {
        out[def.id] = APS_Data.get(def.id);
      });
      return out;
    },

    /**
     * Restaure un snapshot (import).
     * @param {Object} snap
     * @param {string[]} [scopes] — scopes à restaurer (tous si omis)
     */
    restore(snap, scopes) {
      if (!snap || !snap._aps_snapshot) {
        console.warn('[APS_Data] restore: objet invalide (pas un snapshot APS)');
        return false;
      }
      const ids = scopes || SCOPE_REGISTRY.map(d => d.id);
      ids.forEach(id => {
        if (snap[id] !== undefined) APS_Data.set(id, snap[id]);
      });
      return true;
    },

    /**
     * Vide un ou tous les scopes.
     * @param {string} [scopeId] — si omis, vide tout
     */
    clear(scopeId) {
      if (scopeId) {
        const def = _byId[scopeId];
        if (def) _storage.remove(def.key);
      } else {
        SCOPE_REGISTRY.forEach(def => _storage.remove(def.key));
      }
    },

    // Accès direct au driver (pour tests / migration future)
    _driver: _storage,
    _registry: SCOPE_REGISTRY,
  };

  window.APS_Data = APS_Data;

})();
