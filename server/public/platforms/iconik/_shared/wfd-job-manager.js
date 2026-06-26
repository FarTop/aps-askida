/* =============================================================================
   WFD Job Manager — gestion des jobs longs (sync DS/DD/SD, checks)
   
   Expose : window.WFD_JobManager
   
   Usage dans une boucle sync :
     WFD_JobManager.start({ kind: 'SD', label: 'Site → Domaine', env: 'QA', total: 560 });
     for (const item of items) {
       const go = await WFD_JobManager.checkpoint();  // pause/stop ici
       if (!go) break;
       WFD_JobManager.progress(++done, total, item.title);
       // ... traitement ...
     }
     WFD_JobManager.done(results);
   ============================================================================= */
(function () {
  'use strict';
  if (window.WFD_JobManager) return;

  // ── Constantes ────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'wfd_jobs_log';
  const MAX_HISTORY = 20;

  // ── État interne ──────────────────────────────────────────────────────────
  let _job = null;          // job actif
  let _resumeResolve = null; // résout la Promise de pause
  let _listeners = [];       // callbacks UI

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _now() { return new Date().toISOString(); }

  function _notify() {
    _listeners.forEach(fn => { try { fn(_job); } catch(e) {} });
    _updateSidebarBadge();
  }

  function _loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

  function _saveToHistory(job) {
    try {
      const hist = _loadHistory();
      hist.unshift({
        id: job.id, kind: job.kind, label: job.label, env: job.env,
        status: job.status, startedAt: job.startedAt, endedAt: job.endedAt,
        results: job.results, error: job.error,
      });
      if (hist.length > MAX_HISTORY) hist.length = MAX_HISTORY;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hist));
    } catch(e) {}
  }

  function _updateSidebarBadge() {
    const btn = document.getElementById('sb-jobs');
    if (!btn) return;
    const badge = btn.querySelector('.sb-jobs-badge') || (() => {
      const b = document.createElement('span');
      b.className = 'sb-jobs-badge';
      b.style.cssText = 'margin-left:auto;font-size:9px;padding:1px 5px;border-radius:8px;font-weight:700;';
      btn.appendChild(b);
      return b;
    })();

    if (!_job || _job.status === 'idle') {
      badge.style.display = 'none';
      btn.style.color = '';
      return;
    }

    badge.style.display = '';
    if (_job.status === 'running') {
      badge.textContent = '▶';
      badge.style.background = 'rgba(0,212,170,0.2)';
      badge.style.color = 'var(--accent)';
      btn.style.color = 'var(--accent)';
    } else if (_job.status === 'pausing' || _job.status === 'paused') {
      badge.textContent = '⏸';
      badge.style.background = 'rgba(243,156,18,0.2)';
      badge.style.color = 'var(--c-warn)';
      btn.style.color = 'var(--c-warn)';
    } else if (_job.status === 'stopping') {
      badge.textContent = '⏹';
      badge.style.background = 'rgba(231,76,60,0.2)';
      badge.style.color = 'var(--c-danger)';
      btn.style.color = 'var(--c-danger)';
    } else if (_job.status === 'done') {
      badge.textContent = '✓';
      badge.style.background = 'rgba(0,212,170,0.15)';
      badge.style.color = 'var(--accent)';
      btn.style.color = '';
    } else if (_job.status === 'error') {
      badge.textContent = '!';
      badge.style.background = 'rgba(231,76,60,0.2)';
      badge.style.color = 'var(--c-danger)';
      btn.style.color = '';
    }
  }

  // ── API publique ──────────────────────────────────────────────────────────
  const WFD_JobManager = {

    // Démarrer un nouveau job
    start({ kind, label, env, total = 0, scopeLabel = '' }) {
      if (_job && (_job.status === 'running' || _job.status === 'paused')) {
        console.warn('[WFD_JobManager] Un job est déjà en cours :', _job.label);
      }
      _resumeResolve = null;
      _job = {
        id: Date.now(),
        kind,           // 'SD' | 'DD' | 'DS' | 'CHECK' | 'CLEAN'
        label,          // ex: 'Site → Domaine'
        env,            // ex: 'QA'
        scopeLabel,     // ex: 'Collections, Teams'
        status: 'running',
        startedAt: _now(),
        endedAt: null,
        total,
        done: 0,
        currentItem: '',
        results: [],
        error: null,
        _shouldStop: false,
        _shouldPause: false,
      };
      _notify();
      return _job;
    },

    // ── checkpoint() — à appeler dans chaque itération de boucle longue ──
    // Retourne false si le job doit s'arrêter, attend si pausé
    async checkpoint() {
      if (!_job || _job.status === 'idle') return true;

      // Stop demandé
      if (_job._shouldStop) {
        _job.status = 'stopping';
        _notify();
        return false;
      }

      // Pause demandée
      if (_job._shouldPause) {
        _job.status = 'paused';
        _notify();
        await new Promise(resolve => { _resumeResolve = resolve; });
        _job.status = 'running';
        _job._shouldPause = false;
        _notify();

        // Vérifier à nouveau après resume
        if (_job._shouldStop) {
          _job.status = 'stopping';
          _notify();
          return false;
        }
      }

      return true;
    },

    // Mettre à jour la progression
    progress(done, total, currentItem = '') {
      if (!_job) return;
      _job.done = done;
      if (total) _job.total = total;
      _job.currentItem = currentItem;
      _notify();
    },

    // Ajouter un log intermédiaire
    log(msg) {
      if (!_job) return;
      _job.results.push({ at: _now(), msg });
      _notify();
    },

    // Terminer avec succès
    done(results = []) {
      if (!_job) return;
      _job.status = 'done';
      _job.endedAt = _now();
      if (Array.isArray(results)) {
        results.forEach(r => _job.results.push({ at: _now(), msg: r }));
      }
      _saveToHistory(_job);
      _notify();
    },

    // Terminer avec erreur
    fail(error) {
      if (!_job) return;
      _job.status = 'error';
      _job.endedAt = _now();
      _job.error = String(error?.message || error || 'Erreur inconnue');
      _saveToHistory(_job);
      _notify();
    },

    // ── Contrôles ─────────────────────────────────────────────────────────
    pause() {
      if (!_job || _job.status !== 'running') return;
      _job._shouldPause = true;
      _job.status = 'pausing';
      _notify();
    },

    resume() {
      if (!_job || _job.status !== 'paused') return;
      _job._shouldPause = false;
      if (_resumeResolve) { _resumeResolve(); _resumeResolve = null; }
      _notify();
    },

    stop() {
      if (!_job) return;
      _job._shouldStop = true;
      // Si en pause, débloquer d'abord pour que la boucle puisse lire shouldStop
      if (_job.status === 'paused' && _resumeResolve) {
        _resumeResolve();
        _resumeResolve = null;
      }
      _job.status = 'stopping';
      _notify();
    },

    // ── Accesseurs ────────────────────────────────────────────────────────
    getJob() { return _job; },

    getHistory() { return _loadHistory(); },

    clearHistory() {
      try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    },

    isRunning() {
      return _job && (_job.status === 'running' || _job.status === 'pausing' || _job.status === 'paused');
    },

    // ── Observers ─────────────────────────────────────────────────────────
    onChange(fn) {
      _listeners.push(fn);
      return () => { _listeners = _listeners.filter(f => f !== fn); }; // unsubscribe
    },
  };

  window.WFD_JobManager = WFD_JobManager;

})();
