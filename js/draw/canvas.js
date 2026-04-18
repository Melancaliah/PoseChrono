/**
 * Configure les dimensions d'un canvas pour correspondre à une image avec object-fit: contain
 * @param {HTMLImageElement} imgElement - L'élément image
 * @returns {Object} { displayWidth, displayHeight, naturalWidth, naturalHeight }
 */
function calculateCanvasDimensions(imgElement) {
  const imgRect = imgElement.getBoundingClientRect();
  const naturalWidth = imgElement.naturalWidth;
  const naturalHeight = imgElement.naturalHeight;
  const naturalRatio = naturalWidth / naturalHeight;
  const containerRatio = imgRect.width / imgRect.height;

  let displayWidth, displayHeight;
  if (naturalRatio > containerRatio) {
    displayWidth = imgRect.width;
    displayHeight = imgRect.width / naturalRatio;
  } else {
    displayHeight = imgRect.height;
    displayWidth = imgRect.height * naturalRatio;
  }

  return { displayWidth, displayHeight, naturalWidth, naturalHeight };
}

// ================================================================
// DRAWING OVERLAY MODE - Fonctions principales
// ================================================================

/**
 * Active le mode dessin en overlay sur l'image actuelle
 */

/**
 * Configure les dimensions des canvas pour correspondre à l'image
 */
function setupDrawingCanvasDimensions() {
  if (!targetImageElement || !drawingOverlay) return;

  // Attendre que l'image soit chargée
  if (!targetImageElement.complete) {
    targetImageElement.onload = setupDrawingCanvasDimensions;
    return;
  }

  // Obtenir les dimensions naturelles de l'image
  const naturalWidth = targetImageElement.naturalWidth;
  const naturalHeight = targetImageElement.naturalHeight;

  // Obtenir les dimensions et position affichées de l'image
  const imageRect = targetImageElement.getBoundingClientRect();
  const displayWidth = imageRect.width;
  const displayHeight = imageRect.height;

  // Obtenir la position du wrapper parent
  const wrapper = targetImageElement.parentElement;
  const wrapperRect = wrapper.getBoundingClientRect();

  // Calculer l'offset de l'image par rapport au wrapper
  const offsetX = imageRect.left - wrapperRect.left;
  const offsetY = imageRect.top - wrapperRect.top;

  // Positionner l'overlay exactement sur l'image
  drawingOverlay.style.left = offsetX + "px";
  drawingOverlay.style.top = offsetY + "px";
  drawingOverlay.style.width = displayWidth + "px";
  drawingOverlay.style.height = displayHeight + "px";

  // Configurer chaque canvas
  const canvases = [
    drawingCanvas,
    drawingMeasures,
    drawingPreview,
    drawingLightboxCanvas,
    drawingRemoteCanvas,
  ];

  canvases.forEach((canvas) => {
    if (canvas) {
      // Résolution interne = dimensions naturelles (pour la qualité)
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;

      // Taille d'affichage = dimensions affichées de l'image
      canvas.style.width = displayWidth + "px";
      canvas.style.height = displayHeight + "px";
    }
  });

  // Les dimensions/position du preview viennent de changer → invalider le cache.
  if (typeof _invalidatePreviewRectCache === "function") {
    _invalidatePreviewRectCache();
  }

  debugLog(
    "Canvas dimensions:",
    naturalWidth,
    "x",
    naturalHeight,
    "affichées:",
    displayWidth,
    "x",
    displayHeight,
    "offset:",
    offsetX,
    offsetY,
  );
}

/**
 * Configure le ResizeObserver pour gérer le redimensionnement
 */
function setupCanvasResizeObserver() {
  if (canvasResizeObserver) {
    canvasResizeObserver.disconnect();
  }

  canvasResizeObserver = new ResizeObserver((entries) => {
    if (!isDrawingModeActive) return;

    for (const entry of entries) {
      if (entry.target === targetImageElement) {
        // Sauvegarder l'état dans des canvas hors-écran (synchrone, sans sérialisation PNG).
        // Remplace l'ancien aller-retour toDataURL → new Image().src → onload (async + scintille).
        const snap = _snapshotCanvasToOffscreen(drawingCanvas);
        const snapMeasures = _snapshotCanvasToOffscreen(drawingMeasures);

        // Mettre à jour les dimensions
        setupDrawingCanvasDimensions();
        _invalidatePreviewRectCache();

        // Restaurer l'état
        if (snap && drawingCtx) {
          drawingCtx.drawImage(
            snap,
            0,
            0,
            drawingCanvas.width,
            drawingCanvas.height,
          );
        }
        if (snapMeasures && drawingMeasuresCtx) {
          drawingMeasuresCtx.drawImage(
            snapMeasures,
            0,
            0,
            drawingMeasures.width,
            drawingMeasures.height,
          );
        }
      }
    }
  });

  if (targetImageElement) {
    canvasResizeObserver.observe(targetImageElement);
  }

  // Gérer aussi le redimensionnement de la fenêtre
  window.addEventListener("resize", handleDrawingWindowResize);
}

/**
 * Gère le redimensionnement de la fenêtre
 */
function handleDrawingWindowResize() {
  if (!isDrawingModeActive) return;

  resizeDebouncer.debounce(() => {
    if (targetImageElement) {
      const snap = _snapshotCanvasToOffscreen(drawingCanvas);
      setupDrawingCanvasDimensions();
      _invalidatePreviewRectCache();
      if (snap && drawingCtx) {
        drawingCtx.drawImage(
          snap,
          0,
          0,
          drawingCanvas.width,
          drawingCanvas.height,
        );
      }
      // Les mesures sont vectorielles : re-render direct depuis measurementLines
      // (plus fiable qu'un snapshot raster après resize).
      if (typeof redrawDrawingMeasurements === "function") {
        redrawDrawingMeasurements();
      }
    }
  }, DRAWING_CONSTANTS.RESIZE_DEBOUNCE_MS);
}

// Clone synchrone d'un canvas dans un canvas hors-écran (pas de sérialisation PNG).
function _snapshotCanvasToOffscreen(sourceCanvas) {
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return null;
  const snap = document.createElement("canvas");
  snap.width = sourceCanvas.width;
  snap.height = sourceCanvas.height;
  const snapCtx = snap.getContext("2d");
  if (!snapCtx) return null;
  snapCtx.drawImage(sourceCanvas, 0, 0);
  return snap;
}

/**
 * Efface tous les canvas du mode overlay
 */
function clearAllDrawingCanvases(context = null) {
  const contexts = context ? [drawingManager.getContext(context)] : [drawingManager.normal, drawingManager.zoom];
  contexts.forEach(ctx => {
    if (ctx.ctx && ctx.canvas) clearCanvas(ctx.ctx, ctx.canvas);
    if (ctx.measuresCtx && ctx.measures) clearCanvas(ctx.measuresCtx, ctx.measures);
    if (ctx.previewCtx && ctx.preview) clearCanvas(ctx.previewCtx, ctx.preview);
    if (ctx.lightboxCtx && ctx.lightbox) clearCanvas(ctx.lightboxCtx, ctx.lightbox);
  });
}

// Curseurs SVG mis en cache (constantes, le SVG ne change jamais)
const CACHED_CURSORS = (() => {
  const deleteSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(239, 68, 68, 0.9)" stroke="white" stroke-width="1.5"/><line x1="8" y1="8" x2="16" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const cycleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960"><circle cx="480" cy="-480" r="420" fill="rgba(94, 234, 212, 0.9)" stroke="white" stroke-width="40"/><path d="m482-200 114-113-114-113-42 42 43 43q-28 1-54.5-9T381-381q-20-20-30.5-46T340-479q0-17 4.5-34t12.5-33l-44-44q-17 25-25 53t-8 57q0 38 15 75t44 66q29 29 65 43.5t74 15.5l-38 38 42 42Zm165-170q17-25 25-53t8-57q0-38-14.5-75.5T622-622q-29-29-65.5-43T482-679l38-39-42-42-114 113 114 113 42-42-44-44q27 0 55 10.5t48 30.5q20 20 30.5 46t10.5 52q0 17-4.5 34T603-414l44 44Z" fill="white"/></svg>`;
  const duplicateSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(34, 197, 94, 0.9)" stroke="white" stroke-width="1.5"/><line x1="12" y1="7" x2="12" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="7" y1="12" x2="17" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  return {
    delete: `url("data:image/svg+xml,${encodeURIComponent(deleteSvg)}") 12 12, pointer`,
    cycle: `url("data:image/svg+xml,${encodeURIComponent(cycleSvg)}") 12 12, pointer`,
    duplicate: `url("data:image/svg+xml,${encodeURIComponent(duplicateSvg)}") 12 12, copy`,
  };
})();

function getDeleteCursor() {
  return CACHED_CURSORS.delete;
}

function getCycleCursor() {
  return CACHED_CURSORS.cycle;
}

function getDuplicateCursor() {
  return CACHED_CURSORS.duplicate;
}

/**
 * Met à jour le curseur de duplication quand Alt est pressé
 */
function updateAltDuplicateCursor() {
  if (!drawingPreview || !keysState.alt) return;

  // Utiliser la dernière position connue de la souris
  const rect = drawingPreview.getBoundingClientRect();
  const coords = {
    x:
      ((lastMousePosition.x - rect.left) * (drawingCanvas?.width || 1)) /
      rect.width,
    y:
      ((lastMousePosition.y - rect.top) * (drawingCanvas?.height || 1)) /
      rect.height,
  };

  const lineHit = findMeasurementLineAt(coords, 20);
  if (lineHit) {
    // Pas de duplication pour les calibrations
    if (lineHit.type === "calibrate") {
      drawingPreview.style.cursor = "not-allowed";
    } else {
      drawingPreview.style.cursor = getDuplicateCursor();
    }
  }
}

// Cache du BoundingClientRect du canvas preview pour éviter le forced layout reflow
// à chaque pointermove pendant un tracé (120 Hz stylet = 120 reflows/s sinon).
// Invalidé sur pointerdown, resize, zoom/pan/rotate, et changement d'overlay.
let _cachedPreviewRect = null;
let _cachedPreviewEl = null;
function _invalidatePreviewRectCache() {
  _cachedPreviewRect = null;
  _cachedPreviewEl = null;
}

function _getPreviewRect(previewEl) {
  // Si l'élément cible a changé (switch normal/zoom), rafraîchir.
  if (_cachedPreviewEl !== previewEl) {
    _cachedPreviewEl = previewEl;
    _cachedPreviewRect = previewEl.getBoundingClientRect();
    return _cachedPreviewRect;
  }
  if (_cachedPreviewRect) return _cachedPreviewRect;
  _cachedPreviewRect = previewEl.getBoundingClientRect();
  return _cachedPreviewRect;
}

/**
 * Convertit les coordonnées de la souris en coordonnées canvas.
 * Prend en compte la rotation et le zoom CSS du conteneur.
 */
function getDrawingCoordinates(e, context = null) {
  const ctx = context ? drawingManager.getContext(context) : drawingManager.current;
  if (!ctx.preview || !ctx.canvas) return { x: 0, y: 0 };

  const rotation = ZoomManager.rotation;

  if (rotation === 0) {
    // Pas de rotation : calcul rapide classique
    const rect = _getPreviewRect(ctx.preview);
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const scaleX = ctx.canvas.width / rect.width;
    const scaleY = ctx.canvas.height / rect.height;
    return { x: relX * scaleX, y: relY * scaleY };
  }

  // Avec rotation : getBoundingClientRect() donne l'AABB (bounding box englobant)
  // qui est agrandi par la rotation → les coordonnées rect.left/top sont fausses.
  // On passe par le centre (qui reste correct) + rotation inverse.

  const rect = _getPreviewRect(ctx.preview);
  const centerScreenX = rect.left + rect.width / 2;
  const centerScreenY = rect.top + rect.height / 2;

  // Vecteur souris → centre (en espace écran, inclut le zoom)
  const dx = e.clientX - centerScreenX;
  const dy = e.clientY - centerScreenY;

  // Rotation inverse pour passer de l'espace écran à l'espace local
  const rad = -rotation * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  // Taille d'affichage réelle = taille CSS × zoom scale
  // (style.width est la taille non-scalée, le zoom est appliqué par le parent)
  const zoomScale = ZoomManager.scale;
  const cssWidth = parseFloat(ctx.preview.style.width) || ctx.preview.offsetWidth;
  const cssHeight = parseFloat(ctx.preview.style.height) || ctx.preview.offsetHeight;
  const displayWidth = cssWidth * zoomScale;
  const displayHeight = cssHeight * zoomScale;

  // Convertir de coordonnées centrées vers coordonnées top-left
  const relX = localX + displayWidth / 2;
  const relY = localY + displayHeight / 2;

  // Convertir en coordonnées canvas internes
  const scaleX = ctx.canvas.width / displayWidth;
  const scaleY = ctx.canvas.height / displayHeight;

  return { x: relX * scaleX, y: relY * scaleY };
}

// ================================================================
// ZOOM ET PAN DU CANVAS (type logiciel de dessin)
// ================================================================

/**
 * Applique le zoom et le pan aux éléments (image + canvas)
 * Délégué au ZoomManager
 */
function applyCanvasTransform() {
  ZoomManager._applyTransform();
}

/**
 * Gère le zoom du canvas avec la molette (centré sur la souris)
 * @param {WheelEvent} e - L'événement wheel
 */
let _zoomRAFId = null;
let _zoomDeltaAccum = 0;
let _zoomLastScreenX = 0;
let _zoomLastScreenY = 0;

// Cache court pour éviter de re-scanner le DOM à chaque event wheel (trackpad = 60+ events/s).
// TTL très court : aucun humain n'ouvre/ferme un modal et scrolle en <80ms.
let _blockingModalCache = { value: false, expiresAt: 0 };
const _BLOCKING_MODAL_TTL_MS = 80;

function _computeIsBlockingModalOpenForWheel() {
  // Si le zoom-overlay est ouvert, il est au-dessus de tout le reste (z-index 10001).
  // Les modals "inférieurs" (ex: timeline-day-modal qui reste ouvert derrière quand on zoome
  // une image d'historique) ne doivent pas bloquer la molette de zoom du mode dessin.
  const zoomOverlayEl = document.getElementById("zoom-overlay");
  if (zoomOverlayEl) return false;

  // Si le helper global existe, il est la source de verite prioritaire.
  if (typeof getTopOpenModal === "function") {
    try {
      if (getTopOpenModal()) return true;
    } catch (_) {}
  }

  // Fallback defensif pour les modals connus.
  const selectors = [
    "#hotkeys-modal",
    ".hotkey-capture-overlay",
    ".hotkeys-warning-overlay",
    ".timeline-day-modal",
    ".modal-overlay",
    "#tags-modal:not(.hidden)",
    "#session-plans-modal:not(.hidden)",
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    // ignorer les elements detachés/invisibles
    if (!document.body.contains(el)) continue;
    const style = window.getComputedStyle(el);
    if (style.display !== "none" && style.visibility !== "hidden") {
      return true;
    }
  }

  return false;
}

function isBlockingModalOpenForWheel() {
  const now = performance.now();
  if (now < _blockingModalCache.expiresAt) {
    return _blockingModalCache.value;
  }
  const value = _computeIsBlockingModalOpenForWheel();
  _blockingModalCache.value = value;
  _blockingModalCache.expiresAt = now + _BLOCKING_MODAL_TTL_MS;
  return value;
}

function handleCanvasZoom(e) {
  if (isBlockingModalOpenForWheel()) {
    return;
  }

  e.preventDefault();

  // Position relative au centre réel du conteneur (pas au centre de la fenêtre)
  const container = ZoomManager._getContainer();
  if (container) {
    const rect = container.getBoundingClientRect();
    _zoomLastScreenX = e.clientX - (rect.left + rect.width / 2);
    _zoomLastScreenY = e.clientY - (rect.top + rect.height / 2);
  } else {
    _zoomLastScreenX = e.clientX - window.innerWidth / 2;
    _zoomLastScreenY = e.clientY - window.innerHeight / 2;
  }
  _zoomDeltaAccum += -e.deltaY;

  // Batch les events wheel par frame pour éviter les recalculs redondants
  if (!_zoomRAFId) {
    _zoomRAFId = requestAnimationFrame(() => {
      const delta =
        _zoomDeltaAccum *
        DRAWING_CONSTANTS.ZOOM_WHEEL_SENSITIVITY *
        ZoomManager.scale;
      ZoomManager.zoom(delta, _zoomLastScreenX, _zoomLastScreenY);
      _invalidatePreviewRectCache();
      _zoomDeltaAccum = 0;
      _zoomRAFId = null;
    });
  }
}

function resetCanvasZoomPan() {
  ZoomManager.reset();
}

function handleCanvasPanStart(e) {
  if (e.button !== 1) return; // Clic molette uniquement
  e.preventDefault();
  _invalidatePreviewRectCache();
  ZoomManager.startPan(e.clientX, e.clientY);
  if (drawingPreview) drawingPreview.style.cursor = "grabbing";
}

/**
 * Gère le mouvement de pan
 * @param {MouseEvent} e - L'événement mousemove
 */
function handleCanvasPanMove(e) {
  if (!ZoomManager.isPanning) return;
  e.preventDefault();
  _invalidatePreviewRectCache();
  ZoomManager.pan(e.clientX, e.clientY);
}

function handleCanvasPanEnd() {
  if (!ZoomManager.isPanning) return;
  ZoomManager.endPan();
  const preview = zoomDrawingPreview || drawingPreview;
  if (keysState.space && keysState.shift && preview) {
    // Shift+Space encore enfoncé → mode rotation
    preview.style.cursor = "alias";
  } else if (keysState.space && preview) {
    // Space encore enfoncé → rester en mode grab
    preview.style.cursor = "grab";
  } else {
    if (preview) preview.style.cursor = "";
    updateDrawingCursor();
  }
}

/**
 * Démarre le pan via Space+clic gauche
 */
function handleSpacePanStart(e) {
  e.preventDefault();
  _invalidatePreviewRectCache();
  ZoomManager.startPan(e.clientX, e.clientY);
  const preview = zoomDrawingPreview || drawingPreview;
  if (preview) preview.style.cursor = "grabbing";
}

/**
 * Démarre la rotation via Shift+Space+clic gauche
 */
function handleRotateStart(e) {
  e.preventDefault();
  _invalidatePreviewRectCache();
  ZoomManager.startRotate(e.clientX, e.clientY);
  const preview = zoomDrawingPreview || drawingPreview;
  if (preview) preview.style.cursor = "alias"; // Curseur rotation
}

/**
 * Met à jour la rotation
 */
function handleRotateMove(e) {
  if (!ZoomManager.isRotating) return;
  e.preventDefault();
  _invalidatePreviewRectCache();
  ZoomManager.rotate(e.clientX, e.clientY);
}

/**
 * Termine la rotation
 */
function handleRotateEnd() {
  if (!ZoomManager.isRotating) return;
  ZoomManager.endRotate();
  const preview = zoomDrawingPreview || drawingPreview;
  if (keysState.space && keysState.shift && preview) {
    preview.style.cursor = "alias";
  } else if (keysState.space && preview) {
    preview.style.cursor = "grab";
  } else {
    if (preview) preview.style.cursor = "";
    updateDrawingCursor();
  }
}

function handleGlobalMouseUp(e) {
  // Si on était en train de dessiner, arrêter le dessin.
  // On couvre pointerup (e.button === 0) et pointercancel (pas de button fiable).
  if (!isDrawing) return;
  const isCancel = e && e.type === "pointercancel";
  if (isCancel || e.button === 0 || e.button === undefined) {
    handleDrawingMouseUp(e);
  }
}

function resetDrawingStateOnEnter() {
  wasOutsideCanvas = false;
  // Mettre à jour le curseur quand on rentre dans le canvas
  updateDrawingCursor();
  // Si on était en train de dessiner, réinitialiser l'état
  if (isDrawing) {
    lastDrawnPoint = null;
    wasShiftPressed = false;
    stabilizerBuffer = []; // Vider le buffer du stabilisateur
  }
}

function handleDrawingMouseLeave(e, previewCanvas, drawingCanvas, drawingCtx) {
  if (ZoomManager.isPanning) {
    handleCanvasPanEnd();
  }
  // Marquer qu'on est sorti du canvas
  wasOutsideCanvas = true;
  // Si on était en train de dessiner, dessiner jusqu'au bord
  if (isDrawing && lastDrawnPoint) {
    // Calculer où le curseur est maintenant (hors canvas)
    const rect = previewCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleX = drawingCanvas.width / rect.width;
    const scaleY = drawingCanvas.height / rect.height;
    const cursorCanvasX = mouseX * scaleX;
    const cursorCanvasY = mouseY * scaleY;

    // Calculer l'intersection avec le bord
    const edge = getEdgeIntersection(
      lastDrawnPoint,
      { x: cursorCanvasX, y: cursorCanvasY },
      drawingCanvas.width,
      drawingCanvas.height,
    );

    if (edge && drawingCtx) {
      // Dessiner jusqu'au bord
      interpolateLine(
        drawingCtx,
        lastDrawnPoint,
        edge,
        annotationStyle.size * 0.5,
      );
      setLastDrawnPoint(edge);
    }
  }
  // Cacher le curseur mais ne pas arrêter le dessin
  hideDrawingCursor();
}


/**
 * Met à jour l'état des boutons selon le contexte (main ou zoom)
 * @param {string} context - "main" pour drawing-toolbar, "zoom" pour zoom-drawing-toolbar
 */
// Cache des références DOM des boutons de la toolbar, par contexte.
// Invalidé automatiquement si le noeud n'est plus attaché au document.
const _drawingButtonRefsCache = {
  main: { protractor: null, clearMeasurements: null, clear: null, unitInfo: null },
  zoom: { protractor: null, clearMeasurements: null, clear: null, unitInfo: null },
};
function _invalidateDrawingButtonRefsCache() {
  _drawingButtonRefsCache.main = { protractor: null, clearMeasurements: null, clear: null, unitInfo: null };
  _drawingButtonRefsCache.zoom = { protractor: null, clearMeasurements: null, clear: null, unitInfo: null };
}
function _getCachedDrawingButtons(context) {
  const isMain = context === "main";
  const bucket = isMain ? _drawingButtonRefsCache.main : _drawingButtonRefsCache.zoom;
  // Vérifier attachement : un changement de contexte (zoom ⇄ normal) peut détacher les noeuds.
  const stillAttached = (el) => el && document.body.contains(el);
  if (!stillAttached(bucket.protractor) || !stillAttached(bucket.clearMeasurements) || !stillAttached(bucket.clear)) {
    const protractorSelector = isMain
      ? '#drawing-toolbar .annotation-tool[data-tool="protractor"]'
      : '#zoom-drawing-toolbar [data-tool="protractor"]';
    const clearMeasurementsSelector = isMain
      ? '#drawing-toolbar .annotation-tool[data-tool="clear-measurements"]'
      : '#zoom-drawing-toolbar [data-tool="clear-measurements"]';
    const clearSelector = isMain
      ? '#drawing-toolbar .annotation-tool[data-tool="clear"]'
      : '#zoom-drawing-toolbar [data-tool="clear"]';
    bucket.protractor = document.querySelector(protractorSelector);
    bucket.clearMeasurements = document.querySelector(clearMeasurementsSelector);
    bucket.clear = document.querySelector(clearSelector);
    bucket.unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
  }
  return bucket;
}

function updateDrawingButtonStates(context = "main") {
  const isMain = context === "main";
  const refs = _getCachedDrawingButtons(context);

  // État
  const hasValidCalibration = calibrationUnit && calibrationUnit > 0;
  const hasMeasurements = measurementLines.some(
    (line) => !isEditableShape(line.type),
  );
  // Flag dirty (O(1)) au lieu de isCanvasBlank() (getImageData + scan) à chaque appel.
  const hasDrawingContent = typeof isDrawingDirty === "function"
    ? isDrawingDirty()
    : !isCanvasBlank(drawingCanvas);
  const hasShapeEdges = measurementLines.some(
    (line) => isEditableShape(line.type),
  );

  // Protractor : nécessite une calibration valide (> 0px)
  if (refs.protractor) {
    refs.protractor.classList.toggle("disabled", !hasValidCalibration);
    refs.protractor.style.opacity = hasValidCalibration ? "1" : "0.3";
    refs.protractor.style.pointerEvents = hasValidCalibration ? "auto" : "none";
  }

  // Clear-measurements : nécessite au moins une mesure
  if (refs.clearMeasurements) {
    refs.clearMeasurements.classList.toggle("disabled", !hasMeasurements);
    refs.clearMeasurements.style.opacity = hasMeasurements ? "1" : "0.3";
    refs.clearMeasurements.style.pointerEvents = hasMeasurements
      ? "auto"
      : "none";
  }

  // Clear : contenu raster OU rectangles vectoriels
  if (refs.clear) {
    const canClear = hasDrawingContent || hasShapeEdges;
    refs.clear.classList.toggle("disabled", !canClear);
    refs.clear.style.opacity = canClear ? "1" : "0.3";
    refs.clear.style.pointerEvents = canClear ? "auto" : "none";
  }

  // Masquer unit-info si calibration invalide (0px) - uniquement pour le contexte main
  if (isMain && refs.unitInfo && !hasValidCalibration) {
    refs.unitInfo.classList.add("hidden");
  }
}

/**
 * @deprecated Utilisez updateDrawingButtonStates("main") à la place
 */
function updateDrawingProtractorButtonState() {
  updateDrawingButtonStates("main");
}

/**
 * Modifie la taille de l'outil de dessin
 * @param {number} delta - Valeur à ajouter (positif ou négatif)
 */
function changeDrawingSize(delta) {
  const newSize = Math.max(1, Math.min(50, annotationStyle.size + delta));
  if (newSize === annotationStyle.size) return;

  annotationStyle.size = newSize;

  // Sauvegarder pour l'outil courant (persistence pour raccourcis clavier/molette)
  const toolId = currentTool;
  const style = drawingManager.toolStyles[toolId];
  if (style) {
    style.size = newSize;

    // Si l'outil appartient à un groupe (ex: mesures), synchroniser la taille pour tout le groupe
    if (style.group) {
      Object.values(drawingManager.toolStyles).forEach((ts) => {
        if (ts.group === style.group) {
          ts.size = newSize;
        }
      });
    }

    // [FIX] Mise à jour immédiate pour les outils de mesure
    if (["measure", "calibrate", "protractor"].includes(toolId)) {
      measureState.lineWidth = newSize;
      if (typeof redrawDrawingMeasurements === "function") {
        redrawDrawingMeasurements();
      }
    }
  }

  // Mettre à jour les sliders si présents
  const drawingSizeInput = document.getElementById("drawing-size");
  const zoomSizeInput = document.getElementById("zoom-drawing-size");
  if (drawingSizeInput) drawingSizeInput.value = newSize;
  if (zoomSizeInput) zoomSizeInput.value = newSize;

  // Mettre à jour le curseur
  updateDrawingCursor();

  // Afficher un toast avec la nouvelle taille
  showDrawingToast(`${i18next.t("draw.toasts.size")}: ${newSize}`, "info", 800);
}

/**
 * Crée le curseur personnalisé pour le mode overlay
 */
function createDrawingCursor() {
  let cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = "drawing-cursor";
    cursor.style.borderColor = annotationStyle.color;
    document.body.appendChild(cursor);
  }
  updateDrawingCursor();
}

/**
 * Met à jour l'apparence du curseur
 */
function updateDrawingCursor() {
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (!cursor || !drawingPreview) return;

  const isPencilOrEraser = currentTool === "pencil" || currentTool === "eraser";
  const isLaser = currentTool === "laser";
  const isShapeTool = ["rectangle", "circle", "line", "arrow"].includes(
    currentTool,
  );
  const isMeasureTool = ["measure", "calibrate", "protractor"].includes(
    currentTool,
  );

  // Mode CapsLock : curseur précis (croix) au lieu de la prévisualisation
  if (showPreciseCursor && isPencilOrEraser) {
    cursor.style.display = "none";
    drawingPreview.style.cursor = "crosshair";
    return;
  }

  // Outils de forme et mesure : curseur crosshair
  if (isShapeTool || isMeasureTool) {
    cursor.style.display = "none";
    drawingPreview.style.cursor = "crosshair";
    return;
  }

  // Mode prévisualisation : cacher le curseur par défaut, afficher le cercle
  if (isPencilOrEraser || isLaser) {
    drawingPreview.style.cursor = "none";
  } else {
    drawingPreview.style.cursor = "";
    cursor.style.display = "none";
    return;
  }

  // Calculer le ratio d'affichage (taille écran / taille canvas)
  const rect = drawingPreview.getBoundingClientRect();
  const scaleX = rect.width / drawingPreview.width;

  // Taille visuelle = taille du pinceau (lineWidth) * ratio d'affichage
  const visualSize = annotationStyle.size * scaleX;
  cursor.style.width =
    Math.max(visualSize, DRAWING_CONSTANTS.MIN_CURSOR_SIZE) + "px";
  cursor.style.height =
    Math.max(visualSize, DRAWING_CONSTANTS.MIN_CURSOR_SIZE) + "px";

  if (currentTool === "eraser") {
    cursor.style.borderColor = "#ffffff";
    cursor.style.background = "rgba(255,255,255,0.2)";
  } else if (currentTool === "laser") {
    cursor.style.borderColor = LASER_COLOR;
    cursor.style.background = "rgba(255, 0, 0, 0.3)";
  } else {
    cursor.style.borderColor = annotationStyle.color;
    cursor.style.background = "transparent";
  }
}

/**
 * Met à jour la position du curseur
 */
function updateDrawingCursorPosition(x, y) {
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (!cursor) return;

  cursor.style.left = x + "px";
  cursor.style.top = y + "px";
  cursor.style.display = "block";
}

/**
 * Cache le curseur personnalisé
 */
function hideDrawingCursor() {
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (cursor) cursor.style.display = "none";
}
