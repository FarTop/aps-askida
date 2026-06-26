// aps.js
// --------------------------------------------------
// APS – Viewer wrapper (V1)
// --------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const snapshotLabel = document.getElementById("aps-snapshot");
  const snapshotInfo  = document.getElementById("aps-snapshot-info");
  const openBtn       = document.getElementById("btn-open-viewer");

  if (!snapshotLabel || !snapshotInfo || !openBtn) {
    console.warn("[APS] Éléments DOM manquants");
    return;
  }

  // V1 : snapshot simulé (en attendant DB / sélection)
  const snapshot = {
    id: "snap-qa-2026-04-14",
    label: "QA – Avril 2026",
    platform: "iconik",
    env: "QA",
    source: "sync",
    createdAt: new Date().toISOString()
  };

  // ✅ utilisation du shared snapshot
  window.APS_Snapshot.setActiveSnapshot(snapshot);

  snapshotLabel.textContent =
    `Snapshot actif · ${snapshot.label}`;

  snapshotInfo.textContent =
    `Plateforme : ${snapshot.platform.toUpperCase()} · Environnement : ${snapshot.env}`;

  openBtn.onclick = () => {
    window.location.href = "../core/viewer.html";
  };

  console.log("[APS] Snapshot actif défini :", snapshot);
});