// APS — server/index.js — 2026-06-24 19:15 — modifié le 2026-06-23
// Serveur Express — point d'entrée APS + frontend statique WFD

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const path        = require('path');

const app  = express();
const PORT = process.env.APS_PORT || 3000;

// ── Chemin vers le frontend ──────────────────────────────────────────────────
const FRONTEND_PATH = process.env.APS_FRONTEND_PATH
  || path.join(__dirname, 'public');

// ── Middleware ────────────────────────────────────────────────────────────────

// Helmet assoupli : l'app APS utilise des scripts/styles inline et des workers
app.use(helmet({
  contentSecurityPolicy: false,   // à réactiver et affiner lors de la consolidation
  crossOriginEmbedderPolicy: false,
}));

app.use(cors());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Frontend statique ─────────────────────────────────────────────────────────
app.use(express.static(FRONTEND_PATH, {
  // Pas de cache agressif pendant la phase de développement
  etag: true,
  lastModified: true,
  maxAge: 0,
}));

// ── Routes API ────────────────────────────────────────────────────────────────
const flowsRouter      = require('./routes/flows');
const connexionsRouter = require('./routes/connexions');
const wfdDataRouter    = require('./routes/wfd-data');
const statusRouter       = require('./routes/status');
const environmentsRouter  = require('./routes/environments');
const platformsRouter     = require('./routes/platforms');
const { router: iconikProxy } = require('./routes/iconik-proxy');
const syncJobsRouter       = require('./routes/sync-jobs');
const wfdEngineRouter      = require('./engine/wfd-engine-express.js');
const ikonDataRouter       = require('./routes/ikon-data');

app.use('/api/flows',      flowsRouter);
app.use('/api/connexions', connexionsRouter);
app.use('/api/status',       statusRouter);
app.use('/api/environments', environmentsRouter);
app.use('/api/platforms',    platformsRouter);
app.use('/api/ikon',         ikonDataRouter);
app.use('/api/jobs',         syncJobsRouter);
app.use('/api/iconik',       iconikProxy);
app.use('/api',            wfdDataRouter);
app.use('/wfd',            wfdEngineRouter.router);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:       'ok',
    service:      'APS — Askida Platform Studio',
    version:      '0.1.0',
    env:          process.env.APS_ENV,
    frontendPath: FRONTEND_PATH,
    time:         new Date().toISOString()
  });
});

// ── Fallback : toute route inconnue renvoie index.html ───────────────────────
// Nécessaire pour que la navigation interne (platforms/iconik/...) fonctionne
// quand l'utilisateur recharge la page directement depuis le navigateur.
// Les routes /api/* et /health sont déjà gérées au-dessus — elles n'arrivent pas ici.
app.get('/{*path}', (req, res) => {
  // Ne pas intercepter les requêtes API
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API non trouvée' });
  }
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  wfdEngineRouter.start().catch(e => console.warn('[WFD] Démarrage engine échoué :', e.message));
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   APS — Askida Platform Studio       ║');
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log(`║   Frontend : ${FRONTEND_PATH}`);
  console.log('');
});

module.exports = app;
