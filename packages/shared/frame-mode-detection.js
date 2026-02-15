// Detect frame mode early to show custom title bar when needed.
(async function detectFrameMode() {
  try {
    const response = await fetch("manifest.json");
    const manifest = await response.json();
    if (manifest.main && manifest.main.frame === false) {
      document.body.classList.add("frameless");
    }
  } catch (_) {
    // Keep current fallback behavior: assume frameless if detection fails.
    document.body.classList.add("frameless");
  }
})();
