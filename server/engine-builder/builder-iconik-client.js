// APS — server/engine-builder/builder-iconik-client.js — créé le 2026-08-05
// Port de server/engine/wfd-engine-iconik-client.js — code indépendant, pas
// de require de wfd-engine*.js (le fichier original n'en avait de toute
// façon aucun : encapsulation HTTP pure).
'use strict';

const https = require('https');
const http  = require('http');

class IconikClient {
  constructor(options = {}) {
    this.baseUrl   = (options.baseUrl  || 'https://app.iconik.io').replace(/\/$/, '');
    this.appId     = options.appId     || '';
    this.authToken = options.authToken || '';
  }

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
            const err = new Error(`Iconik API ${res.statusCode} — ${path}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          try { resolve(JSON.parse(data)); }
          catch (_) { resolve(data); }
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
}

module.exports = { IconikClient };
