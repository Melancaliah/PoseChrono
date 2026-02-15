// ================================================================
// MODULE EASTER EGG (GabiGabrol)
// Ce fichier est chargé dynamiquement uniquement si le dossier
// GabContainer/ est présent à la racine du plugin.
// ================================================================

(function () {
  const GAB_BASE = "GabContainer/";

  // --- Sons aléatoires ---
  const RANDOM_SOUNDS = [];
  for (let i = 1; i <= 17; i++) {
    RANDOM_SOUNDS.push(GAB_BASE + "sfx/son" + i + ".mp3");
  }

  // --- Injection du HTML ---
  const container = document.createElement("div");
  container.id = "gab-container";
  container.innerHTML =
    '<div class="deco-image">' +
    '<img id="deco-image" src="' + GAB_BASE + 'GabiGabrol.png" />' +
    "</div>";
  document.body.appendChild(container);

  // --- Injection du CSS ---
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = GAB_BASE + "gab-style.css";
  document.head.appendChild(link);

  // --- Initialisation des interactions ---
  let isGabVisible = false;
  const decoImg = document.getElementById("deco-image");

  if (decoImg) {
    const decoContainer = decoImg.parentElement;
    decoImg.style.cursor = "pointer";

    // Scale dynamique avec la molette via CSS custom property
    let currentScale = 1.3;
    const minScale = 0.5;
    const maxScale = 3.0;
    const scaleStep = 0.1;

    decoContainer.style.setProperty("--deco-scale", currentScale);

    decoContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        currentScale = Math.min(currentScale + scaleStep, maxScale);
      } else {
        currentScale = Math.max(currentScale - scaleStep, minScale);
      }
      decoContainer.style.setProperty("--deco-scale", currentScale);
    });

    decoContainer.addEventListener("click", () => {
      if (typeof SoundManager !== "undefined") {
        SoundManager.playRandom(RANDOM_SOUNDS);
      }
    });
  }

  // --- Raccourci clavier (Ctrl+Alt+Shift+G) ---
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === "KeyG") {
      e.preventDefault();
      isGabVisible = !isGabVisible;
      container.style.display = isGabVisible ? "block" : "none";
    }
  });
})();
