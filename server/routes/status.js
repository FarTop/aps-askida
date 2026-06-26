// APS — server/routes/status.js — 2026-06-23
// Monitoring des services gérés par APS
// Le frontend ne contacte jamais les services directement — tout passe par ici

const express = require('express');
const router  = express.Router();

// ── Registre des services surveillés ─────────────────────────────────────────
// À terme, ce registre sera piloté par App Manager (table ManagedApp en DB)
const SERVICES = {
  'node-red': {
    label: 'Node-RED',
    url:   process.env.APS_NR_URL || 'http://localhost:1881',
  },
  // Futurs services : n8n, ollama, ffmpeg-api...
};

// ── GET /api/status ───────────────────────────────────────────────────────────
// Retourne le statut de tous les services
router.get('/', async (req, res) => {
  const results = await Promise.all(
    Object.entries(SERVICES).map(async ([key, svc]) => {
      const online = await _ping(svc.url);
      return { key, label: svc.label, url: svc.url, online };
    })
  );
  res.json(results);
});

// ── GET /api/status/:service ──────────────────────────────────────────────────
// Retourne le statut d'un service précis
router.get('/:service', async (req, res) => {
  const svc = SERVICES[req.params.service];
  if (!svc) {
    return res.status(404).json({ error: `Service inconnu : ${req.params.service}` });
  }
  const online = await _ping(svc.url);
  res.json({ key: req.params.service, label: svc.label, url: svc.url, online });
});

// ── Ping interne ──────────────────────────────────────────────────────────────
async function _ping(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000); // timeout 3s
    const resp  = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    return resp.ok || resp.status < 500;
  } catch {
    return false;
  }
}

module.exports = router;
