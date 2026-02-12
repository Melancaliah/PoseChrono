// ================================================================
// CONFIGURATION GLOBALE - POSECHRONO
// ================================================================

const CONFIG = {
  enableTimeline: true, // Activer/désactiver le module historique/timeline (default : true)
  timelineVisibleByDefault: false, // Timeline visible par défaut à chaque ouverture (true) ou caché (false) - (default : false)
  backgroundGrid: true, // Afficher une grille en arrière-plan (default : true)

  defaultSessionMode: "classique", // Mode de session par défaut : "classique" | "custom" | "relax" | "memory"

  titlebarAlwaysVisible: false, // Titlebar toujours visible (default : false)

  enableAnimations: true, // Activer/désactiver les animations (default : true)
  enableFlipAnimation: false, // Activer/désactiver l'animation 3D de flip (default : false)
  defaultAutoFlip: false, // AutoFlip activé par défaut (default : true)

  animationDuration: 350, // Durée des transitions en ms (default : 350)
  tooltipDelay: 500, // délai d'apparition de l'infobulle en ms (default : 500)
  smoothProgress: false, // La barre de progression diminue par accoup ou progressivement ? (default : false)
  smoothPauseCircle: true, // La barre de progression de l'écran de pause diminue par accoup ou progressivement ? (default : true)
  reverseProgressiveBlur: false, // Progressive blur inversé : net → flou (false) ou flou → net (true) - (default : false)
  currentTheme: "violet", // Thème par défaut : "violet"

  enableStabilizerByDefault: true, // Stabilisateur activé par défaut dans le module dessin (default : true)
  defaultLightboxOpacity: 0.5, // Opacité par défaut de la table lumineuse (0-1) (default : 0.5)
  defaultDrawingSize: 4, // Taille par défaut du pinceau/trait dans le module dessin (default : 4)

  enableZoomInDrawingMode: true, // Autoriser le zoom dans le mode dessin (default : true)
  enableZoomScrollbars: false, // Afficher les scrollbars en mode zoom (default : false)
  zoomAnimated: true, // Animation fluide du zoom (default : true)

  HOTKEYS: {
    FLIP_H: "F1", // Flip horizontal (default : F1)
    GRAYSCALE: "y", // Noir & blanc (default : y)
    BLUR: "f", // Flou (default : f)
    MUTE: "m", // Mute/Unmute son (default : m)
    GRID: "h", // Grille afficher/cacher (default : h)
    GRID_MODAL: "H", // Ouvrir modal configuration grille (Shift+H) (default : H)
    SIDEBAR: "Tab", // Toggle sidebar de config (default : Tab)
    INFO: "i", // Afficher les infos de l'image (default : i)
    SILHOUETTE: "s", // Toggle silhouette (default : s)
    SILHOUETTE_MODAL: "S", // Ouvrir modal configuration silhouette (Shift+S) (default : S)
    THEME: "F4", // Changer de thème (default : F4)
    ANNOTATE: "b", // Ouvrir le mode dessin/annotation (default : d)

    // Contrôles vidéo
    VIDEO_SLOWER: "-", // Ralentir la vidéo (default : -)
    VIDEO_FASTER: "+", // Accélérer la vidéo (default : +)
    VIDEO_PREV_FRAME: "'", // Frame précédente (default : ')
    VIDEO_NEXT_FRAME: "(", // Frame suivante (default : ()
    VIDEO_LOOP: "l", // Toggle boucle vidéo (default : l)
    VIDEO_CONFIG: "V", // Ouvrir modal configuration vidéo (Shift+V) (default : V)

    // Contrôles module dessin
    DRAWING_EXPORT: "s", // Exporter le dessin (Ctrl+S)
    DRAWING_LIGHTBOX: ")", // Toggle table lumineuse (default : ))
    DRAWING_CLOSE: "Escape", // Fermer le module dessin (default : Escape)

    // Outils de dessin
    DRAWING_TOOL_PENCIL: "b",
    DRAWING_TOOL_ERASER: "e",
    DRAWING_TOOL_RECTANGLE: "r",
    DRAWING_TOOL_CIRCLE: "c",
    DRAWING_TOOL_LINE: "l",
    DRAWING_TOOL_ARROW: "a",
    DRAWING_TOOL_MEASURE: "m",
    DRAWING_TOOL_CALIBRATE: "u",
    DRAWING_TOOL_LASER: "B", // Pointeur laser (Shift+B) (default : B)
    DRAWING_TOOL_PROTRACTOR: "U", // Rapporteur (Shift+U) (default : U)
    DRAWING_SIZE_DECREASE: "é", // Diminuer la taille (default : é)
    DRAWING_SIZE_INCREASE: '"', // Augmenter la taille (default : ")
  },
};

// ================================================================
// CONSTANTES SÉMANTIQUES
// ================================================================

const TIMER_CONSTANTS = {
  TIME_ENDED: 0,
  TIMER_INTERVAL_MS: 1000,
  NEXT_IMAGE_DELAY_MS: 100,
};

const UI_CONSTANTS = {
  MIN_BLUR_AMOUNT: 0,
  MAX_BLUR_AMOUNT: 20,
  DEFAULT_BLUR_AMOUNT: 10,
  PROGRESSIVE_BLUR_MAX: 10,
  SCRUB_SENSITIVITY: 4, // Pixels nécessaires pour changer la valeur de 1
  DEBOUNCE_DELAY_MS: 16, // ~60fps
};

const OPACITY = {
  DISABLED: 0.2,
  REDUCED: 0.35,
  ENABLED: 1,
};

const VIDEO_CONSTANTS = {
  DEFAULT_FPS: 24,
  FPS_OPTIONS: [24, 25, 30, 60],
  PLAYBACK_RATES: [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2],
  DEFAULT_PLAYBACK_RATE: 0.25,
  MIN_PLAYBACK_RATE: 0.1,
  MAX_PLAYBACK_RATE: 2,
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"];
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

const THEMES = ["violet", "violet-logo", "cyan", "vert"];

// ================================================================
// CONSTANTES DU MODULE DE DESSIN
// ================================================================

const DRAWING_CONSTANTS = {
  // Laser
  LASER_FADE_DURATION: 1500,
  LASER_COLOR: "#ff3333",
  GAP_THRESHOLD: 100, // ms pour détecter un nouveau tracé laser

  // Historique
  MAX_HISTORY: 30,

  // Seuils de détection (en pixels)
  HIT_THRESHOLD: 15, // Seuil pour détecter un clic sur une mesure
  ENDPOINT_THRESHOLD: 10, // Seuil pour les bornes de mesure

  // Tailles visuelles
  ENDPOINT_RADIUS: 6, //taille des pastilles
  ARROW_HEAD_LENGTH: 15,
  MIN_CURSOR_SIZE: 6,

  // Valeurs par défaut des outils de mesure
  DEFAULT_MEASURE_LINE_WIDTH: 3, // Épaisseur des lignes de mesure (default : 3)
  DEFAULT_MEASURE_LABEL_SIZE: 0.6, // Taille des valeurs affichées (1.0 = normal)
  DEFAULT_GRADUATION_SIZE: 1.5, // Taille des graduations sur les lignes
  DEFAULT_MEASURE_COLOR: "#f17e20", // Couleur des lignes de mesure
  DEFAULT_SHOW_SIZE_LABELS: true, // Afficher les valeurs par défaut
  DEFAULT_GRADUATION_TYPE: "units", // Type de graduation : "none" | "units" | "proportions"

  // Valeurs par défaut de l'outil compas (protractor)
  DEFAULT_COMPASS_COLOR: "#f59e0b", // Couleur du compas (orange)
  DEFAULT_COMPASS_PREVIEW_FILL_OPACITY: 0.1, // Opacité du fond du cercle de prévisualisation (0-1)
  DEFAULT_COMPASS_LINE_WIDTH: 2, // Épaisseur du trait du compas

  // Resize debounce
  RESIZE_DEBOUNCE_MS: 100,

  // UI margins
  VIEWPORT_MARGIN: 10,

  // Stabilizer
  STABILIZER_BUFFER_SIZE: 8,
  STABILIZER_MAX_RETARD: 50,

  // Interpolation (pas en pixels)
  ERASER_INTERPOLATION_STEP: 2,
  LASER_INTERPOLATION_STEP: 5,

  // Graduations & ticks
  TICK_LENGTH_LARGE: 10,
  TICK_LENGTH_MEDIUM: 8,
  TICK_LENGTH_SMALL: 6,

  // Labels mesure
  LABEL_FONT_SIZE: 18,
  LABEL_PADDING: 10,
  LABEL_BOX_HEIGHT: 28,
  LABEL_PERP_OFFSET: 25,

  // Seuils de distance minimum pour affichage
  MIN_DISTANCE_RULER: 20,
  MIN_DISTANCE_PROPORTIONS: 50,
  MIN_DISTANCE_LABELS: 100,

  // Largeurs de ligne proportions
  PROPORTION_LINE_WIDTH_HALF: 2.2,
  PROPORTION_LINE_WIDTH_THIRD: 2,
  PROPORTION_LINE_WIDTH_OTHER: 1.8,

  // Preview
  PREVIEW_OPACITY_LOW: 0.3,
  PREVIEW_OPACITY_HIGH: 0.5,
  DASH_PATTERN_SMALL: [3, 3],
  DASH_PATTERN_LARGE: [5, 5],

  // Zoom
  MIN_SCALE: 0.5,
  MAX_SCALE: 5,
  SCROLL_PAGE_SIZE: 0.2,
  ZOOM_SCROLLBAR_THRESHOLD: 1.1, // Scale au-dessus duquel les scrollbars apparaissent
  ZOOM_SCROLLBAR_WIDTH: 6, // Largeur/hauteur du track en px
  ZOOM_SCROLLBAR_MIN_THUMB: 20, // Taille min du thumb en px
  ZOOM_SCROLLBAR_MARGIN: 10, // Marge des scrollbars par rapport aux bords en px
  ZOOM_SIDEBAR_WIDTH: 95, // Largeur de la sidebar en px
  ZOOM_SCROLLBAR_TRACK_OPACITY: 0.1, // Opacité du fond du track
  ZOOM_SCROLLBAR_THUMB_OPACITY: 0.5, // Opacité du thumb
  ZOOM_VIEWPORT_CLAMP_FACTOR: 0.5, // Facteur de clampage viewport pour maxOffset
  ZOOM_WHEEL_SENSITIVITY: 0.001, // Sensibilité du zoom molette
  ZOOM_ANIMATION_DURATION_MS: 150, // Durée de l'animation de zoom en ms
};
