// ================================================================
// ZOOM OVERLAY DRAWING MODE
// ================================================================
// Mode dessin dans le zoom-overlay de l'écran de review

let isZoomDrawingModeActive = false;
let zoomDrawingOverlay = null;
let zoomDrawingCanvas = null;
let zoomDrawingMeasures = null;
let zoomDrawingPreview = null;
let zoomDrawingLightbox = null;
let zoomDrawingCtx = null;
let zoomDrawingMeasuresCtx = null;
let zoomDrawingPreviewCtx = null;
let zoomDrawingLightboxCtx = null;
let zoomDrawingCursorHideHandler = null;
let zoomTargetImage = null;
let zoomCurrentImageSrc = null;
let zoomDrawingToolbar = null;

// Cache pour la persistance des dessins dans le zoom (séparé du cache principal)
const zoomDrawingStateCache = new Map();

function normalizeImageSrcKey(src) {
  if (!src || typeof src !== "string") return "";
  let normalized = src.trim();
  try {
    normalized = decodeURI(normalized);
  } catch (_) {}
  normalized = normalized.replace(/\\/g, "/");
  normalized = normalized.replace(/^file:\/+/, "file:///");
  return normalized.toLowerCase();
}

function getImageSrcCandidates(imageOrSrc) {
  if (!imageOrSrc) return [];

  if (typeof imageOrSrc === "string") {
    const one = imageOrSrc.trim();
    const out = [one];
    try {
      const decoded = decodeURI(one);
      if (decoded && decoded !== one) out.push(decoded);
    } catch (_) {}
    return [...new Set(out)];
  }

  const rawPath = String(imageOrSrc.filePath || "").trim();
  if (!rawPath) return [];

  const normalizedPath = rawPath.replace(/\\/g, "/");
  const encodedPath = encodeURI(normalizedPath);
  const out = [
    `file:///${rawPath}`,
    `file:///${normalizedPath}`,
    `file:///${encodedPath}`,
  ];

  return [...new Set(out)];
}

function cacheHasImageSrc(cache, candidates) {
  if (!cache || !candidates || candidates.length === 0) return false;

  for (const candidate of candidates) {
    if (cache.has(candidate)) return true;
  }

  const normalizedCandidates = new Set(
    candidates.map((candidate) => normalizeImageSrcKey(candidate)),
  );

  for (const key of cache.keys()) {
    if (normalizedCandidates.has(normalizeImageSrcKey(key))) {
      return true;
    }
  }

  return false;
}

function hasSavedDrawingForImage(imageOrSrc) {
  const candidates = getImageSrcCandidates(imageOrSrc);
  if (candidates.length === 0) return false;

  return (
    cacheHasImageSrc(drawingStateCache, candidates) ||
    cacheHasImageSrc(zoomDrawingStateCache, candidates)
  );
}

if (typeof window !== "undefined") {
  window.hasSavedDrawingForImage = hasSavedDrawingForImage;
}

/**
 * Ouvre le mode dessin dans le zoom-overlay
 * @param {HTMLElement} overlay - L'élément zoom-overlay
 * @param {Object} image - L'objet image Eagle avec filePath et id
 */
async function openZoomDrawingMode(overlay, image) {
  if (!overlay || !image) return;

  // Vérifier si déjà actif
  if (isZoomDrawingModeActive) {
    closeZoomDrawingMode();
    return;
  }

  const imgElement = overlay.querySelector("img");
  if (!imgElement) {
    debugLog("Zoom drawing: pas d'image trouvée");
    return;
  }

  zoomTargetImage = imgElement;
  // Utiliser imgElement.src (URL file:///) pour être cohérent avec le mode principal
  zoomCurrentImageSrc = imgElement.src;

  // Calculer les dimensions avec le helper partagé
  const { displayWidth, displayHeight, naturalWidth, naturalHeight } =
    calculateCanvasDimensions(imgElement);

  const drawingWrapper = document.createElement("div");
  drawingWrapper.id = "zoom-drawing-wrapper";
  drawingWrapper.className = "zoom-drawing-wrapper";
  drawingWrapper.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: ${displayWidth}px;
    height: ${displayHeight}px;
    pointer-events: none;
  `;

  // Créer les canvas - CSS doit avoir le même ratio d'aspect que les dimensions internes
  const canvasStyle = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${displayWidth}px;
    height: ${displayHeight}px;
  `;

  // Canvas table lumineuse
  zoomDrawingLightbox = document.createElement("canvas");
  zoomDrawingLightbox.id = "zoom-drawing-lightbox";
  zoomDrawingLightbox.style.cssText = canvasStyle + "pointer-events: none;";

  // Canvas mesures
  zoomDrawingMeasures = document.createElement("canvas");
  zoomDrawingMeasures.id = "zoom-drawing-measures";
  zoomDrawingMeasures.style.cssText = canvasStyle + "pointer-events: none;";

  // Canvas principal
  zoomDrawingCanvas = document.createElement("canvas");
  zoomDrawingCanvas.id = "zoom-drawing-canvas";
  zoomDrawingCanvas.style.cssText = canvasStyle + "pointer-events: none;";

  // Canvas preview (interactions)
  zoomDrawingPreview = document.createElement("canvas");
  zoomDrawingPreview.id = "zoom-drawing-preview";
  zoomDrawingPreview.style.cssText =
    canvasStyle + "pointer-events: auto; cursor: crosshair;";

  // Ajouter les canvas au wrapper
  drawingWrapper.appendChild(zoomDrawingLightbox);
  drawingWrapper.appendChild(zoomDrawingCanvas);
  drawingWrapper.appendChild(zoomDrawingMeasures);
  drawingWrapper.appendChild(zoomDrawingPreview);

  // Insérer le wrapper dans l'overlay
  overlay.insertBefore(drawingWrapper, overlay.querySelector(".zoom-toolbar"));
  zoomDrawingOverlay = drawingWrapper;

  // Réinitialiser le cache du conteneur pour forcer l'utilisation du nouveau conteneur
  ZoomManager._resetContainerCache();

  // Définir les dimensions des canvas (utilise naturalWidth/naturalHeight déjà déclarés plus haut)
  [
    zoomDrawingLightbox,
    zoomDrawingMeasures,
    zoomDrawingCanvas,
    zoomDrawingPreview,
  ].forEach((canvas) => {
    canvas.width = naturalWidth;
    canvas.height = naturalHeight;
  });

  // Initialiser les contextes
  zoomDrawingCtx = zoomDrawingCanvas.getContext("2d", { willReadFrequently: true });
  zoomDrawingMeasuresCtx = zoomDrawingMeasures.getContext("2d", { willReadFrequently: true });
  zoomDrawingPreviewCtx = zoomDrawingPreview.getContext("2d", { willReadFrequently: true });
  zoomDrawingLightboxCtx = zoomDrawingLightbox.getContext("2d", { willReadFrequently: true });

  // Configurer le DrawingManager pour le mode zoom
  // Synchroniser explicitement les éléments zoom avec le DrawingManager
  drawingManager.zoom.canvas = zoomDrawingCanvas;
  drawingManager.zoom.ctx = zoomDrawingCtx;
  drawingManager.zoom.preview = zoomDrawingPreview;
  drawingManager.zoom.previewCtx = zoomDrawingPreviewCtx;
  drawingManager.zoom.measures = zoomDrawingMeasures;
  drawingManager.zoom.measuresCtx = zoomDrawingMeasuresCtx;
  drawingManager.zoom.lightbox = zoomDrawingLightbox;
  drawingManager.zoom.lightboxCtx = zoomDrawingLightboxCtx;
  drawingManager.zoom.targetImage = overlay.querySelector("img");
  drawingManager.setContext('zoom');

  // Restaurer l'état sauvegardé si disponible
  // Priorité : 1) cache zoom, 2) cache du mode principal (même image)
  let savedState = zoomDrawingStateCache.get(zoomCurrentImageSrc);
  let stateSource = "zoom";

  if (!savedState) {
    // Essayer de récupérer l'état du mode dessin principal
    savedState = drawingStateCache.get(zoomCurrentImageSrc);
    stateSource = "main";
  }

  if (savedState) {
    debugLog(
      `Zoom drawing: restauration de l'état depuis le cache ${stateSource}`,
    );
    try {
      await restoreDrawingState(savedState, zoomDrawingCtx, zoomDrawingMeasuresCtx);
    } catch (e) {
      console.error("Zoom drawing state restoration failed:", e);
    }
  } else {
    initFreshDrawingState();
    // Sauvegarder l'état vide initial pour permettre undo du premier trait
    saveDrawingHistory();
  }

  // Créer la toolbar de dessin pour le zoom
  createZoomDrawingToolbar(overlay);

  // Configurer les événements de dessin
  setupZoomDrawingEvents();

  // Écouteur global pour mouseup (pour arrêter le dessin même hors du canvas)
  document.addEventListener("mouseup", handleGlobalMouseUp);
  document.addEventListener("pointerup", handleGlobalMouseUp);

  // Créer le curseur personnalisé pour prévisualiser la taille du pinceau
  createDrawingCursor();

  // Ajouter l'indicateur visuel
  overlay.classList.add("zoom-drawing-active");

  isZoomDrawingModeActive = true;
  finalizeDrawingModeActivation("pencil", "zoom");

  // La fermeture du zoom en cliquant sur l'image est gérée dans plugin.js
  // en vérifiant la classe 'zoom-drawing-active'

  debugLog("Zoom drawing mode: activé");
}

/**
 * Ferme le mode dessin du zoom
 */
function closeZoomDrawingMode() {
  if (!isZoomDrawingModeActive) return;

  // Sauvegarder l'état
  if (
    saveDrawingState(
      zoomDrawingStateCache,
      zoomCurrentImageSrc,
      zoomDrawingCanvas,
      zoomDrawingMeasures,
      zoomDrawingCtx,
      zoomDrawingMeasuresCtx,
    )
  ) {
    debugLog("Zoom drawing: état sauvegardé");
  }

  // Supprimer les éléments
  if (zoomDrawingOverlay) {
    zoomDrawingOverlay.remove();
  }
  if (zoomDrawingToolbar) {
    zoomDrawingToolbar.remove();
  }

  // Supprimer le curseur personnalisé
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (cursor) cursor.remove();

  // Retirer l'indicateur
  const overlay = document.getElementById("zoom-overlay");
  if (overlay) {
    overlay.classList.remove("zoom-drawing-active");
    // Restaurer le comportement de clic sur l'image (permettre la fermeture du zoom)
    const img = overlay.querySelector("img");
    if (img && window.closeZoom) {
      img.onclick = window.closeZoom;
    }
    // Restaurer la toolbar normale du zoom
    const normalToolbar = overlay.querySelector(".zoom-toolbar");
    if (normalToolbar) {
      normalToolbar.style.display = "";
    }
  }

  // Supprimer les écouteurs clavier
  document.removeEventListener("keydown", handleZoomDrawingKeydown);
  document.removeEventListener("keyup", handleZoomDrawingKeyup);

  // Supprimer l'écouteur global mouseup
  document.removeEventListener("mouseup", handleGlobalMouseUp);
  document.removeEventListener("pointerup", handleGlobalMouseUp);

  // Supprimer l'écouteur de curseur
  if (zoomDrawingOverlay && zoomDrawingCursorHideHandler) {
    zoomDrawingOverlay.removeEventListener(
      "mouseout",
      zoomDrawingCursorHideHandler,
    );
    zoomDrawingCursorHideHandler = null;
  }

  // Fermer tous les menus/modals de dessin ouverts
  closeAllDrawingMenus();

  // Réinitialiser keysState
  resetModifierKeys();

  // Réinitialiser le zoom/pan
  resetCanvasZoomPan();

  // Supprimer les scrollbars
  ZoomManager._removeScrollbars();

  // Revenir au contexte normal
  drawingManager.setContext('normal');

  // Réinitialiser les variables
  isZoomDrawingModeActive = false;
  zoomDrawingOverlay = null;
  zoomDrawingCanvas = null;
  zoomDrawingMeasures = null;
  zoomDrawingPreview = null;
  zoomDrawingLightbox = null;
  zoomTargetImage = null;

  // Réinitialiser le cache du conteneur dans le ZoomManager
  ZoomManager._resetContainerCache();

  debugLog("Zoom drawing mode: désactivé");
}

// Helper pour créer un séparateur
const SEP = { type: "separator" };

/**
 * Crée la toolbar de dessin pour le zoom-overlay
 * Utilise les helpers partagés avec populateDrawingToolbar()
 */
function createZoomDrawingToolbar(overlay) {
  // Supprimer toolbar existante
  const existing = document.getElementById("zoom-drawing-toolbar");
  if (existing) existing.remove();

  // Cacher la toolbar normale du zoom (on la remplace)
  const normalToolbar = overlay.querySelector(".zoom-toolbar");
  if (normalToolbar) {
    normalToolbar.style.display = "none";
  }

  const toolbar = document.createElement("div");
  toolbar.id = "zoom-drawing-toolbar";
  toolbar.className = "zoom-drawing-toolbar horizontal";
  toolbar.onclick = (e) => e.stopPropagation();

  // Clic droit pour basculer entre horizontal et vertical
  toolbar.oncontextmenu = (e) => {
    // Ne pas interférer avec les clics droits sur les boutons
    if (
      e.target.closest(".control-btn-small") ||
      e.target.closest(".zoom-tool-btn")
    )
      return;

    e.preventDefault();
    const isHorizontal = toolbar.classList.contains("horizontal");
    toolbar.classList.toggle("horizontal", !isHorizontal);

    // Réajuster la position si nécessaire
    requestAnimationFrame(() => {
      const rect = toolbar.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        toolbar.style.left =
          Math.max(10, window.innerWidth - rect.width - 10) + "px";
      }
      if (rect.bottom > window.innerHeight - 10) {
        toolbar.style.top =
          Math.max(10, window.innerHeight - rect.height - 10) + "px";
      }
    });
  };

  // Créer les outils avec les helpers partagés
  const toolElements = createAllToolButtons({
    btnClass: "control-btn-small zoom-tool-btn",
    toolbar: toolbar,
    toolSelector: ".zoom-tool-btn",
  });

  // Inputs
  const { colorInput, sizeInput } = createStyleInputs({
    colorId: "zoom-drawing-color",
    sizeId: "zoom-drawing-size",
    colorClass: "zoom-color-input",
    sizeClass: "zoom-size-input",
  });

  // Boutons spéciaux
  const lightboxBtn = createLightboxButton({
    btnClass: "control-btn-small",
    context: "zoom",
  });
  const exportBtn = createExportButton({
    btnClass: "control-btn-small",
    context: "zoom",
  });
  const closeBtn = createCloseButton({
    btnClass: "control-btn-small btn-danger-hover",
    onClose: () => closeZoomDrawingMode(),
  });

  // Bouton clear pour le zoom
  const clearBtn = document.createElement("button");
  clearBtn.className = "control-btn-small";
  clearBtn.setAttribute("data-tool", "clear");
  clearBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearDrawing"));
  clearBtn.innerHTML = ICONS.CLEAR;
  clearBtn.onclick = () => {
    clearDrawingCanvas();
  };

  // Bouton clear-measurements pour le zoom
  const clearMeasurementsBtn = document.createElement("button");
  clearMeasurementsBtn.className = "control-btn-small";
  clearMeasurementsBtn.setAttribute("data-tool", "clear-measurements");
  clearMeasurementsBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearMeasurements"));
  clearMeasurementsBtn.innerHTML = ICONS.TRASH_RAYURES;
  clearMeasurementsBtn.onclick = () => {
    clearDrawingMeasurements();
    // Mettre à jour l'état des boutons après suppression
    updateDrawingButtonStates("zoom");
  };

  // ============================================================
  // LAYOUT DE LA ZOOM-DRAWING-TOOLBAR
  // SEP pour ajouter un séparateur visuel
  // ============================================================
  const zoomToolbarLayout = [
    toolElements.pencil,
    toolElements.eraser,
    toolElements.laser,
    toolElements.line,
    toolElements.arrow,
    toolElements.rectangle,
    toolElements.circle,
    clearBtn,
    SEP,
    toolElements.measure,
    toolElements.calibrate,
    toolElements.protractor,
    clearMeasurementsBtn,
    SEP,
    colorInput,
    sizeInput,
    SEP,
    lightboxBtn,
    exportBtn,
    ...(CONFIG.enableZoomInDrawingMode ? [createZoomIndicator(), SEP] : []),
    closeBtn,
  ];

  zoomToolbarLayout.forEach((item) => {
    if (item === SEP) {
      const sep = document.createElement("div");
      sep.className = "zoom-toolbar-separator";
      toolbar.appendChild(sep);
    } else if (item) {
      toolbar.appendChild(item);
    }
  });

  overlay.appendChild(toolbar);
  zoomDrawingToolbar = toolbar;

  // Initialiser l'état des boutons
  updateDrawingButtonStates("zoom");
}

/**
 * Met à jour la table lumineuse en mode zoom
 */
function updateZoomDrawingLightbox() {
  updateLightboxCanvas(zoomDrawingLightbox, zoomDrawingLightboxCtx, "style");
}

/**
 * Configure les événements de dessin pour le mode zoom
 */
function setupZoomDrawingEvents() {
  if (!zoomDrawingPreview) return;

  // Utiliser le helper partagé pour les événements pointer/mouse/wheel/contextmenu
  setupCanvasInputEvents(zoomDrawingPreview, zoomDrawingCanvas, zoomDrawingCtx, "zoom");

  // Détecter quand la souris quitte complètement l'overlay pour cacher le curseur
  const cursorHideHandler = (e) => {
    // Si on quitte le canvas preview pour aller ailleurs (pas vers un enfant)
    if (
      e.target === zoomDrawingPreview &&
      !zoomDrawingPreview.contains(e.relatedTarget)
    ) {
      hideDrawingCursor();
      zoomDrawingPreview.style.cursor = "default";
    }
  };
  zoomDrawingOverlay.addEventListener("mouseout", cursorHideHandler);

  // Stocker le handler pour pouvoir le nettoyer plus tard
  zoomDrawingCursorHideHandler = cursorHideHandler;

  // Ajouter les raccourcis clavier
  document.addEventListener("keydown", handleZoomDrawingKeydown);
  document.addEventListener("keyup", handleZoomDrawingKeyup);
}

/**
 * Met à jour l'UI de la toolbar zoom pour l'outil sélectionné
 */
function updateZoomToolbarSelection(toolName) {
  currentTool = toolName;
  if (zoomDrawingToolbar) {
    zoomDrawingToolbar.querySelectorAll(".zoom-tool-btn").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-tool") === toolName,
      );
    });
  }
  updateDrawingCursor();
}

/**
 * Gère les raccourcis clavier du mode dessin zoom
 */
function handleZoomDrawingKeydown(e) {
  if (!isZoomDrawingModeActive) return;

  // Touches modificateurs
  handleModifierKeyDown(e);

  // Delete/Backspace pour tout effacer (dessin + mesures)
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    clearDrawingCanvas();
    clearDrawingMeasurements();
    return;
  }

  // Raccourcis communs
  const handled = handleCommonDrawingKeydown(e, {
    stopPropagation: true,
    onClose: closeZoomDrawingMode,
    onExport: () => showExportModal("zoom"),
    onLightboxToggle: () => {
      updateZoomDrawingLightbox();
      if (zoomDrawingToolbar) {
        const lightboxBtn = zoomDrawingToolbar.querySelector(
          "[data-tooltip*='lumineuse']",
        );
        if (lightboxBtn) {
          lightboxBtn.innerHTML = lightboxEnabled
            ? ICONS.LIGHT_TABLE_OFF
            : ICONS.LIGHT_TABLE_ON;
          lightboxBtn.classList.toggle("active", lightboxEnabled);
        }
      }
    },
    onToolSelect: updateZoomToolbarSelection,
  });

  if (handled) return;
}

/**
 * Gère le relâchement des touches en mode dessin zoom
 */
function handleZoomDrawingKeyup(e) {
  if (!isZoomDrawingModeActive) return;
  handleModifierKeyUp(e);
}

// ================================================================
// FONCTIONS UTILITAIRES PARTAGÉES
// ================================================================
