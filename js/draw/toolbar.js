// FACTORY TOOLBAR

const TOOL_DEFINITIONS = {
  pencil: { icon: "PENCIL", tooltip: () => i18next.t("draw.tools.pencil", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_PENCIL.toUpperCase() }), hasStabilizerMenu: true },
  eraser: { icon: "ERASER", tooltip: () => i18next.t("draw.tools.eraser", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_ERASER.toUpperCase() }), hasEraserMenu: true },
  laser: { icon: "LASER_POINTER", tooltip: () => i18next.t("draw.tools.laser", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_LASER }) },
  line: {
    icon: "LINE",
    tooltip: () =>
      i18next.t("draw.tools.line", {
        hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_LINE.toUpperCase(),
      }),
    hasRectangleMenu: true,
  },
  arrow: {
    icon: "ARROW",
    tooltip: () => i18next.t("draw.tools.arrow", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_ARROW.toUpperCase() }),
    hasRectangleMenu: true,
  },
  rectangle: {
    icon: "RECTANGLE",
    tooltip: () =>
      i18next.t("draw.tools.rectangle", {
        hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_RECTANGLE.toUpperCase(),
      }),
    hasRectangleMenu: true,
  },
  circle: {
    icon: "CIRCLE",
    tooltip: () => i18next.t("draw.tools.circle", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_CIRCLE.toUpperCase() }),
    hasRectangleMenu: true,
  },
  measure: {
    icon: "MEASURE",
    tooltip: () => i18next.t("draw.tools.measure", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_MEASURE.toUpperCase() }),
    hasMeasureMenu: true,
  },
  calibrate: {
    icon: "CALIBRATE",
    tooltip: () => i18next.t("draw.tools.calibrate", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_CALIBRATE.toUpperCase() }),
    hasCalibrateMenu: true,
  },
  protractor: { icon: "PROTRACTOR", tooltip: () => i18next.t("draw.tools.protractor", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_PROTRACTOR }) },
};

/**
 * Crée un bouton d'outil avec sa configuration
 * @param {string} toolId - L'identifiant de l'outil
 * @param {Object} options - Options de création
 * @param {string} options.btnClass - Classe CSS du bouton
 * @param {Function} options.onSelect - Callback de sélection
 * @param {string} [options.activeClass] - Classe pour l'état actif
 * @returns {HTMLButtonElement}
 */
function createToolButton(toolId, options) {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def) return null;

  const { btnClass, onSelect, activeClass = "active" } = options;
  const isActive = toolId === "pencil";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${btnClass} ${isActive ? activeClass : ""}`.trim();
  btn.setAttribute("data-tool", toolId);
  btn.setAttribute("data-tooltip", typeof def.tooltip === "function" ? def.tooltip() : def.tooltip);
  btn.innerHTML = ICONS[def.icon];

  btn.onclick = () => onSelect(toolId, btn);

  // Menus contextuels spécifiques
  if (def.hasStabilizerMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showStabilizerMenu(e.clientX, e.clientY);
    };
  }
  if (def.hasEraserMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showEraserToolMenu(e.clientX, e.clientY);
    };
  }
  if (def.hasMeasureMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showMeasureConfig();
    };
  }
  if (def.hasCalibrateMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      const calibrateLine = measurementLines.find(
        (line) => line.type === "calibrate",
      );
      if (calibrateLine) {
        showCalibrateIndividualConfig(calibrateLine, e.clientX, e.clientY);
      } else {
        showDrawingToast(
          i18next.t("draw.toasts.noUnitDefined"),
          "info",
        );
      }
    };
  }
  if (def.hasRectangleMenu) {
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showRectangleToolMenu(e.clientX, e.clientY);
    };
  }
  return btn;
}

/**
 * Crée tous les boutons d'outils pour une toolbar
 * @param {Object} options - Options de création
 * @param {string} options.btnClass - Classe CSS des boutons
 * @param {HTMLElement} options.toolbar - Élément toolbar pour la sélection
 * @param {string} options.toolSelector - Sélecteur CSS pour les boutons d'outils
 * @returns {Object} Map des boutons par toolId
 */
function createAllToolButtons(options) {
  const { btnClass, toolbar, toolSelector } = options;
  const tools = {};

  const onSelect = (toolId, btn) => {
    toolbar
      .querySelectorAll(toolSelector)
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = toolId;
    if (!["line", "rectangle", "circle", "arrow"].includes(toolId)) {
      clearEditableShapeSelection();
      redrawDrawingMeasurements();
    }
    hideDrawingEditHud();
    updateDrawingCursor();
  };

  Object.keys(TOOL_DEFINITIONS).forEach((toolId) => {
    tools[toolId] = createToolButton(toolId, { btnClass, onSelect });
  });

  return tools;
}

/**
 * Crée les boutons d'action (clear, clearMeasurements)
 * @param {string} btnClass - Classe CSS des boutons
 * @returns {Object} Map des boutons
 */
function createActionButtons(btnClass) {
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = btnClass;
  clearBtn.setAttribute("data-tool", "clear");
  clearBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearDrawing"));
  clearBtn.innerHTML = ICONS.CLEAR;
  clearBtn.onclick = () => clearDrawingCanvas();

  const clearMeasurementsBtn = document.createElement("button");
  clearMeasurementsBtn.type = "button";
  clearMeasurementsBtn.className = btnClass;
  clearMeasurementsBtn.setAttribute("data-tool", "clear-measurements");
  clearMeasurementsBtn.setAttribute("data-tooltip", i18next.t("draw.buttons.clearMeasurements"));
  clearMeasurementsBtn.innerHTML = ICONS.TRASH_RAYURES;
  clearMeasurementsBtn.onclick = () => clearDrawingMeasurements();

  return { clear: clearBtn, clearMeasurements: clearMeasurementsBtn };
}

/**
 * Crée les inputs couleur et taille
 * @param {Object} options - Options de style
 * @returns {Object} { colorInput, sizeInput }
 */
function createStyleInputs(options = {}) {
  const { colorClass = "", sizeClass = "" } = options;

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.id = options.colorId || "drawing-color";
  colorInput.value = annotationStyle.color;
  colorInput.className = colorClass;
  colorInput.setAttribute("data-tooltip", i18next.t("draw.config.color"));
  colorInput.oninput = (e) => {
    annotationStyle.color = e.target.value;
  };

  const sizeInput = document.createElement("input");
  sizeInput.type = "range";
  sizeInput.id = options.sizeId || "drawing-size";
  sizeInput.min = "1";
  sizeInput.max = "50";
  sizeInput.value = annotationStyle.size;
  sizeInput.className = sizeClass;
  sizeInput.title = i18next.t("draw.sliders.size");
  sizeInput.oninput = (e) => {
    annotationStyle.size = parseInt(e.target.value);
    updateDrawingCursor();
  };

  return { colorInput, sizeInput };
}

/**
 * Crée le bouton table lumineuse
 * @param {Object} options - Options
 * @param {string} options.btnClass - Classe CSS
 * @param {string} options.context - "main" ou "zoom"
 * @returns {HTMLButtonElement}
 */
function createLightboxButton(options) {
  const { btnClass, context = "main" } = options;
  const updateFn =
    context === "zoom" ? updateZoomDrawingLightbox : updateDrawingLightbox;
  const menuFn =
    context === "zoom"
      ? (x, y) => showLightboxMenu(x, y, "zoom")
      : showDrawingLightboxMenu;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = context === "zoom" ? "zoom-lightbox-btn" : "drawing-lightbox-btn";
  btn.className = btnClass;
  btn.setAttribute("data-tooltip", i18next.t("draw.buttons.lightbox"));
  btn.innerHTML = lightboxEnabled
    ? ICONS.LIGHT_TABLE_OFF
    : ICONS.LIGHT_TABLE_ON;

  btn.onclick = (e) => {
    if (e.button === 2 || e.ctrlKey) {
      menuFn(e.clientX, e.clientY);
    } else {
      lightboxEnabled = !lightboxEnabled;
      updateFn();
      btn.innerHTML = lightboxEnabled
        ? ICONS.LIGHT_TABLE_OFF
        : ICONS.LIGHT_TABLE_ON;
      btn.classList.toggle("active", lightboxEnabled);
    }
  };
  btn.oncontextmenu = (e) => {
    e.preventDefault();
    menuFn(e.clientX, e.clientY);
  };

  return btn;
}

/**
 * Crée le bouton export
 * @param {Object} options - Options
 * @param {string} options.btnClass - Classe CSS
 * @param {string} options.context - "main" ou "zoom"
 * @returns {HTMLButtonElement}
 */
function createExportButton(options) {
  const { btnClass, context = "main" } = options;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = context === "zoom" ? "zoom-export-btn" : "drawing-export";
  btn.className = btnClass;
  btn.setAttribute("data-tooltip", i18next.t("draw.buttons.export", { hotkey: `Ctrl+${CONFIG.HOTKEYS.DRAWING_EXPORT.toUpperCase()}` }));
  btn.innerHTML = ICONS.EXPORT;
  btn.onclick = () =>
    context === "zoom" ? showExportModal("zoom") : showDrawingExportOptions();

  return btn;
}

/**
 * Crée l'indicateur de zoom avec bouton de réinitialisation
 * @returns {HTMLElement} Container avec l'indicateur
 */
function createZoomIndicator() {
  const container = document.createElement("div");
  container.className = "zoom-indicator-container";

  const label = document.createElement("div");
  label.className = "zoom-indicator-label";
  label.textContent = i18next.t("draw.zoom.label");

  const valueRow = document.createElement("div");
  valueRow.className = "zoom-indicator-value-row";

  const value = document.createElement("span");
  value.className = "zoom-indicator-value";
  value.id = "zoom-indicator-value";
  value.textContent = "100%";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "zoom-indicator-reset";
  resetBtn.innerHTML = "⟲";
  resetBtn.setAttribute(
    "data-tooltip",
    i18next.t("draw.buttons.resetZoom"),
  );

  valueRow.appendChild(value);
  valueRow.appendChild(resetBtn);

  container.appendChild(label);
  container.appendChild(valueRow);

  resetBtn.onclick = resetCanvasZoomPan;

  return container;
}

/**
 * Met à jour l'affichage du niveau de zoom
 * Met à jour tous les indicateurs présents (mode principal et mode zoom)
 */
function updateZoomIndicator() {
  const indicators = document.querySelectorAll(".zoom-indicator-value");
  const zoomText = Math.round(ZoomManager.scale * 100) + "%";
  const rotation = ZoomManager.rotation;
  const rotText = rotation !== 0 ? ` ${Math.round(rotation)}°` : "";
  indicators.forEach((indicator) => {
    indicator.textContent = zoomText + rotText;
  });
}

function createCloseButton(options) {
  const { btnClass, onClose } = options;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "drawing-close";
  btn.className = btnClass;
  btn.setAttribute("data-tooltip", i18next.t("draw.buttons.closeWithKey", { hotkey: CONFIG.HOTKEYS.DRAWING_CLOSE }));
  btn.innerHTML = ICONS.CLOSE;
  btn.onclick = onClose;

  return btn;
}

// Marqueur séparateur pour la drawing-toolbar
const DIVIDER = { type: "divider" };

function populateDrawingToolbar() {
  if (!drawingToolbar) return;

  // Vider le contenu existant
  drawingToolbar.innerHTML = "";

  // Créer les outils avec les helpers partagés
  const toolElements = createAllToolButtons({
    btnClass: "annotation-tool",
    toolbar: drawingToolbar,
    toolSelector: ".annotation-tool[data-tool]",
  });

  // Boutons d'action
  const actionBtns = createActionButtons("annotation-tool");

  // Inputs
  const { colorInput, sizeInput } = createStyleInputs({
    colorId: "drawing-color",
    sizeId: "drawing-size",
  });

  // Boutons spéciaux
  const lightboxBtn = createLightboxButton({
    btnClass: "annotation-tool",
    context: "main",
  });
  const exportBtn = createExportButton({
    btnClass: "annotation-tool",
    context: "main",
  });
  const closeBtn = createCloseButton({
    btnClass: "annotation-btn-close",
    onClose: closeDrawingMode,
  });

  // ============================================================
  // LAYOUT DE LA DRAWING-TOOLBAR
  // DIVIDER pour ajouter un séparateur visuel
  // ============================================================
  const toolbarLayout = [
    // Outils de dessin
    toolElements.pencil,
    toolElements.eraser,
    toolElements.laser,
    toolElements.line,
    toolElements.arrow,
    toolElements.rectangle,
    toolElements.circle,
    actionBtns.clear,
    DIVIDER,
    toolElements.measure,
    toolElements.calibrate,
    toolElements.protractor,
    actionBtns.clearMeasurements,
    DIVIDER,
    colorInput,
    sizeInput,
    DIVIDER,
    lightboxBtn,
    exportBtn,
    DIVIDER,
    ...(CONFIG.enableZoomInDrawingMode ? [createZoomIndicator()] : []),
    closeBtn,
  ];

  // ============================================================
  // ASSEMBLAGE (ne pas modifier)
  // ============================================================
  toolbarLayout.forEach((item) => {
    if (item === DIVIDER) {
      const div = document.createElement("div");
      div.className = "toolbar-divider";
      drawingToolbar.appendChild(div);
    } else if (item) {
      drawingToolbar.appendChild(item);
    }
  });
}


/**
 * Initialise le drag de la toolbar du mode overlay
 */
function initDrawingToolbarDrag() {
  if (!drawingToolbar) return;

  let isDragging = false;
  let startX, startY, startLeft, startTop;
  let dockZone = null;
  let isInDockZone = false;

  // Fonction pour basculer entre vertical et horizontal
  const toggleToolbarOrientation = () => {
    const isHorizontal = drawingToolbar.classList.contains("horizontal");
    drawingToolbar.classList.toggle("horizontal", !isHorizontal);

    // Réajuster la position si nécessaire
    requestAnimationFrame(() => {
      const rect = drawingToolbar.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        drawingToolbar.style.left = window.innerWidth - rect.width - 10 + "px";
      }
      if (rect.bottom > window.innerHeight - 10) {
        drawingToolbar.style.top = window.innerHeight - rect.height - 10 + "px";
      }
    });
  };

  // Créer la zone de dock
  const createDockZone = () => {
    if (dockZone) return dockZone;

    dockZone = document.createElement("div");
    dockZone.className = "toolbar-dock-zone";
    dockZone.innerHTML =
      `<span class="toolbar-dock-zone-label">${i18next.t("draw.modals.dockHorizontal")}</span>`;
    document.body.appendChild(dockZone);

    return dockZone;
  };

  // Mettre à jour la position de la zone de dock (sous l'image ou en bas de l'écran)
  const updateDockZonePosition = () => {
    if (!dockZone) return;

    const margin = 10;
    const dockHeight = 50; // Hauteur de la zone de dock
    const imageWrapper = document.querySelector(".image-wrapper");

    let topPosition;

    if (imageWrapper) {
      const rect = imageWrapper.getBoundingClientRect();
      // Essayer de positionner juste sous l'image
      topPosition = rect.bottom + margin;

      // Si ça sort de l'écran, coller en bas
      if (topPosition + dockHeight > window.innerHeight - margin) {
        topPosition = window.innerHeight - dockHeight - margin;
      }
    } else {
      // Fallback : en bas de l'écran
      topPosition = window.innerHeight - dockHeight - margin;
    }

    dockZone.style.top = topPosition + "px";
    dockZone.style.bottom = "auto";
  };

  // Vérifier si le curseur est dans la zone de dock
  const checkDockZone = (mouseX, mouseY) => {
    if (!dockZone) return false;

    const rect = dockZone.getBoundingClientRect();
    return (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    );
  };

  // Snapper la toolbar sous l'image en mode horizontal
  const snapToBottom = () => {
    // Passer en mode horizontal
    drawingToolbar.classList.add("horizontal");

    // Attendre le reflow pour obtenir les bonnes dimensions
    requestAnimationFrame(() => {
      // Relire les dimensions après le changement de mode
      const toolbarRect = drawingToolbar.getBoundingClientRect();
      const toolbarHeight = toolbarRect.height;
      const toolbarWidth = toolbarRect.width;
      const imageWrapper = document.querySelector(".image-wrapper");
      const margin = 10;

      let newLeft, newTop;

      if (imageWrapper) {
        const imageRect = imageWrapper.getBoundingClientRect();

        // Centrer horizontalement par rapport à l'image
        newLeft = imageRect.left + (imageRect.width - toolbarWidth) / 2;

        // Essayer de positionner sous l'image
        newTop = imageRect.bottom + margin;

        // Si ça sort de l'écran en bas, coller au bas de l'écran
        if (newTop + toolbarHeight > window.innerHeight - margin) {
          newTop = window.innerHeight - toolbarHeight - margin;
        }
      } else {
        // Fallback : centrer en bas de l'écran
        newLeft = (window.innerWidth - toolbarWidth) / 2;
        newTop = window.innerHeight - toolbarHeight - margin;
      }

      // S'assurer que la toolbar reste dans l'écran horizontalement
      newLeft = Math.max(
        margin,
        Math.min(newLeft, window.innerWidth - toolbarWidth - margin),
      );

      drawingToolbar.style.left = newLeft + "px";
      drawingToolbar.style.top = newTop + "px";
    });
  };

  // Fonction pour démarrer le drag
  const startDrag = (e) => {
    isDragging = true;
    isInDockZone = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = drawingToolbar.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    // Supprimer le transform pour utiliser left/top
    drawingToolbar.style.transform = "none";
    drawingToolbar.style.left = startLeft + "px";
    drawingToolbar.style.top = startTop + "px";

    // Créer et afficher la zone de dock
    createDockZone();
    updateDockZonePosition();
    dockZone.classList.add("visible");

    e.preventDefault();
  };

  // Détecter si le clic est sur un élément draggable (toolbar-handle ou les bords)
  const isClickOnDraggableArea = (e) => {
    const target = e.target;

    // Si on clique sur toolbar-handle ou son contenu, c'est draggable
    if (target.closest(".toolbar-handle")) return true;

    // Si on clique directement sur la toolbar (pas sur un bouton/input)
    if (target === drawingToolbar) return true;

    // Si on clique sur un label de section (DESSIN, MESURE)
    if (target.classList.contains("toolbar-section-label")) return true;

    // Si on clique sur un séparateur
    if (target.classList.contains("toolbar-separator")) return true;

    return false;
  };

  // Event sur la toolbar entière
  drawingToolbar.onmousedown = (e) => {
    if (isClickOnDraggableArea(e)) {
      startDrag(e);
    }
  };

  // Clic droit pour basculer l'orientation manuellement
  drawingToolbar.oncontextmenu = (e) => {
    // Ne pas interférer avec les clics droits sur les boutons (pencil, measure, etc.)
    if (e.target.closest(".annotation-tool")) return;

    e.preventDefault();
    toggleToolbarOrientation();
  };

  // Handler mousemove (nommé pour nettoyage)
  globalEventHandlers.toolbarMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;

    // Contraindre au viewport
    const toolbarRect = drawingToolbar.getBoundingClientRect();
    const margin = DRAWING_CONSTANTS.VIEWPORT_MARGIN;
    newLeft = Math.max(
      margin,
      Math.min(window.innerWidth - toolbarRect.width - margin, newLeft),
    );
    newTop = Math.max(
      margin,
      Math.min(window.innerHeight - toolbarRect.height - margin, newTop),
    );

    drawingToolbar.style.left = newLeft + "px";
    drawingToolbar.style.top = newTop + "px";

    // Vérifier si on est dans la zone de dock
    const nowInDockZone = checkDockZone(e.clientX, e.clientY);
    if (nowInDockZone !== isInDockZone) {
      isInDockZone = nowInDockZone;
      if (dockZone) {
        dockZone.classList.toggle("active", isInDockZone);
      }
    }
  };

  // Handler mouseup (nommé pour nettoyage)
  globalEventHandlers.toolbarMouseUp = () => {
    if (isDragging) {
      // Si on lâche dans la zone de dock, snapper
      if (isInDockZone) {
        snapToBottom();
      }

      // Cacher la zone de dock
      if (dockZone) {
        dockZone.classList.remove("visible", "active");
      }
    }

    isDragging = false;
    isInDockZone = false;
  };

  document.addEventListener("mousemove", globalEventHandlers.toolbarMouseMove);
  document.addEventListener("mouseup", globalEventHandlers.toolbarMouseUp);

  // Handler resize (nommé pour nettoyage)
  globalEventHandlers.toolbarResize = () => {
    if (!drawingToolbar || drawingToolbar.classList.contains("hidden")) return;

    const rect = drawingToolbar.getBoundingClientRect();
    const margin = DRAWING_CONSTANTS.VIEWPORT_MARGIN;
    let needsUpdate = false;
    let newLeft = rect.left;
    let newTop = rect.top;

    // Vérifier si la toolbar sort à droite
    if (rect.right > window.innerWidth - margin) {
      newLeft = window.innerWidth - rect.width - margin;
      needsUpdate = true;
    }

    // Vérifier si la toolbar sort à gauche
    if (rect.left < margin) {
      newLeft = margin;
      needsUpdate = true;
    }

    // Vérifier si la toolbar sort en bas
    if (rect.bottom > window.innerHeight - margin) {
      newTop = window.innerHeight - rect.height - margin;
      needsUpdate = true;
    }

    // Vérifier si la toolbar sort en haut
    if (rect.top < margin) {
      newTop = margin;
      needsUpdate = true;
    }

    if (needsUpdate) {
      drawingToolbar.style.transform = "none";
      drawingToolbar.style.left = Math.max(margin, newLeft) + "px";
      drawingToolbar.style.top = Math.max(margin, newTop) + "px";
    }
  };

  // Écouter le redimensionnement de la fenêtre
  window.addEventListener("resize", globalEventHandlers.toolbarResize);
}
