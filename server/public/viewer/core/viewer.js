// viewer/core/viewer.js
// --------------------------------------------------
// APS – Résolution de clé snapshot (V0)
// --------------------------------------------------

function getSnapshotStorageKey(baseKey) {
  if (window.APS_Snapshot && typeof window.APS_Snapshot.getActiveSnapshot === "function") {
    const snap = window.APS_Snapshot.getActiveSnapshot();
    if (snap && snap.id) {
      return `${baseKey}:${snap.id}`;
    }
  }
  return baseKey; // fallback legacy
}

// --------------------------------------------------
// APS – Snapshot context (lecture seule)
// --------------------------------------------------

function getActiveSnapshotSafe() {
  try {
    return window.APS_Snapshot?.getActiveSnapshot?.() || null;
  } catch (e) {
    return null;
  }
}

const APS_ACTIVE_SNAPSHOT = getActiveSnapshotSafe();

if (APS_ACTIVE_SNAPSHOT) {
  console.log(
    "[Viewer] Snapshot actif :",
    APS_ACTIVE_SNAPSHOT.label,
    APS_ACTIVE_SNAPSHOT.env
  );
}

// --------------------------------------------------
// APS – UI badge snapshot (optionnel)
// --------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const badge = document.getElementById("aps-snapshot-badge");
  if (!badge) return;

  const snap = getActiveSnapshotSafe();
  if (!snap) {
    badge.textContent = "Snapshot : non défini";
    return;
  }

  badge.textContent = `Snapshot · ${snap.label} (${snap.env})`;
  console.log("[APS][Viewer] Snapshot actif :", snap);
});
