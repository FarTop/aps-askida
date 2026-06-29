// ================================================================
// wfd-engine-iconik-client.js — Client HTTP Iconik
//
// Responsabilités :
//   - Encapsuler tous les appels API Iconik
//   - Gérer les headers d'authentification
//   - Fournir des méthodes métier claires
// ================================================================

'use strict';

const https = require('https');
const http  = require('http');

class IconikClient {
  constructor(options = {}) {
    this.baseUrl  = (options.baseUrl  || 'https://app.iconik.io').replace(/\/$/, '');
    this.appId    = options.appId    || '';
    this.authToken= options.authToken|| '';
  }

  // ── Requête générique ────────────────────────────────────────
  request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url     = new URL(this.baseUrl + path);
      const lib     = url.protocol === 'https:' ? https : http;
      const bodyStr = body ? JSON.stringify(body) : null;

      const headers = {
        'App-ID'      : this.appId,
        'Auth-Token'  : this.authToken,
        'Content-Type': 'application/json',
        'Accept'      : 'application/json',
      };
      if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

      const req = lib.request({
        hostname: url.hostname,
        port    : url.port || (url.protocol === 'https:' ? 443 : 80),
        path    : url.pathname + url.search,
        method,
        headers,
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Iconik API ${res.statusCode} — ${path}`));
          }
          try { resolve(JSON.parse(data)); }
          catch(_) { resolve(data); }
        });
      });

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  get(path)         { return this.request('GET',    path); }
  post(path, body)  { return this.request('POST',   path, body); }
  put(path, body)   { return this.request('PUT',    path, body); }
  patch(path, body) { return this.request('PATCH',  path, body); }
  delete(path)      { return this.request('DELETE', path); }

  // ── Méthodes métier ──────────────────────────────────────────

  // Récupérer un asset par ID
  getAsset(assetId) {
    return this.get(`/API/assets/v1/assets/${assetId}/`);
  }

  // Récupérer les métadonnées d'un asset (vue spécifique)
  getAssetMetadata(assetId, viewId) {
    if (viewId) return this.get(`/API/metadata/v1/assets/${assetId}/views/${viewId}/`);
    return this.get(`/API/assets/v1/assets/${assetId}/`);
  }

  // Récupérer une collection par ID
  getCollection(colId) {
    return this.get(`/API/assets/v1/collections/${colId}/`);
  }

  // Récupérer les métadonnées d'une collection
  getCollectionMetadata(colId, viewId) {
    if (viewId) return this.get(`/API/metadata/v1/collections/${colId}/views/${viewId}/`);
    return this.get(`/API/assets/v1/collections/${colId}/`);
  }

  // Récupérer les collections parentes d'un asset
  getAssetCollections(assetId) {
    return this.get(`/API/assets/v1/assets/${assetId}/collections/`);
  }

  // Recherche par métadonnée
  searchByMetadata(field, value, docType = 'assets') {
    return this.post('/API/search/v1/search/', {
      query     : '',
      doc_types : [docType],
      filter    : {
        operator: 'AND',
        terms   : [{ name: field, value }],
      },
    });
  }

  // Ajouter un asset à une collection (par chemin ou ID)
  addToCollection(assetId, collectionIdOrPath) {
    return this.post(`/API/assets/v1/collections/${collectionIdOrPath}/contents/`, {
      object_type: 'assets',
      object_id  : assetId,
    });
  }

  // Retirer un asset d'une collection
  removeFromCollection(assetId, collectionId) {
    return this.delete(`/API/assets/v1/collections/${collectionId}/contents/assets/${assetId}/`);
  }

  // Mettre à jour les métadonnées d'un asset
  updateAssetMetadata(assetId, viewId, metadataValues) {
    if (viewId) {
      return this.put(`/API/metadata/v1/assets/${assetId}/views/${viewId}/`, {
        metadata_values: metadataValues,
      });
    }
    return this.patch(`/API/assets/v1/assets/${assetId}/`, metadataValues);
  }

  // Appliquer des ACL sur un asset
  setAssetAcl(assetId, entries, replace = false) {
    const ep = `/API/acls/v1/assets/${assetId}/access_control/`;
    const ops = [];
    if (replace) ops.push(this.delete(ep));
    return Promise.all([
      ...ops,
      ...entries.map(e => this.post(ep, {
        group_id   : e.groupId,
        permissions: e.permissions,
      })),
    ]);
  }

  // Résoudre un chemin de collection → ID
  async resolveCollectionPath(colPath) {
    // Chercher par titre dans le chemin
    const parts  = colPath.split('/').map(p => p.trim()).filter(Boolean);
    const title  = parts[parts.length - 1];
    const result = await this.post('/API/search/v1/search/', {
      query    : title,
      doc_types: ['collections'],
    });
    const cols = result.objects || [];
    // Trouver la collection dont le chemin correspond
    return cols.find(c => {
      const fullPath = (c.ancestors || []).map(a => a.title).join('/') + '/' + c.title;
      return fullPath.includes(colPath) || c.title === title;
    }) || cols[0] || null;
  }
}

// ── Export ────────────────────────────────────────────────────────
if (typeof module !== 'undefined') module.exports = { IconikClient };
if (typeof window !== 'undefined') window.IconikClient = IconikClient;
