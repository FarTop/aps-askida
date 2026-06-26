// snapshot.js
// --------------------------------------------------
// APS – Gestion du snapshot actif (V1)
// --------------------------------------------------

const SNAPSHOT_KEY = "aps:activeSnapshot";

/**
 * Définit le snapshot actif
 */
function setActiveSnapshot(snapshot) {
  if (!snapshot || !snapshot.id) {
    console.warn("[Snapshot] Snapshot invalide");
    return;
  }

  localStorage.setItem(
    SNAPSHOT_KEY,
    JSON.stringify(snapshot)
  );
}

/**
 * Récupère le snapshot actif
 */
function getActiveSnapshot() {
  try {
    return JSON.parse(
      localStorage.getItem(SNAPSHOT_KEY)
    );
  } catch (e) {
    return null;
  }
}

/**
 * Supprime le snapshot actif
 */
function clearActiveSnapshot() {
  localStorage.removeItem(SNAPSHOT_KEY);
}

// Exposition globale (pas de module ES pour l’instant)
window.APS_Snapshot = {
  setActiveSnapshot,
  getActiveSnapshot,
  clearActiveSnapshot
};
