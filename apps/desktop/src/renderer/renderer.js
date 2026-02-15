const envNode = document.getElementById("env");
if (envNode) {
  const info = window.poseChronoDesktop || {};
  envNode.textContent = `${info.platform || "unknown"} / ${info.version || "n/a"}`;
}

