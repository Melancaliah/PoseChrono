/**
 * Finalise l'activation du mode dessin (état commun)
 * @param {string} toolName - Outil initial (défaut: 'pencil')
 */
function finalizeDrawingModeActivation(toolName = "pencil", contextType = null) {
  currentTool = toolName;
  isDrawing = false;
  updateDrawingCursor();

  // Si un contexte spécifique est demandé, utiliser celui-là
  // Sinon, détecter automatiquement selon le mode actif
  const targetContext = contextType || (isZoomDrawingModeActive ? 'zoom' : 'normal');
  
  // Synchroniser le DrawingManager avec les éléments DOM actuels
  // Cette étape est CRITIQUE pour que les variables globales fonctionnent
  if (targetContext === 'zoom') {
    drawingManager.setContext('zoom');
    // Le contexte zoom est déjà configuré dans openZoomDrawingMode
  } else {
    drawingManager.setContext('normal');
    drawingManager.normal.canvas = document.getElementById("drawing-canvas");
    drawingManager.normal.ctx = drawingManager.normal.canvas?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.preview = document.getElementById("drawing-preview");
    drawingManager.normal.previewCtx = drawingManager.normal.preview?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.measures = document.getElementById("drawing-measures");
    drawingManager.normal.measuresCtx = drawingManager.normal.measures?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.lightbox = document.getElementById("drawing-lightbox");
    drawingManager.normal.lightboxCtx = drawingManager.normal.lightbox?.getContext("2d", { willReadFrequently: true }) || null;
    drawingManager.normal.toolbar = document.getElementById("drawing-toolbar");
    drawingManager.normal.targetImage = document.getElementById("current-image");
  }
  
  // Synchroniser les variables legacy
  syncDrawingContext();

  // Réinitialiser le zoom/pan à l'ouverture
  resetCanvasZoomPan();
}

/**
 * Nettoie l'état des touches modificateurs
 */
function resetModifierKeys() {
  keysState.shift = false;
  keysState.alt = false;
  keysState.ctrl = false;
  keysState.space = false;
  keysState.s = false;
  keysState.q = false;
  hideDrawingModeHint();
}


async function openDrawingMode() {
  // Vérifier qu'on a une image
  const currentImage = document.getElementById("current-image");
  if (
    !currentImage ||
    !currentImage.src ||
    currentImage.src === window.location.href
  ) {
    debugLog("Drawing mode: pas d'image disponible");
    return;
  }

  // Récupérer les références DOM
  drawingOverlay = document.getElementById("drawing-overlay");
  drawingCanvas = document.getElementById("drawing-canvas");
  drawingMeasures = document.getElementById("drawing-measures");
  drawingPreview = document.getElementById("drawing-preview");
  drawingLightboxCanvas = document.getElementById("drawing-lightbox");
  drawingToolbar = document.getElementById("drawing-toolbar");

  if (!drawingOverlay || !drawingCanvas || !drawingPreview) {
    debugLog("Drawing mode: éléments DOM manquants");
    return;
  }

  // Stocker la référence à l'image cible et son src pour la persistance
  targetImageElement = currentImage;
  currentDrawingImageSrc = currentImage.src;

  // Configurer les dimensions des canvas
  setupDrawingCanvasDimensions();

  // Initialiser les contextes
  drawingCtx = drawingCanvas.getContext("2d", { willReadFrequently: true });
  drawingMeasuresCtx = drawingMeasures.getContext("2d", { willReadFrequently: true });
  drawingPreviewCtx = drawingPreview.getContext("2d", { willReadFrequently: true });
  if (drawingLightboxCanvas) {
    drawingLightboxCtx = drawingLightboxCanvas.getContext("2d", { willReadFrequently: true });
  }

  // Cache des éléments UI pour les hot paths (mousemove, animations)
  drawingDOM.measureInfo = document.getElementById("drawing-measure-info");
  drawingDOM.cursor = document.getElementById("drawing-cursor");
  drawingDOM.unitInfo = document.getElementById("drawing-unit-info");
  drawingDOM.unitValue = document.getElementById("drawing-unit-value");
  drawingDOM.totalDistanceInfo = document.getElementById("drawing-total-distance-info");
  drawingDOM.totalDistanceValue = document.getElementById("drawing-total-distance-value");

  // Configurer le DrawingManager pour le mode normal
  drawingManager.normal.overlay = drawingOverlay;
  drawingManager.normal.canvas = drawingCanvas;
  drawingManager.normal.measures = drawingMeasures;
  drawingManager.normal.preview = drawingPreview;
  drawingManager.normal.lightbox = drawingLightboxCanvas;
  drawingManager.normal.toolbar = drawingToolbar;
  drawingManager.normal.ctx = drawingCtx;
  drawingManager.normal.measuresCtx = drawingMeasuresCtx;
  drawingManager.normal.previewCtx = drawingPreviewCtx;
  drawingManager.normal.lightboxCtx = drawingLightboxCtx;
  drawingManager.normal.targetImage = targetImageElement;
  
  // Synchroniser les variables legacy
  drawingManager.setContext('normal');

  // Vérifier si on a un état sauvegardé pour cette image
  // Priorité : 1) cache principal, 2) cache zoom (même image)
  debugLog("Drawing mode: vérification du cache pour", currentDrawingImageSrc);
  let savedState = drawingStateCache.get(currentDrawingImageSrc);
  let stateSource = "main";

  if (!savedState) {
    // Essayer de récupérer l'état du mode zoom
    savedState = zoomDrawingStateCache.get(currentDrawingImageSrc);
    stateSource = "zoom";
  }

  debugLog("Drawing mode: savedState trouvé =", !!savedState, stateSource);

  if (savedState) {
    debugLog(
      `Drawing mode: restauration de l'état depuis le cache ${stateSource}`,
    );
    try {
      await restoreDrawingState(savedState, drawingCtx, drawingMeasuresCtx);
    } catch (e) {
      console.error("Drawing state restoration failed:", e);
    }
    updateDrawingUnitInfo();
    updateDrawingTotalDistance();
  } else {
    clearAllDrawingCanvases();
    initFreshDrawingState();
    // Sauvegarder l'état vide initial pour permettre undo du premier trait
    saveDrawingHistory();
    updateDrawingUnitInfo();
    updateDrawingTotalDistance();
  }

  finalizeDrawingModeActivation("pencil");

  // Configurer les outils et événements
  setupDrawingModeTools();

  // Observer le redimensionnement
  setupCanvasResizeObserver();

  // Afficher l'overlay et la toolbar
  drawingOverlay.classList.remove("hidden");
  drawingOverlay.classList.add("active");
  if (drawingToolbar) {
    drawingToolbar.classList.remove("hidden");
    initDrawingToolbarDrag();
  }

  // Ajouter l'indicateur visuel (bordures)
  const imageWrapper = document.querySelector(".image-wrapper");
  if (imageWrapper) {
    imageWrapper.classList.add("drawing-mode-active");
    // Créer les bordures si elles n'existent pas
    if (!imageWrapper.querySelector(".drawing-mode-borders")) {
      const borders = document.createElement("div");
      borders.className = "drawing-mode-borders";
      const leftBorder = document.createElement("div");
      leftBorder.className = "drawing-mode-border-left";
      const rightBorder = document.createElement("div");
      rightBorder.className = "drawing-mode-border-right";
      borders.appendChild(leftBorder);
      borders.appendChild(rightBorder);
      imageWrapper.appendChild(borders);
    }
  }

  // Mettre en pause la session si elle est en cours
  if (typeof state !== "undefined" && state.isPlaying) {
    if (typeof togglePlayPause === "function") {
      togglePlayPause();
    }
  }

  // Afficher le badge dessin
  const drawingBadge = document.getElementById("drawing-badge");
  if (drawingBadge) {
    drawingBadge.classList.remove("hidden");
  }

  // Activer visuellement le bouton annotate
  const annotateBtn = document.getElementById("annotate-btn");
  if (annotateBtn) {
    annotateBtn.classList.add("active");
  }

  isDrawingModeActive = true;
  debugLog("Drawing mode: activé");
}

/**
 * Ferme le mode dessin overlay
 */
function closeDrawingMode() {
  debugLog("closeDrawingMode: isDrawingModeActive=", isDrawingModeActive);
  if (!isDrawingModeActive) return;

  debugLog("closeDrawingMode: sauvegarde en cours...", {
    currentDrawingImageSrc,
    drawingCanvas: !!drawingCanvas,
    drawingMeasures: !!drawingMeasures,
  });

  // Sauvegarder l'état du dessin pour cette image
  const saved = saveDrawingState(
    drawingStateCache,
    currentDrawingImageSrc,
    drawingCanvas,
    drawingMeasures,
    drawingCtx,
    drawingMeasuresCtx,
  );

  if (saved) {
    debugLog("Drawing mode: état sauvegardé pour", currentDrawingImageSrc);
  }

  // Masquer l'overlay et la toolbar
  if (drawingOverlay) {
    drawingOverlay.classList.add("hidden");
    drawingOverlay.classList.remove("active");
  }
  if (drawingToolbar) {
    drawingToolbar.classList.add("hidden");
  }

  // Retirer l'indicateur visuel (bordures)
  const imageWrapper = document.querySelector(".image-wrapper");
  if (imageWrapper) {
    imageWrapper.classList.remove("drawing-mode-active");
    // Supprimer les bordures
    const borders = imageWrapper.querySelector(".drawing-mode-borders");
    if (borders) {
      borders.remove();
    }
  }

  // Nettoyer le ResizeObserver
  if (canvasResizeObserver) {
    canvasResizeObserver.disconnect();
    canvasResizeObserver = null;
  }

  // Nettoyer l'événement resize de la fenêtre
  window.removeEventListener("resize", handleDrawingWindowResize);

  // Nettoyer les événements
  cleanupDrawingModeEvents();

  // Réinitialiser le zoom/pan
  resetCanvasZoomPan();

  // Nettoyer les événements globaux (toolbar drag, resize)
  cleanupGlobalDrawingEvents();

  // Vider le cache des éléments UI
  drawingDOM.measureInfo = null;
  drawingDOM.cursor = null;
  drawingDOM.unitInfo = null;
  drawingDOM.unitValue = null;
  drawingDOM.totalDistanceInfo = null;
  drawingDOM.totalDistanceValue = null;

  // Fermer tous les menus/modals de dessin ouverts
  closeAllDrawingMenus();
  hideDrawingEditHud();
  if (typeof hideDrawingSelectionHud === "function") {
    hideDrawingSelectionHud();
  }

  // Réinitialiser l'état (sans effacer le cache)
  isDrawingModeActive = false;
  targetImageElement = null;

  // Supprimer le curseur personnalisé
  const cursor = drawingDOM.cursor || document.getElementById("drawing-cursor");
  if (cursor) cursor.remove();

  // Cacher les infos de mesure
  const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
  const distanceInfo = drawingDOM.totalDistanceInfo || document.getElementById("drawing-total-distance-info");
  if (unitInfo) unitInfo.classList.add("hidden");
  if (distanceInfo) distanceInfo.classList.add("hidden");

  // Masquer le badge dessin
  const drawingBadge = document.getElementById("drawing-badge");
  if (drawingBadge) {
    drawingBadge.classList.add("hidden");
  }

  // Désactiver visuellement le bouton annotate
  const annotateBtn = document.getElementById("annotate-btn");
  if (annotateBtn) {
    annotateBtn.classList.remove("active");
  }

  debugLog("Drawing mode: désactivé");
}


// ================================================================
// GLOBAL PAN/ROTATE HANDLERS (MMB, Space+clic, Shift+Space+clic)
// Permettent de pan/rotate même en cliquant hors du canvas (espace noir)
// ================================================================

function _handleGlobalPanDown(e) {
  if (!isDrawingModeActive) return;
  // Ignorer si le clic est sur la toolbar, un menu, ou déjà sur le canvas preview (géré par setupCanvasInputEvents)
  const preview = zoomDrawingPreview || drawingPreview;
  if (e.target === preview) return;
  if (e.target.closest("#drawing-toolbar, #zoom-drawing-toolbar, .drawing-config-popup, .drawing-context-menu")) return;

  // MMB → pan
  if (e.button === 1) {
    e.preventDefault();
    ZoomManager.startPan(e.clientX, e.clientY);
    if (preview) preview.style.cursor = "grabbing";
    return;
  }

  // Shift+Space+clic gauche → rotation
  if (e.button === 0 && keysState.space && keysState.shift && !isDrawing) {
    e.preventDefault();
    handleRotateStart(e);
    return;
  }

  // Space+clic gauche → pan
  if (e.button === 0 && keysState.space && !isDrawing) {
    e.preventDefault();
    handleSpacePanStart(e);
    return;
  }
}

function _handleGlobalPanMove(e) {
  if (!isDrawingModeActive) return;
  if (ZoomManager.isRotating) { handleRotateMove(e); return; }
  if (!ZoomManager.isPanning) return;
  e.preventDefault();
  ZoomManager.pan(e.clientX, e.clientY);
}

function _handleGlobalPanUp(e) {
  if (!isDrawingModeActive) return;
  if (ZoomManager.isRotating && e.button === 0) { handleRotateEnd(); return; }
  if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
    handleCanvasPanEnd();
    return;
  }
}

function _handleGlobalWheel(e) {
  if (!isDrawingModeActive || !CONFIG.enableZoomInDrawingMode) return;
  // Ignorer si le clic est sur la toolbar ou un menu
  if (e.target.closest("#drawing-toolbar, #zoom-drawing-toolbar, .drawing-config-popup, .drawing-context-menu")) return;
  // Ne pas doubler si déjà sur le canvas preview (géré par setupCanvasInputEvents)
  const preview = zoomDrawingPreview || drawingPreview;
  if (e.target === preview) return;
  handleCanvasZoom(e);
}

/**
 * Configure les événements pointer/mouse/wheel sur un canvas preview.
 * Factorise le code commun entre setupDrawingModeTools et setupZoomDrawingEvents.
 * @param {HTMLCanvasElement} previewCanvas - Le canvas preview (drawingPreview ou zoomDrawingPreview)
 * @param {HTMLCanvasElement} mainCanvas - Le canvas principal (drawingCanvas ou zoomDrawingCanvas)
 * @param {CanvasRenderingContext2D} mainCtx - Le contexte du canvas principal
 * @param {string} contextName - "drawing" ou "zoom"
 */
function setupCanvasInputEvents(previewCanvas, mainCanvas, mainCtx, contextName) {
  if (!previewCanvas) return;

  const contextMenuHandler = (e) => {
    e.preventDefault();
    const coords = getDrawingCoordinates(e);
    const hitLine = findMeasurementLineAt(coords, 20);
    if (hitLine) {
      if (hitLine.type === "compass") {
        showCompassIndividualConfig(hitLine, e.clientX, e.clientY);
      } else if (hitLine.type === "calibrate") {
        showCalibrateIndividualConfig(hitLine, e.clientX, e.clientY);
      } else if (isEditableShape(hitLine.type)) {
        showShapeIndividualConfig(hitLine, e.clientX, e.clientY);
      } else {
        showMeasureIndividualConfig(hitLine, e.clientX, e.clientY);
      }
    } else {
      showCanvasContextMenu(e.clientX, e.clientY, contextName);
    }
  };

  if (typeof window !== "undefined" && "PointerEvent" in window) {
    previewCanvas.style.touchAction = "none";

    previewCanvas.onpointerdown = (e) => {
      if (previewCanvas.setPointerCapture && typeof e.pointerId === "number") {
        try { previewCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (e.button === 1) { handleCanvasPanStart(e); return; }
      if (e.button === 0 && keysState.space && keysState.shift && !isDrawing) { handleRotateStart(e); return; }
      if (e.button === 0 && keysState.space && !isDrawing) { handleSpacePanStart(e); return; }
      handleDrawingMouseDown(e);
    };

    previewCanvas.onpointermove = (e) => {
      if (ZoomManager.isRotating) { handleRotateMove(e); return; }
      if (ZoomManager.isPanning) { handleCanvasPanMove(e); return; }
      handleDrawingMouseMove(e);
    };

    previewCanvas.onpointerup = (e) => {
      if (previewCanvas.releasePointerCapture && typeof e.pointerId === "number") {
        try { previewCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      if (ZoomManager.isRotating && e.button === 0) { handleRotateEnd(); return; }
      if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
        handleCanvasPanEnd(); return;
      }
      handleDrawingMouseUp(e);
    };

    previewCanvas.onpointercancel = (e) => {
      if (previewCanvas.releasePointerCapture && typeof e.pointerId === "number") {
        try { previewCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      if (ZoomManager.isRotating) { handleRotateEnd(); }
      if (ZoomManager.isPanning) { handleCanvasPanEnd(); }
      handleDrawingMouseUp(e);
    };
  } else {
    previewCanvas.onmousedown = (e) => {
      if (e.button === 1) { handleCanvasPanStart(e); return; }
      if (e.button === 0 && keysState.space && keysState.shift && !isDrawing) { handleRotateStart(e); return; }
      if (e.button === 0 && keysState.space && !isDrawing) { handleSpacePanStart(e); return; }
      handleDrawingMouseDown(e);
    };
    previewCanvas.onmousemove = (e) => {
      if (ZoomManager.isRotating) { handleRotateMove(e); return; }
      if (ZoomManager.isPanning) { handleCanvasPanMove(e); return; }
      handleDrawingMouseMove(e);
    };
    previewCanvas.onmouseup = (e) => {
      if (ZoomManager.isRotating && e.button === 0) { handleRotateEnd(); return; }
      if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
        handleCanvasPanEnd(); return;
      }
      handleDrawingMouseUp(e);
    };
  }

  previewCanvas.onmouseleave = (e) => {
    handleDrawingMouseLeave(e, previewCanvas, mainCanvas, mainCtx);
  };
  previewCanvas.onmouseenter = () => {
    resetDrawingStateOnEnter();
  };
  if (CONFIG.enableZoomInDrawingMode) {
    previewCanvas.addEventListener("wheel", handleCanvasZoom);
  }
  previewCanvas.oncontextmenu = contextMenuHandler;
}

/**
 * Configure les outils et événements pour le mode overlay
 * Note: Les événements des boutons sont déjà configurés par populateDrawingToolbar()
 * via les helpers partagés. Cette fonction configure uniquement les éléments additionnels.
 */
function setupDrawingModeTools() {
  if (!drawingToolbar) return;

  // Générer le contenu de la toolbar si vide
  if (drawingToolbar.children.length === 0) {
    populateDrawingToolbar();
  }

  // Mise à jour des tooltips avec les hotkeys configurées
  const hk = typeof CONFIG !== "undefined" ? CONFIG.HOTKEYS : {};

  const exportBtn = document.getElementById("drawing-export");
  if (exportBtn && hk.DRAWING_EXPORT) {
    exportBtn.setAttribute(
      "data-tooltip",
      i18next.t("draw.buttons.export", { hotkey: `Ctrl+${hk.DRAWING_EXPORT.toUpperCase()}` }),
    );
  }

  const lightboxBtn = document.getElementById("drawing-lightbox-btn");
  if (lightboxBtn) {
    updateDrawingLightboxIcon();
    if (hk.DRAWING_LIGHTBOX) {
      lightboxBtn.setAttribute(
        "data-tooltip",
        i18next.t("draw.buttons.lightboxWithKey", { hotkey: hk.DRAWING_LIGHTBOX }),
      );
    }
  }

  // Stabilisateur (bouton optionnel, peut ne pas exister)
  const stabilizerBtn = document.getElementById("drawing-stabilizer");
  if (stabilizerBtn) {
    stabilizerBtn.classList.toggle("active", stabilizerEnabled);
    stabilizerBtn.onclick = (e) => {
      if (e.button === 2 || e.ctrlKey) {
        showStabilizerMenu(e.clientX, e.clientY);
      } else {
        stabilizerEnabled = !stabilizerEnabled;
        stabilizerBtn.classList.toggle("active", stabilizerEnabled);
      }
    };
    stabilizerBtn.oncontextmenu = (e) => {
      e.preventDefault();
      showStabilizerMenu(e.clientX, e.clientY);
    };
  }

  // Bouton reset unité
  const resetUnitBtn = document.getElementById("drawing-reset-unit");
  if (resetUnitBtn) {
    resetUnitBtn.onclick = (e) => {
      e.stopPropagation();
      calibrationUnit = null;
      removeCalibrateAndCompass();
      redrawDrawingMeasurements();
      updateDrawingTotalDistance();
      const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
      if (unitInfo) unitInfo.classList.add("hidden");
      // Mettre à jour les boutons pour les deux contextes
      updateDrawingButtonStates("main");
      updateDrawingButtonStates("zoom");
    };
  }

  // Rendre le container des infos de mesure déplaçable
  setupDrawingInfosContainerDrag();

  // Événements de dessin sur le canvas preview
  setupCanvasInputEvents(drawingPreview, drawingCanvas, drawingCtx, "drawing");

  // Événements clavier
  document.addEventListener("keydown", handleDrawingModeKeydown);
  document.addEventListener("keyup", handleDrawingModeKeyup);

  // Écouteur global pour mouseup (pour arrêter le dessin même hors du canvas)
  document.addEventListener("mouseup", handleGlobalMouseUp);
  document.addEventListener("pointerup", handleGlobalMouseUp);

  // Pan/rotation/zoom globaux (MMB ou Space+clic même hors du canvas, sur l'espace noir)
  document.addEventListener("mousedown", _handleGlobalPanDown);
  document.addEventListener("mousemove", _handleGlobalPanMove);
  document.addEventListener("mouseup", _handleGlobalPanUp);
  document.addEventListener("wheel", _handleGlobalWheel, { passive: false });

  // Réinitialiser l'état des touches
  keysState.shift = false;
  keysState.alt = false;
  keysState.ctrl = false;
  keysState.space = false;
  keysState.s = false;
  keysState.q = false;

  // Mettre à jour l'état des boutons (protractor, clear-measurements)
  updateDrawingProtractorButtonState();

  // Curseur personnalisé pour prévisualiser la taille du pinceau
  createDrawingCursor();
}

/**
 * Nettoie les événements du mode overlay
 */
function cleanupDrawingModeEvents() {
  document.removeEventListener("keydown", handleDrawingModeKeydown);
  document.removeEventListener("keyup", handleDrawingModeKeyup);
  window.removeEventListener("resize", handleDrawingWindowResize);

  // Réinitialiser l'état des touches
  keysState.shift = false;
  keysState.alt = false;
  keysState.ctrl = false;
  keysState.space = false;
  keysState.s = false;
  keysState.q = false;


  if (drawingPreview) {
    drawingPreview.onmousedown = null;
    drawingPreview.onmousemove = null;
    drawingPreview.onmouseup = null;
    drawingPreview.onmouseleave = null;
    drawingPreview.onmouseenter = null;
    drawingPreview.removeEventListener('wheel', handleCanvasZoom);
    drawingPreview.onpointerdown = null;
    drawingPreview.onpointermove = null;
    drawingPreview.onpointerup = null;
    drawingPreview.onpointercancel = null;
    drawingPreview.onpointerrawupdate = null;
    drawingPreview.ontouchstart = null;
    drawingPreview.ontouchmove = null;
    drawingPreview.ontouchend = null;
  }
  // Retirer l'écouteur global mouseup
  document.removeEventListener("mouseup", handleGlobalMouseUp);
  document.removeEventListener("pointerup", handleGlobalMouseUp);
  // Retirer les écouteurs globaux de pan/rotation/zoom
  document.removeEventListener("mousedown", _handleGlobalPanDown);
  document.removeEventListener("mousemove", _handleGlobalPanMove);
  document.removeEventListener("mouseup", _handleGlobalPanUp);
  document.removeEventListener("wheel", _handleGlobalWheel);
  // Réinitialiser le zoom/pan à la fermeture
  resetCanvasZoomPan();
}

// ================================================================
// GESTION CENTRALISÉE DES RACCOURCIS CLAVIER
// ================================================================

/**
 * Map des raccourcis outils (partagé entre modes)
 */
function getToolKeyMap() {
  const hk = typeof CONFIG !== "undefined" ? CONFIG.HOTKEYS : {};
  return {
    b: "pencil",
    [hk.DRAWING_TOOL_ERASER || "e"]: "eraser",
    [hk.DRAWING_TOOL_RECTANGLE || "r"]: "rectangle",
    [hk.DRAWING_TOOL_CIRCLE || "c"]: "circle",
    [hk.DRAWING_TOOL_LINE || "l"]: "line",
    [hk.DRAWING_TOOL_ARROW || "a"]: "arrow",
    [hk.DRAWING_TOOL_MEASURE || "m"]: "measure",
    [hk.DRAWING_TOOL_CALIBRATE || "u"]: "calibrate",
  };
}

/**
 * Gestion centralisée des touches modificateurs (keydown)
 * @returns {boolean} true si l'événement a été traité
 */
function handleModifierKeyDown(e) {
  // Windows/Electron: Alt+Space (ou Shift+Alt+Space) ouvre le menu systeme de fenetre.
  // On bloque explicitement cette combinaison en mode dessin.
  if ((e.code === "Space" || e.key === " ") && e.altKey) {
    keysState.alt = true;
    keysState.space = true;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }
    return true;
  }

  if (e.key === "Shift") {
    keysState.shift = true;
    // Si Space déjà enfoncé et pas en train de dessiner → mode rotation
    if (keysState.space && !isDrawing && !ZoomManager.isPanning) {
      const preview = zoomDrawingPreview || drawingPreview;
      if (preview) preview.style.cursor = "alias";
    }
    return false;
  }
  if (e.key === "Alt") {
    keysState.alt = true;
    updateAltDuplicateCursor();
    return false;
  }
  if (e.key === "Control") {
    keysState.ctrl = true;
    if (isShapeEditingTool(currentTool) && !isDrawing) {
      scheduleDrawingMeasurementsRedraw();
      const modeText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.ignoreOtherShapes", { defaultValue: "Ignore other shapes (Ctrl)" })
          : "Ignore other shapes (Ctrl)";
      showDrawingModeHint(modeText);
    } else if (
      isDrawing &&
      (currentTool === "line" || currentTool === "rectangle")
    ) {
      const snapText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.snapMode", { defaultValue: "Snap (Ctrl)" })
          : "Snap (Ctrl)";
      showDrawingModeHint(snapText);
    } else if (isDraggingEndpoint && selectedMeasurement) {
      const snapText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.snapMode", { defaultValue: "Snap (Ctrl)" })
          : "Snap (Ctrl)";
      showDrawingModeHint(snapText);
    }
    return false;
  }
  if (e.key === " ") {
    keysState.space = true;
    e.preventDefault();
    e.stopPropagation();
    if (!isDrawing) {
      const preview = zoomDrawingPreview || drawingPreview;
      if (preview) {
        // Shift+Space → mode rotation, Space seul → mode pan
        preview.style.cursor = keysState.shift ? "alias" : "grab";
      }
    }
    return false;
  }
  if (e.key === "s" || e.key === "S") {
    keysState.s = true;
    return false;
  }
  const rotateKey = (CONFIG?.HOTKEYS?.DRAWING_ROTATE_SHAPE || "q").toLowerCase();
  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === rotateKey) {
    keysState.q = true;
    if (isDraggingMeasurement && selectedMeasurement && isEditableShape(selectedMeasurement.type)) {
      const rotateText =
        typeof i18next !== "undefined"
          ? i18next.t("drawing.hints.rotateShape", { defaultValue: "Rotate shape (Q)" })
          : "Rotate shape (Q)";
      showDrawingModeHint(rotateText);
    }
    return false;
  }
  return false;
}

/**
 * Gestion centralisée des touches modificateurs (keyup)
 */
function handleModifierKeyUp(e) {
  if (e.key === "Shift") {
    keysState.shift = false;
    // Si Space encore enfoncé → repasser en mode pan
    if (keysState.space && !isDrawing && !ZoomManager.isPanning && !ZoomManager.isRotating) {
      const preview = zoomDrawingPreview || drawingPreview;
      if (preview) preview.style.cursor = "grab";
    }
  }
  if (e.key === "Alt") {
    keysState.alt = false;
    if (drawingPreview) drawingPreview.style.cursor = "";
  }
  if (e.key === "Control") {
    keysState.ctrl = false;
    if (isShapeEditingTool(currentTool) && !isDrawing) {
      scheduleDrawingMeasurementsRedraw();
    }
    hideDrawingModeHint();
  }
  if (e.key === " ") {
    keysState.space = false;
    if (ZoomManager.isRotating) {
      ZoomManager.endRotate();
    }
    if (ZoomManager.isPanning) {
      ZoomManager.endPan();
    }
    // Restaurer le curseur
    const preview = zoomDrawingPreview || drawingPreview;
    if (preview) preview.style.cursor = "";
    updateDrawingCursor();
    spacePressStartPos = null;
    shapeEndAtSpacePress = null;
  }
  if (e.key === "s" || e.key === "S") {
    keysState.s = false;
  }
  const rotateKey = (CONFIG?.HOTKEYS?.DRAWING_ROTATE_SHAPE || "q").toLowerCase();
  if (e.key.toLowerCase() === rotateKey) {
    keysState.q = false;
    hideDrawingModeHint();
  }
}

/**
 * Gestion centralisée des raccourcis communs
 * @param {KeyboardEvent} e - L'événement clavier
 * @param {Object} options - Options de contexte
 * @param {Function} options.onClose - Fonction de fermeture
 * @param {Function} options.onExport - Fonction d'export
 * @param {Function} options.onLightboxToggle - Fonction de toggle lightbox
 * @param {Function} options.onToolSelect - Fonction de sélection d'outil
 * @returns {boolean} true si l'événement a été traité
 */
function handleCommonDrawingKeydown(e, options) {
  const key = e.key.toLowerCase();
  const { onClose, onExport, onLightboxToggle, onToolSelect } = options;

  // Touche configurable pour fermer ou annuler l'opération en cours
  if (e.key === CONFIG.HOTKEYS.DRAWING_CLOSE) {
    e.preventDefault();
    if (options.stopPropagation) e.stopPropagation();

    // Si le compas est en attente du second clic, annuler et rester en mode dessin
    if (compassWaitingSecondClick) {
      compassCenter = null;
      compassWaitingSecondClick = false;
      startPoint = null;
      isDrawing = false;
      // Effacer la prévisualisation
      const ctx = drawingManager.current;
      if (ctx.previewCtx && ctx.preview) {
        clearCanvas(ctx.previewCtx, ctx.preview);
      }
      // Cacher l'info de mesure
      const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
      if (measureInfo) measureInfo.classList.add("hidden");
      return true;
    }

    onClose();
    return true;
  }

  // Ctrl+Z / Ctrl+Shift+Z pour undo/redo
  if ((e.ctrlKey || e.metaKey) && key === "z") {
    e.preventDefault();
    if (e.shiftKey) {
      redoDrawing();
    } else {
      undoDrawing();
    }
    return true;
  }

  // Ctrl+I : inverser la selection des shapes editables
  if ((e.ctrlKey || e.metaKey) && key === "i") {
    e.preventDefault();
    if (typeof invertEditableShapeSelection === "function") {
      invertEditableShapeSelection();
    }
    return true;
  }

  // Ctrl+touche configurable pour export
  if ((e.ctrlKey || e.metaKey) && key === CONFIG.HOTKEYS.DRAWING_EXPORT.toLowerCase()) {
    e.preventDefault();
    onExport();
    return true;
  }

  // Ctrl+0 ou Alt+Z pour réinitialiser le zoom (si zoom activé)
  if (CONFIG.enableZoomInDrawingMode && (((e.ctrlKey || e.metaKey) && key === "0") || (e.altKey && key === "z"))) {
    e.preventDefault();
    resetCanvasZoomPan();
    return true;
  }

  // Ctrl+Plus ou Ctrl+Minus pour zoomer/dézoomer (si zoom activé)
  if (
    CONFIG.enableZoomInDrawingMode &&
    (e.ctrlKey || e.metaKey) &&
    (key === "+" || key === "-" || key === "=" || key === "_")
  ) {
    e.preventDefault();
    if (key === "+" || key === "=") {
      ZoomManager.zoomIn();
    } else {
      ZoomManager.zoomOut();
    }
    return true;
  }

  // Table lumineuse
  if (e.key === CONFIG.HOTKEYS.DRAWING_LIGHTBOX) {
    e.preventDefault();
    lightboxEnabled = !lightboxEnabled;
    onLightboxToggle();
    return true;
  }

  // Taille de l'outil (diminuer / augmenter)
  const hkSizeDecrease = CONFIG.HOTKEYS.DRAWING_SIZE_DECREASE || "é";
  const hkSizeIncrease = CONFIG.HOTKEYS.DRAWING_SIZE_INCREASE || '"';
  if (e.key === hkSizeDecrease) {
    e.preventDefault();
    changeDrawingSize(-1);
    return true;
  }
  if (e.key === hkSizeIncrease) {
    e.preventDefault();
    changeDrawingSize(1);
    return true;
  }

  // CapsLock pour curseur précis
  if (e.key === "CapsLock") {
    showPreciseCursor = !showPreciseCursor;
    updateDrawingCursor();
    return true;
  }

  // Laser (Shift+touche configurable, ex: Shift+B)
  const laserKey = CONFIG.HOTKEYS.DRAWING_TOOL_LASER;
  if (laserKey && e.shiftKey && key === laserKey.toLowerCase()) {
    e.preventDefault();
    onToolSelect("laser");
    return true;
  }

  // Shift+M pour config mesure
  if (e.shiftKey && key === "m") {
    e.preventDefault();
    showMeasureConfig();
    return true;
  }

  // Rapporteur (Shift+touche configurable, ex: Shift+U)
  const protractorKey = CONFIG.HOTKEYS.DRAWING_TOOL_PROTRACTOR;
  if (protractorKey && e.shiftKey && key === protractorKey.toLowerCase()) {
    e.preventDefault();
    onToolSelect("protractor");
    return true;
  }

  // Raccourcis outils (sans modificateur Shift)
  if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
    const toolMap = getToolKeyMap();
    if (toolMap[key]) {
      e.preventDefault();
      onToolSelect(toolMap[key]);
      return true;
    }
  }

  return false;
}

/**
 * Gère les raccourcis clavier en mode overlay
 */
function handleDrawingModeKeydown(e) {
  if (!isDrawingModeActive) return;
  if (e.target.tagName === "INPUT") return;

  // Touches modificateurs
  handleModifierKeyDown(e);

  // Raccourcis communs
  const handled = handleCommonDrawingKeydown(e, {
    onClose: closeDrawingMode,
    onExport: showDrawingExportOptions,
    onLightboxToggle: () => {
      updateDrawingLightbox();
      updateDrawingLightboxIcon();
      const lightboxBtn = document.getElementById("drawing-lightbox-btn");
      if (lightboxBtn) lightboxBtn.classList.toggle("active", lightboxEnabled);
    },
    onToolSelect: selectDrawingTool,
  });

  if (handled) return;

  // Raccourcis spécifiques au mode drawing
  // Tab pour toggle sidebar
  if (e.key === "Tab") {
    e.preventDefault();
    if (typeof toggleSidebar === "function") {
      toggleSidebar();
      if (typeof updateDrawingHudStackOffset === "function") {
        updateDrawingHudStackOffset();
      }
    }
    return;
  }

  // Delete/Backspace pour tout effacer (dessin + mesures)
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    clearDrawingCanvas();
    clearDrawingMeasurements();
    return;
  }
}

/**
 * Gère les relâchements de touches en mode overlay
 */
function handleDrawingModeKeyup(e) {
  if (!isDrawingModeActive) return;
  handleModifierKeyUp(e);
}

// ================================================================
// HELPERS UI POUR LES MODALS DE CONFIGURATION
// ================================================================
