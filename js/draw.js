// ================================================================
// MODULE DE DESSIN ET ANNOTATION (PoseChrono)
// ================================================================
// Ce fichier contient tout le système d'annotation avec :
// - Outils de dessin (crayon, gomme, formes)
// - Outils de mesure et calibration
// - Système de calques séparés
// - Gestion des événements souris/clavier
// ================================================================

const DEBUG = false;
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

// FONCTIONS UTILITAIRES

function getDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function getPointToSegmentDistance(point, segStart, segEnd) {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return getDistance(point, segStart);
  }

  // Projection du point sur la ligne
  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;

  return Math.sqrt(
    (point.x - projX) * (point.x - projX) +
      (point.y - projY) * (point.y - projY),
  );
}

function interpolatePoints(from, to, stepSize) {
  const points = [];
  const dist = getDistance(from, to);
  const steps = Math.max(1, Math.ceil(dist / stepSize));
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: from.x + dx * t,
      y: from.y + dy * t,
    });
  }
  return points;
}

function constrainToViewport(rect, margin = DRAWING_CONSTANTS.VIEWPORT_MARGIN) {
  let { left, top, width, height } = rect;
  let needsUpdate = false;

  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - width - margin;
    needsUpdate = true;
  }
  if (left < margin) {
    left = margin;
    needsUpdate = true;
  }
  if (top + height > window.innerHeight - margin) {
    top = window.innerHeight - height - margin;
    needsUpdate = true;
  }
  if (top < margin) {
    top = margin;
    needsUpdate = true;
  }

  return { left, top, needsUpdate };
}

/**
 * Crée un debouncer pour limiter les appels de fonction
 */
function createDebouncer() {
  let timeoutId = null;
  return {
    debounce(fn, delay) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(fn, delay);
    },
    cancel() {
      clearTimeout(timeoutId);
      timeoutId = null;
    },
  };
}

const resizeDebouncer = createDebouncer();

const globalEventHandlers = {
  toolbarMouseMove: null,
  toolbarMouseUp: null,
  toolbarResize: null,
  scrollbarMouseMove: null,
  scrollbarMouseUp: null,
};

function cleanupGlobalDrawingEvents() {
  if (globalEventHandlers.toolbarMouseMove) {
    document.removeEventListener(
      "mousemove",
      globalEventHandlers.toolbarMouseMove,
    );
    globalEventHandlers.toolbarMouseMove = null;
  }
  if (globalEventHandlers.toolbarMouseUp) {
    document.removeEventListener("mouseup", globalEventHandlers.toolbarMouseUp);
    globalEventHandlers.toolbarMouseUp = null;
  }
  if (globalEventHandlers.toolbarResize) {
    window.removeEventListener("resize", globalEventHandlers.toolbarResize);
    globalEventHandlers.toolbarResize = null;
  }
  if (globalEventHandlers.scrollbarMouseMove) {
    document.removeEventListener("mousemove", globalEventHandlers.scrollbarMouseMove);
    globalEventHandlers.scrollbarMouseMove = null;
  }
  if (globalEventHandlers.scrollbarMouseUp) {
    document.removeEventListener("mouseup", globalEventHandlers.scrollbarMouseUp);
    globalEventHandlers.scrollbarMouseUp = null;
  }
  // Annuler le debouncer
  resizeDebouncer.cancel();
}

function showDrawingToast(message, type = "info", duration = 3000) {
  // Supprimer le toast existant si présent
  const existing = document.getElementById("drawing-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "drawing-toast";
  toast.className = `drawing-toast drawing-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Animation d'entrée
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Auto-suppression
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Applique une contrainte horizontale/verticale à une ligne
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 * @returns {Object} Point d'arrivée contraint
 */
function applyLineConstraint(start, end) {
  const width = end.x - start.x;
  const height = end.y - start.y;
  if (Math.abs(width) > Math.abs(height)) {
    return { x: end.x, y: start.y }; // Horizontal
  }
  return { x: start.x, y: end.y }; // Vertical
}

/**
 * Applique les contraintes Shift et Alt aux formes
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 * @param {string} tool - Type d'outil (line, arrow, rectangle, circle)
 * @param {boolean} isShift - Contraindre les proportions
 * @param {boolean} isAlt - Dessiner depuis le centre
 * @returns {Object} {drawStart, drawEnd} - Points ajustés
 */
function applyShapeConstraints(
  start,
  end,
  tool,
  isShift = false,
  isAlt = false,
) {
  let drawStart = { ...start };
  let drawEnd = { ...end };
  let width = end.x - start.x;
  let height = end.y - start.y;

  // Shift : contraindre les proportions
  if (isShift) {
    if (tool === "line" || tool === "arrow") {
      drawEnd = applyLineConstraint(start, end);
    } else if (tool === "rectangle" || tool === "circle") {
      // Carré ou cercle parfait
      const maxSize = Math.max(Math.abs(width), Math.abs(height));
      const signWidth = Math.sign(width) || 1;
      const signHeight = Math.sign(height) || 1;
      drawEnd = {
        x: start.x + maxSize * signWidth,
        y: start.y + maxSize * signHeight,
      };
    }
    // Recalculer après contrainte
    width = drawEnd.x - start.x;
    height = drawEnd.y - start.y;
  }

  // Alt : dessiner depuis le centre
  if (isAlt) {
    drawStart = {
      x: start.x - width,
      y: start.y - height,
    };
  }

  return { drawStart, drawEnd };
}

/**
 * Applique le style de trait standard au contexte
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {string} color - Couleur du trait
 * @param {number} size - Épaisseur du trait
 */
function applyStrokeStyle(
  ctx,
  color = annotationStyle.color,
  size = annotationStyle.size,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/**
 * Dessine une forme sur le canvas
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 * @param {string} tool - Type de forme (rectangle, circle, line, arrow)
 */
function drawShapeOnCanvas(ctx, start, end, tool) {
  switch (tool) {
    case "rectangle":
      ctx.beginPath();
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.stroke();
      break;
    case "circle": {
      const radiusX = Math.abs(end.x - start.x) / 2;
      const radiusY = Math.abs(end.y - start.y) / 2;
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "line":
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      break;
    case "arrow":
      drawArrowOnCanvas(ctx, start, end);
      break;
  }
}

/**
 * Dessine une flèche sur le canvas
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ {x, y}
 * @param {Object} end - Point d'arrivée {x, y}
 */
function drawArrowOnCanvas(ctx, start, end) {
  const headLength = DRAWING_CONSTANTS.ARROW_HEAD_LENGTH;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  // Ligne principale
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Pointe de flèche
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

// ================================================================
// DRAWING MANAGER - Encapsulation de l'état et de la logique
// ================================================================

class DrawingContext {
  constructor(type) {
    this.type = type; // 'normal' ou 'zoom'
    this.canvas = null;
    this.ctx = null;
    this.preview = null;
    this.previewCtx = null;
    this.measures = null;
    this.measuresCtx = null;
    this.lightbox = null;
    this.lightboxCtx = null;
    this.toolbar = null;
    this.targetImage = null;
    this.overlay = null;
  }

  get isZoom() { return this.type === 'zoom'; }
  get isNormal() { return this.type === 'normal'; }
}

class DrawingManager {
  constructor() {
    this.normal = new DrawingContext('normal');
    this.zoom = new DrawingContext('zoom');
    this.current = this.normal;
    
    // État partagé entre les deux contextes
    this.state = {
      currentTool: 'pencil',
      isDrawing: false,
      isActive: false,
      startPoint: null,
      lastDrawnPoint: null,
      wasShiftPressed: false,
      calibrationUnit: null,
      showPreciseCursor: false,
      lastMousePosition: { x: 0, y: 0 },
      wasOutsideCanvas: false,
      currentImageSrc: null,
    };
    
    // État des mesures (partagé)
    this.measurements = {
      lines: [], // [{id, start: {x,y}, end: {x,y}, type: 'measure'|'calibrate'}]
      selected: null,
      
      // Drag des bornes
      isDraggingEndpoint: false,
      draggedEndpoint: null, // 'start' ou 'end'
      hoveredEndpoint: null,
      
      // Drag de la mesure entière
      isDraggingMeasurement: false,
      dragOffset: null,
      
      // Drag du label
      isDraggingLabel: false,
      dragLabelMeasurement: null,
      
      // Configuration d'affichage
      visible: true,
      showCalibrateLine: true, // Afficher le segment de calibration
      lineWidth: DRAWING_CONSTANTS.DEFAULT_MEASURE_LINE_WIDTH || 3,
      color: DRAWING_CONSTANTS.DEFAULT_MEASURE_COLOR,
      showSizeLabels: DRAWING_CONSTANTS.DEFAULT_SHOW_SIZE_LABELS,
      graduationType: DRAWING_CONSTANTS.DEFAULT_GRADUATION_TYPE,
      graduationSize: DRAWING_CONSTANTS.DEFAULT_GRADUATION_SIZE,
      labelSize: DRAWING_CONSTANTS.DEFAULT_MEASURE_LABEL_SIZE,
      
      // Options de proportions
      proportionsConfig: {
        showCenter: true,
        showThirds: true,
        showQuarters: false,
        showLabels: true,
        colorCenter: "#fbbf24",
        colorThirds: "#3b82f6",
        colorQuarters: "#a855f7",
      },
    };
    
    // Stabilisateur
    this.stabilizer = {
      enabled: typeof CONFIG !== "undefined" ? CONFIG.enableStabilizerByDefault : true,
      strength: 0.2, // 0 = pas de lissage, 1 = lissage maximum
      bufferSize: DRAWING_CONSTANTS.STABILIZER_BUFFER_SIZE,
      buffer: [],
    };
    
    // Laser
    this.laser = {
      points: [],
      animationId: null,
      shiftPreview: null,
    };
    
    // Table lumineuse
    this.lightbox = {
      enabled: false,
      opacity: typeof CONFIG !== "undefined" ? CONFIG.defaultLightboxOpacity : 0.5,
    };
    
    // Historique
    this.history = {
      drawing: [],
      index: -1,
      maxSize: DRAWING_CONSTANTS.MAX_HISTORY,
    };
  }

  getContext(type) {
    return type === 'zoom' ? this.zoom : this.normal;
  }

  setContext(type) {
    this.current = this.getContext(type);
  }

  get canvas() { return this.current.canvas; }
  get ctx() { return this.current.ctx; }
  get preview() { return this.current.preview; }
  get previewCtx() { return this.current.previewCtx; }
  get measures() { return this.current.measures; }
  get measuresCtx() { return this.current.measuresCtx; }
  get toolbar() { return this.current.toolbar; }
  get targetImage() { return this.current.targetImage; }
  get isZoom() { return this.current.isZoom; }
}

// Instance globale
const drawingManager = new DrawingManager();

// ================================================================
// LEGACY ALIASES — À MIGRER VERS drawingManager.*
// ================================================================
// Ces variables existent pour compatibilité avec le code existant.
// Tout nouveau code doit utiliser drawingManager.canvas, drawingManager.ctx, etc.
// Migration progressive : remplacer les usages directs par drawingManager.*
// puis supprimer ces alias et syncDrawingContext().
let drawingCanvas, drawingCtx, drawingPreview, drawingPreviewCtx;
let drawingMeasures, drawingMeasuresCtx, drawingLightboxCanvas, drawingLightboxCtx;
let drawingToolbar, targetImageElement;

// Fonction pour synchroniser les variables legacy avec le contexte courant
function syncDrawingContext() {
  const ctx = drawingManager.current;
  drawingCanvas = ctx.canvas;
  drawingCtx = ctx.ctx;
  drawingPreview = ctx.preview;
  drawingPreviewCtx = ctx.previewCtx;
  drawingMeasures = ctx.measures;
  drawingMeasuresCtx = ctx.measuresCtx;
  drawingLightboxCanvas = ctx.lightbox;
  drawingLightboxCtx = ctx.lightboxCtx;
  drawingToolbar = ctx.toolbar;
  targetImageElement = ctx.targetImage;
}

// Remplacer setContext pour synchroniser automatiquement
const originalSetContext = drawingManager.setContext.bind(drawingManager);
drawingManager.setContext = function(type) {
  originalSetContext(type);
  syncDrawingContext();
  // Reset compass state on context switch
  compassCenter = null;
  compassWaitingSecondClick = false;
  compassDragging = false;
  compassDragMoved = false;
};

// Fonction utilitaire
function withContext(contextType, fn) {
  const previous = drawingManager.current;
  drawingManager.setContext(contextType);
  try {
    return fn(drawingManager.current);
  } finally {
    drawingManager.current = previous;
    syncDrawingContext();
  }
}

// ================================================================
// ÉTAT PRINCIPAL DU DESSIN (legacy - alias vers DrawingManager)
// ================================================================
// Ces objets sont des références vers l'état du DrawingManager
// pour maintenir la compatibilité avec le code existant
const drawState = drawingManager.state;
const measureState = drawingManager.measurements;
const stabilizerState = drawingManager.stabilizer;
const laserState = drawingManager.laser;
const historyState = drawingManager.history;
const lightboxState = drawingManager.lightbox;

// ================================================================
// CONFIGURATION DU STYLE D'ANNOTATION
// ================================================================
const annotationStyle = {
  color: "#ff3333",
  size:
    typeof CONFIG !== "undefined" && CONFIG.defaultDrawingSize
      ? CONFIG.defaultDrawingSize
      : 4,
};

// ================================================================
// ÉTAT DU COMPAS (outil protractor)
// ================================================================
const compassState = {
  center: null, // Centre défini au premier clic {x, y}
  isWaitingForSecondClick: false, // En attente du deuxième clic pour valider
};

// ================================================================
// RÉFÉRENCES DOM DU MODE DESSIN
// ================================================================
const drawingDOM = {
  overlay: null,
  canvas: null,
  measures: null,
  preview: null,
  lightboxCanvas: null,
  toolbar: null,
  targetImage: null,
  resizeObserver: null,
  // Éléments UI cachés pour les hot paths (mousemove, animations)
  measureInfo: null,
  cursor: null,
  unitInfo: null,
  unitValue: null,
  totalDistanceInfo: null,
  totalDistanceValue: null,
};

// ================================================================
// CONTEXTES CANVAS
// ================================================================
const drawingContexts = {
  main: null,
  measures: null,
  preview: null,
  lightbox: null,
};

const drawingStateCache = new Map();

// ================================================================
// ÉTAT DES TOUCHES MODIFICATEURS
// ================================================================
const keysState = {
  shift: false,
  alt: false,
  space: false,
};

// ================================================================
// VARIABLES DE DÉPLACEMENT AVEC ESPACE
// ================================================================
const spaceMovement = {
  pressStartPos: null,
  shapeEndAtPress: null,
  shapeOffset: null,
};

// ================================================================
// ALIASES POUR COMPATIBILITÉ (seront progressivement supprimés)
// ================================================================
// Ces getters/setters maintiennent la compatibilité tout en synchronisant
// automatiquement avec l'état du DrawingManager
function _getDrawState() { return drawingManager.state; }
function _getMeasureState() { return drawingManager.measurements; }
function _getStabilizerState() { return drawingManager.stabilizer; }
function _getLaserState() { return drawingManager.laser; }

Object.defineProperties(window, {
  // drawState aliases
  currentTool: { 
    get() { return _getDrawState().currentTool; },
    set(v) { _getDrawState().currentTool = v; }
  },
  isDrawing: { 
    get() { return _getDrawState().isDrawing; },
    set(v) { _getDrawState().isDrawing = v; }
  },
  startPoint: { 
    get() { return _getDrawState().startPoint; },
    set(v) { _getDrawState().startPoint = v; }
  },
  lastDrawnPoint: { 
    get() { return _getDrawState().lastDrawnPoint; },
    set(v) { _getDrawState().lastDrawnPoint = v; }
  },
  wasShiftPressed: { 
    get() { return _getDrawState().wasShiftPressed; },
    set(v) { _getDrawState().wasShiftPressed = v; }
  },
  calibrationUnit: { 
    get() { return _getDrawState().calibrationUnit; },
    set(v) { _getDrawState().calibrationUnit = v; }
  },
  showPreciseCursor: { 
    get() { return _getDrawState().showPreciseCursor; },
    set(v) { _getDrawState().showPreciseCursor = v; }
  },
  
  // measureState aliases
  measurementLines: { 
    get() { return _getMeasureState().lines; },
    set(v) { _getMeasureState().lines = v; }
  },
  selectedMeasurement: { 
    get() { return _getMeasureState().selected; },
    set(v) { _getMeasureState().selected = v; }
  },
  isDraggingEndpoint: { 
    get() { return _getMeasureState().isDraggingEndpoint; },
    set(v) { _getMeasureState().isDraggingEndpoint = v; }
  },
  draggedEndpoint: { 
    get() { return _getMeasureState().draggedEndpoint; },
    set(v) { _getMeasureState().draggedEndpoint = v; }
  },
  hoveredEndpointInfo: { 
    get() { return _getMeasureState().hoveredEndpoint; },
    set(v) { _getMeasureState().hoveredEndpoint = v; }
  },
  isDraggingMeasurement: { 
    get() { return _getMeasureState().isDraggingMeasurement; },
    set(v) { _getMeasureState().isDraggingMeasurement = v; }
  },
  dragMeasurementOffset: { 
    get() { return _getMeasureState().dragOffset; },
    set(v) { _getMeasureState().dragOffset = v; }
  },
  isDraggingLabel: { 
    get() { return _getMeasureState().isDraggingLabel; },
    set(v) { _getMeasureState().isDraggingLabel = v; }
  },
  dragLabelMeasurement: { 
    get() { return _getMeasureState().dragLabelMeasurement; },
    set(v) { _getMeasureState().dragLabelMeasurement = v; }
  },
  measureGraduationType: { 
    get() { return _getMeasureState().graduationType; },
    set(v) { _getMeasureState().graduationType = v; }
  },
  measureGraduationSize: { 
    get() { return _getMeasureState().graduationSize; },
    set(v) { _getMeasureState().graduationSize = v; }
  },
  measureLabelSize: { 
    get() { return _getMeasureState().labelSize; },
    set(v) { _getMeasureState().labelSize = v; }
  },
  measurementsVisible: { 
    get() { return _getMeasureState().visible; },
    set(v) { _getMeasureState().visible = v; }
  },
  measureColor: { 
    get() { return _getMeasureState().color; },
    set(v) { _getMeasureState().color = v; }
  },
  showMeasureSizeLabels: { 
    get() { return _getMeasureState().showSizeLabels; },
    set(v) { _getMeasureState().showSizeLabels = v; }
  },
  
  // stabilizerState aliases
  stabilizerEnabled: { 
    get() { return _getStabilizerState().enabled; },
    set(v) { _getStabilizerState().enabled = v; }
  },
  stabilizerStrength: { 
    get() { return _getStabilizerState().strength; },
    set(v) { _getStabilizerState().strength = v; }
  },
  stabilizerBufferSize: { 
    get() { return _getStabilizerState().bufferSize; },
    set(v) { _getStabilizerState().bufferSize = v; }
  },
  stabilizerBuffer: { 
    get() { return _getStabilizerState().buffer; },
    set(v) { _getStabilizerState().buffer = v; }
  },
  
  // laserState aliases
  laserPoints: { 
    get() { return _getLaserState().points; },
    set(v) { _getLaserState().points = v; }
  },
  laserAnimationId: { 
    get() { return _getLaserState().animationId; },
    set(v) { _getLaserState().animationId = v; }
  },
  laserShiftPreview: { 
    get() { return _getLaserState().shiftPreview; },
    set(v) { _getLaserState().shiftPreview = v; }
  },
});

// Constantes
const LASER_FADE_DURATION = DRAWING_CONSTANTS.LASER_FADE_DURATION;
const LASER_COLOR = DRAWING_CONSTANTS.LASER_COLOR;
let measureProportionsConfig = measureState.proportionsConfig;
let isDrawingModeActive = drawState.isDrawingModeActive;
let drawingOverlay = drawingDOM.overlay;
// drawingCanvas, drawingCtx, etc. sont déclarés plus haut (ligne ~417)
let canvasResizeObserver = drawingDOM.resizeObserver;

// historyState aliases (getters/setters pour synchronisation)
Object.defineProperties(window, {
  drawingHistory: {
    get() { return drawingManager.history.drawing; },
    set(v) { drawingManager.history.drawing = v; }
  },
  drawingHistoryIndex: {
    get() { return drawingManager.history.index; },
    set(v) { drawingManager.history.index = v; }
  }
});

// ================================================================
// ZOOM MANAGER - Gestion centralisée du zoom/pan
// ================================================================
const ZoomManager = {
  // État interne
  _state: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    minScale: DRAWING_CONSTANTS.MIN_SCALE,
    maxScale: DRAWING_CONSTANTS.MAX_SCALE,
    zoomStep: 0.1,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartOffsetX: 0,
    panStartOffsetY: 0,
  },

  // Getters
  get scale() {
    return this._state.scale;
  },
  get offsetX() {
    return this._state.offsetX;
  },
  get offsetY() {
    return this._state.offsetY;
  },
  get isPanning() {
    return this._state.isPanning;
  },

  // Setters avec mise à jour des aliases globaux pour compatibilité
  _updateAliases() {
    canvasZoomScale = this._state.scale;
    canvasZoomOffsetX = this._state.offsetX;
    canvasZoomOffsetY = this._state.offsetY;
  },

  // Zoom relatif (pour molette ou Ctrl+/-)
  // screenX, screenY : position du curseur par rapport au centre de l'écran (en pixels)
  zoom(delta, screenX, screenY) {
    if (!this._state.isPanning) this._setTransition(true);
    const oldScale = this._state.scale;
    const newScale = Math.max(
      this._state.minScale,
      Math.min(this._state.maxScale, oldScale + delta),
    );

    if (newScale === oldScale) return false;

    // Le facteur de changement d'échelle
    const deltaScale = newScale / oldScale;

    // Compensation : le point sous le curseur doit rester fixe
    this._state.offsetX -= screenX * (deltaScale - 1);
    this._state.offsetY -= screenY * (deltaScale - 1);
    this._state.scale = newScale;

    // Limiter les offsets pour garder l'image visible
    this._clampOffsets();

    this._updateAliases();
    this._applyTransform();
    return true;
  },

  // Obtenir le canvas via DrawingManager (découplage des globales)
  _getCanvas() {
    return this._isZoomMode()
      ? drawingManager.getContext("zoom").canvas
      : drawingManager.getContext("normal").canvas;
  },

  // Calculer l'offset maximum pour un axe donné
  _getMaxOffset(axis) {
    const canvas = this._getCanvas();
    if (!canvas) return 0;
    const viewportSize = axis === "x" ? window.innerWidth : window.innerHeight;
    const imageSize =
      (axis === "x" ? canvas.width : canvas.height) * this._state.scale;
    return Math.max(
      0,
      (imageSize - viewportSize * DRAWING_CONSTANTS.ZOOM_VIEWPORT_CLAMP_FACTOR) / 2,
    );
  },

  // Limiter les offsets pour que l'image reste au moins partiellement visible
  _clampOffsets() {
    const maxOffsetX = this._getMaxOffset("x");
    const maxOffsetY = this._getMaxOffset("y");
    this._state.offsetX = Math.max(
      -maxOffsetX,
      Math.min(maxOffsetX, this._state.offsetX),
    );
    this._state.offsetY = Math.max(
      -maxOffsetY,
      Math.min(maxOffsetY, this._state.offsetY),
    );
  },

  // Zoom avec delta positif/négatif (pour raccourcis)
  zoomIn() {
    // Zoom vers le centre du conteneur
    const container = this._getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (this._isZoomMode()) {
      // En mode zoom, le centre du conteneur est à (0, 0) dans notre système de coordonnées
      // car on calcule les positions relatives au centre
      this.zoom(this._state.zoomStep, 0, 0);
    } else {
      this.zoom(this._state.zoomStep, rect.width / 2, rect.height / 2);
    }
  },

  zoomOut() {
    // Zoom vers le centre du conteneur
    const container = this._getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (this._isZoomMode()) {
      this.zoom(-this._state.zoomStep, 0, 0);
    } else {
      this.zoom(-this._state.zoomStep, rect.width / 2, rect.height / 2);
    }
  },

  // Définir le zoom directement
  setZoom(scale, offsetX, offsetY) {
    this._state.scale = Math.max(
      this._state.minScale,
      Math.min(this._state.maxScale, scale),
    );
    this._state.offsetX = offsetX;
    this._state.offsetY = offsetY;
    this._updateAliases();
    this._applyTransform();
  },

  // Réinitialiser
  reset() {
    this._setTransition(false);
    this._state.scale = 1;
    this._state.offsetX = 0;
    this._state.offsetY = 0;
    this._state.isPanning = false;
    this._updateAliases();
    this._applyTransform();
  },

  // Démarrer le pan
  startPan(startX, startY) {
    this._setTransition(false);
    this._state.isPanning = true;
    this._state.panStartX = startX;
    this._state.panStartY = startY;
    this._state.panStartOffsetX = this._state.offsetX;
    this._state.panStartOffsetY = this._state.offsetY;
  },

  // Mettre à jour le pan
  pan(currentX, currentY) {
    if (!this._state.isPanning) return;
    this._state.offsetX =
      this._state.panStartOffsetX + (currentX - this._state.panStartX);
    this._state.offsetY =
      this._state.panStartOffsetY + (currentY - this._state.panStartY);
    // Limiter les offsets pour garder l'image visible
    this._clampOffsets();
    this._updateAliases();
    this._applyTransform();
  },

  // Terminer le pan
  endPan() {
    this._state.isPanning = false;
    this._setTransition(true);
  },

  // Cache pour le conteneur principal (évite querySelector répétés)
  _mainContainer: null,

  // Éléments scrollbar
  _scrollbars: { h: null, v: null, trackH: null, trackV: null },
  _isDraggingScrollbar: false,
  _scrollbarDragStart: { x: 0, y: 0, ratioX: 0, ratioY: 0 },

  // Créer les barres de défilement
  _createScrollbars() {
    if (this._scrollbars.trackV || !CONFIG.enableZoomScrollbars) return; // Déjà créées ou désactivé

    // Calculer la position selon la sidebar
    const margin = DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MARGIN;
    const sidebarWidth = state.showSidebar ? DRAWING_CONSTANTS.ZOOM_SIDEBAR_WIDTH : 0;
    const vScrollbarRight = margin + sidebarWidth;

    // Barre VERTICALE - positionnée à droite de l'écran
    this._scrollbars.trackV = document.createElement("div");
    this._scrollbars.trackV.className = "zoom-scrollbar-v-track";
    this._scrollbars.trackV.style.cssText = `
      position: fixed;
      top: ${margin}px;
      right: ${vScrollbarRight}px;
      width: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_WIDTH}px;
      height: calc(100vh - ${margin * 2}px);
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_TRACK_OPACITY});
      border-radius: 3px;
      pointer-events: auto;
      cursor: pointer;
      z-index: 1000;
    `;

    this._scrollbars.v = document.createElement("div");
    this._scrollbars.v.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THUMB_OPACITY});
      border-radius: 3px;
      cursor: grab;
      transition: background 0.2s;
      min-height: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MIN_THUMB}px;
    `;
    this._scrollbars.trackV.appendChild(this._scrollbars.v);
    document.body.appendChild(this._scrollbars.trackV);

    // Barre HORIZONTALE - collée au bord inférieur
    const hScrollbarWidth = window.innerWidth - sidebarWidth - margin * 3;

    this._scrollbars.trackH = document.createElement("div");
    this._scrollbars.trackH.className = "zoom-scrollbar-h-track";
    this._scrollbars.trackH.style.cssText = `
      position: fixed;
      bottom: ${margin}px;
      left: ${margin}px;
      width: ${hScrollbarWidth}px;
      height: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_WIDTH}px;
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_TRACK_OPACITY});
      border-radius: 3px;
      pointer-events: auto;
      cursor: pointer;
      z-index: 1000;
    `;

    // Thumb horizontal
    this._scrollbars.h = document.createElement("div");
    this._scrollbars.h.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: rgba(255,255,255,${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THUMB_OPACITY});
      border-radius: 3px;
      cursor: grab;
      transition: background 0.2s;
      min-width: ${DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MIN_THUMB}px;
    `;
    this._scrollbars.trackH.appendChild(this._scrollbars.h);
    document.body.appendChild(this._scrollbars.trackH);

    // Événements
    this._setupScrollbarEvents();
  },

  // Supprimer les barres de défilement
  _removeScrollbars() {
    if (this._scrollbars.trackV) {
      this._scrollbars.trackV.remove();
      this._scrollbars.trackV = null;
      this._scrollbars.v = null;
    }
    if (this._scrollbars.trackH) {
      this._scrollbars.trackH.remove();
      this._scrollbars.trackH = null;
      this._scrollbars.h = null;
    }
  },

  // Configurer les événements des scrollbars
  _setupScrollbarEvents() {
    const handleDragStart = (e, isHorizontal) => {
      e.preventDefault();
      e.stopPropagation();
      this._setTransition(false);
      this._isDraggingScrollbar = isHorizontal ? "h" : "v";
      // Stocker la position initiale du thumb (en ratio 0-1)
      this._scrollbarDragStart.ratioX = this._getScrollRatioX();
      this._scrollbarDragStart.ratioY = this._getScrollRatioY();
      // Stocker la position initiale de la souris
      this._scrollbarDragStart.x = e.clientX;
      this._scrollbarDragStart.y = e.clientY;
      e.target.style.cursor = "grabbing";
    };

    this._scrollbars.h.addEventListener("mousedown", (e) =>
      handleDragStart(e, true),
    );
    this._scrollbars.v.addEventListener("mousedown", (e) =>
      handleDragStart(e, false),
    );

    // Click sur les tracks (page up/down)
    this._scrollbars.trackH.addEventListener("mousedown", (e) => {
      if (e.target === this._scrollbars.h) return;
      e.preventDefault();
      const rect = this._scrollbars.trackH.getBoundingClientRect();
      const clickRatio = (e.clientX - rect.left) / rect.width;
      const currentRatio = this._getScrollRatioX() + 0.5; // convertir de -0.5..0.5 à 0..1
      // Déplacer d'une "page" vers le click
      const direction = clickRatio > currentRatio ? 1 : -1;
      const pageSize = DRAWING_CONSTANTS.SCROLL_PAGE_SIZE; // 20% par click
      this._scrollToRatio(
        Math.max(0, Math.min(1, currentRatio + direction * pageSize)),
        null,
      );
    });

    this._scrollbars.trackV.addEventListener("mousedown", (e) => {
      if (e.target === this._scrollbars.v) return;
      e.preventDefault();
      const rect = this._scrollbars.trackV.getBoundingClientRect();
      const clickRatio = (e.clientY - rect.top) / rect.height;
      const currentRatio = this._getScrollRatioY() + 0.5; // convertir de -0.5..0.5 à 0..1
      const direction = clickRatio > currentRatio ? 1 : -1;
      const pageSize = DRAWING_CONSTANTS.SCROLL_PAGE_SIZE;
      this._scrollToRatio(
        null,
        Math.max(0, Math.min(1, currentRatio + direction * pageSize)),
      );
    });

    // Drag global - le thumb suit la souris (handlers stockés pour cleanup)
    globalEventHandlers.scrollbarMouseMove = (e) => {
      if (!this._isDraggingScrollbar) return;

      if (this._isDraggingScrollbar === "h") {
        const trackRect = this._scrollbars.trackH.getBoundingClientRect();
        const deltaPixels = e.clientX - this._scrollbarDragStart.x;
        const deltaRatio = deltaPixels / trackRect.width;
        const newRatio = this._scrollbarDragStart.ratioX + deltaRatio;
        this._scrollToRatio(newRatio + 0.5, null);
      } else {
        const trackRect = this._scrollbars.trackV.getBoundingClientRect();
        const deltaPixels = e.clientY - this._scrollbarDragStart.y;
        const deltaRatio = deltaPixels / trackRect.height;
        const newRatio = this._scrollbarDragStart.ratioY + deltaRatio;
        this._scrollToRatio(null, newRatio + 0.5);
      }
    };
    document.addEventListener("mousemove", globalEventHandlers.scrollbarMouseMove);

    globalEventHandlers.scrollbarMouseUp = () => {
      if (this._isDraggingScrollbar) {
        if (this._scrollbars.h) this._scrollbars.h.style.cursor = "grab";
        if (this._scrollbars.v) this._scrollbars.v.style.cursor = "grab";
        this._isDraggingScrollbar = false;
        this._setTransition(true);
      }
    };
    document.addEventListener("mouseup", globalEventHandlers.scrollbarMouseUp);
  },

  // Obtenir le ratio de scroll actuel (-0.5 à 0.5, 0 = centré)
  _getScrollRatioX() {
    const maxOffsetX = this._getMaxOffset("x");
    if (maxOffsetX === 0) return 0;
    return this._state.offsetX / (2 * maxOffsetX); // -0.5 à 0.5
  },

  _getScrollRatioY() {
    const maxOffsetY = this._getMaxOffset("y");
    if (maxOffsetY === 0) return 0;
    return this._state.offsetY / (2 * maxOffsetY); // -0.5 à 0.5
  },

  // Scroll à un ratio donné (0-1)
  // ratio 0 = début (gauche/haut), ratio 1 = fin (droite/bas)
  _scrollToRatio(ratioX, ratioY) {
    const maxOffsetX = this._getMaxOffset("x");
    const maxOffsetY = this._getMaxOffset("y");

    // Inversé : quand on va vers la droite (ratio augmente),
    // l'image doit aller vers la gauche (offset négatif) pour voir la droite
    if (ratioX !== null) {
      this._state.offsetX = -(ratioX - 0.5) * 2 * maxOffsetX;
    }
    if (ratioY !== null) {
      this._state.offsetY = -(ratioY - 0.5) * 2 * maxOffsetY;
    }

    this._clampOffsets();
    this._updateAliases();
    this._applyTransform();
  },

  // Mettre à jour la position selon la sidebar
  _updateScrollbarPosition() {
    const margin = DRAWING_CONSTANTS.ZOOM_SCROLLBAR_MARGIN;
    const sidebarWidth = state.showSidebar ? DRAWING_CONSTANTS.ZOOM_SIDEBAR_WIDTH : 0;

    if (this._scrollbars.trackV) {
      this._scrollbars.trackV.style.right = `${margin + sidebarWidth}px`;
    }

    if (this._scrollbars.trackH) {
      const hScrollbarWidth = window.innerWidth - sidebarWidth - margin * 3;
      this._scrollbars.trackH.style.width = `${hScrollbarWidth}px`;
    }
  },

  // Mettre à jour la position et taille des thumbs
  _updateScrollbars() {
    if (!this._scrollbars.h) return;

    const canvas = this._getCanvas();
    if (!canvas) return;

    const scale = this._state.scale;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const imageWidth = canvas.width * scale;
    const imageHeight = canvas.height * scale;

    // Taille relative du thumb (viewport / image)
    const thumbWidth = Math.min(1, viewportWidth / imageWidth);
    const thumbHeight = Math.min(1, viewportHeight / imageHeight);

    // Position (0-1) en utilisant les mêmes méthodes que le drag
    const ratioX = this._getScrollRatioX() + 0.5; // convertir -0.5..0.5 à 0..1
    const ratioY = this._getScrollRatioY() + 0.5;

    // Cacher si pas de scroll nécessaire
    const needsScroll = scale > DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THRESHOLD;
    this._scrollbars.trackH.style.opacity = needsScroll ? "1" : "0";
    this._scrollbars.trackV.style.opacity = needsScroll ? "1" : "0";

    if (needsScroll) {
      // Appliquer taille et position
      this._scrollbars.h.style.width = `${thumbWidth * 100}%`;
      this._scrollbars.h.style.left = `${ratioX * (100 - thumbWidth * 100)}%`;
      this._scrollbars.v.style.height = `${thumbHeight * 100}%`;
      this._scrollbars.v.style.top = `${ratioY * (100 - thumbHeight * 100)}%`;
    }
  },

  // Obtenir le conteneur à transformer
  _getContainer() {
    if (zoomDrawingOverlay) return zoomDrawingOverlay;
    if (!this._mainContainer) {
      this._mainContainer = document.querySelector(".image-wrapper");
    }
    return this._mainContainer;
  },

  // Vérifier si on est en mode zoom
  _isZoomMode() {
    return !!zoomDrawingOverlay;
  },

  // Réinitialiser le cache du conteneur (appelé quand on change de mode)
  _resetContainerCache() {
    this._mainContainer = null;
  },

  // Gestion de l'animation de zoom (CSS transition)
  _setTransition(enabled) {
    if (!CONFIG.zoomAnimated) return;
    const container = this._getContainer();
    if (!container) return;
    const val = enabled
      ? `transform ${DRAWING_CONSTANTS.ZOOM_ANIMATION_DURATION_MS}ms ease-out`
      : "none";
    container.style.transition = val;
    if (this._isZoomMode() && zoomTargetImage) {
      zoomTargetImage.style.transition = val;
    }
  },

  // Appliquer la transformation CSS
  _applyTransform() {
    const { scale, offsetX, offsetY } = this._state;
    const container = this._getContainer();
    if (!container) return;

    // Construire la transformation selon le mode
    let transform;
    if (this._isZoomMode()) {
      // Mode zoom : le conteneur a déjà un translate(-50%, -50%) de base pour le centrage
      // On ajoute notre offset et scale par-dessus
      transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
    } else {
      // Mode principal : simple translate + scale
      transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    container.style.transform = transform;
    container.style.transformOrigin = "center center";

    // Gestion de la classe zoom-active (uniquement pertinent pour le mode principal)
    if (!this._isZoomMode() && scale !== 1) {
      container.classList.add("zoom-active");
    } else if (!this._isZoomMode()) {
      container.classList.remove("zoom-active");
    }

    // Mode zoom : synchroniser aussi l'image cible
    if (this._isZoomMode() && zoomTargetImage) {
      zoomTargetImage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      zoomTargetImage.style.transformOrigin = "center center";
    }

    // Gérer les scrollbars
    if (scale > DRAWING_CONSTANTS.ZOOM_SCROLLBAR_THRESHOLD) {
      this._createScrollbars();
      this._updateScrollbarPosition();
      this._updateScrollbars();
    } else {
      this._removeScrollbars();
    }

    // Mettre à jour les indicateurs
    updateZoomIndicator();
  },
};

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

let spacePressStartPos = spaceMovement.pressStartPos;
let shapeEndAtSpacePress = spaceMovement.shapeEndAtPress;
let shapeOffset = spaceMovement.shapeOffset;
let lastMousePosition = drawState.lastMousePosition;
let wasOutsideCanvas = drawState.wasOutsideCanvas;
let compassCenter = compassState.center;
let compassWaitingSecondClick = compassState.isWaitingForSecondClick;
let compassDragging = false; // Mode drag du compas (premier clic maintenu)
let compassDragMoved = false; // True si la souris a bougé pendant le drag

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

// ================================================================
// HELPERS PARTAGÉS DRAWING/ZOOM MODE (Phase 6.4)
// ================================================================

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
  measurementLines = JSON.parse(JSON.stringify(savedState.measurementLines));
  calibrationUnit = savedState.calibrationUnit;
  drawingHistory = [...savedState.history];
  drawingHistoryIndex = savedState.historyIndex;

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
      debugLog("saveDrawingState: rien à sauvegarder");
      return false;
    }

    cache.set(imageSrc, {
      // Sauvegarder en base64 pour pouvoir redimensionner à la restauration
      canvasDataURL: hasDrawingContent ? mainCanvas.toDataURL() : null,
      // Les mesures sont stockées en coordonnées et redessinées dynamiquement
      measurementLines: JSON.parse(JSON.stringify(measurementLines)),
      calibrationUnit: calibrationUnit,
      history: [...drawingHistory],
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
  keysState.space = false;
}

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

  debugLog("Drawing mode: désactivé");
}

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
        // Sauvegarder l'état du canvas
        const savedState = drawingCanvas ? drawingCanvas.toDataURL() : null;
        const savedMeasures = drawingMeasures
          ? drawingMeasures.toDataURL()
          : null;

        // Mettre à jour les dimensions
        setupDrawingCanvasDimensions();

        // Restaurer l'état
        if (savedState && drawingCtx) {
          const img = new Image();
          img.onload = () => {
            drawingCtx.drawImage(
              img,
              0,
              0,
              drawingCanvas.width,
              drawingCanvas.height,
            );
          };
          img.src = savedState;
        }
        if (savedMeasures && drawingMeasuresCtx) {
          const img = new Image();
          img.onload = () => {
            drawingMeasuresCtx.drawImage(
              img,
              0,
              0,
              drawingMeasures.width,
              drawingMeasures.height,
            );
          };
          img.src = savedMeasures;
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
      const savedState = drawingCanvas ? drawingCanvas.toDataURL() : null;
      setupDrawingCanvasDimensions();
      if (savedState && drawingCtx) {
        const img = new Image();
        img.onload = () => {
          drawingCtx.drawImage(
            img,
            0,
            0,
            drawingCanvas.width,
            drawingCanvas.height,
          );
        };
        img.src = savedState;
      }
    }
  }, DRAWING_CONSTANTS.RESIZE_DEBOUNCE_MS);
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

function getDeleteCursor() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="rgba(239, 68, 68, 0.9)" stroke="white" stroke-width="1.5"/>
      <line x1="8" y1="8" x2="16" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="16" y1="8" x2="8" y2="16" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;
  const encoded = encodeURIComponent(svg.trim());
  return `url("data:image/svg+xml,${encoded}") 12 12, pointer`;
}

/**
 * Retourne un curseur personnalisé avec icône de cycle (pour changer le type de graduation)
 */
function getCycleCursor() {
  // Curseur SVG avec flèches de cycle (cyan/primary)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960">
      <circle cx="480" cy="-480" r="420" fill="rgba(94, 234, 212, 0.9)" stroke="white" stroke-width="40"/>
      <path d="m482-200 114-113-114-113-42 42 43 43q-28 1-54.5-9T381-381q-20-20-30.5-46T340-479q0-17 4.5-34t12.5-33l-44-44q-17 25-25 53t-8 57q0 38 15 75t44 66q29 29 65 43.5t74 15.5l-38 38 42 42Zm165-170q17-25 25-53t8-57q0-38-14.5-75.5T622-622q-29-29-65.5-43T482-679l38-39-42-42-114 113 114 113 42-42-44-44q27 0 55 10.5t48 30.5q20 20 30.5 46t10.5 52q0 17-4.5 34T603-414l44 44Z" fill="white"/>
    </svg>
  `;
  const encoded = encodeURIComponent(svg.trim());
  return `url("data:image/svg+xml,${encoded}") 12 12, pointer`;
}

/**
 * Retourne un curseur personnalisé avec icône de duplication (pour Alt+glisser)
 */
function getDuplicateCursor() {
  // Curseur SVG avec icône + (vert)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="rgba(34, 197, 94, 0.9)" stroke="white" stroke-width="1.5"/>
      <line x1="12" y1="7" x2="12" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="7" y1="12" x2="17" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;
  const encoded = encodeURIComponent(svg.trim());
  return `url("data:image/svg+xml,${encoded}") 12 12, copy`;
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

/**
 * Convertit les coordonnées de la souris en coordonnées canvas
 */
function getDrawingCoordinates(e, context = null) {
  const ctx = context ? drawingManager.getContext(context) : drawingManager.current;
  if (!ctx.preview || !ctx.canvas) return { x: 0, y: 0 };

  const rect = ctx.preview.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  const relY = e.clientY - rect.top;
  const scaleX = ctx.canvas.width / rect.width;
  const scaleY = ctx.canvas.height / rect.height;

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

function handleCanvasZoom(e) {
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
  ZoomManager.pan(e.clientX, e.clientY);
}

function handleCanvasPanEnd() {
  if (!ZoomManager.isPanning) return;
  ZoomManager.endPan();
  const preview = zoomDrawingPreview || drawingPreview;
  if (keysState.space && preview) {
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
  ZoomManager.startPan(e.clientX, e.clientY);
  const preview = zoomDrawingPreview || drawingPreview;
  if (preview) preview.style.cursor = "grabbing";
}

function handleGlobalMouseUp(e) {
  // Si on était en train de dessiner, arrêter le dessin
  if (isDrawing && e.button === 0) {
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
      lastDrawnPoint = { ...edge };
    }
  }
  // Cacher le curseur mais ne pas arrêter le dessin
  hideDrawingCursor();
}

// FACTORY TOOLBAR

const TOOL_DEFINITIONS = {
  pencil: { icon: "PENCIL", tooltip: () => i18next.t("draw.tools.pencil", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_PENCIL.toUpperCase() }), hasStabilizerMenu: true },
  eraser: { icon: "ERASER", tooltip: () => i18next.t("draw.tools.eraser", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_ERASER.toUpperCase() }) },
  laser: { icon: "LASER_POINTER", tooltip: () => i18next.t("draw.tools.laser", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_LASER }) },
  line: { icon: "LINE", tooltip: () => i18next.t("draw.tools.line", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_LINE.toUpperCase() }) },
  arrow: { icon: "ARROW", tooltip: () => i18next.t("draw.tools.arrow", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_ARROW.toUpperCase() }) },
  rectangle: { icon: "RECTANGLE", tooltip: () => i18next.t("draw.tools.rectangle", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_RECTANGLE.toUpperCase() }) },
  circle: { icon: "CIRCLE", tooltip: () => i18next.t("draw.tools.circle", { hotkey: CONFIG.HOTKEYS.DRAWING_TOOL_CIRCLE.toUpperCase() }) },
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
  indicators.forEach((indicator) => {
    indicator.textContent = Math.round(ZoomManager.scale * 100) + "%";
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
      `Exporter [Ctrl+${hk.DRAWING_EXPORT.toUpperCase()}]`,
    );
  }

  const lightboxBtn = document.getElementById("drawing-lightbox-btn");
  if (lightboxBtn) {
    updateDrawingLightboxIcon();
    if (hk.DRAWING_LIGHTBOX) {
      lightboxBtn.setAttribute(
        "data-tooltip",
        `Table lumineuse [${hk.DRAWING_LIGHTBOX}]`,
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
  if (drawingPreview) {
    drawingPreview.onmousedown = (e) => {
      // Clic molette = pan
      if (e.button === 1) {
        handleCanvasPanStart(e);
        return;
      }
      // Space + clic gauche = pan (seulement si pas en train de dessiner)
      if (e.button === 0 && keysState.space && !isDrawing) {
        handleSpacePanStart(e);
        return;
      }
      handleDrawingMouseDown(e);
    };
    drawingPreview.onmousemove = (e) => {
      if (ZoomManager.isPanning) {
        handleCanvasPanMove(e);
        return;
      }
      handleDrawingMouseMove(e);
    };
    drawingPreview.onmouseup = (e) => {
      if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
        handleCanvasPanEnd();
        return;
      }
      handleDrawingMouseUp(e);
    };
    drawingPreview.onmouseleave = (e) => {
      handleDrawingMouseLeave(e, drawingPreview, drawingCanvas, drawingCtx);
    };
    drawingPreview.onmouseenter = (e) => {
      // Réinitialiser l'état quand on rentre dans le canvas pendant le dessin
      resetDrawingStateOnEnter();
    };
    // Zoom avec la molette (si activé dans la config)
    if (CONFIG.enableZoomInDrawingMode) {
      drawingPreview.addEventListener('wheel', handleCanvasZoom);
    }
    drawingPreview.oncontextmenu = (e) => {
      e.preventDefault();
      const coords = getDrawingCoordinates(e);
      const hitLine = findMeasurementLineAt(coords, 20);
      if (hitLine) {
        // Menu spécifique pour les mesures
        if (hitLine.type === "compass") {
          showCompassIndividualConfig(hitLine, e.clientX, e.clientY);
        } else if (hitLine.type === "calibrate") {
          showCalibrateIndividualConfig(hitLine, e.clientX, e.clientY);
        } else {
          showMeasureIndividualConfig(hitLine, e.clientX, e.clientY);
        }
      } else {
        // Menu contextuel général du canvas
        showCanvasContextMenu(e.clientX, e.clientY, "drawing");
      }
    };
  }

  // Événements clavier
  document.addEventListener("keydown", handleDrawingModeKeydown);
  document.addEventListener("keyup", handleDrawingModeKeyup);

  // Écouteur global pour mouseup (pour arrêter le dessin même hors du canvas)
  document.addEventListener("mouseup", handleGlobalMouseUp);

  // Réinitialiser l'état des touches
  keysState.shift = false;
  keysState.alt = false;
  keysState.space = false;

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
  keysState.space = false;

  if (drawingPreview) {
    drawingPreview.onmousedown = null;
    drawingPreview.onmousemove = null;
    drawingPreview.onmouseup = null;
    drawingPreview.onmouseleave = null;
    drawingPreview.onmouseenter = null;
    drawingPreview.removeEventListener('wheel', handleCanvasZoom);
    drawingPreview.ontouchstart = null;
    drawingPreview.ontouchmove = null;
    drawingPreview.ontouchend = null;
  }
  // Retirer l'écouteur global mouseup
  document.removeEventListener("mouseup", handleGlobalMouseUp);
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
  if (e.key === "Shift") {
    keysState.shift = true;
    return false;
  }
  if (e.key === "Alt") {
    keysState.alt = true;
    updateAltDuplicateCursor();
    return false;
  }
  if (e.key === " ") {
    keysState.space = true;
    e.preventDefault();
    if (!isDrawing) {
      // Mode pan avec Space : curseur grab
      const preview = zoomDrawingPreview || drawingPreview;
      if (preview) preview.style.cursor = "grab";
    }
    return false;
  }
  return false;
}

/**
 * Gestion centralisée des touches modificateurs (keyup)
 */
function handleModifierKeyUp(e) {
  if (e.key === "Shift") keysState.shift = false;
  if (e.key === "Alt") {
    keysState.alt = false;
    if (drawingPreview) drawingPreview.style.cursor = "";
  }
  if (e.key === " ") {
    keysState.space = false;
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

  // Escape pour fermer ou annuler l'opération en cours
  if (e.key === "Escape") {
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

  // Ctrl+S pour export
  if ((e.ctrlKey || e.metaKey) && key === "s") {
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

  // Shift+B pour laser
  if (e.shiftKey && key === "b") {
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

  // Shift+U pour rapporteur
  if (e.shiftKey && key === "u") {
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
    }
    return;
  }

  // Delete/Backspace pour effacer
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    clearAllDrawingCanvases();
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

/**
 * Crée un row avec label et color picker inline
 * @param {string} label - Le label à afficher
 * @param {string} id - L'id de l'input
 * @param {string} value - La valeur hexadécimale de la couleur
 * @param {Function} onChange - Callback appelé avec la nouvelle couleur
 * @returns {HTMLElement} L'élément row
 */
function createColorRow(label, id, value, onChange) {
  const row = document.createElement("div");
  row.className = "config-row-inline";
  row.innerHTML = `
    <span class="config-label">${label}</span>
    <input type="color" class="color-picker-mini" id="${id}" value="${value}">
  `;
  const input = row.querySelector("input");
  input.addEventListener("input", (e) => onChange(e.target.value));
  return row;
}

/**
 * Crée un row avec label et toggle checkbox
 * @param {string} label - Le label à afficher
 * @param {string} id - L'id de l'input
 * @param {boolean} checked - État initial
 * @param {Function} onChange - Callback appelé avec le nouvel état
 * @param {string} [marginTop] - Marge supérieure optionnelle (ex: "10px")
 * @returns {HTMLElement} L'élément row
 */
function createToggleRow(label, id, checked, onChange, marginTop = null) {
  const row = document.createElement("div");
  row.className = "config-row-inline";
  if (marginTop) row.style.marginTop = marginTop;
  row.innerHTML = `
    <span class="config-label">${label}</span>
    <label class="proportion-checkbox">
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
      <span class="proportion-slider"></span>
    </label>
  `;
  const input = row.querySelector("input");
  input.addEventListener("change", (e) => onChange(e.target.checked));
  return row;
}

/**
 * Crée une section avec label et slider
 * @param {string} label - Le label de la section
 * @param {string} id - L'id du slider
 * @param {Object} config - Configuration du slider {min, max, step, value, unit}
 * @param {Function} onChange - Callback appelé avec la nouvelle valeur
 * @returns {HTMLElement} L'élément section
 */
function createSliderSection(label, id, config, onChange) {
  const { min, max, step, value, unit } = config;
  const section = document.createElement("div");
  section.className = "config-section";
  section.innerHTML = `
    <div class="config-section-label">${label}</div>
    <div class="graduation-size-control">
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="graduation-size-value" id="${id}-display">${value.toFixed(1)}${unit}</span>
    </div>
  `;
  const slider = section.querySelector("input");
  const display = section.querySelector(`#${id}-display`);
  slider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    display.textContent = val.toFixed(1) + unit;
    onChange(val);
  });
  return section;
}

/**
 * Crée les boutons de type graduation (none/units/proportions)
 * @param {string} currentType - Le type actuel
 * @param {Function} onChange - Callback appelé avec le nouveau type
 * @returns {HTMLElement} L'élément container des boutons
 */
function createGraduationTypeButtons(currentType, onChange) {
  const container = document.createElement("div");
  container.className = "graduation-type-buttons";

  const types = [
    { type: "none", icon: "—", label: i18next.t("draw.config.none") },
    { type: "units", icon: ICONS.CALIBRATE, label: i18next.t("drawing.units") },
    { type: "proportions", icon: "½", label: i18next.t("draw.config.proportions") },
  ];

  types.forEach(({ type, icon, label }) => {
    const btn = document.createElement("button");
    btn.className = `graduation-type-btn ${currentType === type ? "active" : ""}`;
    btn.dataset.type = type;
    btn.innerHTML = `<span class="btn-icon">${icon}</span><span>${label}</span>`;
    btn.addEventListener("click", () => {
      container
        .querySelectorAll(".graduation-type-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(type);
    });
    container.appendChild(btn);
  });

  return container;
}

/**
 * Crée les boutons de subdivisions (0/2/3/4)
 * @param {number} currentSubdiv - La subdivision actuelle
 * @param {Function} onChange - Callback appelé avec la nouvelle subdivision
 * @returns {HTMLElement} L'élément container des boutons
 */
function createSubdivisionButtons(currentSubdiv, onChange) {
  const container = document.createElement("div");
  container.className = "graduation-type-buttons";

  const subdivs = [
    { value: 0, icon: "—", label: i18next.t("draw.config.noSubdivision") },
    { value: 2, icon: "½", label: i18next.t("draw.config.half") },
    { value: 3, icon: "⅓", label: i18next.t("draw.config.thirds") },
    { value: 4, icon: "¼", label: i18next.t("draw.config.quarters") },
  ];

  subdivs.forEach(({ value, icon, label }) => {
    const btn = document.createElement("button");
    btn.className = `graduation-type-btn ${currentSubdiv === value ? "active" : ""}`;
    btn.dataset.subdiv = value;
    btn.innerHTML = `<span class="btn-icon">${icon}</span><span>${label}</span>`;
    btn.addEventListener("click", () => {
      container
        .querySelectorAll(".graduation-type-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(value);
    });
    container.appendChild(btn);
  });

  return container;
}

/**
 * Crée une option de proportion (checkbox avec couleur)
 * @param {string} colorId - L'id du color picker
 * @param {string} checkboxId - L'id de la checkbox
 * @param {string} label - Le label (ex: "Milieu (½)")
 * @param {string} color - La couleur actuelle
 * @param {boolean} checked - État de la checkbox
 * @param {Function} onColorChange - Callback pour le changement de couleur
 * @param {Function} onCheckChange - Callback pour le changement de checkbox
 * @returns {HTMLElement} L'élément option
 */
function createProportionOption(
  colorId,
  checkboxId,
  label,
  color,
  checked,
  onColorChange,
  onCheckChange,
) {
  const option = document.createElement("div");
  option.className = "proportion-option";
  option.innerHTML = `
    <span class="proportion-label">
      <input type="color" class="color-picker-mini" id="${colorId}" value="${color}">
      ${label}
    </span>
    <label class="proportion-checkbox">
      <input type="checkbox" id="${checkboxId}" ${checked ? "checked" : ""}>
      <span class="proportion-slider"></span>
    </label>
  `;

  option
    .querySelector(`#${colorId}`)
    .addEventListener("input", (e) => onColorChange(e.target.value));
  option
    .querySelector(`#${checkboxId}`)
    .addEventListener("change", (e) => onCheckChange(e.target.checked));

  return option;
}

/**
 * Crée la section des options de proportions complète
 * @param {Object} config - La configuration des proportions
 * @param {Function} onUpdate - Callback appelé avec la clé et la nouvelle valeur
 * @param {boolean} [disabled=false] - Si la section est désactivée
 * @returns {HTMLElement} L'élément section
 */
function createProportionsSection(config, onUpdate, disabled = false) {
  const section = document.createElement("div");
  section.className = `proportions-options ${disabled ? "disabled" : ""}`;

  // Option "Afficher les labels"
  const labelsRow = createToggleRow(
    i18next.t("draw.config.showLabels"),
    "prop-labels",
    config.showLabels,
    (checked) => onUpdate("showLabels", checked),
  );
  section.appendChild(labelsRow);

  // Divider
  const divider = document.createElement("div");
  divider.className = "config-divider";
  section.appendChild(divider);

  // Options avec couleurs
  const options = [
    {
      colorKey: "colorCenter",
      checkKey: "showCenter",
      label: i18next.t("draw.config.centerHalf"),
      colorId: "prop-color-center",
      checkId: "prop-center",
    },
    {
      colorKey: "colorThirds",
      checkKey: "showThirds",
      label: i18next.t("draw.config.thirdsRatio"),
      colorId: "prop-color-thirds",
      checkId: "prop-thirds",
    },
    {
      colorKey: "colorQuarters",
      checkKey: "showQuarters",
      label: i18next.t("draw.config.quartersRatio"),
      colorId: "prop-color-quarters",
      checkId: "prop-quarters",
    },
  ];

  options.forEach(({ colorKey, checkKey, label, colorId, checkId }) => {
    const opt = createProportionOption(
      colorId,
      checkId,
      label,
      config[colorKey],
      config[checkKey],
      (color) => onUpdate(colorKey, color),
      (checked) => onUpdate(checkKey, checked),
    );
    section.appendChild(opt);
  });

  return section;
}

/**
 * Crée un header de modal avec titre et bouton fermer
 * @param {string} title - Le titre du modal
 * @param {Function} onClose - Callback de fermeture
 * @returns {HTMLElement} L'élément header
 */
function createModalHeader(title, onClose) {
  const header = document.createElement("div");
  header.id = "measure-config-header";
  header.innerHTML = `
    <h3>${title}</h3>
    <button class="modal-close-btn">&times;</button>
  `;
  header.querySelector("button").addEventListener("click", onClose);
  return header;
}

/**
 * Configure la fermeture d'un popup au clic extérieur
 * @param {HTMLElement} popup - L'élément popup
 * @param {number} [delay=100] - Délai avant activation (évite fermeture immédiate)
 */
function setupPopupCloseOnClickOutside(popup, delay = 100) {
  const closeHandler = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), delay);
}

// ================================================================
// HELPERS MODALS DE CONFIGURATION
// ================================================================

/**
 * Crée le scaffold d'un popup de configuration (popup + header + body)
 * @param {string} id - L'ID du popup
 * @param {string} title - Le titre affiché dans le header
 * @returns {{ popup: HTMLElement, body: HTMLElement } | null} null si le popup existait déjà (toggle off)
 */
function createConfigPopup(id, title) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
    return null;
  }

  const popup = document.createElement("div");
  popup.id = id;

  const header = createModalHeader(title, () => popup.remove());
  popup.appendChild(header);

  const body = document.createElement("div");
  body.className = "config-body";

  return { popup, body };
}

/**
 * Finalise un popup de configuration (append body, position, close handler, drag)
 * @param {HTMLElement} popup
 * @param {HTMLElement} body
 * @param {Object} [options] - Options optionnelles
 * @param {number} [options.x] - Position X (si absent : centré via CSS existant)
 * @param {number} [options.y] - Position Y
 * @param {number} [options.width=320] - Largeur estimée
 * @param {number} [options.height=500] - Hauteur estimée
 */
function finalizeConfigPopup(popup, body, options = {}) {
  popup.appendChild(body);
  document.body.appendChild(popup);

  if (options.x !== undefined && options.y !== undefined) {
    positionPopupInScreen(popup, options.x, options.y, options.width ?? 320, options.height ?? 500);
  }

  setupPopupCloseOnClickOutside(popup);
  makeMeasureConfigDraggable(popup);
}

/**
 * Crée la section d'aide commune aux modals de mesure
 * @returns {HTMLElement}
 */
function createHelpSection() {
  const section = document.createElement("div");
  section.className = "config-help-section";
  section.innerHTML = `
    <div class="config-help-item"><kbd>Alt</kbd> + ${i18next.t("draw.help.duplicateMeasure")}</div>
    <div class="config-help-item"><kbd>Shift</kbd>+<kbd>Alt</kbd> + ${i18next.t("draw.help.deleteMeasure")}</div>
    <div class="config-help-item"><kbd>Ctrl</kbd> + ${i18next.t("draw.help.changeGraduation")}</div>
  `;
  return section;
}

// ================================================================
// MODALS DE CONFIGURATION
// ================================================================

/**
 * Affiche le modal de configuration de l'outil mesure
 */
function showMeasureConfig() {
  const result = createConfigPopup("measure-config-popup", i18next.t("draw.modals.measureSettings"));
  if (!result) return;
  const { popup, body } = result;

  // Section 1 : Visibilité et couleur
  const section1 = document.createElement("div");
  section1.className = "config-section";

  section1.appendChild(
    createColorRow(
      i18next.t("draw.config.measureColor"),
      "measure-color",
      measureColor,
      (val) => {
        measureColor = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showMeasurements"),
      "measurements-visible",
      measurementsVisible,
      (checked) => {
        measurementsVisible = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showValues"),
      "show-size-labels",
      showMeasureSizeLabels,
      (checked) => {
        showMeasureSizeLabels = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  body.appendChild(section1);

  // Section 2 : Type de graduation
  const section2 = document.createElement("div");
  section2.className = "config-section";
  const section2Label = document.createElement("div");
  section2Label.className = "config-section-label";
  section2Label.textContent = i18next.t("draw.config.graduationType");
  section2.appendChild(section2Label);

  // Référence à la section proportions pour toggle disabled
  let proportionsSection = null;

  const gradButtons = createGraduationTypeButtons(
    measureGraduationType,
    (type) => {
      measureGraduationType = type;
      if (proportionsSection) {
        proportionsSection.classList.toggle("disabled", type !== "proportions");
      }
      redrawDrawingMeasurements();
    },
  );
  section2.appendChild(gradButtons);
  body.appendChild(section2);

  // Section 5 : Options de proportions
  proportionsSection = createProportionsSection(
    measureProportionsConfig,
    (key, val) => {
      measureProportionsConfig[key] = val;
      redrawDrawingMeasurements();
    },
    measureGraduationType !== "proportions",
  );
  body.appendChild(proportionsSection);

  // Container compact pour les sliders de taille
  const slidersContainer2 = document.createElement("div");
  slidersContainer2.className = "config-sliders-compact";

  // Taille des graduations
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.graduationSize"),
      "graduation-size",
      {
        min: 0.5,
        max: 2.5,
        step: 0.1,
        value: measureGraduationSize,
        unit: "x",
      },
      (val) => {
        measureGraduationSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille des valeurs
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.valueSize"),
      "label-size",
      { min: 0.5, max: 3.0, step: 0.1, value: measureLabelSize, unit: "x" },
      (val) => {
        measureLabelSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Épaisseur du trait
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.lineWidth"),
      "measure-line-width",
      { min: 1, max: 10, step: 1, value: measureState.lineWidth, unit: "px" },
      (val) => {
        measureState.lineWidth = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  body.appendChild(slidersContainer2);

  // Section 6 : Instructions
  body.appendChild(createHelpSection());

  finalizeConfigPopup(popup, body);
}

/**
 * Affiche le panneau de configuration pour une mesure individuelle
 * @param {Object} line - La ligne de mesure à configurer
 * @param {number} x - Position X du clic
 * @param {number} y - Position Y du clic
 */
function showMeasureIndividualConfig(line, x, y) {
  const result = createConfigPopup("measure-individual-config-popup", i18next.t("draw.modals.configureMeasure"));
  if (!result) return;
  const { popup, body } = result;

  // Initialiser la config individuelle si elle n'existe pas
  if (!line.config) {
    line.config = {};
  }

  // Valeurs actuelles (config individuelle ou valeurs globales par défaut)
  const currentGradType = line.config.graduationType ?? measureGraduationType;
  const currentGradSize = line.config.graduationSize ?? measureGraduationSize;
  const currentShowLabels = line.config.showSizeLabels ?? showMeasureSizeLabels;
  const currentColor = line.config.color ?? measureColor;
  const currentLabelSize = line.config.labelSize ?? measureLabelSize;
  const currentLineWidth =
    line.config.lineWidth ?? line.lineWidth ?? measureState.lineWidth;
  const currentPropConfig = line.config.proportionsConfig ?? {
    ...measureProportionsConfig,
  };

  // Couleur
  body.appendChild(
    createColorRow(i18next.t("draw.config.color"), "indiv-color", currentColor, (val) => {
      line.config.color = val;
      redrawDrawingMeasurements();
    }),
  );

  // Afficher la valeur
  const showSection = document.createElement("div");
  showSection.className = "config-section";
  showSection.style.marginTop = "10px";
  showSection.appendChild(
    createToggleRow(
      i18next.t("draw.config.showValue"),
      "indiv-show-labels",
      currentShowLabels,
      (checked) => {
        line.config.showSizeLabels = checked;
        redrawDrawingMeasurements();
      },
    ),
  );
  body.appendChild(showSection);

  // Type de graduation
  const gradSection = document.createElement("div");
  gradSection.className = "config-section";
  const gradLabel = document.createElement("div");
  gradLabel.className = "config-section-label";
  gradLabel.textContent = i18next.t("draw.config.graduationType");
  gradSection.appendChild(gradLabel);

  let proportionsSection = null;

  const gradButtons = createGraduationTypeButtons(currentGradType, (type) => {
    line.config.graduationType = type;
    if (proportionsSection) {
      proportionsSection.classList.toggle("disabled", type !== "proportions");
    }
    redrawDrawingMeasurements();
  });
  gradSection.appendChild(gradButtons);
  body.appendChild(gradSection);

  // Section proportions
  proportionsSection = createProportionsSection(
    currentPropConfig,
    (key, val) => {
      if (!line.config.proportionsConfig) {
        line.config.proportionsConfig = { ...measureProportionsConfig };
      }
      line.config.proportionsConfig[key] = val;
      redrawDrawingMeasurements();
    },
    currentGradType !== "proportions",
  );
  proportionsSection.id = "indiv-proportions-section";
  proportionsSection.style.marginBottom = "20px";
  body.appendChild(proportionsSection);

  // Container compact pour les sliders de taille
  const slidersContainer2 = document.createElement("div");
  slidersContainer2.className = "config-sliders-compact";

  // Taille des graduations
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.graduationSize"),
      "indiv-grad-size",
      { min: 0.5, max: 2.5, step: 0.1, value: currentGradSize, unit: "x" },
      (val) => {
        line.config.graduationSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille de la valeur
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.valueSize"),
      "indiv-label-size",
      { min: 0.5, max: 3.0, step: 0.1, value: currentLabelSize, unit: "x" },
      (val) => {
        line.config.labelSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Épaisseur du trait
  slidersContainer2.appendChild(
    createSliderSection(
      i18next.t("draw.config.lineWidth"),
      "indiv-line-width",
      { min: 1, max: 10, step: 1, value: currentLineWidth, unit: "px" },
      (val) => {
        line.config.lineWidth = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  body.appendChild(slidersContainer2);

  // Bouton réinitialiser
  const resetSection = document.createElement("div");
  resetSection.className = "config-section";
  const resetBtn = document.createElement("button");
  resetBtn.className = "control-btn";
  resetBtn.id = "indiv-reset";
  resetBtn.style.cssText =
    "width: auto; padding: 0 20px 0 20px; margin: 0 auto;";
  resetBtn.innerHTML = `
    <span class="btn-main-line" style="margin-bottom: -5px;">${ICONS.UNDO} ${i18next.t("draw.buttons.reset")}</span>
    <span class="btn-subtext">${i18next.t("draw.buttons.useGlobalValues")}</span>
  `;
  resetBtn.addEventListener("click", () => {
    delete line.config;
    redrawDrawingMeasurements();
    popup.remove();
  });
  resetSection.appendChild(resetBtn);
  body.appendChild(resetSection);

  finalizeConfigPopup(popup, body, { x, y, width: 320, height: 500 });
}

/**
 * Affiche le modal de configuration pour l'unité de calibration
 * @param {Object} line - La ligne de calibration
 * @param {number} x - Position X du clic
 * @param {number} y - Position Y du clic
 */
function showCalibrateIndividualConfig(line, x, y) {
  const result = createConfigPopup("calibrate-individual-config-popup", i18next.t("draw.modals.configureUnit"));
  if (!result) return;
  const { popup, body } = result;

  // Initialiser la config individuelle si elle n'existe pas
  if (!line.config) line.config = {};

  // Valeurs actuelles
  const currentColor = line.config.color ?? "#10b981";
  const currentLabelSize = line.config.labelSize ?? measureLabelSize;
  const currentShowLabel = line.config.showLabel !== false;
  const currentSubdivisions = line.config.subdivisions ?? 0;
  const currentGradSize = line.config.graduationSize ?? measureGraduationSize;
  const currentLineWidth = line.config.lineWidth ?? 3;

  // Section couleur et label
  const section1 = document.createElement("div");
  section1.className = "config-section";
  section1.appendChild(
    createColorRow(i18next.t("draw.config.color"), "calib-color", currentColor, (color) => {
      line.config.color = color;
      redrawDrawingMeasurements();
    }),
  );
  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showLabel"),
      "calib-show-label",
      currentShowLabel,
      (checked) => {
        line.config.showLabel = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  // Checkbox afficher le segment de calibration
  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showUnit"),
      "calib-show-line",
      measureState.showCalibrateLine,
      (checked) => {
        measureState.showCalibrateLine = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );

  body.appendChild(section1);

  // Section subdivisions
  const section2 = document.createElement("div");
  section2.className = "config-section";
  const subdivLabel = document.createElement("div");
  subdivLabel.className = "config-section-label";
  subdivLabel.textContent = i18next.t("draw.config.subdivisions");
  section2.appendChild(subdivLabel);
  section2.appendChild(
    createSubdivisionButtons(currentSubdivisions, (subdiv) => {
      line.config.subdivisions = subdiv;
      redrawDrawingMeasurements();
    }),
  );
  body.appendChild(section2);

  // Container pour les sliders (sans classe config-section pour espacement réduit)
  const slidersContainer = document.createElement("div");
  slidersContainer.className = "config-sliders-compact";

  // Épaisseur du trait
  slidersContainer.appendChild(
    createSliderSection(
      i18next.t("draw.config.lineWidth"),
      "calib-line-width",
      { min: 1, max: 10, step: 1, value: currentLineWidth, unit: "px" },
      (val) => {
        line.config.lineWidth = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille des graduations
  slidersContainer.appendChild(
    createSliderSection(
      i18next.t("draw.config.graduationSize"),
      "calib-graduation-size",
      { min: 0.5, max: 2.5, step: 0.1, value: currentGradSize, unit: "x" },
      (val) => {
        line.config.graduationSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille du label
  slidersContainer.appendChild(
    createSliderSection(
      i18next.t("draw.config.labelSize"),
      "calib-label-size",
      { min: 0.5, max: 3.0, step: 0.1, value: currentLabelSize, unit: "x" },
      (val) => {
        line.config.labelSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  body.appendChild(slidersContainer);

  // Section aide
  body.appendChild(createHelpSection());

  finalizeConfigPopup(popup, body, { x, y, width: 320, height: 400 });
}

/**
 * Affiche le modal de configuration pour une mesure compas individuelle
 * Style identique au modal "Réglages des mesures"
 * @param {Object} line - La mesure compas
 * @param {number} x - Position X du clic
 * @param {number} y - Position Y du clic
 */
function showCompassIndividualConfig(line, x, y) {
  // Supprimer un popup existant
  document.getElementById("measure-config-popup")?.remove();
  document.getElementById("measure-individual-config-popup")?.remove();
  document.getElementById("calibrate-individual-config-popup")?.remove();

  // Initialiser la config si absente
  if (!line.config) {
    line.config = {
      color: DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR,
      multiplier: 1,
      showLabel: true,
      labelSize: measureLabelSize,
      graduationSize: measureGraduationSize,
      subdivisions: 0,
      lineWidth: 3,
    };
  }

  const currentColor =
    line.config.color || DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR;
  const currentShowLabel = line.config.showLabel !== false;
  const currentSubdivisions = line.config.subdivisions ?? 0;
  const currentGradSize = line.config.graduationSize ?? measureGraduationSize;
  const currentLabelSize = line.config.labelSize ?? measureLabelSize;
  const currentLineWidth = line.config.lineWidth ?? 3;

  const popup = document.createElement("div");
  popup.id = "measure-config-popup";

  // Header
  const header = createModalHeader(i18next.t("draw.modals.compassSettings"), () => popup.remove());
  popup.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "config-body";

  // Section couleur et label
  const section1 = document.createElement("div");
  section1.className = "config-section";
  section1.appendChild(
    createColorRow(i18next.t("draw.config.color"), "compass-color", currentColor, (color) => {
      line.config.color = color;
      redrawDrawingMeasurements();
    }),
  );
  section1.appendChild(
    createToggleRow(
      i18next.t("draw.config.showLabel"),
      "compass-show-label",
      currentShowLabel,
      (checked) => {
        line.config.showLabel = checked;
        redrawDrawingMeasurements();
      },
      "10px",
    ),
  );
  body.appendChild(section1);

  // Section subdivisions
  const section2 = document.createElement("div");
  section2.className = "config-section";
  const subdivLabel = document.createElement("div");
  subdivLabel.className = "config-section-label";
  subdivLabel.textContent = i18next.t("draw.config.subdivisions");
  section2.appendChild(subdivLabel);
  section2.appendChild(
    createSubdivisionButtons(currentSubdivisions, (subdiv) => {
      line.config.subdivisions = subdiv;
      redrawDrawingMeasurements();
    }),
  );
  body.appendChild(section2);

  // Container compact pour les sliders
  const slidersContainer = document.createElement("div");
  slidersContainer.className = "config-sliders-compact";

  // Épaisseur du trait
  slidersContainer.appendChild(
    createSliderSection(
      i18next.t("draw.config.lineWidth"),
      "compass-line-width",
      { min: 1, max: 10, step: 1, value: currentLineWidth, unit: "px" },
      (val) => {
        line.config.lineWidth = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille des graduations
  slidersContainer.appendChild(
    createSliderSection(
      i18next.t("draw.config.graduationSize"),
      "compass-graduation-size",
      { min: 0.5, max: 2.5, step: 0.1, value: currentGradSize, unit: "x" },
      (val) => {
        line.config.graduationSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );

  // Taille de la valeur
  slidersContainer.appendChild(
    createSliderSection(
      i18next.t("draw.config.labelSize"),
      "compass-label-size",
      { min: 0.5, max: 3.0, step: 0.1, value: currentLabelSize, unit: "x" },
      (val) => {
        line.config.labelSize = val;
        redrawDrawingMeasurements();
      },
    ),
  );
  body.appendChild(slidersContainer);

  popup.appendChild(body);
  document.body.appendChild(popup);

  const helpSection = document.createElement("div");
  helpSection.className = "config-help-section";
  helpSection.innerHTML = `
    <div class="config-help-item"><kbd>Alt</kbd> + ${i18next.t("draw.help.duplicateMeasure")}</div>
    <div class="config-help-item"><kbd>Shift</kbd>+<kbd>Alt</kbd> + ${i18next.t("draw.help.deleteMeasure")}</div>
    <div class="config-help-item"><kbd>Ctrl</kbd> + ${i18next.t("draw.help.changeGraduation")}</div>
  `;
  body.appendChild(helpSection);

  popup.appendChild(body);
  document.body.appendChild(popup);

  // Positionner et configurer
  positionPopupInScreen(popup, x, y, 320, 400);
  makeMeasureConfigDraggable(popup);
}

/**
 * Rend le modal de configuration mesure déplaçable depuis le header ou les bords
 * et s'assure qu'il reste dans les limites de l'écran
 */
function makeMeasureConfigDraggable(popup) {
  const header = popup.querySelector("#measure-config-header");
  if (!header) return;

  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;

  // Zone de drag : header + bordure de 10px autour du popup
  const BORDER_DRAG_SIZE = 10;

  function startDrag(e) {
    // Vérifier si on clique sur un élément interactif
    if (
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest("select") ||
      e.target.closest("label") ||
      e.target.closest(".proportion-checkbox")
    ) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = popup.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // Désactiver la transition pendant le drag
    popup.style.transition = "none";
    popup.style.transform = "none";
    popup.style.left = initialLeft + "px";
    popup.style.top = initialTop + "px";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    e.preventDefault();
  }

  // Drag depuis le header
  header.addEventListener("mousedown", startDrag);
  header.style.cursor = "grab";

  // Drag depuis les bords du popup
  popup.addEventListener("mousedown", (e) => {
    const rect = popup.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Vérifier si on est sur le bord (dans les 10px du bord)
    const isOnBorder =
      x < BORDER_DRAG_SIZE ||
      x > rect.width - BORDER_DRAG_SIZE ||
      y < BORDER_DRAG_SIZE ||
      y > rect.height - BORDER_DRAG_SIZE;

    if (isOnBorder) {
      startDrag(e);
    }
  });

  function handleMouseMove(e) {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Limiter aux bords de l'écran
    const rect = popup.getBoundingClientRect();
    const margin = 20;

    // Ne pas sortir à gauche/droite
    if (newLeft < margin) newLeft = margin;
    if (newLeft + rect.width > window.innerWidth - margin) {
      newLeft = window.innerWidth - rect.width - margin;
    }

    // Ne pas sortir en haut/bas
    if (newTop < margin) newTop = margin;
    if (newTop + rect.height > window.innerHeight - margin) {
      newTop = window.innerHeight - rect.height - margin;
    }

    popup.style.left = newLeft + "px";
    popup.style.top = newTop + "px";
  }

  function handleMouseUp() {
    isDragging = false;
    header.style.cursor = "grab";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }
}

/**
 * Rend le container des infos de mesure (unité + total) déplaçable
 */
function setupDrawingInfosContainerDrag() {
  const container = document.getElementById("drawing-infos-container");
  if (!container) return;

  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;
  let positionInitialized = false;

  // Initialiser la position en pixels avec position: fixed
  const initializePosition = () => {
    if (positionInitialized) return true;
    const rect = container.getBoundingClientRect();
    // Vérifier que le container est visible et a une position valide
    if (rect.width > 0 && rect.height > 0 && rect.left > 0) {
      // Passer en position fixed pour que left/top correspondent aux coordonnées viewport
      container.style.position = "fixed";
      container.style.left = rect.left + "px";
      container.style.top = rect.top + "px";
      container.style.right = "auto";
      positionInitialized = true;
      return true;
    }
    return false;
  };

  container.addEventListener("mousedown", (e) => {
    // Ne pas déclencher le drag si on clique sur le bouton reset
    if (e.target.closest("button")) return;

    // Initialiser la position si pas encore fait - si échec, on ne drag pas
    if (!initializePosition()) return;

    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = container.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    container.style.cursor = "grabbing";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  });

  function handleMouseMove(e) {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Limiter aux bords de l'écran
    const rect = container.getBoundingClientRect();
    const margin = 10;

    if (newLeft < margin) newLeft = margin;
    if (newLeft + rect.width > window.innerWidth - margin) {
      newLeft = window.innerWidth - rect.width - margin;
    }
    if (newTop < margin) newTop = margin;
    if (newTop + rect.height > window.innerHeight - margin) {
      newTop = window.innerHeight - rect.height - margin;
    }

    container.style.left = newLeft + "px";
    container.style.top = newTop + "px";
  }

  function handleMouseUp() {
    isDragging = false;
    container.style.cursor = "grab";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }
}

/**
 * Positionne un popup près des coordonnées données en s'assurant qu'il reste dans l'écran
 */
function positionPopupInScreen(
  popup,
  x,
  y,
  preferredWidth = 320,
  preferredHeight = 450,
) {
  const margin = 20;

  // Rendre visible temporairement pour mesurer la vraie taille
  popup.style.visibility = "hidden";
  popup.style.display = "block";
  popup.style.left = "0px";
  popup.style.top = "0px";
  popup.style.transform = "none";

  // Forcer le recalcul du layout
  const actualRect = popup.getBoundingClientRect();
  const actualWidth = actualRect.width || preferredWidth;
  const actualHeight = actualRect.height || preferredHeight;

  // Calculer la position idéale
  let left = x + 10;
  let top = y - 50;

  // Ajuster si sort à droite
  if (left + actualWidth > window.innerWidth - margin) {
    left = x - actualWidth - 10;
  }

  // Ajuster si sort à gauche
  if (left < margin) {
    left = margin;
  }

  // Ajuster si sort en bas
  if (top + actualHeight > window.innerHeight - margin) {
    top = window.innerHeight - actualHeight - margin;
  }

  // Ajuster si sort en haut
  if (top < margin) {
    top = margin;
  }

  // Appliquer la position finale et rendre visible
  popup.style.left = left + "px";
  popup.style.top = top + "px";
  popup.style.visibility = "visible";
}

/**
 * Sélectionne un outil dans la toolbar
 */
function selectDrawingTool(toolName) {
  if (!drawingToolbar) return;

  // Arrêter l'animation laser si on quitte cet outil
  if (currentTool === "laser" && toolName !== "laser") {
    stopLaserAnimation();
  }

  // Annuler l'état du compas si on quitte l'outil protractor
  if (currentTool === "protractor" && toolName !== "protractor") {
    if (compassWaitingSecondClick) {
      compassCenter = null;
      compassWaitingSecondClick = false;
      startPoint = null;
      isDrawing = false;
      // Effacer la prévisualisation
      if (drawingPreviewCtx && drawingPreview) {
        clearCanvas(drawingPreviewCtx, drawingPreview);
      }
      // Cacher l'info de mesure
      const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
      if (measureInfo) measureInfo.classList.add("hidden");
    }
  }

  const toolButtons = drawingToolbar.querySelectorAll(
    ".annotation-tool[data-tool]",
  );
  toolButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === toolName);
  });
  currentTool = toolName;
  updateDrawingCursor();
}

/**
 * Efface à un point donné (gomme)
 */
function eraseAtDrawingPoint(x, y, ctx, canvas) {
  if (!ctx || !canvas) return;
  const eraserSize = annotationStyle.size / 2; // Rayon = moitié du lineWidth (diamètre)
  const prevGCO = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, eraserSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = prevGCO;
}

/**
 * Efface une ligne continue entre deux points (avec interpolation)
 * Résout le problème des points espacés quand on gomme vite
 */
function eraseLineBetweenPoints(from, to, ctx, canvas) {
  if (!ctx || !canvas || !from || !to) return;

  const eraserSize = annotationStyle.size / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = getDistance(from, to);

  // Interpoler tous les ERASER_INTERPOLATION_STEP pixels pour un effacement continu
  const steps = Math.max(1, Math.ceil(distance / DRAWING_CONSTANTS.ERASER_INTERPOLATION_STEP));

  const prevGCO = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-out";

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    ctx.beginPath();
    ctx.arc(x, y, eraserSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = prevGCO;
}

/**
 * Ajoute un point au tracé laser avec lissage (stabilisateur)
 */
function addLaserPoint(x, y) {
  // Ajouter au buffer pour le lissage
  stabilizerBuffer.push({ x, y });
  if (stabilizerBuffer.length > stabilizerBufferSize) {
    stabilizerBuffer.shift();
  }

  // Utiliser le point stabilisé si le buffer a assez de points
  let finalPoint;
  if (stabilizerBuffer.length >= 3) {
    finalPoint = calculateLaserStabilizedPoint();
  } else {
    finalPoint = { x, y };
  }

  laserPoints.push({ x: finalPoint.x, y: finalPoint.y, timestamp: Date.now() });
  // Démarrer l'animation si pas déjà en cours
  if (!laserAnimationId) {
    laserAnimationId = requestAnimationFrame(animateLaser);
  }
}

/**
 * Ajoute une ligne droite interpolée au tracé laser
 * Les points sont ajoutés avec le même timestamp pour former une ligne
 */
function addLaserLineBetweenPoints(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = getDistance(from, to);
  const now = Date.now();

  // Interpoler tous les LASER_INTERPOLATION_STEP pixels pour une ligne fluide
  const steps = Math.max(1, Math.ceil(distance / DRAWING_CONSTANTS.LASER_INTERPOLATION_STEP));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    laserPoints.push({ x, y, timestamp: now });
  }

  // Démarrer l'animation si pas déjà en cours
  if (!laserAnimationId) {
    laserAnimationId = requestAnimationFrame(animateLaser);
  }
}

/**
 * Anime le laser pointer (fondu progressif avec courbes lissées)
 */
function animateLaser() {
  if (!drawingPreviewCtx || !drawingPreview) {
    laserAnimationId = null;
    return;
  }

  const now = Date.now();

  // Supprimer les points trop vieux
  laserPoints = laserPoints.filter(
    (p) => now - p.timestamp < LASER_FADE_DURATION,
  );

  // Effacer le canvas preview
  clearCanvas(drawingPreviewCtx, drawingPreview);

  if (laserPoints.length < 2) {
    // Dessiner la preview de ligne droite même sans points
    if (laserShiftPreview) {
      drawingPreviewCtx.beginPath();
      drawingPreviewCtx.moveTo(
        laserShiftPreview.from.x,
        laserShiftPreview.from.y,
      );
      drawingPreviewCtx.lineTo(laserShiftPreview.to.x, laserShiftPreview.to.y);
      drawingPreviewCtx.strokeStyle = "rgba(255, 100, 100, 0.9)";
      drawingPreviewCtx.lineWidth = annotationStyle.size;
      drawingPreviewCtx.lineCap = "round";
      drawingPreviewCtx.stroke();
      laserAnimationId = requestAnimationFrame(animateLaser);
      return;
    }
    if (laserPoints.length === 0) {
      laserAnimationId = null;
      return;
    }
    laserAnimationId = requestAnimationFrame(animateLaser);
    return;
  }

  // Configuration du style
  drawingPreviewCtx.lineCap = "round";
  drawingPreviewCtx.lineJoin = "round";
  drawingPreviewCtx.lineWidth = annotationStyle.size;

  // Seuil pour détecter un nouveau tracé (gap temporel entre points)
  const GAP_THRESHOLD = DRAWING_CONSTANTS.GAP_THRESHOLD;

  // Dessiner une courbe lissée avec quadraticCurveTo
  // Technique : passer par les milieux des segments, utiliser les points réels comme contrôles
  // Détecter les gaps temporels pour ne pas connecter des tracés séparés
  for (let i = 0; i < laserPoints.length - 1; i++) {
    const p0 = laserPoints[i];
    const p1 = laserPoints[i + 1];

    // Détecter si c'est un nouveau tracé (gap temporel)
    const timeDiff = p1.timestamp - p0.timestamp;
    if (timeDiff > GAP_THRESHOLD) {
      // Gap détecté : ne pas connecter ces points
      continue;
    }

    // Opacité basée sur l'âge du point de départ
    const age = now - p0.timestamp;
    const opacity = Math.max(0, 1 - age / LASER_FADE_DURATION);

    if (opacity <= 0) continue;

    drawingPreviewCtx.beginPath();
    drawingPreviewCtx.strokeStyle = `rgba(255, 60, 60, ${opacity})`;

    // Vérifier si le point précédent fait partie du même tracé
    const prevIsConnected =
      i > 0 && p0.timestamp - laserPoints[i - 1].timestamp <= GAP_THRESHOLD;

    if (!prevIsConnected) {
      // Début d'un nouveau tracé : commencer au point p0
      drawingPreviewCtx.moveTo(p0.x, p0.y);
    } else {
      // Continuer le tracé : commencer au milieu du segment précédent
      const pPrev = laserPoints[i - 1];
      const startX = (pPrev.x + p0.x) / 2;
      const startY = (pPrev.y + p0.y) / 2;
      drawingPreviewCtx.moveTo(startX, startY);
    }

    // Vérifier si le point suivant fait partie du même tracé
    const nextIsConnected =
      i < laserPoints.length - 2 &&
      laserPoints[i + 2].timestamp - p1.timestamp <= GAP_THRESHOLD;

    if (!nextIsConnected) {
      // Fin du tracé : aller directement au point p1
      drawingPreviewCtx.quadraticCurveTo(p0.x, p0.y, p1.x, p1.y);
    } else {
      // Segment intermédiaire : aller au milieu du prochain segment
      const endX = (p0.x + p1.x) / 2;
      const endY = (p0.y + p1.y) / 2;
      drawingPreviewCtx.quadraticCurveTo(p0.x, p0.y, endX, endY);
    }

    drawingPreviewCtx.stroke();
  }

  // Dessiner la preview de ligne droite si Shift est maintenu
  if (laserShiftPreview) {
    drawingPreviewCtx.beginPath();
    drawingPreviewCtx.moveTo(
      laserShiftPreview.from.x,
      laserShiftPreview.from.y,
    );
    drawingPreviewCtx.lineTo(laserShiftPreview.to.x, laserShiftPreview.to.y);
    drawingPreviewCtx.strokeStyle = "rgba(255, 100, 100, 0.9)";
    drawingPreviewCtx.lineWidth = annotationStyle.size;
    drawingPreviewCtx.lineCap = "round";
    drawingPreviewCtx.stroke();
  }

  // Continuer l'animation si il y a des points ou une preview
  if (laserPoints.length > 0 || laserShiftPreview) {
    laserAnimationId = requestAnimationFrame(animateLaser);
  } else {
    laserAnimationId = null;
  }
}

/**
 * Arrête l'animation laser et nettoie
 */
function stopLaserAnimation() {
  if (laserAnimationId) {
    cancelAnimationFrame(laserAnimationId);
    laserAnimationId = null;
  }
  laserPoints = [];
  if (drawingPreviewCtx && drawingPreview) {
    clearCanvas(drawingPreviewCtx, drawingPreview);
  }
}

/**
 * Dessine une prévisualisation de forme (sans contraintes)
 */
function drawShapePreview(start, end, tool, ctx, canvas) {
  if (!ctx || !canvas || !start || !end) return;

  clearCanvas(ctx, canvas);
  applyStrokeStyle(ctx);
  drawShapeOnCanvas(ctx, start, end, tool);
}

/**
 * Dessine une prévisualisation de forme avec contraintes (Shift, Alt)
 */
function drawShapePreviewConstrained(start, end, tool, isShift, isAlt) {
  if (!drawingPreviewCtx || !drawingPreview || !start || !end) return;

  const ctx = drawingPreviewCtx;
  clearCanvas(ctx, drawingPreview);
  applyStrokeStyle(ctx);

  const { drawStart, drawEnd } = applyShapeConstraints(
    start,
    end,
    tool,
    isShift,
    isAlt,
  );
  drawShapeOnCanvas(ctx, drawStart, drawEnd, tool);
}

/**
 * Dessine une forme finale avec contraintes (Shift, Alt)
 */
function drawFinalShapeConstrained(start, end, tool, isShift, isAlt) {
  if (!drawingCtx || !start || !end) return;

  const ctx = drawingCtx;
  applyStrokeStyle(ctx);

  const { drawStart, drawEnd } = applyShapeConstraints(
    start,
    end,
    tool,
    isShift,
    isAlt,
  );
  drawShapeOnCanvas(ctx, drawStart, drawEnd, tool);
}

// ================================================================
// HELPERS POUR LES HANDLERS DE SOURIS
// ================================================================

/**
 * Gère le Shift+Alt+clic pour supprimer une mesure
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si une mesure a été supprimée
 */
function handleShiftClickDelete(coords) {
  const hit = findMeasurementLineAt(coords, 20);
  if (!hit) return false;

  const index = measurementLines.findIndex((line) => line.id === hit.id);
  if (index === -1) return false;

  // Si on supprime une ligne calibrate, supprimer aussi tous les compass
  if (hit.type === "calibrate") {
    calibrationUnit = null;
    removeCalibrateAndCompass();
    const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
    if (unitInfo) unitInfo.classList.add("hidden");
  } else {
    measurementLines.splice(index, 1);
  }
  redrawDrawingMeasurements();
  updateDrawingTotalDistance();
  // Mettre à jour les boutons pour les deux contextes
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");
  return true;
}

/**
 * Gère le Alt+clic-glissé pour dupliquer une mesure
 * @param {Object} coords - Coordonnées du clic
 * @returns {Object|null} La mesure dupliquée si succès, null sinon
 */
function handleAltClickDuplicate(coords) {
  const hit = findMeasurementLineAt(coords, 20);
  if (!hit) return null;

  // Ne pas dupliquer les calibrations (il ne peut y en avoir qu'une)
  if (hit.type === "calibrate") {
    return null; // Pas de toast, juste ignorer silencieusement
  }

  // Créer une copie de la mesure (sans décalage, le drag positionnera)
  const duplicate = JSON.parse(JSON.stringify(hit));
  duplicate.id = Date.now() + Math.random(); // Nouvel ID unique

  // Ajouter à la liste
  measurementLines.push(duplicate);
  redrawDrawingMeasurements();
  updateDrawingTotalDistance();

  return duplicate;
}

/**
 * Gère le Ctrl+clic pour cycler le type de graduation
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si une action a été effectuée
 */
function handleCtrlClickCycle(coords) {
  const hit = findMeasurementLineAt(coords, 20);
  if (!hit) return false;

  if (!hit.config) hit.config = {};

  if (hit.type === "measure") {
    const types = ["none", "units", "proportions"];
    const currentType = hit.config.graduationType ?? measureGraduationType;
    const currentIndex = types.indexOf(currentType);
    hit.config.graduationType = types[(currentIndex + 1) % types.length];
    redrawDrawingMeasurements();
    return true;
  }

  if (hit.type === "compass") {
    const subdivisions = [0, 2, 3, 4];
    const currentSubdiv = hit.config.subdivisions ?? 0;
    const currentIndex = subdivisions.indexOf(currentSubdiv);
    hit.config.subdivisions =
      subdivisions[(currentIndex + 1) % subdivisions.length];
    redrawDrawingMeasurements();
    return true;
  }

  if (hit.type === "calibrate") {
    const subdivisions = [0, 2, 3, 4];
    const currentSubdiv = hit.config.subdivisions ?? 0;
    const currentIndex = subdivisions.indexOf(currentSubdiv);
    hit.config.subdivisions =
      subdivisions[(currentIndex + 1) % subdivisions.length];
    redrawDrawingMeasurements();
    return true;
  }

  return false;
}

/**
 * Vérifie si on clique sur une borne de mesure pour l'éditer
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si on a commencé à éditer une borne
 */
function handleEndpointClick(coords) {
  const hit = findEndpointAt(coords, 15);
  if (!hit) return false;

  isDraggingEndpoint = true;
  selectedMeasurement = hit.line;
  draggedEndpoint = hit.endpoint;
  isDrawing = true;
  startPoint = coords;
  // Réinitialiser l'état du compas
  compassCenter = null;
  compassWaitingSecondClick = false;
  return true;
}

/**
 * Vérifie si on clique sur un label pour le déplacer
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si on a commencé à déplacer un label
 */
function handleLabelClick(coords) {
  const labelHit = findLabelAt(coords);
  if (!labelHit) return false;

  isDraggingLabel = true;
  dragLabelMeasurement = labelHit;
  if (!labelHit.labelOffset) {
    labelHit.labelOffset = { x: 0, y: 0 };
  }
  startPoint = coords;
  isDrawing = true;
  return true;
}

/**
 * Vérifie si on clique sur une mesure pour la déplacer entièrement
 * @param {Object} coords - Coordonnées du clic
 * @returns {boolean} true si on a commencé à déplacer une mesure
 */
function handleMeasurementClick(coords) {
  const lineHit = findMeasurementLineAt(coords, 15);
  if (!lineHit) return false;

  // Calculer le centre de la mesure
  let centerX, centerY;
  if (lineHit.type === "compass") {
    centerX = lineHit.start.x;
    centerY = lineHit.start.y;
  } else {
    centerX = (lineHit.start.x + lineHit.end.x) / 2;
    centerY = (lineHit.start.y + lineHit.end.y) / 2;
  }

  isDraggingMeasurement = true;
  selectedMeasurement = lineHit;
  dragMeasurementOffset = {
    x: coords.x - centerX,
    y: coords.y - centerY,
  };
  isDrawing = true;
  startPoint = coords;
  // Réinitialiser l'état du compas
  compassCenter = null;
  compassWaitingSecondClick = false;
  return true;
}

/**
 * Initialise le dessin avec l'outil pencil
 * @param {Object} coords - Coordonnées de départ
 */
function initPencilDrawing(coords) {
  stabilizerBuffer = [coords];
  lastDrawnPoint = { ...coords };
  drawingCtx.beginPath();
  drawingCtx.moveTo(coords.x, coords.y);
  drawingCtx.strokeStyle = annotationStyle.color;
  drawingCtx.lineWidth = annotationStyle.size;
  drawingCtx.lineCap = "round";
  drawingCtx.lineJoin = "round";
}

/**
 * Initialise l'effacement avec l'outil eraser
 * @param {Object} coords - Coordonnées de départ
 */
function initEraserDrawing(coords) {
  lastDrawnPoint = { ...coords };
  eraseAtDrawingPoint(coords.x, coords.y, drawingCtx, drawingCanvas);
}

/**
 * Initialise le tracé laser
 * @param {Object} coords - Coordonnées de départ
 */
function initLaserDrawing(coords) {
  lastDrawnPoint = { ...coords };
  addLaserPoint(coords.x, coords.y);
}

/**
 * Gère le mousedown pour le dessin
 * Utilise les helpers pour la logique commune
 */
function handleDrawingMouseDown(e) {
  // Seulement clic gauche (button 0), ignorer clic droit (button 2) et molette (button 1)
  if (e.button !== 0) return;

  const coords = getDrawingCoordinates(e);

  // Synchroniser keysState avec l'événement souris (évite les désynchronisations)
  keysState.shift = e.shiftKey;
  keysState.alt = e.altKey;
  keysState.ctrl = e.ctrlKey;

  // Shift+Alt+clic = mode suppression (bloquer toute création)
  if (e.shiftKey && e.altKey && !e.ctrlKey) {
    // Tenter la suppression si on est sur un segment
    handleShiftClickDelete(coords);
    // Dans tous les cas, ne PAS créer de segment quand Shift+Alt est maintenu
    return;
  }

  // Alt+clic sur une mesure = duplication (démarre le drag de la copie)
  if (e.altKey && !e.shiftKey) {
    const duplicated = handleAltClickDuplicate(coords);
    if (duplicated) {
      // Calculer le centre de la mesure dupliquée (comme handleMeasurementClick)
      let centerX, centerY;
      if (duplicated.type === "compass") {
        centerX = duplicated.start.x;
        centerY = duplicated.start.y;
      } else {
        centerX = (duplicated.start.x + duplicated.end.x) / 2;
        centerY = (duplicated.start.y + duplicated.end.y) / 2;
      }

      // Démarrer le drag de la mesure dupliquée
      isDraggingMeasurement = true;
      selectedMeasurement = duplicated;
      // L'offset est calculé par rapport au centre (comme pour le drag normal)
      dragMeasurementOffset = {
        x: coords.x - centerX,
        y: coords.y - centerY,
      };
      startPoint = coords;
      isDrawing = true;
      return;
    }
  }

  // Ctrl+clic sur une mesure = changer le type de graduation
  if (e.ctrlKey) {
    handleCtrlClickCycle(coords);
    return; // Ne pas traiter Ctrl+clic autrement
  }

  // Vérifier si on clique sur une borne/label/segment de mesure (pour les outils measure/calibrate/protractor)
  if (["measure", "calibrate", "protractor"].includes(currentTool)) {
    // Borne de mesure
    if (handleEndpointClick(coords)) return;

    // Label de mesure (pas pour protractor)
    if (currentTool !== "protractor" && handleLabelClick(coords)) return;

    // Segment de mesure entier
    if (handleMeasurementClick(coords)) return;
  }

  // Gestion spéciale pour l'outil protractor (compas)
  if (currentTool === "protractor") {
    if (!calibrationUnit || calibrationUnit <= 0) {
      showDrawingToast(
        i18next.t("drawing.calibrationRequired"),
        "warning",
      );
      return;
    }

    if (!compassWaitingSecondClick) {
      // Premier clic : définir le centre du compas et activer le mode drag
      compassCenter = { ...coords };
      compassWaitingSecondClick = true;
      compassDragging = true;
      compassDragMoved = false;
      startPoint = coords;
      isDrawing = true;
      drawCompassPreview(compassCenter, coords);
      return;
    } else {
      // Deuxième clic : finaliser le compas
      finalizeCompass(compassCenter, coords);
      compassCenter = null;
      compassWaitingSecondClick = false;
      compassDragging = false;
      startPoint = null;
      isDrawing = false;
      if (drawingPreviewCtx && drawingPreview) {
        clearCanvas(drawingPreviewCtx, drawingPreview);
      }
      saveDrawingHistory();
      return;
    }
  }

  // Initialiser le dessin
  startPoint = coords;
  originalStartPoint = { ...coords };
  isDrawing = true;

  // Initialisation spécifique à l'outil
  if (currentTool === "pencil") {
    initPencilDrawing(coords);
  } else if (currentTool === "eraser") {
    initEraserDrawing(coords);
  } else if (currentTool === "laser") {
    initLaserDrawing(coords);
  }
}

// ================================================================
// HELPERS POUR handleDrawingMouseMove() - Phase 6.1
// ================================================================

/**
 * Interpole une ligne entre deux points en dessinant des segments courts
 * Résout le problème des trous quand on dessine vite
 * @param {CanvasRenderingContext2D} ctx - Contexte de dessin
 * @param {Object} from - Point de départ {x, y}
 * @param {Object} to - Point d'arrivée {x, y}
 * @param {number} step - Distance entre chaque point interpolé
 */
function interpolateLine(ctx, from, to, step) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = getDistance(from, to);

  if (distance <= step) {
    // Distance courte, dessiner directement
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    return;
  }

  // Interpoler des points intermédiaires
  const steps = Math.ceil(distance / step);
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 1; i <= steps; i++) {
    const x = from.x + stepX * i;
    const y = from.y + stepY * i;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
}

/**
 * Calcule le point d'intersection avec le bord du canvas
 * Quand le curseur sort vite du canvas, cette fonction calcule où
 * le trait devrait s'arrêter sur le bord
 * @param {Object} from - Dernier point dessiné {x, y}
 * @param {Object} to - Position actuelle du curseur (peut être hors canvas) {x, y}
 * @param {number} width - Largeur du canvas
 * @param {number} height - Hauteur du canvas
 * @returns {Object|null} Point d'intersection avec le bord ou null
 */
function getEdgeIntersection(from, to, width, height) {
  // Vérifier si to est déjà dans le canvas
  if (to.x >= 0 && to.x <= width && to.y >= 0 && to.y <= height) {
    return null; // Pas besoin d'intersection
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Si pas de mouvement, retourner null
  if (dx === 0 && dy === 0) return null;

  let tMin = Infinity;
  let intersection = null;

  // Vérifier intersection avec chaque bord
  // Bord gauche (x = 0)
  if (dx < 0 && from.x > 0) {
    const t = (0 - from.x) / dx;
    if (t >= 0 && t < tMin) {
      const y = from.y + t * dy;
      if (y >= 0 && y <= height) {
        tMin = t;
        intersection = { x: 0, y };
      }
    }
  }

  // Bord droit (x = width)
  if (dx > 0 && from.x < width) {
    const t = (width - from.x) / dx;
    if (t >= 0 && t < tMin) {
      const y = from.y + t * dy;
      if (y >= 0 && y <= height) {
        tMin = t;
        intersection = { x: width, y };
      }
    }
  }

  // Bord haut (y = 0)
  if (dy < 0 && from.y > 0) {
    const t = (0 - from.y) / dy;
    if (t >= 0 && t < tMin) {
      const x = from.x + t * dx;
      if (x >= 0 && x <= width) {
        tMin = t;
        intersection = { x, y: 0 };
      }
    }
  }

  // Bord bas (y = height)
  if (dy > 0 && from.y < height) {
    const t = (height - from.y) / dy;
    if (t >= 0 && t < tMin) {
      const x = from.x + t * dx;
      if (x >= 0 && x <= width) {
        tMin = t;
        intersection = { x, y: height };
      }
    }
  }

  return intersection;
}

/**
 * Gère le mouvement du pencil (dessin libre ou ligne droite avec Shift)
 */
function handlePencilMove(coords, ctx, previewCtx, previewCanvas) {
  if (keysState.shift) {
    // Mode Shift : ligne droite depuis le dernier point
    // Si lastDrawnPoint est null (on vient de rentrer dans le canvas),
    // on ne dessine pas de ligne, juste un point
    if (!lastDrawnPoint) {
      clearCanvas(previewCtx, previewCanvas);
      wasShiftPressed = true;
      return;
    }
    clearCanvas(previewCtx, previewCanvas);
    previewCtx.beginPath();
    previewCtx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
    previewCtx.lineTo(coords.x, coords.y);
    previewCtx.strokeStyle = annotationStyle.color;
    previewCtx.lineWidth = annotationStyle.size;
    previewCtx.lineCap = "round";
    previewCtx.stroke();
    stabilizerBuffer = [coords];
    wasShiftPressed = true;
    return;
  }

  // Transition Shift → libre : finaliser la ligne droite
  if (wasShiftPressed && lastDrawnPoint) {
    ctx.beginPath();
    ctx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = annotationStyle.color;
    ctx.lineWidth = annotationStyle.size;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    lastDrawnPoint = { ...coords };
    stabilizerBuffer = [coords];
    wasShiftPressed = false;
    clearCanvas(previewCtx, previewCanvas);
    return;
  }
  wasShiftPressed = false;

  // Effacer le preview
  clearCanvas(previewCtx, previewCanvas);

  // Ajouter au buffer du stabilisateur
  stabilizerBuffer.push(coords);
  if (stabilizerBuffer.length > stabilizerBufferSize) {
    stabilizerBuffer.shift();
  }

  if (stabilizerEnabled && lastDrawnPoint) {
    // Utiliser l'algorithme "Pulling String"
    const smoothed = calculateStabilizedPoint(coords, lastDrawnPoint);

    if (smoothed) {
      // Le point a assez bougé, on dessine avec courbe lissée
      ctx.lineWidth = annotationStyle.size;
      const midX = (lastDrawnPoint.x + smoothed.x) / 2;
      const midY = (lastDrawnPoint.y + smoothed.y) / 2;
      ctx.quadraticCurveTo(lastDrawnPoint.x, lastDrawnPoint.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      lastDrawnPoint = { ...smoothed };

      // Afficher un aperçu de la "corde" entre le point lissé et la souris
      // Seulement si le lissage est > 60%
      if (stabilizerStrength > 0.6) {
        previewCtx.beginPath();
        previewCtx.moveTo(smoothed.x, smoothed.y);
        previewCtx.lineTo(coords.x, coords.y);
        previewCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        previewCtx.lineWidth = 1;
        previewCtx.setLineDash([3, 3]);
        previewCtx.stroke();
        previewCtx.setLineDash([]);

        // Point indicateur de la position réelle de la souris
        previewCtx.beginPath();
        previewCtx.arc(coords.x, coords.y, 4, 0, Math.PI * 2);
        previewCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
        previewCtx.fill();
      }
    } else if (lastDrawnPoint) {
      // La souris n'a pas assez bougé, afficher la corde quand même si lissage > 60%
      if (stabilizerStrength > 0.6) {
        previewCtx.beginPath();
        previewCtx.moveTo(lastDrawnPoint.x, lastDrawnPoint.y);
        previewCtx.lineTo(coords.x, coords.y);
        previewCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        previewCtx.lineWidth = 1;
        previewCtx.setLineDash([3, 3]);
        previewCtx.stroke();
        previewCtx.setLineDash([]);

        // Point indicateur de la position réelle de la souris
        previewCtx.beginPath();
        previewCtx.arc(coords.x, coords.y, 4, 0, Math.PI * 2);
        previewCtx.fillStyle = "rgba(255, 255, 255, 0.5)";
        previewCtx.fill();
      }
    }
  } else {
    // Pas de stabilisation, dessin avec lissage par courbes de Bézier (midpoint smoothing)
    ctx.lineWidth = annotationStyle.size;

    if (lastDrawnPoint) {
      // Courbe quadratique : control = lastDrawnPoint, end = midpoint
      const midX = (lastDrawnPoint.x + coords.x) / 2;
      const midY = (lastDrawnPoint.y + coords.y) / 2;
      ctx.quadraticCurveTo(lastDrawnPoint.x, lastDrawnPoint.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
    } else {
      // Premier point après être revenu dans le canvas
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
    lastDrawnPoint = { ...coords };
  }
}

/**
 * Gère le mouvement de l'eraser (effacement libre ou ligne droite avec Shift)
 */
function handleEraserMove(coords, ctx, canvas, previewCtx, previewCanvas) {
  if (keysState.shift) {
    // Mode Shift : ligne droite d'effacement
    const lineOrigin = lastDrawnPoint || startPoint;
    clearCanvas(previewCtx, previewCanvas);
    previewCtx.beginPath();
    previewCtx.moveTo(lineOrigin.x, lineOrigin.y);
    previewCtx.lineTo(coords.x, coords.y);
    previewCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    previewCtx.lineWidth = annotationStyle.size;
    previewCtx.lineCap = "round";
    previewCtx.setLineDash([5, 5]);
    previewCtx.stroke();
    previewCtx.setLineDash([]);
    stabilizerBuffer = [coords];
    wasShiftPressed = true;
    return;
  }

  // Transition Shift → libre
  if (wasShiftPressed && lastDrawnPoint) {
    eraseLineBetweenPoints(lastDrawnPoint, coords, ctx, canvas);
    lastDrawnPoint = { ...coords };
    wasShiftPressed = false;
    clearCanvas(previewCtx, previewCanvas);
    return;
  }
  wasShiftPressed = false;

  // Effacer le preview
  clearCanvas(previewCtx, previewCanvas);

  // Effacement continu avec interpolation
  if (lastDrawnPoint) {
    eraseLineBetweenPoints(lastDrawnPoint, coords, ctx, canvas);
  } else {
    eraseAtDrawingPoint(coords.x, coords.y, ctx, canvas);
  }
  lastDrawnPoint = { ...coords };
}

/**
 * Gère le mouvement du laser (tracé libre ou ligne droite avec Shift)
 */
function handleLaserMove(coords) {
  if (keysState.shift) {
    // Mode Shift : ligne droite laser
    const lineOrigin = lastDrawnPoint || startPoint;
    laserShiftPreview = {
      from: { x: lineOrigin.x, y: lineOrigin.y },
      to: { x: coords.x, y: coords.y },
    };
    stabilizerBuffer = [coords];
    wasShiftPressed = true;
    if (!laserAnimationId) {
      laserAnimationId = requestAnimationFrame(animateLaser);
    }
    return;
  }

  // Transition Shift → libre
  if (wasShiftPressed && lastDrawnPoint) {
    addLaserLineBetweenPoints(lastDrawnPoint, coords);
    lastDrawnPoint = { ...coords };
    laserShiftPreview = null;
    wasShiftPressed = false;
    return;
  }
  wasShiftPressed = false;
  laserShiftPreview = null;

  // Tracé laser libre
  addLaserPoint(coords.x, coords.y);
  lastDrawnPoint = { ...coords };
}

/**
 * Gère le mouvement pour les formes (rectangle, circle, line, arrow)
 */
function handleShapeMove(coords) {
  if (keysState.space && originalStartPoint) {
    // Déplacement avec Espace
    if (!spacePressStartPos) {
      spacePressStartPos = { x: coords.x, y: coords.y };
      shapeEndAtSpacePress = { x: coords.x, y: coords.y };
    }

    const offsetX = coords.x - spacePressStartPos.x;
    const offsetY = coords.y - spacePressStartPos.y;

    const movedStart = {
      x: originalStartPoint.x + offsetX,
      y: originalStartPoint.y + offsetY,
    };
    const movedEnd = {
      x: shapeEndAtSpacePress.x + offsetX,
      y: shapeEndAtSpacePress.y + offsetY,
    };

    startPoint = movedStart;
    originalStartPoint = movedStart;
    shapeEndAtSpacePress = movedEnd;
    spacePressStartPos = { x: coords.x, y: coords.y };

    drawShapePreviewConstrained(
      movedStart,
      movedEnd,
      currentTool,
      keysState.shift,
      keysState.alt,
    );
  } else {
    // Prévisualisation normale
    drawShapePreviewConstrained(
      startPoint,
      coords,
      currentTool,
      keysState.shift,
      keysState.alt,
    );
  }
}

/**
 * Gère le mouvement pour les mesures (measure, calibrate)
 */
function handleMeasureToolMove(coords, e) {
  if (keysState.space && originalStartPoint) {
    // Déplacement avec Espace
    if (!spacePressStartPos) {
      spacePressStartPos = { x: coords.x, y: coords.y };
      // Utiliser shapeEndAtSpacePress déjà calculé (avec le lock si actif)
      // Si pas encore défini, calculer le point de fin avec le lock actuel
      if (!shapeEndAtSpacePress) {
        if (measureLockedLength !== null && measureLockedLength > 0) {
          const dx = coords.x - startPoint.x;
          const dy = coords.y - startPoint.y;
          const currentDist = getDistance(startPoint, coords);
          if (currentDist > 0) {
            shapeEndAtSpacePress = {
              x: startPoint.x + (dx / currentDist) * measureLockedLength,
              y: startPoint.y + (dy / currentDist) * measureLockedLength,
            };
          } else {
            shapeEndAtSpacePress = { ...coords };
          }
        } else {
          shapeEndAtSpacePress = { ...coords };
        }
      }
    }

    const offsetX = coords.x - spacePressStartPos.x;
    const offsetY = coords.y - spacePressStartPos.y;

    const movedStart = {
      x: originalStartPoint.x + offsetX,
      y: originalStartPoint.y + offsetY,
    };
    const movedEnd = {
      x: shapeEndAtSpacePress.x + offsetX,
      y: shapeEndAtSpacePress.y + offsetY,
    };

    startPoint = movedStart;
    originalStartPoint = movedStart;
    shapeEndAtSpacePress = movedEnd;
    spacePressStartPos = { x: coords.x, y: coords.y };

    drawMeasurePreview(
      movedStart,
      movedEnd,
      currentTool,
      { lockedLength: measureLockedLength },
    );
  } else {
    let endPoint = { ...coords };

    // Shift : verrouiller la taille du segment
    if (
      keysState.shift &&
      measureLockedLength !== null &&
      measureLockedLength > 0
    ) {
      const dx = coords.x - startPoint.x;
      const dy = coords.y - startPoint.y;
      const currentDist = getDistance(startPoint, coords);
      if (currentDist > 0) {
        endPoint = {
          x: startPoint.x + (dx / currentDist) * measureLockedLength,
          y: startPoint.y + (dy / currentDist) * measureLockedLength,
        };
      }
    } else {
      measureLockedLength = getDistance(startPoint, coords);

      // Ctrl : snap à l'unité calibrée
      if (
        e.ctrlKey &&
        currentTool === "measure" &&
        calibrationUnit &&
        calibrationUnit > 0
      ) {
        const distance = getDistance(startPoint, coords);
        const snappedUnits = Math.round(distance / calibrationUnit);
        const snappedDistance = snappedUnits * calibrationUnit;

        if (snappedDistance > 0) {
          const dx = coords.x - startPoint.x;
          const dy = coords.y - startPoint.y;
          const currentDist = getDistance(startPoint, coords);
          if (currentDist > 0) {
            endPoint = {
              x: startPoint.x + (dx / currentDist) * snappedDistance,
              y: startPoint.y + (dy / currentDist) * snappedDistance,
            };
            measureLockedLength = snappedDistance;
          }
        }
      }
    }

    shapeEndAtSpacePress = { ...endPoint };
    drawMeasurePreview(
      startPoint,
      endPoint,
      currentTool,
      { lockedLength: keysState.shift ? measureLockedLength : null },
    );
  }
}

/**
 * Gère le drag d'une borne de mesure
 */
function handleEndpointDrag(coords, e) {
  const lineExists = measurementLines.some(
    (line) => line.id === selectedMeasurement.id,
  );
  if (!lineExists) {
    isDraggingEndpoint = false;
    selectedMeasurement = null;
    draggedEndpoint = null;
    return false;
  }

  // Compass : maintenir la longueur fixe
  if (selectedMeasurement.type === "compass" && calibrationUnit > 0) {
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;

    const dx = coords.x - anchorPoint.x;
    const dy = coords.y - anchorPoint.y;
    const distance = getDistance(anchorPoint, coords);

    if (distance > 0) {
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      selectedMeasurement[draggedEndpoint] = {
        x: anchorPoint.x + normalizedDx * calibrationUnit,
        y: anchorPoint.y + normalizedDy * calibrationUnit,
      };
    }
  } else if (selectedMeasurement.type === "calibrate") {
    handleCalibrateDrag(coords, e);
  } else {
    handleMeasureDrag(coords, e);
  }

  redrawDrawingMeasurements(coords, 15);
  return true;
}

/**
 * Gère le drag spécifique pour calibrate
 */
function handleCalibrateDrag(coords, e) {
  if (keysState.shift || e.shiftKey) {
    // Shift : verrouiller la taille
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;
    const currentLength =
      calibrationUnit ||
      getDistance(selectedMeasurement.start, selectedMeasurement.end);

    const dx = coords.x - anchorPoint.x;
    const dy = coords.y - anchorPoint.y;
    const distance = getDistance(anchorPoint, coords);

    if (distance > 0 && currentLength > 0) {
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      selectedMeasurement[draggedEndpoint] = {
        x: anchorPoint.x + normalizedDx * currentLength,
        y: anchorPoint.y + normalizedDy * currentLength,
      };
    }
  } else {
    // Mettre à jour la borne ET recalculer calibrationUnit
    selectedMeasurement[draggedEndpoint] = { x: coords.x, y: coords.y };

    const newCalibrationUnit = getDistance(
      selectedMeasurement.start,
      selectedMeasurement.end,
    );

    if (newCalibrationUnit > 0 && newCalibrationUnit !== calibrationUnit) {
      calibrationUnit = newCalibrationUnit;

      // Redimensionner tous les compass
      resizeCompassLines(calibrationUnit);

      const unitValue = drawingDOM.unitValue || document.getElementById("drawing-unit-value");
      if (unitValue) {
        unitValue.textContent = `${Math.round(calibrationUnit)}px`;
      }
    }
  }
}

/**
 * Gère le drag spécifique pour measure
 */
function handleMeasureDrag(coords, e) {
  if (keysState.shift || e.shiftKey) {
    // Shift : verrouiller la taille
    const anchorPoint =
      draggedEndpoint === "start"
        ? selectedMeasurement.end
        : selectedMeasurement.start;
    const currentLength = getDistance(
      selectedMeasurement.start,
      selectedMeasurement.end,
    );

    const dx = coords.x - anchorPoint.x;
    const dy = coords.y - anchorPoint.y;
    const distance = getDistance(anchorPoint, coords);

    if (distance > 0 && currentLength > 0) {
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      selectedMeasurement[draggedEndpoint] = {
        x: anchorPoint.x + normalizedDx * currentLength,
        y: anchorPoint.y + normalizedDy * currentLength,
      };
    }
  } else {
    selectedMeasurement[draggedEndpoint] = { x: coords.x, y: coords.y };
  }
}

/**
 * Gère le drag d'une mesure entière
 */
function handleMeasurementDrag(coords) {
  const lineExists = measurementLines.some(
    (line) => line.id === selectedMeasurement.id,
  );
  if (!lineExists) {
    isDraggingMeasurement = false;
    selectedMeasurement = null;
    dragMeasurementOffset = null;
    return false;
  }

  const newCenterX = coords.x - dragMeasurementOffset.x;
  const newCenterY = coords.y - dragMeasurementOffset.y;

  let oldCenterX, oldCenterY;
  if (selectedMeasurement.type === "compass") {
    oldCenterX = selectedMeasurement.start.x;
    oldCenterY = selectedMeasurement.start.y;
  } else {
    oldCenterX = (selectedMeasurement.start.x + selectedMeasurement.end.x) / 2;
    oldCenterY = (selectedMeasurement.start.y + selectedMeasurement.end.y) / 2;
  }

  const deltaX = newCenterX - oldCenterX;
  const deltaY = newCenterY - oldCenterY;

  selectedMeasurement.start.x += deltaX;
  selectedMeasurement.start.y += deltaY;
  selectedMeasurement.end.x += deltaX;
  selectedMeasurement.end.y += deltaY;

  redrawDrawingMeasurements();
  return true;
}

/**
 * Gère le drag d'un label de mesure
 */
function handleLabelDrag(coords) {
  const lineExists = measurementLines.some(
    (line) => line.id === dragLabelMeasurement.id,
  );
  if (!lineExists) {
    isDraggingLabel = false;
    dragLabelMeasurement = null;
    return false;
  }

  const deltaX = coords.x - startPoint.x;
  const deltaY = coords.y - startPoint.y;

  if (!dragLabelMeasurement.labelOffset) {
    dragLabelMeasurement.labelOffset = { x: 0, y: 0 };
  }

  if (!dragLabelMeasurement._originalLabelOffset) {
    dragLabelMeasurement._originalLabelOffset = {
      ...dragLabelMeasurement.labelOffset,
    };
  }

  dragLabelMeasurement.labelOffset = {
    x: dragLabelMeasurement._originalLabelOffset.x + deltaX,
    y: dragLabelMeasurement._originalLabelOffset.y + deltaY,
  };

  redrawDrawingMeasurements();
  return true;
}

/**
 * Gère le survol quand on ne dessine pas (curseurs, hover)
 */
function handleIdleHover(coords, e) {
  // Synchroniser keysState avec l'événement souris (évite les désynchronisations)
  keysState.shift = e.shiftKey;
  keysState.alt = e.altKey;
  keysState.ctrl = e.ctrlKey;

  // Détection des touches de modification
  const isShiftPressed = e.shiftKey;
  const isAltPressed = e.altKey;
  const isCtrlPressed = e.ctrlKey;

  // Shift+Alt maintenu : curseur de suppression (prioritaire)
  if (isShiftPressed && isAltPressed && !isCtrlPressed) {
    const lineHit = findMeasurementLineAt(coords, 20);
    if (lineHit && drawingPreview) {
      drawingPreview.style.cursor = getDeleteCursor();
      redrawDrawingMeasurements(coords, 20);
      return true;
    }
    // Même si pas de segment, on ne passe PAS au curseur duplication
    // car Shift+Alt est maintenu
    return false;
  }

  // Alt maintenu SEUL (sans Shift) : curseur de duplication
  if (isAltPressed && !isShiftPressed) {
    const lineHit = findMeasurementLineAt(coords, 20);
    if (lineHit && drawingPreview) {
      // Pas de curseur duplication pour calibrate
      if (lineHit.type === "calibrate") {
        drawingPreview.style.cursor = "not-allowed";
      } else {
        drawingPreview.style.cursor = getDuplicateCursor();
      }
      redrawDrawingMeasurements(coords, 20);
      return true;
    }
  }

  // Ctrl maintenu : curseur de cycle
  if (e.ctrlKey) {
    const lineHit = findMeasurementLineAt(coords, 20);
    if (
      lineHit &&
      (lineHit.type === "measure" || lineHit.type === "compass") &&
      drawingPreview
    ) {
      drawingPreview.style.cursor = getCycleCursor();
      redrawDrawingMeasurements(coords, 20);
      return true;
    }
  }

  // Survol des outils de mesure
  if (
    currentTool === "measure" ||
    currentTool === "calibrate" ||
    currentTool === "protractor"
  ) {
    // Protractor en attente du second clic
    if (
      currentTool === "protractor" &&
      compassWaitingSecondClick &&
      compassCenter
    ) {
      drawCompassPreview(compassCenter, coords);
    }

    const hit = findEndpointAt(coords, 15);
    if (hit) {
      if (drawingPreview) drawingPreview.style.cursor = "pointer";
      redrawDrawingMeasurements(coords, 15);
    } else {
      const labelHit =
        currentTool !== "protractor" ? findLabelAt(coords) : null;
      if (labelHit) {
        if (drawingPreview) drawingPreview.style.cursor = "grab";
      } else {
        const lineHit = findMeasurementLineAt(coords, 15);
        if (lineHit) {
          if (drawingPreview) drawingPreview.style.cursor = "move";
        } else {
          if (drawingPreview) drawingPreview.style.cursor = "";
        }
      }
      redrawDrawingMeasurements();
    }
    return true;
  }

  return false;
}

/**
 * Gère le mousemove pour le dessin
 * Utilise les helpers Phase 6.1 pour la logique par outil
 */
function handleDrawingMouseMove(e) {
  // Mettre à jour la position pour updateAltDuplicateCursor
  lastMousePosition = { x: e.clientX, y: e.clientY };

  const coords = getDrawingCoordinates(e);

  // Détection de l'entrée dans le canvas (quand mouseenter n'est pas déclenché)
  // Si wasOutsideCanvas est true alors qu'on reçoit un mousemove,
  // c'est qu'on vient de rentrer dans le canvas
  if (wasOutsideCanvas) {
    resetDrawingStateOnEnter();
  }

  // Stocker les coordonnées canvas pour le compas (utilisé dans mouseUp)
  if (currentTool === "protractor" && compassWaitingSecondClick) {
    lastMousePosition = coords;
    if (compassDragging && compassCenter) {
      const distance = getDistance(compassCenter, coords);
      if (distance > 10) {
        compassDragMoved = true;
      }
    }
  }

  // Curseur personnalisé pour pencil/eraser/laser (sauf mode précis CapsLock)
  if (
    ["pencil", "eraser", "laser"].includes(currentTool) &&
    !showPreciseCursor
  ) {
    updateDrawingCursorPosition(e.clientX, e.clientY);
  } else {
    hideDrawingCursor();
  }

  // Quand on ne dessine pas : gestion du survol
  if (!isDrawing) {
    handleIdleHover(coords, e);
    return;
  }

  // Mode déplacement de borne
  if (isDraggingEndpoint && selectedMeasurement && draggedEndpoint) {
    handleEndpointDrag(coords, e);
    return;
  }

  // Mode déplacement de mesure entière
  if (isDraggingMeasurement && selectedMeasurement && dragMeasurementOffset) {
    handleMeasurementDrag(coords);
    return;
  }

  // Mode déplacement de label
  if (isDraggingLabel && dragLabelMeasurement && startPoint) {
    handleLabelDrag(coords);
    return;
  }

  // Stocker la position pour les formes
  if (
    [
      "rectangle",
      "circle",
      "line",
      "arrow",
      "measure",
      "calibrate",
      "protractor",
    ].includes(currentTool)
  ) {
    stabilizerBuffer = [coords];
  }

  // Dispatch selon l'outil actif
  if (currentTool === "pencil") {
    handlePencilMove(coords, drawingCtx, drawingPreviewCtx, drawingPreview);
  } else if (currentTool === "eraser") {
    handleEraserMove(
      coords,
      drawingCtx,
      drawingCanvas,
      drawingPreviewCtx,
      drawingPreview,
    );
  } else if (currentTool === "laser") {
    handleLaserMove(coords);
  } else if (["rectangle", "circle", "line", "arrow"].includes(currentTool)) {
    handleShapeMove(coords);
  } else if (["measure", "calibrate"].includes(currentTool)) {
    handleMeasureToolMove(coords, e);
  } else if (currentTool === "protractor") {
    // Prévisualisation du compas
    if (compassWaitingSecondClick && compassCenter) {
      if (keysState.space) {
        if (!spacePressStartPos) {
          spacePressStartPos = { x: coords.x, y: coords.y };
        } else {
          const offsetX = coords.x - spacePressStartPos.x;
          const offsetY = coords.y - spacePressStartPos.y;
          compassCenter.x += offsetX;
          compassCenter.y += offsetY;
          spacePressStartPos = { x: coords.x, y: coords.y };
        }
      }
      drawCompassPreview(compassCenter, coords);
    }
  }
}

/**
 * Gère le mouseup pour le dessin
 */
function handleDrawingMouseUp() {
  if (!isDrawing) return;

  isDrawing = false;

  // Si on était en mode déplacement de borne
  if (isDraggingEndpoint) {
    isDraggingEndpoint = false;
    selectedMeasurement = null;
    draggedEndpoint = null;
    redrawDrawingMeasurements();
    saveDrawingHistory();
    startPoint = null;
    return;
  }

  // Si on était en mode déplacement de mesure entière
  if (isDraggingMeasurement) {
    isDraggingMeasurement = false;
    selectedMeasurement = null;
    dragMeasurementOffset = null;
    redrawDrawingMeasurements();
    saveDrawingHistory();
    startPoint = null;
    return;
  }

  // Si on était en mode déplacement de label
  if (isDraggingLabel) {
    // Nettoyer l'offset temporaire utilisé pendant le drag
    if (dragLabelMeasurement && dragLabelMeasurement._originalLabelOffset) {
      delete dragLabelMeasurement._originalLabelOffset;
    }
    isDraggingLabel = false;
    dragLabelMeasurement = null;
    redrawDrawingMeasurements();
    saveDrawingHistory();
    startPoint = null;
    return;
  }

  const endPoint =
    stabilizerBuffer.length > 0
      ? stabilizerBuffer[stabilizerBuffer.length - 1]
      : startPoint;

  // Pencil avec Shift : finaliser la ligne droite sur le canvas principal
  if (currentTool === "pencil" && keysState.shift && endPoint) {
    const lineOrigin = lastDrawnPoint || startPoint;
    if (lineOrigin) {
      drawingCtx.beginPath();
      drawingCtx.moveTo(lineOrigin.x, lineOrigin.y);
      drawingCtx.lineTo(endPoint.x, endPoint.y);
      drawingCtx.strokeStyle = annotationStyle.color;
      drawingCtx.lineWidth = annotationStyle.size;
      drawingCtx.lineCap = "round";
      drawingCtx.stroke();
      // Mettre à jour lastDrawnPoint pour une éventuelle continuation
      lastDrawnPoint = { ...endPoint };
    }
    // Effacer la prévisualisation
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  }

  // Eraser avec Shift : finaliser l'effacement en ligne droite
  if (currentTool === "eraser" && keysState.shift && endPoint) {
    const lineOrigin = lastDrawnPoint || startPoint;
    if (lineOrigin) {
      eraseLineBetweenPoints(lineOrigin, endPoint, drawingCtx, drawingCanvas);
      lastDrawnPoint = { ...endPoint };
    }
    // Effacer la prévisualisation
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  }

  // Laser avec Shift : finaliser la ligne droite laser
  if (currentTool === "laser" && keysState.shift && endPoint) {
    const lineOrigin = lastDrawnPoint || startPoint;
    if (lineOrigin) {
      addLaserLineBetweenPoints(lineOrigin, endPoint);
      lastDrawnPoint = { ...endPoint };
    }
    laserShiftPreview = null; // Effacer la preview
  }

  // Laser sans Shift : juste effacer la preview si elle existait
  if (currentTool === "laser" && !keysState.shift) {
    laserShiftPreview = null;
  }

  if (
    ["rectangle", "circle", "line", "arrow"].includes(currentTool) &&
    startPoint
  ) {
    // Dessiner la forme finale avec les contraintes
    drawFinalShapeConstrained(
      startPoint,
      endPoint,
      currentTool,
      keysState.shift,
      keysState.alt,
    );
    // Effacer la prévisualisation
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  } else if (currentTool === "measure" && startPoint && endPoint) {
    // Finaliser la mesure - utiliser shapeEndAtSpacePress si disponible (position avec lock de taille)
    const finalEnd = shapeEndAtSpacePress || endPoint;
    finalizeDrawingMeasurement(startPoint, finalEnd, false);
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  } else if (currentTool === "calibrate" && startPoint && endPoint) {
    // Finaliser la calibration - utiliser shapeEndAtSpacePress si disponible (position avec lock de taille)
    const finalEnd = shapeEndAtSpacePress || endPoint;
    finalizeDrawingCalibration(startPoint, finalEnd, false);
    if (drawingPreviewCtx && drawingPreview) {
      clearCanvas(drawingPreviewCtx, drawingPreview);
    }
  } else if (currentTool === "protractor") {
    // Compas : si on relâche pendant le drag du premier clic ET qu'on a bougé, finaliser
    if (
      compassDragging &&
      compassCenter &&
      lastMousePosition &&
      compassDragMoved
    ) {
      // Calculer le point final basé sur la dernière position de la souris
      finalizeCompass(compassCenter, lastMousePosition);
      // Réinitialiser l'état
      compassCenter = null;
      compassWaitingSecondClick = false;
      compassDragging = false;
      compassDragMoved = false;
      startPoint = null;
      isDrawing = false;
      // Effacer la prévisualisation
      if (drawingPreviewCtx && drawingPreview) {
        clearCanvas(drawingPreviewCtx, drawingPreview);
      }
      saveDrawingHistory();
      return;
    }
    // Si on est en attente du second clic (mode deux clics) ou pas de mouvement, rester en attente
    if (compassWaitingSecondClick) {
      compassDragging = false; // Le drag est terminé, on passe en mode deux clics
      compassDragMoved = false;
      isDrawing = true; // Garder l'état de dessin actif
      return;
    }
  }

  // Pencil : finaliser le dernier segment de courbe (midpoint → point final)
  if (currentTool === "pencil" && lastDrawnPoint && !keysState.shift) {
    drawingCtx.lineTo(lastDrawnPoint.x, lastDrawnPoint.y);
    drawingCtx.stroke();
  }

  // Cacher l'info de mesure
  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo) measureInfo.classList.add("hidden");

  // Nettoyer le canvas de preview (efface le repère de retard du stabilisateur)
  if (drawingPreviewCtx && drawingPreview) {
    clearCanvas(drawingPreviewCtx, drawingPreview);
  }

  // Sauvegarder l'état pour undo
  saveDrawingHistory();

  // Mettre à jour l'état des boutons (notamment le bouton clear)
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");

  // Réinitialiser les variables
  startPoint = null;
  originalStartPoint = null;
  lastDrawnPoint = null;
  wasShiftPressed = false;
  stabilizerBuffer = [];
  spacePressStartPos = null;
  shapeEndAtSpacePress = null;
  measureLockedLength = null; // Réinitialiser le lock de taille
}

/**
 * Gestion tactile
 */
function handleDrawingTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    handleDrawingMouseDown({
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
    });
  }
}

function handleDrawingTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    handleDrawingMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  }
}

function handleDrawingTouchEnd(e) {
  e.preventDefault();
  handleDrawingMouseUp({ clientX: 0, clientY: 0 });
}

/**
 * Dessine les subdivisions sur une ligne de calibration
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {number} subdivisions - Nombre de subdivisions (2=moitié, 3=tiers, 4=quarts)
 * @param {string} color - Couleur
 * @param {number} gradSize - Multiplicateur de taille
 * @param {number} baseLineWidth - Épaisseur de base du trait (optionnel)
 */
function drawCalibrateSubdivisions(
  ctx,
  start,
  end,
  subdivisions,
  color,
  gradSize = 1,
  baseLineWidth = 3,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = getDistance(start, end);

  if (distance < DRAWING_CONSTANTS.MIN_DISTANCE_RULER || subdivisions < 2) return;

  // Vecteur unitaire et perpendicuaire
  const ux = dx / distance;
  const uy = dy / distance;
  const perpX = -uy;
  const perpY = ux;

  // Taille des graduations (proportionnelle à l'épaisseur du trait)
  const lineWidthFactor = baseLineWidth / DRAWING_CONSTANTS.DEFAULT_MEASURE_LINE_WIDTH;
  const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_LARGE * gradSize * lineWidthFactor;
  const smallTickLength = DRAWING_CONSTANTS.TICK_LENGTH_SMALL * gradSize * lineWidthFactor;

  ctx.strokeStyle = color;
  ctx.lineCap = "round";

  // Dessiner les subdivisions
  for (let i = 1; i < subdivisions; i++) {
    const ratio = i / subdivisions;
    const posX = start.x + dx * ratio;
    const posY = start.y + dy * ratio;

    // Graduation plus grande pour le milieu (quand subdivisions est pair)
    const isMiddle = subdivisions % 2 === 0 && i === subdivisions / 2;
    const currentTickLength = isMiddle ? tickLength : smallTickLength;
    const currentLineWidth = (isMiddle ? 2.5 : 2) * gradSize * lineWidthFactor;

    ctx.lineWidth = currentLineWidth;
    ctx.beginPath();
    ctx.moveTo(
      posX - perpX * currentTickLength,
      posY - perpY * currentTickLength,
    );
    ctx.lineTo(
      posX + perpX * currentTickLength,
      posY + perpY * currentTickLength,
    );
    ctx.stroke();
  }
}

/**
 * Dessine des graduations sur une ligne de mesure (marques pour chaque unité)
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {number} unitPixels - Taille d'une unité en pixels
 * @param {string} color - Couleur
 * @param {number} gradSize - Multiplicateur de taille
 * @param {number} baseLineWidth - Épaisseur de base du trait (optionnel)
 */
function drawMeasureGraduations(
  ctx,
  start,
  end,
  unitPixels,
  color,
  gradSize = null,
  baseLineWidth = 3,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = getDistance(start, end);
  if (distance === 0) return;

  // Vecteur unitaire dans la direction de la ligne
  const ux = dx / distance;
  const uy = dy / distance;

  // Vecteur perpendiculaire
  const perpX = -uy;
  const perpY = ux;

  // Taille des graduations (applique le multiplicateur de config individuelle ou globale)
  const sizeMultiplier = gradSize ?? measureGraduationSize;
  const lineWidthFactor = baseLineWidth / DRAWING_CONSTANTS.DEFAULT_MEASURE_LINE_WIDTH;
  const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_MEDIUM * sizeMultiplier * lineWidthFactor;

  // Dessiner une graduation à chaque unité
  const numUnits = Math.floor(distance / unitPixels);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * sizeMultiplier * lineWidthFactor;
  ctx.lineCap = "round";

  for (let i = 1; i <= numUnits; i++) {
    // Position sur la ligne à i unités du début
    const posX = start.x + ux * unitPixels * i;
    const posY = start.y + uy * unitPixels * i;

    // Dessiner le trait perpendiculaire
    ctx.beginPath();
    ctx.moveTo(posX - perpX * tickLength, posY - perpY * tickLength);
    ctx.lineTo(posX + perpX * tickLength, posY + perpY * tickLength);
    ctx.stroke();
  }
}

/**
 * Dessine des marqueurs de proportions sur une ligne de mesure
 * Affiche : milieu, tiers, quarts selon la configuration
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {number} gradSize - Multiplicateur de taille
 * @param {Object} propConfig - Configuration des proportions
 * @param {number} baseLineWidth - Épaisseur de base du trait (optionnel)
 */
function drawMeasureProportions(
  ctx,
  start,
  end,
  gradSize = null,
  propConfig = null,
  baseLineWidth = 3,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = getDistance(start, end);

  // Ne pas dessiner si la ligne est trop courte
  if (distance < DRAWING_CONSTANTS.MIN_DISTANCE_PROPORTIONS) return;

  // Vecteur perpendiculaire normalisé
  const perpX = -dy / distance;
  const perpY = dx / distance;

  // Config individuelle ou globale
  const config = propConfig ?? measureProportionsConfig;

  // Construire la liste des proportions selon la configuration (avec couleurs personnalisées)
  const proportions = [];

  // Milieu (½)
  if (config.showCenter) {
    proportions.push({
      ratio: 0.5,
      tickLength: 14,
      lineWidth: 2.5,
      propColor: config.colorCenter,
      label: "½",
    });
  }

  // Tiers (⅓, ⅔)
  if (config.showThirds) {
    proportions.push({
      ratio: 1 / 3,
      tickLength: 10,
      lineWidth: 2,
      propColor: config.colorThirds,
      label: "⅓",
    });
    proportions.push({
      ratio: 2 / 3,
      tickLength: 10,
      lineWidth: 2,
      propColor: config.colorThirds,
      label: "⅔",
    });
  }

  // Quarts (¼, ¾) - exclure le milieu déjà affiché
  if (config.showQuarters) {
    proportions.push({
      ratio: 0.25,
      tickLength: 7,
      lineWidth: 1.5,
      propColor: config.colorQuarters,
      label: "¼",
    });
    proportions.push({
      ratio: 0.75,
      tickLength: 7,
      lineWidth: 1.5,
      propColor: config.colorQuarters,
      label: "¾",
    });
  }

  // Si aucune proportion n'est activée, ne rien dessiner
  if (proportions.length === 0) return;

  ctx.lineCap = "round";

  // Appliquer le multiplicateur de taille (individuel ou global)
  const sizeMultiplier = gradSize ?? measureGraduationSize;

  // Facteur basé sur l'épaisseur du trait (base = 3px)
  const lineWidthFactor = baseLineWidth / 3;

  proportions.forEach(({ ratio, tickLength, lineWidth, propColor, label }) => {
    const posX = start.x + dx * ratio;
    const posY = start.y + dy * ratio;

    // Appliquer le multiplicateur de taille ET le facteur d'épaisseur
    const scaledTickLength = tickLength * sizeMultiplier * lineWidthFactor;
    const scaledLineWidth = lineWidth * sizeMultiplier * lineWidthFactor;

    // Dessiner le trait
    ctx.strokeStyle = propColor;
    ctx.lineWidth = scaledLineWidth;
    ctx.beginPath();
    ctx.moveTo(
      posX - perpX * scaledTickLength,
      posY - perpY * scaledTickLength,
    );
    ctx.lineTo(
      posX + perpX * scaledTickLength,
      posY + perpY * scaledTickLength,
    );
    ctx.stroke();

    // Dessiner le label avec fond pour meilleure lisibilité (si activé)
    if (config.showLabels && distance > DRAWING_CONSTANTS.MIN_DISTANCE_LABELS) {
      const fontSize = Math.round(12 * sizeMultiplier);
      ctx.font = `bold ${fontSize}px sans-serif`;

      // Décaler le label beaucoup plus loin du trait pour éviter chevauchement
      const labelOffset = scaledTickLength + 15 + fontSize;
      const labelX = posX + perpX * labelOffset;
      const labelY = posY + perpY * labelOffset;

      // Fond semi-transparent pour le label
      const textMetrics = ctx.measureText(label);
      const padding = 4;
      const bgWidth = textMetrics.width + padding * 2;
      const bgHeight = fontSize + padding * 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(
        labelX - bgWidth / 2,
        labelY - bgHeight / 2,
        bgWidth,
        bgHeight,
      );

      // Texte
      ctx.fillStyle = propColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX, labelY);
    }
  });
}

// ================================================================
// HELPERS POUR redrawDrawingMeasurements() - Phase 6.2
// ================================================================

/**
 * Dessine une ligne de type compass
 */
function renderCompassLine(ctx, line, scaleFactor, hoverPoint, hoverThreshold) {
  const compassColor =
    line.config?.color ||
    (typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR
      : "#f59e0b");
  const defaultLineWidth =
    typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_LINE_WIDTH
      : 2;
  // Utiliser la config individuelle ou la valeur par défaut
  const compassLineWidth = line.config?.lineWidth ?? defaultLineWidth;
  const compassLabelSize = line.config?.labelSize ?? measureLabelSize;
  const compassGradSize = line.config?.graduationSize ?? measureGraduationSize;
  const compassShowLabel = line.config?.showLabel ?? true;
  const compassSubdivisions = line.config?.subdivisions || 0;

  // Segment principal
  drawSmoothLine(
    ctx,
    line.start,
    line.end,
    compassColor,
    compassLineWidth * scaleFactor,
    "butt",
  );

  // Déterminer borne survolée
  const scaledThreshold = hoverThreshold * scaleFactor;
  let hoveredEndpoint = null;
  if (hoverPoint) {
    const distStart = getDistance(hoverPoint, line.start);
    const distEnd = getDistance(hoverPoint, line.end);
    if (distStart < scaledThreshold) hoveredEndpoint = "start";
    else if (distEnd < scaledThreshold) hoveredEndpoint = "end";
  }

  // Bornes
  if (hoveredEndpoint === "start") {
    drawEndpoint(ctx, line.start.x, line.start.y, compassColor, scaleFactor);
  } else {
    drawEndpointTick(
      ctx,
      line.start,
      line.end,
      compassColor,
      compassLineWidth * scaleFactor * compassGradSize,
      scaleFactor,
    );
  }
  if (hoveredEndpoint === "end") {
    drawEndpoint(ctx, line.end.x, line.end.y, compassColor, scaleFactor);
  } else {
    drawEndpointTick(
      ctx,
      line.end,
      line.start,
      compassColor,
      compassLineWidth * scaleFactor * compassGradSize,
      scaleFactor,
    );
  }

  // Subdivisions
  if (compassSubdivisions >= 2) {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const len = getDistance(line.start, line.end);
    if (len === 0) return;
    const perpX = -dy / len;
    const perpY = dx / len;
    const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_SMALL * scaleFactor * compassGradSize;

    for (let i = 1; i < compassSubdivisions; i++) {
      const ratio = i / compassSubdivisions;
      const px = line.start.x + dx * ratio;
      const py = line.start.y + dy * ratio;

      ctx.strokeStyle = compassColor;
      ctx.lineWidth = compassLineWidth * scaleFactor * 0.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px - perpX * tickLength, py - perpY * tickLength);
      ctx.lineTo(px + perpX * tickLength, py + perpY * tickLength);
      ctx.stroke();
    }
  }

  // Label
  if (compassShowLabel) {
    renderCompassLabel(ctx, line, scaleFactor, compassColor, compassLabelSize);
  }
}

/**
 * Dessine un label de mesure/calibration/compass (logique commune)
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Object} line - Ligne avec start, end, labelOffset, _labelBounds
 * @param {number} scaleFactor - Facteur d'échelle
 * @param {string} labelText - Texte à afficher
 * @param {number} labelSize - Multiplicateur de taille du label
 */
function renderMeasurementLabel(ctx, line, scaleFactor, labelText, labelSize) {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const len = getDistance(line.start, line.end);
  if (len === 0) return;

  const perpX = -dy / len;
  const perpY = dx / len;

  const fontSize = Math.round(DRAWING_CONSTANTS.LABEL_FONT_SIZE * scaleFactor * labelSize);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const textMetrics = ctx.measureText(labelText);
  const padding = DRAWING_CONSTANTS.LABEL_PADDING * scaleFactor * labelSize;
  const boxWidth = textMetrics.width + padding * 2;
  const boxHeight = Math.round(DRAWING_CONSTANTS.LABEL_BOX_HEIGHT * scaleFactor * labelSize);

  const defaultOffset = DRAWING_CONSTANTS.LABEL_PERP_OFFSET * scaleFactor * Math.max(1, labelSize * 0.8);
  const midX = (line.start.x + line.end.x) / 2;
  const midY = (line.start.y + line.end.y) / 2;
  let labelX = midX + perpX * defaultOffset;
  let labelY = midY + perpY * defaultOffset;

  if (line.labelOffset) {
    labelX += line.labelOffset.x;
    labelY += line.labelOffset.y;
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(labelX - boxWidth / 2, labelY - boxHeight / 2, boxWidth, boxHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(labelText, labelX, labelY);

  line._labelBounds = {
    x: labelX - boxWidth / 2,
    y: labelY - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
  };
}

/**
 * Dessine le label d'un compass
 */
function renderCompassLabel(ctx, line, scaleFactor, color, labelSize) {
  const multiplier = line.config?.multiplier || line.multiplier || 1;
  const unitsLabel = typeof i18next !== "undefined" ? i18next.t("drawing.unit") : "u";
  renderMeasurementLabel(ctx, line, scaleFactor, `${multiplier}${unitsLabel}`, labelSize);
}

/**
 * Dessine une ligne de type measure ou calibrate
 */
function renderMeasureLine(ctx, line, scaleFactor, hoverPoint, hoverThreshold) {
  const color =
    line.type === "calibrate"
      ? (line.config?.color ?? "#10b981")
      : (line.config?.color ?? measureColor);
  const lineWidth =
    line.type === "calibrate"
      ? (line.config?.lineWidth ?? 3)
      : (line.config?.lineWidth ?? measureState.lineWidth);

  drawSmoothLine(ctx, line.start, line.end, color, lineWidth, "butt");

  // Subdivisions calibrate
  if (line.type === "calibrate") {
    const subdivisions = line.config?.subdivisions ?? 0;
    const gradSize = line.config?.graduationSize ?? measureGraduationSize;
    if (subdivisions > 0) {
      drawCalibrateSubdivisions(
        ctx,
        line.start,
        line.end,
        subdivisions,
        color,
        gradSize,
        lineWidth,
      );
    }
  }

  // Graduations measure
  if (line.type === "measure") {
    const gradType = line.config?.graduationType ?? measureGraduationType;
    const gradSize = line.config?.graduationSize ?? measureGraduationSize;
    if (gradType === "units" && calibrationUnit && calibrationUnit > 0) {
      drawMeasureGraduations(
        ctx,
        line.start,
        line.end,
        calibrationUnit,
        color,
        gradSize,
        lineWidth,
      );
    } else if (gradType === "proportions") {
      const propConfig =
        line.config?.proportionsConfig ?? measureProportionsConfig;
      drawMeasureProportions(
        ctx,
        line.start,
        line.end,
        gradSize,
        propConfig,
        lineWidth,
      );
    }
  }

  // Bornes
  const scaledThreshold = hoverThreshold * scaleFactor;
  let hoveredEndpoint = null;
  if (hoverPoint) {
    const distStart = getDistance(hoverPoint, line.start);
    const distEnd = getDistance(hoverPoint, line.end);
    if (distStart < scaledThreshold) hoveredEndpoint = "start";
    else if (distEnd < scaledThreshold) hoveredEndpoint = "end";
  }

  if (hoveredEndpoint === "start") {
    drawEndpoint(ctx, line.start.x, line.start.y, color, scaleFactor);
  } else {
    drawEndpointTick(ctx, line.start, line.end, color, lineWidth, scaleFactor);
  }

  if (hoveredEndpoint === "end") {
    drawEndpoint(ctx, line.end.x, line.end.y, color, scaleFactor);
  } else {
    drawEndpointTick(ctx, line.end, line.start, color, lineWidth, scaleFactor);
  }

  // Label measure
  const lineShowLabels = line.config?.showSizeLabels ?? showMeasureSizeLabels;
  if (line.type === "measure" && lineShowLabels) {
    renderMeasureLabel(ctx, line, scaleFactor, color);
  }

  // Label calibrate
  const calibShowLabel =
    line.config?.showLabel !== false && showMeasureSizeLabels;
  if (line.type === "calibrate" && calibShowLabel) {
    renderCalibrateLabel(ctx, line, scaleFactor);
  }
}

/**
 * Dessine le label d'une mesure
 */
function renderMeasureLabel(ctx, line, scaleFactor, color) {
  const distance = getDistance(line.start, line.end);
  if (distance === 0) return;
  const labelText = calibrationUnit
    ? `${(distance / calibrationUnit).toFixed(2)}u`
    : `${Math.round(distance)}px`;
  const labelSize = line.config?.labelSize ?? measureLabelSize;
  renderMeasurementLabel(ctx, line, scaleFactor, labelText, labelSize);
}

/**
 * Dessine le label d'une calibration (1u)
 */
function renderCalibrateLabel(ctx, line, scaleFactor) {
  const unitsLabel = typeof i18next !== "undefined" ? i18next.t("drawing.unit") : "u";
  const labelSize = line.config?.labelSize ?? measureLabelSize;
  renderMeasurementLabel(ctx, line, scaleFactor, `1${unitsLabel}`, labelSize);
}

/**
 * Redessine toutes les mesures sur le canvas du mode overlay
 * Utilise les helpers Phase 6.2 pour le rendu par type
 */
function redrawDrawingMeasurements(hoverPoint = null, hoverThreshold = 15) {
  if (!drawingMeasuresCtx || !drawingMeasures) return;

  const scaleFactor = getMeasureScaleFactor(drawingMeasures);

  clearCanvas(drawingMeasuresCtx, drawingMeasures);

  if (!measurementsVisible || measurementLines.length === 0) return;

  measurementLines.forEach((line) => {
    if (!line || !line.start || !line.end) return;

    // Ignorer la ligne calibrate si showCalibrateLine est false
    if (line.type === "calibrate" && !measureState.showCalibrateLine) return;

    // Ancien type protractor (cercle) - compatibilité
    if (line.type === "protractor") {
      drawSmoothCircle(
        drawingMeasuresCtx,
        line.start.x,
        line.start.y,
        line.radius,
        "#f59e0b",
        2 * scaleFactor,
        "rgba(245, 158, 11, 0.1)",
      );
      drawEndpoint(
        drawingMeasuresCtx,
        line.start.x,
        line.start.y,
        "#f59e0b",
        scaleFactor,
      );
      return;
    }

    // Compass
    if (line.type === "compass") {
      renderCompassLine(
        drawingMeasuresCtx,
        line,
        scaleFactor,
        hoverPoint,
        hoverThreshold,
      );
      return;
    }

    // Measure ou Calibrate
    renderMeasureLine(
      drawingMeasuresCtx,
      line,
      scaleFactor,
      hoverPoint,
      hoverThreshold,
    );
  });

  updateDrawingTotalDistance();
}

/**
 * Dessine la prévisualisation d'une mesure
 * @param {Object} start - Point de départ
 * @param {Object} end - Point de fin
 * @param {string} tool - Outil actuel (measure/calibrate)
 * @param {Object} options - Options : isShift (contrainte H/V), lockedLength (longueur verrouillée)
 */
function drawMeasurePreview(start, end, tool, { isShift = false, lockedLength = null } = {}) {
  if (!drawingPreviewCtx || !drawingPreview) return;

  clearCanvas(drawingPreviewCtx, drawingPreview);

  // Appliquer la contrainte Shift (horizontal/vertical) si demandé
  const drawEnd = isShift ? applyLineConstraint(start, end) : { ...end };

  const color =
    tool === "calibrate"
      ? "#10b981"
      : tool === "measure"
        ? measureColor
        : annotationStyle.color;

  // Ligne avec bornes
  drawLineWithEndpoints(drawingPreviewCtx, start, drawEnd, color, 2, true);

  // Dessiner les graduations selon la configuration
  if (tool === "measure") {
    if (
      measureGraduationType === "units" &&
      calibrationUnit &&
      calibrationUnit > 0
    ) {
      drawMeasureGraduations(
        drawingPreviewCtx,
        start,
        drawEnd,
        calibrationUnit,
        color,
      );
    } else if (measureGraduationType === "proportions") {
      drawMeasureProportions(drawingPreviewCtx, start, drawEnd);
    }
  }

  // Afficher la distance
  const distance = getDistance(start, drawEnd);

  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo && drawingCanvas) {
    measureInfo.classList.remove("hidden");
    measureInfo.style.left = (drawEnd.x / drawingCanvas.width) * 100 + "%";
    measureInfo.style.top = (drawEnd.y / drawingCanvas.height) * 100 - 5 + "%";

    const text = (tool === "measure" && calibrationUnit)
      ? `${(distance / calibrationUnit).toFixed(2)}u`
      : `${Math.round(distance)}px`;

    if (lockedLength !== null) {
      const lockIcon =
        '<svg xmlns="http://www.w3.org/2000/svg" height="12px" viewBox="0 -960 960 960" width="12px" fill="currentColor" style="vertical-align: middle; margin-left: 2px;"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>';
      measureInfo.innerHTML = `${text}${lockIcon}`;
    } else {
      measureInfo.textContent = text;
    }
  }
}

/**
 * Dessine la prévisualisation du compas (outil protractor)
 * Affiche un cercle de rayon = unité calibrée centré sur le point,
 * et un segment montrant l'orientation choisie par la souris
 */
function drawCompassPreview(center, mousePos) {
  if (!drawingPreviewCtx || !drawingPreview || !calibrationUnit) return;

  clearCanvas(drawingPreviewCtx, drawingPreview);

  const radius = calibrationUnit * protractorMultiplier;

  // Récupérer les constantes de configuration
  const compassColor =
    typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_COLOR
      : "#f59e0b";
  const previewFillOpacity =
    typeof DRAWING_CONSTANTS !== "undefined"
      ? DRAWING_CONSTANTS.DEFAULT_COMPASS_PREVIEW_FILL_OPACITY
      : 0.05;

  // Calculer l'angle entre le centre et la position de la souris
  const angle = Math.atan2(mousePos.y - center.y, mousePos.x - center.x);

  // Calculer le point final du segment sur le cercle
  const endPoint = {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };

  // Dessiner le fond du cercle avec légère opacité
  drawingPreviewCtx.beginPath();
  drawingPreviewCtx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  drawingPreviewCtx.fillStyle = `rgba(245, 158, 11, ${previewFillOpacity})`;
  drawingPreviewCtx.fill();

  // Dessiner le contour du cercle (en pointillés pour indiquer que c'est une preview)
  drawingPreviewCtx.beginPath();
  drawingPreviewCtx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  drawingPreviewCtx.strokeStyle = "rgba(245, 158, 11, 0.4)";
  drawingPreviewCtx.lineWidth = 1;
  drawingPreviewCtx.setLineDash([5, 5]);
  drawingPreviewCtx.stroke();
  drawingPreviewCtx.setLineDash([]);

  // Dessiner le segment du compas (ligne du centre vers le point sur le cercle)
  drawingPreviewCtx.beginPath();
  drawingPreviewCtx.moveTo(center.x, center.y);
  drawingPreviewCtx.lineTo(endPoint.x, endPoint.y);
  drawingPreviewCtx.strokeStyle = compassColor;
  drawingPreviewCtx.lineWidth = 2;
  drawingPreviewCtx.stroke();

  // Dessiner les bornes (centre et extrémité)
  drawEndpoint(drawingPreviewCtx, center.x, center.y, compassColor);
  drawEndpoint(drawingPreviewCtx, endPoint.x, endPoint.y, compassColor);

  // Afficher l'info de distance
  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo) {
    measureInfo.classList.remove("hidden");
    const unitsLabel =
      i18next.t("drawing.units");
    measureInfo.textContent = `${Math.round(radius)}px (${protractorMultiplier} ${unitsLabel})`;
  }
}

/**
 * Finalise le compas : crée une mesure-compas (segment de longueur = unité calibrée)
 */
function finalizeCompass(center, mousePos) {
  if (!calibrationUnit || calibrationUnit <= 0) {
    showDrawingToast(
      i18next.t("drawing.calibrationRequired"),
      "warning",
    );
    return;
  }

  const radius = calibrationUnit * protractorMultiplier;

  // Calculer l'angle entre le centre et la position de la souris
  const angle = Math.atan2(mousePos.y - center.y, mousePos.x - center.x);

  // Calculer le point final du segment sur le cercle
  const endPoint = {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };

  // Créer une mesure de type "compass" (similaire à measure mais avec le radius stocké)
  measurementLines.push({
    id: Date.now(),
    start: { ...center },
    end: endPoint,
    type: "compass",
    radius: radius,
    multiplier: protractorMultiplier,
  });

  redrawDrawingMeasurements();

  // Cacher l'info de mesure
  const measureInfo = drawingDOM.measureInfo || document.getElementById("drawing-measure-info");
  if (measureInfo) measureInfo.classList.add("hidden");
}

/**
 * Finalise une mesure de distance (mode overlay)
 */
function finalizeDrawingMeasurement(start, end, isShift = false) {
  // Appliquer la contrainte Shift (horizontal/vertical)
  const finalEnd = isShift ? applyLineConstraint(start, end) : { ...end };

  measurementLines.push({
    id: Date.now(),
    start: { ...start },
    end: finalEnd,
    type: "measure",
    color: measureState.color,
    lineWidth: measureState.lineWidth,
  });

  redrawDrawingMeasurements();
  updateDrawingTotalDistance();
  // Mettre à jour les boutons pour les deux contextes
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");
}

/**
 * Finalise la calibration (mode overlay)
 */
function finalizeDrawingCalibration(start, end, isShift = false) {
  // Appliquer la contrainte Shift (horizontal/vertical)
  const finalEnd = isShift ? applyLineConstraint(start, end) : { ...end };
  const distance = getDistance(start, finalEnd);

  // Supprimer l'ancienne calibration
  measurementLines = measurementLines.filter(
    (line) => line.type !== "calibrate",
  );

  calibrationUnit = distance;

  // Rendre le segment visible par défaut lors de la création
  measureState.showCalibrateLine = true;

  measurementLines.push({
    id: Date.now(),
    start: { ...start },
    end: finalEnd,
    type: "calibrate",
  });

  // Mettre à jour la taille de toutes les mesures compass existantes
  resizeCompassLines(distance);

  redrawDrawingMeasurements();

  // Mettre à jour l'affichage de l'info d'unité (respecte showUnitInfo)
  updateDrawingUnitInfo();

  // Mettre à jour les boutons pour les deux contextes
  updateDrawingButtonStates("main");
  updateDrawingButtonStates("zoom");
}

/**
 * Met à jour l'affichage des infos d'unité (mode overlay)
 */
function updateDrawingUnitInfo() {
  const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");
  const unitValue = drawingDOM.unitValue || document.getElementById("drawing-unit-value");
  if (!unitInfo || !unitValue) return;

  if (calibrationUnit && calibrationUnit > 0) {
    unitInfo.classList.remove("hidden");
    unitValue.textContent = `${Math.round(calibrationUnit)}px`;
  } else {
    unitInfo.classList.add("hidden");
  }
}

/**
 * Supprime toutes les lignes de calibration et de compas
 */
function removeCalibrateAndCompass() {
  measurementLines = measurementLines.filter(
    (line) => line.type !== "calibrate" && line.type !== "compass",
  );
}

/**
 * Redimensionne toutes les lignes compas à la longueur donnée
 * Conserve l'origine et la direction de chaque ligne
 * @param {number} newLength - Nouvelle longueur en pixels
 */
function resizeCompassLines(newLength) {
  if (newLength <= 0) return;
  measurementLines.forEach((line) => {
    if (line.type === "compass") {
      const dx = line.end.x - line.start.x;
      const dy = line.end.y - line.start.y;
      const currentLength = getDistance(line.start, line.end);
      if (currentLength > 0) {
        const normalizedDx = dx / currentLength;
        const normalizedDy = dy / currentLength;
        line.end = {
          x: line.start.x + normalizedDx * newLength,
          y: line.start.y + normalizedDy * newLength,
        };
      }
    }
  });
}

/**
 * Met à jour le total des distances (mode overlay)
 */
function updateDrawingTotalDistance() {
  const totalDistance = drawingDOM.totalDistanceInfo || document.getElementById("drawing-total-distance-info");
  const totalValue = drawingDOM.totalDistanceValue || document.getElementById("drawing-total-distance-value");
  if (!totalDistance || !totalValue) return;

  const measureLines = measurementLines.filter(
    (line) => line.type === "measure",
  );
  if (measureLines.length === 0) {
    totalDistance.classList.add("hidden");
    return;
  }

  let total = 0;
  measureLines.forEach((line) => {
    const dist = Math.sqrt(
      Math.pow(line.end.x - line.start.x, 2) +
        Math.pow(line.end.y - line.start.y, 2),
    );
    total += dist;
  });

  totalDistance.classList.remove("hidden");
  if (calibrationUnit && calibrationUnit > 0) {
    const units = (total / calibrationUnit).toFixed(2);
    const unitsLabel =
      i18next.t("drawing.units");
    totalValue.textContent = `${Math.round(total)}px (${i18next.t("draw.toasts.ie")} ${units} ${unitsLabel})`;
  } else {
    totalValue.textContent = `${Math.round(total)}px`;
  }
}

/**
 * Met à jour l'état des boutons selon le contexte (main ou zoom)
 * @param {string} context - "main" pour drawing-toolbar, "zoom" pour zoom-drawing-toolbar
 */
function updateDrawingButtonStates(context = "main") {
  const isMain = context === "main";

  // Sélecteurs selon le contexte
  const protractorSelector = isMain
    ? '#drawing-toolbar .annotation-tool[data-tool="protractor"]'
    : '#zoom-drawing-toolbar [data-tool="protractor"]';
  const clearMeasurementsSelector = isMain
    ? '#drawing-toolbar .annotation-tool[data-tool="clear-measurements"]'
    : '#zoom-drawing-toolbar [data-tool="clear-measurements"]';
  const clearSelector = isMain
    ? '#drawing-toolbar .annotation-tool[data-tool="clear"]'
    : '#zoom-drawing-toolbar [data-tool="clear"]';
  const unitInfo = drawingDOM.unitInfo || document.getElementById("drawing-unit-info");

  // État
  const hasValidCalibration = calibrationUnit && calibrationUnit > 0;
  const hasMeasurements = measurementLines.length > 0;
  const hasDrawingContent = !isCanvasBlank(drawingCanvas);

  // Protractor : nécessite une calibration valide (> 0px)
  const protractorBtn = document.querySelector(protractorSelector);
  if (protractorBtn) {
    protractorBtn.classList.toggle("disabled", !hasValidCalibration);
    protractorBtn.style.opacity = hasValidCalibration ? "1" : "0.3";
    protractorBtn.style.pointerEvents = hasValidCalibration ? "auto" : "none";
  }

  // Clear-measurements : nécessite au moins une mesure
  const clearMeasurementsBtn = document.querySelector(
    clearMeasurementsSelector,
  );
  if (clearMeasurementsBtn) {
    clearMeasurementsBtn.classList.toggle("disabled", !hasMeasurements);
    clearMeasurementsBtn.style.opacity = hasMeasurements ? "1" : "0.3";
    clearMeasurementsBtn.style.pointerEvents = hasMeasurements
      ? "auto"
      : "none";
  }

  // Clear : nécessite du contenu dessin (pas les mesures, elles ont leur propre bouton)
  const clearBtn = document.querySelector(clearSelector);
  if (clearBtn) {
    clearBtn.classList.toggle("disabled", !hasDrawingContent);
    clearBtn.style.opacity = hasDrawingContent ? "1" : "0.3";
    clearBtn.style.pointerEvents = hasDrawingContent ? "auto" : "none";
  }

  // Masquer unit-info si calibration invalide (0px) - uniquement pour le contexte main
  if (isMain && unitInfo && !hasValidCalibration) {
    unitInfo.classList.add("hidden");
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

/**
 * Efface le canvas de dessin
 */
function clearDrawingCanvas() {
  if (drawingCtx && drawingCanvas) {
    clearCanvas(drawingCtx, drawingCanvas);
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
    clearCanvas(drawingMeasuresCtx, drawingMeasures);
    measurementLines = [];
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

  drawingHistory.push(drawingCanvas.toDataURL());
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
  const state = drawingHistory[drawingHistoryIndex];

  const img = new Image();
  img.onload = () => {
    clearCanvas(drawingCtx, drawingCanvas);
    drawingCtx.drawImage(img, 0, 0);
    // Mettre à jour l'état des boutons après undo
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  };
  img.src = state;
}

/**
 * Refait la dernière action annulée
 */
function redoDrawing() {
  if (drawingHistoryIndex >= drawingHistory.length - 1) return;

  drawingHistoryIndex++;
  const state = drawingHistory[drawingHistoryIndex];

  const img = new Image();
  img.onload = () => {
    clearCanvas(drawingCtx, drawingCanvas);
    drawingCtx.drawImage(img, 0, 0);
    // Mettre à jour l'état des boutons après redo
    updateDrawingButtonStates("main");
    updateDrawingButtonStates("zoom");
  };
  img.src = state;
}

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
 * Affiche le menu de la table lumineuse pour le mode overlay
 */
function showLightboxMenu(x, y, context = "drawing") {
  const menu = createContextMenu("lightbox-menu", x, y);
  addMenuTitle(menu, i18next.t("draw.menus.lightbox"), ICONS.LIGHT_TABLE_ON);

  // Détermine les fonctions selon le contexte
  const updateLightbox =
    context === "zoom" ? updateZoomDrawingLightbox : updateDrawingLightbox;

  // Fonction pour mettre à jour l'icône et l'état du bouton
  const updateLightboxButton = () => {
    if (context === "drawing") {
      updateDrawingLightboxIcon();
      const btn = document.getElementById("drawing-lightbox-btn");
      if (btn) btn.classList.toggle("active", lightboxEnabled);
    } else {
      // Pour le mode zoom, trouver le bouton dans la toolbar
      const zoomToolbar = document.getElementById("zoom-drawing-toolbar");
      if (zoomToolbar) {
        const btns = zoomToolbar.querySelectorAll(".control-btn-small");
        btns.forEach((btn) => {
          if (
            btn.innerHTML.includes("lightTable") ||
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
  };

  addMenuToggleOption(menu, {
    id: "lightbox-enable-cb",
    label: i18next.t("draw.menus.enable"),
    checked: lightboxEnabled,
    onChange: (checked) => {
      lightboxEnabled = checked;
      updateLightbox();
      updateLightboxButton();
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
        <h3 class="modal-title">${ICONS.EXPORT} Exporter le dessin</h3>
        <button type="button" class="modal-close-btn" id="cancel-export">×</button>
      </div>
      <div id="export-instructions" class="export-instructions"> Qu'est-ce qu'on exporte ?</div>
      <div class="export-options-list">
        <button class="export-option" data-mode="full">
          <span class="export-option-title">Dessin et photo fusionnées</span>
        </button>

        <button class="export-option" data-mode="transparent">
          <span class="export-option-title">Dessin sur fond transparent</span>
        </button>

        <button class="export-option" data-mode="white">
          <span class="export-option-title">Dessin sur fond blanc</span>
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
      '<span class="toolbar-dock-zone-label">Dock horizontal</span>';
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
    clearAllDrawingCanvases();
    drawingHistory = [];
    drawingHistoryIndex = -1;
    measurementLines = [];
    // Mettre à jour l'état des boutons après suppression
    updateDrawingButtonStates("zoom");
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

  zoomDrawingPreview.onmousedown = (e) => {
    // Clic molette = pan
    if (e.button === 1) {
      handleCanvasPanStart(e);
      return;
    }
    // Space + clic gauche = pan (seulement si pas en train de dessiner)
    if (e.button === 0 && keysState.space && !isDrawing) {
      handleSpacePanStart(e);
      return;
    }
    handleDrawingMouseDown(e);
  };
  zoomDrawingPreview.onmousemove = (e) => {
    if (ZoomManager.isPanning) {
      handleCanvasPanMove(e);
      return;
    }
    handleDrawingMouseMove(e);
  };
  zoomDrawingPreview.onmouseup = (e) => {
    if (ZoomManager.isPanning && (e.button === 1 || (e.button === 0 && keysState.space))) {
      handleCanvasPanEnd();
      return;
    }
    handleDrawingMouseUp(e);
  };
  zoomDrawingPreview.onmouseleave = (e) => {
    handleDrawingMouseLeave(
      e,
      zoomDrawingPreview,
      zoomDrawingCanvas,
      zoomDrawingCtx,
    );
  };
  zoomDrawingPreview.onmouseenter = (e) => {
    // Réinitialiser l'état quand on rentre dans le canvas pendant le dessin
    resetDrawingStateOnEnter();
  };
  // Zoom avec la molette (si activé dans la config)
  if (CONFIG.enableZoomInDrawingMode) {
    zoomDrawingPreview.addEventListener('wheel', handleCanvasZoom);
  }
  zoomDrawingPreview.oncontextmenu = (e) => {
    e.preventDefault();
    const coords = getDrawingCoordinates(e);
    const hitLine = findMeasurementLineAt(coords, 20);
    if (hitLine) {
      // Modal différent selon le type de mesure
      if (hitLine.type === "compass") {
        showCompassIndividualConfig(hitLine, e.clientX, e.clientY);
      } else if (hitLine.type === "calibrate") {
        showCalibrateIndividualConfig(hitLine, e.clientX, e.clientY);
      } else {
        showMeasureIndividualConfig(hitLine, e.clientX, e.clientY);
      }
    } else {
      // Menu contextuel général du canvas
      showCanvasContextMenu(e.clientX, e.clientY, "zoom");
    }
  };

  // Gestion du curseur : quitter la zone de dessin = curseur normal
  // mouseleave et mouseenter sont déjà définis plus haut (lignes ~7779 et ~7801)
  // Le mouseenter gère à la fois la réinitialisation de l'état et le curseur

  // Détecter quand la souris quitte complètement l'overlay pour cacher le curseur
  // Utiliser mouseout sur l'overlay qui se propage depuis le canvas
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

  // Delete/Backspace pour effacer tous les canvas
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    clearAllDrawingCanvases();
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

// Multiplicateur pour le rapporteur (rayon = calibrationUnit * multiplier)
let protractorMultiplier = 1;

/**
 * Calcule un point stabilisé avec l'algorithme "Pulling String" (corde élastique)
 *
 * Le trait suit la souris avec un retard proportionnel au lissage :
 * - Plus le lissage est élevé (0-100%), plus la "corde" est longue (0-50 pixels de retard)
 * - Le trait ne bouge que quand la souris s'éloigne suffisamment du dernier point dessiné
 * - Résultat : courbes beaucoup plus lisses et naturelles
 *
 * @param {Object} rawPoint - Le point brut de la souris {x, y}
 * @param {Object} lastPoint - Le dernier point dessiné {x, y}
 * @returns {Object|null} Le point stabilisé {x, y}, ou null si la souris n'a pas assez bougé
 */
function calculateStabilizedPoint(rawPoint, lastPoint) {
  if (!lastPoint) return rawPoint;

  // Calcul de la distance entre le dernier point dessiné et la position brute
  const dx = rawPoint.x - lastPoint.x;
  const dy = rawPoint.y - lastPoint.y;
  const distance = getDistance(lastPoint, rawPoint);

  // La "longueur de corde" dépend de la force du stabilisateur
  // Force 0 = corde de 0 (réponse instantanée)
  // Force 1 = corde longue (beaucoup de retard/lissage)
  const stringLength = stabilizerStrength * DRAWING_CONSTANTS.STABILIZER_MAX_RETARD;

  if (distance <= stringLength) {
    // La souris n'a pas assez bougé, on ne dessine pas encore
    return null;
  }

  // Calculer le point sur la ligne entre lastPoint et rawPoint
  // à une distance de stringLength depuis rawPoint
  const ratio = (distance - stringLength) / distance;

  // Interpolation
  const smoothedX = lastPoint.x + dx * ratio;
  const smoothedY = lastPoint.y + dy * ratio;

  return { x: smoothedX, y: smoothedY };
}

/**
 * Version simple pour le laser (moyenne pondérée seulement)
 */
function calculateLaserStabilizedPoint() {
  if (stabilizerBuffer.length === 0) return { x: 0, y: 0 };
  if (stabilizerBuffer.length === 1) return stabilizerBuffer[0];

  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;

  // Pondération : les points récents ont plus de poids
  stabilizerBuffer.forEach((point, index) => {
    const weight = index + 1; // Linéaire simple
    sumX += point.x * weight;
    sumY += point.y * weight;
    totalWeight += weight;
  });

  return {
    x: sumX / totalWeight,
    y: sumY / totalWeight,
  };
}

/**
 * Affiche le menu de configuration du stabilisateur
 */
/**
 * Ajoute les contrôles du stabilisateur à un menu (factorisé)
 * @param {HTMLElement} menu - Le menu contextuel
 * @param {boolean} showTitle - Afficher le titre de section
 */
function addStabilizerControls(menu, showTitle = true) {
  if (showTitle) {
    addMenuTitle(menu, i18next.t("draw.menus.stabilizer"), ICONS.GESTURE);
  }

  // Toggle lissage (moyenne pondérée)
  addMenuToggleOption(menu, {
    id: "stabilizer-enable-" + Date.now(),
    label: i18next.t("draw.menus.enable"),
    checked: stabilizerEnabled,
    onChange: (checked) => {
      stabilizerEnabled = checked;
    },
  });

  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.smoothing"),
    min: 0,
    max: 100,
    value: Math.round(stabilizerStrength * 100),
    unit: "%",
    onChange: (value) => {
      stabilizerStrength = value / 100;
    },
  });
}

/**
 * Ajoute les contrôles de la table lumineuse à un menu (factorisé)
 * @param {HTMLElement} menu - Le menu contextuel
 * @param {string} context - "drawing" ou "zoom"
 * @param {boolean} showTitle - Afficher le titre de section
 */
function addLightboxControls(menu, context = "drawing", showTitle = true) {
  if (showTitle) {
    addMenuTitle(menu, i18next.t("draw.menus.lightbox"), ICONS.LIGHT_TABLE_ON);
  }

  const updateLightbox =
    context === "zoom" ? updateZoomDrawingLightbox : updateDrawingLightbox;

  const updateLightboxButton = () => {
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
  };

  addMenuToggleOption(menu, {
    id: "lightbox-enable-" + Date.now(),
    label: i18next.t("draw.menus.enable"),
    checked: lightboxEnabled,
    onChange: (checked) => {
      lightboxEnabled = checked;
      updateLightbox();
      updateLightboxButton();
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
}

/**
 * Affiche le menu contextuel principal du canvas de dessin
 */
function showCanvasContextMenu(x, y, context = "drawing") {
  // Fermer si déjà ouvert
  const existing = document.getElementById("canvas-context-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const menu = createContextMenu("canvas-context-menu", x, y);

  // Section Taille du pinceau
  addMenuTitle(menu, i18next.t("draw.menus.brushSize"), ICONS.PENCIL);
  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.size"),
    min: 1,
    max: 50,
    value: annotationStyle.size,
    unit: " px",
    onChange: (value) => {
      annotationStyle.size = value;
      // Mettre à jour l'input dans la toolbar si présent
      const sizeInput = document.getElementById("brush-size-input");
      if (sizeInput) sizeInput.value = value;
      // Mettre à jour le curseur
      updateDrawingCursor();
    },
  });

  // Séparateur
  const separator1 = document.createElement("div");
  separator1.className = "context-menu-separator";
  menu.appendChild(separator1);

  // Section Stabilisateur
  addStabilizerControls(menu, true);

  // Séparateur
  const separator2 = document.createElement("div");
  separator2.className = "context-menu-separator";
  menu.appendChild(separator2);

  // Section Table lumineuse
  addLightboxControls(menu, context, true);

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}

function showStabilizerMenu(x, y) {
  // Fermer si déjà ouvert
  const existing = document.getElementById("stabilizer-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const menu = createContextMenu("stabilizer-menu", x, y);
  addMenuTitle(menu, i18next.t("draw.menus.strokeStabilizer"), ICONS.GESTURE);

  addMenuToggleOption(menu, {
    id: "stabilizer-enable",
    label: i18next.t("draw.menus.enableStabilizer"),
    checked: stabilizerEnabled,
    onChange: (checked) => {
      stabilizerEnabled = checked;
    },
  });

  addMenuSlider(menu, {
    label: i18next.t("draw.sliders.smoothing"),
    min: 0,
    max: 100,
    value: Math.round(stabilizerStrength * 100),
    unit: "%",
    onChange: (value) => {
      stabilizerStrength = value / 100;
    },
  });

  document.body.appendChild(menu);
  setupMenuCloseOnClickOutside(menu);
}

/**
 * Trouve une borne de mesure à une position donnée
 */
function findEndpointAt(
  coords,
  threshold = DRAWING_CONSTANTS.ENDPOINT_THRESHOLD,
) {
  for (const line of measurementLines) {
    if (!line || !line.start || !line.end) continue;

    if (getDistance(coords, line.start) < threshold) {
      return { line, endpoint: "start" };
    }
    if (getDistance(coords, line.end) < threshold) {
      return { line, endpoint: "end" };
    }
  }
  return null;
}

/**
 * Trouve un label de mesure à une position donnée (measure, compass ou calibrate)
 */
function findLabelAt(coords) {
  for (const line of measurementLines) {
    if (!line || !line._labelBounds) continue;
    // Accepter les types measure, compass et calibrate
    if (
      line.type !== "measure" &&
      line.type !== "compass" &&
      line.type !== "calibrate"
    )
      continue;

    const bounds = line._labelBounds;
    if (
      coords.x >= bounds.x &&
      coords.x <= bounds.x + bounds.width &&
      coords.y >= bounds.y &&
      coords.y <= bounds.y + bounds.height
    ) {
      return line;
    }
  }
  return null;
}

/**
 * Trouve une ligne de mesure à une position donnée
 */
function findMeasurementLineAt(
  coords,
  threshold = DRAWING_CONSTANTS.HIT_THRESHOLD,
) {
  for (const line of measurementLines) {
    if (!line || !line.start || !line.end) continue;

    const dist = getPointToSegmentDistance(coords, line.start, line.end);
    if (dist < threshold) return line;
  }
  return null;
}

/**
 * Calcule le facteur d'échelle pour les éléments visuels des mesures
 */
function getMeasureScaleFactor(canvas) {
  if (!canvas) return 1;
  // Ratio entre la taille interne du canvas et sa taille d'affichage
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return 1;
  return canvas.width / rect.width;
}

/**
 * Dessine une ligne lissée
 */
function drawSmoothLine(ctx, start, end, color, lineWidth, lineCap = "round") {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = lineCap;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

/**
 * Dessine un cercle lissé avec remplissage optionnel
 */
function drawSmoothCircle(
  ctx,
  x,
  y,
  radius,
  strokeColor,
  lineWidth,
  fillColor = null,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Dessine un point de terminaison (borne) de mesure
 */
function drawEndpoint(ctx, x, y, color, scaleFactor = 1) {
  const radius = DRAWING_CONSTANTS.ENDPOINT_RADIUS * scaleFactor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();
}

/**
 * Dessine un trait perpendiculaire à l'extrémité d'une mesure
 */
function drawEndpointTick(
  ctx,
  point,
  otherPoint,
  color,
  lineWidth,
  scaleFactor = 1,
) {
  const dx = otherPoint.x - point.x;
  const dy = otherPoint.y - point.y;
  const len = getDistance(point, otherPoint);
  if (len === 0) return;

  // Vecteur perpendiculaire normalisé
  const perpX = -dy / len;
  const perpY = dx / len;

  const tickLength = DRAWING_CONSTANTS.TICK_LENGTH_LARGE * scaleFactor;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(point.x - perpX * tickLength, point.y - perpY * tickLength);
  ctx.lineTo(point.x + perpX * tickLength, point.y + perpY * tickLength);
  ctx.stroke();
}

/**
 * Dessine une ligne avec des bornes aux extrémités
 */
function drawLineWithEndpoints(
  ctx,
  start,
  end,
  color,
  lineWidth,
  showEndpoints = true,
) {
  // Ligne principale
  drawSmoothLine(ctx, start, end, color, lineWidth);

  // Bornes perpendiculaires
  if (showEndpoints) {
    drawEndpointTick(ctx, start, end, color, lineWidth);
    drawEndpointTick(ctx, end, start, color, lineWidth);
  }
}

/**
 * Crée un menu contextuel avec contrainte à l'écran
 */
function createContextMenu(id, x, y) {
  const menu = document.createElement("div");
  menu.id = id;
  menu.className = "context-menu";
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.style.visibility = "hidden"; // Cacher temporairement pour mesurer

  // Observer le rendu pour contraindre la position
  requestAnimationFrame(() => {
    constrainMenuToScreen(menu);
    menu.style.visibility = "visible";
  });

  return menu;
}

/**
 * Contraint un menu contextuel à rester visible à l'écran
 */
function constrainMenuToScreen(menu) {
  const rect = menu.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8; // Marge par rapport aux bords

  let newLeft = parseInt(menu.style.left) || 0;
  let newTop = parseInt(menu.style.top) || 0;

  // Contraindre horizontalement
  if (rect.right > viewportWidth - margin) {
    newLeft = viewportWidth - rect.width - margin;
  }
  if (newLeft < margin) {
    newLeft = margin;
  }

  // Contraindre verticalement (priorité au bas de l'écran)
  if (rect.bottom > viewportHeight - margin) {
    // Si le menu dépasse en bas, le positionner au-dessus du point de clic
    newTop = viewportHeight - rect.height - margin;
  }
  if (newTop < margin) {
    newTop = margin;
  }

  menu.style.left = newLeft + "px";
  menu.style.top = newTop + "px";
}

/**
 * Ajoute un titre au menu
 * @param {HTMLElement} menu - Le menu
 * @param {string} title - Le titre
 * @param {string} [icon] - L'icône SVG optionnelle
 */
function addMenuTitle(menu, title, icon) {
  const titleEl = document.createElement("div");
  titleEl.className = "context-menu-title";
  if (icon) {
    titleEl.innerHTML = `<span class="context-menu-title-icon">${icon}</span>${title}`;
  } else {
    titleEl.textContent = title;
  }
  menu.appendChild(titleEl);
}

/**
 * Ajoute une option toggle au menu
 */
function addMenuToggleOption(menu, options) {
  const { id, label, checked, onChange } = options;

  const row = document.createElement("div");
  row.className = "context-menu-row";

  const labelEl = document.createElement("span");
  labelEl.className = "context-menu-label";
  labelEl.textContent = label;

  const toggle = document.createElement("label");
  toggle.className = "proportion-checkbox";
  toggle.innerHTML = `
    <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
    <span class="proportion-slider"></span>
  `;

  const input = toggle.querySelector("input");
  input.addEventListener("change", () => onChange(input.checked));

  row.appendChild(labelEl);
  row.appendChild(toggle);
  menu.appendChild(row);

  row.addEventListener("click", (e) => {
    // Ne pas déclencher si on clique sur la checkbox ou son label parent
    if (e.target === input || e.target.closest(".proportion-checkbox")) {
      return;
    }
    input.checked = !input.checked;
    onChange(input.checked);
  });
}

/**
 * Ajoute un slider au menu
 */
function addMenuSlider(menu, options) {
  const { label, min, max, value, unit, onChange } = options;

  const row = document.createElement("div");
  row.className = "context-menu-row slider-row";

  const header = document.createElement("div");
  header.className = "context-menu-slider-header";

  const labelEl = document.createElement("span");
  labelEl.className = "context-menu-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "context-menu-value";
  valueEl.textContent = value + (unit || "");

  header.appendChild(labelEl);
  header.appendChild(valueEl);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "context-menu-slider";
  slider.min = min;
  slider.max = max;
  slider.value = value;

  slider.addEventListener("input", () => {
    valueEl.textContent = slider.value + (unit || "");
    onChange(parseInt(slider.value));
  });

  row.appendChild(header);
  row.appendChild(slider);
  menu.appendChild(row);
}

/**
 * Configure la fermeture du menu au clic à l'extérieur
 */
function setupMenuCloseOnClickOutside(menu) {
  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("mousedown", closeHandler);
    }
  };
  // Délai pour éviter la fermeture immédiate
  setTimeout(() => {
    document.addEventListener("mousedown", closeHandler);
  }, 10);
}

/**
 * Ferme tous les menus et modals de dessin ouverts
 */
function closeAllDrawingMenus() {
  const menus = [
    "stabilizer-menu",
    "lightbox-menu",
    "measure-config-popup",
    "protractor-menu",
    "export-options-modal",
  ];
  menus.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}
