// Aliases globaux pour compatibilité (maintenus pour l'existant)
let canvasZoomScale = ZoomManager.scale;
let canvasZoomOffsetX = ZoomManager.offsetX;
let canvasZoomOffsetY = ZoomManager.offsetY;
let currentDrawingImageSrc = drawState.currentImageSrc;

// lightboxState aliases (getters/setters)
Object.defineProperties(window, {
  lightboxEnabled: {
    get() { return drawingManager.lightbox.enabled; },
    set(v) { drawingManager.lightbox.enabled = v; }
  },
  lightboxOpacity: {
    get() { return drawingManager.lightbox.opacity; },
    set(v) { drawingManager.lightbox.opacity = v; }
  }
});

let spacePressStartPos = null;
let shapeEndAtSpacePress = null;
let shapeOffset = null;
let lastMousePosition = { x: 0, y: 0 };
let wasOutsideCanvas = false;
let compassCenter = null;
let compassWaitingSecondClick = false;
let compassDragging = false;
let compassDragMoved = false;

/**
 * Met à jour les tooltips des boutons de la barre d'outils avec les raccourcis dynamiques
 */
function updateDrawingTooltips() {
  const hk = typeof CONFIG !== "undefined" ? CONFIG.HOTKEYS : {};

  const exportBtn = document.getElementById("annotation-export");
  const lightboxBtn = document.getElementById("annotation-lightbox-btn");
  const closeBtn = document.getElementById("annotation-close");
  const pencilBtn = document.querySelector(
    '.annotation-tool[data-tool="pencil"]',
  );

  if (exportBtn && hk.DRAWING_EXPORT) {
    exportBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.export", { hotkey: `Ctrl+${hk.DRAWING_EXPORT.toUpperCase()}` }));
  }

  // Tooltip du crayon avec indication du clic droit pour le stabilisateur
  if (pencilBtn) {
    const shortcut = (hk.DRAWING_TOOL_PENCIL || "P").toUpperCase();
    pencilBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.pencilWithStabilizer", { hotkey: shortcut }));
  }

  if (lightboxBtn && hk.DRAWING_LIGHTBOX) {
    lightboxBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.lightboxWithKey", { hotkey: hk.DRAWING_LIGHTBOX }));
  }

  if (closeBtn && hk.DRAWING_CLOSE) {
    closeBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.closeWithKey", { hotkey: hk.DRAWING_CLOSE }));
  }
}


function updateLightboxButtonIcon() {
  const lightboxBtn = document.getElementById("annotation-lightbox-btn");
  if (!lightboxBtn || typeof ICONS === "undefined") return;
  lightboxBtn.innerHTML = lightboxEnabled
    ? ICONS.LIGHT_TABLE_OFF
    : ICONS.LIGHT_TABLE_ON;
}

const MAX_HISTORY = DRAWING_CONSTANTS.MAX_HISTORY;

// Variables actives pour le déplacement avec espace
let originalStartPoint = null;
let measureLockedLength = null; // Longueur verrouillée avec Shift pendant la création
let isDraggingShapeControl = false;
let dragShapeControlLine = null;
let dragShapeAspectRatio = null;
const shapeSelectionState =
  drawState.shapeSelection ||
  (drawState.shapeSelection = { id: null, groupId: null });
let selectedShapeId = shapeSelectionState.id ?? null;
let selectedShapeGroupId = shapeSelectionState.groupId ?? null;
let drawingEditHud = null;
const dragShapeSession =
  drawState.shapeEditSession ||
  (drawState.shapeEditSession = {
    scaleSnapshot: null,
    circleSpaceBase: null,
    rotateSnapshot: null,
  });
let drawingModeHint = null;

function resetDragShapeSession() {
  dragShapeSession.scaleSnapshot = null;
  dragShapeSession.circleSpaceBase = null;
  dragShapeSession.rotateSnapshot = null;
}

function clearEditableShapeSelection() {
  selectedShapeId = null;
  selectedShapeGroupId = null;
  shapeSelectionState.id = null;
  shapeSelectionState.groupId = null;
  resetDragShapeSession();
}

function isShapeLineSelected(line) {
  return (
    !!line &&
    line.type === "shape-line" &&
    selectedShapeId === line.id
  );
}

function isShapeCircleSelected(line) {
  return (
    !!line &&
    line.type === "shape-circle" &&
    selectedShapeId === line.id
  );
}

function isShapeArrowSelected(line) {
  return (
    !!line &&
    line.type === "shape-arrow" &&
    selectedShapeId === line.id
  );
}

function isIndividualShapeSelected(line) {
  return (
    !!line &&
    isEditableShape(line) &&
    !shapeHasCapability(line, "grouped") &&
    selectedShapeId === line.id
  );
}

function isShapeEdgeSelected(line) {
  return (
    !!line &&
    shapeHasCapability(line, "grouped") &&
    !!line.shapeGroup &&
    selectedShapeGroupId === line.shapeGroup
  );
}

function selectEditableShape(line) {
  if (!line) return false;
  if (isEditableShape(line) && !shapeHasCapability(line, "grouped")) {
    selectedShapeId = line.id;
    selectedShapeGroupId = null;
    shapeSelectionState.id = selectedShapeId;
    shapeSelectionState.groupId = selectedShapeGroupId;
    redrawDrawingMeasurements();
    return true;
  }
  if (shapeHasCapability(line, "grouped") && line.shapeGroup) {
    selectedShapeGroupId = line.shapeGroup;
    selectedShapeId = null;
    shapeSelectionState.id = selectedShapeId;
    shapeSelectionState.groupId = selectedShapeGroupId;
    redrawDrawingMeasurements();
    return true;
  }
  return false;
}

function syncEditableShapeSelection() {
  if (
    selectedShapeId &&
    !measurementLines.some(
      (line) =>
        isEditableShape(line) &&
        !shapeHasCapability(line, "grouped") &&
        line.id === selectedShapeId,
    )
  ) {
    selectedShapeId = null;
    shapeSelectionState.id = null;
  }
  if (
    selectedShapeGroupId &&
    !measurementLines.some(
      (line) =>
        shapeHasCapability(line, "grouped") &&
        line.shapeGroup === selectedShapeGroupId,
    )
  ) {
    selectedShapeGroupId = null;
    shapeSelectionState.groupId = null;
  }
}

function ensureDrawingEditHud() {
  if (drawingEditHud && document.body.contains(drawingEditHud)) return drawingEditHud;
  drawingEditHud = document.createElement("div");
  drawingEditHud.id = "drawing-edit-hud";
  drawingEditHud.style.position = "fixed";
  drawingEditHud.style.zIndex = "11050";
  drawingEditHud.style.pointerEvents = "none";
  drawingEditHud.style.padding = "6px 9px";
  drawingEditHud.style.borderRadius = "8px";
  drawingEditHud.style.background = "rgba(12, 16, 22, 0.92)";
  drawingEditHud.style.border = "1px solid rgba(255,255,255,0.14)";
  drawingEditHud.style.color = "#e9efff";
  drawingEditHud.style.fontSize = "12px";
  drawingEditHud.style.fontWeight = "600";
  drawingEditHud.style.letterSpacing = "0.2px";
  drawingEditHud.style.display = "none";
  document.body.appendChild(drawingEditHud);
  return drawingEditHud;
}

function updateDrawingEditHudFromLine(line, clientX = null, clientY = null) {
  if (!line || !line.start || !line.end) return;
  const hud = ensureDrawingEditHud();
  const { length, angle } = getLineMetrics(line.start, line.end);
  hud.textContent = `${Math.round(length)} px | ${Math.round(angle)} deg`;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    hud.style.left = `${Math.round(clientX + 14)}px`;
    hud.style.top = `${Math.round(clientY + 14)}px`;
  }
  hud.style.display = "block";
}

function updateDrawingEditHudFromPoints(start, end, clientX = null, clientY = null) {
  if (!start || !end) return;
  updateDrawingEditHudFromLine({ start, end }, clientX, clientY);
}

function hideDrawingEditHud() {
  if (drawingEditHud) drawingEditHud.style.display = "none";
}

function ensureDrawingModeHint() {
  if (drawingModeHint && document.body.contains(drawingModeHint)) return drawingModeHint;
  drawingModeHint = document.createElement("div");
  drawingModeHint.id = "drawing-mode-hint";
  drawingModeHint.style.position = "fixed";
  drawingModeHint.style.zIndex = "11060";
  drawingModeHint.style.right = "18px";
  drawingModeHint.style.bottom = "14px";
  drawingModeHint.style.padding = "6px 10px";
  drawingModeHint.style.borderRadius = "8px";
  drawingModeHint.style.border = "1px solid rgba(255,255,255,0.16)";
  drawingModeHint.style.background = "rgba(10, 14, 20, 0.88)";
  drawingModeHint.style.color = "#e6ecff";
  drawingModeHint.style.fontSize = "12px";
  drawingModeHint.style.fontWeight = "600";
  drawingModeHint.style.letterSpacing = "0.2px";
  drawingModeHint.style.pointerEvents = "none";
  drawingModeHint.style.display = "none";
  document.body.appendChild(drawingModeHint);
  return drawingModeHint;
}

function showDrawingModeHint(text) {
  if (!text) return;
  const hint = ensureDrawingModeHint();
  hint.textContent = text;
  hint.style.display = "block";
}

function hideDrawingModeHint() {
  if (drawingModeHint) drawingModeHint.style.display = "none";
}

// ================================================================
// HELPERS PARTAGÉS DRAWING/ZOOM MODE (Phase 6.4)
// ================================================================

function cloneMeasurementLines(lines) {
  return structuredClone(Array.isArray(lines) ? lines : []);
}

function normalizeHistorySnapshot(entry) {
  if (typeof entry === "string") {
    return {
      canvasDataURL: entry,
      measurementLines: [],
      calibrationUnit: null,
    };
  }

  if (!entry || typeof entry !== "object") {
    return {
      canvasDataURL: null,
      measurementLines: [],
      calibrationUnit: null,
    };
  }

  return {
    canvasDataURL: entry.canvasDataURL || null,
    measurementLines: cloneMeasurementLines(entry.measurementLines),
    calibrationUnit: Number.isFinite(Number(entry.calibrationUnit))
      ? Number(entry.calibrationUnit)
      : null,
  };
}

function cloneHistorySnapshot(entry) {
  const normalized = normalizeHistorySnapshot(entry);
  return {
    canvasDataURL: normalized.canvasDataURL,
    measurementLines: cloneMeasurementLines(normalized.measurementLines),
    calibrationUnit: normalized.calibrationUnit,
  };
}

function cloneDrawingHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => cloneHistorySnapshot(entry));
}

function buildCurrentHistorySnapshot() {
  const hasCanvas = drawingCanvas && !isCanvasBlank(drawingCanvas);
  return {
    canvasDataURL: hasCanvas ? drawingCanvas.toDataURL() : null,
    measurementLines: cloneMeasurementLines(measurementLines),
    calibrationUnit: Number.isFinite(Number(calibrationUnit))
      ? Number(calibrationUnit)
      : null,
  };
}

function applyHistorySnapshot(snapshot) {
  const normalized = normalizeHistorySnapshot(snapshot);
  measurementLines = cloneMeasurementLines(normalized.measurementLines);
  calibrationUnit = normalized.calibrationUnit;

  const finalizeState = () => {
    redrawDrawingMeasurements();
    updateDrawingUnitInfo();
    updateDrawingTotalDistance();
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  };

  if (!drawingCtx || !drawingCanvas) {
    finalizeState();
    return;
  }

  if (!normalized.canvasDataURL) {
    clearCanvas(drawingCtx, drawingCanvas);
    finalizeState();
    return;
  }

  const img = new Image();
  img.onload = () => {
    // Swap atomique: on efface seulement quand la nouvelle image est prête,
    // pour éviter le scintillement visuel pendant undo/redo.
    clearCanvas(drawingCtx, drawingCanvas);
    drawingCtx.drawImage(img, 0, 0);
    finalizeState();
  };
  img.onerror = () => {
    console.warn("undo/redo: failed to load snapshot image");
    clearCanvas(drawingCtx, drawingCanvas);
    finalizeState();
  };
  img.src = normalized.canvasDataURL;
}

/**
 * Restaure l'état de dessin depuis un cache
 * @param {Object} savedState - État sauvegardé (canvasDataURL, measuresDataURL, etc.)
 * @param {CanvasRenderingContext2D} mainCtx - Contexte du canvas principal
 * @param {CanvasRenderingContext2D} measuresCtx - Contexte du canvas de mesures
 * @returns {Promise<boolean>} true si restauré avec succès
 */
async function restoreDrawingState(savedState, mainCtx, measuresCtx) {
  if (!savedState) {
    debugLog("restoreDrawingState: pas d'état à restaurer");
    return false;
  }

  debugLog("restoreDrawingState: restauration...", {
    hasCanvasData: !!savedState.canvasDataURL,
    measurementLines: savedState.measurementLines?.length,
    calibrationUnit: savedState.calibrationUnit,
  });

  // Restaurer les données non-image immédiatement
  measurementLines = cloneMeasurementLines(savedState.measurementLines);
  calibrationUnit = Number.isFinite(Number(savedState.calibrationUnit))
    ? Number(savedState.calibrationUnit)
    : null;
  drawingHistory = cloneDrawingHistory(savedState.history);
  const restoredIndex = Number.isInteger(savedState.historyIndex)
    ? savedState.historyIndex
    : drawingHistory.length - 1;
  drawingHistoryIndex = Math.max(
    -1,
    Math.min(restoredIndex, drawingHistory.length - 1),
  );

  // Restaurer le canvas principal depuis l'URL base64
  if (savedState.canvasDataURL) {
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        clearCanvas(mainCtx, mainCtx.canvas);
        mainCtx.drawImage(
          img,
          0,
          0,
          mainCtx.canvas.width,
          mainCtx.canvas.height,
        );
        resolve();
      };
      img.onerror = () =>
        reject(new Error("Failed to load canvas image data"));
      img.src = savedState.canvasDataURL;
    });
  }

  // Les mesures sont redessinées dynamiquement, pas besoin de restaurer le canvas
  redrawDrawingMeasurements();
  updateDrawingUnitInfo();
  updateDrawingTotalDistance();
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");

  return true;
}

/**
 * Sauvegarde l'état de dessin dans un cache
 * @param {Map} cache - Cache de stockage (drawingStateCache ou zoomDrawingStateCache)
 * @param {string} imageSrc - Clé d'identification de l'image
 * @param {HTMLCanvasElement} mainCanvas - Canvas principal
 * @param {HTMLCanvasElement} measuresCanvas - Canvas de mesures
 * @param {CanvasRenderingContext2D} mainCtx - Contexte du canvas principal
 * @param {CanvasRenderingContext2D} measuresCtx - Contexte du canvas de mesures
 * @returns {boolean} true si sauvegardé, false sinon
 */
function saveDrawingState(
  cache,
  imageSrc,
  mainCanvas,
  measuresCanvas,
  mainCtx,
  measuresCtx,
) {
  debugLog("saveDrawingState: ENTRÉE dans la fonction");

  try {
    if (!imageSrc || !mainCanvas || !measuresCanvas) {
      debugLog("saveDrawingState: paramètres manquants", {
        imageSrc: !!imageSrc,
        mainCanvas: !!mainCanvas,
        measuresCanvas: !!measuresCanvas,
      });
      return false;
    }

    // Vérifier s'il y a du contenu à sauvegarder (dessin ou mesures)
    const hasDrawingContent = !isCanvasBlank(mainCanvas);
    const hasMeasures = measurementLines.length > 0;

    debugLog(
      "saveDrawingState: hasDrawing=",
      hasDrawingContent,
      "hasMeasures=",
      hasMeasures,
      "measurementLines=",
      measurementLines.length,
    );

    if (!hasDrawingContent && !hasMeasures) {
      // Important: si l'état courant est vide, il faut supprimer l'ancienne
      // entrée du cache, sinon un ancien dessin réapparaît à la réouverture.
      cache.delete(imageSrc);
      debugLog("saveDrawingState: rien à sauvegarder, cache entry removed");
      return false;
    }

    cache.set(imageSrc, {
      // Sauvegarder en base64 pour pouvoir redimensionner à la restauration
      canvasDataURL: hasDrawingContent ? mainCanvas.toDataURL() : null,
      // Les mesures sont stockées en coordonnées et redessinées dynamiquement
      measurementLines: structuredClone(measurementLines),
      calibrationUnit: calibrationUnit,
      history: cloneDrawingHistory(drawingHistory),
      historyIndex: drawingHistoryIndex,
    });

    debugLog("saveDrawingState: SUCCÈS, cache size =", cache.size);
    return true;
  } catch (error) {
    debugLog("saveDrawingState: ERREUR", error);
    console.error("saveDrawingState error:", error);
    return false;
  }
}

/**
 * Vérifie si un canvas est vide (tous les pixels transparents)
 */
function isCanvasBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  // Vérifier par échantillonnage (plus rapide que tout vérifier)
  for (let i = 3; i < data.length; i += 400) {
    if (data[i] !== 0) return false;
  }
  return true;
}

/**
 * Initialise un état de dessin vierge
 */
function initFreshDrawingState() {
  drawingHistory = [];
  drawingHistoryIndex = -1;
  measurementLines = [];
  calibrationUnit = null;

  // Sauvegarder l'état vide initial pour permettre undo du premier trait
  // (sera fait après que les canvas soient initialisés)
}


/**
 * Efface le canvas de dessin
 */
function clearDrawingCanvas() {
  let changed = false;
  clearEditableShapeSelection();
  hideDrawingEditHud();

  if (drawingCtx && drawingCanvas) {
    clearCanvas(drawingCtx, drawingCanvas);
    changed = true;
  }

  // Le bouton clear supprime aussi les formes vectorielles (rectangle + ligne editable)
  const before = measurementLines.length;
  measurementLines = measurementLines.filter(
    (line) => !isEditableShape(line),
  );
  if (measurementLines.length !== before) {
    changed = true;
    redrawDrawingMeasurements();
    updateDrawingTotalDistance();
  }

  if (changed) {
    saveDrawingHistory();
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  }
}

/**
 * Efface les mesures
 */
function clearDrawingMeasurements() {
  if (drawingMeasuresCtx && drawingMeasures) {
    hideDrawingEditHud();
    clearCanvas(drawingMeasuresCtx, drawingMeasures);
    // Conserver les formes vectorielles editables pour que seul "clear" les efface.
    measurementLines = measurementLines.filter(
      (line) => isEditableShape(line),
    );
    redrawDrawingMeasurements();
    calibrationUnit = null;

    // Cacher les infos
    const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
    if (unitInfo) unitInfo.classList.add("hidden");
    const totalDistance = document.getElementById(
      "drawing-total-distance-info",
    );
    if (totalDistance) totalDistance.classList.add("hidden");

    // Mettre à jour les boutons pour les deux contextes
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  }
}



/**
 * Sauvegarde l'état pour undo/redo (historique local)
 */
function saveDrawingHistory() {
  if (!drawingCanvas) return;

  // Supprimer les états futurs si on a fait undo
  if (drawingHistoryIndex < drawingHistory.length - 1) {
    drawingHistory = drawingHistory.slice(0, drawingHistoryIndex + 1);
  }

  drawingHistory.push(buildCurrentHistorySnapshot());
  drawingHistoryIndex++;

  // Limiter la taille de l'historique
  if (drawingHistory.length > MAX_HISTORY) {
    drawingHistory.shift();
    drawingHistoryIndex--;
  }
}

/**
 * Annule la dernière action
 */
function undoDrawing() {
  if (drawingHistoryIndex <= 0) return;

  drawingHistoryIndex--;
  const snapshot = drawingHistory[drawingHistoryIndex];
  applyHistorySnapshot(snapshot);
}

/**
 * Refait la dernière action annulée
 */
function redoDrawing() {
  if (drawingHistoryIndex >= drawingHistory.length - 1) return;

  drawingHistoryIndex++;
  const snapshot = drawingHistory[drawingHistoryIndex];
  applyHistorySnapshot(snapshot);
}
