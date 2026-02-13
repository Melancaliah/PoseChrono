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
      shapeSelection: {
        id: null,
        groupId: null,
      },
      shapeEditSession: {
        scaleSnapshot: null,
        circleSpaceBase: null,
        rotateSnapshot: null,
      },
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

const drawingStateCache = new Map();

// ================================================================
// ÉTAT DES TOUCHES MODIFICATEURS
// ================================================================
const keysState = {
  shift: false,
  alt: false,
  ctrl: false,
  space: false,
  s: false,
  q: false,
};

const RECTANGLE_EDIT_STORAGE_KEY = "posechrono_rectangle_edit_mode";
function loadRectangleEditMode() {
  try {
    const raw = localStorage.getItem(RECTANGLE_EDIT_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch (_) {
    return true;
  }
}

let rectangleEditMode = loadRectangleEditMode();
function saveRectangleEditMode() {
  try {
    localStorage.setItem(RECTANGLE_EDIT_STORAGE_KEY, rectangleEditMode ? "1" : "0");
  } catch (_) {}
}

const SHAPE_SAFE_SELECT_STORAGE_KEY = "posechrono_shape_safe_select_mode";
function loadShapeSafeSelectMode() {
  try {
    const raw = localStorage.getItem(SHAPE_SAFE_SELECT_STORAGE_KEY);
    if (raw === null) return false;
    return raw === "1";
  } catch (_) {
    return false;
  }
}

let shapeSafeSelectMode = loadShapeSafeSelectMode();
function saveShapeSafeSelectMode() {
  try {
    localStorage.setItem(
      SHAPE_SAFE_SELECT_STORAGE_KEY,
      shapeSafeSelectMode ? "1" : "0",
    );
  } catch (_) {}
}

const ERASER_SHAPE_MODE_STORAGE_KEY = "posechrono_eraser_shape_mode";
function loadEraserShapeMode() {
  try {
    const raw = localStorage.getItem(ERASER_SHAPE_MODE_STORAGE_KEY);
    if (raw === "keep-vector" || raw === "partial-raster") return raw;
    return "partial-raster";
  } catch (_) {
    return "partial-raster";
  }
}

let eraserShapeMode = loadEraserShapeMode();
function saveEraserShapeMode() {
  try {
    localStorage.setItem(ERASER_SHAPE_MODE_STORAGE_KEY, eraserShapeMode);
  } catch (_) {}
}

// updateStylusStateFromEvent et resetStylusStrokeState supprimées (no-op)
function getActivePencilStrokeSize() {
  return annotationStyle.size;
}

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
let isDrawingModeActive = false;
let drawingOverlay = null;
let canvasResizeObserver = null;

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
