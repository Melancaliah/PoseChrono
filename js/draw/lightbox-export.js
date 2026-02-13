/**
 * Met à jour l'icône du bouton table lumineuse
 * Affiche LIGHT_TABLE_OFF quand activé, LIGHT_TABLE_ON quand désactivé
 */
function updateDrawingLightboxIcon() {
  const btn = document.getElementById("drawing-lightbox-btn");
  if (!btn) return;

  btn.innerHTML = lightboxEnabled
    ? ICONS.LIGHT_TABLE_OFF
    : ICONS.LIGHT_TABLE_ON;
}

/**
 * Met à jour une table lumineuse (fonction commune)
 * @param {HTMLCanvasElement} canvas - Le canvas de la lightbox
 * @param {CanvasRenderingContext2D} ctx - Le contexte du canvas
 * @param {string} showMethod - "class" pour classList, "style" pour style.display
 */
function updateLightboxCanvas(canvas, ctx, showMethod = "class") {
  if (!canvas || !ctx) return;

  clearCanvas(ctx, canvas);

  if (lightboxEnabled) {
    if (showMethod === "class") {
      canvas.classList.remove("hidden");
    } else {
      canvas.style.display = "block";
    }
    ctx.fillStyle = `rgba(255, 255, 255, ${lightboxOpacity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    if (showMethod === "class") {
      canvas.classList.add("hidden");
    } else {
      canvas.style.display = "none";
    }
  }
}

/**
 * Met à jour la table lumineuse en mode overlay
 */
function updateDrawingLightbox() {
  updateLightboxCanvas(drawingLightboxCanvas, drawingLightboxCtx, "class");
}

/**
 * Met à jour l'icône et l'état du bouton lightbox selon le contexte
 * @param {string} context - "drawing" ou "zoom"
 */
function updateLightboxButtonState(context) {
  if (context === "drawing") {
    updateDrawingLightboxIcon();
    const btn = document.getElementById("drawing-lightbox-btn");
    if (btn) btn.classList.toggle("active", lightboxEnabled);
  } else {
    const zoomToolbar = document.getElementById("zoom-drawing-toolbar");
    if (zoomToolbar) {
      const btns = zoomToolbar.querySelectorAll(".control-btn-small");
      btns.forEach((btn) => {
        if (
          btn.innerHTML.includes("lightTable") ||
          btn.getAttribute("data-action") === "lightbox"
        ) {
          btn.innerHTML = lightboxEnabled
            ? ICONS.LIGHT_TABLE_OFF
            : ICONS.LIGHT_TABLE_ON;
          btn.classList.toggle("active", lightboxEnabled);
        }
      });
    }
  }
}

/**
 * Affiche le menu de la table lumineuse pour le mode overlay
 */
function showLightboxMenu(x, y, context = "drawing") {
  const menu = createContextMenu("lightbox-menu", x, y);
  addMenuTitle(menu, i18next.t("draw.menus.lightbox"), ICONS.LIGHT_TABLE_ON);

  // Détermine les fonctions selon le contexte
  const updateLightbox =
    context === "zoom" ? updateZoomDrawingLightbox : updateDrawingLightbox;

  addMenuToggleOption(menu, {
    id: "lightbox-enable-cb",
    label: i18next.t("draw.menus.enable"),
    checked: lightboxEnabled,
    onChange: (checked) => {
      lightboxEnabled = checked;
      updateLightbox();
      updateLightboxButtonState(context);
      menu.remove();
    },
  });

  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.opacity"),
    min: 10,
    max: 100,
    value: Math.round(lightboxOpacity * 100),
    unit: "%",
    onChange: (value) => {
      lightboxOpacity = value / 100;
      updateLightbox();
    },
  });

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}

// Alias pour compatibilité
function showDrawingLightboxMenu(x, y) {
  showLightboxMenu(x, y, "drawing");
}

/**
 * Affiche les options d'export (unifié pour drawing et zoom)
 * @param {string} context - "drawing" ou "zoom"
 */
function showExportModal(context = "drawing") {
  // Supprimer l'ancien modal s'il existe
  const existingModal = document.getElementById("export-options-modal");
  if (existingModal) existingModal.remove();

  const modal = document.createElement("div");
  modal.id = "export-options-modal";
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal-content export-modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${ICONS.EXPORT} ${i18next.t("draw.modals.exportTitle")}</h3>
        <button type="button" class="modal-close-btn" id="cancel-export">×</button>
      </div>
      <div id="export-instructions" class="export-instructions"> ${i18next.t("draw.modals.exportQuestion")}</div>
      <div class="export-options-list">
        <button class="export-option" data-mode="full">
          <span class="export-option-title">${i18next.t("draw.modals.exportFull")}</span>
        </button>

        <button class="export-option" data-mode="transparent">
          <span class="export-option-title">${i18next.t("draw.modals.exportTransparent")}</span>
        </button>

        <button class="export-option" data-mode="white">
          <span class="export-option-title">${i18next.t("draw.modals.exportWhite")}</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Gestionnaires d'événements
  modal.querySelectorAll(".export-option").forEach((btn) => {
    btn.onclick = () => {
      performExport(btn.dataset.mode, context);
      modal.remove();
    };
  });

  modal.querySelector("#cancel-export").onclick = () => modal.remove();
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  // Gestion de la touche Échap - ferme uniquement ce modal
  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      modal.remove();
      document.removeEventListener("keydown", escapeHandler, true);
    }
  };
  document.addEventListener("keydown", escapeHandler, true);
}

// Alias pour compatibilité
function showDrawingExportOptions() {
  showExportModal("drawing");
}

/**
 * Exporte le dessin (unifié pour drawing et zoom)
 * @param {string} mode - "full", "transparent" ou "white"
 * @param {string} context - "drawing" ou "zoom"
 */
function performExport(mode = "full", context = "drawing") {
  // Sélectionner les bonnes ressources selon le contexte
  let imageElement, mainCanvas, measuresCanvas, canvasWidth, canvasHeight;

  if (context === "zoom") {
    if (!zoomTargetImage || !zoomDrawingCanvas) return;
    imageElement = zoomTargetImage;
    mainCanvas = zoomDrawingCanvas;
    measuresCanvas = zoomDrawingMeasures;
    canvasWidth = zoomDrawingCanvas.width;
    canvasHeight = zoomDrawingCanvas.height;
  } else {
    if (!targetImageElement || !drawingCanvas) return;
    imageElement = targetImageElement;
    mainCanvas = drawingCanvas;
    measuresCanvas = drawingMeasures;
    canvasWidth = targetImageElement.naturalWidth;
    canvasHeight = targetImageElement.naturalHeight;
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvasWidth;
  exportCanvas.height = canvasHeight;
  const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });

  switch (mode) {
    case "full":
      // Image + annotations
      if (context === "zoom") {
        exportCtx.drawImage(imageElement, 0, 0, canvasWidth, canvasHeight);
      } else {
        exportCtx.drawImage(imageElement, 0, 0);
      }
      if (measuresCanvas) exportCtx.drawImage(measuresCanvas, 0, 0);
      if (mainCanvas) exportCtx.drawImage(mainCanvas, 0, 0);
      break;

    case "transparent":
      // Juste les annotations
      if (measuresCanvas) exportCtx.drawImage(measuresCanvas, 0, 0);
      if (mainCanvas) exportCtx.drawImage(mainCanvas, 0, 0);
      break;

    case "white":
      // Annotations sur fond blanc
      exportCtx.fillStyle = "white";
      exportCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      if (measuresCanvas) exportCtx.drawImage(measuresCanvas, 0, 0);
      if (mainCanvas) exportCtx.drawImage(mainCanvas, 0, 0);
      break;
  }

  // Télécharger
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
  link.download = `drawing_${mode}_${timestamp}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

// Alias pour compatibilité (ancien nom)
function exportDrawing(mode = "full") {
  performExport(mode, "drawing");
}
