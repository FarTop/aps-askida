/* =======================================================================
   WFD Bus — cross-window notifications (robust)
   - Primary: BroadcastChannel (same-origin / same storage partition)
   - Fallback: localStorage ping + polling (works better with file:// & Electron)
   Exposes: window.WFD_Bus
   ======================================================================= */
(function(){
  if (window.WFD_Bus) return;

  const CHANNEL_NAME = 'wfd-sync';
  const PING_KEY = '__wfd_bus_ping__';
  const POLL_MS = 300;

  function nowIso(){ try { return new Date().toISOString(); } catch { return '' } }
  function safeJsonParse(s){ try { return JSON.parse(s); } catch { return null; } }
  function safeJsonStringify(o){ try { return JSON.stringify(o); } catch { return ''; } }

  // BroadcastChannel (best effort)
  function createBC(){
    if (!('BroadcastChannel' in window)) return null;
    try { return new BroadcastChannel(CHANNEL_NAME); } catch { return null; }
  }

  // localStorage ping (reliable fallback for file://)
  function ping(msg){
    const payload = {
      type: msg.type,
      at: msg.at,
      payload: msg.payload || null,
      nonce: Math.random().toString(36).slice(2) // unique each time
    };
    try { localStorage.setItem(PING_KEY, safeJsonStringify(payload)); return true; }
    catch { return false; }
  }

  const api = {
    channelName: CHANNEL_NAME,
    _bc: null,
    _handler: null,
    _lastNonce: null,
    _poller: null,

    open(){
      if (!api._bc) api._bc = createBC();
      return api._bc;
    },

    close(){
      try { api._bc && api._bc.close(); } catch {}
      api._bc = null;
      if (api._poller) { clearInterval(api._poller); api._poller = null; }
    },

    post(type, payload){
      const msg = { type, at: nowIso(), payload: payload || null };

      // 1) Try BroadcastChannel (may not cross file:// partitions) [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/script-settings.js)[2](https://help.iconik.backlight.co/hc/en-us/articles/25027388219415-Using-Custom-Actions)
      const bc = api.open();
      if (bc) { try { bc.postMessage(msg); } catch {} }

      // 2) Always ping via localStorage (fallback)
      return ping(msg);
    },

    on(handler){
      api._handler = handler;

      // BroadcastChannel receive (if it works in your runtime) [1](https://askida-my.sharepoint.com/personal/farid_radi_askida_fr/Documents/Fichiers%20Microsoft%20Copilot%20Chat/script-settings.js)[2](https://help.iconik.backlight.co/hc/en-us/articles/25027388219415-Using-Custom-Actions)
      const bc = api.open();
      if (bc) {
        bc.onmessage = (ev) => { try { api._handler && api._handler(ev.data); } catch {} };
      }

      // storage event receive (works across many windows)
      window.addEventListener('storage', (e) => {
        if (e.key !== PING_KEY) return;
        const data = safeJsonParse(e.newValue);
        if (!data || !data.nonce || data.nonce === api._lastNonce) return;
        api._lastNonce = data.nonce;
        try { api._handler && api._handler(data); } catch {}
      });

      // polling receive (guaranteed even if storage event is inconsistent)
      if (!api._poller) {
        api._poller = setInterval(() => {
          const data = safeJsonParse(localStorage.getItem(PING_KEY) || '');
          if (!data || !data.nonce || data.nonce === api._lastNonce) return;
          api._lastNonce = data.nonce;
          try { api._handler && api._handler(data); } catch {}
        }, POLL_MS);
      }

      return true;
    }
  };

  window.WFD_Bus = api;
})();
