/**
 * ================================================================
 * POSECHRONO - APPLICATION DE CHRONOMÈTRAGE POUR SÉANCES DE DESSIN
 * ================================================================
 * Structure du fichier :
 * 1. ÉTAT DE L'APPLICATION (StateManager + ImageCache)
 * 2. CACHE DOM
 * 3. ICÔNES SVG
 * 4. GESTIONNAIRES CENTRALISÉS (Sons, Performances)
 * 5. INITIALISATION
 * 6. GESTION DES ÉVÉNEMENTS
 * 7. LOGIQUE DE SESSION
 * 8. GESTION DES IMAGES
 * 9. MODE PERSONNALISÉ
 * 10. FILTRES ET TRANSFORMATIONS
 * 11. REVUE ET ZOOM
 * 12. UTILITAIRES
 *
 * NOTE: Configuration globale externalisée dans config.js
 * ================================================================
 */

// ================================================================
// 1. ÉTAT DE L'APPLICATION - STATE MANAGER
// ================================================================

/**
 * StateManager - Gestion centralisée de l'état avec pattern Observer
 * Permet la traçabilité des changements et la réactivité de l'UI
 */
class StateManager {
  constructor(initialState = {}) {
    this._state = initialState;
    this._listeners = new Map(); // key -> Set of callbacks
    this._history = []; // Pour debug/undo potentiel
    this._enableLogging = false; // Pour debugging
  }

  /**
   * Récupère une valeur de l'état
   */
  get(key) {
    return this._state[key];
  }

  /**
   * Récupère tout l'état (lecture seule)
   */
  getAll() {
    return { ...this._state };
  }

  /**
   * Modifie une valeur et notifie les listeners
   */
  set(key, value) {
    const oldValue = this._state[key];

    // Éviter les updates inutiles
    if (oldValue === value) return;

    this._state[key] = value;

    // Logging pour debug
    if (this._enableLogging) {
      console.log(`[State] ${key}: ${oldValue} → ${value}`);
    }

    // Historique (limité aux 50 derniers changements)
    this._history.push({
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now(),
    });
    if (this._history.length > 50) this._history.shift();

    // Notifier les listeners
    this._notify(key, value, oldValue);
  }

  /**
   * Modifie plusieurs valeurs en batch
   */
  setBatch(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  /**
   * Abonne un callback à un ou plusieurs changements d'état
   */
  subscribe(keys, callback) {
    const keyArray = Array.isArray(keys) ? keys : [keys];

    keyArray.forEach((key) => {
      if (!this._listeners.has(key)) {
        this._listeners.set(key, new Set());
      }
      this._listeners.get(key).add(callback);
    });

    // Retourne une fonction de désabonnement
    return () => {
      keyArray.forEach((key) => {
        const listeners = this._listeners.get(key);
        if (listeners) {
          listeners.delete(callback);
        }
      });
    };
  }

  /**
   * Notifie tous les listeners d'une clé
   */
  _notify(key, newValue, oldValue) {
    const listeners = this._listeners.get(key);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(newValue, oldValue, key);
        } catch (e) {
          console.error(`[State] Erreur dans listener pour "${key}":`, e);
        }
      });
    }
  }

  /**
   * Active/désactive le logging pour debug
   */
  setLogging(enabled) {
    this._enableLogging = enabled;
  }

  /**
   * Récupère l'historique des changements
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Reset l'état aux valeurs initiales
   */
  reset(initialState) {
    Object.keys(this._state).forEach((key) => {
      delete this._state[key];
    });
    Object.assign(this._state, initialState);
    this._history = [];
  }
}

// Instance globale du StateManager
const stateManager = new StateManager({
  // Gestion des images
  images: [],
  originalImages: [], // Ordre original des images (non mélangé)
  currentIndex: 0,
  imagesSeen: [],

  // Contrôle du lecteur
  isPlaying: false,
  showTimer: true,
  showSidebar: true,

  // Chronomètrage
  selectedDuration: 60,
  timeRemaining: 60,
  timerInterval: null,
  sessionStartTime: null,
  totalSessionTime: 0,

  // Filtres d'image
  flipHorizontal: false,
  flipVertical: false,
  soundEnabled: true,
  grayscale: false,
  isBlurEnabled: false,
  blurAmount: 10,
  gridEnabled: false,
  gridMode: "none", // 'none', 'thirds', 'golden', 'custom'
  gridRows: 3,
  gridCols: 3,
  isProgressiveBlur: false,
  autoFlip: CONFIG.defaultAutoFlip,
  randomShuffle: true, // Mélanger aléatoirement les images (par défaut activé)
  silhouetteEnabled: false,
  silhouetteThreshold: 128, // 0-255
  silhouetteBrightness: 1, // 0-6 (luminosité)
  silhouetteContrast: 10000, // 1-10000 (contraste)
  silhouetteInvert: false,
  gridGuides: [], // Repères personnalisés déplaçables: [{type: 'vertical'|'horizontal', position: number}]

  // Modes de session
  sessionMode: "", // Initialisé vide, switchMode() sera appelé dans initPlugin avec CONFIG.defaultSessionMode
  customQueue: [],
  currentStepIndex: 0,
  currentPoseInStep: 1,
  imagesCount: 0,
  currentPoseTime: 0, // Temps passé sur la pose actuelle (pour mode tranquille)

  // Mode mémoire
  memoryType: "flash", // "flash" | "progressive"
  memoryDuration: 30, // Durée d'affichage avant masquage (pour flash) en secondes
  memoryHidden: false, // Indique si l'image est cachée (pour flash)
  memoryDrawingTime: 0, // Temps de dessin en secondes
  memoryNoPressure: true, // Sans limite de temps activé par défaut
  memoryPosesCount: 10, // Nombre de poses

  // Contrôles vidéo
  isVideoFile: false, // Le média courant est-il une vidéo ?
  videoPlaybackRate: VIDEO_CONSTANTS.DEFAULT_PLAYBACK_RATE, // Vitesse de lecture (0.25 - 2)
  videoLoop: true, // Lecture en boucle
  videoFPS: VIDEO_CONSTANTS.DEFAULT_FPS, // FPS pour navigation frame-by-frame
  videoPlaying: false, // La vidéo est-elle en lecture ?
  videoMuted: true, // Audio de la vidéo toujours muté (pas de son nécessaire)

  // Contrôles GIF
  isGifFile: false, // Le média courant est-il un GIF ?
  gifPlaying: true, // Le GIF est-il en lecture ? (pause = src vidé)
  gifOriginalSrc: "", // Src original du GIF pour restaurer après pause
});

// Proxy pour compatibilité avec l'ancienne syntaxe state.property
// Permet de garder le code existant tout en bénéficiant du StateManager
const state = new Proxy(stateManager, {
  get(target, property) {
    // Accès aux méthodes du StateManager
    if (typeof target[property] === "function") {
      return target[property].bind(target);
    }
    // Accès aux propriétés de l'état
    return target.get(property);
  },
  set(target, property, value) {
    // Modification des propriétés de l'état
    target.set(property, value);
    return true;
  },
});

// ================================================================
// 2.5 IMAGE CACHE - GESTION INTELLIGENTE DE LA MÉMOIRE
// ================================================================

/**
 * Cache d'images avec stratégie LRU (Least Recently Used).
 * Précharge les images autour de l'index courant pour optimiser:
 * - Temps de navigation (images déjà chargées)
 * - Mémoire (seulement N images en cache à la fois)
 * - UX (pas de lag lors du changement de pose)
 */
class ImageCache {
  constructor(maxSize = 10, preloadRange = 2) {
    this.maxSize = maxSize;
    this.preloadRange = preloadRange; // ±2 images autour de l'index courant
    this.cache = new Map(); // { index: { element, loaded, lastAccess } }
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalLoaded: 0,
    };
  }

  /**
   * Précharge les images autour de l'index spécifié
   * Stratégie: charger [currentIndex - 2] à [currentIndex + 2]
   * Cela garantit une navigation fluide sans surcharge mémoire
   */
  preload(currentIndex, totalImages) {
    const indicesToLoad = [];

    // Déterminer la plage d'images à précharger
    const start = Math.max(0, currentIndex - this.preloadRange);
    const end = Math.min(totalImages - 1, currentIndex + this.preloadRange);

    for (let i = start; i <= end; i++) {
      if (!this.cache.has(i)) {
        indicesToLoad.push(i);
      } else {
        this.cache.get(i).lastAccess = Date.now();
        this.stats.hits++;
      }
    }

    // Charger les images manquantes
    indicesToLoad.forEach((index) => {
      const image = state.images[index];
      if (image) {
        this._loadImage(index, image);
      }
    });

    // Nettoyer les images hors plage
    this._evictFarImages(currentIndex, totalImages);

    return indicesToLoad.length;
  }

  /**
   * Charge une image en mémoire
   * Crée un élément Image mais ne l'ajoute pas au DOM
   * Les vidéos sont ignorées (ne peuvent pas être préchargées comme Image)
   */
  _loadImage(index, imageData) {
    // Ignorer les fichiers vidéo (ne peuvent pas être chargés comme Image)
    const ext = imageData.ext?.toLowerCase();
    if (VIDEO_EXTENSIONS.includes(ext)) {
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (this.cache.has(index)) {
        this.cache.get(index).loaded = true;
        this.cache.get(index).lastAccess = Date.now();
      }
    };
    img.onerror = () => {
      console.warn(`ImageCache: Erreur chargement image ${index}`);
    };

    img.src = `file:///${imageData.filePath}`;

    // Ajouter au cache
    this.cache.set(index, {
      element: img,
      loaded: false,
      lastAccess: Date.now(),
      filePath: imageData.filePath,
    });

    // Vérifier la limite de cache
    if (this.cache.size > this.maxSize) {
      this._evictLRU();
    }

    this.stats.totalLoaded++;
  }

  /**
   * Évincez l'image la moins récemment utilisée (LRU)
   */
  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (let [key, value] of this.cache) {
      if (value.lastAccess < oldestTime) {
        oldestTime = value.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Supprime les images trop éloignées de l'index courant
   */
  _evictFarImages(currentIndex, totalImages) {
    const safeStart = Math.max(0, currentIndex - this.preloadRange - 1);
    const safeEnd = Math.min(
      totalImages - 1,
      currentIndex + this.preloadRange + 1,
    );

    const keysToDelete = [];
    for (let key of this.cache.keys()) {
      if (key < safeStart || key > safeEnd) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
      this.stats.evictions++;
    });
  }

  /**
   * Récupère une image du cache
   */
  get(index) {
    if (this.cache.has(index)) {
      const entry = this.cache.get(index);
      entry.lastAccess = Date.now();
      this.stats.hits++;
      return entry;
    }
    this.stats.misses++;
    return null;
  }

  /**
   * Réinitialise le cache (lors du changement de dossier)
   */
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, totalLoaded: 0 };
  }

  /**
   * Retourne les statistiques du cache
   */
  getStats() {
    const totalAccess = this.stats.hits + this.stats.misses;
    const hitRate =
      totalAccess > 0 ? ((this.stats.hits / totalAccess) * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: this.cache.size,
      maxSize: this.maxSize,
      memoryEstimate: `~${(this.cache.size * 5).toFixed(2)}MB`, // Estimation approximative
    };
  }

  /**
   * Précharge un index spécifique (pour les accès directs)
   */
  preloadDirect(index, totalImages, imageData) {
    if (!this.cache.has(index)) {
      this._loadImage(index, imageData);
    }
    this.preload(index, totalImages);
  }
}

// Instance globale du cache d'images
const imageCache = new ImageCache(10, 2);

// ================================================================
// 2.6 VIRTUAL SCROLLER - OPTIMISATION DES GRANDES LISTES
// ================================================================

/**
 * Virtual Scroller optimise le rendu des grandes listes (>50 éléments)
 * en affichant seulement les éléments visibles + un buffer.
 *
 * Impact: -80% éléments DOM, +80% performance rendering
 * Cas d'usage: customQueue > 50 étapes
 */
class VirtualScroller {
  constructor(container, data, renderItem, options = {}) {
    this.container = container;
    this.data = data;
    this.renderItem = renderItem;

    this.itemHeight = options.itemHeight || 68; // Hauteur approx d'un step
    this.bufferSize = options.bufferSize || 5; // Éléments avant/après visibles
    this.visibleCount = options.visibleCount || 8; // Éléments visibles à la fois

    this.scrollTop = 0;
    this.startIndex = 0;
    this.endIndex = this.visibleCount;

    this.stats = {
      renderedItems: 0,
      totalItems: 0,
      scrollEvents: 0,
    };

    this.setupScroll();
  }

  /**
   * Configure l'événement scroll avec throttle
   */
  setupScroll() {
    const handleScroll = () => {
      this.scrollTop = this.container.scrollTop;
      this.updateVisibleRange();
      this.render();
      this.stats.scrollEvents++;
    };

    // Throttle le scroll à 16ms (~60fps)
    let ticking = false;
    this.container.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /**
   * Calcule la plage d'éléments visibles
   */
  updateVisibleRange() {
    const start = Math.max(
      0,
      Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize,
    );
    const end = Math.min(
      this.data.length,
      Math.ceil(
        (this.scrollTop + this.container.clientHeight) / this.itemHeight,
      ) + this.bufferSize,
    );

    this.startIndex = start;
    this.endIndex = end;
  }

  /**
   * Rend seulement les éléments visibles
   */
  render() {
    // Créer un conteneur virtuel avec espacement
    const visibleItems = this.data.slice(this.startIndex, this.endIndex);

    // Créer le HTML pour les éléments visibles
    const html = visibleItems
      .map((item, index) => {
        const realIndex = this.startIndex + index;
        return `<div class="virtual-item" data-index="${realIndex}" style="margin-top: ${
          realIndex === 0
            ? 0
            : realIndex === this.startIndex
              ? this.startIndex * this.itemHeight
              : 0
        }px">
          ${this.renderItem(item, realIndex)}
        </div>`;
      })
      .join("");

    // Appliquer la hauteur totale pour le scrollbar
    const totalHeight = this.data.length * this.itemHeight;

    this.container.innerHTML = `
      <div class="virtual-scroller-content" style="height: ${totalHeight}px; position: relative;">
        <div class="virtual-items" style="transform: translateY(${
          this.startIndex * this.itemHeight
        }px);">
          ${html}
        </div>
      </div>
    `;

    this.stats.renderedItems = visibleItems.length;
    this.stats.totalItems = this.data.length;
  }

  /**
   * Met à jour les données et re-rend
   */
  update(newData) {
    this.data = newData;
    this.scrollTop = 0;
    this.startIndex = 0;
    this.endIndex = this.visibleCount;
    this.container.scrollTop = 0;
    this.render();
  }

  /**
   * Retourne les statistiques
   */
  getStats() {
    return {
      ...this.stats,
      efficiency: `${(
        (1 - this.stats.renderedItems / this.stats.totalItems) *
        100
      ).toFixed(1)}% réduction DOM`,
      itemHeight: this.itemHeight,
      visibleCount: this.visibleCount,
    };
  }

  /**
   * Scrolle vers un index spécifique
   */
  scrollToIndex(index) {
    const targetScroll = Math.max(
      0,
      index * this.itemHeight - (this.visibleCount * this.itemHeight) / 2,
    );
    this.container.scrollTop = targetScroll;
  }
}

// ================================================================
// 3. CACHE DOM - ÉLÉMENTS PRINCIPAUX
// ================================================================

// Écrans
let settingsScreen, drawingScreen, reviewScreen;

// Boutons de contrôle principal
let startBtn, playPauseBtn, prevBtn, nextBtn, stopBtn, settingsBtn;

// Affichage
let timerDisplay, imageCounter, currentImage, progressBar, progressFill;
let pauseTimerDisplay, nextStepInfoDisplay, folderInfo, pauseBadge;

// Barre latérale
let sidebar, imageContainer, pauseOverlay, memoryOverlay;

// État de lecture avant ouverture de modal
let wasPlayingBeforeModal = false;

// Boutons de durée (30s, 1min, 2min, 5min)
let durationBtns, hoursInput, minutesInput, secondsInput, inputGroups;

// Boutons de filtres/transformations
let flipHorizontalBtn, flipVerticalBtn, grayscaleBtn;
let soundBtn, soundIcon, randomShuffleBtn, autoFlipBtn, blurBtn;
let progressiveBlurBtn, homeProgressiveBlurBtn, annotateBtn;

// Boutons d'action
let deleteBtn, revealBtn;

// Contrôles vidéo
let currentVideo;
let videoControlsBar;
let videoPlayBtn, videoSlowerBtn, videoFasterBtn, videoLoopBtn;
let videoPrevFrameBtn, videoNextFrameBtn, videoConfigBtn;
let videoSpeedDisplay, videoCurrentTime, videoDuration;
let videoTimeline, videoTimelineProgress, videoTimelineHandle;

// Système de frame stepping optimisé (throttling + requestVideoFrameCallback)
const frameStepState = {
  isHoldingKey: false, // Touche maintenue enfoncée
  pendingDirection: 0, // Direction en attente (-1 ou 1)
  lastStepTime: 0, // Timestamp du dernier step
  rafId: null, // ID de requestAnimationFrame
  vfcSupported:
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype,
  isWaitingForFrame: false, // En attente du décodage de frame
  targetFPS: 30, // FPS max pour le throttling en mode touche maintenue
  singleStepFPS: 60, // FPS max pour un step unique
  buttonHoldTimeout: null, // Timeout pour le maintien des boutons
};

// Mode personnalisé
let customAddBtn, customCountInput, customHInput, customMInput, customSInput;
let addPauseBtn, customStepsList;

// Mode mémoire
let memoryTypeBtns, memoryFlashSettings, memoryProgressiveSettings;

// Drag & drop
let dragSourceIndex = null;
let isDuplicatingWithAlt = false;

// Virtual Scroller pour customQueue (initialisé après le DOM loading)
let customQueueScroller = null;

// ================================================================
// 4. ICÔNES SVG ET RESSOURCES
// ================================================================

const ICONS = {
  PLAY: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
  PAUSE:
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',
  PREV: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>',
  NEXT: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>',
  TIMER_ON:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  TIMER_OFF:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  SOUND_ON:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polyline><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>',
  SOUND_OFF:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polyline><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>',
  BW_OFF:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm40-83q119-15 199.5-104.5T800-480q0-123-80.5-212.5T520-797v634Z"/></svg>',
  BW_ON:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M819-28 701-146q-48 32-103.5 49T480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-62 17-117.5T146-701L27-820l57-57L876-85l-57 57ZM480-160q45 0 85.5-12t76.5-33L480-367v207Zm335-100-59-59q21-35 32.5-75.5T800-480q0-133-93.5-226.5T480-800v205L260-815q48-31 103.5-48T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 61-17 116.5T815-260Z"/></svg>',
  FLIP_H_REVERSED:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M360-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h160v80H200v560h160v80Zm80 80v-880h80v880h-80Zm160-80v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80q0 33-23.5 56.5T760-120Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80q33 0 56.5 23.5T840-760h-80Z"/></svg>',
  FLIP_H:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3" transform="rotate(540)"><path d="M360-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h160v80H200v560h160v80Zm80 80v-880h80v880h-80Zm160-80v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80q0 33-23.5 56.5T760-120Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80q33 0 56.5 23.5T840-760h-80Z"></path></svg>',
  FLIP_V_REVERSED:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3" transform="rotate(90)"><path d="M360-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h160v80H200v560h160v80Zm80 80v-880h80v880h-80Zm160-80v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80q0 33-23.5 56.5T760-120Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80q33 0 56.5 23.5T840-760h-80Z"></path></svg>',
  FLIP_V:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3" transform="rotate(270)"><path d="M360-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h160v80H200v560h160v80Zm80 80v-880h80v880h-80Zm160-80v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80q0 33-23.5 56.5T760-120Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80q33 0 56.5 23.5T840-760h-80Z"></path></svg>',
  REVEAL:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  DELETE:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
  ERASER:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M690-240h190v80H610l80-80Zm-500 80-85-85q-23-23-23.5-57t22.5-58l440-456q23-24 56.5-24t56.5 23l199 199q23 23 23 57t-23 57L520-160H190Zm296-80 314-322-198-198-442 456 64 64h262Zm-6-240Z"/></svg>',
  BLUR_OFF:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M120-380q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-160q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm120 340q-17 0-28.5-11.5T200-240q0-17 11.5-28.5T240-280q17 0 28.5 11.5T280-240q0 17-11.5 28.5T240-200Zm0-160q-17 0-28.5-11.5T200-400q0-17 11.5-28.5T240-440q17 0 28.5 11.5T280-400q0 17-11.5 28.5T240-360Zm0-160q-17 0-28.5-11.5T200-560q0-17 11.5-28.5T240-600q17 0 28.5 11.5T280-560q0 17-11.5 28.5T240-520Zm0-160q-17 0-28.5-11.5T200-720q0-17 11.5-28.5T240-760q17 0 28.5 11.5T280-720q0 17-11.5 28.5T240-680Zm160 340q-25 0-42.5-17.5T340-400q0-25 17.5-42.5T400-460q25 0 42.5 17.5T460-400q0 25-17.5 42.5T400-340Zm0-160q-25 0-42.5-17.5T340-560q0-25 17.5-42.5T400-620q25 0 42.5 17.5T460-560q0 25-17.5 42.5T400-500Zm0 300q-17 0-28.5-11.5T360-240q0-17 11.5-28.5T400-280q17 0 28.5 11.5T440-240q0 17-11.5 28.5T400-200Zm0-480q-17 0-28.5-11.5T360-720q0-17 11.5-28.5T400-760q17 0 28.5 11.5T440-720q0 17-11.5 28.5T400-680Zm0 580q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-720q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm160 480q-25 0-42.5-17.5T500-400q0-25 17.5-42.5T560-460q25 0 42.5 17.5T620-400q0 25-17.5 42.5T560-340Zm0-160q-25 0-42.5-17.5T500-560q0-25 17.5-42.5T560-620q25 0 42.5 17.5T620-560q0 25-17.5 42.5T560-500Zm0 300q-17 0-28.5-11.5T520-240q0-17 11.5-28.5T560-280q17 0 28.5 11.5T600-240q0 17-11.5 28.5T560-200Zm0-480q-17 0-28.5-11.5T520-720q0-17 11.5-28.5T560-760q17 0 28.5 11.5T600-720q0 17-11.5 28.5T560-680Zm0 580q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-720q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm160 620q-17 0-28.5-11.5T680-240q0-17 11.5-28.5T720-280q17 0 28.5 11.5T760-240q0 17-11.5 28.5T720-200Zm0-160q-17 0-28.5-11.5T680-400q0-17 11.5-28.5T720-440q17 0 28.5 11.5T760-400q0 17-11.5 28.5T720-360Zm0-160q-17 0-28.5-11.5T680-560q0-17 11.5-28.5T720-600q17 0 28.5 11.5T760-560q0 17-11.5 28.5T720-520Zm0-160q-17 0-28.5-11.5T680-720q0-17 11.5-28.5T720-760q17 0 28.5 11.5T760-720q0 17-11.5 28.5T720-680Zm120 300q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-160q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Z"/></svg>',
  BLUR_ON:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M792-56 56-792l56-56 736 736-56 56Zm-392-44q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm160 0q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6ZM240-200q-17 0-28.5-11.5T200-240q0-17 11.5-28.5T240-280q17 0 28.5 11.5T280-240q0 17-11.5 28.5T240-200Zm160 0q-17 0-28.5-11.5T360-240q0-17 11.5-28.5T400-280q17 0 28.5 11.5T440-240q0 17-11.5 28.5T400-200Zm160 0q-17 0-28.5-11.5T520-240q0-17 11.5-28.5T560-280q17 0 28.5 11.5T600-240q0 17-11.5 28.5T560-200ZM400-340q-26 0-43-17t-17-43q0-26 17-43t43-17q26 0 43 17t17 43q0 26-17 43t-43 17Zm-160-20q-17 0-28.5-11.5T200-400q0-17 11.5-28.5T240-440q17 0 28.5 11.5T280-400q0 17-11.5 28.5T240-360Zm472-1-31-31q-4-20 8.5-34t30.5-14q17 0 28.5 11.5T760-400q0 18-14 30.5t-34 8.5Zm-592-19q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm720 0q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6ZM572-502l-70-70q5-21 20-34.5t38-13.5q26 0 43 17t17 43q0 23-14 38.5T572-502Zm-332-18q-17 0-28.5-11.5T200-560q0-17 11.5-28.5T240-600q17 0 28.5 11.5T280-560q0 17-11.5 28.5T240-520Zm480 0q-17 0-28.5-11.5T680-560q0-17 11.5-28.5T720-600q17 0 28.5 11.5T760-560q0 17-11.5 28.5T720-520Zm-600-20q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm720 0q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6ZM560-680q-17 0-28.5-11.5T520-720q0-17 11.5-28.5T560-760q17 0 28.5 11.5T600-720q0 17-11.5 28.5T560-680Zm-167-1-32-32q-3-20 9-33.5t30-13.5q17 0 28.5 11.5T440-720q0 18-13.5 30t-33.5 9Zm327 1q-17 0-28.5-11.5T680-720q0-17 11.5-28.5T720-760q17 0 28.5 11.5T760-720q0 17-11.5 28.5T720-680ZM400-820q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm160 0q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Z"/></svg>',
  PROGRESSIVE_BLUR:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M200-260q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm160-180q17 0 28.5-11.5T400-480q0-17-11.5-28.5T360-520q-17 0-28.5 11.5T320-480q0 17 11.5 28.5T360-440Zm0-160q17 0 28.5-11.5T400-640q0-17-11.5-28.5T360-680q-17 0-28.5 11.5T320-640q0 17 11.5 28.5T360-600ZM120-120v-80h720v80H120Zm80-460q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm0 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm160 140q17 0 28.5-11.5T400-320q0-17-11.5-28.5T360-360q-17 0-28.5 11.5T320-320q0 17 11.5 28.5T360-280Zm320-20q9 0 14.5-5.5T700-320q0-9-5.5-14.5T680-340q-9 0-14.5 5.5T660-320q0 9 5.5 14.5T680-300ZM120-760v-80h720v80H120Zm560 140q9 0 14.5-5.5T700-640q0-9-5.5-14.5T680-660q-9 0-14.5 5.5T660-640q0 9 5.5 14.5T680-620Zm0 160q9 0 14.5-5.5T700-480q0-9-5.5-14.5T680-500q-9 0-14.5 5.5T660-480q0 9 5.5 14.5T680-460ZM520-600q17 0 28.5-11.5T560-640q0-17-11.5-28.5T520-680q-17 0-28.5 11.5T480-640q0 17 11.5 28.5T520-600Zm0 160q17 0 28.5-11.5T560-480q0-17-11.5-28.5T520-520q-17 0-28.5 11.5T480-480q0 17 11.5 28.5T520-440Zm0 160q17 0 28.5-11.5T560-320q0-17-11.5-28.5T520-360q-17 0-28.5 11.5T480-320q0 17 11.5 28.5T520-280Zm-400 80v-560 560Z"/></svg>',
  INFO: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  GRID: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h133v-133H200v133Zm213 0h134v-133H413v133Zm214 0h133v-133H627v133ZM200-413h133v-134H200v134Zm213 0h134v-134H413v134Zm214 0h133v-134H627v134ZM200-627h133v-133H200v133Zm213 0h134v-133H413v133Zm214 0h133v-133H627v133Z"/></svg>',
  SILHOUETTE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120Zm-560-80h280v-320l280 320v-560H480v240L200-200Z"/></svg>',
  LINE_VERTICAL:
    '<img src="assets/icones/line-vertical.png" class="btn-icon-img" alt="icone repère vertical">',
  LINE_HORIZONTAL:
    '<img src="assets/icones/line-horizontal.png" class="btn-icon-img" alt="icone repère horizontal">',
  SHUFFLE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M560-160v-80h104L537-367l57-57 126 126v-102h80v240H560Zm-344 0-56-56 504-504H560v-80h240v240h-80v-104L216-160Zm151-377L160-744l56-56 207 207-56 56Z"/></svg>',
  VIDEO_SLOWER:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M860-240 500-480l360-240v480Zm-400 0L100-480l360-240v480Zm-80-240Zm400 0Zm-400 90v-180l-136 90 136 90Zm400 0v-180l-136 90 136 90Z"/></svg>',
  VIDEO_FASTER:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M100-240v-480l360 240-360 240Zm400 0v-480l360 240-360 240ZM180-480Zm400 0Zm-400 90 136-90-136-90v180Zm400 0 136-90-136-90v180Z"/></svg>',
  VIDEO_LOOP_ON:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M280-80 120-240l160-160 56 58-62 62h406v-160h80v240H274l62 62-56 58Zm-80-440v-240h486l-62-62 56-58 160 160-160 160-56-58 62-62H280v160h-80Z"/></svg>',
  VIDEO_LOOP_OFF:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M280-80 120-240l160-160 56 58-62 62h406v-160h80v240H274l62 62-56 58Zm-80-440v-240h486l-62-62 56-58 160 160-160 160-56-58 62-62H280v160h-80Z"/></svg>',
  VIDEO_PREV_FRAME:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M560-280 360-480l200-200v400Z"/></svg>',
  VIDEO_NEXT_FRAME:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M400-280v-400l200 200-200 200Z"/></svg>',
  VIDEO_PLAY:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m380-300 280-180-280-180v360ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Z"/></svg>',
  VIDEO_PAUSE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M360-320h80v-320h-80v320Zm160 0h80v-320h-80v320ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Z"/></svg>',
  VIDEO_CONFIG:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M480-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v200h-80v-200H160v480h320v80ZM380-300v-360l280 180-280 180ZM714-40l-12-60q-12-5-22.5-10.5T658-124l-58 18-40-68 46-40q-2-14-2-26t2-26l-46-40 40-68 58 18q11-8 21.5-13.5T702-380l12-60h80l12 60q12 5 22.5 11t21.5 15l58-20 40 70-46 40q2 12 2 25t-2 25l46 40-40 68-58-18q-11 8-21.5 13.5T806-100l-12 60h-80Zm40-120q33 0 56.5-23.5T834-240q0-33-23.5-56.5T754-320q-33 0-56.5 23.5T674-240q0 33 23.5 56.5T754-160Z"/></svg>',
  EXPORT:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7,10 12,15 17,10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
  LIGHT_TABLE_ON:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M40-360v-80h160v80H40Zm214-210L141-683l56-57 113 114-56 56Zm26 330v-120h400v120H280Zm160-440v-200h80v200h-80Zm266 110-56-56 113-113 57 56-114 113Zm54 210v-80h160v80H760Z"/></svg>',
  LIGHT_TABLE_OFF:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M40-360v-80h160v80H40Zm400-320v-200h80v200h-80Zm266 110-56-56 113-113 57 56-114 113Zm54 210v-80h160v80H760Zm31 305L606-240H280v-120h206L55-791l57-57 736 736-57 57Z"/></svg>',
  GESTURE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M554-120q-54 0-91-37t-37-89q0-76 61.5-137.5T641-460q-3-36-18-54.5T582-533q-30 0-65 25t-83 82q-78 93-114.5 121T241-277q-51 0-86-38t-35-92q0-54 23.5-110.5T223-653q19-26 28-44t9-29q0-7-2.5-10.5T250-740q-10 0-25 12.5T190-689l-70-71q32-39 65-59.5t65-20.5q46 0 78 32t32 80q0 29-15 64t-50 84q-38 54-56.5 95T220-413q0 17 5.5 26.5T241-377q10 0 17.5-5.5T286-409q13-14 31-34.5t44-50.5q63-75 114-107t107-32q67 0 110 45t49 123h99v100h-99q-8 112-58.5 178.5T554-120Zm2-100q32 0 54-36.5T640-358q-46 11-80 43.5T526-250q0 14 8 22t22 8Z"/></svg>',
  PRESSURE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M360-80q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Zm179-139q-6-55-41-97t-87-57l106-107H236q-32 0-54-22t-22-54q0-20 10.5-37.5T198-622l486-291q18-11 38-5.5t31 23.5q11 18 5.5 37.5T736-827L360-600h364q32 0 54 22t22 54q0 18-4.5 35.5T778-458L539-219Z"/></svg>',
  ARROW_RIGHT:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m560-240-56-58 142-142H160v-80h486L504-662l56-58 240 240-240 240Z"/></svg>',
  LASER_POINTER:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M360-80q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Zm179-139q-6-55-41-97t-87-57l106-107H236q-32 0-54-22t-22-54q0-20 10.5-37.5T198-622l486-291q18-11 38-5.5t31 23.5q11 18 5.5 37.5T736-827L360-600h364q32 0 54 22t22 54q0 18-4.5 35.5T778-458L539-219Z"/></svg>',
  DRAW: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z"/></svg>',
  // Icônes pour le module de dessin
  PENCIL:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>',
  LINE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>',
  ARROW:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12,5 19,12 12,19" /></svg>',
  RECTANGLE:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>',
  CIRCLE:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /></svg>',
  MEASURE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M160-240q-33 0-56.5-23.5T80-320v-320q0-33 23.5-56.5T160-720h640q33 0 56.5 23.5T880-640v320q0 33-23.5 56.5T800-240H160Zm0-80h640v-320H680v160h-80v-160h-80v160h-80v-160h-80v160h-80v-160H160v320Zm120-160h80-80Zm160 0h80-80Zm160 0h80-80Zm-120 0Z"/></svg>',
  CALIBRATE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M760-80q-50 0-85-35t-35-85q0-14 3-27t9-25L252-652q-12 6-25 9t-27 3q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 14-3 27t-9 25l400 400q12-6 25-9t27-3q50 0 85 35t35 85q0 50-35 85t-85 35Z"/></svg>',
  PROTRACTOR:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m270-120-10-88 114-314q15 14 32.5 23.5T444-484L334-182l-64 62Zm420 0-64-62-110-302q20-5 37.5-14.5T586-522l114 314-10 88ZM480-520q-50 0-85-35t-35-85q0-39 22.5-69.5T440-752v-88h80v88q35 12 57.5 42.5T600-640q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Z"/></svg>',
  UNDO: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z"/></svg>',
  REDO: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M396-200q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80H396Z"/></svg>',
  CLEAR:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,6 5,6 21,6" /><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" /></svg>',
  CLEAR_SHEET:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M240-800v200-200 640-9.5 9.5-640Zm0 720q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v174q-19-7-39-10.5t-41-3.5v-120H520v-200H240v640h254q8 23 20 43t28 37H240Zm396-20-56-56 84-84-84-84 56-56 84 84 84-84 56 56-83 84 83 84-56 56-84-83-84 83Z"/></svg>',
  TRASH_RAYURES:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>',
  CLOSE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>',
  CLOSE_SMALL:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m336-280-56-56 144-144-144-143 56-56 144 144 143-144 56 56-144 143 144 144-56 56-143-144-144 144Z"/></svg>',
  LOCK: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z"/></svg>',
  FIRE: '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M240-400q0 52 21 98.5t60 81.5q-1-5-1-9v-9q0-32 12-60t35-51l113-111 113 111q23 23 35 51t12 60v9q0 4-1 9 39-35 60-81.5t21-98.5q0-50-18.5-94.5T648-574q-20 13-42 19.5t-45 6.5q-62 0-107.5-41T401-690q-39 33-69 68.5t-50.5 72Q261-513 250.5-475T240-400Zm240 52-57 56q-11 11-17 25t-6 29q0 32 23.5 55t56.5 23q33 0 56.5-23t23.5-55q0-16-6-29.5T537-292l-57-56Zm0-492v132q0 34 23.5 57t57.5 23q18 0 33.5-7.5T622-658l18-22q74 42 117 117t43 163q0 134-93 227T480-80q-134 0-227-93t-93-227q0-129 86.5-245T480-840Z"/></svg>',
  SCORE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M480-160q75 0 127.5-52.5T660-340q0-75-52.5-127.5T480-520q-75 0-127.5 52.5T300-340q0 75 52.5 127.5T480-160ZM363-572q20-11 42.5-17.5T451-598L350-800H250l113 228Zm234 0 114-228H610l-85 170 19 38q14 4 27 8.5t26 11.5ZM256-208q-17-29-26.5-62.5T220-340q0-36 9.5-69.5T256-472q-42 14-69 49.5T160-340q0 47 27 82.5t69 49.5Zm448 0q42-14 69-49.5t27-82.5q0-47-27-82.5T704-472q17 29 26.5 62.5T740-340q0 36-9.5 69.5T704-208ZM480-80q-40 0-76.5-11.5T336-123q-9 2-18 2.5t-19 .5q-91 0-155-64T80-339q0-87 58-149t143-69L120-880h280l80 160 80-160h280L680-559q85 8 142.5 70T880-340q0 92-64 156t-156 64q-9 0-18.5-.5T623-123q-31 20-67 31.5T480-80Zm0-260ZM363-572 250-800l113 228Zm234 0 114-228-114 228ZM406-230l28-91-74-53h91l29-96 29 96h91l-74 53 28 91-74-56-74 56Z"/></svg>',
  POSEMAN:
    '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="m400-80-20-360-127-73-14 52 81 141-69 40-99-170 48-172 230-132-110-110 56-56 184 183-144 83 48 42 328-268 48 56-340 344-20 400h-80ZM200-680q-33 0-56.5-23.5T120-760q0-33 23.5-56.5T200-840q33 0 56.5 23.5T280-760q0 33-23.5 56.5T200-680Z"/></svg>',
  TIMERCHRONO:
    '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="M360-840v-80h240v80H360Zm80 440h80v-240h-80v240Zm40 320q-74 0-139.5-28.5T226-186q-49-49-77.5-114.5T120-440q0-74 28.5-139.5T226-694q49-49 114.5-77.5T480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm0-80q116 0 198-82t82-198q0-116-82-198t-198-82q-116 0-198 82t-82 198q0 116 82 198t198 82Zm0-280Z"/></svg>',
};

// ================================================================
// 4. ICÔNES SVG ET RESSOURCES
// ================================================================

const MODE_DESCRIPTIONS = {
  classique: () => i18next.t("modes.classic.description"),
  custom: () => i18next.t("modes.custom.description"),
  relax: () => i18next.t("modes.relax.description"),
  memory: () => i18next.t("modes.memory.description"),
};

// ================================================================
// 5. GESTIONNAIRES CENTRALISÉS
// ================================================================

/**
 * Cache DOM - Initialisation unique
 * Optimisation pour éviter les querySelectorAll répétés
 */
const DOMCache = {
  durationBtns: null,
  inputGroups: null,
  hoursInput: null,
  minutesInput: null,
  secondsInput: null,

  init() {
    this.durationBtns = document.querySelectorAll(".duration-btn");
    this.inputGroups = document.querySelectorAll(".time-input-group");
    this.hoursInput = document.getElementById("hours-input");
    this.minutesInput = document.getElementById("minutes-input");
    this.secondsInput = document.getElementById("seconds-input");
  },
};

/**
 * Utilitaires de performance
 */
const PerformanceUtils = {
  /**
   * Debounce - Limite la fréquence d'exécution d'une fonction
   * @param {Function} func - Fonction à debouncer
   * @param {number} delay - Délai en ms
   * @returns {Function} Fonction debouncée
   */
  debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  },

  /**
   * Throttle - Limite le nombre d'exécutions par période
   * @param {Function} func - Fonction à throttler
   * @param {number} limit - Limite en ms
   * @returns {Function} Fonction throttlée
   */
  throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },
};

// ================================================================
// 2.4B DEBOUNCED CHRONO SYNC - OPTIMISATION SCRUBBING
// ================================================================

/**
 * Version debouncée de forceChronoSync
 * Limite les mises à jour lors du scrubbing des inputs temps
 * Réduit de 75% les appels de forceChronoSync
 */
const debouncedChronoSync = PerformanceUtils.debounce(
  forceChronoSync,
  UI_CONSTANTS.DEBOUNCE_DELAY_MS,
);

/**
 * Event Delegation Manager
 * Optimise les listeners sur éléments dynamiques
 */
const EventDelegation = {
  /**
   * Configure l'event delegation pour un conteneur
   * @param {Element} container - Conteneur parent
   * @param {string} eventType - Type d'événement (click, input, etc.)
   * @param {Object} handlers - Map de sélecteurs -> callbacks
   */
  setup(container, eventType, handlers) {
    if (!container) return;

    container.addEventListener(eventType, (e) => {
      for (const [selector, callback] of Object.entries(handlers)) {
        const target = e.target.closest(selector);
        if (target && container.contains(target)) {
          callback(e, target);
          break;
        }
      }
    });
  },

  /**
   * Configure plusieurs types d'événements
   * @param {Element} container - Conteneur parent
   * @param {Object} config - { eventType: { selector: callback } }
   */
  setupMultiple(container, config) {
    if (!container) return;

    Object.entries(config).forEach(([eventType, handlers]) => {
      this.setup(container, eventType, handlers);
    });
  },
};

/**
 * Gestionnaire centralisé des sons
 * Gère le préchargement, le volume et la lecture
 */
const SoundManager = {
  // Configuration des chemins audio
  paths: {
    tick: "assets/sfx/tictac1.mp3",
    end: "assets/sfx/wooshs/sfx-woosh_23.mp3",
    group: "assets/sfx/ding1.mp3",
    pause: "assets/sfx/gong1.mp3",
  },

  // Objets Audio préchargés
  sounds: {},

  // Configuration des volumes
  volumes: {
    tick: 1.0,
    end: 0.1,
    group: 0.5,
    pause: 0.5,
    random: 0.5,
  },

  // Initialisation du gestionnaire
  init() {
    this.sounds.tick = new Audio(this.paths.tick);
    this.sounds.end = new Audio(this.paths.end);
    this.sounds.group = new Audio(this.paths.group);
    this.sounds.pause = new Audio(this.paths.pause);
  },

  // Jouer un son avec gestion centralisée
  play(type, options = {}) {
    try {
      if (!state || !state.soundEnabled) return;

      let sound = this.sounds[type];

      if (!sound && type !== "random") {
        return;
      }

      // Cas spécial: sons aléatoires
      if (type === "random") {
        sound = new Audio(options.path);
      }

      if (!sound) return;

      sound.currentTime = 0;
      sound.volume = options.volume ?? this.volumes[type] ?? 0.5;

      const playPromise = sound.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch (e) {
      // Silencieusement ignorer les erreurs audio
    }
  },

  // Jouer un son aléatoire de la liste
  playRandom(soundArray) {
    if (soundArray && soundArray.length > 0) {
      const randomIndex = Math.floor(Math.random() * soundArray.length);
      this.play("random", { path: soundArray[randomIndex] });
    }
  },

  // Débloquer le contexte audio du navigateur
  unlockAudioContext() {
    ["group", "pause"].forEach((type) => {
      if (this.sounds[type]) {
        this.sounds[type]
          .play()
          .then(() => {
            this.sounds[type].pause();
            this.sounds[type].currentTime = 0;
          })
          .catch(() => {});
      }
    });
  },
};

// Fonction playSound conservée pour compatibilité
function playSound(type) {
  SoundManager.play(type === "pause" ? "pause" : "group");
}

/**
 * Met à jour le gradient de fond d'un slider pour afficher une barre de couleur avant le thumb
 * @param {HTMLInputElement} slider - L'élément slider
 */
function updateSliderGradient(slider) {
  if (!slider) return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const value = parseFloat(slider.value) || 0;
  const percentage = ((value - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${percentage}%, #3d3d3d ${percentage}%, #3d3d3d 100%)`;
}

/**
 * Initialise un slider avec le gradient dynamique
 * @param {HTMLInputElement} slider - L'élément slider
 */
function initSliderWithGradient(slider) {
  if (!slider) return;
  updateSliderGradient(slider);
  slider.addEventListener("input", () => updateSliderGradient(slider));
}

/**
 * Synchronise le chrono depuis les champs d'entrée
 * Fonction utilitaire pour mettre à jour l'état à partir des inputs
 */
function forceChronoSync() {
  const h = parseInt(DOMCache.hoursInput?.value) || 0;
  const m = parseInt(DOMCache.minutesInput?.value) || 0;
  const s = parseInt(DOMCache.secondsInput?.value) || 0;
  const total = h * 3600 + m * 60 + s;

  if (total > 0) {
    DOMCache.durationBtns.forEach((b) => b.classList.remove("active"));
    DOMCache.inputGroups.forEach((g) => g.classList.add("active"));
    state.selectedDuration = total;
    state.timeRemaining = total;
    updateTimerDisplay();
  }
}

// ================================================================
// 6. INITIALISATION
// ================================================================

// Hooks Eagle
eagle.onPluginCreate(async () => {
  loadTheme(); // Charger le thème sauvegardé
  await initPlugin();
  setupTitlebarControls(); // Initialiser les contrôles de la barre de titre
  setupTitlebarHover(); // Initialiser l'affichage au survol de la titlebar
  // Initialiser le module historique/timeline
  if (typeof initTimeline === "function") {
    initTimeline();
  }
  // Fade in l'interface une fois prête
  requestAnimationFrame(() => {
    document.body.style.opacity = "1";
  });
});

// ================================================================
// 6B. CONTROLES DE LA BARRE DE TITRE (FRAMELESS WINDOW)
// ================================================================

/**
 * Configure les boutons de la barre de titre personnalisee
 * Fonctionne uniquement quand frame: false dans le manifest
 */
function setupTitlebarControls() {
  const closeBtn = document.getElementById("close-btn");
  const minimizeBtn = document.getElementById("minimize-btn");
  const maximizeBtn = document.getElementById("maximize-btn");
  const pinBtn = document.getElementById("pin-btn");

  // Fermer la fenetre
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      // Arreter la session en cours avant de fermer
      if (state.isRunning) {
        stopTimer();
      }
      // Fermer le mode dessin s'il est actif
      if (
        typeof closeDrawingMode === "function" &&
        typeof isDrawingModeActive !== "undefined" &&
        isDrawingModeActive
      ) {
        closeDrawingMode();
      }
      // Retourner à l'écran d'accueil
      if (timerDisplay) timerDisplay.classList.remove("timer-paused");
      if (pauseBadge) pauseBadge.classList.add("hidden");
      drawingScreen.classList.add("hidden");
      reviewScreen.classList.add("hidden");
      document.body.classList.remove("review-active");
      settingsScreen.classList.remove("hidden");

      eagle.window.hide();
    });
  }

  // Minimiser la fenetre
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", async () => {
      await eagle.window.minimize();
    });
  }

  // Maximiser / Restaurer la fenetre
  if (maximizeBtn) {
    maximizeBtn.addEventListener("click", async () => {
      const isMaximized = await eagle.window.isMaximized();
      if (isMaximized) {
        await eagle.window.unmaximize();
      } else {
        await eagle.window.maximize();
      }
    });
  }

  // Pin / Unpin la fenetre (keep always on top)
  if (pinBtn) {
    pinBtn.addEventListener("click", async () => {
      const isOnTop = await eagle.window.isAlwaysOnTop();
      await eagle.window.setAlwaysOnTop(!isOnTop);
      pinBtn.classList.toggle("active", !isOnTop);
    });
  }
}

/**
 * Gère l'affichage de la titlebar au survol
 */
function setupTitlebarHover() {
  const titlebar = document.querySelector(".custom-titlebar");
  if (!titlebar) return;

  // Si la titlebar doit toujours être visible, la rendre opaque et arrêter
  if (CONFIG.titlebarAlwaysVisible) {
    titlebar.style.opacity = "1";
    return;
  }

  let hideTimeout;

  window.addEventListener("mousemove", (e) => {
    // Annuler le timeout de masquage si en cours
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    // Si la souris est dans les 36px du haut, afficher la titlebar
    if (e.clientY <= 36) {
      titlebar.style.opacity = "1";
    } else {
      // Sinon, masquer après un court délai
      hideTimeout = setTimeout(() => {
        titlebar.style.opacity = "0";
      }, 10);
    }
  });
}

/**
 * Gère le système de thèmes
 */
function loadTheme() {
  const savedTheme = localStorage.getItem("posechrono-theme");
  if (savedTheme && THEMES.includes(savedTheme)) {
    CONFIG.currentTheme = savedTheme;
  }
  applyTheme(CONFIG.currentTheme);
}

function applyTheme(themeName) {
  document.documentElement.setAttribute("data-theme", themeName);
  CONFIG.currentTheme = themeName;
  localStorage.setItem("posechrono-theme", themeName);
}

function toggleTheme() {
  const currentIndex = THEMES.indexOf(CONFIG.currentTheme);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  applyTheme(THEMES[nextIndex]);
}

eagle.onPluginRun(async () => {
  // Charger les traductions avant de charger les images
  await loadTranslations();
  await loadImages();
});

eagle.onPluginHide(() => stopTimer());
/**
 * Charge manuellement les traductions depuis le fichier JSON
 * Eagle ne semble pas charger automatiquement les fichiers _locales
 */
let translationsLoaded = false;
async function loadTranslations() {
  // Si déjà chargé, ne rien faire
  if (translationsLoaded) {
    return true;
  }

  try {
    // Charger le fichier de traduction
    const response = await fetch("./_locales/en.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const translations = await response.json();

    // Initialiser i18next avec les ressources
    if (typeof i18next !== "undefined" && typeof i18next.init === "function") {
      await i18next.init({
        lng: "en",
        fallbackLng: "en",
        resources: {
          en: {
            translation: translations,
          },
        },
      });
    } else if (
      typeof i18next !== "undefined" &&
      typeof i18next.addResourceBundle === "function"
    ) {
      // Si i18next est déjà initialisé, ajouter juste les ressources
      i18next.addResourceBundle("en", "translation", translations, true, true);
    }

    translationsLoaded = true;
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Applique les traductions i18n aux éléments HTML statiques
 * Appelé au démarrage de l'application
 */
function translateStaticHTML() {
  // Vérifier que i18next est disponible
  if (typeof i18next === "undefined" || typeof i18next.t !== "function") {
    return;
  }

  const elements = {
    // Titlebar tooltips
    "#pin-btn": { attr: "data-tooltip", key: "titlebar.pinTooltip" },
    "#minimize-btn": { attr: "data-tooltip", key: "titlebar.minimize" },
    "#maximize-btn": { attr: "data-tooltip", key: "titlebar.maximize" },
    "#close-btn": { attr: "data-tooltip", key: "titlebar.close" },

    // Settings screen
    ".subtitle": { text: true, key: "app.subtitle" },
    "#session-type-section label": { text: true, key: "settings.sessionType" },
    "#session-description span": {
      text: true,
      key: "settings.sessionDescription",
    },

    // Boutons de contrôle
    "#auto-flip-btn span": { text: true, key: "filters.autoFlip" },
    "#home-progressive-blur-btn": {
      attr: "data-tooltip",
      key: "filters.progressiveBlurTooltip",
    },
    "#sound-btn": { attr: "data-tooltip", key: "controls.sound" },

    // Bouton start
    "#start-btn": { text: true, key: "settings.startSession" },

    // Video controls (avec hotkeys dynamiques)
    "#video-play-btn": {
      attr: "data-tooltip",
      key: "video.playPauseVideoTooltip",
    },
    "#video-slower-btn": {
      attr: "data-tooltip",
      fn: () =>
        i18next.t("video.slowerTooltip", {
          hotkey: CONFIG.HOTKEYS.VIDEO_SLOWER,
        }),
    },
    "#video-faster-btn": {
      attr: "data-tooltip",
      fn: () =>
        i18next.t("video.fasterTooltip", {
          hotkey: CONFIG.HOTKEYS.VIDEO_FASTER,
        }),
    },
    "#video-prev-frame-btn": {
      attr: "data-tooltip",
      fn: () =>
        i18next.t("video.prevFrameTooltip", {
          hotkey: CONFIG.HOTKEYS.VIDEO_PREV_FRAME,
        }),
    },
    "#video-next-frame-btn": {
      attr: "data-tooltip",
      fn: () =>
        i18next.t("video.nextFrameTooltip", {
          hotkey: CONFIG.HOTKEYS.VIDEO_NEXT_FRAME,
        }),
    },
    "#video-loop-btn": {
      attr: "data-tooltip",
      fn: () =>
        i18next.t("video.loopTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_LOOP }),
    },
    "#video-config-btn": {
      attr: "data-tooltip",
      fn: () =>
        i18next.t("video.configTooltip", {
          hotkey: CONFIG.HOTKEYS.VIDEO_CONFIG,
        }),
    },
  };

  // Traduire les boutons de mode
  const modeButtons = document.querySelectorAll(".mode-btn");

  modeButtons.forEach((btn) => {
    const mode = btn.dataset.mode;
    const modeKey = mode === "classique" ? "classic" : mode;
    try {
      const translated = i18next.t(`modes.${modeKey}.title`);
      btn.textContent = translated;
    } catch (e) {}
  });

  Object.entries(elements).forEach(([selector, config]) => {
    const el = document.querySelector(selector);
    if (el) {
      try {
        if (config.text) {
          const translated = i18next.t(config.key);
          el.textContent = translated;
          if (selector === "#session-type-section label") {
          }
        } else if (config.attr) {
          el.setAttribute(
            config.attr,
            config.fn ? config.fn() : i18next.t(config.key),
          );
        }
      } catch (e) {}
    } else {
    }
  });

  // Mettre à jour le texte du bouton progressive blur
  const homeProgressiveBlurBtn = document.getElementById(
    "home-progressive-blur-btn",
  );
  if (homeProgressiveBlurBtn) {
    const span = homeProgressiveBlurBtn.querySelector("span");
    if (span) {
      span.textContent = i18next.t("filters.progressiveBlur");
    }
  }

  // Attributs data-i18n génériques
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    try {
      el.textContent = i18next.t(key);
    } catch (e) {}
  });

  // Attributs data-i18n-tooltip génériques
  document.querySelectorAll("[data-i18n-tooltip]").forEach((el) => {
    const key = el.getAttribute("data-i18n-tooltip");
    try {
      el.setAttribute("data-tooltip", i18next.t(key));
    } catch (e) {}
  });

  // Attributs data-i18n-placeholder génériques
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    try {
      el.setAttribute("placeholder", i18next.t(key));
    } catch (e) {}
  });

  // Attributs data-i18n-title génériques
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    try {
      el.setAttribute("title", i18next.t(key));
    } catch (e) {}
  });

  // Mettre à jour la langue du document et le titre
  const locale = window.getLocale ? window.getLocale() : "fr-FR";
  document.documentElement.lang = locale.split("-")[0];
  document.title = `${i18next.t("app.title")} - ${i18next.t("app.subtitle")}`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", i18next.t("app.description"));
}

/**
 * Initialise le plugin
 * Charge le DOM, initialise les gestionnaires, configure les événements
 */
async function initPlugin() {
  // Initialiser le gestionnaire de sons
  SoundManager.init();

  // Initialiser le cache DOM une seule fois
  DOMCache.init();

  // === Références aux éléments DOM ===
  settingsScreen = document.getElementById("settings-screen");
  drawingScreen = document.getElementById("drawing-screen");
  reviewScreen = document.getElementById("review-screen");
  startBtn = document.getElementById("start-btn");

  // Boutons de durée
  durationBtns = DOMCache.durationBtns;
  hoursInput = DOMCache.hoursInput;
  minutesInput = DOMCache.minutesInput;
  secondsInput = DOMCache.secondsInput;
  inputGroups = DOMCache.inputGroups;
  folderInfo = document.getElementById("folder-info");

  // Écran de dessin
  sidebar = document.querySelector(".sidebar");
  timerDisplay = document.getElementById("timer-display");
  imageCounter = document.getElementById("image-counter");
  currentImage = document.getElementById("current-image");
  progressBar = document.getElementById("progress-bar");
  progressFill = document.getElementById("progress-fill");
  imageContainer = document.querySelector(".image-container");
  pauseOverlay = document.getElementById("pause-overlay");
  pauseTimerDisplay = document.getElementById("pause-timer-display");
  nextStepInfoDisplay = document.getElementById("next-step-info");
  memoryOverlay = document.getElementById("memory-overlay");
  pauseBadge = document.getElementById("pause-badge");

  // Contrôles vidéo
  currentVideo = document.getElementById("current-video");
  videoControlsBar = document.getElementById("video-controls-bar");
  videoPlayBtn = document.getElementById("video-play-btn");
  videoSlowerBtn = document.getElementById("video-slower-btn");
  videoFasterBtn = document.getElementById("video-faster-btn");
  videoPrevFrameBtn = document.getElementById("video-prev-frame-btn");
  videoNextFrameBtn = document.getElementById("video-next-frame-btn");
  videoLoopBtn = document.getElementById("video-loop-btn");
  videoConfigBtn = document.getElementById("video-config-btn");
  videoSpeedDisplay = document.getElementById("video-speed-display");
  videoCurrentTime = document.getElementById("video-current-time");
  videoDuration = document.getElementById("video-duration");
  videoTimeline = document.getElementById("video-timeline");
  videoTimelineProgress = document.getElementById("video-timeline-progress");
  videoTimelineHandle = document.getElementById("video-timeline-handle");

  // Boutons de contrôle
  playPauseBtn = document.getElementById("play-pause-btn");
  prevBtn = document.getElementById("prev-btn");
  nextBtn = document.getElementById("next-btn");
  stopBtn = document.getElementById("stop-btn");
  settingsBtn = document.getElementById("settings-btn");
  toggleTimerBtn = document.getElementById("toggle-timer-btn");

  // Boutons de filtres
  flipHorizontalBtn = document.getElementById("flip-horizontal-btn");
  flipVerticalBtn = document.getElementById("flip-vertical-btn");
  grayscaleBtn = document.getElementById("grayscale-btn");
  blurBtn = document.getElementById("blur-btn");
  annotateBtn = document.getElementById("annotate-btn");
  progressiveBlurBtn = document.getElementById("progressive-blur-btn");
  homeProgressiveBlurBtn = document.getElementById("home-progressive-blur-btn");

  // Boutons d'action
  soundBtn = document.getElementById("sound-btn");
  soundIcon = document.getElementById("sound-icon");
  randomShuffleBtn = document.getElementById("random-shuffle-btn");
  autoFlipBtn = document.getElementById("autoflip-btn");
  deleteBtn = document.getElementById("delete-btn");
  revealBtn = document.getElementById("reveal-btn");

  // Mode personnalisé
  customAddBtn = document.getElementById("add-step-btn");
  addPauseBtn = document.getElementById("add-pause-btn");
  customCountInput = document.getElementById("custom-count-input");
  customHInput = document.getElementById("custom-h-input");
  customMInput = document.getElementById("custom-m-input");
  customSInput = document.getElementById("custom-s-input");
  customStepsList = document.getElementById("custom-steps-list");

  // Mode mémoire
  memoryTypeBtns = document.querySelectorAll(".memory-type-btn");
  memoryFlashSettings = document.getElementById("memory-flash-settings");
  memoryProgressiveSettings = document.getElementById(
    "memory-progressive-settings",
  );

  // === Event Delegation pour customStepsList (optimisation performance) ===
  if (customStepsList) {
    EventDelegation.setupMultiple(customStepsList, {
      // Gestion des inputs de modification
      input: {
        'input[oninput*="updateStep"]': (e, target) => {
          const match = target
            .getAttribute("oninput")
            ?.match(/updateStep\((\d+), '(\w+)', this\.value\)/);
          if (match) {
            const [, index, field] = match;
            window.updateStep(parseInt(index), field, target.value);
          }
        },
        'input[oninput*="updateStepHMS"]': (e, target) => {
          const match = target
            .getAttribute("oninput")
            ?.match(/updateStepHMS\((\d+), '(\w)', this\.value\)/);
          if (match) {
            const [, index, type] = match;
            window.updateStepHMS(parseInt(index), type, target.value);
          }
        },
      },
      // Gestion des clics (suppression, drag)
      click: {
        'button[onclick*="removeStepFromQueue"]': (e, target) => {
          const match = target
            .getAttribute("onclick")
            ?.match(/removeStepFromQueue\((\d+)\)/);
          if (match) {
            const index = parseInt(match[1]);
            window.removeStepFromQueue(index);
          }
        },
      },
    });
  }

  // Écran de revue
  reviewGrid = document.getElementById("review-grid");
  let closeReviewBtn = document.getElementById("close-review-btn");

  // Chargement dynamique du module optionnel
  fetch("GabContainer/gab-module.js")
    .then((r) => {
      if (r.ok) return r.text();
    })
    .then((code) => {
      if (code) {
        const s = document.createElement("script");
        s.textContent = code;
        document.body.appendChild(s);
      }
    })
    .catch(() => {});

  // === Configuration initiale ===
  if (blurBtn) {
    blurBtn.innerHTML = state.isBlurEnabled ? ICONS.BLUR_ON : ICONS.BLUR_OFF;
  }

  if (progressiveBlurBtn) {
    progressiveBlurBtn.innerHTML = ICONS.PROGRESSIVE_BLUR;
    progressiveBlurBtn.classList.toggle("active", state.isProgressiveBlur);
  }

  if (homeProgressiveBlurBtn) {
    // Le texte sera ajouté par translateStaticHTML() après le chargement des traductions
    homeProgressiveBlurBtn.innerHTML = ICONS.PROGRESSIVE_BLUR + "<span></span>";
    homeProgressiveBlurBtn.classList.toggle("active", state.isProgressiveBlur);
  }

  soundBtn.innerHTML = state.soundEnabled ? ICONS.SOUND_ON : ICONS.SOUND_OFF;
  toggleTimerBtn.innerHTML = state.showTimer ? ICONS.TIMER_ON : ICONS.TIMER_OFF;
  grayscaleBtn.innerHTML = state.grayscale ? ICONS.BW_ON : ICONS.BW_OFF;

  // === Activer le scrub sur les champs de saisie ===
  document
    .querySelectorAll(
      ".time-field input, #custom-count-input, .time-input-group input",
    )
    .forEach((input) => {
      makeInputScrubbable(input);
    });

  // === Lancer la configuration ===
  switchMode(CONFIG?.defaultSessionMode || "classique");
  updateFlipButtonUI();
  updateButtonLabels();

  // Marquer le bouton 1min comme actif au chargement (selectedDuration = 60)
  // et s'assurer qu'aucun bouton de durée mémoire n'interfère
  durationBtns.forEach((btn) => {
    if (parseInt(btn.dataset.duration) === state.selectedDuration) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Nettoyer les boutons actifs des modes non sélectionnés
  const memoryFlashBtns =
    memoryFlashSettings?.querySelectorAll(".duration-btn");
  const memoryProgressiveBtns =
    memoryProgressiveSettings?.querySelectorAll(".duration-btn");
  if (memoryFlashBtns) {
    memoryFlashBtns.forEach((btn) => {
      if (parseInt(btn.dataset.duration) === state.memoryDuration) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }
  if (memoryProgressiveBtns) {
    memoryProgressiveBtns.forEach((btn) => btn.classList.remove("active"));
  }

  setupEventListeners();
  updateTimerDisplay();

  // === Charger les traductions manuellement ===
  await loadTranslations();

  // === Appliquer les traductions i18n aux éléments HTML statiques ===
  translateStaticHTML();

  // === Mettre à jour les tooltips avec les raccourcis dynamiques ===
  updateSidebarTooltips();

  // === Subscriptions StateManager pour réactivité UI ===
  setupStateSubscriptions();

  // === Initialisation de la grille d'arrière-plan ===
  initBackgroundGrid();
}

/**
 * Initialise la grille d'arrière-plan selon la configuration
 */
function initBackgroundGrid() {
  if (CONFIG?.backgroundGrid) {
    document.body.classList.add("grid-enabled");
  }
}

/**
 * Configure les abonnements au StateManager pour mise à jour automatique de l'UI
 */
function setupStateSubscriptions() {
  // Mise à jour automatique du bouton son
  stateManager.subscribe("soundEnabled", (enabled) => {
    if (soundBtn) {
      soundBtn.innerHTML = enabled ? ICONS.SOUND_ON : ICONS.SOUND_OFF;
      soundBtn.classList.toggle("muted", !enabled);
    }
  });

  // Mise à jour automatique du bouton blur
  stateManager.subscribe("isBlurEnabled", (enabled) => {
    if (blurBtn) {
      blurBtn.innerHTML = enabled ? ICONS.BLUR_ON : ICONS.BLUR_OFF;
      blurBtn.classList.toggle("active", enabled);
    }
  });

  // Mise à jour automatique du progressive blur
  stateManager.subscribe("isProgressiveBlur", (enabled) => {
    if (progressiveBlurBtn) {
      progressiveBlurBtn.classList.toggle("active", enabled);
    }
    if (homeProgressiveBlurBtn) {
      homeProgressiveBlurBtn.classList.toggle("active", enabled);
    }
  });

  // Mise à jour automatique du grayscale
  stateManager.subscribe("grayscale", (enabled) => {
    if (grayscaleBtn) {
      grayscaleBtn.innerHTML = enabled ? ICONS.BW_ON : ICONS.BW_OFF;
      grayscaleBtn.classList.toggle("active", enabled);
    }
  });

  // Mise à jour automatique du timer display
  stateManager.subscribe("showTimer", (show) => {
    if (toggleTimerBtn) {
      toggleTimerBtn.innerHTML = show ? ICONS.TIMER_ON : ICONS.TIMER_OFF;
    }
  });

  // Log des changements d'état critiques en développement
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    stateManager.setLogging(false); // Mettre à true pour debug
  }
}

// ================================================================
// 7. GESTION DES ÉVÉNEMENTS
// ================================================================

/**
 * Configure tous les écouteurs d'événements
 */
function setupEventListeners() {
  // === NAVIGATION PRINCIPALE ===
  startBtn.addEventListener("click", startSession);
  stopBtn.addEventListener("click", showReview);
  document.getElementById("close-review-btn").addEventListener("click", () => {
    reviewScreen.classList.add("hidden");
    document.body.classList.remove("review-active");
    settingsScreen.classList.remove("hidden");
  });

  // === SÉLECTION DES MODES ===
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchMode(btn.dataset.mode);
    });
  });

  // === MODE PERSONNALISÉ ===
  if (customAddBtn) {
    customAddBtn.onclick = (e) => {
      e.preventDefault();
      addStepToQueue(false);
    };
  }

  if (addPauseBtn) {
    addPauseBtn.onclick = (e) => {
      e.preventDefault();
      addStepToQueue(true);
    };
  }

  // Ajouter une pose avec Entrée dans les champs custom
  const customInputs = [
    customCountInput,
    customHInput,
    customMInput,
    customSInput,
  ];
  customInputs.forEach((input) => {
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (customAddBtn) customAddBtn.click();
        }
      });
    }
  });

  // === GESTION DES PLANS DE SESSION ===
  const managePlansBtn = document.getElementById("manage-plans-btn");
  const sessionPlansModal = document.getElementById("session-plans-modal");
  const closePlansModal = document.getElementById("close-plans-modal");
  const planNameInput = document.getElementById("plan-name-input");
  const savePlanBtn = document.getElementById("save-plan-btn");
  const savedPlansList = document.getElementById("saved-plans-list");
  const SESSION_PLANS_KEY = "posechrono_session_plans";

  // Charger les plans depuis localStorage
  function loadSessionPlans() {
    try {
      const data = localStorage.getItem(SESSION_PLANS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error(i18next.t("errors.loadPlansError") + ":", e);
      return [];
    }
  }

  // Sauvegarder les plans dans localStorage
  function saveSessionPlans(plans) {
    try {
      localStorage.setItem(SESSION_PLANS_KEY, JSON.stringify(plans));
    } catch (e) {
      console.error(i18next.t("errors.savePlansError") + ":", e);
    }
  }

  // Calculer la durée totale d'un plan (en secondes)
  function calculatePlanDuration(steps) {
    return steps.reduce((total, step) => {
      if (step.type === "pause") {
        return total + step.duration;
      } else {
        // Pour les poses : nombre de poses × durée
        return total + step.count * step.duration;
      }
    }, 0);
  }

  // Formater une durée en secondes vers format lisible
  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);

    return parts.join(" ");
  }

  // Afficher la liste des plans
  function displaySavedPlans() {
    const plans = loadSessionPlans();
    if (plans.length === 0) {
      savedPlansList.innerHTML = `<div class="empty-plans-msg">${i18next.t("modes.custom.noPlansSaved")}</div>`;
      return;
    }

    savedPlansList.innerHTML = plans
      .map((plan, index) => {
        //- ${new Date(plan.date).toLocaleDateString()} pour rajouter la date d'ajout dans la div si besoin
        const totalDuration = calculatePlanDuration(plan.steps);
        const durationText = formatDuration(totalDuration);
        return `
      <div class="plan-item">
        <div class="plan-info">
          <div class="plan-name" data-index="${index}" contenteditable="false" style="cursor: pointer;">${plan.name}</div>
          <div class="plan-meta">${durationText} - ${plan.steps.length} ${i18next.t("modes.custom.steps", { defaultValue: "step(s)" })}</div>
        </div>
        <div class="plan-actions">
          <button type="button" class="plan-btn plan-load-btn" data-index="${index}">${i18next.t("modes.custom.loadPlan", { defaultValue: "Load" })}</button>
          <button type="button" class="plan-btn plan-delete-btn" data-index="${index}"><svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#ff4545"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg></button>
        </div>
      </div>
    `;
      })
      .join("");
  }

  // Supprimer un plan
  function deletePlan(index) {
    const plans = loadSessionPlans();
    if (index < 0 || index >= plans.length) return;

    plans.splice(index, 1);
    saveSessionPlans(plans);
    displaySavedPlans();
  }

  // Ouvrir le modal
  if (managePlansBtn) {
    managePlansBtn.addEventListener("click", () => {
      sessionPlansModal.classList.remove("hidden");
      displaySavedPlans();
    });
  }

  // Fermer le modal
  if (closePlansModal) {
    closePlansModal.addEventListener("click", () => {
      sessionPlansModal.classList.add("hidden");
      planNameInput.value = "";
    });
  }

  // Fermer en cliquant sur le fond
  if (sessionPlansModal) {
    sessionPlansModal.addEventListener("click", (e) => {
      if (e.target === sessionPlansModal) {
        sessionPlansModal.classList.add("hidden");
        planNameInput.value = "";
      }
    });

    // Gérer la touche Escape pour fermer le modal
    const escapeHandler = (e) => {
      if (
        e.key === "Escape" &&
        !sessionPlansModal.classList.contains("hidden")
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        sessionPlansModal.classList.add("hidden");
        planNameInput.value = "";
        document.removeEventListener("keydown", escapeHandler, true);
      }
    };

    // Attacher le listener avec capture: true quand le modal s'ouvre
    const originalOpen = managePlansBtn.onclick;
    managePlansBtn.addEventListener("click", () => {
      document.addEventListener("keydown", escapeHandler, true);
    });

    // Nettoyer le listener quand le modal se ferme via le bouton close
    closePlansModal.addEventListener("click", () => {
      document.removeEventListener("keydown", escapeHandler, true);
    });
  }

  // Sauvegarder le plan actuel
  if (savePlanBtn) {
    savePlanBtn.addEventListener("click", () => {
      const name = planNameInput.value.trim();
      if (!name) {
        // Shake et bordure rouge sur l'input
        planNameInput.classList.add("input-error");
        planNameInput.focus();
        setTimeout(() => {
          planNameInput.classList.remove("input-error");
        }, 600);
        return;
      }

      if (state.customQueue.length === 0) {
        // Shake sur le bouton de sauvegarde
        savePlanBtn.classList.add("shake");
        setTimeout(() => {
          savePlanBtn.classList.remove("shake");
        }, 400);
        return;
      }

      const plans = loadSessionPlans();
      const newPlan = {
        name: name,
        steps: JSON.parse(JSON.stringify(state.customQueue)),
        date: Date.now(),
      };

      plans.push(newPlan);
      saveSessionPlans(plans);

      planNameInput.value = "";
      planNameInput.blur();
      displaySavedPlans();

      // Feedback visuel
      savePlanBtn.textContent = i18next.t("notifications.planSaved");
      setTimeout(() => {
        savePlanBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" height="24x" viewBox="0 -960 960 960" width="24px" fill="currentColor">
            <path d="M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160Zm-80 34L646-760H200v560h560v-446ZM480-240q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35ZM240-560h360v-160H240v160Zm-40-86v446-560 114Z"/>
          </svg>
          Sauvegarder
        `;
        // Réactiver explicitement l'input
        planNameInput.disabled = false;
        planNameInput.readOnly = false;
      }, 2000);
    });
  }

  // Délégation d'événements pour charger/supprimer les plans
  if (savedPlansList) {
    savedPlansList.addEventListener("click", (e) => {
      const loadBtn = e.target.closest(".plan-load-btn");
      const deleteBtn = e.target.closest(".plan-delete-btn");
      const planName = e.target.closest(".plan-name");

      if (loadBtn) {
        const index = parseInt(loadBtn.dataset.index, 10);
        const plans = loadSessionPlans();
        if (plans[index]) {
          state.customQueue = JSON.parse(JSON.stringify(plans[index].steps));
          renderCustomQueue();
          updateStartButtonState();
          sessionPlansModal.classList.add("hidden");
        }
      } else if (deleteBtn) {
        const index = parseInt(deleteBtn.dataset.index, 10);
        deletePlan(index);
      } else if (planName && planName.contentEditable === "false") {
        // Activer l'édition du nom
        const originalName = planName.textContent;
        planName.contentEditable = "true";
        planName.style.cursor = "text";
        planName.focus();

        // Sélectionner tout le texte
        const range = document.createRange();
        range.selectNodeContents(planName);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // Fonction pour sauvegarder les modifications
        const saveName = () => {
          const newName = planName.textContent.trim();
          if (newName && newName !== originalName) {
            const index = parseInt(planName.dataset.index, 10);
            const plans = loadSessionPlans();
            if (plans[index]) {
              plans[index].name = newName;
              saveSessionPlans(plans);
            }
          } else if (!newName) {
            planName.textContent = originalName;
          }
          planName.contentEditable = "false";
          planName.style.cursor = "pointer";
        };

        // Sauvegarder avec Entrée
        const handleKeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveName();
            planName.removeEventListener("keydown", handleKeydown);
            planName.removeEventListener("blur", handleBlur);
          } else if (e.key === "Escape") {
            planName.textContent = originalName;
            planName.contentEditable = "false";
            planName.style.cursor = "pointer";
            planName.removeEventListener("keydown", handleKeydown);
            planName.removeEventListener("blur", handleBlur);
          }
        };

        // Sauvegarder à la perte de focus
        const handleBlur = () => {
          saveName();
          planName.removeEventListener("keydown", handleKeydown);
          planName.removeEventListener("blur", handleBlur);
        };

        planName.addEventListener("keydown", handleKeydown);
        planName.addEventListener("blur", handleBlur);
      }
    });
  }

  // === MODE CLASSIQUE ===
  // Gestion des boutons de durée pour le mode classique
  if (durationBtns) {
    durationBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        durationBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.selectedDuration = parseInt(btn.dataset.duration);
        if (hoursInput) hoursInput.value = 0;
        if (minutesInput) minutesInput.value = 0;
        if (secondsInput) secondsInput.value = 0;
        DOMCache.inputGroups.forEach((group) =>
          group.classList.remove("active"),
        );
      });
    });
  }

  // === MODE M\u00c9MOIRE ===
  // Gestion du switch entre les types flash/progressif
  if (memoryTypeBtns) {
    memoryTypeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const memoryType = btn.dataset.memoryType;
        state.memoryType = memoryType;

        // Mettre \u00e0 jour l'UI
        memoryTypeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Afficher/masquer les configurations
        if (memoryFlashSettings && memoryProgressiveSettings) {
          if (memoryType === "flash") {
            memoryFlashSettings.style.display = "block";
            memoryProgressiveSettings.style.display = "none";
          } else {
            memoryFlashSettings.style.display = "none";
            memoryProgressiveSettings.style.display = "block";
          }
        }
      });
    });
  }

  // Gestion des boutons de dur\u00e9e pour le mode m\u00e9moire
  const memoryFlashBtns =
    memoryFlashSettings?.querySelectorAll(".duration-btn");
  if (memoryFlashBtns) {
    memoryFlashBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        memoryFlashBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.memoryDuration = parseInt(btn.dataset.duration);
      });
    });
  }

  const memoryProgressiveBtns =
    memoryProgressiveSettings?.querySelectorAll(".duration-btn");
  if (memoryProgressiveBtns) {
    memoryProgressiveBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        memoryProgressiveBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.selectedDuration = parseInt(btn.dataset.duration);
        // Désactiver le custom time du mode progressif
        const memoryProgressiveCustomTime = document.querySelector(
          "#memory-progressive-settings .memory-custom-time",
        );
        memoryProgressiveCustomTime?.classList.remove("active");
        const memoryProgressiveMinutes = document.getElementById(
          "memory-progressive-minutes",
        );
        const memoryProgressiveSeconds = document.getElementById(
          "memory-progressive-seconds",
        );
        if (memoryProgressiveMinutes) memoryProgressiveMinutes.value = 0;
        if (memoryProgressiveSeconds) memoryProgressiveSeconds.value = 0;
      });
    });
  }

  // Gestion des inputs personnalisés pour le mode mémoire progressif
  const memoryProgressiveMinutes = document.getElementById(
    "memory-progressive-minutes",
  );
  const memoryProgressiveSeconds = document.getElementById(
    "memory-progressive-seconds",
  );
  const memoryProgressiveCustomTime = document.querySelector(
    "#memory-progressive-settings .memory-custom-time",
  );

  const updateMemoryProgressiveDuration = () => {
    const minutes = parseInt(memoryProgressiveMinutes.value) || 0;
    const seconds = parseInt(memoryProgressiveSeconds.value) || 0;
    const totalSeconds = minutes * 60 + seconds;

    if (totalSeconds > 0) {
      // Désactiver tous les boutons de durée
      memoryProgressiveBtns?.forEach((b) => b.classList.remove("active"));
      // Activer visuellement le custom time
      memoryProgressiveCustomTime?.classList.add("active");
      state.selectedDuration = totalSeconds;
    } else {
      // Si les valeurs sont à zéro, désactiver le custom time
      memoryProgressiveCustomTime?.classList.remove("active");
    }
  };

  if (memoryProgressiveMinutes && memoryProgressiveSeconds) {
    memoryProgressiveMinutes.addEventListener(
      "input",
      updateMemoryProgressiveDuration,
    );
    memoryProgressiveSeconds.addEventListener(
      "input",
      updateMemoryProgressiveDuration,
    );
  }

  // Gestion des inputs personnalisés pour le mode mémoire flash
  const memoryFlashMinutes = document.getElementById("memory-flash-minutes");
  const memoryFlashSeconds = document.getElementById("memory-flash-seconds");
  const memoryCustomTime = document.querySelector(".memory-custom-time");

  const updateMemoryDuration = () => {
    const minutes = parseInt(memoryFlashMinutes.value) || 0;
    const seconds = parseInt(memoryFlashSeconds.value) || 0;
    const totalSeconds = minutes * 60 + seconds;

    if (totalSeconds > 0) {
      // Désactiver tous les boutons de durée
      memoryFlashBtns?.forEach((b) => b.classList.remove("active"));
      // Activer visuellement le custom time
      memoryCustomTime?.classList.add("active");
      state.memoryDuration = totalSeconds;
    } else {
      // Si les valeurs sont à zéro, désactiver le custom time
      memoryCustomTime?.classList.remove("active");
    }
    updateMemoryTotalDuration();
  };

  if (memoryFlashMinutes && memoryFlashSeconds) {
    memoryFlashMinutes.addEventListener("input", updateMemoryDuration);
    memoryFlashSeconds.addEventListener("input", updateMemoryDuration);
  }

  // Désactiver le custom time quand un bouton prédéfini est cliqué
  if (memoryFlashBtns) {
    memoryFlashBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        memoryCustomTime?.classList.remove("active");
        // Réinitialiser les inputs du custom time display (pas le drawing time!)
        if (memoryFlashMinutes) memoryFlashMinutes.value = 0;
        if (memoryFlashSeconds) memoryFlashSeconds.value = 0;
        updateMemoryTotalDuration();
        // Préserver l'état actif du temps de dessin si une valeur est entrée
        if (state.memoryDrawingTime > 0 && memoryDrawingTimeInput) {
          memoryDrawingTimeInput.classList.add("active");
        }
      });
    });
  }

  // Gestion du temps de dessin
  const memoryDrawingMinutes = document.getElementById(
    "memory-drawing-minutes",
  );
  const memoryDrawingSeconds = document.getElementById(
    "memory-drawing-seconds",
  );
  const memoryDrawingTimeInput = document.getElementById(
    "memory-drawing-time-input",
  );
  const noPressureBtn = document.getElementById("no-pressure-btn");

  const updateMemoryDrawingTime = () => {
    const minutes = parseInt(memoryDrawingMinutes.value) || 0;
    const seconds = parseInt(memoryDrawingSeconds.value) || 0;
    const totalSeconds = minutes * 60 + seconds;

    if (totalSeconds > 0) {
      // Activer l'input de temps
      memoryDrawingTimeInput?.classList.add("active");
      // Désactiver le bouton "pas de pression"
      noPressureBtn?.classList.remove("active");
      state.memoryDrawingTime = totalSeconds;
      state.memoryNoPressure = false;
    } else {
      // Désactiver l'input de temps
      memoryDrawingTimeInput?.classList.remove("active");
      state.memoryDrawingTime = 0;
    }
    updateMemoryTotalDuration();
  };

  if (memoryDrawingMinutes && memoryDrawingSeconds) {
    memoryDrawingMinutes.addEventListener("input", updateMemoryDrawingTime);
    memoryDrawingSeconds.addEventListener("input", updateMemoryDrawingTime);
  }

  // Gestion du bouton "pas de pression"
  if (noPressureBtn) {
    noPressureBtn.addEventListener("click", () => {
      // Toggle l'état actif
      const isActive = noPressureBtn.classList.toggle("active");

      if (isActive) {
        // Désactiver et réinitialiser l'input de temps
        memoryDrawingTimeInput?.classList.remove("active");
        if (memoryDrawingMinutes) memoryDrawingMinutes.value = 0;
        if (memoryDrawingSeconds) memoryDrawingSeconds.value = 0;
        state.memoryDrawingTime = 0;
        state.memoryNoPressure = true;
      } else {
        state.memoryNoPressure = false;
      }
      updateMemoryTotalDuration();
    });
  }

  // Fonction utilitaire pour rendre une valeur éditable au clic
  function makeValueEditable(valueElement, sliderElement, onUpdate) {
    const currentValue = parseInt(valueElement.textContent);
    const min = parseInt(sliderElement.min);
    const max = parseInt(sliderElement.max);

    // Créer un input temporaire
    const input = document.createElement("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.value = currentValue;
    input.style.cssText = `
      width: 50px;
      padding: 2px 4px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--color-primary);
      border-radius: 4px;
      color: var(--color-primary);
      font-weight: bold;
      font-size: inherit;
      text-align: center;
    `;

    // Fonction de validation et restauration
    const validateAndRestore = () => {
      let newValue = parseInt(input.value);

      // Valider les limites
      if (isNaN(newValue) || newValue < min) {
        newValue = min;
      } else if (newValue > max) {
        newValue = max;
      }

      // Mettre à jour le slider
      sliderElement.value = newValue;

      // Restaurer le span
      valueElement.textContent = newValue;
      valueElement.style.display = "";

      // Appeler le callback
      if (onUpdate) {
        onUpdate(newValue);
      }

      // Supprimer l'input
      input.remove();
    };

    // Remplacer temporairement le span par l'input
    valueElement.style.display = "none";
    valueElement.parentElement.appendChild(input);
    input.focus();
    input.select();

    // Event listeners
    input.addEventListener("blur", validateAndRestore);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        validateAndRestore();
      } else if (e.key === "Escape") {
        e.preventDefault();
        // Annuler : restaurer sans changer la valeur
        valueElement.style.display = "";
        input.remove();
      }
    });
  }

  // Gestion du slider de nombre de poses
  const memoryPosesSlider = document.getElementById("memory-poses-slider");
  const memoryPosesValue = document.getElementById("memory-poses-value");
  const memoryTotalDuration = document.getElementById("memory-total-duration");
  const memoryTotalDurationValue = document.getElementById(
    "memory-total-duration-value",
  );

  // Fonction pour calculer et afficher la durée totale
  const updateMemoryTotalDuration = () => {
    if (!memoryTotalDuration || !memoryTotalDurationValue) return;

    // Ne rien afficher si "sans limite" est activé
    if (state.memoryNoPressure) {
      memoryTotalDuration.style.display = "none";
      return;
    }

    // Ne rien afficher si pas de temps de dessin
    if (!state.memoryDrawingTime || state.memoryDrawingTime === 0) {
      memoryTotalDuration.style.display = "none";
      return;
    }

    // Calculer la durée totale
    const posesCount = state.memoryPosesCount || 10;
    const drawingTime = state.memoryDrawingTime || 0;
    const displayTime = state.memoryDuration || 0;

    const totalSeconds = posesCount * drawingTime + posesCount * displayTime;

    // Formater en heures, minutes, secondes
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formattedTime = "";
    if (hours > 0) {
      formattedTime += `${hours}h `;
    }
    if (minutes > 0 || hours > 0) {
      formattedTime += `${minutes}min `;
    }
    formattedTime += `${seconds}s`;

    memoryTotalDurationValue.textContent = formattedTime.trim();
    memoryTotalDuration.style.display = "block";
  };

  if (memoryPosesSlider && memoryPosesValue) {
    // Initialiser le gradient du slider
    initSliderWithGradient(memoryPosesSlider);

    memoryPosesSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      state.memoryPosesCount = value;
      memoryPosesValue.textContent = value;
      updateSliderGradient(memoryPosesSlider);
      updateMemoryTotalDuration();
    });

    // Rendre la valeur cliquable pour édition manuelle
    memoryPosesValue.style.cursor = "pointer";
    memoryPosesValue.title = i18next.t("settings.clickToEnterValue");
    memoryPosesValue.addEventListener("click", () => {
      makeValueEditable(memoryPosesValue, memoryPosesSlider, (newValue) => {
        state.memoryPosesCount = newValue;
        updateSliderGradient(memoryPosesSlider);
        updateMemoryTotalDuration();
      });
    });
  }

  // Gestion du slider de nombre de poses (mode progressif)
  const memoryProgressivePosesSlider = document.getElementById(
    "memory-progressive-poses-slider",
  );
  const memoryProgressivePosesValue = document.getElementById(
    "memory-progressive-poses-value",
  );

  if (memoryProgressivePosesSlider && memoryProgressivePosesValue) {
    // Initialiser le gradient du slider
    initSliderWithGradient(memoryProgressivePosesSlider);

    memoryProgressivePosesSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      state.memoryPosesCount = value;
      memoryProgressivePosesValue.textContent = value;
      updateSliderGradient(memoryProgressivePosesSlider);
    });

    // Rendre la valeur cliquable pour édition manuelle
    memoryProgressivePosesValue.style.cursor = "pointer";
    memoryProgressivePosesValue.title = i18next.t("settings.clickToEnterValue");
    memoryProgressivePosesValue.addEventListener("click", () => {
      makeValueEditable(
        memoryProgressivePosesValue,
        memoryProgressivePosesSlider,
        (newValue) => {
          state.memoryPosesCount = newValue;
          updateSliderGradient(memoryProgressivePosesSlider);
        },
      );
    });
  }

  // === CHAMPS DE SAISIE PERSONNALISÉE (H:M:S) ===
  // Debounce pour éviter les reflow excessifs
  const handleTimerInputChange = PerformanceUtils.debounce(() => {
    const h = parseInt(hoursInput.value) || 0;
    const m = parseInt(minutesInput.value) || 0;
    const s = parseInt(secondsInput.value) || 0;
    const totalCustom = h * 3600 + m * 60 + s;
    if (totalCustom > 0) {
      DOMCache.durationBtns.forEach((btn) => btn.classList.remove("active"));
      DOMCache.inputGroups.forEach((group) => group.classList.add("active"));
      state.selectedDuration = totalCustom;
    }
    state.timeRemaining = state.selectedDuration;
    updateTimerDisplay();
  }, 50);

  [hoursInput, minutesInput, secondsInput].forEach((input) => {
    input.addEventListener("input", handleTimerInputChange);
  });

  // === CONTRÔLE DE LECTURE ===
  playPauseBtn.addEventListener("click", togglePlayPause);
  prevBtn.addEventListener("click", previousImage);
  prevBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showPrevImageMenu(e.clientX, e.clientY);
  });
  nextBtn.addEventListener("click", nextImage);
  nextBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showNextImageMenu(e.clientX, e.clientY);
  });
  settingsBtn.addEventListener("click", () => {
    stopTimer();
    // Fermer le mode dessin s'il est actif
    if (
      typeof closeDrawingMode === "function" &&
      typeof isDrawingModeActive !== "undefined" &&
      isDrawingModeActive
    ) {
      closeDrawingMode();
    }
    if (timerDisplay) timerDisplay.classList.remove("timer-paused");
    if (pauseBadge) pauseBadge.classList.add("hidden");
    drawingScreen.classList.add("hidden");
    settingsScreen.classList.remove("hidden");
  });

  // === FILTRES ET TRANSFORMATIONS ===
  flipHorizontalBtn.addEventListener("click", toggleFlipHorizontal);
  flipVerticalBtn.addEventListener("click", toggleFlipVertical);
  grayscaleBtn.addEventListener("click", toggleGrayscale);

  // Flou standard
  if (blurBtn) {
    blurBtn.addEventListener("click", () => {
      state.isBlurEnabled = !state.isBlurEnabled;
      blurBtn.classList.toggle("active", state.isBlurEnabled);
      blurBtn.innerHTML = state.isBlurEnabled ? ICONS.BLUR_ON : ICONS.BLUR_OFF;

      if (state.isBlurEnabled) {
        state.isProgressiveBlur = false;
        if (progressiveBlurBtn) {
          progressiveBlurBtn.classList.remove("active");
          progressiveBlurBtn.style.opacity = "0.3";
          progressiveBlurBtn.style.pointerEvents = "none";
        }
        if (homeProgressiveBlurBtn) {
          homeProgressiveBlurBtn.classList.remove("active");
        }
      } else {
        if (progressiveBlurBtn) {
          progressiveBlurBtn.style.opacity = "1";
          progressiveBlurBtn.style.pointerEvents = "all";
        }
      }
      applyImageFilters();
    });
    // Menu contextuel pour ajuster le flou
    blurBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showBlurMenu(e.clientX, e.clientY);
    });
  }

  // Bouton Dessiner / Analyser (toggle)
  if (annotateBtn) {
    annotateBtn.addEventListener("click", () => {
      if (typeof isDrawingModeActive !== "undefined" && isDrawingModeActive) {
        // Mode dessin actif → le fermer
        if (typeof closeDrawingMode === "function") {
          closeDrawingMode();
        }
      } else {
        // Mode dessin inactif → l'ouvrir
        if (typeof openDrawingMode === "function") {
          openDrawingMode();
        }
      }
    });
  }

  // Flou progressif
  if (progressiveBlurBtn) {
    progressiveBlurBtn.addEventListener("click", toggleProgressiveBlur);
    // Menu contextuel pour le flou progressif sur la sidebar
    progressiveBlurBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showProgressiveBlurMenu(e.clientX, e.clientY);
    });
  }
  if (homeProgressiveBlurBtn) {
    homeProgressiveBlurBtn.addEventListener("click", toggleProgressiveBlur);
    // Menu contextuel pour le flou progressif à l'accueil
    homeProgressiveBlurBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showProgressiveBlurMenu(e.clientX, e.clientY);
    });
  }

  // === CONTRÔLES VIDÉO ===
  if (videoPlayBtn) {
    videoPlayBtn.innerHTML = ICONS.VIDEO_PLAY;
    videoPlayBtn.addEventListener("click", toggleVideoPlayPause);
  }
  if (videoSlowerBtn) {
    videoSlowerBtn.innerHTML = ICONS.VIDEO_SLOWER;
    videoSlowerBtn.addEventListener("click", () => changeVideoSpeed(-1));
  }
  if (videoFasterBtn) {
    videoFasterBtn.innerHTML = ICONS.VIDEO_FASTER;
    videoFasterBtn.addEventListener("click", () => changeVideoSpeed(1));
  }
  if (videoPrevFrameBtn) {
    videoPrevFrameBtn.innerHTML = ICONS.VIDEO_PREV_FRAME;
    // Support du maintien pour stepping continu
    videoPrevFrameBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      stepFrame(-1, false); // Premier step immédiat
      // Démarrer le stepping continu après un court délai
      frameStepState.buttonHoldTimeout = setTimeout(() => {
        frameStepState.isHoldingKey = true;
        frameStepState.pendingDirection = -1;
        processFrameStepLoop();
      }, 200);
    });
    videoPrevFrameBtn.addEventListener("mouseup", stopFrameSteppingFromButton);
    videoPrevFrameBtn.addEventListener(
      "mouseleave",
      stopFrameSteppingFromButton,
    );
  }
  if (videoNextFrameBtn) {
    videoNextFrameBtn.innerHTML = ICONS.VIDEO_NEXT_FRAME;
    // Support du maintien pour stepping continu
    videoNextFrameBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      stepFrame(1, false); // Premier step immédiat
      // Démarrer le stepping continu après un court délai
      frameStepState.buttonHoldTimeout = setTimeout(() => {
        frameStepState.isHoldingKey = true;
        frameStepState.pendingDirection = 1;
        processFrameStepLoop();
      }, 200);
    });
    videoNextFrameBtn.addEventListener("mouseup", stopFrameSteppingFromButton);
    videoNextFrameBtn.addEventListener(
      "mouseleave",
      stopFrameSteppingFromButton,
    );
  }
  if (videoLoopBtn) {
    videoLoopBtn.innerHTML = state.videoLoop
      ? ICONS.VIDEO_LOOP_ON
      : ICONS.VIDEO_LOOP_OFF;
    videoLoopBtn.addEventListener("click", toggleVideoLoop);
    // Menu contextuel pour ouvrir la config vidéo
    videoLoopBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showVideoConfig();
    });
  }
  if (videoConfigBtn) {
    videoConfigBtn.innerHTML = ICONS.VIDEO_CONFIG;
    videoConfigBtn.addEventListener("click", showVideoConfig);
  }

  // Clic sur l'indicateur de vitesse → popup slider
  if (videoSpeedDisplay) {
    const speedIndicator = videoSpeedDisplay.parentElement; // .video-speed-indicator
    speedIndicator.style.cursor = "pointer";
    speedIndicator.addEventListener("click", showSpeedPopup);
    speedIndicator.setAttribute(
      "data-tooltip",
      i18next.t("video.clickToAdjustSpeed"),
    );
  }

  // Timeline vidéo (scrubbing)
  if (videoTimeline) {
    let isDraggingTimeline = false;

    videoTimeline.addEventListener("click", seekVideo);

    videoTimeline.addEventListener("mousedown", (e) => {
      isDraggingTimeline = true;
      seekVideo(e);
    });

    document.addEventListener("mousemove", (e) => {
      if (isDraggingTimeline && videoTimeline) {
        seekVideo(e);
      }
    });

    document.addEventListener("mouseup", () => {
      isDraggingTimeline = false;
    });
  }

  // Scrubbing sur la vidéo (clic-glissé horizontal) - Optimisé avec throttling
  if (currentVideo) {
    let isScrubbingVideo = false;
    let scrubStartX = 0;
    let scrubStartTime = 0;
    let scrubTargetTime = 0; // Temps cible pour le throttling
    let scrubRafId = null; // requestAnimationFrame ID
    let scrubLastSeekTime = 0; // Dernier seek effectué
    const SCRUB_MIN_INTERVAL = 1000 / 30; // Max 30 seeks/seconde

    // Empêcher le comportement par défaut de Space sur la vidéo
    currentVideo.addEventListener("keydown", (e) => {
      if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Fonction de seek throttlée
    function performScrubSeek() {
      scrubRafId = null;

      if (!isScrubbingVideo || !currentVideo.duration) return;

      const now = performance.now();
      if (now - scrubLastSeekTime < SCRUB_MIN_INTERVAL) {
        // Pas encore le moment, replanifier
        scrubRafId = requestAnimationFrame(performScrubSeek);
        return;
      }

      scrubLastSeekTime = now;

      // Utiliser requestVideoFrameCallback si disponible
      if (frameStepState.vfcSupported) {
        currentVideo.currentTime = scrubTargetTime;
        // Attendre que la frame soit prête avant le prochain seek
        currentVideo.requestVideoFrameCallback(() => {
          updateVideoTimeDisplay();
          // Si on scrub toujours, planifier le prochain
          if (
            isScrubbingVideo &&
            scrubTargetTime !== currentVideo.currentTime
          ) {
            scrubRafId = requestAnimationFrame(performScrubSeek);
          }
        });
      } else {
        currentVideo.currentTime = scrubTargetTime;
        updateVideoTimeDisplay();
      }
    }

    currentVideo.addEventListener("mousedown", (e) => {
      if (!state.isVideoFile || !currentVideo.duration) return;
      isScrubbingVideo = true;
      scrubStartX = e.clientX;
      scrubStartTime = currentVideo.currentTime;
      scrubTargetTime = scrubStartTime;
      currentVideo.style.cursor = "ew-resize";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isScrubbingVideo || !currentVideo.duration) return;

      const deltaX = e.clientX - scrubStartX;
      // Sensibilité basée sur la largeur de la vidéo = durée totale
      // Plus la vidéo est large, plus le scrubbing est précis
      const videoWidth = currentVideo.offsetWidth || 800;
      let sensitivity = currentVideo.duration / videoWidth;

      // Shift = scrubbing précis (10x plus lent)
      if (e.shiftKey) {
        sensitivity *= 0.1;
      }

      // Calculer le temps cible (sera appliqué par performScrubSeek)
      scrubTargetTime = Math.max(
        0,
        Math.min(currentVideo.duration, scrubStartTime + deltaX * sensitivity),
      );

      // Planifier un seek si pas déjà en cours
      if (!scrubRafId) {
        scrubRafId = requestAnimationFrame(performScrubSeek);
      }
    });

    document.addEventListener("mouseup", () => {
      if (isScrubbingVideo) {
        isScrubbingVideo = false;
        if (currentVideo) {
          currentVideo.style.cursor = "";
        }
        // Annuler le RAF en cours
        if (scrubRafId) {
          cancelAnimationFrame(scrubRafId);
          scrubRafId = null;
        }
        // Faire un dernier seek au temps exact ciblé
        if (currentVideo.currentTime !== scrubTargetTime) {
          currentVideo.currentTime = scrubTargetTime;
          updateVideoTimeDisplay();
        }
      }
    });
  }

  // === CONTRÔLES ADDITIONNELS ===
  soundBtn.addEventListener("click", toggleSound);
  toggleTimerBtn.addEventListener("click", toggleTimer);
  // Menu contextuel sur le bouton timer pour toggle smoothProgress
  toggleTimerBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showProgressBarContextMenu(e.clientX, e.clientY);
  });

  // Menu contextuel sur le timer pour réinitialiser
  timerDisplay.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showTimerContextMenu(e.clientX, e.clientY);
  });

  // Clic sur la progressbar pour ajuster le timer
  progressBar.addEventListener("click", (e) => {
    if (!state.isPlaying && state.selectedDuration > 0) return;
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    state.timeRemaining = Math.round(percent * state.selectedDuration);
    updateTimerDisplay();
  });

  // Drag sur la progressbar pour ajuster le timer
  let isDraggingProgress = false;
  progressBar.addEventListener("mousedown", (e) => {
    if (state.selectedDuration <= 0) return;
    isDraggingProgress = true;
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    state.timeRemaining = Math.max(
      0,
      Math.min(
        state.selectedDuration,
        Math.round(percent * state.selectedDuration),
      ),
    );
    updateTimerDisplay();
    progressBar.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDraggingProgress) return;
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    state.timeRemaining = Math.round(percent * state.selectedDuration);
    updateTimerDisplay();
  });

  document.addEventListener("mouseup", () => {
    if (isDraggingProgress) {
      isDraggingProgress = false;
      progressBar.style.cursor = "pointer";
    }
  });

  // Menu contextuel sur le cercle de pause pour toggle smoothPauseCircle
  const pauseCentralBlock = document.querySelector(".pause-central-block");
  if (pauseCentralBlock) {
    pauseCentralBlock.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showPauseCircleContextMenu(e.clientX, e.clientY);
    });
  }

  currentImage.addEventListener("click", () => {
    // Ne pas toggle la sidebar si un modal est ouvert
    const gridPopup = document.getElementById("grid-config-popup");
    const silhouettePopup = document.getElementById("silhouette-config-popup");

    if (gridPopup || silhouettePopup) {
      return;
    }

    toggleSidebar();
  });

  // Overlay mémoire - clic pour passer à l'image suivante
  if (memoryOverlay) {
    memoryOverlay.addEventListener("click", (e) => {
      // Ne pas passer à l'image suivante si on clique sur un bouton
      if (e.target.closest(".memory-overlay-btn")) {
        return;
      }
      // Seulement permettre le clic pour passer si "sans pression" est activé
      if (
        state.sessionMode === "memory" &&
        state.memoryHidden &&
        state.memoryNoPressure
      ) {
        nextImage();
      }
    });
  }

  // Bouton "Coup d'œil" - désactive le flou pendant le maintien du clic
  const memoryPeekBtn = document.getElementById("memory-peek-btn");
  if (memoryPeekBtn) {
    memoryPeekBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      if (memoryOverlay && !memoryPeekBtn.disabled) {
        memoryOverlay.classList.add("peek-active");
        // Masquer le contenu de l'overlay
        memoryOverlay.classList.add("peek-content-hidden");
      }
    });

    memoryPeekBtn.addEventListener("mouseup", (e) => {
      e.stopPropagation();
      if (memoryOverlay) {
        memoryOverlay.classList.remove("peek-active");
        // Réafficher le contenu de l'overlay
        memoryOverlay.classList.remove("peek-content-hidden");
      }
    });

    memoryPeekBtn.addEventListener("mouseleave", (e) => {
      if (memoryOverlay) {
        memoryOverlay.classList.remove("peek-active");
        // Réafficher le contenu de l'overlay
        memoryOverlay.classList.remove("peek-content-hidden");
      }
    });
  }

  // Bouton "Révéler" - toggle entre révéler et cacher
  const memoryRevealBtn = document.getElementById("memory-reveal-btn");
  if (memoryRevealBtn) {
    memoryRevealBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (memoryOverlay) {
        const isRevealed = memoryOverlay.classList.toggle("revealed");
        // Mettre à jour le texte du bouton
        memoryRevealBtn.textContent = isRevealed
          ? i18next.t("modes.memory.hide")
          : i18next.t("modes.memory.reveal");
        // Activer/désactiver le bouton Coup d'œil
        if (memoryPeekBtn) {
          memoryPeekBtn.disabled = isRevealed;
        }
      }
    });
  }

  // Menu contextuel sur l'image et le fond
  currentImage.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showImageContextMenu(e.clientX, e.clientY);
  });

  imageContainer.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showImageContextMenu(e.clientX, e.clientY);
  });

  if (randomShuffleBtn) {
    randomShuffleBtn.classList.toggle("active", state.randomShuffle);
    randomShuffleBtn.addEventListener("click", () => {
      state.randomShuffle = !state.randomShuffle;
      randomShuffleBtn.classList.toggle("active", state.randomShuffle);

      // Appliquer le mélange ou restaurer l'ordre original
      if (state.originalImages.length > 0) {
        if (state.randomShuffle) {
          // Mélanger les images
          state.images = [...state.originalImages];
          for (let i = state.images.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.images[i], state.images[j]] = [
              state.images[j],
              state.images[i],
            ];
          }
        } else {
          // Restaurer l'ordre original
          state.images = [...state.originalImages];
        }
        // Réinitialiser le cache après changement d'ordre
        imageCache.clear();
      }
    });
  }

  if (autoFlipBtn) {
    autoFlipBtn.classList.toggle("active", state.autoFlip);
    autoFlipBtn.addEventListener("click", () => {
      state.autoFlip = !state.autoFlip;
      autoFlipBtn.classList.toggle("active", state.autoFlip);
    });

    // Menu contextuel au clic droit pour configurer l'animation
    autoFlipBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showFlipAnimationMenu(e.clientX, e.clientY);
    });
  }

  // === BOUTONS D'ACTION ===
  if (deleteBtn) deleteBtn.addEventListener("click", deleteImage);
  if (revealBtn) {
    revealBtn.addEventListener("click", revealImage);
    // Menu contextuel pour le bouton reveal
    revealBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showRevealMenu(e.clientX, e.clientY);
    });
  }

  // === RACCOURCIS CLAVIER ===
  document.addEventListener("keydown", handleKeyboardShortcuts);

  // === KEYUP pour arrêter le frame stepping vidéo ===
  document.addEventListener("keyup", (e) => {
    const hk = CONFIG.HOTKEYS;
    const key = e.key;
    // Arrêter le frame stepping si c'est une touche de navigation frame
    if (
      key === "'" ||
      key === "PageDown" ||
      key === hk.VIDEO_PREV_FRAME ||
      key === "(" ||
      key === "PageUp" ||
      key === hk.VIDEO_NEXT_FRAME
    ) {
      stopFrameStepping();
    }
  });

  // === RACCOURCI GLOBAL THEME (F2) ===
  document.addEventListener("keydown", (e) => {
    if (e.key === CONFIG.HOTKEYS.THEME) {
      e.preventDefault();
      toggleTheme();
    }
  });

  // === RACCOURCI PIN (Shift+T) ===
  document.addEventListener("keydown", async (e) => {
    if (e.shiftKey && e.code === "KeyT") {
      e.preventDefault();
      const pinBtn = document.getElementById("pin-btn");
      const isOnTop = await eagle.window.isAlwaysOnTop();
      await eagle.window.setAlwaysOnTop(!isOnTop);
      if (pinBtn) {
        pinBtn.classList.toggle("active", !isOnTop);
      }
    }
  });

  // === RACCOURCI TAGS (T) ===
  document.addEventListener("keydown", (e) => {
    // Ouvrir la modal tags avec T (si pas en train de taper dans un input)
    if (
      e.code === "KeyT" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      // Vérifier qu'on n'est pas dans un input/textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      // Bloquer si le modal d'export est ouvert
      if (document.getElementById("export-options-modal")) return;

      e.preventDefault();

      // Cas 1 : Mode zoom-overlay (review)
      const zoomOverlay = document.getElementById("zoom-overlay");
      if (
        zoomOverlay &&
        window.currentZoomIndex !== undefined &&
        window.currentZoomIndex !== null
      ) {
        openTagsModal(window.currentZoomIndex);
        return;
      }

      // Cas 2 : Mode session normal
      if (!state.images || state.images.length === 0) return;
      const drawingScreen = document.getElementById("drawing-screen");
      if (!drawingScreen || drawingScreen.classList.contains("hidden")) return;

      openTagsModal();
    }
  });

  // === MENU CONTEXTUEL SUR L'ÉCRAN SETTINGS (clic droit en dehors du contenu) ===
  const settingsScreenBody = document.getElementById("settings-screen");
  if (settingsScreenBody) {
    settingsScreenBody.addEventListener("contextmenu", (e) => {
      // Afficher le menu seulement si on clique en dehors du settings-container
      const target = e.target;
      const isInsideContainer = target.closest(".settings-container");

      if (isInsideContainer) return;

      e.preventDefault();
      showSettingsContextMenu(e.clientX, e.clientY);
    });
  }

  // === MENU CONTEXTUEL SUR L'ÉCRAN REVIEW (clic droit en dehors du contenu) ===
  const reviewScreenBody = document.getElementById("review-screen");
  if (reviewScreenBody) {
    reviewScreenBody.addEventListener("contextmenu", (e) => {
      // Afficher le menu seulement si on clique en dehors du review-container
      const target = e.target;
      const isInsideContainer = target.closest(".review-container");

      if (isInsideContainer) return;

      e.preventDefault();
      showSettingsContextMenu(e.clientX, e.clientY);
    });
  }
}

/**
 * Gère tous les raccourcis clavier pendant la session
 */
// Mettre à jour les tooltips de la sidebar avec les raccourcis dynamiques
function updateSidebarTooltips() {
  if (flipHorizontalBtn) {
    flipHorizontalBtn.setAttribute(
      "data-tooltip",
      `${i18next.t("drawing.flipHorizontal")} (${CONFIG.HOTKEYS.FLIP_H})`,
    );
  }
  if (flipVerticalBtn) {
    flipVerticalBtn.setAttribute(
      "data-tooltip",
      i18next.t("drawing.flipVertical"),
    );
  }
  if (grayscaleBtn) {
    grayscaleBtn.setAttribute(
      "data-tooltip",
      `${i18next.t("filters.grayscale")} (${CONFIG.HOTKEYS.GRAYSCALE.toUpperCase()})`,
    );
  }
  if (blurBtn) {
    blurBtn.setAttribute(
      "data-tooltip",
      i18next.t("filters.blurTooltip", {
        hotkey: CONFIG.HOTKEYS.BLUR.toUpperCase(),
      }),
    );
  }
  if (progressiveBlurBtn) {
    progressiveBlurBtn.setAttribute(
      "data-tooltip",
      i18next.t("filters.progressiveBlur"),
    );
  }
}

function handleKeyboardShortcuts(e) {
  if (drawingScreen.classList.contains("hidden")) return;

  // Ignorer si on tape dans un input ou textarea
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  // Si le mode dessin overlay est actif, bloquer TOUS les raccourcis globaux
  // (Escape est géré par handleDrawingModeKeydown dans draw.js)
  if (typeof isDrawingModeActive !== "undefined" && isDrawingModeActive) {
    return;
  }

  // Vérifier si un modal est ouvert
  const tagsModal = document.getElementById("tags-modal");
  const sessionPlansModal = document.getElementById("session-plans-modal");

  const isAnyModalOpen =
    (tagsModal && !tagsModal.classList.contains("hidden")) ||
    (sessionPlansModal && !sessionPlansModal.classList.contains("hidden"));

  // Si un modal est ouvert et qu'on appuie sur Escape, fermer le modal
  if (isAnyModalOpen && e.key === "Escape") {
    e.preventDefault();

    if (tagsModal && !tagsModal.classList.contains("hidden")) {
      tagsModal.classList.add("hidden");
      if (state.wasPlayingBeforeModal) {
        startTimer();
        state.wasPlayingBeforeModal = false;
      }
      return;
    }

    if (sessionPlansModal && !sessionPlansModal.classList.contains("hidden")) {
      sessionPlansModal.classList.add("hidden");
      return;
    }

    return;
  }

  // Bloquer tous les autres raccourcis si un modal est ouvert
  if (isAnyModalOpen) {
    return;
  }

  const hk = CONFIG.HOTKEYS;
  const key = e.key;
  const keyLow = e.key.toLowerCase();

  // === Touches avec preventDefault ===
  if (key === hk.FLIP_H) {
    e.preventDefault();
    toggleFlipHorizontal();
    return;
  }

  // Espace SANS Shift = toggle timer (Shift+Espace est géré plus bas pour la vidéo)
  if (key === " " && !e.shiftKey) {
    e.preventDefault();
    togglePlayPause();
    return;
  }

  // === Gestion Shift+H (Modal grille) et Shift+S (Modal silhouette) ===
  if (e.shiftKey && key === hk.GRID_MODAL) {
    e.preventDefault();
    showGridConfig();
    return;
  }

  if (e.shiftKey && key === hk.SILHOUETTE_MODAL) {
    e.preventDefault();
    showSilhouetteConfig();
    return;
  }

  // === Switch principal ===
  switch (key) {
    case "Escape":
      e.preventDefault();
      // Fermer les modals s'ils sont ouverts
      const gridPopup = document.getElementById("grid-config-popup");
      const silhouettePopup = document.getElementById(
        "silhouette-config-popup",
      );
      const imageInfoOverlay = document.getElementById("image-info-overlay");

      if (gridPopup) {
        gridPopup.remove();
        // Restaurer l'état de lecture
        if (wasPlayingBeforeModal && !state.isPlaying) {
          togglePlayPause();
        }
      } else if (silhouettePopup) {
        silhouettePopup.remove();
        // Restaurer l'état de lecture
        if (wasPlayingBeforeModal && !state.isPlaying) {
          togglePlayPause();
        }
      } else if (!imageInfoOverlay) {
        // Revenir à l'écran review
        showReview();
      }
      break;

    case "Delete":
      e.preventDefault();
      deleteImage();
      break;

    case "ArrowUp":
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + ArrowUp : augmenter la luminosité de la silhouette
        if (state.silhouetteEnabled) {
          state.silhouetteBrightness = Math.min(
            state.silhouetteBrightness + 0.1,
            6,
          );
          applyImageFilters();
          // Mettre à jour le slider dans le modal s'il est ouvert
          const brightnessSlider = document.getElementById("brightness-slider");
          const brightnessValue = document.getElementById("brightness-value");
          if (brightnessSlider) {
            brightnessSlider.value = state.silhouetteBrightness;
            updateSliderGradient(brightnessSlider);
          }
          if (brightnessValue) {
            brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
          }
        }
      } else {
        // ArrowUp seul : augmenter le blur
        if (state.isBlurEnabled) {
          state.blurAmount = Math.min(state.blurAmount + 2.5, 100);
          updateBlurAmount();
          applyImageFilters();
        }
      }
      break;

    case "ArrowDown":
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + ArrowDown : diminuer la luminosité de la silhouette
        if (state.silhouetteEnabled) {
          state.silhouetteBrightness = Math.max(
            state.silhouetteBrightness - 0.1,
            0,
          );
          applyImageFilters();
          // Mettre à jour le slider dans le modal s'il est ouvert
          const brightnessSlider = document.getElementById("brightness-slider");
          const brightnessValue = document.getElementById("brightness-value");
          if (brightnessSlider) {
            brightnessSlider.value = state.silhouetteBrightness;
            updateSliderGradient(brightnessSlider);
          }
          if (brightnessValue) {
            brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
          }
        }
      } else {
        // ArrowDown seul : diminuer le blur
        if (state.isBlurEnabled) {
          state.blurAmount = Math.max(state.blurAmount - 2.5, 0);
          updateBlurAmount();
          applyImageFilters();
        }
      }
      break;

    case "ArrowLeft":
      e.preventDefault();
      previousImage();
      break;

    case "ArrowRight":
      e.preventDefault();
      nextImage();
      break;
  }

  // === Touches configurables (Grayscale, Blur, Mute, Grid, Silhouette, Sidebar, Info) ===
  // Grayscale : Y ou Ctrl+Alt+G (comme dans Eagle)
  if (
    keyLow === hk.GRAYSCALE.toLowerCase() ||
    (e.ctrlKey && e.altKey && keyLow === "g")
  ) {
    toggleGrayscale();
  } else if (keyLow === hk.BLUR.toLowerCase()) {
    if (!state.isProgressiveBlur && blurBtn) blurBtn.click();
  } else if (keyLow === "b") {
    // B pour ouvrir le mode dessin
    e.preventDefault();
    if (typeof openDrawingMode === "function") {
      openDrawingMode();
    }
  } else if (keyLow === hk.MUTE.toLowerCase()) {
    toggleSound();
  } else if (keyLow === hk.GRID.toLowerCase()) {
    state.gridEnabled = !state.gridEnabled;
    updateGridOverlay();
  } else if (keyLow === hk.SILHOUETTE.toLowerCase()) {
    state.silhouetteEnabled = !state.silhouetteEnabled;
    applyImageFilters();
  } else if (keyLow === hk.SIDEBAR.toLowerCase()) {
    toggleSidebar();
  } else if (keyLow === hk.INFO.toLowerCase()) {
    toggleImageInfo();
  }

  // === RACCOURCIS VIDÉO (uniquement si vidéo affichée) ===
  if (state.isVideoFile) {
    // Ralentir (-)
    if (key === "-" || key === hk.VIDEO_SLOWER) {
      e.preventDefault();
      changeVideoSpeed(-1);
      return;
    }
    // Accélérer (+)
    if (key === "+" || key === "=" || key === hk.VIDEO_FASTER) {
      e.preventDefault();
      changeVideoSpeed(1);
      return;
    }
    // Frame précédente (' ou PageDown)
    if (key === "'" || key === "PageDown" || key === hk.VIDEO_PREV_FRAME) {
      e.preventDefault();
      stepFrame(-1, e.repeat);
      return;
    }
    // Frame suivante (( ou PageUp)
    if (key === "(" || key === "PageUp" || key === hk.VIDEO_NEXT_FRAME) {
      e.preventDefault();
      stepFrame(1, e.repeat);
      return;
    }
    // Toggle boucle (L)
    if (keyLow === hk.VIDEO_LOOP.toLowerCase()) {
      e.preventDefault();
      toggleVideoLoop();
      return;
    }
    // Toggle play/pause vidéo (Shift+Espace)
    if (e.shiftKey && key === " ") {
      e.preventDefault();
      toggleVideoPlayPause();
      return;
    }
    // Modal config vidéo (Shift+V)
    if (e.shiftKey && key === hk.VIDEO_CONFIG) {
      e.preventDefault();
      showVideoConfig();
      return;
    }
  }
}
//AJUSTER LE FLOU
function updateBlurAmount() {
  // Clamp la valeur entre les limites définies
  const clampedBlur = Math.max(
    UI_CONSTANTS.MIN_BLUR_AMOUNT,
    Math.min(UI_CONSTANTS.MAX_BLUR_AMOUNT, state.blurAmount),
  );
  document.documentElement.style.setProperty(
    "--blur-value",
    `${clampedBlur}px`,
  );
}

function toggleProgressiveBlur() {
  state.isProgressiveBlur = !state.isProgressiveBlur;

  if (homeProgressiveBlurBtn)
    homeProgressiveBlurBtn.classList.toggle("active", state.isProgressiveBlur);
  if (progressiveBlurBtn)
    progressiveBlurBtn.classList.toggle("active", state.isProgressiveBlur);

  if (!state.isProgressiveBlur) {
    // RÉACTIVATION DU BOUTON FLOU CLASSIQUE
    if (blurBtn) {
      blurBtn.disabled = false;
      blurBtn.style.opacity = "1";
      blurBtn.style.cursor = "pointer";
    }

    state.isBlurEnabled = false;
    currentImage.classList.remove("blur-active");
    progressBar.classList.remove("blur-active");

    if (blurBtn) {
      blurBtn.innerHTML = ICONS.BLUR_OFF;
      blurBtn.classList.remove("active");
    }

    state.blurAmount = 20;
    updateBlurAmount();
  } else {
    if (blurBtn) {
      blurBtn.disabled = true;
      blurBtn.style.opacity = OPACITY.REDUCED;
      blurBtn.style.cursor = "not-allowed";

      blurBtn.innerHTML = ICONS.BLUR_ON;
      blurBtn.classList.add("active");
    }
  }
}

// CHARGEMENT DES IMAGES (FIXÉ POUR DOSSIER)
async function loadImages() {
  try {
    let items = [];
    let sourceMessage = i18next.t("settings.imagesAnalyzed");

    const selectedItems = await eagle.item.getSelected();

    if (selectedItems && selectedItems.length > 0) {
      items = selectedItems;
    } else {
      const selectedFolders = await eagle.folder.getSelected();
      if (selectedFolders && selectedFolders.length > 0) {
        items = await eagle.item.get({
          folders: selectedFolders.map((f) => f.id),
        });
      }
    }

    if (!items || items.length === 0) {
      items = await eagle.item.get({});
      sourceMessage = i18next.t("settings.allLibraryAnalyzed");
    }

    state.images = items.filter((item) =>
      MEDIA_EXTENSIONS.includes(item.ext.toLowerCase()),
    );

    // Sauvegarder l'ordre original des images
    state.originalImages = [...state.images];

    // ========================================
    // OPTIMISATION: Réinitialiser le cache d'images
    // ========================================
    imageCache.clear();

    // Fisher-Yates shuffle pour mélanger efficacement les images (si activé)
    if (state.randomShuffle && state.images.length > 0) {
      for (let i = state.images.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.images[i], state.images[j]] = [state.images[j], state.images[i]];
      }
    }

    if (state.images.length === 0) {
      folderInfo.innerHTML = `<span class="warning-text">${i18next.t("settings.noImagesFound")}</span>`;
      startBtn.disabled = true;
    } else {
      // Compter séparément images et vidéos
      const imageCount = state.images.filter((item) =>
        IMAGE_EXTENSIONS.includes(item.ext.toLowerCase()),
      ).length;
      const videoCount = state.images.filter((item) =>
        VIDEO_EXTENSIONS.includes(item.ext.toLowerCase()),
      ).length;
      const count = imageCount + videoCount;

      // Construire le message avec orthographe correcte
      let countMessage = "";
      if (imageCount > 0) {
        const imageWord =
          imageCount <= 1
            ? i18next.t("settings.imageLoaded")
            : i18next.t("settings.imagesLoaded");
        countMessage += `${imageCount} ${imageWord}`;
      }
      if (videoCount > 0) {
        if (imageCount > 0) countMessage += ` ${i18next.t("misc.and")} `;
        const videoWord =
          videoCount <= 1
            ? i18next.t("settings.videoLoaded")
            : i18next.t("settings.videosLoaded");
        countMessage += `${videoCount} ${videoWord}`;
      }

      if (folderInfo) {
        folderInfo.innerHTML = `
      <div style="display: flex; align-items: baseline; justify-content: left; gap: 8px;">
        <span class="source-message-text">${sourceMessage}:</span>
        <span class="image-count-text">${countMessage}</span>
      </div>
    `;
      }
      if (startBtn) {
        startBtn.disabled = false;
      }

      // Mettre à jour les sliders du mode mémoire avec le nombre d'images
      const memoryPosesSlider = document.getElementById("memory-poses-slider");
      const memoryPosesValue = document.getElementById("memory-poses-value");
      if (memoryPosesSlider) {
        memoryPosesSlider.max = count;
        const sliderContainer = memoryPosesSlider.closest(
          ".memory-poses-slider",
        );

        // Si une seule image, mettre à 1 et griser toute la div
        if (count === 1) {
          memoryPosesSlider.value = 1;
          memoryPosesSlider.disabled = true;
          state.memoryPosesCount = 1;
          if (memoryPosesValue) {
            memoryPosesValue.textContent = 1;
          }
          if (sliderContainer) {
            sliderContainer.style.opacity = "0.5";
            sliderContainer.style.pointerEvents = "none";
          }
        } else {
          // Réactiver le slider si plus d'une image
          memoryPosesSlider.disabled = false;
          if (sliderContainer) {
            sliderContainer.style.opacity = "1";
            sliderContainer.style.pointerEvents = "auto";
          }

          // Si moins de 10 images, ajuster la valeur par défaut
          const defaultValue = Math.min(10, count);
          if (parseInt(memoryPosesSlider.value) > count) {
            memoryPosesSlider.value = defaultValue;
            state.memoryPosesCount = defaultValue;
            if (memoryPosesValue) {
              memoryPosesValue.textContent = defaultValue;
            }
          } else if (count < 10 && memoryPosesSlider.value == 10) {
            // Si on a chargé moins de 10 images et que le slider est encore à 10
            memoryPosesSlider.value = defaultValue;
            state.memoryPosesCount = defaultValue;
            if (memoryPosesValue) {
              memoryPosesValue.textContent = defaultValue;
            }
          }
        }
        // Mettre à jour le gradient
        updateSliderGradient(memoryPosesSlider);
      }

      // Mettre à jour le slider du mode progressif aussi
      const memoryProgressivePosesSlider = document.getElementById(
        "memory-progressive-poses-slider",
      );
      const memoryProgressivePosesValue = document.getElementById(
        "memory-progressive-poses-value",
      );
      if (memoryProgressivePosesSlider) {
        memoryProgressivePosesSlider.max = count;
        const sliderContainer = memoryProgressivePosesSlider.closest(
          ".memory-poses-slider",
        );

        // Si une seule image, mettre à 1 et griser toute la div
        if (count === 1) {
          memoryProgressivePosesSlider.value = 1;
          memoryProgressivePosesSlider.disabled = true;
          state.memoryPosesCount = 1;
          if (memoryProgressivePosesValue) {
            memoryProgressivePosesValue.textContent = 1;
          }
          if (sliderContainer) {
            sliderContainer.style.opacity = "0.5";
            sliderContainer.style.pointerEvents = "none";
          }
        } else {
          // Sinon, réactiver si nécessaire
          memoryProgressivePosesSlider.disabled = false;
          if (sliderContainer) {
            sliderContainer.style.opacity = "1";
            sliderContainer.style.pointerEvents = "auto";
          }

          // Si moins de 10 images, ajuster la valeur par défaut
          const defaultValue = Math.min(10, count);
          if (parseInt(memoryProgressivePosesSlider.value) > count) {
            memoryProgressivePosesSlider.value = defaultValue;
            state.memoryPosesCount = defaultValue;
            if (memoryProgressivePosesValue) {
              memoryProgressivePosesValue.textContent = defaultValue;
            }
          } else if (count < 10 && memoryProgressivePosesSlider.value == 10) {
            // Si on a chargé moins de 10 images et que le slider est encore à 10
            memoryProgressivePosesSlider.value = defaultValue;
            state.memoryPosesCount = defaultValue;
            if (memoryProgressivePosesValue) {
              memoryProgressivePosesValue.textContent = defaultValue;
            }
          }
        }
        // Mettre à jour le gradient
        updateSliderGradient(memoryProgressivePosesSlider);
      }
    }
  } catch (e) {
    console.error("Erreur chargement:", e);
    if (folderInfo) {
      folderInfo.textContent = i18next.t("notifications.readError");
    }
  }
}

// LOGIQUE DE SESSION
function startSession() {
  if (state.images.length === 0) return;

  state.imagesSeen = [];
  state.imagesCount = 0;
  state.totalSessionTime = 0;
  state.currentPoseTime = 0;
  state.sessionStartTime = Date.now();

  // Réinitialiser les états spécifiques au mode mémoire
  state.memoryHidden = false;
  hideMemoryOverlay();

  if (state.sessionMode === "classique") {
    const h = parseInt(hoursInput.value) || 0;
    const m = parseInt(minutesInput.value) || 0;
    const s = parseInt(secondsInput.value) || 0;
    const totalManual = h * 3600 + m * 60 + s;

    // Si l'utilisateur a tapé quelque chose, c'est PRIORITAIRE
    if (totalManual > 0) {
      state.selectedDuration = totalManual;
    } else {
      // Sinon on prend le bouton qui a la classe "active" dans le panneau classique
      const activeBtn = document.querySelector(
        "#mode-classique-settings .duration-btn.active",
      );
      if (activeBtn) {
        state.selectedDuration = parseInt(activeBtn.dataset.duration);
      }
    }

    // Mettre à jour le temps restant pour le mode classique
    state.timeRemaining = state.selectedDuration;
  }

  // --- LOGIQUE MODE PERSONNALISÉ ---
  if (state.sessionMode === "custom") {
    if (state.customQueue.length === 0) return;

    state.currentStepIndex = 0;
    state.currentPoseInStep = 1;

    const firstStep = state.customQueue[0];
    state.selectedDuration = firstStep.duration;
    state.timeRemaining = firstStep.duration;
  } else if (state.sessionMode === "memory") {
    // --- LOGIQUE MODE M\u00c9MOIRE ---
    state.memoryHidden = false; // R\u00e9initialiser l'\u00e9tat

    if (state.memoryType === "flash") {
      // En mode flash, la dur\u00e9e totale est le temps d'affichage
      state.selectedDuration = state.memoryDuration;
      state.timeRemaining = state.memoryDuration;
    } else {
      // En mode progressif, on utilise la dur\u00e9e s\u00e9lectionn\u00e9e dans les boutons
      // La dur\u00e9e est d\u00e9j\u00e0 dans state.selectedDuration
      state.timeRemaining = state.selectedDuration;
    }
  } else {
    // Logique classique ou relax
    state.timeRemaining =
      state.sessionMode === "relax" ? 0 : state.selectedDuration;
  }
  // --------------------------------

  settingsScreen.classList.add("hidden");
  reviewScreen.classList.add("hidden");
  document.body.classList.remove("review-active");
  drawingScreen.classList.remove("hidden");

  // Re-mélanger les images à chaque nouvelle session si l'option est activée
  if (state.randomShuffle && state.images.length > 1) {
    // Fisher-Yates shuffle
    for (let i = state.images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.images[i], state.images[j]] = [state.images[j], state.images[i]];
    }
  }

  state.currentIndex = 0;
  state.isPlaying = true;
  // S'assurer que la classe timer-paused est retirée au démarrage
  if (timerDisplay) timerDisplay.classList.remove("timer-paused");
  if (pauseBadge) pauseBadge.classList.add("hidden");

  if (state.autoFlip) state.flipHorizontal = Math.random() > 0.5;

  const isRelax = state.sessionMode === "relax";
  const isMemoryMode = state.sessionMode === "memory";

  if (progressiveBlurBtn)
    progressiveBlurBtn.style.display =
      isRelax || isMemoryMode ? "none" : "flex";
  if (blurBtn)
    blurBtn.style.display = isRelax || isMemoryMode ? "none" : "flex";
  if (soundBtn) soundBtn.style.display = isRelax ? "none" : "flex";
  if (toggleTimerBtn) toggleTimerBtn.style.display = isRelax ? "none" : "flex";
  if (playPauseBtn) playPauseBtn.style.display = "flex";

  if (progressBar) progressBar.style.display = isRelax ? "none" : "block";

  SoundManager.unlockAudioContext();

  updateDisplay();
  startTimer();
}

function startTimer() {
  stopTimer();
  state.isPlaying = true;
  updatePlayPauseIcon();

  // Retirer la classe paused de la progress-bar
  if (progressBar) progressBar.classList.remove("paused");

  // mode Relax
  if (state.sessionMode === "relax") {
    if (progressBar) progressBar.style.display = "none";

    // --- FORCE L'AFFICHAGE IMMÉDIAT ICI ---
    updateRelaxDisplay();

    state.timerInterval = setInterval(() => {
      if (!state.isPlaying) return;
      state.timeRemaining++;
      state.totalSessionTime++;
      state.currentPoseTime++;

      updateRelaxDisplay(); // Mise à jour à chaque seconde
    }, 1000);
    return;
  }

  // --- LOGIQUE MODE CLASSIQUE / CUSTOM / MEMORY ---
  if (progressBar) progressBar.style.display = "block";
  state.timerInterval = setInterval(() => {
    if (!state.isPlaying) return;
    state.timeRemaining--;

    const isCustomPause =
      state.sessionMode === "custom" &&
      state.customQueue[state.currentStepIndex]?.type === "pause";

    if (!isCustomPause) {
      state.totalSessionTime++;
    }

    // LOGIQUE SPÉCIFIQUE MODE MÉMOIRE FLASH
    if (state.sessionMode === "memory" && state.memoryType === "flash") {
      if (state.timeRemaining < 0 && !state.memoryHidden) {
        // Arrêter le timer et afficher l'écran de masquage
        state.memoryHidden = true;
        stopTimer();
        showMemoryOverlay();
        if (state.soundEnabled) {
          SoundManager.play("end");
        }

        // Si un temps de dessin est défini (et que "sans pression" n'est pas activé)
        if (state.memoryDrawingTime > 0 && !state.memoryNoPressure) {
          // Démarrer un timer pour le temps de dessin
          state.timeRemaining = state.memoryDrawingTime;
          state.selectedDuration = state.memoryDrawingTime;
          updateTimerDisplay();
          startTimer();
        }

        return;
      }

      // Si on est en phase de dessin (overlay visible) et que le temps est écoulé
      if (state.memoryHidden && state.timeRemaining < 0) {
        stopTimer();
        // Attendre 1 seconde puis passer à l'image suivante
        setTimeout(() => {
          nextImage();
        }, 1000);
        return;
      }
    }

    if (state.soundEnabled) {
      const threshold = state.selectedDuration * 0.2;
      if (
        !isCustomPause &&
        state.timeRemaining <= threshold &&
        state.timeRemaining > 0
      ) {
        const volume = (threshold - state.timeRemaining) / threshold;
        SoundManager.play("tick", { volume });
      }
      // En mode mémoire, jouer le son à 0 mais continuer le timer
      if (
        state.timeRemaining === 0 &&
        !(state.sessionMode === "memory" && state.memoryType === "flash")
      ) {
        SoundManager.play("end");
      }
    }

    updateTimerDisplay();
    applyImageFilters(); // Mettre à jour le flou progressif chaque seconde

    if (state.timeRemaining <= 0) {
      // En mode mémoire flash, ne pas passer automatiquement à l'image suivante
      if (state.sessionMode === "memory" && state.memoryType === "flash") {
        return; // L'utilisateur cliquera pour passer à la suivante
      }
      stopTimer();
      setTimeout(nextImage, 100);
    }
  }, 1000);
}

function stopTimer() {
  // Cleanup rigoureux de l'intervalle
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  state.isPlaying = false;
  updatePlayPauseIcon();

  // Ajouter la classe paused à la progress-bar
  if (progressBar) progressBar.classList.add("paused");

  // S'assurer qu'aucun intervalle fantôme ne reste
  if (typeof state.timerInterval === "number") {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function nextImage() {
  // Fermer le mode dessin overlay si actif
  if (typeof isDrawingModeActive !== "undefined" && isDrawingModeActive) {
    if (typeof closeDrawingMode === "function") {
      closeDrawingMode();
    }
  }

  // Masquer l'overlay mémoire si visible
  hideMemoryOverlay();

  // Réinitialiser l'état de masquage pour la nouvelle image en mode mémoire
  if (state.sessionMode === "memory") {
    state.memoryHidden = false;
    // Remettre le timer sur la durée d'affichage
    if (state.memoryType === "flash") {
      state.selectedDuration = state.memoryDuration;
      state.timeRemaining = state.memoryDuration;
    }
  }

  if (state.sessionMode === "custom") {
    handleCustomNext();
    return;
  }

  function getNextStepMessage() {
    resetProgressBar();
    for (
      let i = state.currentStepIndex + 1;
      i < state.customQueue.length;
      i++
    ) {
      const step = state.customQueue[i];

      if (step.type === "pose") {
        const count = step.count;
        const duration = step.duration;

        let timeStr = "";
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        if (mins > 0) timeStr += mins + " min ";
        if (secs > 0 || mins === 0) timeStr += secs + "s";

        const poseWord =
          count > 1 ? i18next.t("misc.poses") : i18next.t("misc.pose");

        return i18next.t("drawing.nextStep", {
          poseCount: count,
          poseWord,
          duration: timeStr.trim(),
        });
      }
    }
    return i18next.t("drawing.lastStep");
  }

  // 2. Logique pour les autres modes (Classique / Relax)

  // Vérifier si on a vu toutes les images (pour aller au review screen)
  const nextIndex = (state.currentIndex + 1) % state.images.length;

  // Si on revient au début et qu'on a vu toutes les images, afficher le review
  if (nextIndex === 0 && state.imagesSeen.length >= state.images.length) {
    showReview();
    return;
  }

  state.currentIndex = nextIndex;
  resetTransforms();

  // Réinitialiser le temps de la pose actuelle en mode tranquille
  if (state.sessionMode === "relax") {
    state.currentPoseTime = 0;
  }

  // Appliquer l'autoFlip avec animation
  let shouldAnimateFlip = false;
  if (state.autoFlip) {
    state.flipHorizontal = Math.random() > 0.5;
    shouldAnimateFlip = state.flipHorizontal;
  }

  state.timeRemaining =
    state.sessionMode === "relax" ? 0 : state.selectedDuration;

  // Mettre à jour le compteur de poses si en mode custom
  if (state.sessionMode === "custom") {
    const currentStep = state.customQueue[state.currentStepIndex];
    if (currentStep && currentStep.type === "pose") {
      if (state.currentPoseInStep < currentStep.count) {
        state.currentPoseInStep++;
      }
    }
  }

  updateFlipButtonUI();
  updateDisplay(shouldAnimateFlip);
  startTimer();

  // Cacher le badge pause et retirer la classe timer-paused quand le timer redémarre
  if (pauseBadge) pauseBadge.classList.add("hidden");
  if (timerDisplay) timerDisplay.classList.remove("timer-paused");

  // Mettre à jour l'image info overlay s'il est ouvert
  const infoOverlay = document.getElementById("image-info-overlay");
  if (infoOverlay) {
    infoOverlay.remove();
    toggleImageInfo();
  }
}

function nextPoseGroup() {
  // Passer au prochain groupe de poses (étape de type "pose")
  if (state.sessionMode !== "custom") return;

  let nextGroupIndex = null;
  for (let i = state.currentStepIndex + 1; i < state.customQueue.length; i++) {
    if (state.customQueue[i].type === "pose") {
      nextGroupIndex = i;
      break;
    }
  }

  if (nextGroupIndex !== null) {
    // Aller au groupe de poses suivant
    stopTimer();
    state.currentStepIndex = nextGroupIndex;
    const step = state.customQueue[nextGroupIndex];
    state.selectedDuration = step.duration;
    state.timeRemaining = step.duration;

    // Changer d'image
    state.currentIndex = (state.currentIndex + 1) % state.images.length;
    resetTransforms();

    // Jouer le son de changement de groupe
    if (state.soundEnabled) {
      SoundManager.play("group");
    }

    updateDisplay();
    startTimer();
  }
}

function previousPoseGroup() {
  // Revenir au groupe de poses précédent (étape de type "pose")
  if (state.sessionMode !== "custom") return;

  let prevGroupIndex = null;
  for (let i = state.currentStepIndex - 1; i >= 0; i--) {
    if (state.customQueue[i].type === "pose") {
      prevGroupIndex = i;
      break;
    }
  }

  if (prevGroupIndex !== null) {
    // Aller au groupe de poses précédent
    stopTimer();
    state.currentStepIndex = prevGroupIndex;
    const step = state.customQueue[prevGroupIndex];
    state.selectedDuration = step.duration;
    state.timeRemaining = step.duration;

    // Changer d'image
    state.currentIndex =
      (state.currentIndex - 1 + state.images.length) % state.images.length;
    resetTransforms();

    // Jouer le son de changement de groupe
    if (state.soundEnabled) {
      SoundManager.play("group");
    }

    updateDisplay();
    startTimer();
  }
}

// Gestion de l'overlay mémoire (mode flash)
function showMemoryOverlay() {
  if (memoryOverlay) {
    // Réinitialiser les états pour que le flou soit actif
    memoryOverlay.classList.remove(
      "peek-active",
      "revealed",
      "peek-content-hidden",
    );
    memoryOverlay.classList.remove("hidden");

    // Réinitialiser le texte du bouton Révéler et réactiver Coup d'œil
    const memoryRevealBtn = document.getElementById("memory-reveal-btn");
    if (memoryRevealBtn) {
      memoryRevealBtn.textContent = i18next.t("modes.memory.reveal");
    }

    const memoryPeekBtn = document.getElementById("memory-peek-btn");
    if (memoryPeekBtn) {
      memoryPeekBtn.disabled = false;
    }
  }
}

function hideMemoryOverlay() {
  if (memoryOverlay) {
    memoryOverlay.classList.add("hidden");
    // Réinitialiser les états peek et revealed pour la prochaine image
    memoryOverlay.classList.remove(
      "peek-active",
      "revealed",
      "peek-content-hidden",
    );
  }
}

function showPrevImageMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "prev-image-context-menu";
  menu.className = "context-menu menu-md";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  // Vérifier s'il y a un groupe de poses précédent disponible
  let hasPrevGroup = false;
  if (state.sessionMode === "custom") {
    for (let i = state.currentStepIndex - 1; i >= 0; i--) {
      if (state.customQueue[i].type === "pose") {
        hasPrevGroup = true;
        break;
      }
    }
  }

  const prevGroupOption = document.createElement("div");
  prevGroupOption.className = `context-menu-item${hasPrevGroup ? "" : " disabled"}`;
  prevGroupOption.innerHTML = `${ICONS.PREV}<span>${i18next.t("drawing.prevGroup")}</span>`;

  if (hasPrevGroup) {
    prevGroupOption.onclick = (e) => {
      e.stopPropagation();
      previousPoseGroup();
      menu.remove();
    };
  }

  menu.appendChild(prevGroupOption);
  adjustMenuPosition(menu, x, y);
}

function showNextImageMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "next-image-context-menu";
  menu.className = "context-menu menu-md";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  // Vérifier s'il y a un prochain groupe de poses disponible
  let hasNextGroup = false;
  if (state.sessionMode === "custom") {
    for (
      let i = state.currentStepIndex + 1;
      i < state.customQueue.length;
      i++
    ) {
      if (state.customQueue[i].type === "pose") {
        hasNextGroup = true;
        break;
      }
    }
  }

  const nextGroupOption = document.createElement("div");
  nextGroupOption.className = `context-menu-item${hasNextGroup ? "" : " disabled"}`;
  nextGroupOption.innerHTML = `${ICONS.NEXT}<span>${i18next.t("drawing.nextGroup")}</span>`;

  if (hasNextGroup) {
    nextGroupOption.onclick = (e) => {
      e.stopPropagation();
      nextPoseGroup();
      menu.remove();
    };
  }

  menu.appendChild(nextGroupOption);
  adjustMenuPosition(menu, x, y);
}

function updateFlipButtonUI() {
  flipHorizontalBtn.classList.toggle("active", state.flipHorizontal);
  flipHorizontalBtn.innerHTML = state.flipHorizontal
    ? ICONS.FLIP_H
    : ICONS.FLIP_H_REVERSED;

  flipVerticalBtn.classList.toggle("active", state.flipVertical);
  flipVerticalBtn.innerHTML = state.flipVertical
    ? ICONS.FLIP_V
    : ICONS.FLIP_V_REVERSED;
}

function toggleFlipHorizontal() {
  state.flipHorizontal = !state.flipHorizontal;
  updateFlipButtonUI();
  applyImageFilters();
}

function toggleFlipVertical() {
  state.flipVertical = !state.flipVertical;
  // Pas besoin de toggle la classe ici si updateFlipButtonUI s'en occupe déjà
  updateFlipButtonUI();
  applyImageFilters();
}

function toggleGrayscale() {
  state.grayscale = !state.grayscale;
  if (grayscaleBtn) {
    grayscaleBtn.classList.toggle("active", state.grayscale);
    grayscaleBtn.innerHTML = state.grayscale ? ICONS.BW_ON : ICONS.BW_OFF;
  }
  applyImageFilters();
}

function previousImage() {
  // Fermer le mode dessin overlay si actif
  if (typeof isDrawingModeActive !== "undefined" && isDrawingModeActive) {
    if (typeof closeDrawingMode === "function") {
      closeDrawingMode();
    }
  }

  if (state.currentIndex <= 0) return;
  state.currentIndex =
    (state.currentIndex - 1 + state.images.length) % state.images.length;
  resetTransforms();

  // Mettre à jour le compteur de poses si en mode custom
  if (state.sessionMode === "custom") {
    const currentStep = state.customQueue[state.currentStepIndex];
    if (currentStep && currentStep.type === "pose") {
      if (state.currentPoseInStep > 1) {
        state.currentPoseInStep--;
      }
    }
  }

  updateDisplay();
  startTimer();

  // Mettre à jour l'image info overlay s'il est ouvert
  const infoOverlay = document.getElementById("image-info-overlay");
  if (infoOverlay) {
    infoOverlay.remove();
    toggleImageInfo();
  }
}

function resetTransforms() {
  state.timeRemaining = state.selectedDuration;
  state.flipHorizontal = false;
  state.flipVertical = false;
  // NOTE: On ne réinitialise plus grayscale et blur pour qu'ils persistent entre les images
  // state.grayscale = false;
  // state.isBlurEnabled = false;
  flipHorizontalBtn.classList.remove("active");
  flipVerticalBtn.classList.remove("active");
  // NOTE: On garde les boutons grayscale et blur actifs s'ils sont activés
  // grayscaleBtn.classList.remove("active");
  // if (blurBtn) blurBtn.classList.remove("active");
  updateImageTransform();
}

function updateImageTransform() {
  if (currentImage) {
    currentImage.style.transform = `scaleX(${
      state.flipHorizontal ? -1 : 1
    }) scaleY(${state.flipVertical ? -1 : 1})`;
    currentImage.style.filter = state.grayscale ? "grayscale(100%)" : "none";
  }
}

// ================================================================
// GESTION DES MÉDIAS VIDÉO
// ================================================================

/**
 * Vérifie si un item est une vidéo
 * @param {Object} item - Item Eagle avec propriété ext
 * @returns {boolean}
 */
function isVideoFile(item) {
  if (!item || !item.ext) return false;
  return VIDEO_EXTENSIONS.includes(item.ext.toLowerCase());
}

/**
 * Vérifie si l'item est un fichier GIF animé
 * @param {Object} item - Item Eagle avec propriété ext
 * @returns {boolean}
 */
function isGifFile(item) {
  return item.ext.toLowerCase() === "gif";
}

/**
 * Affiche/cache les contrôles vidéo
 * @param {boolean} show - true pour afficher, false pour cacher
 */
function showVideoControls(show) {
  if (videoControlsBar) {
    videoControlsBar.style.display = show ? "flex" : "none";
  }

  // Désactiver le bouton flou progressif pour les vidéos
  if (progressiveBlurBtn) {
    progressiveBlurBtn.style.opacity = show
      ? OPACITY.DISABLED
      : OPACITY.ENABLED;
    progressiveBlurBtn.style.pointerEvents = show ? "none" : "auto";
  }
  if (homeProgressiveBlurBtn) {
    homeProgressiveBlurBtn.style.opacity = show
      ? OPACITY.DISABLED
      : OPACITY.ENABLED;
    homeProgressiveBlurBtn.style.pointerEvents = show ? "none" : "auto";
  }

  updateVideoSpeedDisplay();
  updateVideoPlayButton();
}

/**
 * Met à jour l'affichage de la vitesse de lecture
 */
function updateVideoSpeedDisplay() {
  if (videoSpeedDisplay) {
    videoSpeedDisplay.textContent = `${state.videoPlaybackRate}x`;

    // Coloration selon la vitesse
    if (state.videoPlaybackRate < 1) {
      videoSpeedDisplay.style.color = "#5eead4"; // Cyan pour ralenti
    } else if (state.videoPlaybackRate > 1) {
      videoSpeedDisplay.style.color = "#fbbf24"; // Jaune pour accéléré
    } else {
      videoSpeedDisplay.style.color = "var(--color-primary)";
    }
  }
}

/**
 * Change la vitesse de lecture de la vidéo
 * @param {number} delta - +1 pour accélérer, -1 pour ralentir
 */
function changeVideoSpeed(delta) {
  if (!state.isVideoFile || !currentVideo) return;

  const rates = VIDEO_CONSTANTS.PLAYBACK_RATES;
  const currentIndex = rates.indexOf(state.videoPlaybackRate);
  let newIndex = currentIndex + delta;

  // Clamp l'index entre 0 et le dernier élément
  newIndex = Math.max(0, Math.min(rates.length - 1, newIndex));

  state.videoPlaybackRate = rates[newIndex];
  currentVideo.playbackRate = state.videoPlaybackRate;
  updateVideoSpeedDisplay();
}

/**
 * Toggle la lecture en boucle de la vidéo
 */
function toggleVideoLoop() {
  if (!state.isVideoFile) return;

  state.videoLoop = !state.videoLoop;
  if (currentVideo) {
    currentVideo.loop = state.videoLoop;
  }

  if (videoLoopBtn) {
    videoLoopBtn.innerHTML = state.videoLoop
      ? ICONS.VIDEO_LOOP_ON
      : ICONS.VIDEO_LOOP_OFF;
    videoLoopBtn.classList.toggle("active", state.videoLoop);
  }
}

/**
 * Avance ou recule d'une frame dans la vidéo (version optimisée)
 * Utilise throttling + requestVideoFrameCallback pour une navigation fluide
 * @param {number} direction - 1 pour avancer, -1 pour reculer
 * @param {boolean} isRepeating - True si la touche est maintenue (e.repeat)
 */
function stepFrame(direction, isRepeating = false) {
  if (!state.isVideoFile || !currentVideo) return;

  // Mettre en pause si la vidéo joue
  if (!currentVideo.paused) {
    currentVideo.pause();
    state.videoPlaying = false;
  }

  // Enregistrer la direction demandée
  frameStepState.pendingDirection = direction;

  // Si c'est un step unique (pas de touche maintenue), exécuter directement avec throttle léger
  if (!isRepeating && !frameStepState.isHoldingKey) {
    performThrottledFrameStep(frameStepState.singleStepFPS);
    return;
  }

  // Mode touche maintenue : utiliser le système de throttling
  frameStepState.isHoldingKey = true;

  // Si on n'est pas déjà en train de traiter, démarrer la boucle
  if (!frameStepState.rafId && !frameStepState.isWaitingForFrame) {
    processFrameStepLoop();
  }
}

/**
 * Effectue un step de frame avec throttling
 * @param {number} maxFPS - FPS maximum autorisé
 */
function performThrottledFrameStep(maxFPS) {
  const now = performance.now();
  const minInterval = 1000 / maxFPS;

  // Vérifier le throttle
  if (now - frameStepState.lastStepTime < minInterval) {
    return false;
  }

  frameStepState.lastStepTime = now;

  // Calculer le nouveau temps
  const frameTime = 1 / state.videoFPS;
  const newTime =
    currentVideo.currentTime + frameTime * frameStepState.pendingDirection;
  const clampedTime = Math.max(
    0,
    Math.min(currentVideo.duration || 0, newTime),
  );

  // Vérifier si on est déjà aux limites
  if (clampedTime === currentVideo.currentTime) {
    return false;
  }

  // Utiliser requestVideoFrameCallback si disponible pour attendre le décodage
  if (frameStepState.vfcSupported && frameStepState.isHoldingKey) {
    frameStepState.isWaitingForFrame = true;
    currentVideo.currentTime = clampedTime;

    currentVideo.requestVideoFrameCallback(() => {
      frameStepState.isWaitingForFrame = false;
      // Continuer la boucle si la touche est toujours maintenue
      if (
        frameStepState.isHoldingKey &&
        frameStepState.pendingDirection !== 0
      ) {
        processFrameStepLoop();
      }
    });
  } else {
    // Fallback : seek direct
    currentVideo.currentTime = clampedTime;
  }

  return true;
}

/**
 * Boucle de traitement pour les frame steps (touche maintenue)
 * Utilise requestAnimationFrame pour synchroniser avec le rendu
 */
function processFrameStepLoop() {
  // Ne pas démarrer une nouvelle boucle si on attend une frame
  if (frameStepState.isWaitingForFrame) return;

  // Si la touche n'est plus maintenue, arrêter
  if (!frameStepState.isHoldingKey) {
    frameStepState.rafId = null;
    return;
  }

  // Effectuer le step avec throttle
  performThrottledFrameStep(frameStepState.targetFPS);

  // Si requestVideoFrameCallback n'est pas supporté, planifier le prochain frame
  if (!frameStepState.vfcSupported || !frameStepState.isWaitingForFrame) {
    frameStepState.rafId = requestAnimationFrame(processFrameStepLoop);
  } else {
    frameStepState.rafId = null;
  }
}

/**
 * Arrête le système de frame stepping (appelé sur keyup)
 */
function stopFrameStepping() {
  frameStepState.isHoldingKey = false;
  frameStepState.pendingDirection = 0;

  if (frameStepState.rafId) {
    cancelAnimationFrame(frameStepState.rafId);
    frameStepState.rafId = null;
  }
}

/**
 * Arrête le frame stepping depuis un bouton (nettoie aussi le timeout)
 */
function stopFrameSteppingFromButton() {
  // Annuler le timeout de démarrage du stepping continu
  if (frameStepState.buttonHoldTimeout) {
    clearTimeout(frameStepState.buttonHoldTimeout);
    frameStepState.buttonHoldTimeout = null;
  }
  stopFrameStepping();
}

/**
 * Toggle play/pause de la vidéo (indépendant du timer de pose)
 */
function toggleVideoPlayPause() {
  if (!state.isVideoFile || !currentVideo) return;

  if (currentVideo.paused) {
    currentVideo.play();
    state.videoPlaying = true;
  } else {
    currentVideo.pause();
    state.videoPlaying = false;
  }
  updateVideoPlayButton();
}

/**
 * Met à jour l'icône du bouton play/pause vidéo
 */
function updateVideoPlayButton() {
  if (!videoPlayBtn) return;

  if (state.isVideoFile && currentVideo && !currentVideo.paused) {
    videoPlayBtn.innerHTML = ICONS.VIDEO_PAUSE;
  } else {
    videoPlayBtn.innerHTML = ICONS.VIDEO_PLAY;
  }
}

/**
 * Formate un temps en secondes en format mm:ss
 * @param {number} seconds - Temps en secondes
 * @returns {string} - Format mm:ss
 */
function formatVideoTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Met à jour l'affichage du temps de la vidéo
 */
function updateVideoTimeDisplay() {
  if (!currentVideo || !state.isVideoFile) return;

  if (videoCurrentTime) {
    videoCurrentTime.textContent = formatVideoTime(currentVideo.currentTime);
  }
  if (videoDuration) {
    videoDuration.textContent = formatVideoTime(currentVideo.duration);
  }

  // Mettre à jour la timeline
  updateVideoTimeline();
}

/**
 * Met à jour la barre de progression de la timeline
 */
function updateVideoTimeline() {
  if (!currentVideo || !videoTimelineProgress || !videoTimelineHandle) return;

  const percent = currentVideo.duration
    ? (currentVideo.currentTime / currentVideo.duration) * 100
    : 0;

  videoTimelineProgress.style.width = `${percent}%`;
  videoTimelineHandle.style.left = `${percent}%`;
}

/**
 * Navigue dans la vidéo à partir d'un clic sur la timeline
 * @param {MouseEvent} e - Événement souris
 */
function seekVideo(e) {
  if (!currentVideo || !videoTimeline) return;

  const rect = videoTimeline.getBoundingClientRect();
  const percent = Math.max(
    0,
    Math.min(1, (e.clientX - rect.left) / rect.width),
  );
  currentVideo.currentTime = percent * currentVideo.duration;

  updateVideoTimeDisplay();
}

/**
 * Gère l'affichage du média (image ou vidéo)
 * @param {Object} media - Objet média depuis state.images
 * @param {boolean} shouldAnimateFlip - Si true, anime le flip
 */
function updateMediaElement(media, shouldAnimateFlip = false) {
  const isVideo = isVideoFile(media);
  state.isVideoFile = isVideo;

  if (isVideo) {
    // === AFFICHAGE VIDÉO ===
    currentImage.style.display = "none";
    currentVideo.style.display = "block";

    // Nettoyer et charger la vidéo
    currentVideo.src = `file:///${media.filePath}`;
    currentVideo.playbackRate = state.videoPlaybackRate;
    currentVideo.loop = state.videoLoop;
    currentVideo.muted = true; // Toujours muet (pas de son nécessaire)

    // Événements vidéo
    currentVideo.onloadedmetadata = () => {
      applyImageFilters();
      setTimeout(() => updateGridOverlay(), 100);
      updateVideoTimeDisplay();
    };

    currentVideo.ontimeupdate = () => {
      updateVideoTimeDisplay();
    };

    currentVideo.onplay = () => {
      state.videoPlaying = true;
      updateVideoPlayButton();
    };

    currentVideo.onpause = () => {
      state.videoPlaying = false;
      updateVideoPlayButton();
    };

    currentVideo.onerror = () => {
      console.error("Erreur de chargement vidéo:", media.filePath);
    };

    // Synchroniser lecture avec session si en cours
    if (state.isPlaying) {
      currentVideo.play().catch(() => {});
      state.videoPlaying = true;
    } else {
      currentVideo.pause();
      state.videoPlaying = false;
    }

    // Afficher les contrôles vidéo et mettre à jour boutons
    showVideoControls(true);
    updateVideoPlayButton();
  } else {
    // === AFFICHAGE IMAGE ===
    currentVideo.style.display = "none";
    currentVideo.pause();
    // Nettoyer les event handlers AVANT de vider la source (évite erreurs console)
    currentVideo.onerror = null;
    currentVideo.onloadedmetadata = null;
    currentVideo.ontimeupdate = null;
    currentVideo.onplay = null;
    currentVideo.onpause = null;
    currentVideo.src = "";
    currentImage.style.display = "block";
    state.isVideoFile = false;

    // Nettoyer les anciens event listeners
    currentImage.onload = null;
    currentImage.onerror = null;

    // Nettoyer l'animation précédente
    currentImage.classList.remove("flip-animation");

    // Charger l'image
    currentImage.src = `file:///${media.filePath}`;

    // Appliquer les filtres une fois que l'image est chargée
    const applyFiltersOnLoad = () => {
      if (shouldAnimateFlip && CONFIG.enableFlipAnimation) {
        currentImage.classList.add("flip-animation");
        setTimeout(() => {
          applyImageFilters();
        }, 150);
        setTimeout(() => {
          currentImage.classList.remove("flip-animation");
        }, 300);
      } else {
        applyImageFilters();
      }
    };

    if (currentImage.complete) {
      applyFiltersOnLoad();
      setTimeout(() => updateGridOverlay(), 100);
    } else {
      currentImage.onload = () => {
        applyFiltersOnLoad();
        setTimeout(() => updateGridOverlay(), 100);
      };
    }

    // Cacher les contrôles vidéo
    showVideoControls(false);
  }
}

function updateDisplay(shouldAnimateFlip = false) {
  const isCustomPause =
    state.sessionMode === "custom" &&
    state.customQueue[state.currentStepIndex]?.type === "pause";

  const buttonsToDisable = [
    toggleTimerBtn,
    soundBtn,
    flipHorizontalBtn,
    flipVerticalBtn,
    grayscaleBtn,
    blurBtn,
    progressiveBlurBtn,
    revealBtn,
    deleteBtn,
  ];

  if (isCustomPause) {
    pauseOverlay.classList.remove("hidden");
    if (imageContainer) imageContainer.style.visibility = "hidden";
    imageCounter.style.visibility = "hidden";

    buttonsToDisable.forEach((btn) => {
      if (btn) btn.classList.add("disabled-in-pause");
    });

    let nextPoseStep = null;
    for (
      let i = state.currentStepIndex + 1;
      i < state.customQueue.length;
      i++
    ) {
      if (state.customQueue[i].type === "pose") {
        nextPoseStep = state.customQueue[i];
        break;
      }
    }

    if (nextStepInfoDisplay) {
      if (nextPoseStep) {
        const poseCount = nextPoseStep.count;

        const d = nextPoseStep.duration;
        const m = Math.floor(d / 60);
        const s = d % 60;
        let durationText = "";
        if (m > 0) durationText += m + " min ";
        if (s > 0 || m === 0) durationText += s + "s";

        const poseWord =
          poseCount > 1 ? i18next.t("misc.poses") : i18next.t("misc.pose");

        nextStepInfoDisplay.innerHTML = i18next.t("drawing.nextStep", {
          poseCount,
          poseWord,
          duration: durationText.trim(),
        });
      } else {
        nextStepInfoDisplay.textContent = i18next.t("drawing.lastStep");
      }
    }
  } else {
    pauseOverlay.classList.add("hidden");
    if (imageContainer) imageContainer.style.visibility = "visible";
    imageCounter.style.visibility = "visible";

    if (nextStepInfoDisplay) nextStepInfoDisplay.style.display = "none";

    buttonsToDisable.forEach((btn) => {
      if (btn) btn.classList.remove("disabled-in-pause");
    });

    const image = state.images[state.currentIndex];
    if (!image) return;

    // ========================================
    // OPTIMISATION: Précharger les médias alentour (images uniquement)
    // ========================================
    if (!isVideoFile(image)) {
      imageCache.preload(state.currentIndex, state.images.length);
    }

    // ========================================
    // Afficher le média (image ou vidéo)
    // ========================================
    updateMediaElement(image, shouldAnimateFlip);

    if (!state.imagesSeen.some((img) => img.id === image.id))
      state.imagesSeen.push(image);

    imageCounter.textContent = `${state.currentIndex + 1} / ${
      state.images.length
    }`;

    if (state.currentIndex <= 0) {
      prevBtn.style.opacity = OPACITY.DISABLED;
      prevBtn.style.pointerEvents = "none";
    } else {
      prevBtn.style.opacity = OPACITY.ENABLED;
      prevBtn.style.pointerEvents = "all";
    }

    if (state.sessionMode === "custom") {
      const currentStep = state.customQueue[state.currentStepIndex];
      if (currentStep) {
        // 1. Calculer le total de poses combinées
        const poseSteps = state.customQueue.filter(
          (step) => step.type === "pose",
        );
        const totalPosesInSession = poseSteps.reduce(
          (acc, step) => acc + step.count,
          0,
        );

        let globalPoseIndex = 0;
        for (let i = 0; i < state.currentStepIndex; i++) {
          if (state.customQueue[i].type === "pose") {
            globalPoseIndex += state.customQueue[i].count;
          }
        }
        globalPoseIndex += state.currentPoseInStep || 1;

        const showGlobal = poseSteps.length > 1;

        imageCounter.innerHTML = `
          <div class="session-info-container">
          ${
            showGlobal
              ? `<div class="global-progress">SESSION : ${globalPoseIndex} / ${totalPosesInSession}</div>`
              : ""
          }
            <div class="group-info">Série ${
              state.currentStepIndex + 1
            }<span> / ${state.customQueue.length}</span></div>
            <div class="pose-info">
              <span class="current-pose">${state.currentPoseInStep || 1}</span>
              <span class="total-poses"> / ${currentStep.count}</span>
            </div>
            
          </div>
        `;
      }
    }
  }

  updateTimerDisplay();
  updateImageTransform();
  applyImageFilters();
}

// ================================================================
// UTILITAIRE DE CONSTRUCTION DE MENU CONTEXTUEL
// ================================================================

/**
 * Construit un menu contextuel à partir d'une configuration déclarative.
 * @param {string} id - L'ID du menu
 * @param {Array} items - Configuration des éléments du menu
 * @param {number} x - Position X
 * @param {number} y - Position Y
 * @param {Object} options - Options supplémentaires (size: 'md'|'lg', onClose: callback)
 * @returns {HTMLElement} Le menu créé
 *
 * Format des items:
 * - "separator" : ajoute un séparateur
 * - { text, onClick, icon?, shortcut?, active?, disabled?, visible? } : item de menu
 */
function buildContextMenu(id, items, x, y, options = {}) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = id;
  menu.className = `context-menu${options.size ? ` menu-${options.size}` : ""}`;
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  // Fonction helper pour créer un élément de menu
  const createItem = (config) => {
    // Item de type "label" (non cliquable, titre de section)
    if (config.label) {
      const label = document.createElement("div");
      label.className = "context-menu-label";
      label.textContent = config.text;
      return label;
    }

    const item = document.createElement("div");
    const hasShortcut = !!config.shortcut;
    const isActive = !!config.active;
    const isDisabled = !!config.disabled;

    item.className = `context-menu-item${hasShortcut ? " with-shortcut" : ""}${isActive ? " active" : ""}${isDisabled ? " disabled" : ""}`;

    if (isDisabled) {
      item.style.opacity = "0.4";
      item.style.cursor = "not-allowed";
      item.style.pointerEvents = "none";
    }

    const leftContainer = document.createElement("div");
    leftContainer.className = "context-menu-item-left";

    if (config.icon) {
      const iconContainer = document.createElement("span");
      iconContainer.innerHTML = config.icon;
      iconContainer.className = "context-menu-item-icon";
      leftContainer.appendChild(iconContainer);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = config.text;
    leftContainer.appendChild(textSpan);
    item.appendChild(leftContainer);

    if (config.shortcut) {
      const shortcutSpan = document.createElement("span");
      shortcutSpan.textContent = config.shortcut;
      shortcutSpan.className = "shortcut";
      item.appendChild(shortcutSpan);
    }

    if (!isDisabled) {
      item.onclick = (e) => {
        e.stopPropagation();
        config.onClick();
        menu.remove();
      };
    }

    return item;
  };

  // Construction du menu à partir de la configuration
  for (const item of items) {
    // Ignorer les éléments non visibles
    if (item !== "separator" && item.visible === false) continue;

    if (item === "separator") {
      const sep = document.createElement("div");
      sep.className = "context-menu-separator";
      menu.appendChild(sep);
    } else {
      menu.appendChild(createItem(item));
    }
  }

  document.body.appendChild(menu);
  adjustMenuPosition(menu, x, y);

  return menu;
}

// ================================================================
// MENU CONTEXTUEL POUR OPTIONS AUTOFLIP
// ================================================================

function showImageContextMenu(x, y) {
  // Ne pas afficher si le mode dessin est actif
  if (typeof isDrawingModeActive !== "undefined" && isDrawingModeActive) {
    return;
  }

  const ICON_DRAW =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 11 17 26t6 30q0 15-5.5 29.5T897-728L530-360H360Zm440-368-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z"/></svg>';

  const handleFocusMode = () => {
    state.isBlurEnabled = !state.isBlurEnabled;
    if (blurBtn) {
      blurBtn.classList.toggle("active", state.isBlurEnabled);
      blurBtn.innerHTML = state.isBlurEnabled ? ICONS.BLUR_ON : ICONS.BLUR_OFF;
    }
    if (state.isBlurEnabled) {
      state.isProgressiveBlur = false;
      if (progressiveBlurBtn) progressiveBlurBtn.classList.remove("active");
      if (homeProgressiveBlurBtn)
        homeProgressiveBlurBtn.classList.remove("active");
    }
    applyImageFilters();
  };

  const menuItems = [
    {
      text: state.isPlaying ? "Pause" : "Play",
      onClick: togglePlayPause,
      icon: state.isPlaying ? ICONS.PAUSE : ICONS.PLAY,
      shortcut: i18next.t("controls.spaceKey"),
    },
    {
      text: i18next.t("drawing.nextImage"),
      onClick: nextImage,
      icon: ICONS.NEXT,
      shortcut: "→",
    },
    {
      text: i18next.t("drawing.previousImage"),
      onClick: previousImage,
      icon: ICONS.PREV,
      shortcut: "←",
      visible: state.currentIndex > 0,
    },

    "separator",

    {
      text: i18next.t("draw.annotate"),
      onClick: openDrawingMode,
      icon: ICON_DRAW,
      shortcut: CONFIG.HOTKEYS.DRAWING_TOOL_PENCIL.toUpperCase(),
      visible: !state.isVideoFile && typeof openDrawingMode === "function",
    },

    "separator",

    {
      text: i18next.t("drawing.flipHorizontal"),
      onClick: toggleFlipHorizontal,
      active: state.flipHorizontal,
      icon: state.flipHorizontal ? ICONS.FLIP_H : ICONS.FLIP_H_REVERSED,
      shortcut: CONFIG.HOTKEYS.FLIP_H,
    },
    {
      text: i18next.t("drawing.flipVertical"),
      onClick: toggleFlipVertical,
      active: state.flipVertical,
      icon: state.flipVertical ? ICONS.FLIP_V : ICONS.FLIP_V_REVERSED,
    },
    {
      text: i18next.t("filters.grayscale"),
      onClick: toggleGrayscale,
      active: state.grayscale,
      icon: state.grayscale ? ICONS.BW_ON : ICONS.BW_OFF,
      shortcut: CONFIG.HOTKEYS.GRAYSCALE.toUpperCase(),
    },
    {
      text: i18next.t("filters.focusMode"),
      onClick: handleFocusMode,
      active: state.isBlurEnabled,
      icon: state.isBlurEnabled ? ICONS.BLUR_ON : ICONS.BLUR_OFF,
      shortcut: CONFIG.HOTKEYS.BLUR.toUpperCase(),
      disabled: state.isProgressiveBlur,
    },
    {
      text: i18next.t("filters.progressiveBlur"),
      onClick: toggleProgressiveBlur,
      active: state.isProgressiveBlur,
      icon: ICONS.PROGRESSIVE_BLUR,
      visible: state.sessionMode !== "relax",
      disabled: state.isBlurEnabled,
    },

    "separator",

    {
      text: i18next.t("filters.grid"),
      onClick: showGridConfig,
      icon: ICONS.GRID,
      shortcut: CONFIG.HOTKEYS.GRID.toUpperCase(),
    },
    {
      text: i18next.t("filters.silhouette"),
      onClick: showSilhouetteConfig,
      active: state.silhouetteEnabled,
      icon: ICONS.SILHOUETTE,
      shortcut: CONFIG.HOTKEYS.SILHOUETTE.toUpperCase(),
    },

    "separator",

    {
      text: i18next.t("drawing.showInfo"),
      onClick: toggleImageInfo,
      shortcut: CONFIG.HOTKEYS.INFO.toUpperCase(),
    },
    {
      text: i18next.t("drawing.copyImage"),
      onClick: copyImageToClipboard,
    },
    {
      text: i18next.t("drawing.revealInExplorer"),
      onClick: openImageInExplorer,
    },
    {
      text: i18next.t("drawing.openInEagle"),
      onClick: revealImage,
      icon: ICONS.REVEAL,
    },
  ];

  buildContextMenu("image-context-menu", menuItems, x, y);
}

function showRevealMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "reveal-context-menu";
  menu.className = "context-menu menu-md";

  const createMenuItem = (text, onClick, iconSvg = null) => {
    const item = document.createElement("div");
    item.className = "context-menu-item";
    if (iconSvg) {
      item.innerHTML = `<span class="context-menu-item-icon">${iconSvg}</span><span>${text}</span>`;
    } else {
      item.textContent = text;
    }
    item.onclick = (e) => {
      e.stopPropagation();
      onClick();
      menu.remove();
    };
    return item;
  };

  menu.appendChild(
    createMenuItem(i18next.t("drawing.openInEagle"), revealImage, ICONS.REVEAL),
  );
  menu.appendChild(
    createMenuItem(i18next.t("drawing.revealInExplorer"), openImageInExplorer),
  );

  adjustMenuPosition(menu, x, y, true);
}

function showBlurMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "blur-context-menu";
  menu.className = "context-menu menu-md";

  const createMenuItem = (text, onClick, shortcut = null, disabled = false) => {
    const item = document.createElement("div");
    item.className = `context-menu-item with-shortcut${disabled ? " disabled" : ""}`;
    item.innerHTML = `<span>${text}</span>${shortcut ? `<span class="shortcut">${shortcut}</span>` : ""}`;

    if (!disabled) {
      item.onclick = (e) => {
        e.stopPropagation();
        onClick();
        menu.remove();
      };
    }
    return item;
  };

  const increaseBlur = () => {
    if (state.isBlurEnabled) {
      state.blurAmount = Math.min(
        state.blurAmount + 2.5,
        UI_CONSTANTS.MAX_BLUR_AMOUNT,
      );
      applyImageFilters();
    }
  };

  const decreaseBlur = () => {
    if (state.isBlurEnabled) {
      state.blurAmount = Math.max(
        state.blurAmount - 2.5,
        UI_CONSTANTS.MIN_BLUR_AMOUNT,
      );
      applyImageFilters();
    }
  };

  const isDisabled = !state.isBlurEnabled;
  menu.appendChild(
    createMenuItem(
      i18next.t("filters.increaseBlur"),
      increaseBlur,
      "↑",
      isDisabled,
    ),
  );
  menu.appendChild(
    createMenuItem(
      i18next.t("filters.decreaseBlur"),
      decreaseBlur,
      "↓",
      isDisabled,
    ),
  );

  adjustMenuPosition(menu, x, y, true);
}

// ================================================================
// GRID OVERLAY SYSTEM
// ================================================================

/**
 * Rafraîchit la liste des repères dans le modal de configuration de grille (si ouvert)
 */
function refreshGuidesListInModal(popup) {
  const guidesList = popup.querySelector("#guides-list");
  if (!guidesList) return;

  if (state.gridGuides.length === 0) {
    guidesList.innerHTML = `<div class="guides-empty-message">${i18next.t("grid.noGuides")}</div>`;
  } else {
    guidesList.innerHTML = state.gridGuides
      .map(
        (guide, index) => `
      <div class="guide-list-item">
        <span class="guide-label">${guide.type === "vertical" ? ICONS.LINE_VERTICAL : ICONS.LINE_HORIZONTAL} ${guide.type === "vertical" ? i18next.t("grid.verticalGuide") : i18next.t("grid.horizontalGuide")}</span>
        <button class="remove-guide-btn" data-index="${index}">✕</button>
      </div>
    `,
      )
      .join("");

    // Ajouter event listeners pour les boutons de suppression
    popup.querySelectorAll(".remove-guide-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // Empêcher la propagation pour ne pas fermer le modal
        const index = parseInt(btn.dataset.index);
        state.gridGuides.splice(index, 1);
        refreshGuidesListInModal(popup);
        updateGridOverlay();
      });
    });
  }
}

function showGridConfig() {
  closeAllContextMenus();

  // Fermer si déjà ouvert
  const existing = document.getElementById("grid-config-popup");
  if (existing) {
    existing.remove();
    // Restaurer l'état de lecture si on ferme le modal
    if (wasPlayingBeforeModal && !state.isPlaying) {
      togglePlayPause();
    }
    return;
  }

  // Sauvegarder l'état de lecture et mettre en pause
  wasPlayingBeforeModal = state.isPlaying;
  if (state.isPlaying) {
    togglePlayPause();
  }

  const popup = document.createElement("div");
  popup.id = "grid-config-popup";
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 20, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    padding: 0;
    z-index: 10001;
    min-width: 300px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
  `;

  popup.innerHTML = `
    <div id="grid-config-header" style="padding: 15px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); cursor: move; user-select: none;">
      <h3 style="margin: 0; color: var(--color-primary); font-size: 18px; text-align: center;">
        ${i18next.t("filters.gridConfig")}
        <span style="color: #888; font-size: 11px; font-weight: normal; margin-left: 8px;">Shift+${CONFIG.HOTKEYS.GRID.toUpperCase()}</span>
      </h3>
    </div>
    <div style="padding: 20px;">

    <div style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
      <span style="color: #ccc; font-size: 14px;">${i18next.t("grid.enableGrid")}</span>
      <label class="grid-switch">
        <input type="checkbox" id="grid-toggle" ${
          state.gridEnabled ? "checked" : ""
        }>
        <span class="grid-slider"></span>
      </label>
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; color: #888; font-size: 12px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">${i18next.t("grid.presetMode")}</label>
      <div style="display: flex; gap: 8px;">
        <button class="grid-mode-btn ${
          state.gridMode === "thirds" ? "active" : ""
        }" data-mode="thirds">${i18next.t("grid.thirds")}</button>
        <button class="grid-mode-btn ${
          state.gridMode === "golden" ? "active" : ""
        }" data-mode="golden">${i18next.t("grid.golden")}</button>
        <button class="grid-mode-btn ${
          state.gridMode === "custom" ? "active" : ""
        }" data-mode="custom">${i18next.t("grid.custom")}</button>
      </div>
    </div>

    <div id="custom-grid-controls" style="${
      state.gridMode === "custom" ? "" : "display: none;"
    }">
      <div style="margin-bottom: 15px;">
        <label style="display: flex; justify-content: space-between; align-items: center; color: #ccc; font-size: 13px; margin-bottom: 5px;">
          <span>${i18next.t("grid.cols")}</span>
          <span id="grid-cols-value" style="color: var(--color-primary); font-weight: bold;">${
            state.gridCols
          }</span>
        </label>
        <input type="range" id="grid-cols-slider" min="1" max="10" value="${
          state.gridCols
        }" 
          style="width: 100%; cursor: pointer;">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display: flex; justify-content: space-between; align-items: center; color: #ccc; font-size: 13px; margin-bottom: 5px;">
          <span>${i18next.t("grid.rows")}</span>
          <span id="grid-rows-value" style="color: var(--color-primary); font-weight: bold;">${
            state.gridRows
          }</span>
        </label>
        <input type="range" id="grid-rows-slider" min="1" max="10" value="${
          state.gridRows
        }" 
          style="width: 100%; cursor: pointer;">
      </div>
    </div>

    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
      <label style="display: block; color: #888; font-size: 12px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px;">${i18next.t("grid.customGuides")}</label>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button id="add-vertical-guide-btn" class="guide-add-btn">
          ${ICONS.LINE_VERTICAL}
          ${i18next.t("grid.verticalGuide")}
        </button>
        <button id="add-horizontal-guide-btn" class="guide-add-btn">
          ${ICONS.LINE_HORIZONTAL}
          ${i18next.t("grid.horizontalGuide")}
        </button>
      </div>
      <div id="guides-list">
        ${state.gridGuides.length === 0 ? `<div class="guides-empty-message">${i18next.t("grid.noGuides")}</div>` : ""}
      </div>
    </div>

    </div>
  `;

  document.body.appendChild(popup);

  // Drag and drop functionality
  const header = popup.querySelector("#grid-config-header");
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;

    // Obtenir la position actuelle du popup
    const rect = popup.getBoundingClientRect();
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;

    // Désactiver la transformation de centrage
    popup.style.transform = "none";
    popup.style.left = rect.left + "px";
    popup.style.top = rect.top + "px";

    header.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;

    popup.style.left = currentX + "px";
    popup.style.top = currentY + "px";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = "move";
    }
  });

  // Event listeners
  const toggle = popup.querySelector("#grid-toggle");
  toggle.addEventListener("change", (e) => {
    state.gridEnabled = e.target.checked;
    updateGridOverlay();
  });

  const modeButtons = popup.querySelectorAll(".grid-mode-btn");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const clickedMode = btn.dataset.mode;

      // Si on clique sur le bouton déjà actif, on le désactive
      if (state.gridMode === clickedMode) {
        btn.classList.remove("active");
        state.gridMode = "none";
      } else {
        // Sinon, on active le nouveau mode
        modeButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.gridMode = clickedMode;

        // Activer automatiquement la grille si elle ne l'est pas
        if (!state.gridEnabled) {
          state.gridEnabled = true;
          toggle.checked = true;
        }
      }

      const customControls = popup.querySelector("#custom-grid-controls");
      customControls.style.display =
        state.gridMode === "custom" ? "block" : "none";

      updateGridOverlay();
    });
  });

  const colsSlider = popup.querySelector("#grid-cols-slider");
  const rowsSlider = popup.querySelector("#grid-rows-slider");
  const colsValue = popup.querySelector("#grid-cols-value");
  const rowsValue = popup.querySelector("#grid-rows-value");

  // Initialiser les gradients des sliders
  initSliderWithGradient(colsSlider);
  initSliderWithGradient(rowsSlider);

  colsSlider?.addEventListener("input", (e) => {
    state.gridCols = parseInt(e.target.value);
    colsValue.textContent = state.gridCols;
    updateSliderGradient(colsSlider);
    if (state.gridMode === "custom") updateGridOverlay();
  });

  rowsSlider?.addEventListener("input", (e) => {
    state.gridRows = parseInt(e.target.value);
    rowsValue.textContent = state.gridRows;
    updateSliderGradient(rowsSlider);
    if (state.gridMode === "custom") updateGridOverlay();
  });

  // Event listeners pour les boutons d'ajout de repères
  const addVerticalGuideBtn = popup.querySelector("#add-vertical-guide-btn");
  const addHorizontalGuideBtn = popup.querySelector(
    "#add-horizontal-guide-btn",
  );

  function refreshGuidesList() {
    refreshGuidesListInModal(popup);
  }

  addVerticalGuideBtn?.addEventListener("click", () => {
    // Activer automatiquement la grille si elle ne l'est pas
    if (!state.gridEnabled) {
      state.gridEnabled = true;
      toggle.checked = true;
      updateGridOverlay();
    }
    state.gridGuides.push({ type: "vertical", position: 50 }); // Position en pourcentage (50% = centre)
    refreshGuidesList();
    updateGridOverlay();
  });

  addHorizontalGuideBtn?.addEventListener("click", () => {
    // Activer automatiquement la grille si elle ne l'est pas
    if (!state.gridEnabled) {
      state.gridEnabled = true;
      toggle.checked = true;
      updateGridOverlay();
    }
    state.gridGuides.push({ type: "horizontal", position: 50 });
    refreshGuidesList();
    updateGridOverlay();
  });

  refreshGuidesList();

  // Fermer en cliquant à l'extérieur
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!popup.contains(e.target)) {
        const zoomOverlay = document.getElementById("zoom-overlay");

        // Si on est dans le zoom-overlay, arrêter IMMÉDIATEMENT la propagation pour ne pas fermer le zoom
        if (zoomOverlay && zoomOverlay.contains(e.target)) {
          e.stopImmediatePropagation();
        }

        popup.remove();
        document.removeEventListener("click", closeHandler, true);
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("click", closeHandler, true);

    // Fermer avec Échap
    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        popup.remove();
        document.removeEventListener("click", closeHandler, true);
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
  }, 100);
}

function updateGridOverlay() {
  let overlay = document.getElementById("grid-overlay");

  // Si la grille est désactivée (toggle off), tout cacher (grille + repères)
  if (!state.gridEnabled) {
    if (overlay) overlay.remove();
    return;
  }

  if (!overlay) {
    overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.id = "grid-overlay";
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
      mix-blend-mode: difference;
    `;

    const imgWrapper = document.querySelector(".image-wrapper");
    if (imgWrapper) {
      imgWrapper.style.position = "relative";
      imgWrapper.appendChild(overlay);
    }
  }

  // Effacer le contenu existant
  overlay.innerHTML = "";

  // Obtenir les dimensions (image ou vidéo selon le média affiché)
  const mediaElement = state.isVideoFile
    ? document.getElementById("current-video")
    : document.getElementById("current-image");
  if (!mediaElement) return;

  const rect = mediaElement.getBoundingClientRect();
  overlay.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  overlay.setAttribute("width", rect.width);
  overlay.setAttribute("height", rect.height);

  // Dessiner la grille prédéfinie uniquement si un mode est sélectionné (pas "none")
  if (state.gridMode !== "none") {
    let rows, cols;

    switch (state.gridMode) {
      case "thirds":
        rows = 3;
        cols = 3;
        break;
      case "golden":
        rows = 2;
        cols = 2;
        // Nombre d'or: environ 1.618
        break;
      case "custom":
        rows = state.gridRows;
        cols = state.gridCols;
        break;
    }

    // Dessiner les lignes verticales
    if (state.gridMode === "golden") {
      // Nombre d'or vertical
      const goldenRatio = 1.618;
      const x1 = rect.width / goldenRatio;
      const x2 = rect.width - x1;

      drawLine(overlay, x1, 0, x1, rect.height);
      drawLine(overlay, x2, 0, x2, rect.height);

      // Nombre d'or horizontal
      const y1 = rect.height / goldenRatio;
      const y2 = rect.height - y1;

      drawLine(overlay, 0, y1, rect.width, y1);
      drawLine(overlay, 0, y2, rect.width, y2);
    } else {
      for (let i = 1; i < cols; i++) {
        const x = (rect.width / cols) * i;
        drawLine(overlay, x, 0, x, rect.height);
      }

      // Dessiner les lignes horizontales
      for (let i = 1; i < rows; i++) {
        const y = (rect.height / rows) * i;
        drawLine(overlay, 0, y, rect.width, y);
      }
    }
  }

  // Dessiner les repères personnalisés (déplaçables) - affichés si gridEnabled est true
  state.gridGuides.forEach((guide, index) => {
    if (guide.type === "vertical") {
      const x = (rect.width * guide.position) / 100;
      drawDraggableGuide(
        overlay,
        "vertical",
        x,
        rect.width,
        rect.height,
        index,
      );
    } else {
      const y = (rect.height * guide.position) / 100;
      drawDraggableGuide(
        overlay,
        "horizontal",
        y,
        rect.width,
        rect.height,
        index,
      );
    }
  });
}

function drawLine(svg, x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", "white");
  line.setAttribute("stroke-width", "1");
  svg.appendChild(line);
}

function drawDraggableGuide(svg, type, position, width, height, guideIndex) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "draggable-guide");
  const cursorType = type === "vertical" ? "col-resize" : "row-resize";
  group.style.cursor = cursorType;
  group.setAttribute("cursor", cursorType); // Aussi via attribut SVG
  group.style.pointerEvents = "all";

  // Calculer la position en pourcentage pour déterminer la couleur
  const currentGuide = state.gridGuides[guideIndex];
  const percentage = currentGuide ? currentGuide.position : 50;
  // Marge plus large en haut pour les repères horizontaux (2%) à cause de la barre de titre
  const isInDeleteZone =
    type === "vertical"
      ? percentage < 1 || percentage > 99
      : percentage < 2 || percentage > 99;

  // Ligne du repère (plus épaisse et colorée différemment)
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  if (type === "vertical") {
    line.setAttribute("x1", position);
    line.setAttribute("y1", 0);
    line.setAttribute("x2", position);
    line.setAttribute("y2", height);
  } else {
    line.setAttribute("x1", 0);
    line.setAttribute("y1", position);
    line.setAttribute("x2", width);
    line.setAttribute("y2", position);
  }
  // Rouge si dans la zone de suppression, sinon bleu
  line.setAttribute("stroke", isInDeleteZone ? "#ff3b30" : "#667eea");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-dasharray", "5,5");
  line.style.cursor = type === "vertical" ? "col-resize" : "row-resize";
  group.appendChild(line);

  // Zone de drag invisible (plus large pour faciliter la saisie)
  const hitArea = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line",
  );
  if (type === "vertical") {
    hitArea.setAttribute("x1", position);
    hitArea.setAttribute("y1", 0);
    hitArea.setAttribute("x2", position);
    hitArea.setAttribute("y2", height);
  } else {
    hitArea.setAttribute("x1", 0);
    hitArea.setAttribute("y1", position);
    hitArea.setAttribute("x2", width);
    hitArea.setAttribute("y2", position);
  }
  hitArea.setAttribute("stroke", "transparent");
  hitArea.setAttribute("stroke-width", "20"); // Zone de clic large
  hitArea.style.cursor = type === "vertical" ? "col-resize" : "row-resize";
  group.appendChild(hitArea);

  svg.appendChild(group);

  // Gestion du drag
  let isDragging = false;

  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    svg.style.cursor = type === "vertical" ? "col-resize" : "row-resize";
  };

  const drag = (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const svgRect = svg.getBoundingClientRect();
    let percentage;
    if (type === "vertical") {
      const x = e.clientX - svgRect.left;
      percentage = (x / width) * 100;
    } else {
      const y = e.clientY - svgRect.top;
      percentage = (y / height) * 100;
    }

    // Ne pas limiter pendant le drag pour permettre de sortir le repère
    state.gridGuides[guideIndex].position = percentage;

    // Changer la couleur du repère en rouge s'il est dans la zone de suppression
    // Marge plus large en haut pour les repères horizontaux (2%) à cause de la barre de titre
    const isInDeleteZone =
      type === "vertical"
        ? percentage < 1 || percentage > 99
        : percentage < 2 || percentage > 99;
    line.setAttribute("stroke", isInDeleteZone ? "#ff3b30" : "#667eea");

    updateGridOverlay();
  };

  const stopDrag = () => {
    if (isDragging) {
      isDragging = false;
      svg.style.cursor = "";

      // Supprimer le repère s'il est dans la zone de suppression
      // Marge plus large en haut pour les repères horizontaux (2%) à cause de la barre de titre
      const position = state.gridGuides[guideIndex].position;
      const shouldDelete =
        type === "vertical"
          ? position < 1 || position > 99
          : position < 2 || position > 99;

      if (shouldDelete) {
        state.gridGuides.splice(guideIndex, 1);

        // Rafraîchir la liste dans le modal s'il est ouvert
        const gridPopup = document.getElementById("grid-config-popup");
        if (gridPopup) {
          const guidesList = gridPopup.querySelector("#guides-list");
          if (guidesList) {
            refreshGuidesListInModal(gridPopup);
          }
        }

        updateGridOverlay();
      }
    }
  };

  group.addEventListener("mousedown", startDrag);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", stopDrag);
}

/**
 * Affiche le popup de configuration de la silhouette (filtre seuil)
 */
function showSilhouetteConfig() {
  closeAllContextMenus();

  // Fermer si déjà ouvert
  const existing = document.getElementById("silhouette-config-popup");
  if (existing) {
    existing.remove();
    // Restaurer l'état de lecture si on ferme le modal
    if (wasPlayingBeforeModal && !state.isPlaying) {
      togglePlayPause();
    }
    return;
  }

  // Sauvegarder l'état de lecture et mettre en pause
  wasPlayingBeforeModal = state.isPlaying;
  if (state.isPlaying) {
    togglePlayPause();
  }

  const popup = document.createElement("div");
  popup.id = "silhouette-config-popup";

  popup.innerHTML = `
    <div id="silhouette-config-header">
      <h3>${i18next.t("filters.silhouetteConfig")} <span style="color: #888; font-size: 11px; font-weight: normal; margin-left: 8px;">Shift+S</span></h3>
    </div>
    <div class="config-body">

    <div class="config-row">
      <span class="config-label">${i18next.t("filters.enableSilhouette")}</span>
      <label class="silhouette-switch">
        <input type="checkbox" id="silhouette-toggle" ${
          state.silhouetteEnabled ? "checked" : ""
        }>
        <span class="silhouette-slider"></span>
      </label>
    </div>

    <div class="threshold-container">
      <label class="threshold-header">
        <span>${i18next.t("filters.brightness")}</span>
        <span id="brightness-value" class="threshold-value">${state.silhouetteBrightness.toFixed(2)}</span>
      </label>
      <input type="range" id="brightness-slider" class="threshold-slider" min="0" max="6" step="0.01" value="${state.silhouetteBrightness}">
      <div class="threshold-markers">
        <span>0</span>
        <span>3</span>
        <span>6</span>
      </div>
    </div>

    <div class="config-row">
      <span class="config-label">${i18next.t("filters.invertColors")}</span>
      <label class="silhouette-switch">
        <input type="checkbox" id="silhouette-invert-toggle" ${
          state.silhouetteInvert ? "checked" : ""
        }>
        <span class="silhouette-slider"></span>
      </label>
    </div>

    </div>
  `;

  document.body.appendChild(popup);

  // Drag and drop functionality
  const header = popup.querySelector("#silhouette-config-header");
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = popup.getBoundingClientRect();
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
    popup.style.transform = "none";
    popup.style.left = rect.left + "px";
    popup.style.top = rect.top + "px";
    header.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    popup.style.left = currentX + "px";
    popup.style.top = currentY + "px";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = "move";
    }
  });

  // Event listeners
  const silhouetteToggle = popup.querySelector("#silhouette-toggle");
  const brightnessSlider = popup.querySelector("#brightness-slider");
  const brightnessValue = popup.querySelector("#brightness-value");
  const invertToggle = popup.querySelector("#silhouette-invert-toggle");
  const thresholdContainer = popup.querySelector(".threshold-container");

  // Fonction pour mettre à jour l'état désactivé du threshold-container
  const updateThresholdContainerState = (enabled) => {
    if (thresholdContainer) {
      thresholdContainer.classList.toggle("silhouette-disabled", !enabled);
    }
  };

  // Initialiser l'état et le gradient du slider
  updateThresholdContainerState(state.silhouetteEnabled);
  initSliderWithGradient(brightnessSlider);

  silhouetteToggle.addEventListener("change", (e) => {
    state.silhouetteEnabled = e.target.checked;
    updateThresholdContainerState(e.target.checked);
    applyImageFilters();
    // Mettre à jour le zoom-overlay
    if (window.updateZoomContent && window.zoomFilters) {
      window.zoomFilters.silhouette = e.target.checked;
      updateZoomContent();
    }
  });

  brightnessSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    brightnessValue.textContent = value.toFixed(2);
    state.silhouetteBrightness = value;
    updateSliderGradient(brightnessSlider);
    applyImageFilters();
    // Mettre à jour le zoom-overlay si la silhouette est active
    if (window.updateZoomContent && window.zoomFilters?.silhouette) {
      window.updateZoomContent();
    }
  });

  invertToggle.addEventListener("change", (e) => {
    state.silhouetteInvert = e.target.checked;
    applyImageFilters();
    // Mettre à jour le zoom-overlay si la silhouette est active
    if (window.updateZoomContent && window.zoomFilters?.silhouette) {
      window.updateZoomContent();
    }
  });

  // Fermer au clic en dehors
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!popup.contains(e.target)) {
        const zoomOverlay = document.getElementById("zoom-overlay");

        // Si on est dans le zoom-overlay, arrêter IMMÉDIATEMENT la propagation pour ne pas fermer le zoom
        if (zoomOverlay && zoomOverlay.contains(e.target)) {
          e.stopImmediatePropagation();
        }

        popup.remove();
        document.removeEventListener("click", closeHandler, true);
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("click", closeHandler, true);

    // Fermer avec Échap
    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        popup.remove();
        document.removeEventListener("click", closeHandler, true);
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
  }, 100);
}

/**
 * Génère les filtres CSS pour l'effet silhouette
 * Utilise directement les valeurs de brightness et contrast du state
 */
function getSilhouetteFilterCSS() {
  const brightness = state.silhouetteBrightness;
  const contrast = state.silhouetteContrast;
  const invert = state.silhouetteInvert;

  const filters = [
    "grayscale(100%)",
    `brightness(${brightness})`,
    `contrast(${contrast})`,
  ];

  if (invert) {
    filters.push("invert(100%)");
  }

  return filters.join(" ");
}

function closeAllContextMenus() {
  const menus = document.querySelectorAll(
    "#flip-animation-context-menu, #progressive-blur-context-menu, #image-context-menu, #next-image-context-menu, #prev-image-context-menu, #reveal-context-menu, #blur-context-menu, #timer-context-menu, #progressbar-context-menu, #pause-circle-context-menu, #settings-context-menu",
  );
  menus.forEach((menu) => menu.remove());
}

function adjustMenuPosition(menu, x, y, preferAbove = false) {
  // Ajouter le menu au DOM d'abord pour pouvoir calculer ses dimensions
  document.body.appendChild(menu);

  const menuRect = menu.getBoundingClientRect();
  let finalX = x;
  let finalY = y;

  // Vérifier le débordement horizontal
  if (finalX + menuRect.width > window.innerWidth) {
    finalX = window.innerWidth - menuRect.width - 10;
  }
  if (finalX < 10) finalX = 10;

  // Vérifier le débordement vertical - afficher au-dessus si préféré ou si trop bas
  if (preferAbove) {
    // Afficher au-dessus par défaut pour les menus des boutons
    finalY = y - menuRect.height - 5;
    if (finalY < 10) finalY = 10; // Mais redescendre si ça dépasse en haut
  } else {
    // Comportement normal : afficher en dessous sauf si ça dépasse en bas
    if (finalY + menuRect.height > window.innerHeight) {
      finalY = y - menuRect.height - 5; // Afficher au-dessus avec un petit espace
    }
    if (finalY < 10) finalY = 10;
  }

  menu.style.left = finalX + "px";
  menu.style.top = finalY + "px";

  // Fermer le menu en cliquant ailleurs
  setTimeout(() => {
    document.addEventListener("click", function closeMenu() {
      menu.remove();
      document.removeEventListener("click", closeMenu);
    });
  }, 100);
}

function showFlipAnimationMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "flip-animation-context-menu";
  menu.className = "context-menu";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const option = document.createElement("div");
  option.className = "context-menu-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = CONFIG.enableFlipAnimation;
  checkbox.className = "context-menu-checkbox";

  const label = document.createElement("span");
  label.textContent = i18next.t("filters.flipAnimation");

  option.appendChild(checkbox);
  option.appendChild(label);

  option.onclick = (e) => {
    e.stopPropagation();
    CONFIG.enableFlipAnimation = !CONFIG.enableFlipAnimation;
    checkbox.checked = CONFIG.enableFlipAnimation;
  };

  menu.appendChild(option);
  adjustMenuPosition(menu, x, y, true);
}

/**
 * Menu contextuel pour l'écran settings (clic droit sur le body)
 * Permet d'activer/désactiver la grille et changer de thème
 */
function showSettingsContextMenu(x, y) {
  const isGridEnabled = document.body.classList.contains("grid-enabled");

  // Helper pour obtenir les traductions avec fallback
  const t = (key, fallback) => {
    if (typeof i18next !== "undefined" && i18next.isInitialized) {
      return i18next.t(key, { defaultValue: fallback });
    }
    return fallback;
  };

  const items = [
    {
      text: t("controls.appearance", "Apparence"),
      label: true,
    },
    {
      text: isGridEnabled
        ? t("controls.hideGrid", "Masquer la grille de fond")
        : t("controls.showGrid", "Afficher la grille de fond"),
      icon: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M176-120q-19-4-35.5-20.5T120-176l664-664q21 5 36 20.5t21 35.5L176-120Zm-56-252v-112l356-356h112L120-372Zm0-308v-80q0-33 23.5-56.5T200-840h80L120-680Zm560 560 160-160v80q0 33-23.5 56.5T760-120h-80Zm-308 0 468-468v112L484-120H372Z"/></svg>`,
      active: isGridEnabled,
      onClick: () => {
        document.body.classList.toggle("grid-enabled");
      },
    },
    {
      text: t("controls.changeTheme", "Changer de thème"),
      icon: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M346-140 100-386q-10-10-15-22t-5-25q0-13 5-25t15-22l230-229-106-106 62-65 400 400q10 10 14.5 22t4.5 25q0 13-4.5 25T686-386L440-140q-10 10-22 15t-25 5q-13 0-25-5t-22-15Zm47-506L179-432h428L393-646Zm399 526q-36 0-61-25.5T706-208q0-27 13.5-51t30.5-47l42-54 44 54q16 23 30 47t14 51q0 37-26 62.5T792-120Z"/></svg>`,
      shortcut: CONFIG.HOTKEYS.THEME,
      onClick: () => {
        // Cycle vers le thème suivant
        const currentIndex = THEMES.indexOf(CONFIG.currentTheme);
        const nextIndex = (currentIndex + 1) % THEMES.length;
        const nextTheme = THEMES[nextIndex];

        // Appliquer le thème
        CONFIG.currentTheme = nextTheme;
        document.documentElement.setAttribute("data-theme", nextTheme);

        // Sauvegarder le thème
        if (typeof eagle !== "undefined" && eagle?.preferences?.set) {
          eagle.preferences.set("theme", nextTheme).catch(() => {});
        }
      },
    },
  ];

  buildContextMenu("settings-context-menu", items, x, y);
}

function showProgressiveBlurMenu(x, y) {
  // Ne pas ouvrir le menu pour les vidéos (flou progressif non supporté)
  if (state.isVideoFile) return;

  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "progressive-blur-context-menu";
  menu.className = "context-menu menu-lg";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const directionOption = document.createElement("div");
  directionOption.className = "context-menu-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = CONFIG.reverseProgressiveBlur;
  checkbox.className = "context-menu-checkbox";

  const label = document.createElement("span");
  label.textContent = i18next.t("filters.reverseDirection");

  directionOption.appendChild(checkbox);
  directionOption.appendChild(label);

  directionOption.onclick = (e) => {
    e.stopPropagation();
    CONFIG.reverseProgressiveBlur = !CONFIG.reverseProgressiveBlur;
    checkbox.checked = CONFIG.reverseProgressiveBlur;
    applyImageFilters();
  };

  menu.appendChild(directionOption);
  adjustMenuPosition(menu, x, y, true);
}

/**
 * Affiche le popup de sélection de vitesse (slider + presets)
 * @param {MouseEvent} e - Événement de clic pour positionner le popup
 */
function showSpeedPopup(e) {
  closeAllContextMenus();

  // Fermer si déjà ouvert
  const existing = document.getElementById("speed-popup");
  if (existing) {
    existing.remove();
    return;
  }

  const popup = document.createElement("div");
  popup.id = "speed-popup";
  popup.className = "speed-popup";

  // Générer les boutons presets
  const presets = VIDEO_CONSTANTS.PLAYBACK_RATES;
  const presetButtons = presets
    .map(
      (rate) =>
        `<button class="speed-preset-btn ${state.videoPlaybackRate === rate ? "active" : ""}"
                data-rate="${rate}">${rate}x</button>`,
    )
    .join("");

  // Calculer la position du slider (0-100) basée sur la vitesse actuelle
  const minRate = VIDEO_CONSTANTS.MIN_PLAYBACK_RATE;
  const maxRate = VIDEO_CONSTANTS.MAX_PLAYBACK_RATE;
  const sliderValue =
    ((state.videoPlaybackRate - minRate) / (maxRate - minRate)) * 100;

  popup.innerHTML = `
    <div class="speed-popup-header">
      <span class="speed-popup-title">Vitesse</span>
      <span class="speed-popup-value" id="speed-popup-value">${state.videoPlaybackRate}x</span>
    </div>
    <div class="speed-slider-container">
      <span class="speed-slider-label">${minRate}x</span>
      <input type="range"
             class="speed-slider"
             id="speed-slider"
             min="0"
             max="100"
             value="${sliderValue}"
             step="1">
      <span class="speed-slider-label">${maxRate}x</span>
    </div>
    <div class="speed-presets">
      ${presetButtons}
    </div>
  `;

  document.body.appendChild(popup);

  // Positionner le popup près de l'indicateur de vitesse
  const indicator = e.currentTarget;
  const rect = indicator.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();

  // Positionner au-dessus de l'indicateur, centré
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  let top = rect.top - popupRect.height - 8;

  // Ajuster si hors écran
  if (left < 10) left = 10;
  if (left + popupRect.width > window.innerWidth - 10) {
    left = window.innerWidth - popupRect.width - 10;
  }
  if (top < 10) {
    // Afficher en dessous si pas de place au-dessus
    top = rect.bottom + 8;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  // Références aux éléments
  const slider = popup.querySelector("#speed-slider");
  const valueDisplay = popup.querySelector("#speed-popup-value");
  const presetBtns = popup.querySelectorAll(".speed-preset-btn");

  // Initialiser le gradient du slider
  initSliderWithGradient(slider);

  // Fonction pour convertir la valeur du slider en vitesse
  function sliderToRate(sliderVal) {
    // Conversion linéaire
    const rate = minRate + (sliderVal / 100) * (maxRate - minRate);
    // Arrondir à 2 décimales
    return Math.round(rate * 100) / 100;
  }

  // Fonction pour convertir la vitesse en valeur de slider
  function rateToSlider(rate) {
    return ((rate - minRate) / (maxRate - minRate)) * 100;
  }

  // Fonction pour appliquer une nouvelle vitesse
  function applySpeed(rate) {
    state.videoPlaybackRate = rate;
    if (currentVideo) currentVideo.playbackRate = rate;
    valueDisplay.textContent = `${rate}x`;
    slider.value = rateToSlider(rate);
    updateSliderGradient(slider);
    updateVideoSpeedDisplay();

    // Mettre à jour les boutons actifs
    presetBtns.forEach((btn) => {
      btn.classList.toggle("active", parseFloat(btn.dataset.rate) === rate);
    });
  }

  // Event listener pour le slider
  slider.addEventListener("input", (evt) => {
    const rate = sliderToRate(parseFloat(evt.target.value));
    applySpeed(rate);
  });

  // Event listeners pour les presets
  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const rate = parseFloat(btn.dataset.rate);
      applySpeed(rate);
    });
  });

  // Fermer quand la souris quitte le popup (avec délai)
  let closeTimeout = null;

  const startCloseTimer = () => {
    closeTimeout = setTimeout(() => {
      popup.remove();
      document.removeEventListener("keydown", escapeHandler);
    }, 300); // 300ms de délai avant fermeture
  };

  const cancelCloseTimer = () => {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }
  };

  popup.addEventListener("mouseenter", cancelCloseTimer);
  popup.addEventListener("mouseleave", startCloseTimer);

  // Aussi garder ouvert si on survole l'indicateur
  indicator.addEventListener("mouseenter", cancelCloseTimer);
  indicator.addEventListener("mouseleave", (evt) => {
    // Ne fermer que si on ne va pas vers le popup
    if (!popup.contains(evt.relatedTarget)) {
      startCloseTimer();
    }
  });

  // Fermer avec Escape
  const escapeHandler = (evt) => {
    if (evt.key === "Escape") {
      cancelCloseTimer();
      popup.remove();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);
}

/**
 * Affiche le modal de configuration vidéo
 */
function showVideoConfig() {
  closeAllContextMenus();

  // Fermer si déjà ouvert
  const existing = document.getElementById("video-config-popup");
  if (existing) {
    existing.remove();
    if (wasPlayingBeforeModal && !state.isPlaying) {
      togglePlayPause();
    }
    return;
  }

  // Mettre en pause pendant la config
  wasPlayingBeforeModal = state.isPlaying;
  if (state.isPlaying) {
    togglePlayPause();
  }

  const popup = document.createElement("div");
  popup.id = "video-config-popup";

  // Générer les boutons de vitesse
  const speedButtons = VIDEO_CONSTANTS.PLAYBACK_RATES.map(
    (rate) => `
    <button class="speed-btn ${rate === state.videoPlaybackRate ? "active" : ""}" data-rate="${rate}">
      ${rate}x
    </button>
  `,
  ).join("");

  // Générer les boutons FPS
  const fpsButtons = VIDEO_CONSTANTS.FPS_OPTIONS.map(
    (fps) => `
    <button class="fps-btn ${fps === state.videoFPS ? "active" : ""}" data-fps="${fps}">
      ${fps}
    </button>
  `,
  ).join("");

  // Calculer la position du slider pour la config
  const minRate = VIDEO_CONSTANTS.MIN_PLAYBACK_RATE;
  const maxRate = VIDEO_CONSTANTS.MAX_PLAYBACK_RATE;
  const configSliderValue =
    ((state.videoPlaybackRate - minRate) / (maxRate - minRate)) * 100;

  popup.innerHTML = `
    <div id="video-config-header">
      <h3>Configuration Vidéo <span style="color: #888; font-size: 11px; font-weight: normal; margin-left: 8px;">Shift+V</span></h3>
    </div>
    <div class="config-body">



      <div class="config-section">
        <label class="config-section-header">
          <span>Vitesse de lecture</span>
          <span id="video-speed-value" class="config-value">${state.videoPlaybackRate}x</span>
        </label>
        <div class="speed-slider-container" style="margin: 8px 0;">
          <span class="speed-slider-label">${minRate}x</span>
          <input type="range"
                 class="speed-slider"
                 id="config-speed-slider"
                 min="0"
                 max="100"
                 value="${configSliderValue}"
                 step="1">
          <span class="speed-slider-label">${maxRate}x</span>
        </div>
        <div class="speed-buttons">
          ${speedButtons}
        </div>
      </div>

      <div class="config-section">
        <label class="config-section-header">
          <span>FPS (frame-by-frame)</span>
          <span id="video-fps-value" class="config-value">${state.videoFPS} fps</span>
        </label>
        <div class="fps-buttons">
          ${fpsButtons}
        </div>
      </div>

      <div class="config-divider"></div>

      <div class="config-help">
        <p><strong>Raccourcis :</strong></p>
        <ul>
          <li>Ralentir ou accélérer : <kbd>-</kbd>/ <kbd>+</kbd></li>
          <li>Frame précédente/suivante : <kbd>'</kbd>/ <kbd>(</kbd> ou <kbd>PageDown</kbd>/ <kbd>PageUp</kbd></li>
          <li> Lecture ou pause de la vidéo : <kbd>Shift</kbd><kbd>Espace</kbd></li>
          <li>Lire en boucle : <kbd>L</kbd></li>
          <li>Défilement manuel précis : <kbd>Shift</kbd><kbd>Cliquer glisser</kbd></li>
        </ul>
      </div>

    </div>
  `;

  document.body.appendChild(popup);

  // Drag and drop du popup
  const header = popup.querySelector("#video-config-header");
  let isDragging = false,
    initialX,
    initialY;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = popup.getBoundingClientRect();
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
    popup.style.transform = "none";
    popup.style.left = rect.left + "px";
    popup.style.top = rect.top + "px";
    header.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", function dragMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    popup.style.left = e.clientX - initialX + "px";
    popup.style.top = e.clientY - initialY + "px";
  });

  document.addEventListener("mouseup", function dragEnd() {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = "move";
    }
  });

  // Event listeners pour les contrôles
  const loopToggle = popup.querySelector("#video-loop-toggle");
  const speedBtns = popup.querySelectorAll(".speed-btn");
  const fpsBtns = popup.querySelectorAll(".fps-btn");
  const configSpeedSlider = popup.querySelector("#config-speed-slider");
  const speedValueDisplay = popup.querySelector("#video-speed-value");

  // Fonctions de conversion pour le slider
  function configSliderToRate(sliderVal) {
    const rate = minRate + (sliderVal / 100) * (maxRate - minRate);
    return Math.round(rate * 100) / 100;
  }

  function configRateToSlider(rate) {
    return ((rate - minRate) / (maxRate - minRate)) * 100;
  }

  // Fonction pour appliquer la vitesse depuis le slider ou les boutons
  function applyConfigSpeed(rate) {
    state.videoPlaybackRate = rate;
    if (currentVideo) currentVideo.playbackRate = rate;
    speedValueDisplay.textContent = `${rate}x`;
    if (configSpeedSlider) {
      configSpeedSlider.value = configRateToSlider(rate);
      updateSliderGradient(configSpeedSlider);
    }
    speedBtns.forEach((b) => {
      b.classList.toggle("active", parseFloat(b.dataset.rate) === rate);
    });
    updateVideoSpeedDisplay();
  }

  // Initialiser le gradient et l'event listener pour le slider de vitesse
  if (configSpeedSlider) {
    initSliderWithGradient(configSpeedSlider);
    configSpeedSlider.addEventListener("input", (e) => {
      const rate = configSliderToRate(parseFloat(e.target.value));
      applyConfigSpeed(rate);
    });
  }

  if (loopToggle) {
    loopToggle.addEventListener("change", (e) => {
      state.videoLoop = e.target.checked;
      if (currentVideo) currentVideo.loop = state.videoLoop;
      if (videoLoopBtn) {
        videoLoopBtn.innerHTML = state.videoLoop
          ? ICONS.VIDEO_LOOP_ON
          : ICONS.VIDEO_LOOP_OFF;
        videoLoopBtn.classList.toggle("active", state.videoLoop);
      }
    });
  }

  speedBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const rate = parseFloat(btn.dataset.rate);
      applyConfigSpeed(rate);
    });
  });

  fpsBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const fps = parseInt(btn.dataset.fps);
      state.videoFPS = fps;
      fpsBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      popup.querySelector("#video-fps-value").textContent = `${fps} fps`;
    });
  });

  // Fermer au clic en dehors
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!popup.contains(e.target)) {
        popup.remove();
        if (wasPlayingBeforeModal && !state.isPlaying) {
          togglePlayPause();
        }
        document.removeEventListener("click", closeHandler);
      }
    };
    document.addEventListener("click", closeHandler);
  }, 100);

  // Fermer avec Escape
  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      popup.remove();
      if (wasPlayingBeforeModal && !state.isPlaying) {
        togglePlayPause();
      }
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);
}

function showTimerContextMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "timer-context-menu";
  menu.className = "context-menu";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const resetOption = document.createElement("div");
  resetOption.className = "context-menu-item";
  resetOption.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
    </svg>
    Réinitialiser le timer
  `;

  resetOption.onclick = () => {
    state.timeRemaining = state.selectedDuration;
    updateTimerDisplay();
    closeAllContextMenus();
  };

  menu.appendChild(resetOption);
  document.body.appendChild(menu);
  adjustMenuPosition(menu, x, y, true);
}

function showProgressBarContextMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "progressbar-context-menu";
  menu.className = "context-menu menu-lg";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const smoothOption = document.createElement("div");
  smoothOption.className = "context-menu-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = CONFIG.smoothProgress;
  checkbox.className = "context-menu-checkbox";

  const label = document.createElement("span");
  label.textContent = i18next.t("timer.progressBarAnimationOption");

  smoothOption.appendChild(checkbox);
  smoothOption.appendChild(label);

  smoothOption.onclick = (e) => {
    e.stopPropagation();
    CONFIG.smoothProgress = !CONFIG.smoothProgress;
    checkbox.checked = CONFIG.smoothProgress;
    if (progressFill) {
      progressFill.style.transition = CONFIG.smoothProgress
        ? "width 1s linear"
        : "none";
    }
  };

  menu.appendChild(smoothOption);
  document.body.appendChild(menu);
  adjustMenuPosition(menu, x, y, true);
}

function showPauseCircleContextMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "pause-circle-context-menu";
  menu.className = "context-menu menu-lg";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const smoothOption = document.createElement("div");
  smoothOption.className = "context-menu-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = CONFIG.smoothPauseCircle;
  checkbox.className = "context-menu-checkbox";

  const label = document.createElement("span");
  label.textContent = i18next.t("timer.progressBarAnimationOption");

  smoothOption.appendChild(checkbox);
  smoothOption.appendChild(label);

  smoothOption.onclick = (e) => {
    e.stopPropagation();
    CONFIG.smoothPauseCircle = !CONFIG.smoothPauseCircle;
    checkbox.checked = CONFIG.smoothPauseCircle;
    const pauseProgressBar = document.getElementById("pause-progress-bar");
    if (pauseProgressBar) {
      pauseProgressBar.style.transition = CONFIG.smoothPauseCircle
        ? "stroke-dashoffset 1s linear"
        : "none";
    }
  };

  menu.appendChild(smoothOption);
  document.body.appendChild(menu);
  adjustMenuPosition(menu, x, y, true);
}

// ================================================================
// ZOOM MANAGER - Fonction globale pour ouvrir le zoom sur une image
// ================================================================

/**
 * Ouvre le zoom-overlay pour une image donnée (utilisé par review-screen et timeline)
 * @param {Object} image - Objet image avec id, filePath, ext, etc.
 * @param {Object} options - Options supplémentaires
 * @param {Function} options.onClose - Callback appelé à la fermeture
 * @param {Function} options.onDelete - Callback appelé à la suppression
 * @param {boolean} options.allowNavigation - Permettre la navigation entre images (défaut: false)
 * @param {Array} options.imageList - Liste d'images pour la navigation (si allowNavigation=true)
 * @param {number} options.currentIndex - Index courant dans imageList
 */
function openZoomForImage(image, options = {}) {
  const {
    onClose,
    onDelete,
    allowNavigation = false,
    imageList = null,
    currentIndex = 0,
  } = options;

  // Filtres locaux pour cette instance de zoom
  const zoomFilters = {
    flipH: state?.flipHorizontal || false,
    flipV: false,
    gray: false,
    blur: false,
    blurAmount: 8,
    silhouette: false,
  };

  // Vérifier que l'image a un chemin valide
  // PRIORITÉ: filePath (image originale) > path > file
  const imagePath = image.filePath || image.path || image.file;

  console.log("[openZoomForImage] Chemin détecté:", {
    filePath: image.filePath,
    path: image.path,
    file: image.file,
    selected: imagePath,
  });

  if (!imagePath) {
    console.error(
      "[openZoomForImage] Pas de chemin d'image disponible:",
      image,
    );
    return;
  }

  // Normaliser le chemin - éviter le double file:///
  // Si le chemin commence déjà par file://, on l'utilise tel quel
  // Sinon on retire les slashes initiaux et on ajoute file:///
  let normalizedPath;
  if (imagePath.startsWith("file://")) {
    normalizedPath = imagePath;
  } else {
    normalizedPath = "file:///" + imagePath.replace(/^\/+/, "");
  }

  console.log("[openZoomForImage] Chemin normalisé:", normalizedPath);

  let overlay = document.getElementById("zoom-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "zoom-overlay";
    overlay.className = "review-item zoomed";
    overlay.style.zIndex = "10001"; // Au-dessus du modal timeline (10000)
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        // Ne pas fermer si on est en mode dessin dans le zoom
        if (overlay.classList.contains("zoom-drawing-active")) {
          return;
        }
        const gridPopup = document.getElementById("grid-config-popup");
        const silhouettePopup = document.getElementById(
          "silhouette-config-popup",
        );
        if (!gridPopup && !silhouettePopup) {
          closeZoomOverlay();
        }
      }
    };
    document.body.appendChild(overlay);
  }

  // Rendre les filtres accessibles globalement pour les modals
  window.zoomFilters = zoomFilters;
  window.updateZoomContent = updateZoomContent;

  let currentZoomIndex = currentIndex;

  function updateZoomContent() {
    const overlay = document.getElementById("zoom-overlay");
    if (!overlay) return;

    // Recalculer le chemin normalisé pour l'image courante (important pour la navigation)
    const currentImagePath = image.filePath || image.path || image.file;
    let normalizedPath;
    if (currentImagePath) {
      if (currentImagePath.startsWith("file://")) {
        normalizedPath = currentImagePath;
      } else {
        normalizedPath = "file:///" + currentImagePath.replace(/^\/+/, "");
      }
    } else {
      normalizedPath = "";
    }

    const isVideo = isVideoFile(image);

    // Application des styles selon l'état des filtres
    let transform = "";
    if (zoomFilters.flipH) transform += "scaleX(-1) ";
    if (zoomFilters.flipV) transform += "scaleY(-1) ";

    let filter = "";
    if (zoomFilters.gray) filter += "grayscale(100%) ";
    if (zoomFilters.blur) filter += `blur(${zoomFilters.blurAmount}px) `;
    if (zoomFilters.silhouette) filter += getSilhouetteFilterCSS();

    // Créer le contenu selon le type de média
    if (isVideo) {
      const zoomVideoState = { playbackRate: 1, loop: true };

      overlay.innerHTML = `
        <div class="zoom-video-wrapper">
          <video id="zoom-video" src="${normalizedPath}"
               style="transform: ${transform}; filter: ${filter};"
               playsinline loop autoplay muted tabindex="-1"></video>
          <div class="video-controls-bar zoom-video-controls-bar">
            <div class="video-timeline zoom-video-timeline">
              <div class="video-timeline-progress zoom-video-timeline-progress"></div>
              <div class="video-timeline-handle zoom-video-timeline-handle"></div>
            </div>
            <div class="video-controls-buttons">
              <button type="button" class="video-control-btn zoom-video-play-btn" data-tooltip="${i18next.t("video.playPauseTooltip", { hotkey: "Space" })}"></button>
              <div class="video-time-display">
                <span class="zoom-video-current-time">0:00</span>
                <span class="video-time-separator">/</span>
                <span class="zoom-video-duration">0:00</span>
              </div>
              <div class="video-speed-indicator">
                <span class="zoom-video-speed-display">1x</span>
              </div>
              <button type="button" class="video-control-btn zoom-video-slower-btn" data-tooltip="${i18next.t("video.slowerTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_SLOWER })}">${ICONS.VIDEO_SLOWER}</button>
              <button type="button" class="video-control-btn zoom-video-faster-btn" data-tooltip="${i18next.t("video.fasterTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_FASTER })}">${ICONS.VIDEO_FASTER}</button>
              <button type="button" class="video-control-btn zoom-video-prev-frame-btn" data-tooltip="${i18next.t("video.prevFrameTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_PREV_FRAME })}">${ICONS.VIDEO_PREV_FRAME}</button>
              <button type="button" class="video-control-btn zoom-video-next-frame-btn" data-tooltip="${i18next.t("video.nextFrameTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_NEXT_FRAME })}">${ICONS.VIDEO_NEXT_FRAME}</button>
              <button type="button" class="video-control-btn zoom-video-loop-btn active" data-tooltip="${i18next.t("video.loopTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_LOOP })}">${ICONS.VIDEO_LOOP_ON}</button>
            </div>
          </div>
        </div>
        <div class="zoom-toolbar"></div>
      `;

      // Setup video controls
      const zoomVideo = overlay.querySelector("#zoom-video");
      const playBtn = overlay.querySelector(".zoom-video-play-btn");
      const slowerBtn = overlay.querySelector(".zoom-video-slower-btn");
      const fasterBtn = overlay.querySelector(".zoom-video-faster-btn");
      const prevFrameBtn = overlay.querySelector(".zoom-video-prev-frame-btn");
      const nextFrameBtn = overlay.querySelector(".zoom-video-next-frame-btn");
      const loopBtn = overlay.querySelector(".zoom-video-loop-btn");
      const speedDisplay = overlay.querySelector(".zoom-video-speed-display");
      const currentTimeDisplay = overlay.querySelector(
        ".zoom-video-current-time",
      );
      const durationDisplay = overlay.querySelector(".zoom-video-duration");
      const timeline = overlay.querySelector(".zoom-video-timeline");
      const timelineProgress = overlay.querySelector(
        ".zoom-video-timeline-progress",
      );
      const timelineHandle = overlay.querySelector(
        ".zoom-video-timeline-handle",
      );

      const updatePlayIcon = () => {
        playBtn.innerHTML = zoomVideo.paused
          ? ICONS.VIDEO_PLAY
          : ICONS.VIDEO_PAUSE;
      };

      const updateTimeDisplay = () => {
        if (zoomVideo.duration) {
          currentTimeDisplay.textContent = formatVideoTime(
            zoomVideo.currentTime,
          );
          durationDisplay.textContent = formatVideoTime(zoomVideo.duration);
          const percent = (zoomVideo.currentTime / zoomVideo.duration) * 100;
          timelineProgress.style.width = `${percent}%`;
          timelineHandle.style.left = `${percent}%`;
        }
      };

      const updateSpeedDisplay = () => {
        speedDisplay.textContent = `${zoomVideoState.playbackRate}x`;
        speedDisplay.style.color =
          zoomVideoState.playbackRate < 1
            ? "#5eead4"
            : zoomVideoState.playbackRate > 1
              ? "#fbbf24"
              : "var(--color-primary)";
      };

      updatePlayIcon();
      zoomVideo.onloadedmetadata = updateTimeDisplay;
      zoomVideo.ontimeupdate = updateTimeDisplay;
      zoomVideo.onplay = updatePlayIcon;
      zoomVideo.onpause = updatePlayIcon;

      playBtn.onclick = (e) => {
        e.stopPropagation();
        if (zoomVideo.paused) zoomVideo.play();
        else zoomVideo.pause();
      };

      slowerBtn.onclick = (e) => {
        e.stopPropagation();
        const rates = VIDEO_CONSTANTS.PLAYBACK_RATES;
        const currentIdx = rates.indexOf(zoomVideoState.playbackRate);
        if (currentIdx > 0) {
          zoomVideoState.playbackRate = rates[currentIdx - 1];
          zoomVideo.playbackRate = zoomVideoState.playbackRate;
          updateSpeedDisplay();
        }
      };

      fasterBtn.onclick = (e) => {
        e.stopPropagation();
        const rates = VIDEO_CONSTANTS.PLAYBACK_RATES;
        const currentIdx = rates.indexOf(zoomVideoState.playbackRate);
        if (currentIdx < rates.length - 1) {
          zoomVideoState.playbackRate = rates[currentIdx + 1];
          zoomVideo.playbackRate = zoomVideoState.playbackRate;
          updateSpeedDisplay();
        }
      };

      prevFrameBtn.onclick = (e) => {
        e.stopPropagation();
        zoomVideo.pause();
        zoomVideo.currentTime = Math.max(
          0,
          zoomVideo.currentTime - 1 / VIDEO_CONSTANTS.DEFAULT_FPS,
        );
      };

      nextFrameBtn.onclick = (e) => {
        e.stopPropagation();
        zoomVideo.pause();
        zoomVideo.currentTime = Math.min(
          zoomVideo.duration,
          zoomVideo.currentTime + 1 / VIDEO_CONSTANTS.DEFAULT_FPS,
        );
      };

      loopBtn.onclick = (e) => {
        e.stopPropagation();
        zoomVideoState.loop = !zoomVideoState.loop;
        zoomVideo.loop = zoomVideoState.loop;
        loopBtn.innerHTML = zoomVideoState.loop
          ? ICONS.VIDEO_LOOP_ON
          : ICONS.VIDEO_LOOP_OFF;
        loopBtn.classList.toggle("active", zoomVideoState.loop);
      };

      let isTimelineDragging = false;
      const seekToPosition = (e) => {
        const rect = timeline.getBoundingClientRect();
        const percent = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        zoomVideo.currentTime = percent * zoomVideo.duration;
        updateTimeDisplay();
      };

      timeline.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        isTimelineDragging = true;
        seekToPosition(e);
        timeline.style.cursor = "grabbing";
      });

      document.addEventListener("mousemove", (e) => {
        if (!isTimelineDragging) return;
        e.preventDefault();
        seekToPosition(e);
      });

      document.addEventListener("mouseup", () => {
        if (isTimelineDragging) {
          isTimelineDragging = false;
          timeline.style.cursor = "pointer";
        }
      });

      overlay.querySelector(".video-controls-bar").onclick = (e) =>
        e.stopPropagation();
      overlay.querySelector(".zoom-video-wrapper").onclick = (e) => {
        if (e.target === e.currentTarget) closeZoomOverlay();
      };
      zoomVideo.onclick = (e) => e.stopPropagation();
    } else {
      const imgEl = document.createElement("img");
      imgEl.style.cssText = `cursor: pointer; transform: ${transform}; filter: ${filter};`;
      imgEl.onclick = (e) => {
        // Ne pas fermer si on est en mode dessin
        if (overlay.classList.contains("zoom-drawing-active")) {
          e.stopPropagation();
          return;
        }
        closeZoomOverlay();
      };

      // Gestion des erreurs pour les images reconstruites (sans extension connue)
      imgEl.onerror = () => {
        console.warn("[openZoomForImage] Erreur chargement:", imgEl.src);

        // Si le chemin ne termine pas par une extension, essayer .jpg puis .png
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(normalizedPath)) {
          if (!imgEl.dataset.triedJpg) {
            imgEl.dataset.triedJpg = "true";
            imgEl.src = normalizedPath + ".jpg";
            console.log("[openZoomForImage] Tentative avec .jpg:", imgEl.src);
          } else if (!imgEl.dataset.triedPng) {
            imgEl.dataset.triedPng = "true";
            imgEl.src = normalizedPath + ".png";
            console.log("[openZoomForImage] Tentative avec .png:", imgEl.src);
          } else {
            console.error("[openZoomForImage] Impossible de charger l'image");
          }
        }
      };

      imgEl.src = normalizedPath;

      overlay.innerHTML = "";
      overlay.appendChild(imgEl);

      const toolbar = document.createElement("div");
      toolbar.className = "zoom-toolbar";
      overlay.appendChild(toolbar);
    }

    const toolbar = overlay.querySelector(".zoom-toolbar");
    toolbar.onclick = (e) => e.stopPropagation();

    // --- BOUTON FLIP HORIZONTAL ---
    const btnFlip = document.createElement("button");
    btnFlip.className = `control-btn-small ${zoomFilters.flipH ? "active" : ""}`;
    btnFlip.setAttribute(
      "data-tooltip",
      `${i18next.t("drawing.flipHorizontal")} (${CONFIG.HOTKEYS.FLIP_H})`,
    );
    btnFlip.innerHTML = zoomFilters.flipH
      ? ICONS.FLIP_H
      : ICONS.FLIP_H_REVERSED;
    btnFlip.onclick = () => {
      zoomFilters.flipH = !zoomFilters.flipH;
      btnFlip.classList.toggle("active", zoomFilters.flipH);
      btnFlip.innerHTML = zoomFilters.flipH
        ? ICONS.FLIP_H
        : ICONS.FLIP_H_REVERSED;
      updateZoomContent();
    };

    // --- BOUTON FLIP VERTICAL ---
    const btnFlipV = document.createElement("button");
    btnFlipV.className = `control-btn-small ${zoomFilters.flipV ? "active" : ""}`;
    btnFlipV.setAttribute("data-tooltip", i18next.t("drawing.flipVertical"));
    btnFlipV.innerHTML = zoomFilters.flipV
      ? ICONS.FLIP_V
      : ICONS.FLIP_V_REVERSED;
    btnFlipV.onclick = () => {
      zoomFilters.flipV = !zoomFilters.flipV;
      btnFlipV.classList.toggle("active", zoomFilters.flipV);
      btnFlipV.innerHTML = zoomFilters.flipV
        ? ICONS.FLIP_V
        : ICONS.FLIP_V_REVERSED;
      updateZoomContent();
    };

    // --- BOUTON GRAYSCALE ---
    const btnGray = document.createElement("button");
    btnGray.className = `control-btn-small ${zoomFilters.gray ? "active" : ""}`;
    btnGray.setAttribute(
      "data-tooltip",
      `${i18next.t("filters.grayscale")} (${CONFIG.HOTKEYS.GRAYSCALE.toUpperCase()})`,
    );
    btnGray.innerHTML = zoomFilters.gray ? ICONS.BW_ON : ICONS.BW_OFF;
    btnGray.onclick = () => {
      zoomFilters.gray = !zoomFilters.gray;
      btnGray.classList.toggle("active", zoomFilters.gray);
      btnGray.innerHTML = zoomFilters.gray ? ICONS.BW_ON : ICONS.BW_OFF;
      updateZoomContent();
    };

    // --- BOUTON BLUR ---
    const btnBlur = document.createElement("button");
    btnBlur.className = `control-btn-small ${zoomFilters.blur ? "active" : ""}`;
    btnBlur.setAttribute(
      "data-tooltip",
      i18next.t("filters.blurTooltip", {
        hotkey: CONFIG.HOTKEYS.BLUR.toUpperCase(),
      }),
    );
    btnBlur.innerHTML = zoomFilters.blur ? ICONS.BLUR_ON : ICONS.BLUR_OFF;
    btnBlur.onclick = () => {
      zoomFilters.blur = !zoomFilters.blur;
      btnBlur.classList.toggle("active", zoomFilters.blur);
      btnBlur.innerHTML = zoomFilters.blur ? ICONS.BLUR_ON : ICONS.BLUR_OFF;
      updateZoomContent();
    };

    // --- BOUTON SILHOUETTE ---
    const btnSilhouette = document.createElement("button");
    btnSilhouette.className = `control-btn-small ${zoomFilters.silhouette ? "active" : ""}`;
    btnSilhouette.setAttribute(
      "data-tooltip",
      i18next.t("filters.silhouetteTooltip", {
        hotkey: CONFIG.HOTKEYS.SILHOUETTE.toUpperCase(),
      }),
    );
    btnSilhouette.innerHTML = ICONS.SILHOUETTE;
    btnSilhouette.onclick = () => {
      zoomFilters.silhouette = !zoomFilters.silhouette;
      btnSilhouette.classList.toggle("active", zoomFilters.silhouette);
      updateZoomContent();
    };
    btnSilhouette.oncontextmenu = (e) => {
      e.preventDefault();
      showSilhouetteConfig();
    };

    // Bouton Dessiner (seulement pour les images)
    let btnDraw = null;
    if (!isVideo) {
      btnDraw = document.createElement("button");
      btnDraw.className = "control-btn-small";
      btnDraw.setAttribute(
        "data-tooltip",
        i18next.t("drawing.annotateTooltip", {
          hotkey: CONFIG.HOTKEYS.ANNOTATE.toUpperCase(),
        }),
      );
      btnDraw.innerHTML = ICONS.DRAW;
      btnDraw.onclick = () => {
        if (typeof openZoomDrawingMode === "function") {
          openZoomDrawingMode(overlay, image);
        }
      };
    }

    // Bouton Révéler
    const btnReveal = document.createElement("button");
    btnReveal.className = "control-btn-small";
    btnReveal.setAttribute("data-tooltip", i18next.t("drawing.openInEagle"));
    btnReveal.innerHTML = ICONS.REVEAL;
    btnReveal.onclick = async () => {
      if (eagle.window?.minimize) await eagle.window.minimize();
      await eagle.item.open(image.id);
    };

    // Bouton Supprimer (optionnel, seulement si onDelete est fourni)
    let btnDelete = null;
    if (onDelete) {
      btnDelete = document.createElement("button");
      btnDelete.className = "control-btn-small btn-danger-hover";
      btnDelete.setAttribute("data-tooltip", i18next.t("drawing.deleteImage"));
      btnDelete.innerHTML = ICONS.DELETE;
      btnDelete.onclick = async () => {
        if (!confirm(i18next.t("drawing.deleteImage"))) return;
        await image.moveToTrash();
        onDelete();
      };
    }

    toolbar.appendChild(btnFlip);
    toolbar.appendChild(btnFlipV);
    toolbar.appendChild(btnGray);
    toolbar.appendChild(btnBlur);
    toolbar.appendChild(btnSilhouette);
    if (btnDraw) toolbar.appendChild(btnDraw);
    toolbar.appendChild(btnReveal);
    if (btnDelete) toolbar.appendChild(btnDelete);
  }

  function closeZoomOverlay() {
    if (typeof closeZoomDrawingMode === "function") {
      closeZoomDrawingMode();
    }
    const overlay = document.getElementById("zoom-overlay");
    if (overlay) overlay.remove();
    document.body.style.overflow = "auto";
    document.removeEventListener("keydown", handleZoomKeyboard);
    window.zoomFilters = null;
    window.updateZoomContent = null;
    // Marquer qu'on vient de fermer le zoom (pour empêcher le day-modal de se fermer aussi)
    window._zoomJustClosed = Date.now();
    if (onClose) onClose();
  }

  function handleZoomKeyboard(e) {
    const hk = CONFIG.HOTKEYS;
    const key = e.key;
    const keyLow = e.key.toLowerCase();

    // Navigation entre images (seulement si allowNavigation)
    if (allowNavigation && imageList && imageList.length > 1) {
      if (e.key === "ArrowRight") {
        if (typeof closeZoomDrawingMode === "function") closeZoomDrawingMode();
        currentZoomIndex = (currentZoomIndex + 1) % imageList.length;
        image = imageList[currentZoomIndex];
        updateZoomContent();
        return;
      } else if (e.key === "ArrowLeft") {
        if (typeof closeZoomDrawingMode === "function") closeZoomDrawingMode();
        currentZoomIndex =
          (currentZoomIndex - 1 + imageList.length) % imageList.length;
        image = imageList[currentZoomIndex];
        updateZoomContent();
        return;
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (e.shiftKey) {
        if (zoomFilters.silhouette) {
          state.silhouetteBrightness = Math.min(
            state.silhouetteBrightness + 0.1,
            6,
          );
          updateZoomContent();
          const brightnessSlider = document.getElementById("brightness-slider");
          const brightnessValue = document.getElementById("brightness-value");
          if (brightnessSlider) {
            brightnessSlider.value = state.silhouetteBrightness;
            updateSliderGradient(brightnessSlider);
          }
          if (brightnessValue) {
            brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
          }
        }
      } else {
        if (zoomFilters.blur) {
          zoomFilters.blurAmount = Math.min(zoomFilters.blurAmount + 2, 50);
          updateZoomContent();
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (e.shiftKey) {
        if (zoomFilters.silhouette) {
          state.silhouetteBrightness = Math.max(
            state.silhouetteBrightness - 0.1,
            0,
          );
          updateZoomContent();
          const brightnessSlider = document.getElementById("brightness-slider");
          const brightnessValue = document.getElementById("brightness-value");
          if (brightnessSlider) {
            brightnessSlider.value = state.silhouetteBrightness;
            updateSliderGradient(brightnessSlider);
          }
          if (brightnessValue) {
            brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
          }
        }
      } else {
        if (zoomFilters.blur) {
          zoomFilters.blurAmount = Math.max(zoomFilters.blurAmount - 2, 0);
          updateZoomContent();
        }
      }
    } else if (e.key === "Escape") {
      if (
        typeof isZoomDrawingModeActive !== "undefined" &&
        isZoomDrawingModeActive
      ) {
        return;
      }
      const gridPopup = document.getElementById("grid-config-popup");
      const silhouettePopup = document.getElementById(
        "silhouette-config-popup",
      );
      if (gridPopup) {
        gridPopup.remove();
      } else if (silhouettePopup) {
        silhouettePopup.remove();
      } else {
        e.stopImmediatePropagation(); // Empêcher la fermeture du day-modal
        closeZoomOverlay();
      }
    } else if (key === hk.FLIP_H) {
      e.preventDefault();
      zoomFilters.flipH = !zoomFilters.flipH;
      updateZoomContent();
    } else if (keyLow === hk.GRAYSCALE.toLowerCase()) {
      e.preventDefault();
      zoomFilters.gray = !zoomFilters.gray;
      updateZoomContent();
    } else if (keyLow === hk.BLUR.toLowerCase()) {
      e.preventDefault();
      zoomFilters.blur = !zoomFilters.blur;
      updateZoomContent();
    } else if (e.shiftKey && key === hk.SILHOUETTE_MODAL) {
      e.preventDefault();
      showSilhouetteConfig();
    } else if (keyLow === hk.SILHOUETTE.toLowerCase()) {
      e.preventDefault();
      zoomFilters.silhouette = !zoomFilters.silhouette;
      updateZoomContent();
    } else if (
      keyLow === hk.ANNOTATE.toLowerCase() ||
      keyLow === hk.DRAWING_TOOL_PENCIL.toLowerCase()
    ) {
      if (
        typeof isZoomDrawingModeActive !== "undefined" &&
        isZoomDrawingModeActive
      ) {
        return;
      }
      e.preventDefault();
      if (!isVideoFile(image)) {
        const overlay = document.getElementById("zoom-overlay");
        if (overlay && typeof openZoomDrawingMode === "function") {
          openZoomDrawingMode(overlay, image);
        }
      }
    }
  }

  // Initialiser
  updateZoomContent();
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", handleZoomKeyboard);

  // Exposer la fonction de fermeture globalement
  window.closeZoom = closeZoomOverlay;
}

// Exposer la fonction globalement
window.openZoomForImage = openZoomForImage;

function showReview() {
  stopTimer();
  // Fermer le mode dessin s'il est actif
  if (
    typeof closeDrawingMode === "function" &&
    typeof isDrawingModeActive !== "undefined" &&
    isDrawingModeActive
  ) {
    closeDrawingMode();
  }
  if (timerDisplay) timerDisplay.classList.remove("timer-paused");
  if (pauseBadge) pauseBadge.classList.add("hidden");
  drawingScreen.classList.add("hidden");
  reviewScreen.classList.remove("hidden");
  document.body.classList.add("review-active");

  // Fermer l'image info overlay s'il est ouvert
  const infoOverlay = document.getElementById("image-info-overlay");
  if (infoOverlay) {
    infoOverlay.remove();
  }

  // Réinitialiser les états du mode mémoire
  state.memoryHidden = false;
  hideMemoryOverlay();

  // === ENREGISTRER LA SESSION DANS L'HISTORIQUE ===
  const sessionPoses = state.imagesSeen.length;
  const sessionTime = state.totalSessionTime;
  if (
    sessionPoses > 0 &&
    sessionTime > 0 &&
    typeof recordSession === "function"
  ) {
    // Récupérer les détails de la session
    const sessionDetails = {
      mode: state.sessionMode || "classique",
      memoryType: state.sessionMode === "memory" ? state.memoryType : null,
      customQueue:
        state.sessionMode === "custom" && state.customQueue
          ? state.customQueue.map((step) => ({
              type: step.type,
              count: step.count,
              duration: step.duration,
            }))
          : null,
      images: state.imagesSeen.map((img) => {
        // Sauvegarder les infos nécessaires pour le zoom et l'API Eagle
        return {
          id: img.id,
          filePath: img.filePath,
          ext: img.ext,
          thumbnailURL: img.thumbnailURL,
          url: img.url,
          name: img.name,
        };
      }),
    };
    recordSession(sessionPoses, sessionTime, sessionDetails);
  }

  let zoomFilters = {
    flipH: state.flipHorizontal || false, // Conserver le flip horizontal du drawing screen
    flipV: false,
    gray: false,
    blur: false,
    blurAmount: 8,
    silhouette: false, // Silhouette contrôlée indépendamment dans le zoom-overlay
  };

  const statsText = document.getElementById("review-stats");

  const totalSeconds = state.totalSessionTime;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  const count = state.imagesSeen.length;
  const poseWord = count <= 1 ? "pose" : "poses";

  const secWord = secs <= 1 ? "seconde" : "secondes";
  const minWord = mins <= 1 ? "minute" : "minutes";

  let timeStr = "";
  if (mins > 0) {
    timeStr = `${mins} ${minWord} ${secs} ${secWord}`;
  } else {
    timeStr = `${secs} ${secWord}`;
  }

  if (statsText) {
    statsText.textContent = i18next.t("drawing.sessionStats", {
      count,
      poseWord,
      timeStr,
    });
  }

  reviewGrid.innerHTML = "";

  state.imagesSeen.forEach((image, index) => {
    const div = document.createElement("div");
    div.className = "review-item";
    const isVideo = isVideoFile(image);
    const img = document.createElement("img");
    // Utiliser le thumbnailURL si disponible, sinon fallback sur filePath
    // Pour les vidéos, Eagle fournit déjà un thumbnail
    const thumbnailSrc = image.thumbnailURL || image.thumbnail;
    if (thumbnailSrc) {
      img.src = thumbnailSrc;
    } else {
      img.src = isVideo
        ? `file:///${image.filePath}`
        : `file:///${image.filePath}`;
    }

    // Ajouter un indicateur vidéo
    if (isVideo) {
      div.classList.add("is-video");
      const videoIndicator = document.createElement("div");
      videoIndicator.className = "video-indicator";
      videoIndicator.innerHTML = ICONS.VIDEO_PLAY;
      div.appendChild(videoIndicator);
    }

    div.onclick = () => openZoom(index);

    div.appendChild(img);
    reviewGrid.appendChild(div);
  });

  // Initialiser/rafraîchir le timeline dans l'écran review
  if (typeof refreshTimelineReview === "function") {
    refreshTimelineReview();
  }

  let currentZoomIndex = null;
  // Exposer pour accès global depuis le raccourci T
  window.currentZoomIndex = null;

  function openZoom(index) {
    currentZoomIndex = index;
    window.currentZoomIndex = index;

    let overlay = document.getElementById("zoom-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "zoom-overlay";
      overlay.className = "review-item zoomed";
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          // Ne pas fermer si on est en mode dessin dans le zoom
          if (overlay.classList.contains("zoom-drawing-active")) {
            return;
          }
          // Vérifier si un modal est ouvert
          const gridPopup = document.getElementById("grid-config-popup");
          const silhouettePopup = document.getElementById(
            "silhouette-config-popup",
          );

          // Ne pas fermer l'image si un modal est ouvert (le modal se fermera lui-même)
          if (!gridPopup && !silhouettePopup) {
            closeZoom();
          }
        }
      };
      document.body.appendChild(overlay);
    }

    updateZoomContent();
    // Exposer updateZoomContent et zoomFilters pour l'accès depuis le modal silhouette
    window.updateZoomContent = updateZoomContent;
    window.zoomFilters = zoomFilters;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleZoomKeyboard);
  }

  function updateZoomContent() {
    const overlay = document.getElementById("zoom-overlay");
    if (!overlay || currentZoomIndex === null) return;

    const image = state.imagesSeen[currentZoomIndex];
    const isVideo = isVideoFile(image);

    // Application des styles selon l'état des filtres
    let transform = "";
    if (zoomFilters.flipH) transform += "scaleX(-1) ";
    if (zoomFilters.flipV) transform += "scaleY(-1) ";

    let filter = "";
    if (zoomFilters.gray) filter += "grayscale(100%) ";
    if (zoomFilters.blur) filter += `blur(${zoomFilters.blurAmount}px) `;
    if (zoomFilters.silhouette) filter += getSilhouetteFilterCSS();

    // Créer le contenu selon le type de média
    if (isVideo) {
      // État local pour les contrôles vidéo du zoom
      const zoomVideoState = {
        playbackRate: 1,
        loop: true,
      };

      overlay.innerHTML = `
        <div class="zoom-video-wrapper">
          <video id="zoom-video" src="file:///${image.filePath}"
               style="transform: ${transform}; filter: ${filter};"
               playsinline loop autoplay muted tabindex="-1"></video>
          <div class="video-controls-bar zoom-video-controls-bar">
            <!-- Timeline/Scrubber -->
            <div class="video-timeline zoom-video-timeline">
              <div class="video-timeline-progress zoom-video-timeline-progress"></div>
              <div class="video-timeline-handle zoom-video-timeline-handle"></div>
            </div>
            <!-- Contrôles -->
            <div class="video-controls-buttons">
              <button type="button" class="video-control-btn zoom-video-play-btn" data-tooltip="${i18next.t("video.playPauseTooltip", { hotkey: "Space" })}"></button>
              <div class="video-time-display">
                <span class="zoom-video-current-time">0:00</span>
                <span class="video-time-separator">/</span>
                <span class="zoom-video-duration">0:00</span>
              </div>
              <div class="video-speed-indicator">
                <span class="zoom-video-speed-display">1x</span>
              </div>
              <button type="button" class="video-control-btn zoom-video-slower-btn" data-tooltip="${i18next.t("video.slowerTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_SLOWER })}">${ICONS.VIDEO_SLOWER}</button>
              <button type="button" class="video-control-btn zoom-video-faster-btn" data-tooltip="${i18next.t("video.fasterTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_FASTER })}">${ICONS.VIDEO_FASTER}</button>
              <button type="button" class="video-control-btn zoom-video-prev-frame-btn" data-tooltip="${i18next.t("video.prevFrameTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_PREV_FRAME })}">${ICONS.VIDEO_PREV_FRAME}</button>
              <button type="button" class="video-control-btn zoom-video-next-frame-btn" data-tooltip="${i18next.t("video.nextFrameTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_NEXT_FRAME })}">${ICONS.VIDEO_NEXT_FRAME}</button>
              <button type="button" class="video-control-btn zoom-video-loop-btn active" data-tooltip="${i18next.t("video.loopTooltip", { hotkey: CONFIG.HOTKEYS.VIDEO_LOOP })}">${ICONS.VIDEO_LOOP_ON}</button>
            </div>
          </div>
        </div>
        <div class="zoom-toolbar"></div>
      `;

      // Setup video controls
      const zoomVideo = overlay.querySelector("#zoom-video");
      const playBtn = overlay.querySelector(".zoom-video-play-btn");
      const slowerBtn = overlay.querySelector(".zoom-video-slower-btn");
      const fasterBtn = overlay.querySelector(".zoom-video-faster-btn");
      const prevFrameBtn = overlay.querySelector(".zoom-video-prev-frame-btn");
      const nextFrameBtn = overlay.querySelector(".zoom-video-next-frame-btn");
      const loopBtn = overlay.querySelector(".zoom-video-loop-btn");
      const speedDisplay = overlay.querySelector(".zoom-video-speed-display");
      const currentTimeDisplay = overlay.querySelector(
        ".zoom-video-current-time",
      );
      const durationDisplay = overlay.querySelector(".zoom-video-duration");
      const timeline = overlay.querySelector(".zoom-video-timeline");
      const timelineProgress = overlay.querySelector(
        ".zoom-video-timeline-progress",
      );
      const timelineHandle = overlay.querySelector(
        ".zoom-video-timeline-handle",
      );

      // Update functions
      const updatePlayIcon = () => {
        playBtn.innerHTML = zoomVideo.paused
          ? ICONS.VIDEO_PLAY
          : ICONS.VIDEO_PAUSE;
      };

      const updateTimeDisplay = () => {
        if (zoomVideo.duration) {
          currentTimeDisplay.textContent = formatVideoTime(
            zoomVideo.currentTime,
          );
          durationDisplay.textContent = formatVideoTime(zoomVideo.duration);
          const percent = (zoomVideo.currentTime / zoomVideo.duration) * 100;
          timelineProgress.style.width = `${percent}%`;
          timelineHandle.style.left = `${percent}%`;
        }
      };

      const updateSpeedDisplay = () => {
        speedDisplay.textContent = `${zoomVideoState.playbackRate}x`;
        if (zoomVideoState.playbackRate < 1) {
          speedDisplay.style.color = "#5eead4";
        } else if (zoomVideoState.playbackRate > 1) {
          speedDisplay.style.color = "#fbbf24";
        } else {
          speedDisplay.style.color = "var(--color-primary)";
        }
      };

      // Initialize
      updatePlayIcon();
      zoomVideo.onloadedmetadata = updateTimeDisplay;
      zoomVideo.ontimeupdate = updateTimeDisplay;
      zoomVideo.onplay = updatePlayIcon;
      zoomVideo.onpause = updatePlayIcon;

      // Play/Pause
      playBtn.onclick = (e) => {
        e.stopPropagation();
        if (zoomVideo.paused) zoomVideo.play();
        else zoomVideo.pause();
      };

      // Speed controls
      slowerBtn.onclick = (e) => {
        e.stopPropagation();
        const rates = VIDEO_CONSTANTS.PLAYBACK_RATES;
        const currentIdx = rates.indexOf(zoomVideoState.playbackRate);
        if (currentIdx > 0) {
          zoomVideoState.playbackRate = rates[currentIdx - 1];
          zoomVideo.playbackRate = zoomVideoState.playbackRate;
          updateSpeedDisplay();
        }
      };

      fasterBtn.onclick = (e) => {
        e.stopPropagation();
        const rates = VIDEO_CONSTANTS.PLAYBACK_RATES;
        const currentIdx = rates.indexOf(zoomVideoState.playbackRate);
        if (currentIdx < rates.length - 1) {
          zoomVideoState.playbackRate = rates[currentIdx + 1];
          zoomVideo.playbackRate = zoomVideoState.playbackRate;
          updateSpeedDisplay();
        }
      };

      // Frame by frame
      prevFrameBtn.onclick = (e) => {
        e.stopPropagation();
        zoomVideo.pause();
        zoomVideo.currentTime = Math.max(
          0,
          zoomVideo.currentTime - 1 / VIDEO_CONSTANTS.DEFAULT_FPS,
        );
      };

      nextFrameBtn.onclick = (e) => {
        e.stopPropagation();
        zoomVideo.pause();
        zoomVideo.currentTime = Math.min(
          zoomVideo.duration,
          zoomVideo.currentTime + 1 / VIDEO_CONSTANTS.DEFAULT_FPS,
        );
      };

      // Loop toggle
      loopBtn.onclick = (e) => {
        e.stopPropagation();
        zoomVideoState.loop = !zoomVideoState.loop;
        zoomVideo.loop = zoomVideoState.loop;
        loopBtn.innerHTML = zoomVideoState.loop
          ? ICONS.VIDEO_LOOP_ON
          : ICONS.VIDEO_LOOP_OFF;
        loopBtn.classList.toggle("active", zoomVideoState.loop);
      };

      // Timeline seek with drag support
      let isTimelineDragging = false;

      const seekToPosition = (e) => {
        const rect = timeline.getBoundingClientRect();
        const percent = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        zoomVideo.currentTime = percent * zoomVideo.duration;
        updateTimeDisplay();
      };

      timeline.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        isTimelineDragging = true;
        seekToPosition(e);
        timeline.style.cursor = "grabbing";
      });

      document.addEventListener("mousemove", (e) => {
        if (!isTimelineDragging) return;
        e.preventDefault();
        seekToPosition(e);
      });

      document.addEventListener("mouseup", () => {
        if (isTimelineDragging) {
          isTimelineDragging = false;
          timeline.style.cursor = "pointer";
        }
      });

      // Prevent clicks on controls from closing overlay
      overlay.querySelector(".zoom-video-controls-bar").onclick = (e) =>
        e.stopPropagation();

      // Click on video wrapper to close (but not on video or controls)
      overlay.querySelector(".zoom-video-wrapper").onclick = (e) => {
        if (e.target === e.currentTarget) closeZoom();
      };
      zoomVideo.onclick = (e) => e.stopPropagation();
    } else {
      overlay.innerHTML = `
        <img src="file:///${image.filePath}"
             style="cursor: pointer; transform: ${transform}; filter: ${filter};">
        <div class="zoom-toolbar"></div>
      `;
      overlay.querySelector("img").onclick = (e) => {
        // Ne pas fermer si on est en mode dessin
        if (overlay.classList.contains("zoom-drawing-active")) {
          e.stopPropagation();
          return;
        }
        closeZoom();
      };
    }

    const toolbar = overlay.querySelector(".zoom-toolbar");
    toolbar.onclick = (e) => e.stopPropagation();

    // --- BOUTON FLIP HORIZONTAL ---
    const btnFlip = document.createElement("button");
    btnFlip.className = `control-btn-small ${
      zoomFilters.flipH ? "active" : ""
    }`;
    btnFlip.setAttribute(
      "data-tooltip",
      `${i18next.t("drawing.flipHorizontal")} (${CONFIG.HOTKEYS.FLIP_H})`,
    );
    btnFlip.innerHTML = zoomFilters.flipH
      ? ICONS.FLIP_H
      : ICONS.FLIP_H_REVERSED;
    btnFlip.onclick = () => {
      zoomFilters.flipH = !zoomFilters.flipH;
      btnFlip.classList.toggle("active", zoomFilters.flipH);
      btnFlip.innerHTML = zoomFilters.flipH
        ? ICONS.FLIP_H
        : ICONS.FLIP_H_REVERSED;
      updateZoomContent();
    };

    // --- BOUTON FLIP VERTICAL ---
    const btnFlipV = document.createElement("button");
    btnFlipV.className = `control-btn-small ${
      zoomFilters.flipV ? "active" : ""
    }`;
    btnFlipV.setAttribute("data-tooltip", i18next.t("drawing.flipVertical"));
    btnFlipV.innerHTML = zoomFilters.flipV
      ? ICONS.FLIP_V
      : ICONS.FLIP_V_REVERSED;
    btnFlipV.onclick = () => {
      zoomFilters.flipV = !zoomFilters.flipV;
      btnFlipV.classList.toggle("active", zoomFilters.flipV);
      btnFlipV.innerHTML = zoomFilters.flipV
        ? ICONS.FLIP_V
        : ICONS.FLIP_V_REVERSED;
      updateZoomContent();
    };

    // --- BOUTON GRAYSCALE ---
    const btnGray = document.createElement("button");
    btnGray.className = `control-btn-small ${zoomFilters.gray ? "active" : ""}`;
    btnGray.setAttribute(
      "data-tooltip",
      `${i18next.t("filters.grayscale")} (${CONFIG.HOTKEYS.GRAYSCALE.toUpperCase()})`,
    );
    btnGray.innerHTML = zoomFilters.gray ? ICONS.BW_ON : ICONS.BW_OFF;
    btnGray.onclick = () => {
      zoomFilters.gray = !zoomFilters.gray;
      btnGray.classList.toggle("active", zoomFilters.gray);
      btnGray.innerHTML = zoomFilters.gray ? ICONS.BW_ON : ICONS.BW_OFF;
      updateZoomContent();
    };

    // --- BOUTON BLUR ---
    const btnBlur = document.createElement("button");
    btnBlur.className = `control-btn-small ${zoomFilters.blur ? "active" : ""}`;
    btnBlur.setAttribute(
      "data-tooltip",
      i18next.t("filters.blurTooltip", {
        hotkey: CONFIG.HOTKEYS.BLUR.toUpperCase(),
      }),
    );
    btnBlur.innerHTML = zoomFilters.blur ? ICONS.BLUR_ON : ICONS.BLUR_OFF;
    btnBlur.onclick = () => {
      zoomFilters.blur = !zoomFilters.blur;
      btnBlur.classList.toggle("active", zoomFilters.blur);
      btnBlur.innerHTML = zoomFilters.blur ? ICONS.BLUR_ON : ICONS.BLUR_OFF;
      updateZoomContent();
    };

    // --- BOUTON SILHOUETTE ---
    const btnSilhouette = document.createElement("button");
    btnSilhouette.className = `control-btn-small ${zoomFilters.silhouette ? "active" : ""}`;
    btnSilhouette.setAttribute(
      "data-tooltip",
      i18next.t("filters.silhouetteTooltip", {
        hotkey: CONFIG.HOTKEYS.SILHOUETTE.toUpperCase(),
      }),
    );
    btnSilhouette.innerHTML = ICONS.SILHOUETTE;
    btnSilhouette.onclick = () => {
      zoomFilters.silhouette = !zoomFilters.silhouette;
      btnSilhouette.classList.toggle("active", zoomFilters.silhouette);
      updateZoomContent();
    };
    btnSilhouette.oncontextmenu = (e) => {
      e.preventDefault();
      showSilhouetteConfig();
    };

    // Bouton Dessiner (seulement pour les images, pas les vidéos)
    let btnDraw = null;
    if (!isVideo) {
      btnDraw = document.createElement("button");
      btnDraw.className = "control-btn-small";
      btnDraw.setAttribute(
        "data-tooltip",
        i18next.t("drawing.annotateTooltip", {
          hotkey: CONFIG.HOTKEYS.ANNOTATE.toUpperCase(),
        }),
      );
      btnDraw.innerHTML = ICONS.DRAW;
      btnDraw.onclick = () => {
        if (typeof openZoomDrawingMode === "function") {
          openZoomDrawingMode(overlay, image);
        }
      };
    }

    // Bouton Révéler
    const btnReveal = document.createElement("button");
    btnReveal.className = "control-btn-small";
    btnReveal.setAttribute("data-tooltip", i18next.t("drawing.openInEagle"));
    btnReveal.innerHTML = ICONS.REVEAL;
    btnReveal.onclick = async () => {
      if (eagle.window?.minimize) await eagle.window.minimize();
      await eagle.item.open(image.id);
    };

    // Bouton Supprimer
    const btnDelete = document.createElement("button");
    btnDelete.className = "control-btn-small btn-danger-hover";
    btnDelete.setAttribute("data-tooltip", i18next.t("drawing.deleteImage"));
    btnDelete.innerHTML = ICONS.DELETE;
    btnDelete.onclick = async () => {
      if (!confirm(i18next.t("drawing.deleteImage"))) return;
      await image.moveToTrash();
      state.imagesSeen.splice(currentZoomIndex, 1);
      renderReviewGrid();

      if (state.imagesSeen.length === 0) {
        closeZoom();
      } else {
        currentZoomIndex = Math.min(
          currentZoomIndex,
          state.imagesSeen.length - 1,
        );
        updateZoomContent();
      }
    };

    toolbar.appendChild(btnFlip);
    toolbar.appendChild(btnFlipV);
    toolbar.appendChild(btnGray);
    toolbar.appendChild(btnBlur);
    toolbar.appendChild(btnSilhouette);
    if (btnDraw) toolbar.appendChild(btnDraw);
    toolbar.appendChild(btnReveal);
    toolbar.appendChild(btnDelete);
  }

  function closeZoom() {
    // Fermer le mode dessin si actif
    if (typeof closeZoomDrawingMode === "function") {
      closeZoomDrawingMode();
    }
    const overlay = document.getElementById("zoom-overlay");
    if (overlay) overlay.remove();
    document.body.style.overflow = "auto";
    document.removeEventListener("keydown", handleZoomKeyboard);
    currentZoomIndex = null;
    window.currentZoomIndex = null;
    window.updateZoomContent = null; // Nettoyer la référence
    window.zoomFilters = null;
  }
  // Exposer closeZoom globalement pour draw.js
  window.closeZoom = closeZoom;

  function handleZoomKeyboard(e) {
    if (currentZoomIndex === null) return;

    const hk = CONFIG.HOTKEYS;
    const key = e.key;
    const keyLow = e.key.toLowerCase();

    // Navigation entre images
    if (e.key === "ArrowRight") {
      // Fermer le mode dessin avant de changer d'image
      if (typeof closeZoomDrawingMode === "function") closeZoomDrawingMode();
      currentZoomIndex = (currentZoomIndex + 1) % state.imagesSeen.length;
      updateZoomContent();
    } else if (e.key === "ArrowLeft") {
      // Fermer le mode dessin avant de changer d'image
      if (typeof closeZoomDrawingMode === "function") closeZoomDrawingMode();
      currentZoomIndex =
        (currentZoomIndex - 1 + state.imagesSeen.length) %
        state.imagesSeen.length;
      updateZoomContent();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + ArrowUp : augmenter la luminosité de la silhouette
        if (zoomFilters.silhouette) {
          state.silhouetteBrightness = Math.min(
            state.silhouetteBrightness + 0.1,
            6,
          );
          updateZoomContent();
          // Mettre à jour le slider dans le modal s'il est ouvert
          const brightnessSlider = document.getElementById("brightness-slider");
          const brightnessValue = document.getElementById("brightness-value");
          if (brightnessSlider) {
            brightnessSlider.value = state.silhouetteBrightness;
            updateSliderGradient(brightnessSlider);
          }
          if (brightnessValue) {
            brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
          }
        }
      } else {
        // ArrowUp seul : augmenter le blur
        if (zoomFilters.blur) {
          zoomFilters.blurAmount = Math.min(zoomFilters.blurAmount + 2, 50);
          updateZoomContent();
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift + ArrowDown : diminuer la luminosité de la silhouette
        if (zoomFilters.silhouette) {
          state.silhouetteBrightness = Math.max(
            state.silhouetteBrightness - 0.1,
            0,
          );
          updateZoomContent();
          // Mettre à jour le slider dans le modal s'il est ouvert
          const brightnessSlider = document.getElementById("brightness-slider");
          const brightnessValue = document.getElementById("brightness-value");
          if (brightnessSlider) {
            brightnessSlider.value = state.silhouetteBrightness;
            updateSliderGradient(brightnessSlider);
          }
          if (brightnessValue) {
            brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
          }
        }
      } else {
        // ArrowDown seul : diminuer le blur
        if (zoomFilters.blur) {
          zoomFilters.blurAmount = Math.max(zoomFilters.blurAmount - 2, 0);
          updateZoomContent();
        }
      }
    } else if (e.key === "Escape") {
      // Si le mode dessin zoom est actif, laisser handleZoomDrawingKeydown gérer Escape
      if (
        typeof isZoomDrawingModeActive !== "undefined" &&
        isZoomDrawingModeActive
      ) {
        return;
      }

      // Vérifier si un modal est ouvert
      const gridPopup = document.getElementById("grid-config-popup");
      const silhouettePopup = document.getElementById(
        "silhouette-config-popup",
      );

      // Si un modal est ouvert, le fermer sans fermer l'image zoom
      if (gridPopup) {
        gridPopup.remove();
        // Restaurer l'état de lecture
        if (wasPlayingBeforeModal && !state.isPlaying) {
          togglePlayPause();
        }
      } else if (silhouettePopup) {
        silhouettePopup.remove();
        // Restaurer l'état de lecture
        if (wasPlayingBeforeModal && !state.isPlaying) {
          togglePlayPause();
        }
      } else {
        // Sinon, fermer l'image zoom
        closeZoom();
      }
    }
    // Raccourcis clavier pour les filtres (mêmes que dans le drawing screen)
    else if (key === hk.FLIP_H) {
      e.preventDefault();
      zoomFilters.flipH = !zoomFilters.flipH;
      updateZoomContent();
    } else if (keyLow === hk.GRAYSCALE.toLowerCase()) {
      e.preventDefault();
      zoomFilters.gray = !zoomFilters.gray;
      updateZoomContent();
    } else if (keyLow === hk.BLUR.toLowerCase()) {
      e.preventDefault();
      zoomFilters.blur = !zoomFilters.blur;
      updateZoomContent();
    } else if (e.shiftKey && key === hk.SILHOUETTE_MODAL) {
      // Tester SHIFT+S en premier pour ouvrir le modal
      e.preventDefault();
      showSilhouetteConfig();
    } else if (keyLow === hk.SILHOUETTE.toLowerCase()) {
      // Puis tester S seul pour toggle la silhouette
      e.preventDefault();
      zoomFilters.silhouette = !zoomFilters.silhouette;
      updateZoomContent();
    } else if (
      keyLow === hk.ANNOTATE.toLowerCase() ||
      keyLow === hk.DRAWING_TOOL_PENCIL.toLowerCase()
    ) {
      // D ou B pour ouvrir le mode dessin (seulement pour les images)
      // Si le mode dessin est déjà actif, laisser handleZoomDrawingKeydown gérer (B = pencil)
      if (
        typeof isZoomDrawingModeActive !== "undefined" &&
        isZoomDrawingModeActive
      ) {
        return;
      }
      e.preventDefault();
      const image = state.imagesSeen[currentZoomIndex];
      if (image && !isVideoFile(image)) {
        const overlay = document.getElementById("zoom-overlay");
        if (overlay && typeof openZoomDrawingMode === "function") {
          openZoomDrawingMode(overlay, image);
        }
      }
    }
    // Le raccourci T est géré par l'écouteur global
  }
}

function updateTimerDisplay() {
  const progressBar = document.getElementById("pause-progress-bar");
  const currentStep = state.customQueue[state.currentStepIndex];

  // --- 1. Gestion du Cercle de Pause (Indépendant) ---
  if (progressBar && currentStep && currentStep.type === "pause") {
    const total = currentStep.duration;
    const remaining = state.timeRemaining;
    const circumference = 440; // Correspond à r=70
    const elapsed = total - remaining;
    const offset = (elapsed / total) * circumference;

    // Utilisation du nouveau setting smoothPauseCircle
    if (CONFIG.smoothPauseCircle) {
      // On désactive la transition au tout début (elapsed <= 1) pour éviter le saut visuel
      progressBar.style.transition =
        elapsed <= 1 ? "none" : "stroke-dashoffset 1s linear";
    } else {
      progressBar.style.transition = "none";
    }

    progressBar.style.strokeDashoffset = offset;
  }

  if (state.sessionMode === "relax") return;

  // --- 2. Calcul et affichage du texte ---
  const mins = Math.floor(state.timeRemaining / 60);
  const secs = state.timeRemaining % 60;
  const timeString = `${mins}:${secs.toString().padStart(2, "0")}`;

  if (timerDisplay) timerDisplay.textContent = timeString;
  if (pauseTimerDisplay) pauseTimerDisplay.textContent = timeString;

  // --- Calcul du temps total restant pour le tooltip ---
  if (timerDisplay) {
    let totalRemainingSeconds = 0;

    if (state.sessionMode === "custom") {
      // Temps restant de l'étape actuelle
      totalRemainingSeconds = state.timeRemaining;

      // Ajouter le temps de toutes les étapes suivantes
      for (
        let i = state.currentStepIndex + 1;
        i < state.customQueue.length;
        i++
      ) {
        const step = state.customQueue[i];
        totalRemainingSeconds +=
          step.duration * (step.type === "pause" ? 1 : step.count);
      }

      // Ajouter les poses restantes dans l'étape actuelle
      if (currentStep && currentStep.type === "pose") {
        const posesRemaining = currentStep.count - state.currentPoseInStep;
        totalRemainingSeconds += posesRemaining * currentStep.duration;
      }
    } else {
      // Mode classique : juste le temps restant actuel
      totalRemainingSeconds = state.timeRemaining;
    }

    const totalHours = Math.floor(totalRemainingSeconds / 3600);
    const totalMins = Math.floor((totalRemainingSeconds % 3600) / 60);
    const totalSecs = totalRemainingSeconds % 60;

    // Construire le format lisible
    let totalTimeParts = [];
    if (totalHours > 0) totalTimeParts.push(`${totalHours}h`);
    if (totalMins > 0) totalTimeParts.push(`${totalMins}min`);
    if (totalSecs > 0 || totalTimeParts.length === 0)
      totalTimeParts.push(`${totalSecs}s`);

    const totalTimeString = totalTimeParts.join(" ");
    const tooltipText = `Temps total restant : ${totalTimeString}`;

    timerDisplay.setAttribute("data-tooltip", tooltipText);

    // Mettre à jour le tooltip en temps réel s'il est actuellement affiché
    const tooltip = document.getElementById("custom-tooltip");
    if (tooltip && tooltip.style.opacity === "1") {
      // Vérifier si le tooltip est affiché pour le timer
      const currentTooltipText = tooltip.textContent;
      if (
        currentTooltipText.startsWith(i18next.t("timer.totalRemainingTime"))
      ) {
        tooltip.textContent = tooltipText;
      }
    }
  }

  // --- 3. Gestion de la Barre de Progression Basse (Indépendante) ---
  if (progressFill) {
    const percentage = (state.timeRemaining / state.selectedDuration) * 100;

    // SÉCURITÉ : Si on est au début (100%), on coupe la transition pour éviter le va-et-vient
    if (state.timeRemaining >= state.selectedDuration) {
      progressFill.style.transition = "none";
    } else {
      progressFill.style.transition = CONFIG.smoothProgress
        ? "width 1s linear"
        : "none";
    }

    progressFill.style.width = `${percentage}%`;
  }
}

function resetProgressBar() {
  if (progressFill) {
    progressFill.style.transition = "none";
    progressFill.style.width = "100%";
    void progressFill.offsetWidth;
  }
}

function updatePlayPauseIcon() {
  playPauseBtn.innerHTML = state.isPlaying ? ICONS.PAUSE : ICONS.PLAY;

  if (state.isPlaying) {
    playPauseBtn.classList.remove("playing");
  } else {
    playPauseBtn.classList.add("playing");
  }
}

function togglePlayPause() {
  state.isPlaying = !state.isPlaying;
  updatePlayPauseIcon();

  // Ajouter/retirer la classe timer-paused sur le timer-display pour le glow
  if (timerDisplay) {
    timerDisplay.classList.toggle("timer-paused", !state.isPlaying);
  }

  // Montrer/cacher le badge PAUSE
  if (pauseBadge) {
    pauseBadge.classList.toggle("hidden", state.isPlaying);
    if (!state.isPlaying) {
      initPauseBadgeDrag();
    }
  }

  if (state.isPlaying) startTimer();
  else stopTimer();
  // Note: La vidéo est contrôlée indépendamment via toggleVideoPlayPause()
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  soundBtn.innerHTML = state.soundEnabled ? ICONS.SOUND_ON : ICONS.SOUND_OFF;
  soundBtn.classList.toggle("muted", !state.soundEnabled);
}

function toggleTimer() {
  state.showTimer = !state.showTimer;
  progressBar.classList.toggle("hidden", !state.showTimer);
  toggleTimerBtn.innerHTML = state.showTimer ? ICONS.TIMER_ON : ICONS.TIMER_OFF;
  toggleTimerBtn.classList.toggle("active", state.showTimer);
}

function toggleSidebar() {
  state.showSidebar = !state.showSidebar;
  sidebar.classList.toggle("sidebar-hidden", !state.showSidebar);

  // Mettre à jour la position des scrollbars si elles existent
  if (
    typeof ZoomManager !== "undefined" &&
    ZoomManager._updateScrollbarPosition
  ) {
    ZoomManager._updateScrollbarPosition();
  }

  // Mettre à jour la position du canvas de dessin si présent
  if (drawingPreview) {
    drawingPreview.style.right = state.showSidebar ? "105px" : "10px";
  }
}

function toggleImageInfo() {
  const existingInfo = document.getElementById("image-info-overlay");

  if (existingInfo) {
    existingInfo.remove();
    return;
  }

  const image = state.images[state.currentIndex];
  if (!image) return;

  const overlay = document.createElement("div");
  overlay.id = "image-info-overlay";
  overlay.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(20, 20, 20, 0.5);
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding: 20px;
    z-index: 999;
    backdrop-filter: blur(5px);
    animation: slideUp 0.3s ease-out;
  `;

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    return date.toLocaleDateString(
      window.getLocale ? window.getLocale() : "fr-FR",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  };

  const img = document.getElementById("current-image");
  const dimensions = img ? `${img.naturalWidth} × ${img.naturalHeight}` : "N/A";

  overlay.innerHTML = `
    <div class="info-grid">
      <div>
        <div class="info-label">Nom</div>
        <div class="info-value">${image.name || "N/A"}</div>
      </div>
      <div>
        <div class="info-label">Dimensions</div>
        <div class="info-value">${dimensions}</div>
      </div>
      <div>
        <div class="info-label">Taille</div>
        <div class="info-value">${
          image.size ? formatFileSize(image.size) : "N/A"
        }</div>
      </div>
      
      ${
        image.tags && image.tags.length > 0
          ? `
      <div class="tags-section">
        <div class="tags-header">
          <div class="info-label">Tags</div>
          <button id="add-tag-btn" data-tooltip="${i18next.t("tags.add")} (T)">+</button>
        </div>
        <div class="tags-container">
          ${image.tags
            .map(
              (tag) => `
            <span class="tag-badge">
              ${tag}
              <button class="tag-remove-btn" data-tag="${tag}" aria-label="${i18next.t("tags.remove")}">×</button>
            </span>
          `,
            )
            .join("")}
        </div>
      </div>
      `
          : `
      <div class="tags-section">
        <div class="tags-header">
          <div class="info-label">Tags</div>
          <button id="add-tag-btn" data-tooltip="${i18next.t("tags.add")} (T)">+</button>
        </div>
        <div class="no-tags-message">${i18next.t("tags.noTags", { defaultValue: "No tags" })}</div>
      </div>
      `
      }
      
  `;

  // Animation CSS
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(overlay);

  // Event listener pour supprimer les tags
  overlay.querySelectorAll(".tag-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tagName = btn.dataset.tag;

      try {
        // Récupérer l'item Eagle
        const item = await eagle.item.getById(image.id);

        // Retirer le tag
        if (item.tags) {
          item.tags = item.tags.filter((t) => t !== tagName);
        }

        // Sauvegarder les modifications
        await item.save();

        // Mettre à jour l'image locale
        image.tags = item.tags;

        // Rafraîchir l'overlay
        overlay.remove();
        toggleImageInfo();
      } catch (err) {
        console.error("Erreur lors de la suppression du tag:", err);
        alert(i18next.t("errors.tagError"));
      }
    });
  });

  // Gérer le bouton + pour ajouter des tags
  const addTagBtn = overlay.querySelector("#add-tag-btn");
  if (addTagBtn) {
    addTagBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Empêcher la fermeture de l'overlay
      openTagsModal();
    });
  }

  // Fermer en cliquant dessus ou avec Escape
  overlay.addEventListener("click", () => overlay.remove());

  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);
}

// ================================================================
// GESTION DES TAGS
// ================================================================

async function openTagsModal(reviewIndex = null) {
  const tagsModal = document.getElementById("tags-modal");
  const closeTagsModal = document.getElementById("close-tags-modal");
  const newTagInput = document.getElementById("new-tag-input");
  const createTagBtn = document.getElementById("create-tag-btn");
  const availableTagsList = document.getElementById("available-tags-list");

  if (!tagsModal) return;

  // Déterminer l'image selon le contexte (session ou review)
  let currentImage;
  if (reviewIndex !== null) {
    // Mode review : utiliser state.imagesSeen
    currentImage = state.imagesSeen[reviewIndex];
  } else {
    // Mode session : utiliser state.images
    currentImage = state.images[state.currentIndex];
  }

  if (!currentImage) return;

  // Sauvegarder l'état du timer et l'arrêter
  state.wasPlayingBeforeModal = state.isPlaying;
  if (state.isPlaying) {
    stopTimer();
  }

  // Afficher le modal
  tagsModal.classList.remove("hidden");

  // Mettre le focus sur l'input
  setTimeout(() => newTagInput.focus(), 100);

  // État du filtre de groupe
  let selectedGroup = "all";
  let allTagsData = [];

  // Charger les groupes de tags
  async function loadTagGroups() {
    const tagsGroupsList = document.getElementById("tags-groups-list");
    if (!tagsGroupsList) return;

    try {
      // Récupérer les groupes de tags depuis Eagle
      const tagGroups = await eagle.tagGroup.get();

      if (!tagGroups || tagGroups.length === 0) {
        return;
      }

      // Récupérer tous les tags pour compter les tags par groupe
      const allTags = await eagle.tag.get();

      // Créer un Map pour compter les tags par groupe ID
      const groupCountsMap = new Map();
      tagGroups.forEach((group) => {
        groupCountsMap.set(group.id, 0);
      });

      // Compter les tags dans chaque groupe
      allTags.forEach((tag) => {
        if (tag.groups && Array.isArray(tag.groups)) {
          tag.groups.forEach((groupId) => {
            if (groupCountsMap.has(groupId)) {
              groupCountsMap.set(groupId, groupCountsMap.get(groupId) + 1);
            }
          });
        }
      });

      // Trier les groupes par ordre alphabétique
      const sortedGroups = tagGroups.sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      // Afficher les groupes
      tagsGroupsList.innerHTML = sortedGroups
        .map((group) => {
          const count = groupCountsMap.get(group.id) || 0;

          // Vérifier si ce groupe contient au moins un tag actif de l'image
          const hasActiveTag =
            currentImage &&
            currentImage.tags &&
            allTags.some(
              (tag) =>
                tag.groups &&
                tag.groups.includes(group.id) &&
                currentImage.tags.includes(tag.name),
            );

          const countClass = hasActiveTag
            ? "group-count active"
            : "group-count";

          return `
          <div class="group-item" data-group="${group.id}">
            <span class="group-name">${group.name}</span>
            <span class="${countClass}">${count}</span>
          </div>
        `;
        })
        .join("");

      // Event listeners pour les groupes
      document.querySelectorAll(".group-item").forEach((item) => {
        item.addEventListener("click", () => {
          // Désactiver tous les groupes
          document
            .querySelectorAll(".group-item")
            .forEach((el) => el.classList.remove("active"));
          // Activer le groupe cliqué
          item.classList.add("active");
          selectedGroup = item.dataset.group;
          // Recharger les tags avec le filtre
          loadAvailableTags();
        });
      });
    } catch (e) {
      console.error("Erreur lors du chargement des groupes:", e);
    }
  }

  // Charger tous les tags disponibles depuis Eagle
  async function loadAvailableTags() {
    try {
      // Récupérer tous les tags depuis Eagle
      const allTags = await eagle.tag.get();
      const imageTags = currentImage.tags || [];

      // Sauvegarder pour usage ultérieur
      allTagsData = allTags;

      // Créer un Set pour éviter les doublons
      const allTagNames = new Set();

      // Ajouter les tags d'Eagle (avec filtrage par groupe si nécessaire)
      if (allTags && allTags.length > 0) {
        allTags.forEach((tag) => {
          const tagName = tag.name || tag;

          // Filtrer par groupe si un groupe est sélectionné
          if (selectedGroup !== "all") {
            if (
              tag.groups &&
              Array.isArray(tag.groups) &&
              tag.groups.includes(selectedGroup)
            ) {
              allTagNames.add(tagName);
            }
          } else {
            allTagNames.add(tagName);
          }
        });
      }

      // IMPORTANT : Ajouter les tags de l'image actuelle SEULEMENT si "Tous les tags" est sélectionné
      // (pour éviter d'afficher des tags actifs qui ne sont pas dans le groupe sélectionné)
      if (selectedGroup === "all") {
        imageTags.forEach((tag) => allTagNames.add(tag));
      }

      if (allTagNames.size === 0) {
        availableTagsList.innerHTML = `<div style="color: #888; padding: 12px; text-align: center;">${i18next.t("tags.noTagsAvailable", { defaultValue: "No tags available. Create a new one above." })}</div>`;
        return;
      }

      // Convertir en array et trier : actifs en premier, puis par ordre alphabétique
      const sortedTags = Array.from(allTagNames).sort((a, b) => {
        const isActiveA = imageTags.includes(a);
        const isActiveB = imageTags.includes(b);

        // Tags actifs en premier
        if (isActiveA && !isActiveB) return -1;
        if (!isActiveA && isActiveB) return 1;

        // Sinon, tri alphabétique
        return a.localeCompare(b);
      });

      availableTagsList.innerHTML = sortedTags
        .map((tagName) => {
          const isActive = imageTags.includes(tagName);
          return `
          <div class="tag-item ${
            isActive ? "active" : ""
          }" data-tag="${tagName}">
            ${
              isActive
                ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>'
                : ""
            }
            ${tagName}
          </div>
        `;
        })
        .join("");

      // Gérer les clics sur les tags
      availableTagsList.querySelectorAll(".tag-item").forEach((tagItem) => {
        tagItem.addEventListener("click", async () => {
          const tagName = tagItem.dataset.tag;
          const isActive = tagItem.classList.contains("active");

          try {
            // Récupérer l'item Eagle
            const item = await eagle.item.getById(currentImage.id);

            if (isActive) {
              // Retirer le tag
              item.tags = item.tags.filter((t) => t !== tagName);
            } else {
              // Ajouter le tag
              if (!item.tags) item.tags = [];
              if (!item.tags.includes(tagName)) {
                item.tags.push(tagName);
              }
            }

            // Sauvegarder les modifications
            await item.save();

            // Mettre à jour currentImage
            currentImage.tags = item.tags;
          } catch (e) {
            console.error("Erreur lors de la modification du tag:", e);
            alert(i18next.t("errors.tagError"));
            return;
          }

          // Recharger la liste
          await loadAvailableTags();

          // Mettre à jour l'overlay d'info si ouvert
          const infoOverlay = document.getElementById("image-info-overlay");
          if (infoOverlay) {
            infoOverlay.remove();
            toggleImageInfo();
          }
        });
      });
    } catch (e) {
      console.error("Erreur lors du chargement des tags:", e);
      availableTagsList.innerHTML = `<div style="color: #ff4545; padding: 12px;">${i18next.t("errors.tagError")}</div>`;
    }
  }

  // Créer un nouveau tag
  async function createNewTag() {
    const tagName = newTagInput.value.trim();
    if (!tagName) return;

    try {
      // Récupérer l'item Eagle
      const item = await eagle.item.getById(currentImage.id);

      // Ajouter le tag
      if (!item.tags) item.tags = [];
      if (!item.tags.includes(tagName)) {
        item.tags.push(tagName);
      }

      // Sauvegarder les modifications (le tag sera créé automatiquement dans Eagle)
      await item.save();

      // Mettre à jour currentImage AVANT de recharger la liste
      currentImage.tags = item.tags;

      // Réinitialiser l'input
      newTagInput.value = "";
      hideAutocomplete();

      // Recharger la liste des tags ET l'autocomplétion
      await loadTagsForAutocomplete();
      await loadAvailableTags();

      // Mettre à jour l'overlay d'info si ouvert
      const infoOverlay = document.getElementById("image-info-overlay");
      if (infoOverlay) {
        infoOverlay.remove();
        toggleImageInfo();
      }
    } catch (e) {
      console.error("Erreur lors de la création du tag:", e);
      alert(i18next.t("errors.creationError"));
    }
  }

  // Autocomplétion des tags
  const autocompleteEl = document.getElementById("tag-autocomplete");
  let allTagNames = [];
  let selectedAutocompleteIndex = -1;

  function hideAutocomplete() {
    if (autocompleteEl) {
      autocompleteEl.classList.add("hidden");
      selectedAutocompleteIndex = -1;
    }
  }

  function showAutocomplete(suggestions) {
    if (!autocompleteEl || suggestions.length === 0) {
      hideAutocomplete();
      return;
    }

    const searchTerm = newTagInput.value.trim().toLowerCase();

    autocompleteEl.innerHTML = suggestions
      .map((tag, index) => {
        // Highlight du terme recherché
        const tagLower = tag.toLowerCase();
        const startIndex = tagLower.indexOf(searchTerm);
        let displayTag = tag;

        if (startIndex !== -1 && searchTerm) {
          const before = tag.substring(0, startIndex);
          const match = tag.substring(
            startIndex,
            startIndex + searchTerm.length,
          );
          const after = tag.substring(startIndex + searchTerm.length);
          displayTag = `${before}<span class="highlight">${match}</span>${after}`;
        }

        return `<div class="autocomplete-item" data-index="${index}" data-tag="${tag}">${displayTag}</div>`;
      })
      .join("");

    autocompleteEl.classList.remove("hidden");
    selectedAutocompleteIndex = -1;

    // Event listeners pour les clics
    autocompleteEl.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("click", async () => {
        newTagInput.value = item.dataset.tag;
        hideAutocomplete();
        // Appeler directement createNewTag pour assigner le tag
        await createNewTag();
      });
    });
  }

  function updateAutocomplete() {
    const searchTerm = newTagInput.value.trim().toLowerCase();

    if (!searchTerm) {
      hideAutocomplete();
      return;
    }

    // Filtrer les tags existants
    const imageTags = currentImage.tags || [];
    const suggestions = allTagNames
      .filter((tag) => {
        // Ne pas suggérer les tags déjà appliqués
        if (imageTags.includes(tag)) return false;
        // Filtrer par terme de recherche
        return tag.toLowerCase().includes(searchTerm);
      })
      .slice(0, 10); // Limiter à 10 suggestions

    showAutocomplete(suggestions);
  }

  function selectAutocompleteItem(direction) {
    const items = autocompleteEl.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;

    // Retirer la classe selected de l'item précédent
    if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
      items[selectedAutocompleteIndex].classList.remove("selected");
    }

    // Calculer le nouvel index
    if (direction === "down") {
      selectedAutocompleteIndex = Math.min(
        selectedAutocompleteIndex + 1,
        items.length - 1,
      );
    } else if (direction === "up") {
      selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
    }

    // Ajouter la classe selected au nouvel item
    if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
      items[selectedAutocompleteIndex].classList.add("selected");
      items[selectedAutocompleteIndex].scrollIntoView({ block: "nearest" });
    }
  }

  async function loadTagsForAutocomplete() {
    try {
      const allTags = await eagle.tag.get();
      allTagNames = allTags.map((tag) => tag.name || tag);
    } catch (e) {
      console.error(
        "Erreur lors du chargement des tags pour autocomplétion:",
        e,
      );
      allTagNames = [];
    }
  }

  // Charger les tags au démarrage
  await loadTagGroups();
  await loadAvailableTags();
  await loadTagsForAutocomplete();

  // Event listeners
  closeTagsModal.addEventListener("click", () => {
    tagsModal.classList.add("hidden");
    hideAutocomplete();
    // Nettoyer le listener Tab
    document.removeEventListener("keydown", tabNavigationHandler, true);
    // Redémarrer le timer si nécessaire
    if (state.wasPlayingBeforeModal) {
      startTimer();
      state.wasPlayingBeforeModal = false;
    }
  });

  tagsModal.addEventListener("click", (e) => {
    if (e.target === tagsModal) {
      tagsModal.classList.add("hidden");
      hideAutocomplete();
      // Nettoyer le listener Tab
      document.removeEventListener("keydown", tabNavigationHandler, true);
      // Redémarrer le timer si nécessaire
      if (state.wasPlayingBeforeModal) {
        startTimer();
        state.wasPlayingBeforeModal = false;
      }
    }
  });

  createTagBtn.addEventListener("click", createNewTag);

  // Autocomplétion sur l'input
  newTagInput.addEventListener("input", updateAutocomplete);

  newTagInput.addEventListener("keydown", (e) => {
    const autocompleteVisible =
      autocompleteEl && !autocompleteEl.classList.contains("hidden");

    if (e.key === "ArrowDown" && autocompleteVisible) {
      e.preventDefault();
      selectAutocompleteItem("down");
    } else if (e.key === "ArrowUp" && autocompleteVisible) {
      e.preventDefault();
      selectAutocompleteItem("up");
    } else if (e.key === "Enter") {
      e.preventDefault();

      // Si un item est sélectionné dans l'autocomplétion
      if (autocompleteVisible && selectedAutocompleteIndex >= 0) {
        const items = autocompleteEl.querySelectorAll(".autocomplete-item");
        if (items[selectedAutocompleteIndex]) {
          newTagInput.value = items[selectedAutocompleteIndex].dataset.tag;
          hideAutocomplete();
          return;
        }
      }

      // Sinon créer le tag
      createNewTag();
    } else if (e.key === "Escape") {
      if (autocompleteVisible) {
        e.preventDefault();
        e.stopPropagation();
        hideAutocomplete();
      } else {
        // Fermer le modal
        e.preventDefault();
        tagsModal.classList.add("hidden");
        // Redémarrer le timer si nécessaire
        if (state.wasPlayingBeforeModal) {
          startTimer();
          state.wasPlayingBeforeModal = false;
        }
      }
    }
  });

  // Cacher l'autocomplétion quand on clique ailleurs
  document.addEventListener("click", (e) => {
    if (!newTagInput.contains(e.target) && !autocompleteEl.contains(e.target)) {
      hideAutocomplete();
    }
  });

  // Navigation entre groupes avec Tab - event listener global pour capturer Tab partout dans le modal
  const tabNavigationHandler = (e) => {
    // Gérer la touche Échap pour fermer le modal
    if (e.key === "Escape" && !tagsModal.classList.contains("hidden")) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      tagsModal.classList.add("hidden");
      hideAutocomplete();
      document.removeEventListener("keydown", tabNavigationHandler, true);
      if (state.wasPlayingBeforeModal) {
        startTimer();
        state.wasPlayingBeforeModal = false;
      }
      return;
    }

    if (e.key === "Tab" && !tagsModal.classList.contains("hidden")) {
      // Ne pas bloquer Tab si on est dans l'input de création de tag
      if (e.target === newTagInput) {
        return;
      }

      // IMPORTANT : Bloquer le comportement par défaut AVANT tout traitement
      e.preventDefault();
      e.stopPropagation();

      // Récupérer tous les groupes
      const allGroups = document.querySelectorAll(".group-item");
      if (allGroups.length === 0) return;

      // Trouver le groupe actif
      let currentIndex = -1;
      allGroups.forEach((group, index) => {
        if (group.classList.contains("active")) {
          currentIndex = index;
        }
      });

      // Calculer le prochain index (avec boucle)
      let nextIndex;
      if (e.shiftKey) {
        // Shift+Tab : groupe précédent
        nextIndex = currentIndex <= 0 ? allGroups.length - 1 : currentIndex - 1;
      } else {
        // Tab : groupe suivant
        nextIndex = (currentIndex + 1) % allGroups.length;
      }

      // Désactiver tous les groupes
      allGroups.forEach((group) => group.classList.remove("active"));

      // Activer le nouveau groupe
      const nextGroup = allGroups[nextIndex];
      nextGroup.classList.add("active");
      selectedGroup = nextGroup.dataset.group;

      // Faire défiler jusqu'au groupe
      nextGroup.scrollIntoView({ block: "nearest", behavior: "smooth" });

      // Recharger les tags
      loadAvailableTags();
    }
  };

  // Attacher au document pour capturer l'événement partout avec capture: true
  // pour intercepter AVANT que le focus ne change
  document.addEventListener("keydown", tabNavigationHandler, true);

  // Drag du modal par le header (initialiser une seule fois)
  const modalHeader = document.getElementById("tags-modal-header");
  const modalContent = tagsModal.querySelector(".modal-content");

  if (modalHeader && modalContent && !modalHeader.dataset.dragInitialized) {
    modalHeader.dataset.dragInitialized = "true";

    let isDragging = false;
    let startX, startY;
    let offsetX = 0,
      offsetY = 0;

    const onMouseDown = (e) => {
      // Ignorer si on clique sur le bouton de fermeture
      if (e.target.closest(".modal-close-btn")) return;

      isDragging = true;
      startX = e.clientX - offsetX;
      startY = e.clientY - offsetY;
      modalContent.style.transition = "none";
      document.body.style.userSelect = "none";
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      offsetX = e.clientX - startX;
      offsetY = e.clientY - startY;
      modalContent.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      modalContent.style.transition = "";
      document.body.style.userSelect = "";
    };

    modalHeader.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // Observer la fermeture du modal pour réinitialiser la position
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          if (tagsModal.classList.contains("hidden")) {
            offsetX = 0;
            offsetY = 0;
            modalContent.style.transform = "";
          }
        }
      });
    });

    observer.observe(tagsModal, { attributes: true });
  }
}

async function copyImageToClipboard() {
  const image = state.images[state.currentIndex];
  if (!image) return;

  try {
    // Méthode 1 : Copier le fichier (pour pouvoir le coller dans l'explorateur)
    if (eagle.clipboard && eagle.clipboard.copyFiles) {
      await eagle.clipboard.copyFiles([image.filePath]);
      console.log("Fichier image copié dans le presse-papier");

      // Notification de succès
      if (eagle.notification && eagle.notification.show) {
        await eagle.notification.show({
          title: i18next.t("notifications.imageCopied"),
          body: i18next.t("notifications.imageCopiedToClipboard"),
          duration: 2000,
          mute: true,
        });
      }
      return;
    }

    // Fallback : méthode navigateur standard
    const response = await fetch(`file:///${image.filePath}`);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    console.log(i18next.t("notifications.imageCopiedToClipboard"));

    // Notification de succès (fallback)
    if (eagle.notification && eagle.notification.show) {
      await eagle.notification.show({
        title: i18next.t("notifications.imageCopied"),
        body: i18next.t("notifications.imageCopiedToClipboard"),
        duration: 2000,
        mute: true,
      });
    }
  } catch (err) {
    console.error("Erreur lors de la copie:", err);
  }
}

async function openImageInExplorer() {
  const image = state.images[state.currentIndex];
  if (!image) return;

  try {
    // Utiliser l'API Eagle pour ouvrir dans l'explorateur
    if (eagle.shell && eagle.shell.showItemInFolder) {
      await eagle.shell.showItemInFolder(image.filePath);
    } else if (eagle.item && eagle.item.showInFolder) {
      await eagle.item.showInFolder(image.id);
    } else {
      // Fallback: ouvrir directement le fichier
      window.open(`file:///${image.filePath}`);
    }
  } catch (e) {
    console.error("Erreur ouverture explorateur:", e);
    // Dernier fallback
    try {
      window.open(`file:///${image.filePath}`);
    } catch (err) {
      console.error("Fallback échoué:", err);
    }
  }
}

async function revealImage() {
  const image = state.images[state.currentIndex];
  if (image) {
    try {
      const wasPlaying = state.isPlaying;
      if (wasPlaying) {
        state.isPlaying = false;
        updatePlayPauseIcon();
        stopTimer();
      }
      if (eagle.window && eagle.window.minimize) {
        await eagle.window.minimize();
      }
      await eagle.item.open(image.id);
    } catch (e) {
      console.error("Erreur reveal:", e);
    }
  }
}

async function deleteImage() {
  const image = state.images[state.currentIndex];
  if (!image) return;

  try {
    await image.moveToTrash();
    state.images.splice(state.currentIndex, 1);

    if (state.images.length === 0) {
      alert(i18next.t("settings.noImagesFound"));
      location.reload();
    } else {
      if (state.currentIndex >= state.images.length) {
        state.currentIndex = 0;
      }
      state.timeRemaining = state.selectedDuration;
      updateDisplay();
    }
  } catch (e) {
    console.error("Erreur suppression:", e);
    try {
      await eagle.item.moveToTrash([image.id]);
    } catch (err) {}
  }
}

function updateRelaxDisplay() {
  const pMins = Math.floor(state.currentPoseTime / 60);
  const pSecs = (state.currentPoseTime % 60).toString().padStart(2, "0");
  const tMins = Math.floor(state.totalSessionTime / 60);
  const tSecs = (state.totalSessionTime % 60).toString().padStart(2, "0");

  // Mettre à jour l'infobulle avec le temps total
  timerDisplay.setAttribute("data-tooltip", i18next.t("timer.totalTimeSpent"));

  // Afficher le temps total dans le timer et le temps de la pose en dessous
  timerDisplay.innerHTML = `
    ${tMins}:${tSecs}
    <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">
      ${i18next.t("misc.poseLabel")} : ${pMins}:${pSecs}
    </div>
  `;
}

function applyImageFilters() {
  // Sélectionner l'élément média approprié (image ou vidéo)
  const mediaElement = state.isVideoFile ? currentVideo : currentImage;
  if (!mediaElement) return;

  // L'opacité est maintenant gérée par l'overlay en mode mémoire flash

  // --- 1. GESTION DES FILTRES (Noir & Blanc + Flou + Silhouette) ---
  let filters = [];
  if (state.grayscale) filters.push("grayscale(100%)");

  let blurValue = 0;

  // LOGIQUE SPÉCIFIQUE MODE MÉMOIRE PROGRESSIF
  if (state.sessionMode === "memory" && state.memoryType === "progressive") {
    // Le flou augmente au fil du temps (inverse de progressiveBlur classique)
    let ratio = 1;
    if (state.selectedDuration > 0) {
      ratio = state.timeRemaining / state.selectedDuration;
    }
    // Flou qui augmente : au début ratio=1 (net), à la fin ratio=0 (flou max)
    blurValue = (1 - ratio) * 10;
  } else if (state.isBlurEnabled) {
    blurValue = state.blurAmount;
  } else if (state.isProgressiveBlur) {
    // Calcul du ratio de progression : 0 (début) → 1 (fin)
    let ratio = 1; // par défaut, flou maximum
    if (state.selectedDuration > 0) {
      ratio = state.timeRemaining / state.selectedDuration;
    }
    // Si reverseProgressiveBlur est true : flou → net (1 - ratio)
    // Si reverseProgressiveBlur est false : net → flou (ratio)
    const progressRatio = CONFIG.reverseProgressiveBlur ? 1 - ratio : ratio;
    blurValue = progressRatio * 10;
  }
  if (blurValue > 0) filters.push(`blur(${blurValue}px)`);

  // Filtre silhouette (seuil)
  if (state.silhouetteEnabled) {
    const silhouetteFilterCSS = getSilhouetteFilterCSS();
    filters.push(silhouetteFilterCSS);
  }

  // Application des filtres (fonctionne sur img ET video)
  mediaElement.style.filter = filters.length > 0 ? filters.join(" ") : "none";

  // --- 2. GESTION DES TRANSFORMS (Flip H et V) ---
  let transforms = [];
  if (state.flipHorizontal) transforms.push("scaleX(-1)");
  if (state.flipVertical) transforms.push("scaleY(-1)");

  // IMPORTANT : On applique le transform ici aussi pour ne pas qu'il saute
  mediaElement.style.transform =
    transforms.length > 0 ? transforms.join(" ") : "none";

  // --- 3. MISE À JOUR BARRE DE PROGRESSION ---
  if (progressBar) {
    progressBar.style.filter = blurValue > 0 ? `blur(${blurValue}px)` : "none";
  }
}

// MODE CUSTOM

function addStepToQueue(isPause = false) {
  try {
    const hInput = document.getElementById("custom-h-input");
    const mInput = document.getElementById("custom-m-input");
    const sInput = document.getElementById("custom-s-input");
    const countInput = document.getElementById("custom-count-input");

    let h = parseInt(hInput?.value) || 0;
    let m = parseInt(mInput?.value) || 0;
    let s = parseInt(sInput?.value) || 0;

    let totalSeconds = h * 3600 + m * 60 + s;

    // LOGIQUE PAUSE PAR DÉFAUT
    if (isPause && totalSeconds === 0) {
      totalSeconds = 300;
    }

    if (totalSeconds > 0) {
      state.customQueue.push({
        type: isPause ? "pause" : "pose",
        count: isPause ? 1 : parseInt(countInput?.value) || 5,
        duration: totalSeconds,
        id: Date.now(),
      });

      // On vide les champs
      if (hInput) hInput.value = "";
      if (mInput) mInput.value = "";
      if (sInput) sInput.value = "";

      renderCustomQueue();
      updateStartButtonState();
    } else {
      const inputsToFlash = [hInput, mInput, sInput];

      inputsToFlash.forEach((input) => {
        if (input) {
          const parentField = input.closest(".time-field");

          if (parentField) {
            parentField.classList.add("shake", "input-border-error");

            setTimeout(() => {
              parentField.classList.remove("shake", "input-border-error");
            }, 400);
          }
        }
      });
    }
  } catch (err) {
    console.error("Erreur dans addStepToQueue:", err);
  }
}

function renderCustomQueue() {
  const container = document.getElementById("custom-steps-list");
  if (!container) return;

  if (state.customQueue.length === 0) {
    container.innerHTML = `<div class="empty-queue-msg">${i18next.t("modes.custom.emptyQueueMsg")}</div>`;
    // On cache le total s'il n'y a rien
    const existingTotal = document.getElementById("custom-total-wrapper");
    if (existingTotal) existingTotal.style.display = "none";
    return;
  }

  // ========================================
  // OPTIMISATION: Virtual Scrolling
  // ========================================
  // Utiliser le Virtual Scroller si la liste est grande (>50 éléments)
  const USE_VIRTUAL_SCROLL = state.customQueue.length > 50;

  if (USE_VIRTUAL_SCROLL) {
    // Fonction pour rendre chaque item
    const renderItem = (step, index) => {
      const isPause = step.type === "pause";
      const groupTotalSeconds = (isPause ? 1 : step.count) * step.duration;

      const h = Math.floor(step.duration / 3600);
      const m = Math.floor((step.duration % 3600) / 60);
      const s = step.duration % 60;

      const color = isPause ? "#ffa500" : "#667eea";
      const bg = isPause
        ? "rgba(255, 165, 0, 0.08)"
        : "rgba(102, 126, 234, 0.08)";

      return `
        <div class="step-item" 
             ondragover="handleDragOver(event, this)" 
             ondrop="dropStep(event, ${index})" 
             ondragend="handleDragEnd()" 
             style="display:flex; justify-content:space-between; align-items:center; background:${bg}; padding:8px 15px; border-radius:8px; margin-bottom:8px; border-left:4px solid ${color}; color: white; position: relative; height: 54px;">
            
            <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
                <div class="drag-handle" draggable="true" ondragstart="dragStep(event, ${index})" style="cursor: grab; opacity: 0.3; padding-right: 10px; font-size: 16px;">⋮⋮</div>

                ${
                  isPause
                    ? `<span style="color:${color}; font-weight:bold; min-width:65px;">☕ PAUSE</span>`
                    : `<input type="number" value="${step.count}" min="1" 
                            oninput="updateStep(${index}, 'count', this.value)" 
                            style="width:30px; background:none; border:none; color:${color}; font-weight:bold; text-align:center;">
                     <span style="opacity:0.8;">Poses de</span>`
                }
                
                <div class="hms-group" style="display:flex; align-items:center; background:rgba(0,0,0,0.2); padding:2px 8px; border-radius:4px; gap:2px;">
                    <input type="number" value="${h}" min="0" oninput="updateStepHMS(${index}, 'h', this.value)" style="width:22px; background:none; border:none; color:white; text-align:right;">
                    <span style="font-size:10px; opacity:0.5;">h</span>
                    <input type="number" value="${m}" min="0" max="59" oninput="updateStepHMS(${index}, 'm', this.value)" style="width:22px; background:none; border:none; color:white; text-align:right;">
                    <span style="font-size:10px; opacity:0.5;">m</span>
                    <input type="number" value="${s}" min="0" max="59" oninput="updateStepHMS(${index}, 's', this.value)" style="width:22px; background:none; border:none; color:white; text-align:right;">
                    <span style="font-size:10px; opacity:0.5;">s</span>
                </div>
            </div>

            <div style="display:flex; align-items:center; gap:15px;">
                <span style="font-size:11px; color:rgba(255,255,255,0.3); font-weight:500;">
                    TOTAL: ${formatTime(groupTotalSeconds)}
                </span>
                <button onclick="removeStepFromQueue(${index})" style="background:none; border:none; color:rgba(255,77,77,0.5); cursor:pointer; font-size:18px;">✕</button>
            </div>
        </div>`;
    };

    // Initialiser ou mettre à jour le Virtual Scroller
    if (!customQueueScroller) {
      customQueueScroller = new VirtualScroller(
        container,
        state.customQueue,
        renderItem,
        {
          itemHeight: 70, // Hauteur incluant margin-bottom
          bufferSize: 3,
          visibleCount: 8,
        },
      );
    } else {
      customQueueScroller.update(state.customQueue);
    }

    // Réappliquer le scrubbing sur les inputs visibles
    setTimeout(() => {
      container.querySelectorAll('input[type="number"]').forEach((input) => {
        if (!input.closest(".drag-handle")) {
          makeInputScrubbable(input);
        }
      });
    }, 0);
  } else {
    // ========================================
    // Rendu normal pour listes petites (<50 éléments)
    // ========================================
    let totalSessionSeconds = 0;

    container.innerHTML = state.customQueue
      .map((step, index) => {
        const isPause = step.type === "pause";
        const groupTotalSeconds = (isPause ? 1 : step.count) * step.duration;
        totalSessionSeconds += groupTotalSeconds;

        const h = Math.floor(step.duration / 3600);
        const m = Math.floor((step.duration % 3600) / 60);
        const s = step.duration % 60;

        const color = isPause ? "#ffa500" : "#667eea";
        const bg = isPause
          ? "rgba(255, 165, 0, 0.08)"
          : "rgba(102, 126, 234, 0.08)";

        return `
          <div class="step-item" 
               ondragover="handleDragOver(event, this)" 
               ondrop="dropStep(event, ${index})" 
               ondragend="handleDragEnd()" 
               style="display:flex; justify-content:space-between; align-items:center; background:${bg}; padding:8px 15px; border-radius:8px; margin-bottom:8px; border-left:4px solid ${color}; color: white; position: relative;">
              
              <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
                  <div class="drag-handle" draggable="true" ondragstart="dragStep(event, ${index})" style="cursor: grab; opacity: 0.3; padding-right: 10px; font-size: 16px;">⋮⋮</div>

                  ${
                    isPause
                      ? `<span style="color:${color}; font-weight:bold; min-width:65px;">☕ PAUSE</span>`
                      : `<input type="number" value="${step.count}" min="1" 
                              oninput="updateStep(${index}, 'count', this.value)" 
                              style="width:30px; background:none; border:none; color:${color}; font-weight:bold; text-align:center;">
                       <span style="opacity:0.8;">Poses de</span>`
                  }
                  
                  <div class="hms-group" style="display:flex; align-items:center; background:rgba(0,0,0,0.2); padding:2px 8px; border-radius:4px; gap:2px;">
                      <input type="number" value="${h}" min="0" oninput="updateStepHMS(${index}, 'h', this.value)" style="width:22px; background:none; border:none; color:white; text-align:right;">
                      <span style="font-size:10px; opacity:0.5;">h</span>
                      <input type="number" value="${m}" min="0" max="59" oninput="updateStepHMS(${index}, 'm', this.value)" style="width:22px; background:none; border:none; color:white; text-align:right;">
                      <span style="font-size:10px; opacity:0.5;">m</span>
                      <input type="number" value="${s}" min="0" max="59" oninput="updateStepHMS(${index}, 's', this.value)" style="width:22px; background:none; border:none; color:white; text-align:right;">
                      <span style="font-size:10px; opacity:0.5;">s</span>
                  </div>
              </div>

              <div style="display:flex; align-items:center; gap:15px;">
                  <span style="font-size:11px; color:rgba(255,255,255,0.3); font-weight:500;">
                      TOTAL: ${formatTime(groupTotalSeconds)}
                  </span>
                  <button onclick="removeStepFromQueue(${index})" style="background:none; border:none; color:rgba(255,77,77,0.5); cursor:pointer; font-size:18px;">✕</button>
              </div>
          </div>`;
      })
      .join("");

    // Réactivation du scrub sur les nouveaux inputs créés (sauf ceux dans le drag-handle)
    container.querySelectorAll('input[type="number"]').forEach((input) => {
      // Ne pas appliquer le scrub si l'input est dans un drag-handle
      if (!input.closest(".drag-handle")) {
        makeInputScrubbable(input);
      }
    });

    // Mettre à jour le total
    updateTotalDisplay(totalSessionSeconds);

    // Réinitialiser le scroller si on repasse en mode normal
    customQueueScroller = null;
  }

  // Calculer et afficher le total de session
  if (USE_VIRTUAL_SCROLL) {
    let totalSessionSeconds = 0;
    state.customQueue.forEach((step) => {
      const isPause = step.type === "pause";
      const groupTotalSeconds = (isPause ? 1 : step.count) * step.duration;
      totalSessionSeconds += groupTotalSeconds;
    });
    updateTotalDisplay(totalSessionSeconds);
  }
}

/**
 * Charge les images d'une session historique pour la rejouer
 * @param {string[]} imageIds - IDs des images Eagle
 * @param {Object} options - Options de la session
 * @param {string} options.mode - Mode de session (classique, custom, etc.)
 * @param {number} options.duration - Durée par pose en secondes
 */
async function loadSessionImages(imageIds, options = {}) {
  if (!imageIds || imageIds.length === 0) {
    console.warn("[Plugin] Pas d'IDs d'images à charger");
    return;
  }

  console.log(
    "[Plugin] Chargement de",
    imageIds.length,
    "images depuis la session historique",
  );

  try {
    // Récupérer les items Eagle par leurs IDs
    const items = [];
    for (const id of imageIds) {
      try {
        const item = await eagle.item.getById(id);
        if (item) {
          items.push(item);
        }
      } catch (e) {
        console.warn("[Plugin] Impossible de récupérer l'item", id, e);
      }
    }

    if (items.length === 0) {
      throw new Error(i18next.t("settings.noImagesFound"));
    }

    console.log("[Plugin] Items récupérés:", items.length);

    // Charger les images dans le state
    state.images = items.filter((item) =>
      MEDIA_EXTENSIONS.includes(item.ext.toLowerCase()),
    );

    // Sauvegarder l'ordre original
    state.originalImages = [...state.images];

    // Réinitialiser le cache
    imageCache.clear();

    // Mélanger si l'option est activée
    if (state.randomShuffle && state.images.length > 1) {
      for (let i = state.images.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.images[i], state.images[j]] = [state.images[j], state.images[i]];
      }
    }

    // Configurer le mode de session
    if (options.mode) {
      // Utiliser switchMode pour gérer correctement l'affichage des panneaux
      if (typeof switchMode === "function") {
        switchMode(options.mode);
      } else {
        // Fallback si switchMode n'est pas disponible
        state.sessionMode = options.mode;
        document.querySelectorAll("[data-mode]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.mode === options.mode);
        });
      }
    }

    // Restaurer la custom queue si mode custom
    if (
      options.mode === "custom" &&
      options.customQueue &&
      options.customQueue.length > 0
    ) {
      state.customQueue = [...options.customQueue];
      // Rafraîchir l'affichage de la custom queue
      if (typeof renderCustomQueue === "function") {
        renderCustomQueue();
      }
    }

    // Restaurer le type de mémoire si mode memory
    if (options.mode === "memory" && options.memoryType) {
      state.memoryType = options.memoryType;
      // Mettre à jour l'UI du type de mémoire
      document.querySelectorAll("[data-memory-type]").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.dataset.memoryType === options.memoryType,
        );
      });
    }

    // Configurer la durée si fournie
    if (options.duration) {
      state.selectedDuration = Math.round(options.duration);
      const durationInput = document.getElementById("duration-input");
      if (durationInput) {
        durationInput.value = state.selectedDuration;
      }
    }

    // Mettre à jour l'affichage
    const folderInfo = document.getElementById("folder-info");
    if (folderInfo) {
      const imageCount = state.images.filter((item) =>
        IMAGE_EXTENSIONS.includes(item.ext.toLowerCase()),
      ).length;
      const videoCount = state.images.filter((item) =>
        VIDEO_EXTENSIONS.includes(item.ext.toLowerCase()),
      ).length;

      let countMessage = "";
      if (imageCount > 0) {
        countMessage += `${imageCount} image${imageCount > 1 ? "s" : ""}`;
      }
      if (videoCount > 0) {
        if (countMessage) countMessage += ` ${i18next.t("misc.and")} `;
        countMessage += `${videoCount} video${videoCount > 1 ? "s" : ""}`;
      }

      folderInfo.innerHTML = `<span class="success-text">${i18next.t("settings.loadedFromSession", { count: countMessage })}</span>`;
    }

    // Activer le bouton start
    const startBtn = document.getElementById("start-btn");
    if (startBtn) {
      startBtn.disabled = false;
    }

    // Basculer vers l'écran settings si on est ailleurs
    const settingsScreen = document.getElementById("settings-screen");
    const drawingScreen = document.getElementById("drawing-screen");
    const reviewScreen = document.getElementById("review-screen");

    if (settingsScreen && drawingScreen && reviewScreen) {
      drawingScreen.classList.add("hidden");
      reviewScreen.classList.add("hidden");
      document.body.classList.remove("review-active");
      settingsScreen.classList.remove("hidden");

      // Scroll vers le haut de l'écran settings
      settingsScreen.scrollTop = 0;
      // Scroll global de la fenêtre
      window.scrollTo(0, 0);
      // Si le conteneur du plugin a un scroll
      const pluginContainer = document.getElementById("plugin");
      if (pluginContainer) {
        pluginContainer.scrollTop = 0;
      }
    }

    console.log("[Plugin] Session historique chargée avec succès");
  } catch (e) {
    console.error("[Plugin] Erreur lors du chargement des images:", e);
    throw e;
  }
}

// Exposer la fonction globalement
window.loadSessionImages = loadSessionImages;

// Met à jour le nombre de poses (count)
window.updateStep = function (index, field, value) {
  const val = parseInt(value) || 0;
  if (state.customQueue[index]) {
    state.customQueue[index][field] = val;
    // On relance le rendu pour mettre à jour les totaux écrits
    renderCustomQueue();
    if (typeof saveCustomQueue === "function") saveCustomQueue();
  }
};

// Met à jour les heures, minutes ou secondes d'une ligne
window.updateStepHMS = function (index, type, value) {
  const step = state.customQueue[index];
  if (!step) return;

  let h = Math.floor(step.duration / 3600);
  let m = Math.floor((step.duration % 3600) / 60);
  let s = step.duration % 60;

  const val = parseInt(value) || 0;
  if (type === "h") h = val;
  if (type === "m") m = val;
  if (type === "s") s = val;

  step.duration = h * 3600 + m * 60 + s;
  if (step.duration <= 0) step.duration = 1;

  // === IMPORTANT : Si la pause actuellement active est modifiée, mettre à jour le timer en direct ===
  if (state.isPlaying && state.sessionMode === "custom") {
    const currentStep = state.customQueue[state.currentStepIndex];
    if (currentStep && currentStep === step) {
      // C'est l'étape actuellement en cours
      state.selectedDuration = step.duration;
      state.timeRemaining = step.duration;
      updateTimerDisplay();
    }
  }

  // === Relancer le rendu pour actualiser tous les affichages (totaux, inputs, etc.) ===
  renderCustomQueue();

  if (typeof saveCustomQueue === "function") saveCustomQueue();
};

function updateTotalDisplay(totalSeconds) {
  let totalDiv = document.getElementById("custom-total-duration");
  const container = document.getElementById("custom-steps-list");

  if (!totalDiv) {
    totalDiv = document.createElement("div");
    totalDiv.id = "custom-total-duration";
    container.parentNode.insertBefore(totalDiv, container.nextSibling);
  }

  totalDiv.style.cssText =
    "display:block; text-align:center; margin-top:15px; padding:10px; color:#e3e3e3; font-size:14px; border-top:1px dashed rgba(255,255,255,0.1);";
  totalDiv.innerHTML = `${i18next.t("modes.custom.totalDuration")} : <b style="color:#667eea;">${formatTime(
    totalSeconds,
  )}</b>`;
}

window.removeStepFromQueue = function (index) {
  state.customQueue.splice(index, 1);
  renderCustomQueue();
  updateStartButtonState();
};

function updateStartButtonState() {
  if (state.sessionMode === "custom") {
    startBtn.disabled = state.customQueue.length === 0;
  } else if (state.sessionMode === "relax") {
    startBtn.disabled = false;
  } else {
    startBtn.disabled = state.selectedDuration <= 0;
  }

  startBtn.style.opacity = startBtn.disabled ? "0.5" : "1";

  // Disable progressive blur button in relax mode
  if (homeProgressiveBlurBtn) {
    const isRelax = state.sessionMode === "relax";
    homeProgressiveBlurBtn.disabled = isRelax;
    homeProgressiveBlurBtn.style.opacity = isRelax ? "0.5" : "1";
    homeProgressiveBlurBtn.classList.toggle("disabled", isRelax);
  }
}

window.removeStepFromQueue = function (index) {
  state.customQueue.splice(index, 1);
  renderCustomQueue();
  updateStartButtonState();
};

function switchMode(mode) {
  const classicPanel = document.getElementById("mode-classique-settings");
  const customPanel = document.getElementById("mode-custom-settings");
  const memoryPanel = document.getElementById("mode-memory-settings");
  const descEl = document.getElementById("session-description");
  const container = document.querySelector(".settings-modes-container");

  if (!classicPanel || !customPanel || !memoryPanel) return;

  if (state.sessionMode === mode) return;

  const previousMode = state.sessionMode;

  state.sessionMode = mode;

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  if (descEl) {
    descEl.textContent = MODE_DESCRIPTIONS[mode]?.() || "";
  }

  classicPanel.classList.remove("mode-frozen");
  customPanel.classList.remove("mode-frozen");
  memoryPanel.classList.remove("mode-frozen");

  if (mode === "relax") {
    // Au d\u00e9marrage (previousMode vide), geler le panneau classique par d\u00e9faut
    const activePanel =
      previousMode === "classique" || previousMode === ""
        ? classicPanel
        : previousMode === "memory"
          ? memoryPanel
          : customPanel;
    if (activePanel) {
      activePanel.classList.add("mode-frozen");
      // S'assurer que le panneau gel\u00e9 est visible
      activePanel.style.display = "block";
      activePanel.classList.add("fade-in");
      activePanel.classList.remove("fade-out");
    }
  } else {
    let incoming, outgoing;

    // D\u00e9terminer quel panneau afficher
    if (mode === "classique") {
      incoming = classicPanel;

      // Activer les bons boutons de dur\u00e9e pour le mode classique
      const classicBtns = classicPanel?.querySelectorAll(".duration-btn");
      if (classicBtns) {
        classicBtns.forEach((btn) => {
          btn.classList.toggle(
            "active",
            parseInt(btn.dataset.duration) === state.selectedDuration,
          );
        });
      }
    } else if (mode === "custom") {
      incoming = customPanel;

      // Rafra\u00eechir l'affichage de la file personnalis\u00e9e
      if (typeof renderCustomQueue === "function") {
        renderCustomQueue();
      }
    } else if (mode === "memory") {
      incoming = memoryPanel;

      // Activer les bons boutons de durée pour le mode mémoire
      const memoryFlashBtns =
        memoryFlashSettings?.querySelectorAll(".duration-btn");
      const memoryProgressiveBtns =
        memoryProgressiveSettings?.querySelectorAll(".duration-btn");
      if (state.memoryType === "flash" && memoryFlashBtns) {
        memoryFlashBtns.forEach((btn) => {
          btn.classList.toggle(
            "active",
            parseInt(btn.dataset.duration) === state.memoryDuration,
          );
        });
      } else if (state.memoryType === "progressive" && memoryProgressiveBtns) {
        memoryProgressiveBtns.forEach((btn) => {
          btn.classList.toggle(
            "active",
            parseInt(btn.dataset.duration) === state.selectedDuration,
          );
        });
      }
    }

    // Activer les bons boutons de durée pour le mode mémoire
    const memoryFlashBtns =
      memoryFlashSettings?.querySelectorAll(".duration-btn");
    const memoryProgressiveBtns =
      memoryProgressiveSettings?.querySelectorAll(".duration-btn");
    if (state.memoryType === "flash" && memoryFlashBtns) {
      memoryFlashBtns.forEach((btn) => {
        btn.classList.toggle(
          "active",
          parseInt(btn.dataset.duration) === state.memoryDuration,
        );
      });
    } else if (state.memoryType === "progressive" && memoryProgressiveBtns) {
      memoryProgressiveBtns.forEach((btn) => {
        btn.classList.toggle(
          "active",
          parseInt(btn.dataset.duration) === state.selectedDuration,
        );
      });
    }
    // D\u00e9terminer quel panneau masquer
    if (previousMode === "classique") {
      outgoing = classicPanel;
    } else if (previousMode === "custom") {
      outgoing = customPanel;
    } else if (previousMode === "memory") {
      outgoing = memoryPanel;
    } else if (previousMode === "" || previousMode === "relax") {
      // Si on vient du mode relax, on masque tous les panneaux
      [classicPanel, customPanel, memoryPanel].forEach((p) => {
        p.classList.remove("mode-frozen");
        p.style.display = "none";
        p.classList.add("fade-out");
      });
      outgoing = null;
    }

    if (!CONFIG.enableAnimations) {
      if (incoming) {
        incoming.style.display = "block";
        incoming.classList.add("fade-in");
        incoming.classList.remove("fade-out");
      }

      if (outgoing && outgoing !== incoming) {
        outgoing.style.display = "none";
        outgoing.classList.remove("fade-in");
        outgoing.classList.add("fade-out");
      }

      if (container) container.style.minHeight = "";
      updateStartButtonState();
      return;
    }

    if (outgoing && outgoing !== incoming && container) {
      container.style.minHeight = outgoing.offsetHeight + "px";
    }

    if (incoming) {
      incoming.style.display = "block";
      incoming.style.visibility = "hidden";
      incoming.classList.add("fade-out");
    }

    requestAnimationFrame(() => {
      if (incoming) {
        incoming.style.visibility = "visible";
        const newHeight = incoming.offsetHeight;
        if (container) container.style.minHeight = newHeight + "px";

        incoming.classList.replace("fade-out", "fade-in");
      }

      if (outgoing && outgoing !== incoming) {
        outgoing.classList.replace("fade-in", "fade-out");
      }

      setTimeout(() => {
        if (state.sessionMode === mode) {
          if (outgoing && outgoing !== incoming) {
            outgoing.style.display = "none";
          }
          if (container) container.style.minHeight = "";
        }
      }, CONFIG.animationDuration);
    });
  }

  updateStartButtonState();

  // Gérer l'état du bouton flou progressif selon le mode
  if (mode === "memory" || mode === "relax") {
    // Désactiver le flou progressif en mode mémoire et relax
    if (progressiveBlurBtn) {
      progressiveBlurBtn.classList.remove("active");
      progressiveBlurBtn.style.opacity = "0.3";
      progressiveBlurBtn.style.pointerEvents = "none";
    }
    if (homeProgressiveBlurBtn) {
      homeProgressiveBlurBtn.classList.remove("active");
      homeProgressiveBlurBtn.style.opacity = "0.3";
      homeProgressiveBlurBtn.style.pointerEvents = "none";
    }
  } else {
    // Réactiver le flou progressif dans les autres modes (classique et custom)
    if (progressiveBlurBtn && !state.isBlurEnabled) {
      progressiveBlurBtn.style.opacity = "1";
      progressiveBlurBtn.style.pointerEvents = "all";
    }
    if (homeProgressiveBlurBtn && !state.isBlurEnabled) {
      homeProgressiveBlurBtn.style.opacity = "1";
      homeProgressiveBlurBtn.style.pointerEvents = "all";
    }
  }
}

function setupCustomModeEvents() {
  if (customAddBtn) {
    customAddBtn.onclick = () => addStepToQueue(false);
  }
  if (addPauseBtn) {
    addPauseBtn.onclick = () => addStepToQueue(true);
  }
}

function formatTime(seconds) {
  if (seconds <= 0) return "0s";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  let parts = [];
  if (h > 0) parts.push(h + "h");
  if (m > 0) parts.push(m + "m");
  if (s > 0 || parts.length === 0) parts.push(s + "s");

  return parts.join(" ");
}

function handleCustomNext() {
  let currentStep = state.customQueue[state.currentStepIndex];

  if (!currentStep) {
    stopTimer();
    showReview();
    return;
  }

  if (state.currentPoseInStep < currentStep.count) {
    state.currentPoseInStep++;
  } else {
    state.currentStepIndex++;
    state.currentPoseInStep = 1;

    if (state.currentStepIndex < state.customQueue.length) {
      const nextStep = state.customQueue[state.currentStepIndex];
      if (nextStep.type === "pause") {
        playSound("pause");
      } else {
        playSound("group");
      }
    }
  }

  if (state.currentStepIndex >= state.customQueue.length) {
    stopTimer();
    showReview();
    return;
  }

  let nextStep = state.customQueue[state.currentStepIndex];
  state.selectedDuration = nextStep.duration;
  state.timeRemaining = nextStep.duration;

  if (nextStep.type === "pose") {
    state.currentIndex = (state.currentIndex + 1) % state.images.length;
    resetTransforms();
    if (state.autoFlip) {
      state.flipHorizontal = Math.random() > 0.5;
      updateFlipButtonUI();
    }
  }

  updateDisplay();
  startTimer();
}

window.updateStep = function (index, field, value) {
  const newValue = parseInt(value);
  if (isNaN(newValue) || newValue < 1) return;

  state.customQueue[index][field] = newValue;

  renderCustomQueue();
};

function makeInputScrubbable(input) {
  if (!input || input.dataset.scrubbed) return;
  input.dataset.scrubbed = "true";

  let startX, startVal;
  input.style.cursor = "ew-resize";

  input.onmousedown = (e) => {
    startX = e.clientX;
    startVal = parseInt(input.value) || 0;

    const onMouseMove = (e) => {
      const delta = Math.round(
        (e.clientX - startX) / UI_CONSTANTS.SCRUB_SENSITIVITY,
      );
      let newVal = startVal + delta;

      const min = input.hasAttribute("min")
        ? parseInt(input.getAttribute("min"))
        : 0;
      const max = input.hasAttribute("max")
        ? parseInt(input.getAttribute("max"))
        : 999;

      if (newVal < min) newVal = min;
      if (newVal > max) newVal = max;

      input.value = newVal;

      // Utilisation de la version debouncée pour éviter trop d'appels
      debouncedChronoSync();

      // On garde ça pour la forme
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "ew-resize";
  };
}

// DRAG

window.dragStep = function (e, index) {
  dragSourceIndex = parseInt(index);
  isDuplicatingWithAlt = e.altKey;

  const row = e.target.closest(".step-item");
  if (row) {
    row.classList.add("dragging");
    e.dataTransfer.setDragImage(row, 20, 20);
  }

  e.dataTransfer.effectAllowed = isDuplicatingWithAlt ? "copy" : "move";
  e.dataTransfer.setData("text/plain", index.toString());
};

window.handleDragOver = function (e, element) {
  e.preventDefault();

  // Mettre à jour l'état de duplication en temps réel
  isDuplicatingWithAlt = e.altKey;
  e.dataTransfer.dropEffect = isDuplicatingWithAlt ? "copy" : "move";

  document.querySelectorAll(".step-item").forEach((el) => {
    if (el !== element)
      el.classList.remove("drop-target-above", "drop-target-below");
  });

  if (element.classList.contains("dragging")) return;

  const rect = element.getBoundingClientRect();
  const relY = e.clientY - rect.top;

  if (relY < rect.height / 2) {
    element.classList.add("drop-target-above");
    element.classList.remove("drop-target-below");
  } else {
    element.classList.add("drop-target-below");
    element.classList.remove("drop-target-above");
  }
};

window.dropStep = function (e, targetIndex) {
  e.preventDefault();

  let sIdx = dragSourceIndex;
  if (sIdx === null) {
    sIdx = parseInt(e.dataTransfer.getData("text/plain"));
  }

  const tIdx = parseInt(targetIndex);
  if (isNaN(sIdx) || isNaN(tIdx)) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const isBelow = e.clientY - rect.top > rect.height / 2;

  let finalIndex = isBelow ? tIdx + 1 : tIdx;

  if (isDuplicatingWithAlt) {
    // Mode duplication : créer une copie de l'élément
    const itemToDuplicate = state.customQueue[sIdx];
    const duplicatedItem = { ...itemToDuplicate };

    // Ajuster l'index final si on duplique après la source
    if (sIdx < finalIndex) {
      finalIndex--;
    }

    state.customQueue.splice(finalIndex, 0, duplicatedItem);
    renderCustomQueue();
  } else {
    // Mode déplacement (comportement par défaut)
    if (sIdx < finalIndex) {
      finalIndex--;
    }

    if (sIdx !== finalIndex) {
      const item = state.customQueue.splice(sIdx, 1)[0];
      state.customQueue.splice(finalIndex, 0, item);
      renderCustomQueue();
    } else {
      handleDragEnd();
    }
  }
};

window.handleDragEnd = function () {
  dragSourceIndex = null;
  isDuplicatingWithAlt = false;
  document.querySelectorAll(".step-item").forEach((el) => {
    el.classList.remove("dragging", "drop-target-above", "drop-target-below");
  });
};

document.addEventListener("DOMContentLoaded", () => {
  // Initialisation de la grille d'arrière-plan
  if (typeof CONFIG !== "undefined" && CONFIG?.backgroundGrid) {
    document.body.classList.add("grid-enabled");
  }

  const topTimeInputs = document.querySelectorAll(
    "#custom-h-input, #custom-m-input, #custom-s-input",
  );
  const topCountInput = document.querySelector("#custom-count-input");

  topTimeInputs.forEach((input) => makeInputScrubbable(input));
  if (topCountInput) makeInputScrubbable(topCountInput);
});

function updateButtonLabels() {
  const hk = CONFIG.HOTKEYS;

  const labels = {
    "autoflip-btn": i18next.t("filters.autoFlipTooltip"),
    "home-progressive-blur-btn": i18next.t("filters.progressiveBlurHome"),
    "flip-horizontal-btn":
      i18next.t("drawing.flipHorizontal") + ` (${hk.FLIP_H})`,
    "grayscale-btn": i18next.t("filters.grayscaleTooltip", {
      hotkey: hk.GRAYSCALE.toUpperCase(),
    }),
    "blur-btn": i18next.t("filters.blurTooltip", {
      hotkey: hk.BLUR.toUpperCase(),
    }),
    "prev-btn": i18next.t("drawing.previousTooltip"),
    "next-btn": i18next.t("drawing.nextTooltip"),
    "play-pause-btn": i18next.t("controls.playPauseTooltip"),
    "toggle-timer-btn": i18next.t("timer.toggleTimerTooltip"),
    "flip-vertical-btn": i18next.t("drawing.flipVertical") + ` (${hk.FLIP_H})`,
    "annotate-btn": i18next.t("drawing.annotateTooltip", {
      hotkey: hk.ANNOTATE.toUpperCase(),
    }),
    "reveal-btn": i18next.t("drawing.openInEagle"),
    "delete-btn": i18next.t("drawing.deleteImage"),
    "stop-btn": i18next.t("timer.endSession"),
    "settings-btn": i18next.t("settings.title"),
  };

  for (const [id, text] of Object.entries(labels)) {
    const btn = document.getElementById(id);
    if (btn) {
      // On met à jour l'attribut que notre script d'infobulle perso surveille
      btn.setAttribute("data-tooltip", text);
      // On s'assure que le 'title' natif est bien supprimé pour éviter la bulle Windows
      btn.removeAttribute("title");
    }
  }
}

// Configuration de l'info-bulle

const tooltip = document.createElement("div");
tooltip.id = "custom-tooltip";
document.body.appendChild(tooltip);

let tooltipTimeout;

document.addEventListener("mouseover", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (!target) return;

  // Ignorer les cellules du timeline (elles ont leur propre système de tooltip)
  if (target.classList.contains("heatmap-cell")) return;

  const text = target.getAttribute("data-tooltip");
  if (!text) return;

  // On utilise CONFIG.tooltipDelay ici
  tooltipTimeout = setTimeout(() => {
    // Formater les raccourcis entre crochets ou parenthèses en gris
    const formattedText = text
      .replace(/\[([^\]]+)\]/g, '<span class="tooltip-shortcut">[$1]</span>')
      .replace(
        /\(([A-Z0-9+]+)\)/g,
        '<span class="tooltip-shortcut">($1)</span>',
      )
      .replace(/( - .+)$/, '<span class="tooltip-shortcut">$1</span>');
    tooltip.innerHTML = formattedText;

    // Détecter si le texte contient un saut de ligne
    if (text.includes("\n")) {
      tooltip.classList.add("multiline");
    } else {
      tooltip.classList.remove("multiline");
    }

    tooltip.style.opacity = "1";

    const rect = target.getBoundingClientRect();

    // Calcul position
    let left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
    let top = rect.top - tooltip.offsetHeight - 8;

    // Anti-débordement
    if (left < 10) left = 10;
    if (left + tooltip.offsetWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltip.offsetWidth - 10;
    }
    if (top < 0) top = rect.bottom + 8;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }, CONFIG.tooltipDelay); // <--- Appel dynamique à la config
});

document.addEventListener("mouseout", (e) => {
  if (e.target.closest("[data-tooltip]")) {
    clearTimeout(tooltipTimeout);
    tooltip.style.opacity = "0";
  }
});

document.addEventListener("mousedown", () => {
  clearTimeout(tooltipTimeout);
  tooltip.style.opacity = "0";
});
// --- Fin infobulle ---

// Fin infobulle

// ================================================================
// MODULE D'ANNOTATION (DESSIN & MESURE)
// ================================================================
// NOTE: Le module de dessin complet a été déplacé dans js/draw.js
// Ce fichier ne contient que les références nécessaires pour la compatibilité

// Exposer les variables globales pour le module de dessin (draw.js)
window.currentImage = currentImage;
window.state = state;
window.togglePlayPause = togglePlayPause;
window.ICONS = ICONS;

// ================================================================
// DRAG & DROP BADGE PAUSE
// ================================================================

/**
 * Initialise le drag & drop du badge pause
 */
function initPauseBadgeDrag() {
  if (!pauseBadge || pauseBadge.dataset.dragInitialized) return;

  pauseBadge.dataset.dragInitialized = "true";

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  pauseBadge.addEventListener("mousedown", (e) => {
    isDragging = true;
    pauseBadge.style.cursor = "grabbing";

    startX = e.clientX;
    startY = e.clientY;

    // Récupérer la position actuelle (relative au parent)
    const rect = pauseBadge.getBoundingClientRect();
    const parentRect = pauseBadge.offsetParent.getBoundingClientRect();

    initialLeft = rect.left - parentRect.left;
    initialTop = rect.top - parentRect.top;

    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    pauseBadge.style.left = initialLeft + dx + "px";
    pauseBadge.style.top = initialTop + dy + "px";

    e.preventDefault();
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      pauseBadge.style.cursor = "grab";
    }
  });
}

// ================================================================
// FONCTIONS UTILITAIRES SUPPLEMENTAIRES
// ================================================================

/**
 * Active le drag & drop sur le badge pause
 */
function initPauseBadgeDrag() {
  if (!pauseBadge) return;

  // Eviter d'ajouter plusieurs fois les listeners
  if (pauseBadge.dataset.dragInitialized) return;
  pauseBadge.dataset.dragInitialized = "true";

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  pauseBadge.style.cursor = "grab";

  pauseBadge.addEventListener("mousedown", (e) => {
    isDragging = true;
    pauseBadge.style.cursor = "grabbing";

    startX = e.clientX;
    startY = e.clientY;

    const rect = pauseBadge.getBoundingClientRect();
    const parentRect = pauseBadge.offsetParent.getBoundingClientRect();

    initialLeft = rect.left - parentRect.left;
    initialTop = rect.top - parentRect.top;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    pauseBadge.style.left = initialLeft + dx + "px";
    pauseBadge.style.top = initialTop + dy + "px";
    pauseBadge.style.transform = "none";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      pauseBadge.style.cursor = "grab";
    }
  });
}
