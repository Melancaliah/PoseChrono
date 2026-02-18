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

    // Historique (limité aux 50 derniers changements, debug seulement)
    if (this._enableLogging) {
      this._history.push({
        key,
        oldValue,
        newValue: value,
        timestamp: Date.now(),
      });
      if (this._history.length > 50) this._history.shift();
    }

    // Notifier les listeners
    this._notify(key, value, oldValue);
  }

  /**
   * Modifie plusieurs valeurs en batch.
   * Tous les changements sont appliqués à l'état avant que les notifications partent,
   * évitant N cycles de notification indépendants.
   */
  setBatch(updates) {
    const changed = [];

    for (const [key, value] of Object.entries(updates)) {
      const oldValue = this._state[key];
      if (oldValue === value) continue;
      this._state[key] = value;
      if (this._enableLogging) {
        console.log(`[State] ${key}: ${oldValue} → ${value}`);
        this._history.push({
          key,
          oldValue,
          newValue: value,
          timestamp: Date.now(),
        });
        if (this._history.length > 50) this._history.shift();
      }
      changed.push({ key, value, oldValue });
    }

    for (const { key, value, oldValue } of changed) {
      this._notify(key, value, oldValue);
    }
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
  imagesSeenMetaById: {},
  reviewDurationsVisible: null,

  // Contrôle du lecteur
  isPlaying: false,
  showSidebar: true,

  // Chronomètrage
  selectedDuration: 60,
  timeRemaining: 60,
  timerInterval: null,
  sessionStartTime: null,
  sessionWasOnline: false,
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

function escapeHtml(input) {
  return callPluginSharedMethod(
    SHARED_DOM_SAFETY_UTILS,
    "escapeHtml",
    [input],
    "dom-safety.escapeHtml",
    () => {
      const str = String(input ?? "");
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
  );
}

function encodeDataToken(input) {
  return callPluginSharedMethod(
    SHARED_DOM_SAFETY_UTILS,
    "encodeDataToken",
    [input],
    "dom-safety.encodeDataToken",
    () => encodeURIComponent(String(input ?? "")),
  );
}

function decodeDataToken(input) {
  return callPluginSharedMethod(
    SHARED_DOM_SAFETY_UTILS,
    "decodeDataToken",
    [input],
    "dom-safety.decodeDataToken",
    () => {
      try {
        return decodeURIComponent(String(input ?? ""));
      } catch (_) {
        return String(input ?? "");
      }
    },
  );
}

function getPlatformAdapter() {
  return callPluginSharedMethod(
    SHARED_PLATFORM_ACCESS_UTILS,
    "getPlatform",
    [],
    "platform-access.getPlatform",
    () => {
      try {
        if (
          typeof window !== "undefined" &&
          typeof window.getPoseChronoPlatform === "function"
        ) {
          return window.getPoseChronoPlatform();
        }
      } catch (_) {}
      return null;
    },
  );
}

const PLATFORM_CAPABILITY_WARNER = (() => {
  try {
    const createCapabilityWarner = getSharedFactory("createCapabilityWarner");
    if (createCapabilityWarner) {
      return createCapabilityWarner({
        getPlatform: () => getPlatformAdapter(),
        prefix: "[Platform]",
        logger: (...args) => console.warn(...args),
      });
    }
  } catch (_) {}
  const warned = new Set();
  return (capabilityKey, operationLabel) => {
    const platform = getPlatformAdapter();
    const capability = String(capabilityKey || "").trim();
    if (!capability) return;
    if (warned.has(capability)) return;

    const hasPlatformCapabilities =
      !!platform &&
      !!platform.capabilities &&
      Object.prototype.hasOwnProperty.call(platform.capabilities, capability);

    if (!hasPlatformCapabilities || platform.capabilities[capability]) return;

    warned.add(capability);
    console.warn(
      `[Platform] Missing capability "${capability}" for "${operationLabel}".`,
    );
  };
})();

function platformWarnMissingCapability(capabilityKey, operationLabel) {
  PLATFORM_CAPABILITY_WARNER(capabilityKey, operationLabel);
}

function platformOpsCallShared(
  methodName,
  operationPath,
  args,
  options,
  fallbackFn,
) {
  const fromShared = callPluginSharedMethod(
    SHARED_PLATFORM_OPS_UTILS,
    methodName,
    [operationPath, Array.isArray(args) ? args : [], options || {}],
    null,
    null,
  );
  if (fromShared !== undefined) return fromShared;
  return typeof fallbackFn === "function" ? fallbackFn() : undefined;
}

function platformNotify(payload) {
  const fromShared = platformOpsCallShared(
    "callAsync",
    "notification.show",
    [payload],
    {
      capability: "notifications",
      operationLabel: "notification.show",
      fallback: undefined,
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  if (!payload) return;
  try {
    if (
      platform &&
      platform.notification &&
      typeof platform.notification.show === "function"
    ) {
      platform.notification.show(payload);
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("notifications", "notification.show");
}

function platformRuntimeOnCreate(handler) {
  if (!handler || typeof handler !== "function") return;
  const fromShared = platformOpsCallShared(
    "call",
    "runtime.onCreate",
    [handler],
    {
      capability: "eagleApi",
      operationLabel: "runtime.onCreate",
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (
      platform &&
      platform.runtime &&
      typeof platform.runtime.onCreate === "function"
    ) {
      platform.runtime.onCreate(handler);
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("eagleApi", "runtime.onCreate");
}

function platformRuntimeOnRun(handler) {
  if (!handler || typeof handler !== "function") return;
  const fromShared = platformOpsCallShared(
    "call",
    "runtime.onRun",
    [handler],
    {
      capability: "eagleApi",
      operationLabel: "runtime.onRun",
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (
      platform &&
      platform.runtime &&
      typeof platform.runtime.onRun === "function"
    ) {
      platform.runtime.onRun(handler);
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("eagleApi", "runtime.onRun");
}

function platformRuntimeOnHide(handler) {
  if (!handler || typeof handler !== "function") return;
  const fromShared = platformOpsCallShared(
    "call",
    "runtime.onHide",
    [handler],
    {
      capability: "eagleApi",
      operationLabel: "runtime.onHide",
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (
      platform &&
      platform.runtime &&
      typeof platform.runtime.onHide === "function"
    ) {
      platform.runtime.onHide(handler);
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("eagleApi", "runtime.onHide");
}

async function platformWindowHide() {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "window.hide",
    [],
    {
      capability: "windowControls",
      operationLabel: "window.hide",
      fallback: undefined,
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.window?.hide) {
      await platform.window.hide();
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("windowControls", "window.hide");
}

async function platformWindowMinimize() {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "window.minimize",
    [],
    {
      capability: "windowControls",
      operationLabel: "window.minimize",
      fallback: undefined,
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.window?.minimize) {
      await platform.window.minimize();
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("windowControls", "window.minimize");
}

async function platformPreferenceSet(key, value) {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "preferences.set",
    [key, value],
    {
      capability: "preferences",
      operationLabel: "preferences.set",
      fallback: undefined,
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.preferences?.set) {
      await platform.preferences.set(key, value);
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("preferences", "preferences.set");
}

async function platformDialogShowMessageBox(options) {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "dialogs.showMessageBox",
    [options],
    {
      capability: "dialogs",
      operationLabel: "dialogs.showMessageBox",
      fallback: { response: 0, checkboxChecked: false },
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.dialogs?.showMessageBox) {
      return await platform.dialogs.showMessageBox(options);
    }
  } catch (_) {}
  platformWarnMissingCapability("dialogs", "dialogs.showMessageBox");
  return { response: 0, checkboxChecked: false };
}

async function platformDialogShowOpenDialog(options) {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "dialogs.showOpenDialog",
    [options],
    {
      capability: "dialogs",
      operationLabel: "dialogs.showOpenDialog",
      fallback: { canceled: true, filePaths: [] },
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.dialogs?.showOpenDialog) {
      return await platform.dialogs.showOpenDialog(options);
    }
  } catch (_) {}
  platformWarnMissingCapability("dialogs", "dialogs.showOpenDialog");
  return { canceled: true, filePaths: [] };
}

async function platformItemGetSelected() {
  const fromShared = await platformOpsCallShared(
    "callArray",
    "item.getSelected",
    [],
    {
      capability: "items",
      operationLabel: "item.getSelected",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.item?.getSelected) {
      return (await platform.item.getSelected()) || [];
    }
  } catch (_) {}
  platformWarnMissingCapability("items", "item.getSelected");
  return [];
}

async function platformFolderGetSelected() {
  const fromShared = await platformOpsCallShared(
    "callArray",
    "folder.getSelected",
    [],
    {
      capability: "folders",
      operationLabel: "folder.getSelected",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.folder?.getSelected) {
      return (await platform.folder.getSelected()) || [];
    }
  } catch (_) {}
  platformWarnMissingCapability("folders", "folder.getSelected");
  return [];
}

async function platformFolderGetAll() {
  const fromShared = await platformOpsCallShared(
    "callArray",
    "folder.getAll",
    [],
    {
      capability: "folders",
      operationLabel: "folder.getAll",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.folder?.getAll) {
      return (await platform.folder.getAll()) || [];
    }
  } catch (_) {}
  return [];
}

async function platformFolderBrowseAndAdd() {
  const platform = getPlatformAdapter();
  try {
    if (platform?.folder?.browseAndAdd) {
      return (await platform.folder.browseAndAdd()) || null;
    }
  } catch (_) {}
  return null;
}

async function platformFolderRemove(folderId) {
  const platform = getPlatformAdapter();
  try {
    if (platform?.folder?.removeFolder) {
      return (await platform.folder.removeFolder(folderId)) || [];
    }
  } catch (_) {}
  return [];
}

async function platformItemGet(query = {}) {
  const fromShared = await platformOpsCallShared(
    "callArray",
    "item.get",
    [query],
    {
      capability: "items",
      operationLabel: "item.get",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.item?.get) {
      return (await platform.item.get(query)) || [];
    }
  } catch (_) {}
  platformWarnMissingCapability("items", "item.get");
  return [];
}

async function platformItemGetById(id) {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "item.getById",
    [id],
    {
      capability: "items",
      operationLabel: "item.getById",
      fallback: null,
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.item?.getById) {
      return await platform.item.getById(id);
    }
  } catch (_) {}
  platformWarnMissingCapability("items", "item.getById");
  return null;
}

async function platformItemOpen(id) {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "item.open",
    [id],
    {
      capability: "items",
      operationLabel: "item.open",
      fallback: undefined,
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.item?.open) {
      await platform.item.open(id);
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("items", "item.open");
}

async function platformItemMoveToTrash(ids) {
  const fromShared = await platformOpsCallShared(
    "callAsync",
    "item.moveToTrash",
    [ids],
    {
      capability: "items",
      operationLabel: "item.moveToTrash",
      fallback: undefined,
    },
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.item?.moveToTrash) {
      await platform.item.moveToTrash(ids);
      return;
    }
  } catch (_) {}
  platformWarnMissingCapability("items", "item.moveToTrash");
}

async function platformTagGroupGet() {
  const fromShared = await platformOpsCallShared(
    "callArray",
    "tagGroup.get",
    [],
    {
      capability: "tags",
      operationLabel: "tagGroup.get",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.tagGroup?.get) {
      return (await platform.tagGroup.get()) || [];
    }
  } catch (_) {}
  platformWarnMissingCapability("tags", "tagGroup.get");
  return [];
}

async function platformTagGet() {
  const fromShared = await platformOpsCallShared(
    "callArray",
    "tag.get",
    [],
    {
      capability: "tags",
      operationLabel: "tag.get",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.tag?.get) {
      return (await platform.tag.get()) || [];
    }
  } catch (_) {}
  platformWarnMissingCapability("tags", "tag.get");
  return [];
}

async function platformClipboardCopyFiles(paths) {
  const fromShared = await platformOpsCallShared(
    "callBoolean",
    "clipboard.copyFiles",
    [paths],
    {
      capability: "clipboard",
      operationLabel: "clipboard.copyFiles",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.clipboard?.copyFiles) {
      await platform.clipboard.copyFiles(paths);
      return true;
    }
  } catch (_) {}
  platformWarnMissingCapability("clipboard", "clipboard.copyFiles");
  return false;
}

async function platformShellShowItemInFolder(filePath) {
  const fromShared = await platformOpsCallShared(
    "callBoolean",
    "shell.showItemInFolder",
    [filePath],
    {
      capability: "shell",
      operationLabel: "shell.showItemInFolder",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.shell?.showItemInFolder) {
      await platform.shell.showItemInFolder(filePath);
      return true;
    }
  } catch (_) {}
  platformWarnMissingCapability("shell", "shell.showItemInFolder");
  return false;
}

async function platformItemShowInFolder(id) {
  const fromShared = await platformOpsCallShared(
    "callBoolean",
    "item.showInFolder",
    [id],
    {
      capability: "items",
      operationLabel: "item.showInFolder",
    },
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.item?.showInFolder) {
      await platform.item.showInFolder(id);
      return true;
    }
  } catch (_) {}
  platformWarnMissingCapability("items", "item.showInFolder");
  return false;
}
let platformWindowToggleFallbackMaximizedState = false;

async function platformWindowToggleMaximize() {
  const fromShared = await callPluginSharedMethod(
    SHARED_PLATFORM_WINDOW_UTILS,
    "toggleMaximize",
    [],
    null,
    null,
  );
  if (fromShared !== undefined) {
    return;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.window) {
      const canMaximize = typeof platform.window.maximize === "function";
      const canUnmaximize = typeof platform.window.unmaximize === "function";
      const canReadMaximized =
        typeof platform.window.isMaximized === "function";

      if (canReadMaximized) {
        try {
          const isMaximized = !!(await platform.window.isMaximized());
          platformWindowToggleFallbackMaximizedState = isMaximized;
          if (isMaximized && canUnmaximize) {
            await platform.window.unmaximize();
            platformWindowToggleFallbackMaximizedState = false;
            return;
          }
          if (!isMaximized && canMaximize) {
            await platform.window.maximize();
            platformWindowToggleFallbackMaximizedState = true;
            return;
          }
        } catch (_) {}
      }

      if (canMaximize && canUnmaximize) {
        if (platformWindowToggleFallbackMaximizedState) {
          await platform.window.unmaximize();
          platformWindowToggleFallbackMaximizedState = false;
        } else {
          await platform.window.maximize();
          platformWindowToggleFallbackMaximizedState = true;
        }
        return;
      }
      if (canMaximize) {
        await platform.window.maximize();
        platformWindowToggleFallbackMaximizedState = true;
        return;
      }
      if (canUnmaximize) {
        await platform.window.unmaximize();
        platformWindowToggleFallbackMaximizedState = false;
        return;
      }
    }
  } catch (_) {}
  platformWarnMissingCapability("windowControls", "window.toggleMaximize");
}

async function platformWindowToggleAlwaysOnTop() {
  const fromShared = await callPluginSharedMethod(
    SHARED_PLATFORM_WINDOW_UTILS,
    "toggleAlwaysOnTop",
    [],
    null,
    null,
  );
  if (fromShared !== undefined) {
    return fromShared;
  }
  const platform = getPlatformAdapter();
  try {
    if (platform?.window) {
      const isOnTop = await (platform.window.isAlwaysOnTop?.() || false);
      if (platform.window.setAlwaysOnTop) {
        await platform.window.setAlwaysOnTop(!isOnTop);
      }
      return !isOnTop;
    }
  } catch (_) {}
  platformWarnMissingCapability("windowControls", "window.toggleAlwaysOnTop");
  return false;
}

function isDesktopStandaloneRuntime() {
  return callPluginSharedMethod(
    SHARED_RUNTIME_MODE_UTILS,
    "isDesktopStandaloneRuntime",
    [],
    null,
    () => {
      try {
        return (
          typeof window !== "undefined" &&
          !!window.poseChronoDesktop &&
          window.poseChronoDesktop.platform === "desktop"
        );
      } catch (_) {
        return false;
      }
    },
  );
}

function getRevealActionI18nKey() {
  return callPluginSharedMethod(
    SHARED_RUNTIME_MODE_UTILS,
    "getRevealActionI18nKey",
    [],
    null,
    () =>
      isDesktopStandaloneRuntime()
        ? "drawing.revealInExplorer"
        : "drawing.openInEagle",
  );
}

function getAppSubtitleI18nKey() {
  return callPluginSharedMethod(
    SHARED_RUNTIME_MODE_UTILS,
    "getAppSubtitleI18nKey",
    [],
    null,
    () =>
      isDesktopStandaloneRuntime() ? "app.subtitleDesktop" : "app.subtitle",
  );
}

function getMediaSourceAnalyzedI18nKey(useFallbackSource = false) {
  return callPluginSharedMethod(
    SHARED_RUNTIME_MODE_UTILS,
    "getMediaSourceAnalyzedI18nKey",
    [!!useFallbackSource],
    null,
    () => {
      if (isDesktopStandaloneRuntime()) {
        return "settings.mediaFoldersAnalyzed";
      }
      return useFallbackSource
        ? "settings.allLibraryAnalyzed"
        : "settings.imagesAnalyzed";
    },
  );
}

function isTagsFeatureAvailable() {
  const platform = getPlatformAdapter();
  return callPluginSharedMethod(
    SHARED_RUNTIME_MODE_UTILS,
    "isTagsFeatureAvailable",
    [platform],
    null,
    () => {
      if (!platform || !platform.capabilities)
        return !isDesktopStandaloneRuntime();
      if (Object.prototype.hasOwnProperty.call(platform.capabilities, "tags")) {
        return !!platform.capabilities.tags;
      }
      return !isDesktopStandaloneRuntime();
    },
  );
}

const PoseChronoStorage = (() => {
  try {
    if (
      typeof window !== "undefined" &&
      window.PoseChronoStorage &&
      typeof window.PoseChronoStorage.configure === "function"
    ) {
      window.PoseChronoStorage.configure({ notify: platformNotify });
      return window.PoseChronoStorage;
    }
    const createStorageAdapter = getSharedFactory("createStorageAdapter");
    if (
      typeof window !== "undefined" &&
      typeof createStorageAdapter === "function"
    ) {
      const storage = createStorageAdapter({
        notify: platformNotify,
      });
      window.PoseChronoStorage = storage;
      return storage;
    }
    if (typeof window !== "undefined" && window.PoseChronoStorage) {
      return window.PoseChronoStorage;
    }
  } catch (_) {}
  return {
    async getJson(_key, fallback = null) {
      return fallback;
    },
    async setJson() {
      return false;
    },
    async remove() {
      return false;
    },
    async migrateFromLocalStorage(_localStorageKey, _dbKey, fallback = null) {
      return fallback;
    },
    status() {
      return { indexedDbAvailable: false, fallbackMode: true };
    },
  };
})();

const STORAGE_SCHEMA_VERSION = 2;
const STORAGE_KEYS = {
  SESSION_PLANS_DB: "session_plans",
  HOTKEYS_DB: "hotkeys",
  TIMELINE_DB: "timeline_data",
};
const DEV_BACKUP_STORAGE_PREFIX = "posechrono-dev-backup:";
const DEV_BACKUP_MAX_ENTRIES = 10;

function isDevStorageBackupEnabled() {
  try {
    if (typeof window === "undefined") return false;
    const search = String(window.location?.search || "");
    if (search.includes("devBackup=1") || search.includes("devAutoBackup=1")) {
      return true;
    }
    const flag = localStorage.getItem("posechrono-dev-auto-backup");
    return flag === "1" || flag === "true";
  } catch (_) {
    return false;
  }
}

function pruneDevStorageBackups() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (
        typeof key === "string" &&
        key.startsWith(DEV_BACKUP_STORAGE_PREFIX)
      ) {
        keys.push(key);
      }
    }
    keys.sort();
    while (keys.length > DEV_BACKUP_MAX_ENTRIES) {
      const oldest = keys.shift();
      try {
        if (oldest) localStorage.removeItem(oldest);
      } catch (_) {}
    }
  } catch (_) {}
}

async function maybeRunDevStorageBackup() {
  if (!isDevStorageBackupEnabled()) return;
  try {
    const [timeline, plans, hotkeys] = await Promise.all([
      PoseChronoStorage.getJson(STORAGE_KEYS.TIMELINE_DB, null),
      PoseChronoStorage.getJson(STORAGE_KEYS.SESSION_PLANS_DB, null),
      PoseChronoStorage.getJson(STORAGE_KEYS.HOTKEYS_DB, null),
    ]);
    const snapshot = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      source: "auto-dev-backup",
      data: {
        timeline,
        plans,
        hotkeys,
      },
    };
    localStorage.setItem(
      `${DEV_BACKUP_STORAGE_PREFIX}${Date.now()}`,
      JSON.stringify(snapshot),
    );
    pruneDevStorageBackups();
    console.info("[DevBackup] Local snapshot saved.");
  } catch (error) {
    console.warn("[DevBackup] Snapshot failed:", error);
  }
}

const UI_PREFS_STORAGE_KEY = "posechrono-ui-prefs";
const UI_PREFS_SCHEMA_VERSION = 1;
const PREFS_PACKAGE_SCHEMA_VERSION = 1;
const PREFS_PACKAGE_SECTION_KEYS = ["ui", "hotkeys", "plans", "timeline"];
const PREF_KEY_PREFERRED_LANGUAGE = "preferredLanguage";
const SYNCRO_MODULE =
  typeof window !== "undefined" ? window.PoseChronoSyncroModule || null : null;
const SYNC_SESSION_MODAL_HELPERS =
  SYNCRO_MODULE?.syncSessionModalHelpers || null;
const SYNC_SESSION_STATUS_UI = SYNCRO_MODULE?.syncSessionStatusUi || null;
const SYNC_RUNTIME_HELPERS = SYNCRO_MODULE?.syncRuntimeHelpers || null;
const SYNC_SESSION_CONTROLLER = SYNCRO_MODULE?.syncSessionController || null;
const PREF_KEY_SYNC_GUEST_ACTION_NOTIFICATIONS =
  SYNCRO_MODULE?.PREF_KEYS?.syncGuestActionNotificationsEnabled ||
  "syncGuestActionNotificationsEnabled";
const PREF_KEY_SOUND_ENABLED_BY_DEFAULT = "soundEnabledByDefault";
const PREF_KEY_SIDEBAR_HIDDEN_BUTTONS = "sidebarHiddenButtons";
const PREF_KEY_SIDEBAR_BUTTON_ORDER = "sidebarButtonOrder";
const PREF_KEY_SIDEBAR_PROGRESSIVE_BLUR_HIDDEN_MIGRATED =
  "sidebarProgressiveBlurHiddenMigrated";
const PREF_KEY_SIDEBAR_PROGRESSIVE_BLUR_ORDER_MIGRATED =
  "sidebarProgressiveBlurOrderMigrated";
const PREF_KEY_SOUND_TICK = "soundTick";
const PREF_KEY_TICK_SOUND_THRESHOLD = "tickSoundThreshold";
const PREF_KEY_SOUND_END = "soundEnd";
const PREF_KEY_SOUND_IMAGE_CHANGE = "soundImageChange";
const PREF_KEY_SOUND_PAUSE = "soundPause";
const PREF_KEY_CONFIRM_DELETE_IMAGE = "confirmDeleteImage";
const LEGACY_UI_PREF_KEYS = {
  REVIEW_DURATIONS_VISIBLE: "posechrono_review_durations_visible",
  GLOBAL_SETTINGS_COLLAPSED: "posechrono-global-settings-collapsed",
};
const LEGACY_DEFAULT_SESSION_MODE_STORAGE_KEY =
  "posechrono-default-session-mode";

function getSharedNamespaceValue(key) {
  try {
    if (typeof window !== "undefined" && window.PoseChronoShared) {
      return window.PoseChronoShared[key] ?? null;
    }
  } catch (_) {}
  return null;
}

const SHARED_PREFS_CORE = getSharedNamespaceValue("prefs");
const SHARED_I18N_UTILS = getSharedNamespaceValue("i18n");

const I18N_LOCALE_FILE_BY_LANG = Object.freeze({
  en: "en.json",
  fr: "fr.json",
  de: "de_DE.json",
  es: "es_ES.json",
  ja: "ja_JP.json",
  ko: "ko_KR.json",
  ru: "ru_RU.json",
  zh: "zh_CN.json",
});

const I18N_LOCALE_TAG_BY_LANG = Object.freeze({
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
  ja: "ja-JP",
  ko: "ko-KR",
  ru: "ru-RU",
  zh: "zh-CN",
});

function isBootTraceForcedByUser() {
  try {
    if (typeof window === "undefined") return false;
    const search = String(window.location?.search || "");
    if (/[?&](bootTrace|boot_trace)=1(?:&|$)/i.test(search)) return true;
    return false;
  } catch (_) {
    return false;
  }
}

const BOOT_TRACE_RUNTIME =
  typeof window !== "undefined" &&
  !!window.poseChronoDesktop &&
  window.poseChronoDesktop.platform === "desktop"
    ? "desktop"
    : "eagle";

const BOOT_TRACE_ENABLED =
  (typeof window !== "undefined" &&
    !!window.poseChronoDesktop &&
    window.poseChronoDesktop.platform === "desktop" &&
    window.poseChronoDesktop.bootTraceEnabled === true) ||
  isBootTraceForcedByUser();
const BOOT_TRACE_START_MS =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
const BOOT_TRACE_HISTORY_KEY = `posechrono-boot-trace-history:${BOOT_TRACE_RUNTIME}`;
const bootTraceStepMarks = new Map();
let bootLoadImagesRunId = 0;

function bootTraceStepDuration(startStep, endStep) {
  const start = bootTraceStepMarks.get(startStep);
  const end = bootTraceStepMarks.get(endStep);
  if (typeof start !== "number" || typeof end !== "number") return null;
  return Math.max(0, end - start);
}

function persistBootTraceSummary(summary) {
  if (!BOOT_TRACE_ENABLED) return;
  if (!summary || typeof summary.totalMs !== "number") return;
  try {
    const raw = localStorage.getItem(BOOT_TRACE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [
      ...list.slice(-2),
      {
        totalMs: Math.round(summary.totalMs),
        createMs: Math.round(summary.createMs || 0),
        translationsMs: Math.round(summary.translationsMs || 0),
        loadImagesMs: Math.round(summary.loadImagesMs || 0),
        ts: Date.now(),
      },
    ];
    localStorage.setItem(BOOT_TRACE_HISTORY_KEY, JSON.stringify(next));
    if (next.length >= 2) {
      const avg = Math.round(
        next.reduce((acc, entry) => acc + (Number(entry.totalMs) || 0), 0) /
          next.length,
      );
      console.log(
        `[BootTrace:summary] ${BOOT_TRACE_RUNTIME} total avg (${next.length} runs): ${avg}ms`,
      );
    }
  } catch (_) {}
}

function reportBootTraceSummary() {
  if (!BOOT_TRACE_ENABLED) return;
  const summary = {
    totalMs: bootTraceStepDuration(
      "runRuntimeLifecycle.start",
      "runRuntimeLifecycle.afterLoadImages",
    ),
    createMs: bootTraceStepDuration(
      "runRuntimeLifecycle.start",
      "runRuntimeLifecycle.afterCreate",
    ),
    initPluginMs: bootTraceStepDuration(
      "runCreateLifecycle.start",
      "runCreateLifecycle.afterInitPlugin",
    ),
    initTimelineMs: bootTraceStepDuration(
      "runCreateLifecycle.afterInitPlugin",
      "runCreateLifecycle.afterInitTimeline",
    ),
    translationsMs: bootTraceStepDuration(
      "runRuntimeLifecycle.afterCreate",
      "runRuntimeLifecycle.afterTranslations",
    ),
    loadImagesMs: bootTraceStepDuration(
      "runRuntimeLifecycle.afterTranslations",
      "runRuntimeLifecycle.afterLoadImages",
    ),
  };

  const hotspots = [
    ["create", summary.createMs],
    ["initPlugin", summary.initPluginMs],
    ["initTimeline", summary.initTimelineMs],
    ["translations", summary.translationsMs],
    ["loadImages", summary.loadImagesMs],
  ]
    .filter(([, ms]) => typeof ms === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, ms]) => `${label}=${Math.round(ms)}ms`)
    .join(", ");

  if (typeof summary.totalMs === "number") {
    console.log(
      `[BootTrace:summary] ${BOOT_TRACE_RUNTIME} total=${Math.round(summary.totalMs)}ms | top: ${hotspots || "n/a"}`,
    );
    persistBootTraceSummary(summary);
  }
}

function bootTrace(step, details = null) {
  if (!BOOT_TRACE_ENABLED) return;
  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const delta = Math.round(nowMs - BOOT_TRACE_START_MS);
  const suffix =
    details && typeof details === "object"
      ? ` ${JSON.stringify(details)}`
      : details
        ? ` ${String(details)}`
        : "";
  bootTraceStepMarks.set(String(step || ""), delta);
  console.log(`[BootTrace:renderer +${delta}ms] ${step}${suffix}`);
  if (step === "runRuntimeLifecycle.afterLoadImages") {
    reportBootTraceSummary();
  }
}

const DRAW_BUNDLE_SCRIPT_ID = "posechrono-draw-bundle-script";
const DRAW_BUNDLE_SRC = "js/draw.bundle.js";
let drawBundleLoadPromise = null;
const TIMELINE_SCRIPT_ID = "posechrono-timeline-script";
const TIMELINE_SCRIPT_SRC = "js/timeline.js";
let timelineModuleLoadPromise = null;
let timelineInitPromise = null;
let timelineInitBootTraceSettled = false;
let postBootPreloadScheduled = false;
const POST_BOOT_PRELOAD_DELAY_MS =
  typeof window !== "undefined" &&
  !!window.poseChronoDesktop &&
  window.poseChronoDesktop.platform === "desktop"
    ? 1400
    : 900;

function getDrawBundleWindow() {
  if (typeof window !== "undefined") return window;
  return typeof globalThis !== "undefined" ? globalThis : null;
}

function isTimelineModuleReady() {
  const root = getDrawBundleWindow();
  if (!root) return false;
  return (
    typeof root.initTimeline === "function" &&
    typeof root.recordSession === "function"
  );
}

function markTimelineBootTraceSuccess() {
  if (timelineInitBootTraceSettled) return;
  timelineInitBootTraceSettled = true;
  bootTrace("runCreateLifecycle.afterInitTimeline");
}

function markTimelineBootTraceError(error) {
  if (timelineInitBootTraceSettled) return;
  timelineInitBootTraceSettled = true;
  bootTrace(
    "runCreateLifecycle.initTimelineError",
    String(error?.message || error),
  );
}

function ensureTimelineModuleLoaded(reason = "manual") {
  if (isTimelineModuleReady()) return Promise.resolve(true);
  if (timelineModuleLoadPromise) return timelineModuleLoadPromise;

  timelineModuleLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("timeline module loader: document unavailable"));
      return;
    }
    const startMs =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    bootTrace("timeline.load.start", { reason });

    const done = (ok, error = null) => {
      if (ok) {
        bootTrace("timeline.load.end", {
          reason,
          durationMs: Math.round(
            (typeof performance !== "undefined" &&
            typeof performance.now === "function"
              ? performance.now()
              : Date.now()) - startMs,
          ),
        });
        resolve(true);
      } else {
        bootTrace("timeline.load.error", {
          reason,
          message: String(error?.message || error || "unknown"),
        });
        reject(error || new Error("timeline module load failed"));
      }
    };

    let script = document.getElementById(TIMELINE_SCRIPT_ID);
    const handleLoad = () => {
      if (script) script.dataset.loaded = "1";
      if (isTimelineModuleReady()) {
        done(true);
      } else {
        done(false, new Error("timeline module loaded without expected API"));
      }
    };
    const handleError = () => {
      done(false, new Error(`cannot load ${TIMELINE_SCRIPT_SRC}`));
    };

    if (script) {
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      if (script.dataset.loaded === "1" || isTimelineModuleReady()) {
        queueMicrotask(handleLoad);
      }
      return;
    }

    script = document.createElement("script");
    script.id = TIMELINE_SCRIPT_ID;
    script.src = TIMELINE_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.body.appendChild(script);
  }).catch((error) => {
    timelineModuleLoadPromise = null;
    throw error;
  });

  return timelineModuleLoadPromise;
}

function ensureTimelineInitialized(reason = "manual") {
  if (timelineInitPromise) return timelineInitPromise;
  timelineInitPromise = ensureTimelineModuleLoaded(reason)
    .then(() => {
      const root = getDrawBundleWindow();
      if (!root || typeof root.initTimeline !== "function") {
        throw new Error("timeline init API unavailable");
      }
      return root.initTimeline();
    })
    .then(() => {
      markTimelineBootTraceSuccess();
      return true;
    })
    .catch((error) => {
      timelineInitPromise = null;
      markTimelineBootTraceError(error);
      throw error;
    });
  return timelineInitPromise;
}

function refreshTimelineViewsSafely(reason = "manual-refresh") {
  void ensureTimelineInitialized(reason)
    .then(() => {
      const root = getDrawBundleWindow();
      if (root && typeof root.refreshTimelineSettings === "function") {
        root.refreshTimelineSettings();
      }
      if (root && typeof root.refreshTimelineReview === "function") {
        root.refreshTimelineReview();
      }
    })
    .catch((error) => {
      console.error("[Timeline] refresh failed:", error);
    });
}

function isDrawBundleReady() {
  const root = getDrawBundleWindow();
  if (!root) return false;
  return (
    typeof root.openDrawingMode === "function" &&
    typeof root.closeDrawingMode === "function" &&
    typeof root.openZoomDrawingMode === "function"
  );
}

function ensureDrawBundleLoaded(reason = "manual") {
  if (isDrawBundleReady()) return Promise.resolve(true);
  if (drawBundleLoadPromise) return drawBundleLoadPromise;

  drawBundleLoadPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined" || !document.body) {
      reject(new Error("draw bundle loader: document unavailable"));
      return;
    }
    const startMs =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    bootTrace("drawBundle.load.start", { reason });

    const done = (ok, error = null) => {
      if (ok) {
        bootTrace("drawBundle.load.end", {
          reason,
          durationMs: Math.round(
            (typeof performance !== "undefined" &&
            typeof performance.now === "function"
              ? performance.now()
              : Date.now()) - startMs,
          ),
        });
        resolve(true);
      } else {
        bootTrace("drawBundle.load.error", {
          reason,
          message: String(error?.message || error || "unknown"),
        });
        reject(error || new Error("draw bundle load failed"));
      }
    };

    let script = document.getElementById(DRAW_BUNDLE_SCRIPT_ID);
    const handleLoad = () => {
      if (script) {
        script.dataset.loaded = "1";
      }
      if (isDrawBundleReady()) {
        done(true);
      } else {
        done(false, new Error("draw bundle loaded without expected API"));
      }
    };
    const handleError = () => {
      done(false, new Error(`cannot load ${DRAW_BUNDLE_SRC}`));
    };

    if (script) {
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      if (script.dataset.loaded === "1" || isDrawBundleReady()) {
        queueMicrotask(handleLoad);
      }
      return;
    }

    script = document.createElement("script");
    script.id = DRAW_BUNDLE_SCRIPT_ID;
    script.src = DRAW_BUNDLE_SRC;
    script.async = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.body.appendChild(script);
  }).catch((error) => {
    drawBundleLoadPromise = null;
    throw error;
  });

  return drawBundleLoadPromise;
}

function schedulePostBootPreloads() {
  if (postBootPreloadScheduled) return;
  postBootPreloadScheduled = true;

  const runPreloadSequence = async () => {
    try {
      if (!isTimelineModuleReady()) {
        await ensureTimelineInitialized("post-boot-preload");
      }
    } catch (error) {
      console.error("[Timeline] post-boot preload failed:", error);
    }

    try {
      if (!isDrawBundleReady()) {
        await ensureDrawBundleLoaded("post-boot-preload");
      }
    } catch (error) {
      console.warn("[Draw] post-boot preload failed:", error);
    }
  };

  const startWhenIdle = () => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(
        () => {
          void runPreloadSequence();
        },
        { timeout: 2500 },
      );
      return;
    }
    setTimeout(() => {
      void runPreloadSequence();
    }, 0);
  };

  setTimeout(startWhenIdle, POST_BOOT_PRELOAD_DELAY_MS);
}

async function openDrawingModeSafely() {
  if (state.isVideoFile || state.isGifFile) return false;
  try {
    await ensureDrawBundleLoaded("open-main");
  } catch (error) {
    console.error("[Draw] open mode failed (bundle):", error);
    return false;
  }
  const root = getDrawBundleWindow();
  if (root && typeof root.openDrawingMode === "function") {
    root.openDrawingMode();
    return true;
  }
  return false;
}

function closeDrawingModeSafely() {
  const root = getDrawBundleWindow();
  if (root && typeof root.closeDrawingMode === "function") {
    root.closeDrawingMode();
    return true;
  }
  return false;
}

async function toggleDrawingModeSafely() {
  const root = getDrawBundleWindow();
  if (
    root &&
    root.isDrawingModeActive &&
    typeof root.closeDrawingMode === "function"
  ) {
    root.closeDrawingMode();
    return;
  }
  await openDrawingModeSafely();
}

async function openZoomDrawingModeSafely(overlay, image) {
  if (!overlay || !image) return false;
  try {
    await ensureDrawBundleLoaded("open-zoom");
  } catch (error) {
    console.error("[Draw] open zoom mode failed (bundle):", error);
    return false;
  }
  const root = getDrawBundleWindow();
  if (root && typeof root.openZoomDrawingMode === "function") {
    root.openZoomDrawingMode(overlay, image);
    return true;
  }
  return false;
}

const MISSING_SHARED_WARNINGS = new Set();

function logMissingShared(capabilityKey) {
  const key = String(capabilityKey || "").trim();
  if (!key || MISSING_SHARED_WARNINGS.has(key)) return;
  MISSING_SHARED_WARNINGS.add(key);
  console.error(`[shared] ${key} unavailable`);
}

function callPluginSharedMethod(
  sharedInstance,
  methodName,
  args,
  missingKey,
  fallbackFn,
) {
  if (sharedInstance && typeof sharedInstance[methodName] === "function") {
    return sharedInstance[methodName](...(Array.isArray(args) ? args : []));
  }
  if (missingKey) logMissingShared(missingKey);
  return typeof fallbackFn === "function" ? fallbackFn() : undefined;
}

const I18N_LOCALE_LANG_ALIASES = Object.freeze({
  en: "en",
  "en-us": "en",
  en_us: "en",
  "en-gb": "en",
  en_gb: "en",
  fr: "fr",
  "fr-fr": "fr",
  fr_fr: "fr",
  de: "de",
  "de-de": "de",
  de_de: "de",
  es: "es",
  "es-es": "es",
  es_es: "es",
  ja: "ja",
  "ja-jp": "ja",
  ja_jp: "ja",
  ko: "ko",
  "ko-kr": "ko",
  ko_kr: "ko",
  ru: "ru",
  "ru-ru": "ru",
  ru_ru: "ru",
  zh: "zh",
  "zh-cn": "zh",
  zh_cn: "zh",
  "zh-hans": "zh",
});

const GLOBAL_SETTINGS_LANGUAGE_OPTIONS = Object.freeze([
  {
    value: "en",
    key: "settings.global.languageEn",
    fallback: "English",
  },
  {
    value: "fr",
    key: "settings.global.languageFr",
    fallback: "Français",
  },
  {
    value: "de",
    key: "settings.global.languageDe",
    fallback: "Deutsch",
  },
  {
    value: "es",
    key: "settings.global.languageEs",
    fallback: "Español",
  },
  {
    value: "ja",
    key: "settings.global.languageJa",
    fallback: "日本語",
  },
  {
    value: "ko",
    key: "settings.global.languageKo",
    fallback: "한국어",
  },
  {
    value: "ru",
    key: "settings.global.languageRu",
    fallback: "Русский",
  },
  {
    value: "zh",
    key: "settings.global.languageZh",
    fallback: "中文 (简体)",
  },
]);

function getGlobalSettingsLanguageOptionConfig(language) {
  const normalizedLanguage = resolveI18nLanguage(language, "en");
  return (
    GLOBAL_SETTINGS_LANGUAGE_OPTIONS.find(
      (entry) => entry.value === normalizedLanguage,
    ) || GLOBAL_SETTINGS_LANGUAGE_OPTIONS[0]
  );
}

function getGlobalSettingsLanguageLabel(language) {
  const config = getGlobalSettingsLanguageOptionConfig(language);
  return getGlobalSettingsText(
    config?.key || "",
    config?.fallback || String(language || "en"),
  );
}

function resolveI18nLanguage(input, fallback = "en") {
  const fallbackToken =
    fallback === null || fallback === undefined
      ? null
      : String(fallback).trim().toLowerCase();

  const normalized = String(input ?? "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
  if (!normalized) return fallbackToken;

  if (
    Object.prototype.hasOwnProperty.call(I18N_LOCALE_FILE_BY_LANG, normalized)
  ) {
    return normalized;
  }

  const alias = I18N_LOCALE_LANG_ALIASES[normalized];
  if (
    alias &&
    Object.prototype.hasOwnProperty.call(I18N_LOCALE_FILE_BY_LANG, alias)
  ) {
    return alias;
  }

  const primary = normalized.split("-")[0];
  if (
    primary &&
    Object.prototype.hasOwnProperty.call(I18N_LOCALE_FILE_BY_LANG, primary)
  ) {
    return primary;
  }

  return fallbackToken;
}

function readPreferredLanguageFromStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return resolveI18nLanguage(parsed[PREF_KEY_PREFERRED_LANGUAGE], null);
  } catch (_) {
    return null;
  }
}

function initSharedFactory(factoryName, createArgs) {
  try {
    const factory = getSharedFactory(factoryName);
    if (!factory) return null;
    if (typeof createArgs === "function") {
      return factory(createArgs());
    }
    return factory();
  } catch (_) {}
  return null;
}

const SHARED_RUNTIME_MODE_UTILS = initSharedFactory(
  "createRuntimeModeUtils",
  () => ({ desktopPlatformValue: "desktop" }),
);

const SHARED_PLATFORM_ACCESS_UTILS = initSharedFactory(
  "createPlatformAccessUtils",
  () => ({ getterName: "getPoseChronoPlatform" }),
);

const SHARED_PREFERENCES_TRANSFER_UTILS = initSharedFactory(
  "createPreferencesTransferUtils",
  () => ({
    document: typeof document !== "undefined" ? document : null,
    URL: typeof URL !== "undefined" ? URL : null,
    Blob: typeof Blob !== "undefined" ? Blob : null,
    FileReader: typeof FileReader !== "undefined" ? FileReader : null,
    setTimeout: typeof setTimeout === "function" ? setTimeout : null,
    logError: (error) => console.error("[Prefs] export download error:", error),
  }),
);

const SHARED_PLATFORM_OPS_UTILS = initSharedFactory(
  "createPlatformOpsUtils",
  () => ({
    getPlatform: () => getPlatformAdapter(),
    warnMissingCapability: (capabilityKey, operationLabel) =>
      platformWarnMissingCapability(capabilityKey, operationLabel),
  }),
);

const SHARED_PLATFORM_WINDOW_UTILS = initSharedFactory(
  "createPlatformWindowUtils",
  () => ({
    getPlatform: () => getPlatformAdapter(),
    warnMissingCapability: (capabilityKey, operationLabel) =>
      platformWarnMissingCapability(capabilityKey, operationLabel),
  }),
);

const SHARED_DOM_SAFETY_UTILS = initSharedFactory("createDomSafetyUtils");
const SHARED_I18N_LOADER_UTILS = initSharedFactory(
  "createI18nLoaderUtils",
  () => ({
    i18nextInstance: typeof i18next !== "undefined" ? i18next : null,
    fetchImpl: typeof fetch === "function" ? fetch.bind(globalThis) : null,
    windowObj: typeof window !== "undefined" ? window : null,
    documentObj: typeof document !== "undefined" ? document : null,
    navigatorObj: typeof navigator !== "undefined" ? navigator : null,
    localesPath: "./_locales/",
    baseLang: "en",
    localeFileByLang: I18N_LOCALE_FILE_BY_LANG,
    localeAliases: I18N_LOCALE_LANG_ALIASES,
    localeGetter: () => {
      const preferredLanguage = readPreferredLanguageFromStorage();
      if (preferredLanguage) return preferredLanguage;
      if (
        typeof window !== "undefined" &&
        typeof window.getLocale === "function"
      ) {
        return window.getLocale();
      }
      return null;
    },
    cacheEnabled: true,
    cachePrefix: "posechrono-i18n-cache",
    cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
    cacheVersion:
      typeof window !== "undefined" &&
      window.poseChronoDesktop &&
      window.poseChronoDesktop.version
        ? `desktop:${String(window.poseChronoDesktop.version)}`
        : "",
  }),
);

function normalizeSessionModeValue(mode, fallback = "classique") {
  return callPluginSharedMethod(
    SHARED_PREFS_CORE,
    "normalizeSessionModeValue",
    [mode, fallback],
    null,
    () => {
      const normalized = String(mode ?? "")
        .trim()
        .toLowerCase();
      const fallbackNormalized = String(fallback ?? "classique")
        .trim()
        .toLowerCase();
      const validModes = new Set(["classique", "custom", "relax", "memory"]);
      return validModes.has(normalized)
        ? normalized
        : validModes.has(fallbackNormalized)
          ? fallbackNormalized
          : "classique";
    },
  );
}

function getDefaultSessionModePrefsUtils() {
  return callPluginSharedMethod(
    SHARED_PREFS_CORE,
    "createDefaultSessionModeUtils",
    [
      {
        normalizeSessionModeValue,
        getValue: () => {
          if (typeof UIPreferences !== "undefined" && UIPreferences) {
            return UIPreferences.get("defaultSessionMode", undefined);
          }
          return undefined;
        },
        setValue: (value) => {
          if (typeof UIPreferences !== "undefined" && UIPreferences) {
            UIPreferences.set("defaultSessionMode", value);
          }
        },
      },
    ],
    null,
    () => null,
  );
}

function translateCountLabel(key, count, fallbackSingular, fallbackPlural) {
  return callPluginSharedMethod(
    SHARED_I18N_UTILS,
    "tCountLabel",
    [
      typeof i18next !== "undefined" ? i18next : null,
      key,
      count,
      fallbackSingular,
      fallbackPlural,
    ],
    null,
    () => {
      const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
      return i18next.t(key, {
        count: safeCount,
        defaultValue: safeCount === 1 ? fallbackSingular : fallbackPlural,
      });
    },
  );
}

function loadPreferredDefaultSessionMode() {
  const fallback = normalizeSessionModeValue(CONFIG?.defaultSessionMode);
  const prefsUtils = getDefaultSessionModePrefsUtils();
  if (prefsUtils?.load) {
    return prefsUtils.load(fallback);
  }
  try {
    if (typeof UIPreferences !== "undefined" && UIPreferences) {
      return normalizeSessionModeValue(
        UIPreferences.get("defaultSessionMode", fallback),
        fallback,
      );
    }
    return fallback;
  } catch (_) {
    return fallback;
  }
}

function savePreferredDefaultSessionMode(mode, persist = true) {
  const prefsUtils = getDefaultSessionModePrefsUtils();
  const next = prefsUtils?.save
    ? prefsUtils.save(mode, persist)
    : normalizeSessionModeValue(mode);
  CONFIG.defaultSessionMode = next;
  if (!prefsUtils?.save) {
    if (!persist) return next;
    try {
      if (typeof UIPreferences !== "undefined" && UIPreferences) {
        UIPreferences.set("defaultSessionMode", next);
      }
    } catch (_) {}
  }
  return next;
}

function normalizeStringArray(input) {
  return callPluginSharedMethod(
    SHARED_PREFS_CORE,
    "normalizeStringArray",
    [input],
    null,
    () => {
      if (!Array.isArray(input)) return [];
      const seen = new Set();
      const out = [];
      input.forEach((entry) => {
        if (typeof entry !== "string") return;
        const key = entry.trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(key);
      });
      return out;
    },
  );
}

function getSharedFactory(factoryName) {
  try {
    if (typeof window !== "undefined") {
      const fn = window.PoseChronoShared?.[factoryName];
      if (typeof fn === "function") return fn;
    }
  } catch (_) {}
  return null;
}

const SHARED_UI_PREFERENCES_FACTORY = getSharedFactory("createUIPreferences");

const UIPreferences = SHARED_UI_PREFERENCES_FACTORY
  ? SHARED_UI_PREFERENCES_FACTORY({
      storage: typeof localStorage !== "undefined" ? localStorage : null,
      storageKey: UI_PREFS_STORAGE_KEY,
      schemaVersion: UI_PREFS_SCHEMA_VERSION,
      legacyKeys: LEGACY_UI_PREF_KEYS,
      legacyDefaultSessionModeStorageKey:
        LEGACY_DEFAULT_SESSION_MODE_STORAGE_KEY,
      normalizeSessionModeValue,
      normalizeStringArray,
      defaults: {
        backgroundGridEnabled:
          typeof CONFIG !== "undefined"
            ? !!(CONFIG?.backgroundGrid ?? false)
            : false,
        titlebarAlwaysVisible:
          typeof CONFIG !== "undefined"
            ? !!(CONFIG?.titlebarAlwaysVisible ?? false)
            : false,
        defaultSessionMode:
          typeof CONFIG !== "undefined"
            ? CONFIG?.defaultSessionMode
            : "classique",
        reviewDurationsVisible: true,
        syncGuestActionNotificationsEnabled: true,
        hotkeysCollapsedCategories: [],
        globalSettingsCollapsedCategories: ["maintenance", "son"],
        preferredLanguage: readPreferredLanguageFromStorage() || "",
        animationsEnabled:
          typeof CONFIG !== "undefined"
            ? !!(CONFIG?.enableAnimations ?? true)
            : true,
        ignoreVideoFiles: false,
        soundEnabledByDefault: true,
        soundTick: true,
        tickSoundThreshold: 15,
        soundEnd: true,
        soundImageChange: true,
        soundPause: true,
        sidebarHiddenButtons: [
          "grid-btn",
          "silhouette-btn",
          "progressive-blur-btn",
        ],
        sidebarButtonOrder: [],
      },
    })
  : {
      init() {},
      get(_key, fallback = undefined) {
        return fallback;
      },
      set(_key, value) {
        return value;
      },
      getStringArray() {
        return [];
      },
      setStringArray(_key, value) {
        return normalizeStringArray(value);
      },
      exportData() {
        return {
          schemaVersion: UI_PREFS_SCHEMA_VERSION,
          backgroundGridEnabled: false,
          titlebarAlwaysVisible: false,
          defaultSessionMode: "classique",
          reviewDurationsVisible: true,
          syncGuestActionNotificationsEnabled: true,
          hotkeysCollapsedCategories: [],
          globalSettingsCollapsedCategories: ["maintenance"],
          preferredLanguage: "",
          animationsEnabled: true,
          ignoreVideoFiles: false,
        };
      },
      importData() {
        return false;
      },
      resetVisualPrefs() {
        return this.exportData();
      },
    };

function createSharedFactoryModule(factoryName, createArgs) {
  const factory = getSharedFactory(factoryName);
  if (!factory) return { factory: null, module: null };
  try {
    const module =
      typeof createArgs === "function"
        ? factory(createArgs())
        : createArgs === undefined
          ? factory()
          : factory(createArgs);
    return { factory, module };
  } catch (_) {
    return { factory, module: null };
  }
}

const SHARED_SESSION_PLAN_MODULE = createSharedFactoryModule(
  "createSessionPlanUtils",
  () => ({
    schemaVersion: STORAGE_SCHEMA_VERSION,
    now: () => Date.now(),
  }),
);
const SHARED_SESSION_PLAN_UTILS_FACTORY = SHARED_SESSION_PLAN_MODULE.factory;
const SESSION_PLAN_UTILS = SHARED_SESSION_PLAN_MODULE.module;
const PLAN_DELETE_BUTTON_ICON = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#ff4545"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>`;

const SHARED_SESSION_METRICS_MODULE = createSharedFactoryModule(
  "createSessionMetricsUtils",
);
const SHARED_SESSION_METRICS_FACTORY = SHARED_SESSION_METRICS_MODULE.factory;
const SESSION_METRICS_UTILS = SHARED_SESSION_METRICS_MODULE.module;

const SHARED_SESSION_CONTROLS_BINDINGS_MODULE = createSharedFactoryModule(
  "createSessionControlsBindingsUtils",
);
const SHARED_SESSION_CONTROLS_BINDINGS_UTILS_FACTORY =
  SHARED_SESSION_CONTROLS_BINDINGS_MODULE.factory;
const SESSION_CONTROLS_BINDINGS_UTILS =
  SHARED_SESSION_CONTROLS_BINDINGS_MODULE.module;

const SHARED_SESSION_SURFACE_INTERACTIONS_BINDINGS_MODULE =
  createSharedFactoryModule("createSessionSurfaceInteractionsBindingsUtils");
const SHARED_SESSION_SURFACE_INTERACTIONS_BINDINGS_UTILS_FACTORY =
  SHARED_SESSION_SURFACE_INTERACTIONS_BINDINGS_MODULE.factory;
const SESSION_SURFACE_INTERACTIONS_BINDINGS_UTILS =
  SHARED_SESSION_SURFACE_INTERACTIONS_BINDINGS_MODULE.module;

const SHARED_CUSTOM_SESSION_MODULE = createSharedFactoryModule(
  "createCustomSessionUtils",
);
const SHARED_CUSTOM_SESSION_UTILS_FACTORY =
  SHARED_CUSTOM_SESSION_MODULE.factory;
const CUSTOM_SESSION_UTILS = SHARED_CUSTOM_SESSION_MODULE.module;

const SHARED_SESSION_FLOW_MODULE = createSharedFactoryModule(
  "createSessionFlowUtils",
);
const SHARED_SESSION_FLOW_UTILS_FACTORY = SHARED_SESSION_FLOW_MODULE.factory;
const SESSION_FLOW_UTILS = SHARED_SESSION_FLOW_MODULE.module;

const SHARED_TIMER_TICK_MODULE = createSharedFactoryModule(
  "createTimerTickUtils",
);
const SHARED_TIMER_TICK_UTILS_FACTORY = SHARED_TIMER_TICK_MODULE.factory;
const TIMER_TICK_UTILS = SHARED_TIMER_TICK_MODULE.module;

const SHARED_REVIEW_SESSION_MODULE = createSharedFactoryModule(
  "createReviewSessionUtils",
);
const SHARED_REVIEW_SESSION_UTILS_FACTORY =
  SHARED_REVIEW_SESSION_MODULE.factory;
const REVIEW_SESSION_UTILS = SHARED_REVIEW_SESSION_MODULE.module;

const SHARED_REVIEW_GRID_MODULE = createSharedFactoryModule(
  "createReviewGridUtils",
);
const SHARED_REVIEW_GRID_UTILS_FACTORY = SHARED_REVIEW_GRID_MODULE.factory;
const REVIEW_GRID_UTILS = SHARED_REVIEW_GRID_MODULE.module;

const SHARED_REVIEW_INTERACTIONS_MODULE = createSharedFactoryModule(
  "createReviewInteractionsUtils",
);
const SHARED_REVIEW_INTERACTIONS_UTILS_FACTORY =
  SHARED_REVIEW_INTERACTIONS_MODULE.factory;
const REVIEW_INTERACTIONS_UTILS = SHARED_REVIEW_INTERACTIONS_MODULE.module;

const SHARED_SCREEN_CONTEXT_MENU_BINDINGS_MODULE = createSharedFactoryModule(
  "createScreenContextMenuBindingsUtils",
);
const SHARED_SCREEN_CONTEXT_MENU_BINDINGS_UTILS_FACTORY =
  SHARED_SCREEN_CONTEXT_MENU_BINDINGS_MODULE.factory;
const SCREEN_CONTEXT_MENU_BINDINGS_UTILS =
  SHARED_SCREEN_CONTEXT_MENU_BINDINGS_MODULE.module;

const SHARED_SESSION_REPLAY_MODULE = createSharedFactoryModule(
  "createSessionReplayUtils",
);
const SHARED_SESSION_REPLAY_UTILS_FACTORY =
  SHARED_SESSION_REPLAY_MODULE.factory;
const SESSION_REPLAY_UTILS = SHARED_SESSION_REPLAY_MODULE.module;

const SHARED_SESSION_MEDIA_MODULE = createSharedFactoryModule(
  "createSessionMediaUtils",
);
const SHARED_SESSION_MEDIA_UTILS_FACTORY = SHARED_SESSION_MEDIA_MODULE.factory;
const SESSION_MEDIA_UTILS = SHARED_SESSION_MEDIA_MODULE.module;

const SHARED_SESSION_MODE_UI_MODULE = createSharedFactoryModule(
  "createSessionModeUiUtils",
);
const SHARED_SESSION_MODE_UI_UTILS_FACTORY =
  SHARED_SESSION_MODE_UI_MODULE.factory;
const SESSION_MODE_UI_UTILS = SHARED_SESSION_MODE_UI_MODULE.module;

const SHARED_SIDEBAR_TOOLTIPS_MODULE = createSharedFactoryModule(
  "createSidebarTooltipsUtils",
);
const SHARED_SIDEBAR_TOOLTIPS_UTILS_FACTORY =
  SHARED_SIDEBAR_TOOLTIPS_MODULE.factory;
const SIDEBAR_TOOLTIPS_UTILS = SHARED_SIDEBAR_TOOLTIPS_MODULE.module;

const SHARED_KEYBOARD_LISTENER_BINDINGS_MODULE = createSharedFactoryModule(
  "createKeyboardListenerBindingsUtils",
);
const SHARED_KEYBOARD_LISTENER_BINDINGS_UTILS_FACTORY =
  SHARED_KEYBOARD_LISTENER_BINDINGS_MODULE.factory;
const KEYBOARD_LISTENER_BINDINGS_UTILS =
  SHARED_KEYBOARD_LISTENER_BINDINGS_MODULE.module;

const SHARED_GLOBAL_KEYBOARD_SHORTCUTS_MODULE = createSharedFactoryModule(
  "createGlobalKeyboardShortcutsUtils",
);
const SHARED_GLOBAL_KEYBOARD_SHORTCUTS_UTILS_FACTORY =
  SHARED_GLOBAL_KEYBOARD_SHORTCUTS_MODULE.factory;
const GLOBAL_KEYBOARD_SHORTCUTS_UTILS =
  SHARED_GLOBAL_KEYBOARD_SHORTCUTS_MODULE.module;

const SHARED_MAIN_KEYBOARD_SHORTCUTS_MODULE = createSharedFactoryModule(
  "createMainKeyboardShortcutsUtils",
);
const SHARED_MAIN_KEYBOARD_SHORTCUTS_UTILS_FACTORY =
  SHARED_MAIN_KEYBOARD_SHORTCUTS_MODULE.factory;
const MAIN_KEYBOARD_SHORTCUTS_UTILS =
  SHARED_MAIN_KEYBOARD_SHORTCUTS_MODULE.module;

const SHARED_SETTINGS_SHORTCUTS_MODULE = createSharedFactoryModule(
  "createSettingsShortcutsUtils",
);
const SHARED_SETTINGS_SHORTCUTS_UTILS_FACTORY =
  SHARED_SETTINGS_SHORTCUTS_MODULE.factory;
const SETTINGS_SHORTCUTS_UTILS = SHARED_SETTINGS_SHORTCUTS_MODULE.module;

const SHARED_SESSION_TIME_FORMAT_MODULE = createSharedFactoryModule(
  "createSessionTimeFormatUtils",
);
const SHARED_SESSION_TIME_FORMAT_UTILS_FACTORY =
  SHARED_SESSION_TIME_FORMAT_MODULE.factory;
const SESSION_TIME_FORMAT_UTILS = SHARED_SESSION_TIME_FORMAT_MODULE.module;

const SHARED_SESSION_DURATION_BUTTONS_MODULE = createSharedFactoryModule(
  "createSessionDurationButtonsUtils",
);
const SHARED_SESSION_DURATION_BUTTONS_UTILS_FACTORY =
  SHARED_SESSION_DURATION_BUTTONS_MODULE.factory;
const SESSION_DURATION_BUTTONS_UTILS =
  SHARED_SESSION_DURATION_BUTTONS_MODULE.module;

const SHARED_SESSION_TIME_INPUT_MODULE = createSharedFactoryModule(
  "createSessionTimeInputUtils",
);
const SHARED_SESSION_TIME_INPUT_UTILS_FACTORY =
  SHARED_SESSION_TIME_INPUT_MODULE.factory;
const SESSION_TIME_INPUT_UTILS = SHARED_SESSION_TIME_INPUT_MODULE.module;

const SHARED_HOTKEYS_UTILS_FACTORY = getSharedFactory("createHotkeysUtils");

let HOTKEYS_UTILS = null;

const SHARED_IMAGE_CONTEXT_MENU_BINDINGS_MODULE = createSharedFactoryModule(
  "createImageContextMenuBindingsUtils",
);
const SHARED_IMAGE_CONTEXT_MENU_BINDINGS_UTILS_FACTORY =
  SHARED_IMAGE_CONTEXT_MENU_BINDINGS_MODULE.factory;
const IMAGE_CONTEXT_MENU_BINDINGS_UTILS =
  SHARED_IMAGE_CONTEXT_MENU_BINDINGS_MODULE.module;

const SHARED_ACTION_BUTTONS_BINDINGS_MODULE = createSharedFactoryModule(
  "createActionButtonsBindingsUtils",
);
const SHARED_ACTION_BUTTONS_BINDINGS_UTILS_FACTORY =
  SHARED_ACTION_BUTTONS_BINDINGS_MODULE.factory;
const ACTION_BUTTONS_BINDINGS_UTILS =
  SHARED_ACTION_BUTTONS_BINDINGS_MODULE.module;

const SHARED_STORAGE_DIAGNOSTICS_UTILS_FACTORY = getSharedFactory(
  "createStorageDiagnosticsUtils",
);
const STORAGE_DIAGNOSTICS_UTILS = SHARED_STORAGE_DIAGNOSTICS_UTILS_FACTORY
  ? SHARED_STORAGE_DIAGNOSTICS_UTILS_FACTORY()
  : null;

const SHARED_SYNC_TRANSPORT_MOCK_FACTORY = getSharedFactory(
  "createSyncTransportMock",
);
const SHARED_SYNC_TRANSPORT_WEBSOCKET_FACTORY = getSharedFactory(
  "createSyncTransportWebSocket",
);
const SHARED_SYNC_TRANSPORT_WEBRTC_FACTORY = getSharedFactory(
  "createSyncTransportWebRTC",
);
const SHARED_SYNC_SESSION_SERVICE_FACTORY = getSharedFactory(
  "createSyncSessionService",
);

function calculateSessionPlanDuration(steps) {
  if (!SESSION_METRICS_UTILS?.calculatePlanDuration) {
    logMissingShared("SESSION_METRICS_UTILS.calculatePlanDuration");
    return 0;
  }
  return SESSION_METRICS_UTILS.calculatePlanDuration(steps);
}

function calculateSessionPlanPoses(steps) {
  if (!SESSION_METRICS_UTILS?.calculatePlanPoses) {
    logMissingShared("SESSION_METRICS_UTILS.calculatePlanPoses");
    return 0;
  }
  return SESSION_METRICS_UTILS.calculatePlanPoses(steps);
}

function clampMemorySessionPosesCount(
  requestedCount,
  imagesCount,
  fallback = 1,
) {
  if (!SESSION_METRICS_UTILS?.clampMemoryPosesCount) {
    logMissingShared("SESSION_METRICS_UTILS.clampMemoryPosesCount");
    return Math.max(1, Math.round(Number(fallback) || 1));
  }
  return SESSION_METRICS_UTILS.clampMemoryPosesCount(
    requestedCount,
    imagesCount,
    fallback,
  );
}

function calculateMemoryTotalDurationSeconds(
  posesCount,
  drawingTime,
  displayTime,
) {
  if (!SESSION_METRICS_UTILS?.calculateMemoryTotalSeconds) {
    logMissingShared("SESSION_METRICS_UTILS.calculateMemoryTotalSeconds");
    return 0;
  }
  return SESSION_METRICS_UTILS.calculateMemoryTotalSeconds(
    posesCount,
    drawingTime,
    displayTime,
  );
}

function findNextCustomPoseStepIndex(queue, fromIndex) {
  if (!CUSTOM_SESSION_UTILS?.findNextPoseStepIndex) {
    logMissingShared("CUSTOM_SESSION_UTILS.findNextPoseStepIndex");
    return -1;
  }
  return CUSTOM_SESSION_UTILS.findNextPoseStepIndex(queue, fromIndex);
}

function findPrevCustomPoseStepIndex(queue, fromIndex) {
  if (!CUSTOM_SESSION_UTILS?.findPrevPoseStepIndex) {
    logMissingShared("CUSTOM_SESSION_UTILS.findPrevPoseStepIndex");
    return -1;
  }
  return CUSTOM_SESSION_UTILS.findPrevPoseStepIndex(queue, fromIndex);
}

function findNextCustomPoseStep(queue, fromIndex) {
  if (!CUSTOM_SESSION_UTILS?.findNextPoseStep) {
    logMissingShared("CUSTOM_SESSION_UTILS.findNextPoseStep");
    return null;
  }
  return CUSTOM_SESSION_UTILS.findNextPoseStep(queue, fromIndex);
}

function hasNextCustomPoseGroup(queue, fromIndex) {
  if (!CUSTOM_SESSION_UTILS?.hasNextPoseGroup) {
    logMissingShared("CUSTOM_SESSION_UTILS.hasNextPoseGroup");
    return false;
  }
  return CUSTOM_SESSION_UTILS.hasNextPoseGroup(queue, fromIndex);
}

function hasPrevCustomPoseGroup(queue, fromIndex) {
  if (!CUSTOM_SESSION_UTILS?.hasPrevPoseGroup) {
    logMissingShared("CUSTOM_SESSION_UTILS.hasPrevPoseGroup");
    return false;
  }
  return CUSTOM_SESSION_UTILS.hasPrevPoseGroup(queue, fromIndex);
}

function getCustomPoseSessionProgress(
  queue,
  currentStepIndex,
  currentPoseInStep,
) {
  if (!CUSTOM_SESSION_UTILS?.getCustomPoseSessionProgress) {
    logMissingShared("CUSTOM_SESSION_UTILS.getCustomPoseSessionProgress");
    return {
      totalPoses: 0,
      globalPoseIndex: 0,
      poseGroupCount: 0,
      showGlobal: false,
    };
  }
  return CUSTOM_SESSION_UTILS.getCustomPoseSessionProgress(
    queue,
    currentStepIndex,
    currentPoseInStep,
  );
}

function calculateCustomTotalRemainingSeconds(
  queue,
  currentStepIndex,
  currentPoseInStep,
  timeRemaining,
) {
  if (!CUSTOM_SESSION_UTILS?.calculateCustomTotalRemainingSeconds) {
    logMissingShared(
      "CUSTOM_SESSION_UTILS.calculateCustomTotalRemainingSeconds",
    );
    return Math.max(0, Number(timeRemaining) || 0);
  }
  return CUSTOM_SESSION_UTILS.calculateCustomTotalRemainingSeconds(
    queue,
    currentStepIndex,
    currentPoseInStep,
    timeRemaining,
  );
}

function getCustomStepTotalSeconds(step) {
  if (!CUSTOM_SESSION_UTILS?.getStepTotalSeconds) {
    logMissingShared("CUSTOM_SESSION_UTILS.getStepTotalSeconds");
    return 0;
  }
  return CUSTOM_SESSION_UTILS.getStepTotalSeconds(step);
}

function calculateCustomQueueTotalSeconds(queue) {
  if (!CUSTOM_SESSION_UTILS?.calculateQueueTotalSeconds) {
    logMissingShared("CUSTOM_SESSION_UTILS.calculateQueueTotalSeconds");
    return 0;
  }
  return CUSTOM_SESSION_UTILS.calculateQueueTotalSeconds(queue);
}

function getCustomStepDurationHms(duration) {
  if (!CUSTOM_SESSION_UTILS?.stepDurationToHms) {
    logMissingShared("CUSTOM_SESSION_UTILS.stepDurationToHms");
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  return CUSTOM_SESSION_UTILS.stepDurationToHms(duration);
}

function getCustomStepDisplayModel(step) {
  if (!CUSTOM_SESSION_UTILS?.getStepDisplayModel) {
    logMissingShared("CUSTOM_SESSION_UTILS.getStepDisplayModel");
    return {
      isPause: false,
      count: 1,
      duration: 0,
      groupTotalSeconds: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }
  return CUSTOM_SESSION_UTILS.getStepDisplayModel(step);
}

function createCustomQueueStep(input) {
  if (!CUSTOM_SESSION_UTILS?.createQueueStep) {
    logMissingShared("CUSTOM_SESSION_UTILS.createQueueStep");
    return null;
  }
  return CUSTOM_SESSION_UTILS.createQueueStep(input);
}

function updateCustomStepDurationFromUnit(step, type, value, minDuration = 1) {
  if (!CUSTOM_SESSION_UTILS?.updateStepDurationFromUnit) {
    logMissingShared("CUSTOM_SESSION_UTILS.updateStepDurationFromUnit");
    return { updated: false, duration: 0 };
  }
  return CUSTOM_SESSION_UTILS.updateStepDurationFromUnit(
    step,
    type,
    value,
    minDuration,
  );
}

function updateCustomStepPositiveIntField(step, field, value, minValue = 1) {
  if (!CUSTOM_SESSION_UTILS?.updateStepPositiveIntField) {
    logMissingShared("CUSTOM_SESSION_UTILS.updateStepPositiveIntField");
    return { updated: false, value: 0 };
  }
  return CUSTOM_SESSION_UTILS.updateStepPositiveIntField(
    step,
    field,
    value,
    minValue,
  );
}

function applyCustomQueueDropOperation(
  queue,
  sourceIndex,
  targetIndex,
  isBelow,
  isDuplicate,
) {
  if (!CUSTOM_SESSION_UTILS?.applyQueueDropOperation) {
    logMissingShared("CUSTOM_SESSION_UTILS.applyQueueDropOperation");
    return { changed: false, finalIndex: -1 };
  }
  return CUSTOM_SESSION_UTILS.applyQueueDropOperation(
    queue,
    sourceIndex,
    targetIndex,
    isBelow,
    isDuplicate,
    (item) => ({ ...item }),
  );
}

function resolveClassicSessionDuration(
  hours,
  minutes,
  seconds,
  activeButtonDuration,
  fallbackSelectedDuration,
) {
  if (!SESSION_FLOW_UTILS?.resolveClassicDuration) {
    logMissingShared("SESSION_FLOW_UTILS.resolveClassicDuration");
    return Math.max(0, Number(fallbackSelectedDuration) || 60);
  }
  return SESSION_FLOW_UTILS.resolveClassicDuration(
    hours,
    minutes,
    seconds,
    activeButtonDuration,
    fallbackSelectedDuration,
  );
}

function resolveSessionModeStartState(input) {
  if (!SESSION_FLOW_UTILS?.resolveSessionStartState) {
    logMissingShared("SESSION_FLOW_UTILS.resolveSessionStartState");
    return {
      isValid: false,
      selectedDuration: 60,
      timeRemaining: 60,
      currentStepIndex: 0,
      currentPoseInStep: 1,
      memoryPosesCount: 1,
      memoryHidden: false,
    };
  }
  return SESSION_FLOW_UTILS.resolveSessionStartState(input);
}

function advanceCustomSessionCursor(
  queue,
  currentStepIndex,
  currentPoseInStep,
) {
  if (!SESSION_FLOW_UTILS?.advanceCustomCursor) {
    logMissingShared("SESSION_FLOW_UTILS.advanceCustomCursor");
    return {
      finished: true,
      currentStepIndex: 0,
      currentPoseInStep: 1,
      nextStep: null,
      enteredNewStep: false,
      soundCue: null,
    };
  }
  return SESSION_FLOW_UTILS.advanceCustomCursor(
    queue,
    currentStepIndex,
    currentPoseInStep,
  );
}

function shouldEndMemorySessionAtIndex(currentIndex, memoryPosesCount) {
  if (!SESSION_FLOW_UTILS?.shouldEndMemorySession) {
    logMissingShared("SESSION_FLOW_UTILS.shouldEndMemorySession");
    return false;
  }
  return SESSION_FLOW_UTILS.shouldEndMemorySession(
    currentIndex,
    memoryPosesCount,
  );
}

function getNextCyclicIndex(currentIndex, length) {
  if (!SESSION_FLOW_UTILS?.nextCyclicIndex) {
    logMissingShared("SESSION_FLOW_UTILS.nextCyclicIndex");
    return 0;
  }
  return SESSION_FLOW_UTILS.nextCyclicIndex(currentIndex, length);
}

function isCustomPauseTick(sessionMode, customQueue, currentStepIndex) {
  if (!TIMER_TICK_UTILS?.isCustomPauseStep) {
    logMissingShared("TIMER_TICK_UTILS.isCustomPauseStep");
    return false;
  }
  return TIMER_TICK_UTILS.isCustomPauseStep(
    sessionMode,
    customQueue,
    currentStepIndex,
  );
}

function shouldEnterMemoryHiddenPhaseTick(input) {
  if (!TIMER_TICK_UTILS?.shouldEnterMemoryHiddenPhase) {
    logMissingShared("TIMER_TICK_UTILS.shouldEnterMemoryHiddenPhase");
    return false;
  }
  return TIMER_TICK_UTILS.shouldEnterMemoryHiddenPhase(input);
}

function shouldAdvanceFromMemoryHiddenPhaseTick(input) {
  if (!TIMER_TICK_UTILS?.shouldAdvanceFromMemoryHiddenPhase) {
    logMissingShared("TIMER_TICK_UTILS.shouldAdvanceFromMemoryHiddenPhase");
    return false;
  }
  return TIMER_TICK_UTILS.shouldAdvanceFromMemoryHiddenPhase(input);
}

function getTickSoundDecision(input) {
  if (!TIMER_TICK_UTILS?.getTickSoundDecision) {
    logMissingShared("TIMER_TICK_UTILS.getTickSoundDecision");
    return { playTick: false, volume: 0 };
  }
  return TIMER_TICK_UTILS.getTickSoundDecision(input);
}

function shouldPlayEndSoundTick(input) {
  if (!TIMER_TICK_UTILS?.shouldPlayEndSound) {
    logMissingShared("TIMER_TICK_UTILS.shouldPlayEndSound");
    return false;
  }
  return TIMER_TICK_UTILS.shouldPlayEndSound(input);
}

function shouldAutoAdvanceOnTimerEndTick(input) {
  if (!TIMER_TICK_UTILS?.shouldAutoAdvanceOnTimerEnd) {
    logMissingShared("TIMER_TICK_UTILS.shouldAutoAdvanceOnTimerEnd");
    return false;
  }
  return TIMER_TICK_UTILS.shouldAutoAdvanceOnTimerEnd(input);
}

function buildReviewSessionDetailsPayload(input) {
  if (!REVIEW_SESSION_UTILS?.buildSessionDetails) {
    logMissingShared("REVIEW_SESSION_UTILS.buildSessionDetails");
    return {
      mode: "classique",
      memoryType: null,
      customQueue: null,
      images: [],
    };
  }
  return REVIEW_SESSION_UTILS.buildSessionDetails(input);
}

function computeReviewSessionSummary(imagesSeen, totalSessionTime) {
  if (!REVIEW_SESSION_UTILS?.computeReviewSummary) {
    logMissingShared("REVIEW_SESSION_UTILS.computeReviewSummary");
    return {
      sessionPoses: 0,
      sessionTime: 0,
      mins: 0,
      secs: 0,
      shouldRecord: false,
    };
  }
  return REVIEW_SESSION_UTILS.computeReviewSummary(
    imagesSeen,
    totalSessionTime,
  );
}

function buildReviewGridItemsModel(imagesSeen, options = {}) {
  if (!REVIEW_GRID_UTILS?.buildReviewGridItems) {
    logMissingShared("REVIEW_GRID_UTILS.buildReviewGridItems");
    return [];
  }
  return REVIEW_GRID_UTILS.buildReviewGridItems(imagesSeen, options);
}

function getReviewDurationToggleCopy(isVisible) {
  if (!REVIEW_INTERACTIONS_UTILS?.getDurationToggleCopy) {
    logMissingShared("REVIEW_INTERACTIONS_UTILS.getDurationToggleCopy");
    return {
      i18nKey: "drawing.showDurations",
      defaultValue: "Show durations",
    };
  }
  return REVIEW_INTERACTIONS_UTILS.getDurationToggleCopy(isVisible);
}

function getReviewDurationToggleTransition(isVisible) {
  if (!REVIEW_INTERACTIONS_UTILS?.getDurationToggleTransition) {
    logMissingShared("REVIEW_INTERACTIONS_UTILS.getDurationToggleTransition");
    return {
      nextVisible: !!isVisible,
      animateHide: false,
      renderBeforeShow: false,
      animateShow: false,
    };
  }
  return REVIEW_INTERACTIONS_UTILS.getDurationToggleTransition(isVisible);
}

function normalizeReviewZoomIndex(index, length) {
  if (!REVIEW_INTERACTIONS_UTILS?.normalizeReviewIndex) {
    logMissingShared("REVIEW_INTERACTIONS_UTILS.normalizeReviewIndex");
    return 0;
  }
  return REVIEW_INTERACTIONS_UTILS.normalizeReviewIndex(index, length);
}

function normalizeSessionReplayLoadOptions(options = {}) {
  if (!SESSION_REPLAY_UTILS?.normalizeLoadSessionOptions) {
    logMissingShared("SESSION_REPLAY_UTILS.normalizeLoadSessionOptions");
    return {
      mode: "classique",
      duration: null,
      customQueue: [],
      memoryType: null,
    };
  }
  return SESSION_REPLAY_UTILS.normalizeLoadSessionOptions(options);
}

function filterSessionMediaItems(items) {
  if (!SESSION_MEDIA_UTILS?.filterByExtensions) {
    logMissingShared("SESSION_MEDIA_UTILS.filterByExtensions");
    return [];
  }
  const ignoreVideo = UIPreferences.get("ignoreVideoFiles", false);
  const extensions = ignoreVideo ? IMAGE_EXTENSIONS : MEDIA_EXTENSIONS;
  return SESSION_MEDIA_UTILS.filterByExtensions(items, extensions);
}

function shuffleSessionMediaItems(items) {
  if (!SESSION_MEDIA_UTILS?.shuffleArray) {
    logMissingShared("SESSION_MEDIA_UTILS.shuffleArray");
    return Array.isArray(items) ? [...items] : [];
  }
  return SESSION_MEDIA_UTILS.shuffleArray(items, Math.random);
}

function countSessionMediaTypes(items) {
  if (!SESSION_MEDIA_UTILS?.countByExtensions) {
    logMissingShared("SESSION_MEDIA_UTILS.countByExtensions");
    return { imageCount: 0, videoCount: 0, totalCount: 0 };
  }
  return SESSION_MEDIA_UTILS.countByExtensions(
    items,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
  );
}

function formatSessionMediaCountLabel(mediaCounts) {
  const translate = (key, fallback = key) => {
    try {
      if (typeof i18next !== "undefined" && typeof i18next.t === "function") {
        return i18next.t(key);
      }
    } catch (_) {}
    return fallback;
  };

  if (!SESSION_MEDIA_UTILS?.formatLoadedMediaCount) {
    logMissingShared("SESSION_MEDIA_UTILS.formatLoadedMediaCount");
    return "";
  }
  return SESSION_MEDIA_UTILS.formatLoadedMediaCount(mediaCounts, translate, {
    imageSingularKey: "settings.imageLoaded",
    imagePluralKey: "settings.imagesLoaded",
    videoSingularKey: "settings.videoLoaded",
    videoPluralKey: "settings.videosLoaded",
    andKey: "misc.and",
  });
}

async function collectFolderIdsWithDescendants(selectedFolders) {
  const ids = [];
  function collectFromObject(folder) {
    if (!folder || typeof folder !== "object") return;
    const id = folder.id;
    if (id !== undefined && id !== null && id !== "") ids.push(id);
    if (Array.isArray(folder.children))
      folder.children.forEach(collectFromObject);
  }
  selectedFolders.forEach(collectFromObject);

  // Si les children n'étaient pas peuplés (seulement les IDs directs récupérés),
  // on utilise l'API plateforme pour obtenir l'arbre complet.
  if (ids.length === selectedFolders.length) {
    try {
      const allFolders = await platformFolderGetAll();
      if (Array.isArray(allFolders) && allFolders.length > 0) {
        const targetIds = new Set(ids);
        ids.length = 0;
        function findAndCollect(folder) {
          if (!folder?.id) return;
          if (targetIds.has(folder.id)) {
            function deepCollect(f) {
              if (!f?.id) return;
              ids.push(f.id);
              if (Array.isArray(f.children)) f.children.forEach(deepCollect);
            }
            deepCollect(folder);
          } else if (Array.isArray(folder.children)) {
            folder.children.forEach(findAndCollect);
          }
        }
        allFolders.forEach(findAndCollect);
        if (ids.length === 0)
          selectedFolders.forEach((f) => f?.id && ids.push(f.id));
      }
    } catch (_) {}
  }
  return ids;
}

async function resolveSessionMediaSelection() {
  const traceStart =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  bootTrace("resolveSessionMediaSelection.start");
  if (!SESSION_MEDIA_UTILS?.resolveMediaSelection) {
    logMissingShared("SESSION_MEDIA_UTILS.resolveMediaSelection");
    return { items: [], source: "unknown" };
  }

  // Pré-calculer les IDs de dossiers (parent + tous descendants) pour Eagle
  let expandedFolderIds = null;
  const selectedFolders = await platformFolderGetSelected();
  if (Array.isArray(selectedFolders) && selectedFolders.length > 0) {
    expandedFolderIds = await collectFolderIdsWithDescendants(selectedFolders);
  }

  const result = await SESSION_MEDIA_UTILS.resolveMediaSelection({
    getSelectedItems: () => platformItemGetSelected(),
    getSelectedFolders: () =>
      Array.isArray(expandedFolderIds) && expandedFolderIds.length > 0
        ? expandedFolderIds.map((id) => ({ id }))
        : Promise.resolve([]),
    queryItems: (query) => platformItemGet(query),
    toFolderIds: (folders) =>
      (Array.isArray(folders) ? folders : [])
        .map((folder) => folder?.id)
        .filter((id) => id !== undefined && id !== null && id !== ""),
  });
  bootTrace("resolveSessionMediaSelection.end", {
    source: result?.source || "unknown",
    totalItems: Array.isArray(result?.items) ? result.items.length : 0,
    durationMs: Math.round(
      (typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - traceStart,
    ),
  });
  return result || { items: [], source: "unknown" };
}

function clampInt(value, min, max, fallback = min) {
  if (!SESSION_PLAN_UTILS?.clampInt) {
    logMissingShared("SESSION_PLAN_UTILS.clampInt");
    return Number(fallback) || 0;
  }
  return SESSION_PLAN_UTILS.clampInt(value, min, max, fallback);
}

function normalizeCustomStep(step) {
  if (!SESSION_PLAN_UTILS?.normalizeCustomStep) {
    logMissingShared("SESSION_PLAN_UTILS.normalizeCustomStep");
    return null;
  }
  return SESSION_PLAN_UTILS.normalizeCustomStep(step);
}

function normalizeSessionPlansPayload(raw) {
  if (!SESSION_PLAN_UTILS?.normalizeSessionPlansPayload) {
    logMissingShared("SESSION_PLAN_UTILS.normalizeSessionPlansPayload");
    return {
      payload: { schemaVersion: STORAGE_SCHEMA_VERSION, plans: [] },
      plans: [],
      repaired: true,
    };
  }
  return SESSION_PLAN_UTILS.normalizeSessionPlansPayload(raw);
}

function getHotkeysUtils() {
  if (HOTKEYS_UTILS || !SHARED_HOTKEYS_UTILS_FACTORY) {
    return HOTKEYS_UTILS;
  }
  const defaultBindings =
    typeof DEFAULT_HOTKEYS !== "undefined" &&
    DEFAULT_HOTKEYS &&
    typeof DEFAULT_HOTKEYS === "object"
      ? DEFAULT_HOTKEYS
      : {};
  const nonCustomizableKeys =
    typeof NON_CUSTOMIZABLE_HOTKEYS !== "undefined" &&
    NON_CUSTOMIZABLE_HOTKEYS instanceof Set
      ? Array.from(NON_CUSTOMIZABLE_HOTKEYS)
      : [];

  HOTKEYS_UTILS = SHARED_HOTKEYS_UTILS_FACTORY({
    schemaVersion: STORAGE_SCHEMA_VERSION,
    defaultBindings,
    nonCustomizableKeys,
  });
  return HOTKEYS_UTILS;
}

function normalizeHotkeysPayload(raw) {
  const hotkeysUtils = getHotkeysUtils();
  if (!hotkeysUtils?.normalizeHotkeysPayload) {
    logMissingShared("HOTKEYS_UTILS.normalizeHotkeysPayload");
    return {
      payload: { schemaVersion: STORAGE_SCHEMA_VERSION, bindings: {} },
      bindings: {},
      repaired: true,
    };
  }
  return hotkeysUtils.normalizeHotkeysPayload(raw);
}

function collectCustomHotkeysBindings() {
  const hotkeysUtils = getHotkeysUtils();
  if (!hotkeysUtils?.collectCustomBindings) {
    logMissingShared("HOTKEYS_UTILS.collectCustomBindings");
    return {};
  }
  return hotkeysUtils.collectCustomBindings(CONFIG.HOTKEYS);
}

function resetConfigHotkeysToDefaults() {
  const hotkeysUtils = getHotkeysUtils();
  if (!hotkeysUtils?.resetBindingsToDefaults) {
    logMissingShared("HOTKEYS_UTILS.resetBindingsToDefaults");
    return;
  }
  hotkeysUtils.resetBindingsToDefaults(CONFIG.HOTKEYS);
}

function enforceNonCustomizableConfigHotkeys() {
  const hotkeysUtils = getHotkeysUtils();
  if (!hotkeysUtils?.enforceNonCustomizableBindings) {
    logMissingShared("HOTKEYS_UTILS.enforceNonCustomizableBindings");
    return;
  }
  hotkeysUtils.enforceNonCustomizableBindings(CONFIG.HOTKEYS);
}

function applyCustomHotkeysToConfig(customBindings, options = {}) {
  const hotkeysUtils = getHotkeysUtils();
  if (!hotkeysUtils?.applyCustomBindings) {
    logMissingShared("HOTKEYS_UTILS.applyCustomBindings");
    return;
  }
  hotkeysUtils.applyCustomBindings(CONFIG.HOTKEYS, customBindings, {
    resetToDefaults: !!options.resetToDefaults,
    enforceNonCustomizable: true,
    requireTargetKey: true,
  });
}

async function runStorageSmokeTests() {
  try {
    const testKey = "__smoke_test__";
    const probe = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      ok: true,
      ts: Date.now(),
    };
    const writeOk = await PoseChronoStorage.setJson(testKey, probe);
    const readBack = await PoseChronoStorage.getJson(testKey, null);
    await PoseChronoStorage.remove(testKey);

    const plansProbe = normalizeSessionPlansPayload([
      { name: "A", steps: [{ type: "pose", count: 2, duration: 30 }] },
      { bad: true },
    ]);
    const hotkeysProbe = normalizeHotkeysPayload({
      FLIP_H: "h",
      UNKNOWN: "x",
      DRAWING_CLOSE: "Space",
    });

    const ok =
      writeOk &&
      readBack &&
      readBack.ok === true &&
      Array.isArray(plansProbe.plans) &&
      plansProbe.plans.length === 1 &&
      hotkeysProbe.bindings.FLIP_H === "h" &&
      !Object.prototype.hasOwnProperty.call(hotkeysProbe.bindings, "UNKNOWN");

    if (!ok) {
      console.warn("[Storage smoke] Some checks failed.", {
        writeOk,
        readBack,
        plansCount: plansProbe.plans.length,
        hotkeysKeys: Object.keys(hotkeysProbe.bindings || {}),
      });
      return false;
    }

    console.log("[Storage smoke] OK");
    return true;
  } catch (e) {
    console.error("[Storage smoke] Error:", e);
    return false;
  }
}

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

    img.src = getRuntimeMediaSourceFromItem(imageData);

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
let pauseTimerDisplay,
  nextStepInfoDisplay,
  folderInfo,
  chooseMediaFolderBtn,
  pauseBadge;

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
let gridSidebarBtn, silhouetteSidebarBtn;

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
let isCustomStepInputScrubbing = false;
let hasCustomStepInputScrubChanges = false;

// Virtual Scroller pour customQueue (initialisé après le DOM loading)
let customQueueScroller = null;

const CONFIG_RUNTIME_DEFAULTS = Object.freeze({
  currentTheme: typeof CONFIG !== "undefined" ? CONFIG.currentTheme : "violet",
  defaultSessionMode:
    typeof CONFIG !== "undefined"
      ? normalizeSessionModeValue(CONFIG.defaultSessionMode)
      : "classique",
  enableFlipAnimation:
    typeof CONFIG !== "undefined" ? !!CONFIG.enableFlipAnimation : false,
  smoothProgress:
    typeof CONFIG !== "undefined" ? !!CONFIG.smoothProgress : false,
  smoothPauseCircle:
    typeof CONFIG !== "undefined" ? !!CONFIG.smoothPauseCircle : true,
  reverseProgressiveBlur:
    typeof CONFIG !== "undefined" ? !!CONFIG.reverseProgressiveBlur : false,
  defaultAutoFlip:
    typeof CONFIG !== "undefined" ? !!CONFIG.defaultAutoFlip : false,
  titlebarAlwaysVisible:
    typeof CONFIG !== "undefined" ? !!CONFIG.titlebarAlwaysVisible : false,
  backgroundGrid:
    typeof CONFIG !== "undefined" ? !!CONFIG.backgroundGrid : true,
});

// ================================================================
// 4. ICÔNES SVG ET RESSOURCES
// ================================================================

const ICONS = {
  SETTINGS:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>',
  GRID_TOGGLE:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M176-120q-19-4-35.5-20.5T120-176l664-664q21 5 36 20.5t21 35.5L176-120Zm-56-252v-112l356-356h112L120-372Zm0-308v-80q0-33 23.5-56.5T200-840h80L120-680Zm560 560 160-160v80q0 33-23.5 56.5T760-120h-80Zm-308 0 468-468v112L484-120H372Z"/></svg>',
  THEME:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M346-140 100-386q-10-10-15-22t-5-25q0-13 5-25t15-22l230-229-106-106 62-65 400 400q10 10 14.5 22t4.5 25q0 13-4.5 25T686-386L440-140q-10 10-22 15t-25 5q-13 0-25-5t-22-15Zm47-506L179-432h428L393-646Zm399 526q-36 0-61-25.5T706-208q0-27 13.5-51t30.5-47l42-54 44 54q16 23 30 47t14 51q0 37-26 62.5T792-120Z"/></svg>',
  KEYBOARD:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-160q-33 0-56.5-23.5T40-240v-480q0-33 23.5-56.5T120-800h720q33 0 56.5 23.5T920-720v480q0 33-23.5 56.5T840-160H120Zm0-80h720v-480H120v480Zm200-40h320v-80H320v80ZM200-420h80v-80h-80v80Zm160 0h80v-80h-80v80Zm160 0h80v-80h-80v80Zm160 0h80v-80h-80v80ZM200-560h80v-80h-80v80Zm160 0h80v-80h-80v80Zm160 0h80v-80h-80v80Zm160 0h80v-80h-80v80ZM120-240v-480 480Z"/></svg>',
  HOME: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"/></svg>',
  PLAY: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
  PAUSE:
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',
  PREV: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>',
  NEXT: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>',
  TIMER_ON:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  TIMER_OFF:
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  SOUND_PREVIEW:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polyline><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>',
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
  TAGS: '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80Zm0-160h320v-80H320v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>',
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
  SIDEBAR:
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm540-453h100v-107H700v107Zm0 186h100v-106H700v106ZM160-240h460v-480H160v480Zm540 0h100v-107H700v107Z"/></svg>',
};

// ================================================================
// 4. ICÔNES SVG ET RESSOURCES
// ================================================================

function getModeDescription(mode) {
  if (!SESSION_MODE_UI_UTILS?.resolveModeDescription) {
    logMissingShared("SESSION_MODE_UI_UTILS.resolveModeDescription");
    return getI18nText("settings.sessionDescription", "Choose a session type");
  }
  return SESSION_MODE_UI_UTILS.resolveModeDescription(
    mode,
    (key, fallback) => getI18nText(key, fallback ?? key),
    {
      fallbackKey: "settings.sessionDescription",
      fallbackText: "Choose a session type",
    },
  );
}

function refreshSessionDescription(mode, targetElement = null) {
  const descEl =
    targetElement || document.getElementById("session-description");
  if (!descEl) return;
  descEl.textContent = getModeDescription(mode);
}

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
  // Custom queue
  customStepsList: null,
  customHInput: null,
  customMInput: null,
  customSInput: null,
  customCountInput: null,

  init() {
    this.durationBtns = document.querySelectorAll(".duration-btn");
    this.inputGroups = document.querySelectorAll(".time-input-group");
    this.hoursInput = document.getElementById("hours-input");
    this.minutesInput = document.getElementById("minutes-input");
    this.secondsInput = document.getElementById("seconds-input");
    // Custom queue — éléments appelés à chaque addStepToQueue / renderCustomQueue
    this.customStepsList = document.getElementById("custom-steps-list");
    this.customHInput = document.getElementById("custom-h-input");
    this.customMInput = document.getElementById("custom-m-input");
    this.customSInput = document.getElementById("custom-s-input");
    this.customCountInput = document.getElementById("custom-count-input");
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

      // Vérifier les préférences par type de son
      if (type === "tick" && !UIPreferences.get(PREF_KEY_SOUND_TICK, true))
        return;
      if (type === "end" && !UIPreferences.get(PREF_KEY_SOUND_END, true))
        return;
      if (
        type === "group" &&
        !UIPreferences.get(PREF_KEY_SOUND_IMAGE_CHANGE, true)
      )
        return;
      if (type === "pause" && !UIPreferences.get(PREF_KEY_SOUND_PAUSE, true))
        return;

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

  // Prévisualiser un son indépendamment du mute global
  preview(type) {
    try {
      const sound = this.sounds[type];
      if (!sound) return;
      sound.currentTime = 0;
      sound.volume = this.volumes[type] ?? 0.5;
      const playPromise = sound.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch (_) {}
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
  const { totalSeconds: total } = readHmsInputValues(
    DOMCache.hoursInput,
    DOMCache.minutesInput,
    DOMCache.secondsInput,
  );

  if (total > 0) {
    clearDurationButtonsActive(DOMCache.durationBtns);
    DOMCache.inputGroups.forEach((g) => g.classList.add("active"));
    state.selectedDuration = total;
    state.timeRemaining = total;
    updateTimerDisplay();
  }
}

// ================================================================
// 6. INITIALISATION
// ================================================================

// Hooks runtime
let createLifecyclePromise = null;
let runLifecyclePromise = null;
let runtimeLifecycleCompleted = false;
let runtimeRunSettingsRefreshPromise = null;

function isSettingsScreenVisibleForRuntimeRefresh() {
  const settingsScreenEl =
    settingsScreen || document.getElementById("settings-screen");
  return !!settingsScreenEl && !settingsScreenEl.classList.contains("hidden");
}

async function refreshSelectionOnRuntimeRunIfNeeded() {
  if (!runtimeLifecycleCompleted) return false;
  if (!isSettingsScreenVisibleForRuntimeRefresh()) return false;
  if (runtimeRunSettingsRefreshPromise) {
    await runtimeRunSettingsRefreshPromise;
    return true;
  }

  runtimeRunSettingsRefreshPromise = (async () => {
    bootTrace("runtimeOnRun.settingsRefresh.start");
    await loadImages();
    bootTrace("runtimeOnRun.settingsRefresh.done");
  })();

  try {
    await runtimeRunSettingsRefreshPromise;
    return true;
  } finally {
    runtimeRunSettingsRefreshPromise = null;
  }
}

async function runCreateLifecycle() {
  if (createLifecyclePromise) return createLifecyclePromise;
  createLifecyclePromise = (async () => {
    bootTrace("runCreateLifecycle.start");
    loadTheme(); // Charger le thème sauvegardé

    // Le backup dev est optionnel: on le lance en tâche de fond pour ne pas bloquer le boot.
    queueMicrotask(() => {
      void Promise.resolve()
        .then(() => maybeRunDevStorageBackup())
        .catch((error) => {
          console.warn("[DevBackup] Background snapshot failed:", error);
        });
    });

    await initPlugin();
    bootTrace("runCreateLifecycle.afterInitPlugin");
    setupTitlebarControls(); // Initialiser les contrôles de la barre de titre
    setupTitlebarHover(); // Initialiser l'affichage au survol de la titlebar

    // Fade in l'interface dès que le shell est prêt (timeline chargée en arrière-plan).
    requestAnimationFrame(() => {
      document.body.style.opacity = "1";
      bootTrace("runCreateLifecycle.bodyVisible");
    });
  })();
  return createLifecyclePromise;
}

async function runRuntimeLifecycle() {
  if (runLifecyclePromise) return runLifecyclePromise;
  runLifecyclePromise = (async () => {
    bootTrace("runRuntimeLifecycle.start");
    await runCreateLifecycle();
    bootTrace("runRuntimeLifecycle.afterCreate");
    // Charger les traductions avant de charger les images
    await loadTranslations();
    bootTrace("runRuntimeLifecycle.afterTranslations");
    await loadImages();
    bootTrace("runRuntimeLifecycle.afterLoadImages");
    schedulePostBootPreloads();
    runtimeLifecycleCompleted = true;
  })();
  return runLifecyclePromise;
}

platformRuntimeOnCreate(async () => {
  await runCreateLifecycle();
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
  const settingsBtn = document.getElementById("titlebar-settings-btn");
  const syncBtn = document.getElementById("titlebar-sync-btn");
  const pinBtn = document.getElementById("pin-btn");
  const syncEnabled = isSyncFeatureEnabled();

  // Apply allowPublicSync config immediately so the CSS can hide the internet
  // button before the sync modal is ever opened.
  if (CONFIG?.SYNC?.allowPublicSync === false) {
    document.body.classList.add("sync-no-public");
  }

  if (syncEnabled) {
    setupSyncSessionModalBindings();
  }

  if (settingsBtn) {
    settingsBtn.innerHTML = ICONS.SETTINGS;
    settingsBtn.addEventListener("click", () => {
      openGlobalSettingsModal();
    });
  }

  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      if (isSyncFeatureEnabled()) openSyncSessionModal();
    });
    if (syncEnabled) {
      syncBtn.classList.remove("hidden");
      syncBtn.removeAttribute("aria-hidden");
      syncBtn.removeAttribute("tabindex");
    } else {
      syncBtn.classList.add("hidden");
      syncBtn.setAttribute("aria-hidden", "true");
      syncBtn.setAttribute("tabindex", "-1");
    }
  }

  updateSyncSessionVisualIndicators(syncSessionServiceState);

  // Fermer la fenetre
  if (closeBtn) {
    closeBtn.addEventListener("click", async () => {
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

      await platformWindowHide();
    });
  }

  // Minimiser la fenetre
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", async () => {
      await platformWindowMinimize();
    });
  }

  // Maximiser / Restaurer la fenetre
  if (maximizeBtn) {
    maximizeBtn.addEventListener("click", async () => {
      await platformWindowToggleMaximize();
    });
  }

  // Pin / Unpin la fenetre (keep always on top)
  if (pinBtn) {
    pinBtn.addEventListener("click", async () => {
      const isOnTop = await platformWindowToggleAlwaysOnTop();
      pinBtn.classList.toggle("active", !!isOnTop);
    });
  }
}

/**
 * Gère l'affichage de la titlebar au survol
 */
let titlebarHoverMousemoveBound = false;
let titlebarHoverHideTimeout = null;

function applyTitlebarVisibilityMode() {
  const titlebar = document.querySelector(".custom-titlebar");
  if (!titlebar) return;

  if (CONFIG.titlebarAlwaysVisible) {
    if (titlebarHoverHideTimeout) {
      clearTimeout(titlebarHoverHideTimeout);
      titlebarHoverHideTimeout = null;
    }
    titlebar.style.opacity = "1";
    return;
  }

  titlebar.style.opacity = "0";
}

function setupTitlebarHover() {
  const titlebar = document.querySelector(".custom-titlebar");
  if (!titlebar) return;

  if (!titlebarHoverMousemoveBound) {
    titlebarHoverMousemoveBound = true;
    window.addEventListener("mousemove", (e) => {
      if (CONFIG.titlebarAlwaysVisible) {
        titlebar.style.opacity = "1";
        return;
      }

      // Annuler le timeout de masquage si en cours
      if (titlebarHoverHideTimeout) {
        clearTimeout(titlebarHoverHideTimeout);
        titlebarHoverHideTimeout = null;
      }

      // Si la souris est dans les 36px du haut, afficher la titlebar
      if (e.clientY <= 36) {
        titlebar.style.opacity = "1";
      } else {
        // Sinon, masquer après un court délai
        titlebarHoverHideTimeout = setTimeout(() => {
          if (!CONFIG.titlebarAlwaysVisible) {
            titlebar.style.opacity = "0";
          }
        }, 10);
      }
    });
  }

  applyTitlebarVisibilityMode();
}

function setTitlebarAlwaysVisible(enabled, persist = true) {
  const next = !!enabled;
  CONFIG.titlebarAlwaysVisible = next;
  applyTitlebarVisibilityMode();
  if (persist) {
    UIPreferences.set("titlebarAlwaysVisible", next);
  }
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

function getI18nText(
  key,
  fallback = "",
  vars = undefined,
  options = undefined,
) {
  const requireInitialized = !!options?.requireInitialized;
  const i18nInstance =
    typeof i18next !== "undefined" &&
    typeof i18next.t === "function" &&
    (!requireInitialized || !!i18next.isInitialized)
      ? i18next
      : null;

  return callPluginSharedMethod(
    SHARED_I18N_UTILS,
    "t",
    [i18nInstance, key, { defaultValue: fallback, ...(vars || {}) }, fallback],
    null,
    () => {
      try {
        if (i18nInstance) {
          return i18nInstance.t(key, {
            defaultValue: fallback,
            ...(vars || {}),
          });
        }
      } catch (_) {}
      return fallback;
    },
  );
}

function createI18nTextGetter(requireInitialized = false) {
  return (key, fallback = "", vars = undefined) =>
    getI18nText(key, fallback, vars, { requireInitialized });
}

function getGlobalSettingsText(key, fallback, vars = undefined) {
  return getI18nText(key, fallback, vars);
}

function decodeHtmlEntities(input) {
  const text = String(input ?? "");
  if (!text || typeof document === "undefined") return text;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

const GLOBAL_SETTINGS_SECTION_ICONS = {
  appearance:
    '<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor"><path d="M480-80q-84 0-158-32T193-193Q112-267 80-341T48-500q0-84 32-158t113-129q74-74 148-106t158-32q84 0 158 32t148 106q81 55 113 129t32 158q0 85-32 159T767-193q-74 74-148 106T480-80Zm0-80q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720q-117 0-198.5 81.5T200-440q0 117 81.5 198.5T480-160Zm0-280Zm0 200q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm40-360h-80v240h80v-240Z"/></svg>',
  general:
    '<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor"><path d="M370-80v-280H80v-240h290v-280h220v280h290v240H590v280H370Zm80-80h60v-280h290v-80H510v-280h-60v280H160v80h290v280Z"/></svg>',
  maintenance:
    '<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor"><path d="M80-120 480-800l400 680H80Zm140-80h520L480-640 220-200Zm260-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-160h-80v160Z"/></svg>',
};

const GLOBAL_SETTINGS_ROLE_CLASSES = {
  toggle: "global-settings-btn-toggle",
  nav: "global-settings-btn-nav",
  primary: "global-settings-btn-primary",
  danger: "global-settings-btn-danger",
};

ICONS.GLOBAL_SETTINGS_ACTIONS = {
  repair:
    '<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor"><path d="M80-120 480-800l400 680H80Zm140-80h520L480-640 220-200Zm260-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-160h-80v160Z"/></svg>',
  section:
    '<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor"><path d="M180-180v-80h600v80H180Zm0-170v-80h420v80H180Zm0-170v-80h600v80H180Zm0-170v-80h420v80H180Z"/></svg>',
  data: '<svg xmlns="http://www.w3.org/2000/svg" height="44px" viewBox="0 -960 960 960" width="14px" fill="currentColor"><path d="M480-120q-151 0-255.5-46.5T120-280v-400q0-66 105.5-113T480-840q149 0 254.5 47T840-680v400q0 67-104.5 113.5T480-120Zm0-479q89 0 179-25.5T760-679q-11-29-100.5-55T480-760q-91 0-178.5 25.5T200-679q14 30 101.5 55T480-599Zm0 199q42 0 81-4t74.5-11.5q35.5-7.5 67-18.5t57.5-25v-120q-26 14-57.5 25t-67 18.5Q600-528 561-524t-81 4q-42 0-82-4t-75.5-11.5Q287-543 256-554t-56-25v120q25 14 56 25t66.5 18.5Q358-408 398-404t82 4Zm0 200q46 0 93.5-7t87.5-18.5q40-11.5 67-26t32-29.5v-98q-26 14-57.5 25t-67 18.5Q600-328 561-324t-81 4q-42 0-82-4t-75.5-11.5Q287-343 256-354t-56-25v99q5 15 31.5 29t66.5 25.5q40 11.5 88 18.5t94 7Z"/></svg>',
  import:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 24 24"><path fill="currentColor" d="M18 15v3H6v-3H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2zm-1-4l-1.41-1.41L13 12.17V4h-2v8.17L8.41 9.59L7 11l5 5l5-5z"/></svg>',
  export:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14px" height="14px" viewBox="0 0 24 24"><path fill="currentColor" d="M18 15v3H6v-3H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2zM7 9l1.41 1.41L11 7.83V16h2V7.83l2.59 2.58L17 9l-5-5l-5 5z"/></svg>',
};

const GLOBAL_SETTINGS_ACTIONS = {
  toggleGrid: {
    id: "global-settings-toggle-grid-btn",
    control: "checkbox",
    i18nKey: "settings.global.hideBackgroundGrid",
    fallback: "Hide background grid",
    span: "full",
  },
  toggleTheme: {
    id: "global-settings-toggle-theme-btn",
    role: "toggle",
    i18nKey: "settings.global.changeTheme",
    fallback: "Change theme",
    icon: ICONS.THEME,
  },
  language: {
    id: "global-settings-language-select",
    control: "language-select",
    i18nKey: "settings.global.language",
    fallback: "Language",
    span: "full",
  },
  titlebarAlwaysVisible: {
    id: "global-settings-titlebar-always-visible-btn",
    control: "checkbox",
    i18nKey: "settings.global.titlebarAlwaysVisible",
    fallback: "Titlebar always visible",
    span: "full",
  },
  showProgressBar: {
    id: "global-settings-show-progress-bar-btn",
    control: "checkbox",
    i18nKey: "settings.global.showProgressBar",
    fallback: "Show progress bar",
    span: "full",
  },
  openHotkeys: {
    id: "global-settings-open-hotkeys-btn",
    role: "nav",
    i18nKey: "settings.global.openHotkeys",
    fallback: "Configure hotkeys",
    icon: ICONS.KEYBOARD,
  },
  defaultSessionMode: {
    id: "global-settings-default-mode-group",
    control: "mode-toggle",
    i18nKey: "settings.global.defaultSessionMode",
    fallback: "Default session mode",
    span: "full",
  },
  toggleAnimations: {
    id: "global-settings-toggle-animations-btn",
    control: "checkbox",
    i18nKey: "settings.global.disableAnimations",
    fallback: "Disable animations",
    span: "full",
  },
  ignoreVideoFiles: {
    id: "global-settings-ignore-video-files-btn",
    control: "checkbox",
    i18nKey: "settings.global.ignoreVideoFiles",
    fallback: "Ignore video files",
    span: "full",
  },
  confirmDeleteImage: {
    id: "global-settings-confirm-delete-image-btn",
    control: "checkbox",
    i18nKey: "settings.global.confirmDeleteImage",
    fallback: "Ask confirmation before deleting an image",
    span: "full",
  },
  enableOnlineSync: {
    id: "global-settings-enable-online-sync-btn",
    control: "checkbox",
    i18nKey: "settings.global.enableOnlineSync",
    fallback: "Enable online synchronization",
    span: "full",
  },
  soundEnabledByDefault: {
    id: "global-settings-sound-enabled-by-default-btn",
    control: "checkbox",
    i18nKey: "settings.global.soundEnabledByDefault",
    fallback: "Enable sound by default",
    span: "full",
  },
  soundTick: {
    id: "global-settings-sound-tick-btn",
    control: "checkbox",
    i18nKey: "settings.global.soundTick",
    fallback: "Countdown sound",
    span: "full",
  },
  tickSoundThreshold: {
    id: "global-settings-tick-threshold-group",
    control: "threshold-toggle",
    i18nKey: "settings.global.tickSoundThreshold",
    fallback: "Countdown trigger",
    span: "full",
  },
  soundEnd: {
    id: "global-settings-sound-end-btn",
    control: "checkbox",
    i18nKey: "settings.global.soundEnd",
    fallback: "End-of-timer sound",
    span: "full",
    playPreview: "end",
  },
  soundImageChange: {
    id: "global-settings-sound-image-change-btn",
    control: "checkbox",
    i18nKey: "settings.global.soundImageChange",
    fallback: "Pose group change sound",
    span: "full",
    playPreview: "group",
  },
  soundPause: {
    id: "global-settings-sound-pause-btn",
    control: "checkbox",
    i18nKey: "settings.global.soundPause",
    fallback: "Break arrival sound",
    span: "full",
    playPreview: "pause",
  },
  exportPrefs: {
    id: "global-settings-export-prefs-btn",
    role: "primary",
    i18nKey: "settings.global.exportPreferences",
    fallback: "Export",
    icon: ICONS.GLOBAL_SETTINGS_ACTIONS.export,
  },
  importPrefs: {
    id: "global-settings-import-prefs-btn",
    role: "primary",
    i18nKey: "settings.global.importPreferences",
    fallback: "Import",
    icon: ICONS.GLOBAL_SETTINGS_ACTIONS.import,
  },
  repairStorage: {
    id: "global-settings-repair-storage-btn",
    role: "danger",
    i18nKey: "settings.global.repairStorage",
    fallback: "Repair storage",
    tooltipKey: "settings.repairStorageTooltip",
    icon: ICONS.GLOBAL_SETTINGS_ACTIONS.repair,
  },
};

// Boutons masquables de la sidebar (groupe, id, clé i18n, fallback)
const SIDEBAR_CONFIGURABLE_BUTTONS = [
  {
    id: "sound-btn",
    group: "standalone",
    i18nKey: "sidebar.config.soundBtn",
    fallback: "Son",
  },
  {
    id: "flip-horizontal-btn",
    group: "filters",
    i18nKey: "sidebar.config.flipH",
    fallback: "Miroir horizontal",
  },
  {
    id: "flip-vertical-btn",
    group: "filters",
    i18nKey: "sidebar.config.flipV",
    fallback: "Miroir vertical",
  },
  {
    id: "grayscale-btn",
    group: "filters",
    i18nKey: "sidebar.config.grayscale",
    fallback: "Noir et blanc",
  },
  {
    id: "silhouette-btn",
    group: "filters",
    i18nKey: "sidebar.config.silhouette",
    fallback: "Silhouette",
  },
  {
    id: "blur-btn",
    group: "filters",
    i18nKey: "sidebar.config.blur",
    fallback: "Flou / Focus",
  },
  {
    id: "progressive-blur-btn",
    group: "filters",
    i18nKey: "filters.progressiveBlur",
    fallback: "Flou progressif",
  },
  {
    id: "grid-btn",
    group: "filters",
    i18nKey: "sidebar.config.grid",
    fallback: "Grille",
  },
  {
    id: "annotate-btn",
    group: "filters",
    i18nKey: "sidebar.config.annotate",
    fallback: "Dessin",
  },
  {
    id: "reveal-btn",
    group: "actions",
    i18nKey: "sidebar.config.reveal",
    fallback: "Ouvrir dans Eagle",
  },
  {
    id: "delete-btn",
    group: "actions",
    i18nKey: "sidebar.config.delete",
    fallback: "Supprimer",
  },
  {
    id: "stop-btn",
    group: "secondary",
    i18nKey: "sidebar.config.stop",
    fallback: "Terminer session",
  },
  {
    id: "settings-btn",
    group: "secondary",
    i18nKey: "sidebar.config.settings",
    fallback: "Accueil",
  },
];
const SIDEBAR_DEFAULT_BUTTON_ORDER = SIDEBAR_CONFIGURABLE_BUTTONS.map(
  ({ id }) => id,
);
const SIDEBAR_CONFIGURABLE_BUTTONS_BY_ID = Object.freeze(
  Object.fromEntries(
    SIDEBAR_CONFIGURABLE_BUTTONS.map((button) => [button.id, button]),
  ),
);
const SIDEBAR_CONFIGURABLE_BUTTON_IDS = new Set(SIDEBAR_DEFAULT_BUTTON_ORDER);

// Config compacte: change l'ordre des sections et des options ici.
const GLOBAL_SETTINGS_SECTIONS = [
  {
    id: "general",
    titleKey: "settings.global.general",
    fallbackTitle: "General",
    icon: "",
    actionGroups: [
      {
        columns: 1,
        align: "start",
        items: [
          { type: "action", key: "defaultSessionMode" },
          { type: "action", key: "ignoreVideoFiles" },
          { type: "action", key: "confirmDeleteImage" },
          { type: "action", key: "enableOnlineSync" },
        ],
      },
      {
        align: "end",
        items: [{ type: "action", key: "openHotkeys" }],
      },
    ],
  },
  {
    id: "appearance",
    titleKey: "settings.global.appearance",
    fallbackTitle: "Appearance",
    icon: "",
    actionGroups: [
      {
        columns: 1,
        align: "start",
        items: [
          { type: "action", key: "titlebarAlwaysVisible" },
          { type: "action", key: "showProgressBar" },
          { type: "action", key: "toggleGrid" },
          { type: "action", key: "toggleAnimations" },
          { type: "action", key: "toggleTheme" },
          { type: "action", key: "language" },
        ],
      },
    ],
  },
  {
    id: "son",
    titleKey: "settings.global.soundSection",
    fallbackTitle: "Sound",
    icon: "",
    actionGroups: [
      {
        columns: 1,
        align: "start",
        items: [
          { type: "action", key: "soundEnabledByDefault" },
          { type: "separator" },
          { type: "action", key: "soundTick" },
          {
            type: "action",
            key: "tickSoundThreshold",
            className: "gs-child-setting",
          },
          { type: "action", key: "soundEnd" },
          { type: "action", key: "soundImageChange" },
          { type: "action", key: "soundPause" },
        ],
      },
    ],
  },
  {
    id: "maintenance",
    titleKey: "settings.global.maintenance",
    fallbackTitle: "Maintenance",
    icon: "",
    sectionClassName: "global-settings-section-maintenance",
    actionGroups: [
      {
        className:
          "global-settings-actions-inline global-settings-actions-segmented",
        align: "start",
        items: [
          {
            type: "label",
            icon: ICONS.SETTINGS,
            i18nKey: "settings.global.preferencesSection",
            text: "Preferences",
            className: "global-settings-action-label-muted",
          },
          { type: "action", key: "exportPrefs" },
          { type: "action", key: "importPrefs" },
        ],
      },
      {
        className: "global-settings-actions-inline",
        align: "start",
        items: [
          {
            type: "label",
            icon: ICONS.GLOBAL_SETTINGS_ACTIONS.data,
            i18nKey: "settings.global.dataSection",
            text: "Data",
            className: "global-settings-action-label-muted",
          },
          { type: "action", key: "repairStorage" },
        ],
      },
    ],
    hint: {
      className: "global-settings-maintenance-note",
      i18nKey: "settings.global.maintenanceHint",
      fallback:
        "Maintenance actions may remove local data. Consider exporting a backup first.",
    },
  },
];

function setGlobalSettingsButtonLabel(buttonEl, text) {
  if (!buttonEl) return;
  const labelEl = buttonEl.querySelector(".global-settings-btn-text");
  if (labelEl) {
    labelEl.textContent = text;
    return;
  }
  buttonEl.textContent = text;
}

function renderGlobalSettingsSections() {
  const container = document.getElementById("global-settings-sections");
  if (!container) return;

  container.innerHTML = "";

  const hasRenderableIcon = (iconMarkup) => {
    if (iconMarkup === null || iconMarkup === undefined) return false;
    if (typeof iconMarkup === "string") return iconMarkup.trim().length > 0;
    return true;
  };

  const buildHintElement = (hintConfig) => {
    if (!hintConfig) return null;
    const hintEl = document.createElement("div");
    hintEl.className = hintConfig.className || "global-settings-hint";
    if (hintConfig.i18nKey) {
      hintEl.setAttribute("data-i18n", hintConfig.i18nKey);
    }
    hintEl.textContent = getGlobalSettingsText(
      hintConfig.i18nKey || "",
      hintConfig.fallback || "",
    );
    return hintEl;
  };

  const normalizeActionGroup = (groupConfig) => {
    if (Array.isArray(groupConfig)) {
      return {
        items: groupConfig.map((entry) =>
          typeof entry === "string" ? { type: "action", key: entry } : entry,
        ),
      };
    }
    if (groupConfig && typeof groupConfig === "object") {
      const rawItems = Array.isArray(groupConfig.items)
        ? groupConfig.items
        : Array.isArray(groupConfig.actions)
          ? groupConfig.actions
          : [];
      return {
        ...groupConfig,
        items: rawItems.map((entry) =>
          typeof entry === "string" ? { type: "action", key: entry } : entry,
        ),
      };
    }
    return { items: [] };
  };

  const buildActionsElement = (groupConfig) => {
    const normalizedGroup = normalizeActionGroup(groupConfig);
    const actionsEl = document.createElement("div");
    actionsEl.className = `global-settings-actions${
      normalizedGroup.className ? ` ${normalizedGroup.className}` : ""
    }`;

    if (
      Number.isInteger(normalizedGroup.columns) &&
      normalizedGroup.columns >= 1 &&
      normalizedGroup.columns <= 4
    ) {
      actionsEl.style.setProperty(
        "--gs-columns",
        String(normalizedGroup.columns),
      );
    }
    if (normalizedGroup.align) {
      actionsEl.classList.add(`is-align-${normalizedGroup.align}`);
    }

    const applyGridSpan = (el, item, actionConfig = {}) => {
      const spanValue =
        item?.span ?? actionConfig.span ?? (item?.fullRow ? "full" : null);
      if (spanValue === "full") {
        el.style.gridColumn = "1 / -1";
      } else if (Number.isInteger(spanValue) && spanValue > 0) {
        el.style.gridColumn = `span ${spanValue}`;
      }
    };

    (normalizedGroup.items || []).forEach((item) => {
      const itemType = item?.type || "action";

      if (itemType === "separator") {
        const separatorEl = document.createElement("div");
        separatorEl.className = `global-settings-action-separator${
          item.className ? ` ${item.className}` : ""
        }`;
        actionsEl.appendChild(separatorEl);
        return;
      }

      if (itemType === "break") {
        const breakEl = document.createElement("div");
        breakEl.className = "global-settings-action-break";
        actionsEl.appendChild(breakEl);
        return;
      }

      if (itemType === "label") {
        const labelEl = document.createElement("div");
        labelEl.className = `global-settings-action-label${
          item.className ? ` ${item.className}` : ""
        }`;
        if (hasRenderableIcon(item.icon)) {
          const labelIcon = document.createElement("span");
          labelIcon.className = "global-settings-action-label-icon";
          labelIcon.setAttribute("aria-hidden", "true");
          labelIcon.innerHTML = item.icon;
          labelEl.appendChild(labelIcon);
        }
        const labelText = document.createElement("span");
        if (item.i18nKey) {
          labelText.setAttribute("data-i18n", item.i18nKey);
        }
        labelText.textContent = getGlobalSettingsText(
          item.i18nKey || "",
          item.text || "",
        );
        labelEl.appendChild(labelText);
        actionsEl.appendChild(labelEl);
        return;
      }

      const actionKey = item?.key || item?.actionKey || item?.id;
      const actionConfig = GLOBAL_SETTINGS_ACTIONS[actionKey];
      if (!actionConfig) return;
      if (actionConfig.desktopOnly && !isDesktopStandaloneRuntime()) return;

      if (actionConfig.control === "language-select") {
        const languageRow = document.createElement("div");
        languageRow.className = `global-settings-language-row ${
          actionConfig.className || ""
        } ${item.className || ""}`.trim();

        const languageLabel = document.createElement("span");
        const languageLabelId = `${actionConfig.id}-label`;
        languageLabel.id = languageLabelId;
        languageLabel.className =
          "global-settings-language-label hotkey-description";
        if (actionConfig.i18nKey) {
          languageLabel.setAttribute("data-i18n", actionConfig.i18nKey);
        }
        languageLabel.textContent = getGlobalSettingsText(
          actionConfig.i18nKey || "",
          actionConfig.fallback || "",
        );
        languageRow.appendChild(languageLabel);

        const activeLanguage = resolveI18nLanguage(
          typeof i18next !== "undefined"
            ? i18next.resolvedLanguage || i18next.language
            : UIPreferences.get(
                PREF_KEY_PREFERRED_LANGUAGE,
                readPreferredLanguageFromStorage() || "en",
              ),
          "en",
        );
        const activeLanguageConfig =
          getGlobalSettingsLanguageOptionConfig(activeLanguage);

        const languageSelect = document.createElement("div");
        languageSelect.id = actionConfig.id;
        languageSelect.className = "global-settings-language-select";
        languageSelect.dataset.value = activeLanguageConfig.value;

        const languageTrigger = document.createElement("button");
        languageTrigger.type = "button";
        languageTrigger.className = "global-settings-language-trigger";
        languageTrigger.setAttribute("aria-haspopup", "listbox");
        languageTrigger.setAttribute("aria-expanded", "false");
        languageTrigger.setAttribute("aria-labelledby", languageLabelId);

        const languageValue = document.createElement("span");
        languageValue.className = "global-settings-language-value";
        if (activeLanguageConfig.key) {
          languageValue.setAttribute("data-i18n", activeLanguageConfig.key);
        }
        languageValue.textContent = getGlobalSettingsText(
          activeLanguageConfig.key || "",
          activeLanguageConfig.fallback || activeLanguageConfig.value,
        );
        languageTrigger.appendChild(languageValue);

        const languageChevron = document.createElement("span");
        languageChevron.className = "global-settings-language-chevron";
        languageChevron.setAttribute("aria-hidden", "true");
        languageChevron.textContent = "▾";
        languageTrigger.appendChild(languageChevron);

        const languageMenu = document.createElement("div");
        languageMenu.className = "global-settings-language-menu";
        languageMenu.setAttribute("role", "listbox");
        languageMenu.hidden = true;

        GLOBAL_SETTINGS_LANGUAGE_OPTIONS.forEach((languageOption) => {
          const optionEl = document.createElement("button");
          optionEl.type = "button";
          optionEl.className = "global-settings-language-option";
          optionEl.dataset.lang = languageOption.value;
          optionEl.setAttribute("role", "option");
          optionEl.setAttribute(
            "aria-selected",
            languageOption.value === activeLanguageConfig.value
              ? "true"
              : "false",
          );
          if (languageOption.key) {
            optionEl.setAttribute("data-i18n", languageOption.key);
          }
          optionEl.textContent = getGlobalSettingsText(
            languageOption.key || "",
            languageOption.fallback || languageOption.value,
          );
          languageMenu.appendChild(optionEl);
        });

        languageSelect.appendChild(languageTrigger);
        languageSelect.appendChild(languageMenu);
        languageRow.appendChild(languageSelect);
        applyGridSpan(languageRow, item, actionConfig);
        actionsEl.appendChild(languageRow);
        return;
      }

      if (actionConfig.control === "mode-toggle") {
        const modeRow = document.createElement("div");
        modeRow.className = `global-settings-mode-toggle-row ${
          actionConfig.className || ""
        } ${item.className || ""}`.trim();

        const modeLabel = document.createElement("span");
        modeLabel.className = "global-settings-mode-label hotkey-description";
        if (actionConfig.i18nKey) {
          modeLabel.setAttribute("data-i18n", actionConfig.i18nKey);
        }
        modeLabel.textContent = getGlobalSettingsText(
          actionConfig.i18nKey || "",
          actionConfig.fallback || "",
        );
        modeRow.appendChild(modeLabel);

        const modeGroup = document.createElement("div");
        modeGroup.id = actionConfig.id;
        modeGroup.className =
          "hotkeys-search-toggle global-settings-mode-toggle";
        modeGroup.setAttribute("role", "group");
        modeGroup.setAttribute("aria-label", modeLabel.textContent);

        const sessionModes = [
          {
            value: "classique",
            key: "modes.classic.title",
            fallback: "Classic",
          },
          { value: "custom", key: "modes.custom.title", fallback: "Custom" },
          { value: "relax", key: "modes.relax.title", fallback: "Relax" },
          { value: "memory", key: "modes.memory.title", fallback: "Memory" },
        ];

        sessionModes.forEach((modeConfig) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "search-toggle-btn";
          btn.dataset.mode = modeConfig.value;
          btn.setAttribute("data-i18n", modeConfig.key);
          btn.textContent = getGlobalSettingsText(
            modeConfig.key,
            modeConfig.fallback,
          );
          modeGroup.appendChild(btn);
        });

        modeRow.appendChild(modeGroup);
        applyGridSpan(modeRow, item, actionConfig);
        actionsEl.appendChild(modeRow);
        return;
      }

      if (actionConfig.control === "threshold-toggle") {
        const thresholdRow = document.createElement("div");
        thresholdRow.className = `global-settings-mode-toggle-row ${
          actionConfig.className || ""
        } ${item.className || ""}`.trim();

        const thresholdLabel = document.createElement("span");
        thresholdLabel.className =
          "global-settings-mode-label hotkey-description";
        if (actionConfig.i18nKey) {
          thresholdLabel.setAttribute("data-i18n", actionConfig.i18nKey);
        }
        thresholdLabel.textContent = getGlobalSettingsText(
          actionConfig.i18nKey || "",
          actionConfig.fallback || "",
        );
        thresholdRow.appendChild(thresholdLabel);

        const thresholdGroup = document.createElement("div");
        thresholdGroup.id = actionConfig.id;
        thresholdGroup.className =
          "hotkeys-search-toggle global-settings-mode-toggle";
        thresholdGroup.setAttribute("role", "group");
        thresholdGroup.setAttribute("aria-label", thresholdLabel.textContent);

        [5, 10, 15, 20].forEach((seconds) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "search-toggle-btn";
          btn.dataset.threshold = String(seconds);
          btn.textContent = `${seconds}s`;
          thresholdGroup.appendChild(btn);
        });

        thresholdRow.appendChild(thresholdGroup);
        applyGridSpan(thresholdRow, item, actionConfig);
        actionsEl.appendChild(thresholdRow);
        return;
      }

      if (actionConfig.control === "checkbox") {
        const checkboxWrap = document.createElement("label");
        checkboxWrap.className = `global-settings-checkbox-item ${
          actionConfig.className || ""
        } ${item.className || ""}`.trim();
        checkboxWrap.setAttribute("for", actionConfig.id);
        if (actionConfig.tooltipKey) {
          checkboxWrap.setAttribute(
            "data-i18n-tooltip",
            actionConfig.tooltipKey,
          );
        }

        const checkboxEl = document.createElement("input");
        checkboxEl.type = "checkbox";
        checkboxEl.id = actionConfig.id;
        checkboxEl.className = "global-settings-checkbox-input checkbox-simple";
        checkboxWrap.appendChild(checkboxEl);

        const iconMarkup =
          Object.prototype.hasOwnProperty.call(item, "icon") &&
          item.icon !== undefined
            ? item.icon
            : actionConfig.icon;
        if (hasRenderableIcon(iconMarkup)) {
          const iconEl = document.createElement("span");
          iconEl.className = "global-settings-checkbox-icon";
          iconEl.setAttribute("aria-hidden", "true");
          iconEl.innerHTML = iconMarkup;
          checkboxWrap.appendChild(iconEl);
        }

        const textEl = document.createElement("span");
        textEl.className = "hotkey-description";
        if (actionConfig.i18nKey) {
          textEl.setAttribute("data-i18n", actionConfig.i18nKey);
        }
        textEl.textContent = getGlobalSettingsText(
          actionConfig.i18nKey || "",
          actionConfig.fallback || "",
        );
        checkboxWrap.appendChild(textEl);

        if (actionConfig.playPreview) {
          const previewBtn = document.createElement("button");
          previewBtn.type = "button";
          previewBtn.className = "global-settings-sound-preview-btn";
          previewBtn.setAttribute("aria-label", "Preview sound");
          previewBtn.innerHTML = ICONS.SOUND_PREVIEW;
          const previewType = actionConfig.playPreview;
          previewBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            SoundManager.preview(previewType);
          });
          checkboxWrap.appendChild(previewBtn);
        }

        applyGridSpan(checkboxWrap, item, actionConfig);
        actionsEl.appendChild(checkboxWrap);
        return;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = actionConfig.id;
      const roleClass = GLOBAL_SETTINGS_ROLE_CLASSES[actionConfig.role] || "";
      btn.className = `option-toggle-btn global-settings-btn ${roleClass} ${
        actionConfig.className || ""
      } ${item.className || ""}`.trim();
      if (actionConfig.tooltipKey) {
        btn.setAttribute("data-i18n-tooltip", actionConfig.tooltipKey);
      }

      const iconMarkup =
        Object.prototype.hasOwnProperty.call(item, "icon") &&
        item.icon !== undefined
          ? item.icon
          : actionConfig.icon;
      if (hasRenderableIcon(iconMarkup)) {
        const iconEl = document.createElement("span");
        iconEl.className = `global-settings-btn-icon${
          actionConfig.dynamicLabel ? " is-dynamic-label-icon" : ""
        }`;
        iconEl.setAttribute("aria-hidden", "true");
        iconEl.innerHTML = iconMarkup;
        btn.appendChild(iconEl);
      }

      const textEl = document.createElement("span");
      textEl.className = "global-settings-btn-text";
      if (actionConfig.i18nKey && !actionConfig.dynamicLabel) {
        textEl.setAttribute("data-i18n", actionConfig.i18nKey);
      }
      textEl.textContent = actionConfig.dynamicLabel
        ? actionConfig.fallback || ""
        : getGlobalSettingsText(
            actionConfig.i18nKey || "",
            actionConfig.fallback || "",
          );
      btn.appendChild(textEl);

      applyGridSpan(btn, item, actionConfig);
      actionsEl.appendChild(btn);
    });

    return actionsEl;
  };

  GLOBAL_SETTINGS_SECTIONS.forEach((sectionConfig) => {
    const sectionEl = document.createElement("section");
    sectionEl.className = `hotkey-category global-settings-section${
      sectionConfig.sectionClassName ? ` ${sectionConfig.sectionClassName}` : ""
    }`;
    sectionEl.dataset.category = sectionConfig.id;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className =
      "hotkey-category-toggle global-settings-category-toggle";
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.tabIndex = -1;

    const titleWrap = document.createElement("span");
    titleWrap.className = "hotkey-category-title";

    const sectionIconMarkup =
      typeof sectionConfig.icon === "string" &&
      Object.prototype.hasOwnProperty.call(
        GLOBAL_SETTINGS_SECTION_ICONS,
        sectionConfig.icon,
      )
        ? GLOBAL_SETTINGS_SECTION_ICONS[sectionConfig.icon]
        : sectionConfig.icon;

    const titleText = document.createElement("span");
    if (sectionConfig.titleKey) {
      titleText.setAttribute("data-i18n", sectionConfig.titleKey);
    }
    titleText.textContent = getGlobalSettingsText(
      sectionConfig.titleKey || "",
      sectionConfig.fallbackTitle || "",
    );

    if (hasRenderableIcon(sectionIconMarkup)) {
      const iconWrap = document.createElement("span");
      iconWrap.className = "global-settings-section-icon";
      iconWrap.setAttribute("aria-hidden", "true");
      iconWrap.innerHTML = sectionIconMarkup;
      titleWrap.appendChild(iconWrap);
    }
    titleWrap.appendChild(titleText);

    const chevron = document.createElement("span");
    chevron.className = "hotkey-category-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";

    toggleBtn.appendChild(titleWrap);
    toggleBtn.appendChild(chevron);
    sectionEl.appendChild(toggleBtn);

    const listEl = document.createElement("div");
    listEl.className = "hotkey-list global-settings-list";

    const actionGroups =
      Array.isArray(sectionConfig.actionGroups) &&
      sectionConfig.actionGroups.length
        ? sectionConfig.actionGroups
        : [sectionConfig.actions || []];

    const hintsByGroup = new Map();
    (sectionConfig.hintsBetweenGroups || []).forEach((hintConfig) => {
      if (typeof hintConfig?.afterGroupIndex !== "number") return;
      hintsByGroup.set(hintConfig.afterGroupIndex, hintConfig);
    });

    actionGroups.forEach((groupActions, groupIndex) => {
      listEl.appendChild(buildActionsElement(groupActions));
      const inlineHint = buildHintElement(hintsByGroup.get(groupIndex));
      if (inlineHint) {
        listEl.appendChild(inlineHint);
      }
    });

    const sectionHint = buildHintElement(sectionConfig.hint);
    if (sectionHint) {
      listEl.appendChild(sectionHint);
    }

    if (sectionConfig.storageStatus) {
      const statusEl = document.createElement("div");
      statusEl.id = "global-settings-storage-status";
      statusEl.className = "global-settings-storage-status";
      listEl.appendChild(statusEl);
    }

    sectionEl.appendChild(listEl);
    container.appendChild(sectionEl);
  });
}

const globalSettingsCollapsed = new Set();
const globalSettingsTransitionState = new WeakMap();
const globalSettingsTransitionDurationMs = 240;
let globalSettingsExpandScrollRafId = 0;
let globalSettingsCategoriesInitialized = false;
let globalSettingsFocusTrapHandler = null;
let globalSettingsLastFocusedElement = null;
let globalSettingsStatusRequestId = 0;

function loadGlobalSettingsCollapsedState() {
  const arr = UIPreferences.getStringArray("globalSettingsCollapsedCategories");
  globalSettingsCollapsed.clear();
  arr.forEach((entry) => {
    globalSettingsCollapsed.add(entry);
  });
}

function saveGlobalSettingsCollapsedState() {
  UIPreferences.setStringArray(
    "globalSettingsCollapsedCategories",
    Array.from(globalSettingsCollapsed),
  );
}

function clearGlobalSettingsCategoryTransition(listEl) {
  const prev = globalSettingsTransitionState.get(listEl);
  if (!prev) return;
  if (typeof prev.onEnd === "function") {
    listEl.removeEventListener("transitionend", prev.onEnd);
  }
  if (prev.timeoutId) {
    clearTimeout(prev.timeoutId);
  }
  globalSettingsTransitionState.delete(listEl);
}

function setGlobalSettingsCategoryCollapsed(
  categoryEl,
  collapsed,
  persist = true,
  animate = true,
) {
  if (!categoryEl) return;
  const key = categoryEl.dataset.category;
  const listEl = categoryEl.querySelector(".global-settings-list");
  const toggleEl = categoryEl.querySelector(".global-settings-category-toggle");
  if (!key || !listEl || !toggleEl) return;

  const isCollapsed = categoryEl.classList.contains("collapsed");
  const wantsCollapsed = !!collapsed;

  if (persist) {
    if (wantsCollapsed) {
      globalSettingsCollapsed.add(key);
    } else {
      globalSettingsCollapsed.delete(key);
    }
    saveGlobalSettingsCollapsedState();
  }

  if (isCollapsed === wantsCollapsed) {
    toggleEl.setAttribute("aria-expanded", wantsCollapsed ? "false" : "true");
    return;
  }

  clearGlobalSettingsCategoryTransition(listEl);
  categoryEl.classList.toggle("collapsed", wantsCollapsed);
  toggleEl.setAttribute("aria-expanded", wantsCollapsed ? "false" : "true");

  if (!animate) {
    if (wantsCollapsed) {
      listEl.hidden = true;
      listEl.style.maxHeight = "0px";
      listEl.style.opacity = "0";
      listEl.style.transform = "translateY(-8px)";
      listEl.style.overflow = "hidden";
      listEl.style.pointerEvents = "none";
    } else {
      listEl.hidden = false;
      listEl.style.maxHeight = "none";
      listEl.style.opacity = "1";
      listEl.style.transform = "translateY(0)";
      listEl.style.overflow = "visible";
      listEl.style.pointerEvents = "auto";
    }
    return;
  }

  if (wantsCollapsed) {
    listEl.hidden = false;
    const startHeight = Math.max(listEl.scrollHeight, 1);
    listEl.style.maxHeight = `${startHeight}px`;
    listEl.style.opacity = "1";
    listEl.style.transform = "translateY(0)";
    listEl.style.overflow = "hidden";
    listEl.style.pointerEvents = "none";
    void listEl.offsetHeight;
    listEl.style.maxHeight = "0px";
    listEl.style.opacity = "0";
    listEl.style.transform = "translateY(-8px)";

    const finish = () => {
      clearGlobalSettingsCategoryTransition(listEl);
      listEl.hidden = true;
      listEl.style.maxHeight = "0px";
      listEl.style.overflow = "hidden";
      listEl.style.pointerEvents = "none";
    };

    const onEnd = (evt) => {
      if (evt.propertyName !== "max-height") return;
      finish();
    };
    listEl.addEventListener("transitionend", onEnd);
    const timeoutId = setTimeout(
      finish,
      globalSettingsTransitionDurationMs + 80,
    );
    globalSettingsTransitionState.set(listEl, { onEnd, timeoutId });
    return;
  }

  listEl.hidden = false;
  listEl.style.maxHeight = "0px";
  listEl.style.opacity = "0";
  listEl.style.transform = "translateY(-8px)";
  listEl.style.overflow = "hidden";
  listEl.style.pointerEvents = "none";
  void listEl.offsetHeight;
  const targetHeight = Math.max(listEl.scrollHeight, 1);
  listEl.style.maxHeight = `${targetHeight}px`;
  listEl.style.opacity = "1";
  listEl.style.transform = "translateY(0)";

  const finish = () => {
    clearGlobalSettingsCategoryTransition(listEl);
    if (!categoryEl.classList.contains("collapsed")) {
      listEl.style.maxHeight = "none";
      listEl.style.overflow = "visible";
      listEl.style.pointerEvents = "auto";
    }
  };

  const onEnd = (evt) => {
    if (evt.propertyName !== "max-height") return;
    finish();
  };
  listEl.addEventListener("transitionend", onEnd);
  const timeoutId = setTimeout(finish, globalSettingsTransitionDurationMs + 80);
  globalSettingsTransitionState.set(listEl, { onEnd, timeoutId });
}

function smoothScrollExpandedGlobalSettingsCategory(categoryEl) {
  if (!categoryEl) return;
  const listEl = categoryEl.querySelector(".global-settings-list");
  const modal = document.getElementById("global-settings-modal");
  const scrollContainer =
    categoryEl.closest(".global-settings-modal-body") ||
    modal?.querySelector(".global-settings-modal-body");

  if (!listEl || !scrollContainer) {
    categoryEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  const margin = 12;
  const containerRect = scrollContainer.getBoundingClientRect();
  const categoryRect = categoryEl.getBoundingClientRect();
  const currentListHeight = Math.max(listEl.getBoundingClientRect().height, 0);
  const categoryHeaderHeight = Math.max(categoryRect.height - currentListHeight, 0);
  const projectedBottom =
    categoryRect.top + categoryHeaderHeight + Math.max(listEl.scrollHeight, 0);

  const topSafe = containerRect.top + margin;
  const bottomSafe = containerRect.bottom - margin;
  let delta = 0;

  if (categoryRect.top < topSafe) {
    delta = categoryRect.top - topSafe;
  } else if (projectedBottom > bottomSafe) {
    delta = projectedBottom - bottomSafe;
  }

  if (Math.abs(delta) < 1) return;

  const maxScrollTop = Math.max(
    0,
    scrollContainer.scrollHeight - scrollContainer.clientHeight,
  );
  const targetTop = Math.max(
    0,
    Math.min(maxScrollTop, scrollContainer.scrollTop + delta),
  );
  scrollContainer.scrollTop = targetTop;
}

function cancelGlobalSettingsExpandScrollTracking() {
  if (!globalSettingsExpandScrollRafId) return;
  cancelAnimationFrame(globalSettingsExpandScrollRafId);
  globalSettingsExpandScrollRafId = 0;
}

function trackExpandedGlobalSettingsCategoryVisibility(categoryEl) {
  cancelGlobalSettingsExpandScrollTracking();
  if (!categoryEl) return;

  const startTs = performance.now();
  const trackDurationMs = globalSettingsTransitionDurationMs + 140;

  const tick = () => {
    if (!categoryEl.isConnected || categoryEl.classList.contains("collapsed")) {
      cancelGlobalSettingsExpandScrollTracking();
      return;
    }

    smoothScrollExpandedGlobalSettingsCategory(categoryEl);

    if (performance.now() - startTs >= trackDurationMs) {
      cancelGlobalSettingsExpandScrollTracking();
      return;
    }

    globalSettingsExpandScrollRafId = requestAnimationFrame(tick);
  };

  globalSettingsExpandScrollRafId = requestAnimationFrame(tick);
}

function initGlobalSettingsCategoryToggles() {
  if (globalSettingsCategoriesInitialized) return;
  const modal = document.getElementById("global-settings-modal");
  if (!modal) return;

  loadGlobalSettingsCollapsedState();

  const categories = modal.querySelectorAll(".global-settings-section");
  categories.forEach((categoryEl) => {
    const toggle = categoryEl.querySelector(".global-settings-category-toggle");
    if (!toggle) return;

    const key = categoryEl.dataset.category;
    const collapsed = key ? globalSettingsCollapsed.has(key) : false;
    setGlobalSettingsCategoryCollapsed(categoryEl, collapsed, false, false);

    toggle.addEventListener("click", () => {
      const willCollapse = !categoryEl.classList.contains("collapsed");
      setGlobalSettingsCategoryCollapsed(categoryEl, willCollapse, true, true);
      if (typeof toggle.blur === "function") toggle.blur();
      if (!willCollapse) {
        trackExpandedGlobalSettingsCategoryVisibility(categoryEl);
      } else {
        cancelGlobalSettingsExpandScrollTracking();
      }
    });
  });

  globalSettingsCategoriesInitialized = true;
}

function countCustomHotkeys() {
  try {
    const hotkeysUtils = getHotkeysUtils();
    if (!hotkeysUtils?.countCustomBindings) {
      logMissingShared("HOTKEYS_UTILS.countCustomBindings");
      return 0;
    }
    return hotkeysUtils.countCustomBindings(CONFIG.HOTKEYS);
  } catch (_) {
    return 0;
  }
}

function extractTimelineStatsFromData(data) {
  if (!STORAGE_DIAGNOSTICS_UTILS?.extractTimelineStatsFromData) {
    logMissingShared("STORAGE_DIAGNOSTICS_UTILS.extractTimelineStatsFromData");
    return { days: 0, sessions: 0 };
  }
  return STORAGE_DIAGNOSTICS_UTILS.extractTimelineStatsFromData(data);
}

async function collectGlobalSettingsStorageDiagnostics() {
  if (!STORAGE_DIAGNOSTICS_UTILS?.collectStorageDiagnostics) {
    logMissingShared("STORAGE_DIAGNOSTICS_UTILS.collectStorageDiagnostics");
    return {
      timelineDays: 0,
      timelineSessions: 0,
      plansCount: 0,
      customHotkeysCount: 0,
    };
  }
  return STORAGE_DIAGNOSTICS_UTILS.collectStorageDiagnostics({
    customHotkeysCount: countCustomHotkeys(),
    getTimelineData: () =>
      window.TimelineData && typeof window.TimelineData.getData === "function"
        ? window.TimelineData.getData()
        : undefined,
    loadTimelinePayload: async () => {
      if (
        typeof PoseChronoStorage === "undefined" ||
        !PoseChronoStorage ||
        typeof PoseChronoStorage.getJson !== "function"
      ) {
        return undefined;
      }
      return PoseChronoStorage.getJson(STORAGE_KEYS.TIMELINE_DB, undefined);
    },
    loadPlansPayload: async () => {
      if (
        typeof PoseChronoStorage === "undefined" ||
        !PoseChronoStorage ||
        typeof PoseChronoStorage.getJson !== "function"
      ) {
        return undefined;
      }
      return PoseChronoStorage.getJson(
        STORAGE_KEYS.SESSION_PLANS_DB,
        undefined,
      );
    },
    loadLegacyPlansPayload: () => {
      const localRaw = localStorage.getItem("posechrono_session_plans");
      if (!localRaw) return undefined;
      return JSON.parse(localRaw);
    },
    normalizeSessionPlansPayload,
  });
}

async function refreshGlobalSettingsStorageStatus(storageStatus, fallbackMode) {
  if (!storageStatus) return;

  const requestId = ++globalSettingsStatusRequestId;
  const backendText = fallbackMode
    ? getGlobalSettingsText(
        "settings.global.storageStatusFallback",
        "Storage backend: localStorage fallback active.",
      )
    : getGlobalSettingsText(
        "settings.global.storageStatusReady",
        "Storage backend: IndexedDB (normal mode).",
      );

  storageStatus.innerHTML = `
    <div class="global-settings-storage-line">${escapeHtml(backendText)}</div>
    <div class="global-settings-storage-metrics">
      <div class="global-settings-storage-metric">
        <span class="global-settings-storage-label">${escapeHtml(
          getGlobalSettingsText("settings.global.storageDiagDays", "Days"),
        )}</span>
        <span class="global-settings-storage-value">...</span>
      </div>
      <div class="global-settings-storage-metric">
        <span class="global-settings-storage-label">${escapeHtml(
          getGlobalSettingsText(
            "settings.global.storageDiagSessions",
            "Sessions",
          ),
        )}</span>
        <span class="global-settings-storage-value">...</span>
      </div>
      <div class="global-settings-storage-metric">
        <span class="global-settings-storage-label">${escapeHtml(
          getGlobalSettingsText("settings.global.storageDiagPlans", "Plans"),
        )}</span>
        <span class="global-settings-storage-value">...</span>
      </div>
      <div class="global-settings-storage-metric">
        <span class="global-settings-storage-label">${escapeHtml(
          getGlobalSettingsText(
            "settings.global.storageDiagCustomHotkeys",
            "Custom hotkeys",
          ),
        )}</span>
        <span class="global-settings-storage-value">...</span>
      </div>
    </div>
  `;

  try {
    const diagnostics = await collectGlobalSettingsStorageDiagnostics();
    if (requestId !== globalSettingsStatusRequestId) return;
    storageStatus.innerHTML = `
      <div class="global-settings-storage-line">${escapeHtml(backendText)}</div>
      <div class="global-settings-storage-metrics">
        <div class="global-settings-storage-metric">
          <span class="global-settings-storage-label">${escapeHtml(
            getGlobalSettingsText("settings.global.storageDiagDays", "Days"),
          )}</span>
          <span class="global-settings-storage-value">${escapeHtml(
            String(diagnostics.timelineDays),
          )}</span>
        </div>
        <div class="global-settings-storage-metric">
          <span class="global-settings-storage-label">${escapeHtml(
            getGlobalSettingsText(
              "settings.global.storageDiagSessions",
              "Sessions",
            ),
          )}</span>
          <span class="global-settings-storage-value">${escapeHtml(
            String(diagnostics.timelineSessions),
          )}</span>
        </div>
        <div class="global-settings-storage-metric">
          <span class="global-settings-storage-label">${escapeHtml(
            getGlobalSettingsText("settings.global.storageDiagPlans", "Plans"),
          )}</span>
          <span class="global-settings-storage-value">${escapeHtml(
            String(diagnostics.plansCount),
          )}</span>
        </div>
        <div class="global-settings-storage-metric">
          <span class="global-settings-storage-label">${escapeHtml(
            getGlobalSettingsText(
              "settings.global.storageDiagCustomHotkeys",
              "Custom hotkeys",
            ),
          )}</span>
          <span class="global-settings-storage-value">${escapeHtml(
            String(diagnostics.customHotkeysCount),
          )}</span>
        </div>
      </div>
    `;
  } catch (_) {}
}

function enableGlobalSettingsFocusTrap(modal) {
  if (!modal) return;
  if (globalSettingsFocusTrapHandler) {
    modal.removeEventListener("keydown", globalSettingsFocusTrapHandler, true);
    globalSettingsFocusTrapHandler = null;
  }

  globalSettingsFocusTrapHandler = (e) => {
    if (e.key !== "Tab") return;
    const focusables = Array.from(
      modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (el) =>
        !el.classList.contains("global-settings-category-toggle") &&
        !el.disabled &&
        !el.hidden &&
        el.offsetParent !== null &&
        !el.closest(".hidden"),
    );

    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !modal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !modal.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  modal.addEventListener("keydown", globalSettingsFocusTrapHandler, true);
}

function disableGlobalSettingsFocusTrap(modal) {
  if (!modal || !globalSettingsFocusTrapHandler) return;
  modal.removeEventListener("keydown", globalSettingsFocusTrapHandler, true);
  globalSettingsFocusTrapHandler = null;
}

function updateGlobalSettingsModalState() {
  const modal = document.getElementById("global-settings-modal");
  if (!modal) return;

  const gridBtn = document.getElementById("global-settings-toggle-grid-btn");
  const titlebarAlwaysVisibleInput = document.getElementById(
    "global-settings-titlebar-always-visible-btn",
  );
  const defaultModeGroup = document.getElementById(
    "global-settings-default-mode-group",
  );
  const languageSelect = document.getElementById(
    "global-settings-language-select",
  );
  const storageStatus = document.getElementById(
    "global-settings-storage-status",
  );

  if (gridBtn) {
    const isGridEnabled = document.body.classList.contains("grid-enabled");
    if (
      gridBtn.tagName === "INPUT" &&
      String(gridBtn.type || "").toLowerCase() === "checkbox"
    ) {
      // "Hide background grid": checked = grille cachée
      gridBtn.checked = !isGridEnabled;
    } else {
      setGlobalSettingsButtonLabel(
        gridBtn,
        getGlobalSettingsText(
          isGridEnabled
            ? "settings.global.hideBackgroundGrid"
            : "settings.global.showBackgroundGrid",
          isGridEnabled ? "Hide background grid" : "Show background grid",
        ),
      );
      gridBtn.classList.toggle("active", isGridEnabled);
    }
  }

  if (
    titlebarAlwaysVisibleInput &&
    titlebarAlwaysVisibleInput.tagName === "INPUT" &&
    String(titlebarAlwaysVisibleInput.type || "").toLowerCase() === "checkbox"
  ) {
    titlebarAlwaysVisibleInput.checked = !!CONFIG.titlebarAlwaysVisible;
  }

  if (defaultModeGroup) {
    const activeMode = normalizeSessionModeValue(
      CONFIG?.defaultSessionMode,
      "classique",
    );
    defaultModeGroup
      .querySelectorAll(".search-toggle-btn[data-mode]")
      .forEach((btn) => {
        const isActive = btn.dataset.mode === activeMode;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
  }

  if (languageSelect) {
    const activeLanguage = resolveI18nLanguage(
      typeof i18next !== "undefined"
        ? i18next.resolvedLanguage || i18next.language
        : null,
      resolveI18nLanguage(
        UIPreferences.get(
          PREF_KEY_PREFERRED_LANGUAGE,
          readPreferredLanguageFromStorage() || "en",
        ),
        "en",
      ),
    );
    const activeLanguageConfig =
      getGlobalSettingsLanguageOptionConfig(activeLanguage);

    if (languageSelect.tagName === "SELECT") {
      if (languageSelect.value !== activeLanguageConfig.value) {
        languageSelect.value = activeLanguageConfig.value;
      }
    } else {
      languageSelect.dataset.value = activeLanguageConfig.value;

      const languageValueEl = languageSelect.querySelector(
        ".global-settings-language-value",
      );
      if (languageValueEl) {
        if (activeLanguageConfig.key) {
          languageValueEl.setAttribute("data-i18n", activeLanguageConfig.key);
        } else {
          languageValueEl.removeAttribute("data-i18n");
        }
        languageValueEl.textContent = getGlobalSettingsText(
          activeLanguageConfig.key || "",
          activeLanguageConfig.fallback || activeLanguageConfig.value,
        );
      }

      const languageTrigger = languageSelect.querySelector(
        ".global-settings-language-trigger",
      );
      const languageMenu = languageSelect.querySelector(
        ".global-settings-language-menu",
      );
      if (languageTrigger) {
        languageTrigger.setAttribute(
          "aria-expanded",
          languageMenu && !languageMenu.hidden ? "true" : "false",
        );
      }

      languageSelect
        .querySelectorAll(".global-settings-language-option[data-lang]")
        .forEach((optionEl) => {
          const isSelected =
            optionEl.dataset.lang === activeLanguageConfig.value;
          optionEl.classList.toggle("active", isSelected);
          optionEl.setAttribute("aria-selected", isSelected ? "true" : "false");
        });
    }
  }

  const toggleAnimationsInput = document.getElementById(
    "global-settings-toggle-animations-btn",
  );
  if (
    toggleAnimationsInput &&
    toggleAnimationsInput.tagName === "INPUT" &&
    String(toggleAnimationsInput.type || "").toLowerCase() === "checkbox"
  ) {
    // "Disable animations": checked = animations disabled = !animationsEnabled
    toggleAnimationsInput.checked = !UIPreferences.get(
      "animationsEnabled",
      true,
    );
  }

  const ignoreVideoFilesInput = document.getElementById(
    "global-settings-ignore-video-files-btn",
  );
  const confirmDeleteImageInput = document.getElementById(
    "global-settings-confirm-delete-image-btn",
  );
  if (
    ignoreVideoFilesInput &&
    ignoreVideoFilesInput.tagName === "INPUT" &&
    String(ignoreVideoFilesInput.type || "").toLowerCase() === "checkbox"
  ) {
    ignoreVideoFilesInput.checked = !!UIPreferences.get(
      "ignoreVideoFiles",
      false,
    );
  }

  if (
    confirmDeleteImageInput &&
    confirmDeleteImageInput.tagName === "INPUT" &&
    String(confirmDeleteImageInput.type || "").toLowerCase() === "checkbox"
  ) {
    confirmDeleteImageInput.checked = !!UIPreferences.get(
      PREF_KEY_CONFIRM_DELETE_IMAGE,
      true,
    );
  }

  const enableOnlineSyncInput = document.getElementById(
    "global-settings-enable-online-sync-btn",
  );
  if (
    enableOnlineSyncInput &&
    enableOnlineSyncInput.tagName === "INPUT" &&
    String(enableOnlineSyncInput.type || "").toLowerCase() === "checkbox"
  ) {
    enableOnlineSyncInput.checked = isSyncFeatureEnabled();
  }

  const showProgressBarInput = document.getElementById(
    "global-settings-show-progress-bar-btn",
  );
  if (
    showProgressBarInput &&
    showProgressBarInput.tagName === "INPUT" &&
    String(showProgressBarInput.type || "").toLowerCase() === "checkbox"
  ) {
    showProgressBarInput.checked = !!UIPreferences.get("showProgressBar", true);
  }

  const soundEnabledByDefaultInput = document.getElementById(
    "global-settings-sound-enabled-by-default-btn",
  );
  if (
    soundEnabledByDefaultInput &&
    soundEnabledByDefaultInput.tagName === "INPUT" &&
    String(soundEnabledByDefaultInput.type || "").toLowerCase() === "checkbox"
  ) {
    soundEnabledByDefaultInput.checked = !!UIPreferences.get(
      PREF_KEY_SOUND_ENABLED_BY_DEFAULT,
      true,
    );
  }

  const soundTickInput = document.getElementById(
    "global-settings-sound-tick-btn",
  );
  if (
    soundTickInput &&
    soundTickInput.tagName === "INPUT" &&
    String(soundTickInput.type || "").toLowerCase() === "checkbox"
  ) {
    soundTickInput.checked = !!UIPreferences.get(PREF_KEY_SOUND_TICK, true);
  }

  const tickThresholdGroup = document.getElementById(
    "global-settings-tick-threshold-group",
  );
  if (tickThresholdGroup) {
    const activeThreshold = UIPreferences.get(
      PREF_KEY_TICK_SOUND_THRESHOLD,
      15,
    );
    tickThresholdGroup
      .querySelectorAll(".search-toggle-btn[data-threshold]")
      .forEach((btn) => {
        const isActive =
          Number(btn.dataset.threshold) === Number(activeThreshold);
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    const tickEnabled = !!UIPreferences.get(PREF_KEY_SOUND_TICK, true);
    const thresholdRow = tickThresholdGroup.closest(
      ".global-settings-mode-toggle-row",
    );
    if (thresholdRow) {
      thresholdRow.classList.toggle("is-disabled", !tickEnabled);
    }
  }

  const soundEndInput = document.getElementById(
    "global-settings-sound-end-btn",
  );
  if (
    soundEndInput &&
    soundEndInput.tagName === "INPUT" &&
    String(soundEndInput.type || "").toLowerCase() === "checkbox"
  ) {
    soundEndInput.checked = !!UIPreferences.get(PREF_KEY_SOUND_END, true);
  }

  const soundImageChangeInput = document.getElementById(
    "global-settings-sound-image-change-btn",
  );
  if (
    soundImageChangeInput &&
    soundImageChangeInput.tagName === "INPUT" &&
    String(soundImageChangeInput.type || "").toLowerCase() === "checkbox"
  ) {
    soundImageChangeInput.checked = !!UIPreferences.get(
      PREF_KEY_SOUND_IMAGE_CHANGE,
      true,
    );
  }

  const soundPauseInput = document.getElementById(
    "global-settings-sound-pause-btn",
  );
  if (
    soundPauseInput &&
    soundPauseInput.tagName === "INPUT" &&
    String(soundPauseInput.type || "").toLowerCase() === "checkbox"
  ) {
    soundPauseInput.checked = !!UIPreferences.get(PREF_KEY_SOUND_PAUSE, true);
  }

  if (storageStatus) {
    const storage =
      typeof PoseChronoStorage !== "undefined" &&
      PoseChronoStorage &&
      typeof PoseChronoStorage.status === "function"
        ? PoseChronoStorage.status()
        : { fallbackMode: true };

    const fallbackMode = !!storage.fallbackMode;
    storageStatus.classList.toggle("is-fallback", fallbackMode);
    void refreshGlobalSettingsStorageStatus(storageStatus, fallbackMode);
  }
}

function openGlobalSettingsModal() {
  const modal = document.getElementById("global-settings-modal");
  if (!modal) return;
  globalSettingsLastFocusedElement = document.activeElement;
  initGlobalSettingsCategoryToggles();
  updateGlobalSettingsModalState();
  modal.classList.remove("hidden");
  enableGlobalSettingsFocusTrap(modal);

  const focusTarget =
    modal.querySelector(".global-settings-actions .option-toggle-btn") ||
    modal.querySelector(".modal-close-btn");
  setTimeout(() => {
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }, 0);

  // Drag par le header (initialiser une seule fois)
  const modalHeader = document.getElementById("global-settings-modal-header");
  const modalContent = modal.querySelector(".modal-content");

  if (modalHeader && modalContent && !modalHeader.dataset.dragInitialized) {
    modalHeader.dataset.dragInitialized = "true";

    let isDragging = false;
    let startX, startY;
    let offsetX = 0,
      offsetY = 0;

    modalHeader.addEventListener("mousedown", (e) => {
      if (e.target.closest(".modal-close-btn")) return;
      isDragging = true;
      startX = e.clientX - offsetX;
      startY = e.clientY - offsetY;
      modalContent.style.transition = "none";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      offsetX = e.clientX - startX;
      offsetY = e.clientY - startY;
      modalContent.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      modalContent.style.transition = "";
      document.body.style.userSelect = "";
    });

    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          if (modal.classList.contains("hidden")) {
            offsetX = 0;
            offsetY = 0;
            modalContent.style.transform = "";
          }
        }
      });
    }).observe(modal, { attributes: true });
  }
}

function closeGlobalSettingsModal(options = {}) {
  const { restoreFocus = true } = options;
  const modal = document.getElementById("global-settings-modal");
  if (!modal) return;
  cancelGlobalSettingsExpandScrollTracking();
  disableGlobalSettingsFocusTrap(modal);
  modal.classList.add("hidden");
  if (
    restoreFocus &&
    globalSettingsLastFocusedElement &&
    typeof globalSettingsLastFocusedElement.focus === "function"
  ) {
    globalSettingsLastFocusedElement.focus();
  }
  globalSettingsLastFocusedElement = null;
}

let syncSessionLastFocusedElement = null;
let syncSessionModalRole = "host";
let syncSessionModalBindingsReady = false;
let syncConnectingStartedAt = 0;

/** Hash a password string with SHA-256, returning hex. Empty string → empty string. */
async function syncHashPassword(plainText) {
  const trimmed = String(plainText || "").trim();
  if (!trimmed) return "";
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(trimmed);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (_) {
    // Fallback: return the raw value if SubtleCrypto is unavailable (HTTP context)
    return trimmed;
  }
}
let syncSessionService = null;
let syncSessionServiceState = null;
let syncSessionServiceUnsubscribe = null;
let syncSessionTransportMode = "mock";
let syncSessionTransportUrl = "";
let syncSessionSuggestedLocalRelayUrl = "";
let syncSessionMediaTransferEnabled = true;
let syncRuntimeApplyInProgress = false;
let syncRuntimeLastSentFingerprint = "";
let syncRuntimeLastSentAt = 0;
let syncRuntimeLastAppliedRevision = 0;
let syncRuntimeLastAppliedCustomQueueFingerprint = "";
let syncRuntimeLastHeartbeatAt = 0;
let syncRuntimePublishScheduled = false;
let syncRuntimePendingReason = "";
let syncRuntimePendingOptions = {
  includeMediaOrder: false,
  force: false,
};
let syncRuntimeStatusBadgeEl = null;
let syncSessionParticipantsTooltipEl = null;
let syncSessionLastParticipantsCount = null;
let syncSessionLastInvalidPasswordToastAt = 0;
let syncSessionLastPseudoValidationToastAt = 0;
let syncSharedPlaybackFeedbackToastAt = 0;
let syncHostActionFeedbackToastAt = 0;
let syncParticipantTransferInProgress = false;
let syncParticipantLastPublishedSyncState = "";
let syncParticipantLastPublishedSessionCode = "";
let syncTransferModalAutoCloseTimer = null;
let syncTransferAbortController = null;
const SYNC_ERROR_TOAST_LIMIT_DEFAULT = 2;
const SYNC_ERROR_TOAST_LIMIT_MIN = 1;
const SYNC_ERROR_TOAST_LIMIT_MAX = 10;
const SYNC_SESSION_PACK_SCHEMA = "posechrono-session-pack";
const SYNC_SESSION_PACK_VERSION = 1;
const SYNC_SESSION_PACK_MAX_TEXT_LENGTH = 2 * 1024 * 1024;
const SYNC_SESSION_PACK_MAX_MEDIA_REFS = 50000;
const SYNC_SESSION_MEDIA_MAX_FILES = 300;
const SYNC_SESSION_MEDIA_MAX_FILE_BYTES = 2 * 1024 * 1024;
const SYNC_SESSION_MEDIA_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const SYNC_SESSION_MEDIA_TRANSFER_MAX_RETRIES = 4;
const SYNC_SESSION_MEDIA_TRANSFER_BASE_DELAY_MS = 140;
const SYNC_SESSION_MEDIA_TRANSFER_MAX_DELAY_MS = 1400;
const SYNC_SESSION_MEDIA_TRANSFER_REQUEST_INTERVAL_MS = 35;
const SYNC_SESSION_MEDIA_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp4",
  "webm",
]);
const SYNC_SESSION_MEDIA_MIME_BY_EXT = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};
let syncPendingSessionPackMediaOrderKeys = null;
let syncPendingRuntimeMediaOrderKeys = null;
let syncOnlineMediaCacheByIdentity = new Map();
let syncParticipantPackValidationState = {
  sessionCode: "",
  packHash: "",
  packUpdatedAt: 0,
  mediaUpdatedAt: 0,
  validatedAt: 0,
};
let syncParticipantPackValidationWarningAt = 0;
const SYNC_SESSION_CONTROL_MODE_OPTIONS =
  SYNC_SESSION_MODAL_HELPERS?.CONTROL_MODE_OPTIONS ||
  Object.freeze([
    {
      value: "host-only",
      key: "sync.controlModeHostOnly",
      fallback: "Hôte uniquement",
    },
    {
      value: "shared-pause",
      key: "sync.controlModeSharedPause",
      fallback: "Pause partagée",
    },
  ]);

function getSyncSessionControlModeConfig(controlMode) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.getControlModeConfig === "function"
  ) {
    return (
      SYNC_SESSION_MODAL_HELPERS.getControlModeConfig(
        controlMode,
        SYNC_SESSION_CONTROL_MODE_OPTIONS,
      ) || SYNC_SESSION_CONTROL_MODE_OPTIONS[0]
    );
  }
  const normalized = String(controlMode || "").trim();
  return (
    SYNC_SESSION_CONTROL_MODE_OPTIONS.find(
      (option) => option.value === normalized,
    ) || SYNC_SESSION_CONTROL_MODE_OPTIONS[0]
  );
}

function normalizeSyncSessionCode(input) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.normalizeSessionCode === "function"
  ) {
    return SYNC_SESSION_MODAL_HELPERS.normalizeSessionCode(input);
  }
  return String(input || "")
    .trim()
    .toUpperCase();
}

function isSyncSessionCodeFormatValid(code) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.isSessionCodeFormatValid === "function"
  ) {
    return SYNC_SESSION_MODAL_HELPERS.isSessionCodeFormatValid(code);
  }
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(code || "").trim());
}

function isSyncGuestActionNotificationsEnabled() {
  if (SYNCRO_MODULE && typeof SYNCRO_MODULE.readPreference === "function") {
    return !!SYNCRO_MODULE.readPreference(UIPreferences, true);
  }
  return (
    UIPreferences.get(PREF_KEY_SYNC_GUEST_ACTION_NOTIFICATIONS, true) !== false
  );
}

function setSyncGuestActionNotificationsEnabled(enabled) {
  if (SYNCRO_MODULE && typeof SYNCRO_MODULE.writePreference === "function") {
    return !!SYNCRO_MODULE.writePreference(UIPreferences, !!enabled);
  }
  return (
    UIPreferences.set(PREF_KEY_SYNC_GUEST_ACTION_NOTIFICATIONS, !!enabled) !==
    false
  );
}

function updateSyncSessionGuestActionNotificationsUi(modal) {
  if (!modal) return;
  const inputEl = modal.querySelector(
    "#sync-session-guest-action-notifications-btn",
  );
  const labelEl = modal.querySelector(
    "#sync-session-guest-action-notifications-label",
  );
  const hintEl = modal.querySelector(
    "#sync-session-guest-action-notifications-hint",
  );
  if (labelEl) {
    const fallbackLabel =
      getCurrentI18nLanguage() === "fr"
        ? "Notifier les actions de l'hôte"
        : "Notify me about host actions";
    labelEl.textContent = getI18nText(
      "sync.showHostActionsNotifications",
      fallbackLabel,
    );
  }
  if (hintEl) {
    const fallbackHint =
      getCurrentI18nLanguage() === "fr"
        ? "Pause, reprise et changements de poses/images."
        : "Pause, resume and pose/image changes.";
    hintEl.textContent = getI18nText(
      "sync.showHostActionsNotificationsHint",
      fallbackHint,
    );
  }
  if (!inputEl) return;
  if (SYNCRO_MODULE && typeof SYNCRO_MODULE.syncCheckbox === "function") {
    SYNCRO_MODULE.syncCheckbox(inputEl, UIPreferences, true);
    return;
  }
  inputEl.checked = isSyncGuestActionNotificationsEnabled();
}

function resolveSyncQueryParam(key) {
  try {
    const search = String(window?.location?.search || "");
    if (!search) return "";
    const params = new URLSearchParams(search);
    return String(params.get(key) || "").trim();
  } catch (_) {
    return "";
  }
}

function isSyncFeatureEnabled() {
  try {
    if (!CONFIG?.SYNC || typeof CONFIG.SYNC !== "object") return true;
    if (CONFIG.SYNC.enabled === false) return false;
    return UIPreferences.get("syncEnabled", true);
  } catch (_) {
    return true;
  }
}

function resolveSyncTransportMode() {
  // 1. Query param (highest priority, for debug)
  const queryMode = resolveSyncQueryParam("syncTransport").toLowerCase();
  if (queryMode === "mock" || queryMode === "ws" || queryMode === "webrtc") {
    return queryMode;
  }

  // 2. CONFIG.SYNC (app config file — highest after query param)
  try {
    const configMode = String(CONFIG?.SYNC?.transport || "")
      .trim()
      .toLowerCase();
    if (
      configMode === "mock" ||
      configMode === "ws" ||
      configMode === "webrtc"
    ) {
      return configMode;
    }
  } catch (_) {}

  // 3. Desktop app bridge
  try {
    const desktopMode = String(window?.poseChronoDesktop?.sync?.transport || "")
      .trim()
      .toLowerCase();
    if (
      desktopMode === "mock" ||
      desktopMode === "ws" ||
      desktopMode === "webrtc"
    ) {
      return desktopMode;
    }
  } catch (_) {}

  // 4. localStorage (legacy override, lowest priority)
  try {
    const storedMode = String(
      localStorage.getItem("posechrono-sync-transport") || "",
    )
      .trim()
      .toLowerCase();
    if (
      storedMode === "mock" ||
      storedMode === "ws" ||
      storedMode === "webrtc"
    ) {
      return storedMode;
    }
  } catch (_) {}

  return "mock";
}

function resolveSyncWebSocketUrl() {
  const fromQuery =
    resolveSyncQueryParam("syncWsUrl") || resolveSyncQueryParam("sync_ws_url");
  if (fromQuery) return fromQuery;

  try {
    const fromStorage = String(
      localStorage.getItem("posechrono-sync-ws-url") || "",
    ).trim();
    if (fromStorage) return fromStorage;
  } catch (_) {}

  try {
    const fromDesktop = String(
      window?.poseChronoDesktop?.sync?.wsUrl || "",
    ).trim();
    if (fromDesktop) return fromDesktop;
  } catch (_) {}

  try {
    const fromConfig = String(CONFIG?.SYNC?.wsUrl || "").trim();
    if (fromConfig) return fromConfig;
  } catch (_) {}

  return "";
}

function resolveSyncWebRtcSignalingUrl() {
  const fromQuery =
    resolveSyncQueryParam("syncWebRtcUrl") ||
    resolveSyncQueryParam("sync_webrtc_url") ||
    resolveSyncQueryParam("syncSignalingUrl") ||
    resolveSyncQueryParam("sync_signaling_url");
  if (fromQuery) return fromQuery;

  try {
    const fromStorage = String(
      localStorage.getItem("posechrono-sync-webrtc-url") || "",
    ).trim();
    if (fromStorage) return fromStorage;
  } catch (_) {}

  try {
    const fromDesktop = String(
      window?.poseChronoDesktop?.sync?.webrtcSignalingUrl || "",
    ).trim();
    if (fromDesktop) return fromDesktop;
  } catch (_) {}

  try {
    const fromConfig = String(CONFIG?.SYNC?.webrtcSignalingUrl || "").trim();
    if (fromConfig) return fromConfig;
  } catch (_) {}

  return "";
}

function resolveSyncMediaTransferEnabled() {
  const parseBooleanLike = (value, fallback = true) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (!normalized) return !!fallback;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return !!fallback;
  };

  const queryValue =
    resolveSyncQueryParam("syncMediaTransfer") ||
    resolveSyncQueryParam("sync_media_transfer");
  if (queryValue) return parseBooleanLike(queryValue, true);

  try {
    const fromStorage = String(
      localStorage.getItem("posechrono-sync-media-transfer-enabled") || "",
    ).trim();
    if (fromStorage) return parseBooleanLike(fromStorage, true);
  } catch (_) {}

  try {
    const fromDesktop = window?.poseChronoDesktop?.sync?.allowMediaTransfer;
    if (fromDesktop !== undefined) return !!fromDesktop;
  } catch (_) {}

  try {
    if (
      CONFIG?.SYNC &&
      Object.prototype.hasOwnProperty.call(CONFIG.SYNC, "allowMediaTransfer")
    ) {
      return CONFIG.SYNC.allowMediaTransfer !== false;
    }
  } catch (_) {}

  return true;
}

function createSyncSessionTransport() {
  const preferredMode = resolveSyncTransportMode();
  const wsUrl = resolveSyncWebSocketUrl();
  const webrtcSignalingUrl = resolveSyncWebRtcSignalingUrl() || wsUrl;
  const allowMediaTransfer = resolveSyncMediaTransferEnabled();
  const syncConfig =
    CONFIG?.SYNC && typeof CONFIG.SYNC === "object" ? CONFIG.SYNC : {};
  const requireTls = syncConfig.requireTls === true;
  const maxReconnectAttempts = Math.max(
    0,
    Number(syncConfig.maxReconnectAttempts ?? 10) || 0,
  );
  const reconnectBaseDelayMs = Math.max(
    500,
    Number(syncConfig.reconnectBaseDelayMs || 1000) || 1000,
  );
  const reconnectMaxDelayMs = Math.max(
    reconnectBaseDelayMs,
    Number(syncConfig.reconnectMaxDelayMs || 30000) || 30000,
  );
  const webrtcIceServers = Array.isArray(syncConfig.webrtcIceServers)
    ? syncConfig.webrtcIceServers
        .map((entry) =>
          entry && typeof entry === "object" ? { ...entry } : null,
        )
        .filter((entry) => !!entry)
    : null;
  const maxMeshPeers = Math.max(1, Number(syncConfig.maxMeshPeers || 4) || 4);
  const p2pRequestTimeoutMs = Math.max(
    1000,
    Number(syncConfig.p2pRequestTimeoutMs || 12000) || 12000,
  );
  const mediaChunkBase64Size = Math.max(
    2048,
    Number(syncConfig.mediaChunkBase64Size || 12000) || 12000,
  );
  const maxBufferedAmountBeforeYield = Math.max(
    mediaChunkBase64Size * 2,
    Number(syncConfig.maxBufferedAmountBeforeYield || 512 * 1024) || 512 * 1024,
  );
  const sendYieldDelayMs = Math.max(
    1,
    Number(syncConfig.sendYieldDelayMs || 12) || 12,
  );
  const latencyLogEvery = Math.max(
    5,
    Number(syncConfig.latencyLogEvery || 20) || 20,
  );
  const latencyWindowSize = Math.max(
    10,
    Number(syncConfig.latencyWindowSize || 120) || 120,
  );
  const mirrorMediaToRelay = syncConfig.mirrorMediaToRelay !== false;
  const enableLatencyLogs = syncConfig.enableLatencyLogs === true;

  if (preferredMode === "webrtc" && webrtcSignalingUrl) {
    if (typeof SHARED_SYNC_TRANSPORT_WEBRTC_FACTORY === "function") {
      try {
        const transport = SHARED_SYNC_TRANSPORT_WEBRTC_FACTORY({
          signalingUrl: webrtcSignalingUrl,
          rtcConfiguration:
            webrtcIceServers && webrtcIceServers.length
              ? { iceServers: webrtcIceServers }
              : undefined,
          requireTls,
          maxReconnectAttempts,
          reconnectBaseDelayMs,
          reconnectMaxDelayMs,
          allowMediaTransfer,
          maxMeshPeers,
          p2pRequestTimeoutMs,
          mediaChunkBase64Size,
          maxBufferedAmountBeforeYield,
          sendYieldDelayMs,
          enableLatencyLogs,
          latencyLogEvery,
          latencyWindowSize,
          mirrorMediaToRelay,
          logger: (...args) => console.warn(...args),
        });
        return {
          transport,
          mode: "webrtc",
          wsUrl: webrtcSignalingUrl,
          mediaTransferEnabled: allowMediaTransfer,
        };
      } catch (error) {
        console.warn(
          "[Sync] WebRTC transport init failed, fallback to ws/mock:",
          error,
        );
      }
    } else {
      logMissingShared("createSyncTransportWebRTC");
    }
  }

  if (preferredMode !== "mock" && wsUrl) {
    if (typeof SHARED_SYNC_TRANSPORT_WEBSOCKET_FACTORY === "function") {
      try {
        const transport = SHARED_SYNC_TRANSPORT_WEBSOCKET_FACTORY({
          url: wsUrl,
          requireTls,
          maxReconnectAttempts,
          reconnectBaseDelayMs,
          reconnectMaxDelayMs,
          allowMediaTransfer,
          logger: (...args) => {
            const msg = String(args[0] || "");
            if (msg.includes("unencrypted ws://") && wsUrl && (wsUrl.includes("127.0.0.1") || wsUrl.includes("localhost") || wsUrl.includes("192.168.") || wsUrl.includes("10."))) return;
            console.warn(...args);
          },
        });
        return {
          transport,
          mode: "ws",
          wsUrl,
          mediaTransferEnabled: allowMediaTransfer,
        };
      } catch (error) {
        console.warn(
          "[Sync] WebSocket transport init failed, fallback to mock:",
          error,
        );
      }
    } else {
      logMissingShared("createSyncTransportWebSocket");
    }
  }

  if (typeof SHARED_SYNC_TRANSPORT_MOCK_FACTORY === "function") {
    return {
      transport: SHARED_SYNC_TRANSPORT_MOCK_FACTORY({
        busKey: "__POSECHRONO_SYNC_MOCK_TRANSPORT_BUS__",
      }),
      mode: "mock",
      wsUrl: "",
      mediaTransferEnabled: allowMediaTransfer,
    };
  }

  return {
    transport: null,
    mode: "none",
    wsUrl: "",
    mediaTransferEnabled: allowMediaTransfer,
  };
}

function getSyncSessionStatusElement(modal) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.getStatusElement === "function"
  ) {
    return SYNC_SESSION_STATUS_UI.getStatusElement(modal);
  }
  if (!modal) return null;
  return modal.querySelector("#sync-session-status");
}

function getSyncSessionNetworkStatusElement(modal) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.getNetworkStatusElement === "function"
  ) {
    return SYNC_SESSION_STATUS_UI.getNetworkStatusElement(modal);
  }
  if (!modal) return null;
  return modal.querySelector("#sync-session-network-status");
}

function setSyncSessionNetworkStatus(
  modal,
  message = "",
  tone = "",
  tooltip = "",
) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.setNetworkStatus === "function"
  ) {
    SYNC_SESSION_STATUS_UI.setNetworkStatus(modal, message, tone, tooltip);
    return;
  }
  const networkEl = getSyncSessionNetworkStatusElement(modal);
  if (!networkEl) return;
  networkEl.classList.remove("is-success", "is-warning", "is-error");
  if (tone === "success") networkEl.classList.add("is-success");
  if (tone === "warning") networkEl.classList.add("is-warning");
  if (tone === "error") networkEl.classList.add("is-error");
  networkEl.textContent = String(message || "");
  const tooltipText = String(tooltip || "").trim();
  if (tooltipText) {
    networkEl.setAttribute("data-tooltip", tooltipText);
  } else {
    networkEl.removeAttribute("data-tooltip");
  }
  networkEl.removeAttribute("title");
}

function isLoopbackSyncEndpoint(endpointUrl) {
  try {
    const parsed = new URL(String(endpointUrl || "").trim());
    const host = String(parsed.hostname || "").trim().toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch (_) {
    return false;
  }
}

function stripEndpointSuffixFromStatus(message) {
  const text = String(message || "").trim();
  if (!text) return "";
  return text
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function updateSyncSessionNetworkStatus(modal, snapshot = null) {
  // Fallback: if transportUrl was not set, resolve it now
  const effectiveTransportUrl =
    syncSessionTransportUrl || resolveSyncWebSocketUrl() || "";
  const isLocalConnectionMode =
    UIPreferences.get("syncConnectionType", "local") === "local";
  const localServerBtn = modal
    ? modal.querySelector("#sync-session-start-local-server-btn")
    : null;
  const isLocalServerReady =
    !!localServerBtn && localServerBtn.classList.contains("is-ready");
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.updateNetworkStatus === "function"
  ) {
    const handled = SYNC_SESSION_STATUS_UI.updateNetworkStatus({
      modal,
      transportMode: syncSessionTransportMode,
      transportUrl: effectiveTransportUrl,
      preferredEndpoint: syncSessionSuggestedLocalRelayUrl || "",
      isLocalConnectionMode,
      isLocalServerReady,
      state: snapshot || syncSessionServiceState,
      getText: (key, fallback, vars = undefined) =>
        getI18nText(key, fallback, vars),
      setNetworkStatus: (message, tone, tooltip = "") =>
        setSyncSessionNetworkStatus(modal, message, tone, tooltip),
    });
    if (handled) return;
  }
  if (!modal) return;
  if (syncSessionTransportMode === "none") {
    setSyncSessionNetworkStatus(modal, getI18nText("sync.networkUnavailable", "Network: unavailable."), "error");
    return;
  }

  if (syncSessionTransportMode === "mock") {
    setSyncSessionNetworkStatus(modal, getI18nText("sync.networkLocalMock", "Network: local mode (mock)."), "warning");
    return;
  }

  if (syncSessionTransportMode === "webrtc") {
    const state = snapshot || syncSessionServiceState;
    const endpoint = String(syncSessionTransportUrl || "").trim();
    const endpointLabel = endpoint || "WebRTC signaling";
    const fallbackActive = !!state?.p2pFallbackActive;
    const fallbackCount = Math.max(
      0,
      Number(state?.p2pRelayParticipantsCount || 0) || 0,
    );
    const meshLimit = Math.max(0, Number(state?.p2pMeshLimit || 0) || 0);
    const errorCode = String(state?.lastError || "").toLowerCase();
    const hasNetworkError =
      errorCode.includes("websocket") ||
      errorCode.includes("webrtc") ||
      errorCode.includes("transport-unavailable") ||
      errorCode.includes("connect-failed") ||
      errorCode.includes("disconnected") ||
      errorCode.includes("timeout");

    if ((state && state.status === "connecting") || hasNetworkError) {
      setSyncSessionNetworkStatus(
        modal,
        getI18nText("sync.networkP2PConnecting", "Network: P2P connecting ({{endpoint}})", { endpoint: endpointLabel }),
        "warning",
      );
      return;
    }

    if (state && (state.status === "hosting" || state.status === "joined")) {
      if (fallbackActive) {
        setSyncSessionNetworkStatus(
          modal,
          getI18nText("sync.networkP2PFallback", "Network: P2P partial ({{endpoint}}) - relay fallback for {{count}} participant(s), mesh limit {{limit}}.", { endpoint: endpointLabel, count: fallbackCount, limit: meshLimit || 0 }),
          "warning",
        );
        return;
      }
      setSyncSessionNetworkStatus(
        modal,
        getI18nText("sync.networkP2PConnected", "Network: P2P connected ({{endpoint}})", { endpoint: endpointLabel }),
        "success",
      );
      return;
    }

    setSyncSessionNetworkStatus(
      modal,
      getI18nText("sync.networkP2PReady", "Network: P2P ready ({{endpoint}})", { endpoint: endpointLabel }),
      "warning",
    );
    return;
  }

  const state = snapshot || syncSessionServiceState;
  const endpoint = String(effectiveTransportUrl || "").trim();
  let endpointLabel = endpoint || "";
  if (endpointLabel && isLoopbackSyncEndpoint(endpointLabel)) {
    const suggested = String(syncSessionSuggestedLocalRelayUrl || "").trim();
    endpointLabel =
      suggested && !isLoopbackSyncEndpoint(suggested) ? suggested : "";
  }
  const getWsStatusText = (key, fallback) => {
    const text = getI18nText(key, fallback, { endpoint: "" });
    const stripped = stripEndpointSuffixFromStatus(text);
    if (stripped) return stripped;
    return stripEndpointSuffixFromStatus(String(fallback || ""));
  };
  const networkTooltip = endpointLabel || "";
  const errorCode = String(state?.lastError || "").toLowerCase();
  const hasNetworkError =
    errorCode.includes("websocket") ||
    errorCode.includes("transport-unavailable") ||
    errorCode.includes("connect-failed") ||
    errorCode.includes("disconnected") ||
    errorCode.includes("timeout");
  const hasActiveSession =
    state && (state.status === "hosting" || state.status === "joined");

  if (isLocalConnectionMode && !isLocalServerReady && !hasActiveSession) {
    setSyncSessionNetworkStatus(
      modal,
      getWsStatusText(
        "sync.networkWaitingLocalServer",
        "Network: waiting for local server startup.",
      ),
      "warning",
      networkTooltip,
    );
    return;
  }

  if ((state && state.status === "connecting") || hasNetworkError) {
    setSyncSessionNetworkStatus(
      modal,
      getWsStatusText(
        "sync.networkReconnecting",
        "Network: reconnecting",
      ),
      "warning",
      networkTooltip,
    );
    return;
  }

  if (hasActiveSession) {
    setSyncSessionNetworkStatus(
      modal,
      getWsStatusText(
        "sync.networkConnected",
        "Network: connected",
      ),
      "success",
      networkTooltip,
    );
    return;
  }

  setSyncSessionNetworkStatus(
    modal,
    getWsStatusText("sync.networkReady", "Network: ready"),
    "warning",
    networkTooltip,
  );
}

function updateSyncSessionCodeUi(modal, sessionCode = "") {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.updateCodeUi === "function"
  ) {
    const handled = SYNC_SESSION_STATUS_UI.updateCodeUi({
      modal,
      sessionCode,
      normalizeCode: (value) => normalizeSyncSessionCode(value),
    });
    if (handled) {
      updateSyncSessionInvitePanelVisibility(modal);
      return;
    }
  }
  if (!modal) return;
  const rowEl = modal.querySelector("#sync-session-code-row");
  const valueEl = modal.querySelector("#sync-session-code-value");
  const copyBtn =
    modal.querySelector("#sync-session-code-row") ||
    modal.querySelector("#sync-session-copy-code-btn");
  if (!rowEl || !valueEl) return;

  const normalizedCode = normalizeSyncSessionCode(sessionCode);
  if (!normalizedCode) {
    rowEl.classList.add("hidden");
    valueEl.textContent = "";
    if (copyBtn && "disabled" in copyBtn) copyBtn.disabled = true;
    if (copyBtn) copyBtn.classList.add("is-disabled");
    updateSyncSessionInvitePanelVisibility(modal);
    return;
  }

  valueEl.textContent = normalizedCode;
  rowEl.classList.remove("hidden");
  if (copyBtn && "disabled" in copyBtn) copyBtn.disabled = false;
  if (copyBtn) copyBtn.classList.remove("is-disabled");
  updateSyncSessionInvitePanelVisibility(modal);
}

function updateSyncSessionInvitePanelVisibility(modal, snapshot = null) {
  if (!modal) return;
  const invitePanel = modal.querySelector("#sync-session-invite-panel");
  if (!invitePanel) return;
  const state = snapshot || syncSessionServiceState;
  const hasSessionCode = !!normalizeSyncSessionCode(state?.sessionCode || "");
  const shouldShow = isSyncSessionActive(state) && hasSessionCode;
  const isLocalConnectionType =
    UIPreferences.get("syncConnectionType", "local") === "local";
  invitePanel.classList.toggle("hidden", !shouldShow);
  invitePanel.classList.toggle(
    "sync-session-invite-panel--plain",
    !isLocalConnectionType,
  );
}

function setSyncSessionStatus(modal, message = "", tone = "", options = {}) {
  const withLoadingDots = !!options?.loadingDots;
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.setStatus === "function"
  ) {
    SYNC_SESSION_STATUS_UI.setStatus(modal, message, tone, {
      loadingDots: withLoadingDots,
    });
    return;
  }
  const statusEl = getSyncSessionStatusElement(modal);
  if (!statusEl) return;
  statusEl.classList.remove(
    "is-success",
    "is-warning",
    "is-error",
    "is-loading-dots",
  );
  if (tone === "success") statusEl.classList.add("is-success");
  if (tone === "warning") statusEl.classList.add("is-warning");
  if (tone === "error") statusEl.classList.add("is-error");
  if (withLoadingDots) statusEl.classList.add("is-loading-dots");
  const normalizedMessage = withLoadingDots
    ? String(message || "").replace(/\s*(?:\.\.\.|…)\s*$/, "")
    : String(message || "");
  const dotEl = statusEl.querySelector(".sync-session-status-dot");
  if (dotEl) {
    // Preserve the dot span, set text after it
    while (dotEl.nextSibling) dotEl.nextSibling.remove();
    const messageNode = document.createTextNode(normalizedMessage);
    dotEl.after(messageNode);
    if (withLoadingDots) {
      const loadingDotsEl = document.createElement("span");
      loadingDotsEl.className = "sync-session-status-loading-dots";
      loadingDotsEl.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i += 1) {
        const dotElNode = document.createElement("span");
        dotElNode.className = "sync-session-status-loading-dot";
        dotElNode.textContent = ".";
        loadingDotsEl.appendChild(dotElNode);
      }
      messageNode.after(loadingDotsEl);
    }
  } else {
    statusEl.textContent = normalizedMessage;
    if (withLoadingDots) {
      const loadingDotsEl = document.createElement("span");
      loadingDotsEl.className = "sync-session-status-loading-dots";
      loadingDotsEl.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i += 1) {
        const dotElNode = document.createElement("span");
        dotElNode.className = "sync-session-status-loading-dot";
        dotElNode.textContent = ".";
        loadingDotsEl.appendChild(dotElNode);
      }
      statusEl.appendChild(loadingDotsEl);
    }
  }
}

function getSyncSessionGuestParticipants(snapshot = null) {
  const state = snapshot || syncSessionServiceState;
  if (!state || typeof state !== "object") return [];
  const hostClientId = String(state.hostClientId || "").trim();
  const participantIds = getSyncParticipantIds(state);
  const profiles = getSyncParticipantProfiles(state);
  const participantSyncStates = getSyncParticipantSyncStates(state);
  return participantIds
    .filter((id) => !!id && id !== hostClientId)
    .map((id) => ({
      id,
      name: getSyncParticipantDisplayName(id, profiles),
      syncState: getSyncParticipantSyncState(id, participantSyncStates),
    }));
}

function getSyncSessionJoinedRemoteParticipants(snapshot = null) {
  const state = snapshot || syncSessionServiceState;
  if (!state || typeof state !== "object") return [];
  const selfClientId = String(state.clientId || "").trim();
  const hostClientId = String(state.hostClientId || "").trim();
  const participantIds = getSyncParticipantIds(state);
  const profiles = getSyncParticipantProfiles(state);
  const participantSyncStates = getSyncParticipantSyncStates(state);

  return participantIds
    .filter((id) => !!id && id !== selfClientId)
    .map((id) => {
      const displayName = getSyncParticipantDisplayName(id, profiles);
      return {
        id,
        name: id === hostClientId ? `Hôte: ${displayName}` : displayName,
        syncState: getSyncParticipantSyncState(id, participantSyncStates),
      };
    });
}

function ensureSyncSessionParticipantsTooltip() {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.ensureParticipantsTooltip === "function"
  ) {
    syncSessionParticipantsTooltipEl =
      SYNC_SESSION_STATUS_UI.ensureParticipantsTooltip({
        existingTooltipEl: syncSessionParticipantsTooltipEl,
        documentRef: typeof document !== "undefined" ? document : null,
      }) || null;
    return syncSessionParticipantsTooltipEl;
  }
  if (
    syncSessionParticipantsTooltipEl &&
    document.body &&
    document.body.contains(syncSessionParticipantsTooltipEl)
  ) {
    return syncSessionParticipantsTooltipEl;
  }
  if (!document || !document.body) return null;
  const tooltip = document.createElement("div");
  tooltip.id = "sync-session-participants-tooltip";
  tooltip.className =
    "timeline-custom-tooltip sync-session-participants-tooltip";
  document.body.appendChild(tooltip);
  syncSessionParticipantsTooltipEl = tooltip;
  return tooltip;
}

function hideSyncSessionParticipantsTooltip() {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.hideParticipantsTooltip === "function"
  ) {
    SYNC_SESSION_STATUS_UI.hideParticipantsTooltip(
      syncSessionParticipantsTooltipEl,
    );
    return;
  }
  if (!syncSessionParticipantsTooltipEl) return;
  syncSessionParticipantsTooltipEl.classList.remove("visible");
}

function readSyncGuestsFromStatusTrigger(triggerEl) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.readGuestsFromStatusTrigger === "function"
  ) {
    return SYNC_SESSION_STATUS_UI.readGuestsFromStatusTrigger(triggerEl);
  }
  if (!triggerEl) return [];
  const raw = String(triggerEl.dataset.syncGuests || "[]");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => {
        if (value && typeof value === "object") {
          const name = String(value.name || "").trim();
          if (!name) return null;
          return {
            id: String(value.id || "").trim(),
            name,
            syncState: normalizeSyncParticipantSyncState(value.syncState),
          };
        }
        const name = String(value || "").trim();
        if (!name) return null;
        return {
          id: "",
          name,
          syncState: "missing",
        };
      })
      .filter((value) => !!value);
  } catch (_) {
    return [];
  }
}

function renderSyncSessionParticipantsTooltip(tooltipEl, guests = []) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.renderParticipantsTooltip === "function"
  ) {
    const handled = SYNC_SESSION_STATUS_UI.renderParticipantsTooltip({
      tooltipEl,
      guests,
      title: getI18nText("sync.guestsConnectedTitle", "Connected guests"),
      emptyLabel: getI18nText("sync.noGuestsConnected", "No guests connected"),
      documentRef: typeof document !== "undefined" ? document : null,
    });
    if (handled) return;
  }
  if (!tooltipEl) return;
  tooltipEl.innerHTML = "";

  const titleEl = document.createElement("div");
  titleEl.className = "custom-structure-title";
  titleEl.textContent = getI18nText("sync.guestsConnectedTitle", "Connected guests");
  tooltipEl.appendChild(titleEl);

  if (!Array.isArray(guests) || guests.length <= 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "custom-step pause";
    emptyEl.textContent = getI18nText("sync.noGuestsConnected", "No guests connected");
    tooltipEl.appendChild(emptyEl);
    return;
  }

  guests.forEach((guest) => {
    const guestName =
      guest && typeof guest === "object"
        ? String(guest.name || "").trim()
        : String(guest || "").trim();
    if (!guestName) return;
    const itemEl = document.createElement("div");
    itemEl.className = "custom-step pose";
    itemEl.textContent = `• ${guestName}`;
    tooltipEl.appendChild(itemEl);
  });
}

function updateSyncSessionParticipantsTooltipPosition(triggerEl, tooltipEl) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.updateParticipantsTooltipPosition ===
      "function"
  ) {
    const handled = SYNC_SESSION_STATUS_UI.updateParticipantsTooltipPosition(
      triggerEl,
      tooltipEl,
    );
    if (handled) return;
  }
  if (!triggerEl || !tooltipEl) return;
  const rect = triggerEl.getBoundingClientRect();
  tooltipEl.style.left = rect.left + rect.width / 2 + "px";
  tooltipEl.style.top = rect.bottom + 8 + "px";
}

function showSyncSessionParticipantsTooltip(triggerEl) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.showParticipantsTooltip === "function"
  ) {
    syncSessionParticipantsTooltipEl =
      SYNC_SESSION_STATUS_UI.showParticipantsTooltip({
        triggerEl,
        existingTooltipEl: syncSessionParticipantsTooltipEl,
        documentRef: typeof document !== "undefined" ? document : null,
        title: getI18nText("sync.guestsConnectedTitle", "Connected guests"),
        emptyLabel: getI18nText("sync.noGuestsConnected", "No guests connected"),
      }) || syncSessionParticipantsTooltipEl;
    return;
  }
  if (!triggerEl) return;
  const tooltipEl = ensureSyncSessionParticipantsTooltip();
  if (!tooltipEl) return;
  const guests = readSyncGuestsFromStatusTrigger(triggerEl);
  renderSyncSessionParticipantsTooltip(tooltipEl, guests);
  updateSyncSessionParticipantsTooltipPosition(triggerEl, tooltipEl);
  tooltipEl.classList.add("visible");
}

function setSyncSessionHostingStatus(modal, state) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.setHostingStatus === "function"
  ) {
    const handled = SYNC_SESSION_STATUS_UI.setHostingStatus({
      modal,
      state,
      guests: getSyncSessionGuestParticipants(state),
      getText: (key, fallback, vars = undefined) =>
        getI18nText(key, fallback, vars),
    });
    if (handled) return;
  }
  const statusEl = getSyncSessionStatusElement(modal);
  if (!statusEl) return;
  statusEl.classList.remove(
    "is-success",
    "is-warning",
    "is-error",
    "is-loading-dots",
  );
  statusEl.classList.add("is-success");
  const dotElH = statusEl.querySelector(".sync-session-status-dot");
  if (dotElH) {
    while (dotElH.nextSibling) dotElH.nextSibling.remove();
  } else {
    statusEl.textContent = "";
  }

  const guests = getSyncSessionGuestParticipants(state);
  const participants = Math.max(0, guests.length);
  const sessionCode = String(state?.sessionCode || "").trim();
  const participantsLabel = `(${participants} participant${participants === 1 ? "" : "s"})`;

  const prefixText = `Hosting ${sessionCode} `;
  statusEl.appendChild(document.createTextNode(prefixText));

  const triggerEl = document.createElement("span");
  triggerEl.className = "sync-session-participants-trigger";
  triggerEl.setAttribute("role", "button");
  triggerEl.setAttribute("tabindex", "0");
  triggerEl.textContent = participantsLabel;
  triggerEl.dataset.syncGuests = JSON.stringify(
    guests.map((guest) => ({
      id: String(guest?.id || "").trim(),
      name: String(guest?.name || "").trim(),
      syncState: normalizeSyncParticipantSyncState(guest?.syncState),
    })),
  );
  statusEl.appendChild(triggerEl);
}

function setSyncSessionJoinedStatus(modal, state) {
  if (
    SYNC_SESSION_STATUS_UI &&
    typeof SYNC_SESSION_STATUS_UI.setJoinedStatus === "function"
  ) {
    const handled = SYNC_SESSION_STATUS_UI.setJoinedStatus({
      modal,
      state,
      others: getSyncSessionJoinedRemoteParticipants(state),
      getText: (key, fallback, vars = undefined) =>
        getI18nText(key, fallback, vars),
    });
    if (handled) return;
  }
  const statusEl = getSyncSessionStatusElement(modal);
  if (!statusEl) return;
  statusEl.classList.remove(
    "is-success",
    "is-warning",
    "is-error",
    "is-loading-dots",
  );
  statusEl.classList.add("is-success");
  const dotElJ = statusEl.querySelector(".sync-session-status-dot");
  if (dotElJ) {
    while (dotElJ.nextSibling) dotElJ.nextSibling.remove();
  } else {
    statusEl.textContent = "";
  }

  const others = getSyncSessionJoinedRemoteParticipants(state);
  const participants = Math.max(0, others.length);
  const sessionCode = String(state?.sessionCode || "").trim();
  const participantsLabel = `(${participants} participant${participants === 1 ? "" : "s"})`;

  const prefixText = `Connected to ${sessionCode} `;
  statusEl.appendChild(document.createTextNode(prefixText));

  const triggerEl = document.createElement("span");
  triggerEl.className = "sync-session-participants-trigger";
  triggerEl.setAttribute("role", "button");
  triggerEl.setAttribute("tabindex", "0");
  triggerEl.textContent = participantsLabel;
  triggerEl.dataset.syncGuests = JSON.stringify(
    others.map((guest) => {
      if (guest && typeof guest === "object") {
        return {
          id: String(guest.id || "").trim(),
          name: String(guest.name || "").trim(),
          syncState: normalizeSyncParticipantSyncState(guest.syncState),
        };
      }
      return {
        id: "",
        name: String(guest || "").trim(),
        syncState: "missing",
      };
    }),
  );
  statusEl.appendChild(triggerEl);
}

function flashSyncSessionInputError(inputEl) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.flashInputError === "function"
  ) {
    SYNC_SESSION_MODAL_HELPERS.flashInputError(inputEl);
    return;
  }
  if (!inputEl) return;
  inputEl.classList.remove("shake", "input-border-error");
  if (typeof inputEl.focus === "function") {
    inputEl.focus();
  }
  void inputEl.offsetWidth;
  inputEl.classList.add("shake", "input-border-error");
  setTimeout(() => {
    inputEl.classList.remove("shake", "input-border-error");
  }, 420);
}

function flashSyncSessionCodeInputError(inputEl) {
  flashSyncSessionInputError(inputEl);
}

function isSyncGuestPseudoCharAllowed(char) {
  if (
    SYNC_RUNTIME_HELPERS &&
    typeof SYNC_RUNTIME_HELPERS.isGuestPseudoCharAllowed === "function"
  ) {
    return SYNC_RUNTIME_HELPERS.isGuestPseudoCharAllowed(char);
  }
  const symbol = String(char || "");
  if (!symbol) return false;
  if (symbol === " ") return true;
  const lower = symbol.toLocaleLowerCase();
  const upper = symbol.toLocaleUpperCase();
  return lower !== upper;
}

function sanitizeSyncGuestPseudoInputValue(input) {
  if (
    SYNC_RUNTIME_HELPERS &&
    typeof SYNC_RUNTIME_HELPERS.sanitizeGuestPseudoInputValue === "function"
  ) {
    return SYNC_RUNTIME_HELPERS.sanitizeGuestPseudoInputValue(input);
  }
  const raw = String(input || "").normalize("NFC");
  return Array.from(raw)
    .filter((char) => isSyncGuestPseudoCharAllowed(char))
    .join("")
    .slice(0, 32);
}

function normalizeSyncGuestPseudoValue(input) {
  if (
    SYNC_RUNTIME_HELPERS &&
    typeof SYNC_RUNTIME_HELPERS.normalizeGuestPseudoValue === "function"
  ) {
    return SYNC_RUNTIME_HELPERS.normalizeGuestPseudoValue(input);
  }
  return sanitizeSyncGuestPseudoInputValue(input).replace(/\s+/g, " ").trim();
}

function notifySyncGuestPseudoValidationError(inputEl = null) {
  if (inputEl) {
    flashSyncSessionInputError(inputEl);
  }
  const nowMs = Date.now();
  if (nowMs - syncSessionLastPseudoValidationToastAt < 1200) {
    return;
  }
  syncSessionLastPseudoValidationToastAt = nowMs;
  showSyncSessionToast({
    type: "error",
    message: getI18nText("sync.errorPseudoInvalid", "Nickname: letters and spaces only."),
    duration: 2000,
  });
}

function getSyncSessionErrorMessage(error) {
  let helperMessage = "";
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.getErrorMessage === "function"
  ) {
    helperMessage = String(
      SYNC_SESSION_MODAL_HELPERS.getErrorMessage(error) || "",
    ).trim();
    if (helperMessage && helperMessage !== "Sync action failed.") {
      return helperMessage;
    }
  }
  const code =
    error && typeof error === "object" && typeof error.message === "string"
      ? error.message
      : "";
  if (code === "unknown-action") {
    return getI18nText("sync.errorProtocolMismatch", "Sync protocol mismatch. Restart relay and update both apps.");
  }
  if (code.startsWith("unknown-action:")) {
    const actionName = String(
      code.slice("unknown-action:".length) || "",
    ).trim();
    const base = getI18nText("sync.errorProtocolMismatch", "Sync protocol mismatch. Restart relay and update both apps.");
    return actionName ? `${base} (${actionName})` : base;
  }

  if (code === "missing-session-code") return getI18nText("sync.errorMissingSessionCode", "Please enter a session code first.");
  if (code === "invalid-session-code") return getI18nText("sync.errorInvalidSessionCode", "Invalid session code format.");
  if (code === "session-not-found") return getI18nText("sync.errorSessionNotFound", "Session not found.");
  if (code === "invalid-password") return getI18nText("sync.errorInvalidPassword", "Invalid password.");
  if (code === "invalid-client-id") return getI18nText("sync.errorForbiddenIdentity", "Invalid participant identity.");
  if (code === "invalid-host-client-id") return getI18nText("sync.errorInvalidHostIdentity", "Invalid host identity.");
  if (code === "invalid-session-state") return getI18nText("sync.errorInvalidSyncPayload", "Invalid sync payload.");
  if (code === "session-state-too-large") return getI18nText("sync.errorSyncPayloadTooLarge", "Sync payload too large.");
  if (code === "invalid-request") return getI18nText("sync.errorInvalidRequest", "Invalid sync request.");
  if (code === "invalid-session-pack") return getI18nText("sync.errorInvalidSessionPack", "Invalid session pack.");
  if (code === "session-pack-too-large") return getI18nText("sync.errorSessionPackTooLarge", "Session pack is too large.");
  if (code === "session-pack-not-found") return getI18nText("sync.errorSessionPackNotFound", "No online session pack available yet.");
  if (code === "invalid-session-media") return getI18nText("sync.errorInvalidSessionMedia", "Invalid session media payload.");
  if (code === "session-media-too-large") return getI18nText("sync.errorSessionMediaTooLarge", "Session media payload is too large.");
  if (code === "session-media-not-found") return getI18nText("sync.errorSessionMediaNotFound", "No online session media available yet.");
  if (code === "session-media-incomplete") return getI18nText("sync.errorSessionMediaIncomplete", "Online media download incomplete. Please retry download.");
  if (code.startsWith("session-media-incomplete:")) {
    const details = code.slice("session-media-incomplete:".length).trim();
    const base = getI18nText("sync.errorSessionMediaIncomplete", "Online media download incomplete. Please retry download.");
    return details ? `${base} (${details})` : base;
  }
  if (code === "session-media-file-not-found") return getI18nText("sync.errorSessionMediaFileNotFound", "Online session media file not found.");
  if (code === "session-media-unsupported-type") return getI18nText("sync.errorSessionMediaUnsupportedType", "Unsupported media format for online sync.");
  if (code === "forbidden-host-impersonation") return getI18nText("sync.errorForbiddenIdentity", "Invalid participant identity.");
  if (code === "duplicate-client-id") return getI18nText("sync.errorDuplicateClient", "A participant with the same identity is already connected.");
  if (code === "room-full") return getI18nText("sync.errorRoomFull", "Session is full.");
  if (code === "already-joined") return getI18nText("sync.errorAlreadyJoined", "Already connected to this session.");
  if (code === "not-joined") return getI18nText("sync.errorNotJoined", "You are not connected to this session.");
  if (code === "rate-limited") return getI18nText("sync.errorRateLimited", "Too many requests. Please wait a moment.");
  if (code === "state-rate-limited") return getI18nText("sync.errorStateRateLimited", "Sync updates are too frequent. Please slow down.");
  if (code === "rtc-rate-limited") return getI18nText("sync.errorRtcRateLimited", "Real-time signaling is too frequent. Please slow down.");
  if (code === "media-transfer-disabled") return getI18nText("sync.errorMediaTransferDisabled", "Online media transfer is disabled on this relay.");
  if (code === "session-already-exists") return getI18nText("sync.errorSessionAlreadyExists", "This session code already exists.");
  if (code === "transport-unavailable") return getI18nText("sync.errorTransportUnavailable", "Sync transport unavailable.");
  if (code === "websocket-unavailable") return getI18nText("sync.errorWsUnavailable", "WebSocket unavailable in this runtime.");
  if (code === "websocket-url-missing") return getI18nText("sync.errorWsUrlMissing", "WebSocket URL is missing.");
  if (code === "websocket-not-open") return getI18nText("sync.errorWsNotConnected", "WebSocket is not connected.");
  if (code === "websocket-connect-failed") return getI18nText("sync.errorWsConnectFailed", "WebSocket connection failed.");
  if (code === "websocket-connect-closed") return getI18nText("sync.errorWsConnectClosed", "WebSocket closed during connection.");
  if (code === "websocket-disconnected") return getI18nText("sync.errorWsDisconnected", "WebSocket disconnected.");
  if (code === "websocket-request-timeout") return getI18nText("sync.errorWsRequestTimeout", "WebSocket request timeout.");
  if (code === "webrtc-unavailable") return getI18nText("sync.errorWebrtcUnavailable", "WebRTC unavailable in this runtime.");
  if (code === "webrtc-signaling-unavailable") return getI18nText("sync.errorWebrtcSignalingUnavailable", "WebRTC signaling transport unavailable.");
  if (code === "webrtc-signaling-url-missing") return getI18nText("sync.errorWebrtcSignalingUrlMissing", "WebRTC signaling URL is missing.");
  if (code === "webrtc-peer-failed") return getI18nText("sync.errorWebrtcPeerFailed", "WebRTC peer connection failed.");
  if (code === "webrtc-not-ready") return getI18nText("sync.errorWebrtcNotReady", "WebRTC peer channel is not ready.");
  if (code === "webrtc-media-unavailable") return getI18nText("sync.errorWebrtcMediaUnavailable", "Host media is not available on P2P yet.");
  if (code === "webrtc-file-transfer-failed") return getI18nText("sync.errorWebrtcTransferFailed", "P2P media transfer failed. Falling back to relay.");
  if (code === "webrtc-file-transfer-incomplete") return getI18nText("sync.errorWebrtcTransferIncomplete", "P2P media transfer incomplete. Falling back to relay.");
  if (code === "webrtc-request-timeout") return getI18nText("sync.errorWebrtcRequestTimeout", "P2P request timeout. Falling back to relay.");
  if (code === "invalid-rtc-signal") return getI18nText("sync.errorInvalidRtcSignal", "Invalid real-time signaling payload.");
  if (code === "request-failed") return getI18nText("sync.errorRequestFailed", "Sync request failed.");
  if (code === "session-pack-integrity-failed") return getI18nText("sync.onlinePackIntegrityFailed", "Online config pack integrity check failed.");
  if (code === "session-closed") return getI18nText("sync.errorSessionClosed", "The host closed this session.");
  if (code) return `${getI18nText("sync.errorDefault", "Sync action failed.")} (${code}).`;
  return helperMessage || getI18nText("sync.errorDefault", "Sync action failed.");
}

function renderSyncSessionStatus(modal, snapshot = null) {
  if (!modal) return;
  const state = snapshot || syncSessionServiceState;
  hideSyncSessionParticipantsTooltip();
  updateSyncSessionVisualIndicators(state);
  updateSyncSessionModalPanelsVisibility(modal, state);
  updateSyncSessionCodeUi(modal, state?.sessionCode);
  updateSyncSessionNetworkStatus(modal, state);
  updateSyncSessionGuestActionNotificationsUi(modal);
  if (!state || typeof state !== "object") {
    const label =
      syncSessionTransportMode === "webrtc"
        ? getI18nText("sync.statusSyncReadyWebrtc", "WebRTC sync ready.")
        : syncSessionTransportMode === "ws"
          ? getI18nText("sync.statusSyncReadyWs", "WebSocket sync ready.")
          : getI18nText("sync.statusSyncReadyMock", "Local sync mock ready.");
    setSyncSessionStatus(modal, label, "");
    return;
  }

  if (state.status === "connecting") {
    if (!syncConnectingStartedAt) syncConnectingStartedAt = Date.now();
    const elapsedMs = Date.now() - syncConnectingStartedAt;
    if (elapsedMs > 45000) {
      setSyncSessionStatus(
        modal,
        getI18nText("sync.errorConnectTimeout", "Unable to reach the server. Check the relay URL."),
        "error",
      );
    } else if (elapsedMs > 5000) {
      setSyncSessionStatus(
        modal,
        getI18nText("sync.statusServerWaking", "The server is waking up, please wait up to 30 seconds..."),
        "warning",
        { loadingDots: true },
      );
    } else {
      setSyncSessionStatus(
        modal,
        getI18nText("sync.statusConnecting", "Connecting..."),
        "warning",
        { loadingDots: true },
      );
    }
    return;
  }
  syncConnectingStartedAt = 0;

  if (state.status === "hosting") {
    setSyncSessionHostingStatus(modal, state);
    return;
  }

  if (state.status === "joined") {
    setSyncSessionJoinedStatus(modal, state);
    return;
  }

  if (state.status === "idle") {
    setSyncSessionStatus(
      modal,
      getI18nText("sync.toastNoActiveSession", "No active sync session."),
      "",
    );
    return;
  }

  if (state.lastError) {
    setSyncSessionStatus(
      modal,
      getSyncSessionErrorMessage({ message: state.lastError }),
      "error",
    );
    return;
  }

  setSyncSessionStatus(
    modal,
    getI18nText("sync.toastNoActiveSession", "No active sync session."),
    "",
  );
}

function isSyncSessionConnectedAsParticipant(snapshot = null) {
  const state = snapshot || syncSessionServiceState;
  return !!(
    state &&
    state.role === "participant" &&
    state.status === "joined" &&
    state.sessionCode
  );
}

function isSyncSessionConnectedAsHost(snapshot = null) {
  const state = snapshot || syncSessionServiceState;
  return !!(
    state &&
    state.role === "host" &&
    state.status === "hosting" &&
    state.sessionCode
  );
}

function isSyncSessionActive(snapshot = null) {
  return (
    isSyncSessionConnectedAsParticipant(snapshot) ||
    isSyncSessionConnectedAsHost(snapshot)
  );
}

function isSyncSessionOnlineForHistory(snapshot = null) {
  const state = snapshot || syncSessionServiceState;
  if (!state || typeof state !== "object") return false;
  const role = String(state.role || "").trim();
  const status = String(state.status || "").trim();
  const hasSessionCode = !!String(state.sessionCode || "").trim();
  if (!hasSessionCode) return false;
  if (role === "host" || role === "participant") return true;
  return status === "hosting" || status === "joined" || status === "connecting";
}

function updateSyncSessionModalPanelsVisibility(modal, snapshot = null) {
  if (!modal) return;
  const state = snapshot || syncSessionServiceState;
  const roleToggle = modal.querySelector(".sync-session-role-toggle");
  const noteEl = modal.querySelector(".sync-session-note");
  const hostPanel = modal.querySelector("#sync-session-host-panel");
  const joinPanel = modal.querySelector("#sync-session-join-panel");
  const connectedPanel = modal.querySelector("#sync-session-connected-panel");
  const packPanel = modal.querySelector("#sync-session-pack-panel");
  const exportPackBtn = modal.querySelector("#sync-session-export-pack-btn");
  const importPackBtn = modal.querySelector("#sync-session-import-pack-btn");
  const publishOnlinePackBtn = modal.querySelector(
    "#sync-session-publish-online-pack-btn",
  );
  const downloadOnlinePackBtn = modal.querySelector(
    "#sync-session-download-online-pack-btn",
  );
  const connectedAsParticipant = isSyncSessionConnectedAsParticipant(state);
  const connectedAsHost = isSyncSessionConnectedAsHost(state);
  const isActive = connectedAsParticipant || connectedAsHost;
  const hostRoleSelected = syncSessionModalRole === "host";
  const showHostSettingsPanel =
    connectedAsHost || (!isActive && hostRoleSelected);
  const showParticipantOnlineDownload = connectedAsParticipant;
  const leaveBtn = modal.querySelector("#sync-session-leave-btn");
  const leaveBtnLabel = leaveBtn?.querySelector(".sync-session-leave-label");
  const copyServerAddressHostBtn = modal.querySelector(
    "#sync-session-copy-server-address-host-btn",
  );
  const copyServerAddressConnectedBtn = modal.querySelector(
    "#sync-session-copy-server-address-connected-btn",
  );
  const isLocalConnectionType =
    UIPreferences.get("syncConnectionType", "local") === "local";
  const hasActiveSessionCode = !!String(state?.sessionCode || "").trim();
  const shouldShowCopyServerAddressButton =
    isActive && connectedAsHost && hasActiveSessionCode && isLocalConnectionType;

  // Connection type section toggle
  const connTypeRow = modal.querySelector(".sync-session-connection-type-row");

  if (roleToggle) roleToggle.classList.toggle("hidden", isActive);
  if (noteEl) noteEl.classList.toggle("hidden", isActive);
  if (connTypeRow) connTypeRow.classList.toggle("hidden", isActive);
  if (connectedPanel) connectedPanel.classList.toggle("hidden", !isActive);
  if (copyServerAddressHostBtn) {
    copyServerAddressHostBtn.classList.toggle(
      "hidden",
      !shouldShowCopyServerAddressButton,
    );
  }
  if (copyServerAddressConnectedBtn) {
    copyServerAddressConnectedBtn.classList.toggle(
      "hidden",
      !shouldShowCopyServerAddressButton,
    );
  }

  if (isActive) {
    if (hostPanel) hostPanel.classList.add("hidden");
    if (joinPanel) joinPanel.classList.add("hidden");
    if (leaveBtn) {
      if (connectedAsHost) {
        const closeLabel = getI18nText(
          "sync.closeOnlineSessionLabel",
          "Close online session",
        );
        if (leaveBtnLabel) {
          leaveBtnLabel.textContent = closeLabel;
        } else {
          leaveBtn.textContent = closeLabel;
        }
        leaveBtn.setAttribute(
          "data-i18n-tooltip",
          "sync.closeOnlineSessionTooltip",
        );
        leaveBtn.setAttribute(
          "data-tooltip",
          getI18nText(
            "sync.closeOnlineSessionTooltip",
            "Close online session for all participants",
          ),
        );
      } else {
        const leaveLabel = getI18nText(
          "sync.leaveOnlineSessionLabel",
          "Leave current session",
        );
        if (leaveBtnLabel) {
          leaveBtnLabel.textContent = leaveLabel;
        } else {
          leaveBtn.textContent = leaveLabel;
        }
        leaveBtn.setAttribute(
          "data-i18n-tooltip",
          "sync.leaveOnlineSessionTooltip",
        );
        leaveBtn.setAttribute(
          "data-tooltip",
          getI18nText(
            "sync.leaveOnlineSessionTooltip",
            "Leave current online session",
          ),
        );
      }
    }
    const notifyToggle = connectedPanel?.querySelector(
      ".sync-session-inline-toggle",
    );
    if (notifyToggle) {
      notifyToggle.classList.toggle("hidden", !connectedAsParticipant);
    }

    // --- Live control mode: move selector into connected panel when hosting ---
    if (connectedAsHost && connectedPanel && hostPanel) {
      const controlModeLabel = modal.querySelector(
        'label[for="sync-session-control-mode-trigger"]',
      );
      const controlModeSelect = modal.querySelector(
        "#sync-session-control-mode-select",
      );
      const leaveBtn2 = connectedPanel.querySelector("#sync-session-leave-btn");
      if (controlModeLabel && controlModeSelect) {
        if (leaveBtn2) {
          connectedPanel.insertBefore(controlModeLabel, leaveBtn2);
          connectedPanel.insertBefore(controlModeSelect, leaveBtn2);
        } else {
          connectedPanel.appendChild(controlModeLabel);
          connectedPanel.appendChild(controlModeSelect);
        }
        const controlModeTrigger = controlModeSelect.querySelector(
          "#sync-session-control-mode-trigger",
        );
        if (controlModeTrigger) {
          controlModeTrigger.disabled = false;
          controlModeTrigger.removeAttribute("aria-disabled");
        }
        // Sync the select value with the current server-side state
        const serverControlMode = String(state.controlMode || "host-only").trim();
        updateSyncSessionControlModeSelect(modal, serverControlMode);
      }
    }
  } else {
    // --- Move control mode selector back to host panel when disconnected ---
    if (hostPanel && connectedPanel) {
      const controlModeLabel = connectedPanel.querySelector(
        'label[for="sync-session-control-mode-trigger"]',
      );
      const controlModeSelect = connectedPanel.querySelector(
        "#sync-session-control-mode-select",
      );
      if (controlModeLabel && controlModeSelect) {
        // Insert before the password label (first label after local section)
        const passwordLabel = hostPanel.querySelector(
          'label[for="sync-session-host-password"]',
        );
        if (passwordLabel) {
          hostPanel.insertBefore(controlModeLabel, passwordLabel);
          hostPanel.insertBefore(controlModeSelect, passwordLabel);
        } else {
          hostPanel.appendChild(controlModeLabel);
          hostPanel.appendChild(controlModeSelect);
        }
      }
    }
    const wantHost = syncSessionModalRole === "host";
    const outgoing = wantHost ? joinPanel : hostPanel;
    const incoming = wantHost ? hostPanel : joinPanel;
    const slideDirection = wantHost ? "reverse" : "forward";

    // If outgoing is already hidden, just show incoming directly
    if (!outgoing || outgoing.classList.contains("hidden")) {
      if (incoming) {
        incoming.classList.remove("hidden", "panel-slide-out-left", "panel-slide-out-right", "panel-slide-in", "panel-slide-in-reverse");
      }
      if (outgoing) outgoing.classList.add("hidden");
    } else if (incoming && outgoing) {
      // 1. Lock the modal body height to its current value
      const modalBody = modal.querySelector(".sync-session-modal-body");
      const lockedHeight = modalBody ? modalBody.offsetHeight : 0;
      if (modalBody) {
        modalBody.style.transition = "none";
        modalBody.style.height = lockedHeight + "px";
        modalBody.style.overflow = "hidden";
      }

      const exitClass = slideDirection === "forward" ? "panel-slide-out-left" : "panel-slide-out-right";
      const enterClass = slideDirection === "forward" ? "panel-slide-in" : "panel-slide-in-reverse";

      // 2. Slide out old panel
      outgoing.classList.add(exitClass);

      setTimeout(() => {
        // 3. Swap panels (still height-locked, no jump)
        outgoing.classList.add("hidden");
        outgoing.classList.remove(exitClass);
        incoming.classList.remove("hidden");
        incoming.classList.add(enterClass);

        // 4. Slide in new panel
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            incoming.classList.remove(enterClass);
          });
        });

        // 5. After slide-in completes, THEN smoothly resize height
        setTimeout(() => {
          if (modalBody) {
            const targetHeight = modalBody.scrollHeight;
            modalBody.style.transition = "height 0.25s ease";
            modalBody.style.height = targetHeight + "px";

            setTimeout(() => {
              modalBody.style.height = "";
              modalBody.style.overflow = "";
              modalBody.style.transition = "";
            }, 280);
          }
        }, 220);
      }, 200);
    }
  }

  if (packPanel) {
    const showPackPanel =
      showHostSettingsPanel || showParticipantOnlineDownload;
    packPanel.classList.toggle("hidden", !showPackPanel);
  }

  if (exportPackBtn) {
    exportPackBtn.classList.toggle("hidden", !showHostSettingsPanel);
  }
  if (importPackBtn) {
    importPackBtn.classList.toggle("hidden", !showHostSettingsPanel);
  }
  if (publishOnlinePackBtn) {
    publishOnlinePackBtn.classList.toggle(
      "hidden",
      !connectedAsHost || !syncSessionMediaTransferEnabled,
    );
  }
  if (downloadOnlinePackBtn) {
    downloadOnlinePackBtn.classList.toggle(
      "hidden",
      !showParticipantOnlineDownload || !syncSessionMediaTransferEnabled,
    );
  }

  updateSyncSessionInvitePanelVisibility(modal, state);
}

function ensureSyncRuntimeStatusBadge() {
  if (
    syncRuntimeStatusBadgeEl &&
    document.body &&
    document.body.contains(syncRuntimeStatusBadgeEl)
  ) {
    return syncRuntimeStatusBadgeEl;
  }

  if (!document || !document.body) return null;
  const badgeEl = document.createElement("div");
  badgeEl.id = "sync-runtime-status-badge";
  badgeEl.className = "sync-runtime-status-badge";
  badgeEl.setAttribute("role", "status");
  badgeEl.setAttribute("aria-live", "polite");
  document.body.appendChild(badgeEl);
  syncRuntimeStatusBadgeEl = badgeEl;
  return badgeEl;
}

function getSyncControlModeLabel(controlMode) {
  const config = getSyncSessionControlModeConfig(controlMode);
  return getI18nText(config.key, config.fallback);
}

function getSyncParticipantIds(snapshot = null) {
  const data = snapshot || syncSessionServiceState;
  if (!data || !Array.isArray(data.participantIds)) return [];
  return data.participantIds
    .map((id) => String(id || "").trim())
    .filter((id) => !!id);
}

function getSyncParticipantProfiles(snapshot = null) {
  const data = snapshot || syncSessionServiceState;
  if (!data || typeof data !== "object" || !data.participantProfiles) return {};
  const out = {};
  Object.keys(data.participantProfiles).forEach((id) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return;
    out[normalizedId] = String(data.participantProfiles[id] || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 32);
  });
  return out;
}

function normalizeSyncParticipantSyncState(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (value === "ready") return "ready";
  if (value === "connecting" || value === "downloading") {
    return value;
  }
  return "missing";
}

function getSyncParticipantSyncStates(snapshot = null) {
  const data = snapshot || syncSessionServiceState;
  if (!data || typeof data !== "object" || !data.participantSyncStates)
    return {};
  const out = {};
  Object.keys(data.participantSyncStates).forEach((id) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return;
    out[normalizedId] = normalizeSyncParticipantSyncState(
      data.participantSyncStates[id],
    );
  });
  return out;
}

function getSyncParticipantSyncState(clientId, states = null) {
  const normalizedId = String(clientId || "").trim();
  if (!normalizedId) return "missing";
  const source =
    states && typeof states === "object"
      ? states
      : getSyncParticipantSyncStates();
  return normalizeSyncParticipantSyncState(source?.[normalizedId]);
}

function getSyncParticipantDisplayName(clientId, profiles = {}) {
  const normalizedId = String(clientId || "").trim();
  if (!normalizedId) return "";
  const name = String(profiles?.[normalizedId] || "").trim();
  if (name) return name;
  return "Un participant";
}

function getSyncParticipantSelfSyncState(snapshot = null) {
  const stateSnapshot = snapshot || syncSessionServiceState;
  if (!stateSnapshot || typeof stateSnapshot !== "object") return "";
  const selfClientId = String(stateSnapshot.clientId || "").trim();
  if (!selfClientId) return "";
  return getSyncParticipantSyncState(
    selfClientId,
    getSyncParticipantSyncStates(stateSnapshot),
  );
}

function getDesiredSyncParticipantState(snapshot = null) {
  const stateSnapshot = snapshot || syncSessionServiceState;
  if (
    !stateSnapshot ||
    stateSnapshot.role !== "participant" ||
    stateSnapshot.status !== "joined"
  ) {
    return "";
  }
  if (syncParticipantTransferInProgress) {
    return "downloading";
  }
  const requiresValidation =
    shouldRequireSyncParticipantPackValidation(stateSnapshot) &&
    !isSyncParticipantPackValidationCurrent(stateSnapshot);
  return requiresValidation ? "missing" : "ready";
}

function refreshSyncParticipantPublishedState(snapshot = null) {
  const stateSnapshot = snapshot || syncSessionServiceState;
  if (
    !stateSnapshot ||
    stateSnapshot.role !== "participant" ||
    stateSnapshot.status !== "joined"
  ) {
    syncParticipantLastPublishedSyncState = "";
    syncParticipantLastPublishedSessionCode = "";
    syncParticipantTransferInProgress = false;
    return;
  }
  syncParticipantLastPublishedSessionCode = String(
    stateSnapshot.sessionCode || "",
  ).trim();
  syncParticipantLastPublishedSyncState =
    getSyncParticipantSelfSyncState(stateSnapshot);
}

async function publishSyncParticipantState(syncState, options = {}) {
  const normalizedState = normalizeSyncParticipantSyncState(syncState);
  const stateSnapshot = syncSessionServiceState;
  if (
    !stateSnapshot ||
    stateSnapshot.role !== "participant" ||
    stateSnapshot.status !== "joined"
  ) {
    return false;
  }
  const sessionCode = String(stateSnapshot.sessionCode || "").trim();
  if (!sessionCode) return false;
  const force = options?.force === true;
  if (
    !force &&
    syncParticipantLastPublishedSessionCode === sessionCode &&
    syncParticipantLastPublishedSyncState === normalizedState
  ) {
    return false;
  }
  if (
    !syncSessionService ||
    typeof syncSessionService.updateParticipantState !== "function"
  ) {
    return false;
  }
  try {
    await syncSessionService.updateParticipantState({
      syncState: normalizedState,
    });
    syncParticipantLastPublishedSessionCode = sessionCode;
    syncParticipantLastPublishedSyncState = normalizedState;
    return true;
  } catch (error) {
    console.warn("[Sync] Failed to publish participant state:", error);
    return false;
  }
}

function updateSyncSessionVisualIndicators(snapshot = null) {
  const state = snapshot || syncSessionServiceState;
  const syncEnabled = isSyncFeatureEnabled();
  const syncBtn = document.getElementById("titlebar-sync-btn");
  const modalTitleIconEl = document.getElementById(
    "sync-session-modal-title-icon",
  );
  const badgeEl = syncEnabled
    ? ensureSyncRuntimeStatusBadge()
    : document.getElementById("sync-runtime-status-badge");
  const settingsScreenEl = document.getElementById("settings-screen");
  const settingsReadonlyBadgeEl = document.getElementById(
    "sync-settings-readonly-badge",
  );
  const syncTitle = getI18nText("sync.title", "Online sync");
  const hostOnlyLabel = getI18nText(
    "sync.badgeHostControlsOnly",
    "Host controls only",
  );
  const sharedPauseLabel = getI18nText(
    "sync.badgeSharedControls",
    "Shared controls",
  );

  if (syncBtn) {
    syncBtn.classList.remove(
      "is-idle",
      "is-connecting",
      "is-hosting",
      "is-joined",
    );
  }
  if (modalTitleIconEl) {
    modalTitleIconEl.classList.remove(
      "is-idle",
      "is-connecting",
      "is-hosting",
      "is-joined",
    );
  }
  if (badgeEl) {
    badgeEl.classList.remove("is-hosting", "is-joined", "is-visible");
    badgeEl.textContent = "";
  }
  if (settingsScreenEl) {
    settingsScreenEl.classList.remove("sync-participant-readonly");
  }
  if (settingsReadonlyBadgeEl) {
    settingsReadonlyBadgeEl.classList.add("hidden");
    settingsReadonlyBadgeEl.textContent = getI18nText(
      "sync.readonlyBadge",
      "Lecture seule: contrôlée par l'hôte",
    );
  }

  if (!syncEnabled) {
    const modal = document.getElementById("sync-session-modal");
    if (syncBtn) {
      syncBtn.classList.add("hidden");
      syncBtn.setAttribute("aria-hidden", "true");
      syncBtn.setAttribute("tabindex", "-1");
      syncBtn.setAttribute("data-tooltip", syncTitle);
    }
    if (modalTitleIconEl) {
      modalTitleIconEl.classList.add("is-idle");
    }
    if (badgeEl) {
      badgeEl.classList.add("hidden");
      badgeEl.classList.remove("is-hosting", "is-joined", "is-visible");
      badgeEl.textContent = "";
    }
    if (modal && !modal.classList.contains("hidden")) {
      modal.classList.add("hidden");
    }
    return;
  }

  if (syncBtn) {
    syncBtn.classList.remove("hidden");
    syncBtn.removeAttribute("aria-hidden");
    syncBtn.removeAttribute("tabindex");
  }
  if (badgeEl) {
    badgeEl.classList.remove("hidden");
  }

  if (!state || typeof state !== "object") {
    if (syncBtn) {
      syncBtn.classList.add("is-idle");
      syncBtn.setAttribute("data-tooltip", syncTitle);
    }
    if (modalTitleIconEl) {
      modalTitleIconEl.classList.add("is-idle");
    }
    return;
  }

  if (state.status === "connecting") {
    if (syncBtn) {
      syncBtn.classList.add("is-connecting");
      syncBtn.setAttribute("data-tooltip", `${syncTitle} - Connecting...`);
    }
    if (modalTitleIconEl) {
      modalTitleIconEl.classList.add("is-connecting");
    }
    return;
  }

  if (state.status === "hosting" && state.sessionCode) {
    const modeLabel =
      String(state.controlMode || "").trim() === "shared-pause"
        ? sharedPauseLabel
        : hostOnlyLabel;
    const participants = Math.max(0, Number(state.participantsCount || 0) || 0);
    const tooltip = `${getI18nText(
      "sync.hostBadgePrefix",
      "Hosting online session",
    )} (${String(modeLabel || hostOnlyLabel)})`;
    if (syncBtn) {
      syncBtn.classList.add("is-hosting");
      syncBtn.setAttribute("data-tooltip", tooltip);
    }
    if (modalTitleIconEl) {
      modalTitleIconEl.classList.add("is-hosting");
    }
    if (badgeEl) {
      const badgeText =
        participants > 1
          ? `${tooltip} — ${participants} participants`
          : tooltip;
      badgeEl.textContent = badgeText;
      badgeEl.classList.add("is-hosting", "is-visible");
    }
    return;
  }

  if (state.status === "joined" && state.sessionCode) {
    const modeLabel =
      String(state.controlMode || "").trim() === "shared-pause"
        ? sharedPauseLabel
        : hostOnlyLabel;
    const tooltip = `${getI18nText(
      "sync.guestBadgePrefix",
      "Connected to online session",
    )} (${String(modeLabel || hostOnlyLabel)})`;
    if (syncBtn) {
      syncBtn.classList.add("is-joined");
      syncBtn.setAttribute("data-tooltip", tooltip);
    }
    if (modalTitleIconEl) {
      modalTitleIconEl.classList.add("is-joined");
    }
    if (settingsScreenEl) {
      settingsScreenEl.classList.add("sync-participant-readonly");
    }
    if (settingsReadonlyBadgeEl) {
      settingsReadonlyBadgeEl.classList.remove("hidden");
    }
    if (badgeEl) {
      badgeEl.textContent = tooltip;
      badgeEl.classList.add("is-joined", "is-visible");
    }
    return;
  }

  if (syncBtn) {
    syncBtn.classList.add("is-idle");
    syncBtn.setAttribute("data-tooltip", syncTitle);
  }
  if (modalTitleIconEl) {
    modalTitleIconEl.classList.add("is-idle");
  }
}

function ensureSyncSessionService(modal) {
  if (!isSyncFeatureEnabled()) {
    if (modal) {
      setSyncSessionStatus(
        modal,
        getI18nText("sync.errorSyncDisabled", "Online sync is disabled in configuration."),
        "warning",
      );
      setSyncSessionNetworkStatus(modal, getI18nText("sync.networkUnavailable", "Network: unavailable."), "error");
    }
    return null;
  }

  if (syncSessionService) {
    renderSyncSessionStatus(modal);
    return syncSessionService;
  }

  if (typeof SHARED_SYNC_SESSION_SERVICE_FACTORY !== "function") {
    logMissingShared("createSyncSessionService");
    setSyncSessionStatus(
      modal,
      getI18nText("sync.errorServiceUnavailable", "Sync service unavailable in this build."),
      "error",
    );
    setSyncSessionNetworkStatus(modal, getI18nText("sync.networkUnavailable", "Network: unavailable."), "error");
    return null;
  }

  try {
    const transportEntry = createSyncSessionTransport();
    const transport = transportEntry.transport;
    syncSessionTransportMode = transportEntry.mode || "mock";
    syncSessionTransportUrl = transportEntry.wsUrl || "";
    syncSessionMediaTransferEnabled =
      transportEntry.mediaTransferEnabled !== false;

    syncSessionService = SHARED_SYNC_SESSION_SERVICE_FACTORY({
      transport,
      logger: (...args) => console.warn(...args),
    });
  } catch (error) {
    console.warn("[Sync] Service init failed:", error);
    syncSessionService = null;
  }

  if (
    syncSessionService &&
    typeof syncSessionService.subscribe === "function"
  ) {
    if (typeof syncSessionServiceUnsubscribe === "function") {
      try {
        syncSessionServiceUnsubscribe();
      } catch (_) {}
    }
    syncSessionServiceUnsubscribe = syncSessionService.subscribe(
      (nextState) => {
        const previousStateSnapshot = syncSessionServiceState;
        const previousSessionCode = String(
          previousStateSnapshot?.sessionCode || "",
        ).trim();
        const nextSessionCode = String(nextState?.sessionCode || "").trim();
        const previousP2pFallbackActive =
          !!previousStateSnapshot?.p2pFallbackActive;
        const nextP2pFallbackActive = !!nextState?.p2pFallbackActive;
        const previousParticipantsCount = syncSessionLastParticipantsCount;
        const nextParticipantsCount = Math.max(
          0,
          Number(nextState?.participantsCount || 0) || 0,
        );
        const previousParticipantIds = getSyncParticipantIds(
          previousStateSnapshot,
        );
        const nextParticipantIds = getSyncParticipantIds(nextState);
        const previousProfiles = getSyncParticipantProfiles(
          previousStateSnapshot,
        );
        const nextProfiles = getSyncParticipantProfiles(nextState);
        syncSessionServiceState = nextState;
        if (isSyncSessionOnlineForHistory(nextState)) {
          state.sessionWasOnline = true;
        }
        refreshSyncParticipantPublishedState(nextState);
        if (
          !nextState ||
          nextState.role !== "participant" ||
          nextState.status !== "joined" ||
          !nextSessionCode ||
          (previousSessionCode && previousSessionCode !== nextSessionCode)
        ) {
          clearSyncParticipantPackValidation();
        }
        updateSyncSessionVisualIndicators(nextState);
        syncSessionLastParticipantsCount = nextParticipantsCount;
        const activeModal = document.getElementById("sync-session-modal");
        if (activeModal) {
          renderSyncSessionStatus(activeModal, nextState);
        }

        if (
          syncSessionTransportMode === "webrtc" &&
          nextState &&
          nextState.role === "host" &&
          nextState.status === "hosting" &&
          typeof window.showPoseChronoToast === "function" &&
          previousP2pFallbackActive !== nextP2pFallbackActive
        ) {
          if (nextP2pFallbackActive) {
            const relayCount = Math.max(
              0,
              Number(nextState?.p2pRelayParticipantsCount || 0) || 0,
            );
            const meshLimit = Math.max(
              0,
              Number(nextState?.p2pMeshLimit || 0) || 0,
            );
            const fallbackReason = String(
              nextState?.p2pFallbackReason || "",
            ).trim();
            const fallbackMessage =
              fallbackReason === "peer-failed"
                ? getI18nText(
                    "sync.p2pPeerFallbackToast",
                    "P2P link degraded. Relay fallback is active for stability.",
                  )
                : getI18nText(
                    "sync.p2pMeshLimitToast",
                    "P2P mesh limit reached: {{count}} participant(s) now use relay fallback (limit {{limit}}).",
                    { count: relayCount, limit: meshLimit || 0 },
                  )
                    .replace("{{count}}", String(relayCount))
                    .replace("{{limit}}", String(meshLimit || 0));
            showSyncSessionToast({
              type: "warning",
              message: fallbackMessage,
              duration: 3200,
            });
          } else {
            showSyncSessionToast({
              type: "success",
              message: getI18nText(
                "sync.p2pFallbackClearedToast",
                "P2P full-mesh restored. Relay fallback is no longer needed.",
              ),
              duration: 2200,
            });
          }
        }

        if (
          nextState &&
          nextState.role === "participant" &&
          nextState.status === "joined"
        ) {
          const desiredParticipantState =
            getDesiredSyncParticipantState(nextState);
          const currentParticipantState =
            getSyncParticipantSelfSyncState(nextState);
          if (
            desiredParticipantState &&
            desiredParticipantState !== currentParticipantState
          ) {
            void publishSyncParticipantState(desiredParticipantState);
          }
        }

        if (
          nextState &&
          nextState.role === "host" &&
          nextState.status === "hosting" &&
          previousParticipantsCount !== null &&
          previousParticipantsCount >= 0 &&
          typeof window.showPoseChronoToast === "function"
        ) {
          const delta = nextParticipantsCount - previousParticipantsCount;
          if (delta > 0) {
            const hostClientId = String(nextState.hostClientId || "").trim();
            const joinedIds = nextParticipantIds.filter(
              (clientId) => !previousParticipantIds.includes(clientId),
            );
            const joinedNonHostIds = joinedIds.filter(
              (clientId) => clientId !== hostClientId,
            );
            const joinedParticipants = joinedIds
              .filter((clientId) => clientId !== hostClientId)
              .map((clientId) =>
                getSyncParticipantDisplayName(clientId, nextProfiles),
              )
              .filter((name) => !!name);
            const joinedNonHostCount = joinedNonHostIds.length;
            if (joinedNonHostCount > 0) {
              const message =
                joinedParticipants.length === 1
                  ? `${joinedParticipants[0]} a rejoint la session.`
                  : joinedParticipants.length > 1
                    ? `${joinedParticipants.join(", ")} ont rejoint la session.`
                    : joinedNonHostCount > 1
                      ? `${joinedNonHostCount} participants ont rejoint la session en ligne.`
                      : "Un participant a rejoint la session en ligne.";
              window.showPoseChronoToast({
                type: "success",
                message,
                duration: 2200,
              });
            }
          } else if (delta < 0) {
            const hostClientId = String(
              previousStateSnapshot?.hostClientId || "",
            ).trim();
            const leftIds = previousParticipantIds.filter(
              (clientId) => !nextParticipantIds.includes(clientId),
            );
            const leftNonHostIds = leftIds.filter(
              (clientId) => clientId !== hostClientId,
            );
            const leftParticipants = leftIds
              .filter((clientId) => clientId !== hostClientId)
              .map((clientId) =>
                getSyncParticipantDisplayName(clientId, previousProfiles),
              )
              .filter((name) => !!name);
            const leftCount = leftNonHostIds.length;
            if (leftCount > 0) {
              const message =
                leftParticipants.length === 1
                  ? `${leftParticipants[0]} a quitté la session.`
                  : leftParticipants.length > 1
                    ? `${leftParticipants.join(", ")} ont quitté la session.`
                    : leftCount > 1
                      ? `${leftCount} participants ont quitté la session en ligne.`
                      : "Un participant a quitté la session en ligne.";
              window.showPoseChronoToast({
                type: "warning",
                message,
                duration: 2200,
              });
            }
          }
        }

        if (
          nextState &&
          nextState.role === "participant" &&
          nextState.status === "joined" &&
          nextState.sharedSessionState &&
          typeof nextState.sharedSessionState === "object"
        ) {
          applyRemoteSyncRuntimeState(nextState.sharedSessionState);
        } else if (
          nextState &&
          nextState.role === "host" &&
          nextState.status === "hosting" &&
          nextState.controlMode === "shared-pause" &&
          nextState.sharedSessionState &&
          typeof nextState.sharedSessionState === "object"
        ) {
          applyRemoteSharedPlaybackForHost(nextState.sharedSessionState);
        } else if (!nextState || nextState.role !== "participant") {
          syncRuntimeLastAppliedRevision = 0;
          syncRuntimeLastAppliedCustomQueueFingerprint = "";
        }
        if (
          (!nextState ||
            !nextState.sessionCode ||
            nextState.status === "idle") &&
          syncOnlineMediaCacheByIdentity instanceof Map &&
          syncOnlineMediaCacheByIdentity.size > 0
        ) {
          clearSyncOnlineMediaCache();
        }
      },
    );
  }

  renderSyncSessionStatus(modal);
  updateSyncSessionVisualIndicators(syncSessionServiceState);
  return syncSessionService;
}

function isSyncSessionHostActive() {
  const state = syncSessionServiceState;
  return !!(
    state &&
    state.role === "host" &&
    state.status === "hosting" &&
    state.sessionCode
  );
}

function isSyncSessionParticipantActive() {
  const state = syncSessionServiceState;
  return !!(
    state &&
    state.role === "participant" &&
    state.status === "joined" &&
    state.sessionCode
  );
}

function isSyncControlModeSharedPause() {
  return (
    isSyncSessionParticipantActive() &&
    String(syncSessionServiceState?.controlMode || "").trim() === "shared-pause"
  );
}

async function requestSyncSharedPlayback(
  requestType = "pause",
  reason = "participant-shared-pause",
) {
  if (!isSyncControlModeSharedPause()) return false;
  const service = syncSessionService;
  if (!service) return false;
  const normalizedRequestType =
    String(requestType || "").trim() === "play" ? "play" : "pause";
  try {
    let ok = false;
    if (typeof service.requestSharedPlayback === "function") {
      ok = await service.requestSharedPlayback({
        requestType: normalizedRequestType,
        reason: String(
          reason ||
            (normalizedRequestType === "play"
              ? "participant-shared-play"
              : "participant-shared-pause"),
        ),
      });
    } else if (
      normalizedRequestType === "pause" &&
      typeof service.requestSharedPause === "function"
    ) {
      ok = await service.requestSharedPause({
        reason: String(reason || "participant-shared-pause"),
      });
    }
    return !!ok;
  } catch (error) {
    console.warn(
      `[Sync] Shared ${normalizedRequestType} request failed:`,
      error,
    );
    return false;
  }
}

function maybeShowSharedPlaybackFeedback(sourceClientId, requestType) {
  if (typeof window.showPoseChronoToast !== "function") return;
  const actorId = String(sourceClientId || "").trim();
  if (!actorId) return;
  const action = String(requestType || "").trim();
  if (action !== "pause" && action !== "play") return;

  const nowMs = Date.now();
  if (nowMs - syncSharedPlaybackFeedbackToastAt < 400) {
    return;
  }
  syncSharedPlaybackFeedbackToastAt = nowMs;

  const profiles = getSyncParticipantProfiles(syncSessionServiceState);
  const actorName = getSyncParticipantDisplayName(actorId, profiles);
  const message =
    action === "pause"
      ? `${actorName} a mis la session en pause.`
      : `${actorName} a relancé la session.`;

  window.showPoseChronoToast({
    type: "info",
    message,
    duration: 1800,
  });
}

function maybeShowParticipantHostActionFeedback(remoteState) {
  if (!isSyncSessionParticipantActive()) return;
  if (!remoteState || typeof remoteState !== "object") return;
  if (typeof window.showPoseChronoToast !== "function") return;
  if (!isSyncGuestActionNotificationsEnabled()) return;

  const reason = String(remoteState.reason || "").trim();
  let message = "";

  if (reason === "timer-reset") {
    message = getI18nText("sync.toastTimerReset", "The host reset the timer.");
  } else if (reason === "timer-paused") {
    message = getI18nText(
      "sync.toastTimerPaused",
      "The host paused the timer.",
    );
  } else if (reason === "timer-resumed") {
    message = getI18nText(
      "sync.toastTimerResumed",
      "The host resumed the timer.",
    );
  } else if (reason === "image-next-manual") {
    message = getI18nText(
      "sync.toastImageNext",
      "The host moved to the next image.",
    );
  } else if (reason === "image-next-auto") {
    message = getI18nText(
      "sync.toastImageNextAuto",
      "Next image (auto-advance).",
    );
  } else if (reason === "image-prev-manual") {
    message = getI18nText(
      "sync.toastImagePrev",
      "The host went back to the previous image.",
    );
  } else if (reason === "custom-step-next") {
    message = getI18nText(
      "sync.toastCustomStepNext",
      "The host moved to the next step.",
    );
  } else if (reason === "custom-group-next") {
    message = getI18nText(
      "sync.toastPoseGroupNext",
      "The host moved to the next pose group.",
    );
  } else if (reason === "custom-group-prev") {
    message = getI18nText(
      "sync.toastPoseGroupPrev",
      "The host went back to the previous pose group.",
    );
  }

  if (!message) return;

  const nowMs = Date.now();
  if (nowMs - syncHostActionFeedbackToastAt < 350) return;
  syncHostActionFeedbackToastAt = nowMs;

  window.showPoseChronoToast({
    type: "info",
    message,
    duration: 1700,
  });
}

function applyRemoteSharedPlaybackForHost(remoteState) {
  if (!remoteState || typeof remoteState !== "object") return false;
  if (!isSyncSessionHostActive()) return false;
  if (
    String(syncSessionServiceState?.controlMode || "").trim() !== "shared-pause"
  ) {
    return false;
  }
  const sourceClientId = String(remoteState.sourceClientId || "").trim();
  if (!sourceClientId) return false;
  if (
    sourceClientId === String(syncSessionServiceState?.clientId || "").trim()
  ) {
    return false;
  }
  const requestType = String(remoteState.requestType || "").trim();
  if (requestType !== "pause" && requestType !== "play") {
    return false;
  }
  const expectedIsPlaying = requestType === "play";
  if (remoteState.isPlaying !== expectedIsPlaying) {
    return false;
  }

  if (requestType === "pause") {
    if (state.isPlaying) {
      stopTimer();
    } else {
      state.isPlaying = false;
      updatePlayPauseIcon();
    }
    if (timerDisplay) timerDisplay.classList.add("timer-paused");
    if (pauseBadge) pauseBadge.classList.remove("hidden");
  } else {
    const drawingVisible =
      !!drawingScreen && !drawingScreen.classList.contains("hidden");
    if (!state.isPlaying && drawingVisible) {
      startTimer();
    } else {
      state.isPlaying = true;
      updatePlayPauseIcon();
    }
    if (timerDisplay) timerDisplay.classList.remove("timer-paused");
    if (pauseBadge) pauseBadge.classList.add("hidden");
  }

  maybeShowSharedPlaybackFeedback(sourceClientId, requestType);
  scheduleSyncRuntimeState("shared-playback-applied", { force: true });
  return true;
}

function hashSyncIdentity(input) {
  const value = String(input || "");
  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619);
    h2 = ((h2 << 5) + h2 + code) >>> 0;
  }
  const a = (h1 >>> 0).toString(36);
  const b = (h2 >>> 0).toString(36);
  return `${a}${b}`;
}

function getSyncMediaIdentity(item) {
  if (!item || typeof item !== "object") return "";
  const explicitIdentity = String(
    item.syncIdentity || item.identity || "",
  ).trim();
  if (explicitIdentity) return explicitIdentity;
  const filePath = String(item.filePath || item.path || item.file || "").trim();
  const fileNameFromPath = filePath ? filePath.split(/[\\/]/).pop() : "";
  const fallbackName = String(
    item.name || item.filename || item.fileName || fileNameFromPath || "",
  )
    .trim()
    .toLowerCase();
  const ext = String(item.ext || "")
    .trim()
    .toLowerCase();
  if (!fallbackName && !ext) {
    if (item.id !== undefined && item.id !== null) {
      return `id:${String(item.id)}`;
    }
    return "";
  }

  // Use filename only (not full path) so identity matches across machines
  // when sharing the same folder of images via network share or copy
  const rawIdentity = `${fallbackName}|${ext}`;
  return `k:${hashSyncIdentity(rawIdentity)}`;
}

function normalizeRuntimeMediaPath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (
    lower.startsWith("blob:") ||
    lower.startsWith("data:") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://")
  ) {
    return value;
  }
  const normalizeAndEncode = (input) => {
    const normalized = String(input || "").replace(/\\/g, "/");
    try {
      return encodeURI(decodeURI(normalized));
    } catch (_) {
      return encodeURI(normalized);
    }
  };

  if (lower.startsWith("file://")) {
    return normalizeAndEncode(value);
  }

  const normalizedValue = String(value).replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalizedValue)) {
    return normalizeAndEncode(`file:///${normalizedValue}`);
  }
  if (normalizedValue.startsWith("/")) {
    return normalizeAndEncode(`file://${normalizedValue}`);
  }
  return normalizeAndEncode(`file:///${normalizedValue.replace(/^\/+/, "")}`);
}

function getRuntimeMediaSourceFromItem(item) {
  if (!item || typeof item !== "object") return "";
  const rawPath = String(item.filePath || item.path || item.file || "").trim();
  return normalizeRuntimeMediaPath(rawPath);
}

function normalizeSyncSessionMediaExt(extValue) {
  const ext = String(extValue || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  if (!SYNC_SESSION_MEDIA_ALLOWED_EXTENSIONS.has(ext)) return "";
  return ext;
}

function normalizeSyncSessionMediaMime(ext, mimeValue) {
  const expected = SYNC_SESSION_MEDIA_MIME_BY_EXT[ext] || "";
  const mime = String(mimeValue || "")
    .trim()
    .toLowerCase();
  if (!mime) return expected;
  if (
    mime === expected ||
    ((ext === "jpg" || ext === "jpeg") &&
      (mime === "image/jpg" || mime === "image/jpeg"))
  ) {
    return expected || mime;
  }
  return "";
}

function toBase64FromBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) return "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function fromBase64ToBytes(value) {
  const base64 = String(value || "")
    .replace(/\s+/g, "")
    .trim();
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function computeSyncSha256HexFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length <= 0) return "";
  try {
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle
    ) {
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      const view = new Uint8Array(digest);
      let output = "";
      for (let i = 0; i < view.length; i += 1) {
        output += view[i].toString(16).padStart(2, "0");
      }
      return output;
    }
  } catch (_) {}
  return "";
}

function sleepSyncTransfer(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms || 0) || 0));
  });
}

function getSyncErrorCode(error) {
  return String(error?.message || "").trim();
}

function isRetryableSyncTransferError(error) {
  const code = getSyncErrorCode(error);
  return (
    code === "rate-limited" ||
    code === "state-rate-limited" ||
    code === "request-failed" ||
    code === "websocket-request-timeout" ||
    code === "websocket-disconnected" ||
    code === "websocket-not-open" ||
    code === "websocket-connect-failed" ||
    code === "websocket-connect-closed"
  );
}

function getSyncTransferRetryDelay(attemptIndex) {
  const baseDelay = Math.max(
    1,
    Number(SYNC_SESSION_MEDIA_TRANSFER_BASE_DELAY_MS || 0) || 1,
  );
  const maxDelay = Math.max(
    baseDelay,
    Number(SYNC_SESSION_MEDIA_TRANSFER_MAX_DELAY_MS || 0) || baseDelay,
  );
  const exponential = Math.min(
    maxDelay,
    baseDelay * Math.pow(2, Math.max(0, Number(attemptIndex || 0) || 0)),
  );
  const jitter = Math.floor(
    Math.random() * Math.min(120, Math.floor(exponential * 0.25)),
  );
  return Math.min(maxDelay, exponential + jitter);
}

async function runSyncTransferRequestWithRetry(requestFn, options = {}) {
  if (typeof requestFn !== "function") {
    throw new Error("invalid-transfer-request");
  }
  const abortSignal = options.abortSignal || null;
  const maxRetries = Math.max(
    0,
    Number(options.maxRetries ?? SYNC_SESSION_MEDIA_TRANSFER_MAX_RETRIES) || 0,
  );
  let attempt = 0;
  while (true) {
    if (abortSignal && abortSignal.aborted) {
      throw new Error("transfer-cancelled");
    }
    try {
      return await requestFn();
    } catch (error) {
      const retryable = isRetryableSyncTransferError(error);
      if (!retryable || attempt >= maxRetries) {
        throw error;
      }
      const delayMs = getSyncTransferRetryDelay(attempt);
      attempt += 1;
      if (typeof options.onRetry === "function") {
        try {
          options.onRetry({
            attempt,
            delayMs,
            errorCode: getSyncErrorCode(error),
          });
        } catch (_) {}
      }
      if (delayMs > 0) {
        await sleepSyncTransfer(delayMs);
      }
    }
  }
}

function clearSyncOnlineMediaCache() {
  if (!(syncOnlineMediaCacheByIdentity instanceof Map)) {
    syncOnlineMediaCacheByIdentity = new Map();
    return;
  }
  syncOnlineMediaCacheByIdentity.forEach((entry) => {
    const source = String(entry?.source || "").trim();
    if (source.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(source);
      } catch (_) {}
    }
  });
  syncOnlineMediaCacheByIdentity.clear();
}

function clearSyncParticipantPackValidation() {
  syncParticipantPackValidationState = {
    sessionCode: "",
    packHash: "",
    packUpdatedAt: 0,
    mediaUpdatedAt: 0,
    validatedAt: 0,
  };
  syncParticipantPackValidationWarningAt = 0;
}

function getSyncSessionCurrentPackFingerprint(snapshot = null) {
  const stateSnapshot = snapshot || syncSessionServiceState;
  if (!stateSnapshot || typeof stateSnapshot !== "object") return null;
  const sessionCode = String(stateSnapshot.sessionCode || "").trim();
  const packHash = String(stateSnapshot.sessionPackMeta?.hash || "")
    .trim()
    .toLowerCase();
  const packUpdatedAt = Math.max(
    0,
    Number(stateSnapshot.sessionPackMeta?.updatedAt || 0) || 0,
  );
  const mediaUpdatedAt = Math.max(
    0,
    Number(stateSnapshot.sessionMediaMeta?.updatedAt || 0) || 0,
  );
  if (!sessionCode || !packHash) return null;
  return {
    sessionCode,
    packHash,
    packUpdatedAt,
    mediaUpdatedAt,
  };
}

function markSyncParticipantPackValidated(snapshot = null, overrides = null) {
  const current = getSyncSessionCurrentPackFingerprint(snapshot);
  if (!current) {
    clearSyncParticipantPackValidation();
    return false;
  }
  syncParticipantPackValidationState = {
    sessionCode: String(
      overrides?.sessionCode || current.sessionCode || "",
    ).trim(),
    packHash: String(overrides?.packHash || current.packHash || "")
      .trim()
      .toLowerCase(),
    packUpdatedAt: Math.max(
      0,
      Number(overrides?.packUpdatedAt || current.packUpdatedAt || 0) || 0,
    ),
    mediaUpdatedAt: Math.max(
      0,
      Number(overrides?.mediaUpdatedAt || current.mediaUpdatedAt || 0) || 0,
    ),
    validatedAt: Date.now(),
  };
  syncParticipantPackValidationWarningAt = 0;
  return true;
}

function isSyncParticipantPackValidationCurrent(snapshot = null) {
  const current = getSyncSessionCurrentPackFingerprint(snapshot);
  if (!current) return true;
  const validated = syncParticipantPackValidationState || {};
  return (
    String(validated.sessionCode || "").trim() === current.sessionCode &&
    String(validated.packHash || "")
      .trim()
      .toLowerCase() === current.packHash &&
    Math.max(0, Number(validated.packUpdatedAt || 0) || 0) ===
      current.packUpdatedAt &&
    Math.max(0, Number(validated.mediaUpdatedAt || 0) || 0) ===
      current.mediaUpdatedAt
  );
}

function shouldRequireSyncParticipantPackValidation(snapshot = null) {
  const stateSnapshot = snapshot || syncSessionServiceState;
  if (
    !stateSnapshot ||
    stateSnapshot.role !== "participant" ||
    stateSnapshot.status !== "joined"
  ) {
    return false;
  }
  return !!getSyncSessionCurrentPackFingerprint(stateSnapshot);
}

function notifySyncParticipantPackValidationRequired() {
  const nowMs = Date.now();
  if (nowMs - syncParticipantPackValidationWarningAt < 2200) return;
  syncParticipantPackValidationWarningAt = nowMs;
  const message = getI18nText(
    "sync.onlinePackValidationRequiredBeforeStart",
    "Download and apply the online session pack before joining this session start.",
  );
  const activeModal = document.getElementById("sync-session-modal");
  if (activeModal && !activeModal.classList.contains("hidden")) {
    setSyncSessionStatus(activeModal, message, "warning");
  }
  showSyncSessionToast({
    type: "warning",
    message,
    duration: 2800,
  });
}

function parseSyncUnknownActionName(error) {
  const code = String(error?.message || "").trim();
  if (code === "unknown-action") return "unknown";
  if (!code.startsWith("unknown-action:")) return "";
  return String(code.slice("unknown-action:".length) || "").trim();
}

function isSyncRelayMediaActionUnsupported(error) {
  const action = parseSyncUnknownActionName(error);
  if (!action) return false;
  return (
    action === "resetSessionMediaPack" ||
    action === "uploadSessionMediaFile" ||
    action === "getSessionMediaManifest" ||
    action === "getSessionMediaFile"
  );
}

function buildSyncMediaOrderKeys() {
  if (!Array.isArray(state.images) || state.images.length <= 0) return [];
  return state.images.map((item) => getSyncMediaIdentity(item)).filter(Boolean);
}

function buildSyncSessionPackMediaRefs() {
  if (!Array.isArray(state.images) || state.images.length <= 0) return [];
  const refs = [];
  for (
    let i = 0;
    i < state.images.length && refs.length < SYNC_SESSION_PACK_MAX_MEDIA_REFS;
    i += 1
  ) {
    const item = state.images[i];
    if (!item || typeof item !== "object") continue;
    const identity = getSyncMediaIdentity(item);
    if (!identity) continue;
    const rawPath = String(
      item.filePath || item.path || item.file || "",
    ).trim();
    const fileNameFromPath = rawPath ? rawPath.split(/[\\/]/).pop() : "";
    const name = String(
      item.name || item.filename || item.fileName || fileNameFromPath || "",
    ).trim();
    const ext = String(item.ext || "")
      .trim()
      .toLowerCase();
    refs.push({
      identity,
      index: i,
      name: name || "unknown",
      ext,
    });
  }
  return refs;
}

function createSyncSessionPackFilename() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `posechrono-session-pack-${yyyy}${mm}${dd}-${hh}${min}${ss}.json`;
}

function buildSyncSessionPackManifest() {
  const mode = normalizeSessionModeValue(
    state.sessionMode || CONFIG.defaultSessionMode || "classique",
    "classique",
  );
  const selectedDuration = Math.max(
    1,
    Number(state.selectedDuration || 0) || 60,
  );
  const timeRemaining = Math.max(
    0,
    Number(state.timeRemaining || 0) || selectedDuration,
  );
  const customQueue = mode === "custom" ? buildSyncCustomQueuePayload() : [];
  const mediaOrderKeys = buildSyncMediaOrderKeys();

  return {
    schema: SYNC_SESSION_PACK_SCHEMA,
    version: SYNC_SESSION_PACK_VERSION,
    createdAt: new Date().toISOString(),
    source: {
      runtime: isDesktopStandaloneRuntime() ? "desktop" : "eagle",
      language: getCurrentI18nLanguage(),
    },
    session: {
      mode,
      selectedDuration,
      timeRemaining,
      memoryType: String(state.memoryType || "flash"),
      memoryDuration: Math.max(0, Number(state.memoryDuration || 0) || 0),
      memoryPosesCount: Math.max(1, Number(state.memoryPosesCount || 1) || 1),
      memoryDrawingTime: Math.max(0, Number(state.memoryDrawingTime || 0) || 0),
      memoryNoPressure: !!state.memoryNoPressure,
      customQueue,
      mediaOrderKeys,
      imagesCount: Array.isArray(state.images) ? state.images.length : 0,
    },
    mediaRefs: buildSyncSessionPackMediaRefs(),
  };
}

function buildSyncSessionPackFromUploadedMedia(pack, uploadedIdentities = []) {
  if (!pack || !pack.session || typeof pack.session !== "object") return null;
  const allowed = new Set(
    (Array.isArray(uploadedIdentities) ? uploadedIdentities : [])
      .map((id) => String(id || "").trim())
      .filter((id) => !!id),
  );

  const baseRefs = normalizeSyncSessionPackMediaRefs(pack.mediaRefs);
  const filteredRefs = allowed.size
    ? baseRefs.filter((ref) => allowed.has(String(ref.identity || "").trim()))
    : [];

  let mediaOrderKeys = normalizeSyncSessionPackMediaOrderKeys(
    pack.session.mediaOrderKeys,
  );
  if (allowed.size) {
    mediaOrderKeys = mediaOrderKeys.filter((id) =>
      allowed.has(String(id || "").trim()),
    );
  } else {
    mediaOrderKeys = [];
  }
  if (mediaOrderKeys.length <= 0 && filteredRefs.length > 0) {
    mediaOrderKeys = filteredRefs
      .slice()
      .sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0))
      .map((ref) => String(ref.identity || "").trim())
      .filter((id) => !!id);
  }

  const normalizedRefs = filteredRefs
    .slice()
    .sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0))
    .map((ref, index) => ({
      identity: String(ref.identity || "").trim(),
      index,
      name: String(ref.name || "").trim() || "unknown",
      ext: normalizeSyncSessionMediaExt(ref.ext || ""),
    }));

  return {
    ...pack,
    session: {
      ...pack.session,
      mediaOrderKeys,
      imagesCount: mediaOrderKeys.length,
    },
    mediaRefs: normalizedRefs,
  };
}

function applySyncHostOnlinePackMediaSelection(pack) {
  if (!isSyncSessionHostActive()) return false;
  if (!pack || !pack.session || typeof pack.session !== "object") return false;
  if (!Array.isArray(state.images) || state.images.length <= 0) return false;

  let desiredKeys = normalizeSyncSessionPackMediaOrderKeys(
    pack.session.mediaOrderKeys,
  );
  if (desiredKeys.length <= 0) {
    desiredKeys = normalizeSyncSessionPackMediaRefs(pack.mediaRefs)
      .slice()
      .sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0))
      .map((ref) => String(ref.identity || "").trim())
      .filter((id) => !!id);
  }
  if (desiredKeys.length <= 0) return false;

  const buckets = new Map();
  state.images.forEach((item) => {
    const id = getSyncMediaIdentity(item);
    if (!id) return;
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(item);
  });

  const nextImages = [];
  desiredKeys.forEach((key) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    const bucket = buckets.get(normalizedKey);
    if (!bucket || bucket.length <= 0) return;
    const entry = bucket.shift();
    if (entry) nextImages.push(entry);
  });

  if (nextImages.length <= 0) return false;

  state.images = nextImages;
  state.originalImages = nextImages.slice();
  state.currentIndex = Math.max(
    0,
    Math.min(state.currentIndex, state.images.length - 1),
  );
  state.memoryPosesCount = clampMemorySessionPosesCount(
    state.memoryPosesCount,
    state.images.length,
    1,
  );
  updateStartButtonState();
  updateTimerDisplay();
  return true;
}

function normalizeSyncSessionPackMediaOrderKeys(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (
    let i = 0;
    i < input.length && out.length < SYNC_SESSION_PACK_MAX_MEDIA_REFS;
    i += 1
  ) {
    const value = String(input[i] || "").trim();
    if (!value || value.length > 128) continue;
    if (!/^[A-Za-z0-9:_-]+$/.test(value)) continue;
    out.push(value);
  }
  return out;
}

function normalizeSyncSessionPackMediaRefs(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (
    let i = 0;
    i < input.length && out.length < SYNC_SESSION_PACK_MAX_MEDIA_REFS;
    i += 1
  ) {
    const raw = input[i];
    if (!raw || typeof raw !== "object") continue;

    const identity = String(raw.identity || "").trim();
    if (!identity || identity.length > 128) continue;
    if (!/^[A-Za-z0-9:_-]+$/.test(identity)) continue;

    const indexRaw = Number(raw.index);
    const index = Number.isFinite(indexRaw)
      ? Math.max(0, Math.floor(indexRaw))
      : out.length;

    const name = String(raw.name || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 160);

    const ext = normalizeSyncSessionMediaExt(raw.ext || "");
    out.push({
      identity,
      index,
      name: name || "unknown",
      ext,
    });
  }
  return out;
}

function parseSyncSessionPackText(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("sync-pack-empty");
  }
  if (rawText.length > SYNC_SESSION_PACK_MAX_TEXT_LENGTH) {
    throw new Error("sync-pack-too-large");
  }

  let parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    throw new Error("sync-pack-invalid-json");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("sync-pack-invalid");
  }
  if (String(parsed.schema || "").trim() !== SYNC_SESSION_PACK_SCHEMA) {
    throw new Error("sync-pack-invalid-schema");
  }

  const rawSession =
    parsed.session && typeof parsed.session === "object"
      ? parsed.session
      : null;
  if (!rawSession) {
    throw new Error("sync-pack-missing-session");
  }

  const mode = normalizeSessionModeValue(
    rawSession.mode || "classique",
    "classique",
  );
  const selectedDuration = Math.max(
    1,
    Math.min(
      24 * 3600,
      Math.floor(Number(rawSession.selectedDuration || 0) || 60),
    ),
  );
  const timeRemaining = Math.max(
    0,
    Math.min(
      24 * 3600,
      Math.floor(
        Number(rawSession.timeRemaining || selectedDuration) ||
          selectedDuration,
      ),
    ),
  );
  const memoryType =
    String(rawSession.memoryType || "").trim() === "progressive"
      ? "progressive"
      : "flash";
  const memoryDuration = Math.max(
    0,
    Math.min(
      24 * 3600,
      Math.floor(Number(rawSession.memoryDuration || 0) || 0),
    ),
  );
  const memoryPosesCount = Math.max(
    1,
    Math.min(9999, Math.floor(Number(rawSession.memoryPosesCount || 1) || 1)),
  );
  const memoryDrawingTime = Math.max(
    0,
    Math.min(
      24 * 3600,
      Math.floor(Number(rawSession.memoryDrawingTime || 0) || 0),
    ),
  );
  const memoryNoPressure = !!rawSession.memoryNoPressure;
  const mediaOrderKeys = normalizeSyncSessionPackMediaOrderKeys(
    rawSession.mediaOrderKeys,
  );
  const mediaRefs = normalizeSyncSessionPackMediaRefs(parsed.mediaRefs);
  const customQueue =
    mode === "custom" && Array.isArray(rawSession.customQueue)
      ? rawSession.customQueue
          .map((step) => normalizeCustomStep(step))
          .filter((step) => !!step && typeof step === "object")
          .slice(0, 600)
      : [];

  return {
    schema: SYNC_SESSION_PACK_SCHEMA,
    version: SYNC_SESSION_PACK_VERSION,
    createdAt: String(parsed.createdAt || "").trim(),
    session: {
      mode,
      selectedDuration,
      timeRemaining,
      memoryType,
      memoryDuration,
      memoryPosesCount,
      memoryDrawingTime,
      memoryNoPressure,
      mediaOrderKeys,
      customQueue,
    },
    mediaRefs,
  };
}

async function computeSyncSessionPackSha256Hex(rawText) {
  const normalized = String(rawText || "");
  if (!normalized) return "";
  try {
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle &&
      typeof TextEncoder !== "undefined"
    ) {
      const bytes = new TextEncoder().encode(normalized);
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      const view = new Uint8Array(digest);
      let output = "";
      for (let i = 0; i < view.length; i += 1) {
        output += view[i].toString(16).padStart(2, "0");
      }
      return output;
    }
  } catch (_) {}
  return "";
}

async function collectSyncSessionMediaUploadEntries(pack) {
  const refs = Array.isArray(pack?.mediaRefs) ? pack.mediaRefs : [];
  if (
    !Array.isArray(state.images) ||
    state.images.length <= 0 ||
    refs.length <= 0
  ) {
    return {
      entries: [],
      selectedCount: 0,
      skippedMissing: 0,
      skippedUnsupported: 0,
      skippedTooLarge: 0,
      skippedFileTooLarge: 0,
      skippedTotalBudget: 0,
      skippedFetch: 0,
      skippedCountLimit: 0,
    };
  }

  const entries = [];
  let totalBytes = 0;
  let skippedMissing = 0;
  let skippedUnsupported = 0;
  let skippedTooLarge = 0;
  let skippedFileTooLarge = 0;
  let skippedTotalBudget = 0;
  let skippedFetch = 0;
  let skippedCountLimit = 0;

  const imageByIdentity = new Map();
  state.images.forEach((item) => {
    const identity = getSyncMediaIdentity(item);
    if (!identity || imageByIdentity.has(identity)) return;
    imageByIdentity.set(identity, item);
  });

  for (let i = 0; i < refs.length; i += 1) {
    if (entries.length >= SYNC_SESSION_MEDIA_MAX_FILES) {
      skippedCountLimit += 1;
      continue;
    }
    const ref = refs[i];
    const identity = String(ref?.identity || "").trim();
    if (!identity) continue;
    const item = imageByIdentity.get(identity);
    if (!item) {
      skippedMissing += 1;
      continue;
    }

    const ext = normalizeSyncSessionMediaExt(ref?.ext || item.ext || "");
    if (!ext) {
      skippedUnsupported += 1;
      continue;
    }

    const sourceUrl = getRuntimeMediaSourceFromItem(item);
    if (!sourceUrl) {
      skippedMissing += 1;
      continue;
    }

    let response = null;
    try {
      response = await fetch(sourceUrl);
    } catch (_) {
      skippedFetch += 1;
      continue;
    }
    if (!response || !response.ok) {
      skippedFetch += 1;
      continue;
    }

    let arrayBuffer = null;
    try {
      arrayBuffer = await response.arrayBuffer();
    } catch (_) {
      skippedFetch += 1;
      continue;
    }
    const bytes = new Uint8Array(arrayBuffer || 0);
    if (!bytes.length) {
      skippedFetch += 1;
      continue;
    }

    if (bytes.length > SYNC_SESSION_MEDIA_MAX_FILE_BYTES) {
      skippedTooLarge += 1;
      skippedFileTooLarge += 1;
      continue;
    }
    if (totalBytes + bytes.length > SYNC_SESSION_MEDIA_MAX_TOTAL_BYTES) {
      skippedTooLarge += 1;
      skippedTotalBudget += 1;
      continue;
    }

    const mimeFromResponse = response.headers
      ? response.headers.get("content-type")
      : "";
    const mime = normalizeSyncSessionMediaMime(
      ext,
      mimeFromResponse || item.mime || item.type || "",
    );
    if (!mime) {
      skippedUnsupported += 1;
      continue;
    }

    const sha256 = await computeSyncSha256HexFromBytes(bytes);
    const dataBase64 = toBase64FromBytes(bytes);
    if (!dataBase64) {
      skippedFetch += 1;
      continue;
    }

    const name = String(
      ref?.name ||
        item.name ||
        item.filename ||
        item.fileName ||
        `${identity}.${ext}`,
    ).trim();
    entries.push({
      identity,
      name: name || `${identity}.${ext}`,
      ext,
      mime,
      size: bytes.length,
      sha256,
      dataBase64,
    });
    totalBytes += bytes.length;
  }

  return {
    entries,
    selectedCount: Math.min(refs.length, SYNC_SESSION_MEDIA_MAX_FILES),
    skippedMissing,
    skippedUnsupported,
    skippedTooLarge,
    skippedFileTooLarge,
    skippedTotalBudget,
    skippedFetch,
    skippedCountLimit,
  };
}

async function publishSyncSessionMediaPack(service, pack, options = {}) {
  const onProgress =
    options && typeof options.onProgress === "function"
      ? options.onProgress
      : null;
  if (
    !service ||
    typeof service.resetSessionMediaPack !== "function" ||
    typeof service.publishSessionMediaFile !== "function"
  ) {
    return {
      supported: false,
      selectedCount: 0,
      uploadedCount: 0,
      uploadedIdentities: [],
      failedCount: 0,
      failedRateLimited: 0,
      failedTimeout: 0,
      failedDisconnected: 0,
      failedOther: 0,
      skippedMissing: 0,
      skippedUnsupported: 0,
      skippedTooLarge: 0,
      skippedFileTooLarge: 0,
      skippedTotalBudget: 0,
      skippedFetch: 0,
      skippedCountLimit: 0,
      relayUnsupported: false,
    };
  }

  if (onProgress) {
    onProgress({
      stage: "prepare",
      done: 0,
      total: 0,
      uploaded: 0,
      failed: 0,
      skipped: 0,
      selected: 0,
    });
  }
  const prepared = await collectSyncSessionMediaUploadEntries(pack);
  const initialSkipped =
    Math.max(0, Number(prepared.skippedMissing || 0) || 0) +
    Math.max(0, Number(prepared.skippedUnsupported || 0) || 0) +
    Math.max(0, Number(prepared.skippedTooLarge || 0) || 0) +
    Math.max(0, Number(prepared.skippedFetch || 0) || 0) +
    Math.max(0, Number(prepared.skippedCountLimit || 0) || 0);

  if (onProgress) {
    onProgress({
      stage: "prepare",
      done: 0,
      total: prepared.entries.length,
      uploaded: 0,
      failed: 0,
      skipped: initialSkipped,
      selected: Math.max(0, Number(prepared.selectedCount || 0) || 0),
    });
  }

  try {
    await service.resetSessionMediaPack();
  } catch (error) {
    if (isSyncRelayMediaActionUnsupported(error)) {
      return {
        supported: false,
        selectedCount: prepared.selectedCount,
        uploadedCount: 0,
        uploadedIdentities: [],
        failedCount: 0,
        failedRateLimited: 0,
        failedTimeout: 0,
        failedDisconnected: 0,
        failedOther: 0,
        skippedMissing: prepared.skippedMissing,
        skippedUnsupported: prepared.skippedUnsupported,
        skippedTooLarge: prepared.skippedTooLarge,
        skippedFileTooLarge: prepared.skippedFileTooLarge,
        skippedTotalBudget: prepared.skippedTotalBudget,
        skippedFetch: prepared.skippedFetch,
        skippedCountLimit: prepared.skippedCountLimit,
        relayUnsupported: true,
      };
    }
    throw error;
  }

  let uploadedCount = 0;
  const uploadedIdentities = [];
  let failedCount = 0;
  let failedRateLimited = 0;
  let failedTimeout = 0;
  let failedDisconnected = 0;
  let failedOther = 0;
  if (onProgress) {
    onProgress({
      stage: "upload",
      done: 0,
      total: prepared.entries.length,
      uploaded: uploadedCount,
      failed: failedCount,
      skipped: initialSkipped,
      selected: Math.max(0, Number(prepared.selectedCount || 0) || 0),
    });
  }
  const abortSignal = options.abortSignal || getSyncTransferAbortSignal();
  let lastRequestSentAt = 0;
  for (let i = 0; i < prepared.entries.length; i += 1) {
    if (abortSignal && abortSignal.aborted) {
      throw new Error("transfer-cancelled");
    }
    const entry = prepared.entries[i];
    const sinceLast = Date.now() - lastRequestSentAt;
    if (sinceLast < SYNC_SESSION_MEDIA_TRANSFER_REQUEST_INTERVAL_MS) {
      await sleepSyncTransfer(
        SYNC_SESSION_MEDIA_TRANSFER_REQUEST_INTERVAL_MS - sinceLast,
      );
    }
    try {
      lastRequestSentAt = Date.now();
      await runSyncTransferRequestWithRetry(
        () =>
          service.publishSessionMediaFile({
            file: entry,
          }),
        {
          abortSignal,
        },
      );
      uploadedCount += 1;
      uploadedIdentities.push(String(entry?.identity || "").trim());
    } catch (error) {
      if (isSyncRelayMediaActionUnsupported(error)) {
        return {
          supported: false,
          selectedCount: prepared.selectedCount,
          uploadedCount,
          uploadedIdentities,
          failedCount,
          failedRateLimited,
          failedTimeout,
          failedDisconnected,
          failedOther,
          skippedMissing: prepared.skippedMissing,
          skippedUnsupported: prepared.skippedUnsupported,
          skippedTooLarge: prepared.skippedTooLarge,
          skippedFileTooLarge: prepared.skippedFileTooLarge,
          skippedTotalBudget: prepared.skippedTotalBudget,
          skippedFetch: prepared.skippedFetch,
          skippedCountLimit: prepared.skippedCountLimit,
          relayUnsupported: true,
        };
      }
      const errorCode = getSyncErrorCode(error);
      if (errorCode === "rate-limited" || errorCode === "state-rate-limited") {
        failedRateLimited += 1;
      } else if (errorCode === "websocket-request-timeout") {
        failedTimeout += 1;
      } else if (
        errorCode === "websocket-disconnected" ||
        errorCode === "websocket-not-open" ||
        errorCode === "websocket-connect-failed" ||
        errorCode === "websocket-connect-closed"
      ) {
        failedDisconnected += 1;
      } else {
        failedOther += 1;
      }
      failedCount += 1;
    }
    if (onProgress) {
      onProgress({
        stage: "upload",
        done: i + 1,
        total: prepared.entries.length,
        uploaded: uploadedCount,
        failed: failedCount,
        skipped: initialSkipped,
        selected: Math.max(0, Number(prepared.selectedCount || 0) || 0),
      });
    }
  }

  return {
    supported: true,
    selectedCount: prepared.selectedCount,
    uploadedCount,
    uploadedIdentities,
    failedCount,
    failedRateLimited,
    failedTimeout,
    failedDisconnected,
    failedOther,
    skippedMissing: prepared.skippedMissing,
    skippedUnsupported: prepared.skippedUnsupported,
    skippedTooLarge: prepared.skippedTooLarge,
    skippedFileTooLarge: prepared.skippedFileTooLarge,
    skippedTotalBudget: prepared.skippedTotalBudget,
    skippedFetch: prepared.skippedFetch,
    skippedCountLimit: prepared.skippedCountLimit,
    relayUnsupported: false,
  };
}

async function downloadSyncSessionMediaPack(service, options = {}) {
  const onProgress =
    options && typeof options.onProgress === "function"
      ? options.onProgress
      : null;
  if (
    !service ||
    typeof service.fetchSessionMediaManifest !== "function" ||
    typeof service.fetchSessionMediaFile !== "function"
  ) {
    return {
      supported: false,
      downloadedCount: 0,
      filesCount: 0,
      skippedCount: 0,
      skippedRateLimited: 0,
      skippedTimeout: 0,
      skippedDisconnected: 0,
      skippedOther: 0,
      mediaUpdatedAt: 0,
      entries: [],
      relayUnsupported: false,
    };
  }

  let manifest = null;
  try {
    manifest = await service.fetchSessionMediaManifest();
  } catch (error) {
    const code = String(error?.message || "").trim();
    if (code === "session-media-not-found") {
      manifest = {
        files: [],
        filesCount: 0,
        totalBytes: 0,
        updatedAt: 0,
      };
    } else if (isSyncRelayMediaActionUnsupported(error)) {
      return {
        supported: false,
        downloadedCount: 0,
        filesCount: 0,
        skippedCount: 0,
        skippedRateLimited: 0,
        skippedTimeout: 0,
        skippedDisconnected: 0,
        skippedOther: 0,
        mediaUpdatedAt: 0,
        entries: [],
        relayUnsupported: true,
      };
    } else {
      throw error;
    }
  }
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  if (onProgress) {
    onProgress({
      stage: "manifest",
      done: 0,
      total: files.length,
      skipped: 0,
    });
  }
  if (files.length <= 0) {
    return {
      supported: true,
      downloadedCount: 0,
      filesCount: 0,
      skippedCount: 0,
      skippedRateLimited: 0,
      skippedTimeout: 0,
      skippedDisconnected: 0,
      skippedOther: 0,
      mediaUpdatedAt: Math.max(0, Number(manifest?.updatedAt || 0) || 0),
      entries: [],
      relayUnsupported: false,
    };
  }

  clearSyncOnlineMediaCache();
  const entries = [];
  let totalBytes = 0;
  let skippedCount = 0;
  let skippedRateLimited = 0;
  let skippedTimeout = 0;
  let skippedDisconnected = 0;
  let skippedOther = 0;

  const dlAbortSignal = options.abortSignal || getSyncTransferAbortSignal();
  let lastRequestSentAt = 0;
  for (
    let i = 0;
    i < files.length && entries.length < SYNC_SESSION_MEDIA_MAX_FILES;
    i += 1
  ) {
    if (dlAbortSignal && dlAbortSignal.aborted) {
      throw new Error("transfer-cancelled");
    }
    const fileMeta = files[i];
    const identity = String(fileMeta?.identity || "").trim();
    if (!identity) {
      skippedCount += 1;
      if (onProgress) {
        onProgress({
          stage: "file",
          done: i + 1,
          total: files.length,
          skipped: skippedCount,
        });
      }
      continue;
    }
    let payload = null;
    try {
      const sinceLast = Date.now() - lastRequestSentAt;
      if (sinceLast < SYNC_SESSION_MEDIA_TRANSFER_REQUEST_INTERVAL_MS) {
        await sleepSyncTransfer(
          SYNC_SESSION_MEDIA_TRANSFER_REQUEST_INTERVAL_MS - sinceLast,
        );
      }
      lastRequestSentAt = Date.now();
      payload = await runSyncTransferRequestWithRetry(
        () => service.fetchSessionMediaFile({ identity }),
        { abortSignal: dlAbortSignal },
      );
    } catch (error) {
      const errorCode = getSyncErrorCode(error);
      if (errorCode === "rate-limited" || errorCode === "state-rate-limited") {
        skippedRateLimited += 1;
      } else if (errorCode === "websocket-request-timeout") {
        skippedTimeout += 1;
      } else if (
        errorCode === "websocket-disconnected" ||
        errorCode === "websocket-not-open" ||
        errorCode === "websocket-connect-failed" ||
        errorCode === "websocket-connect-closed"
      ) {
        skippedDisconnected += 1;
      } else {
        skippedOther += 1;
      }
      skippedCount += 1;
      if (onProgress) {
        onProgress({
          stage: "file",
          done: i + 1,
          total: files.length,
          skipped: skippedCount,
        });
      }
      continue;
    }
    const remoteFile = payload?.file;
    if (!remoteFile || typeof remoteFile !== "object") {
      skippedCount += 1;
      if (onProgress) {
        onProgress({
          stage: "file",
          done: i + 1,
          total: files.length,
          skipped: skippedCount,
        });
      }
      continue;
    }

    const ext = normalizeSyncSessionMediaExt(
      remoteFile.ext || fileMeta.ext || "",
    );
    if (!ext) {
      skippedCount += 1;
      if (onProgress) {
        onProgress({
          stage: "file",
          done: i + 1,
          total: files.length,
          skipped: skippedCount,
        });
      }
      continue;
    }
    const mime = normalizeSyncSessionMediaMime(
      ext,
      remoteFile.mime || fileMeta.mime || "",
    );
    if (!mime) {
      skippedCount += 1;
      if (onProgress) {
        onProgress({
          stage: "file",
          done: i + 1,
          total: files.length,
          skipped: skippedCount,
        });
      }
      continue;
    }

    const bytes = fromBase64ToBytes(remoteFile.dataBase64);
    const expectedSize = Math.max(
      0,
      Number(remoteFile.size || fileMeta.size || 0) || 0,
    );
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length !== expectedSize
    ) {
      skippedCount += 1;
      if (onProgress) {
        onProgress({
          stage: "file",
          done: i + 1,
          total: files.length,
          skipped: skippedCount,
        });
      }
      continue;
    }

    if (
      bytes.length > SYNC_SESSION_MEDIA_MAX_FILE_BYTES ||
      totalBytes + bytes.length > SYNC_SESSION_MEDIA_MAX_TOTAL_BYTES
    ) {
      skippedCount += 1;
      if (onProgress) {
        onProgress({
          stage: "file",
          done: i + 1,
          total: files.length,
          skipped: skippedCount,
        });
      }
      continue;
    }

    const remoteSha = String(remoteFile.sha256 || fileMeta.sha256 || "")
      .trim()
      .toLowerCase();
    if (/^[a-f0-9]{64}$/.test(remoteSha)) {
      const localSha = await computeSyncSha256HexFromBytes(bytes);
      if (!localSha || localSha !== remoteSha) {
        skippedCount += 1;
        if (onProgress) {
          onProgress({
            stage: "file",
            done: i + 1,
            total: files.length,
            skipped: skippedCount,
          });
        }
        continue;
      }
    }

    const blob = new Blob([bytes], { type: mime });
    const source = URL.createObjectURL(blob);
    const entry = {
      identity,
      name:
        String(remoteFile.name || fileMeta.name || "unknown").trim() ||
        "unknown",
      ext,
      mime,
      size: bytes.length,
      sha256: remoteSha,
      source,
    };
    syncOnlineMediaCacheByIdentity.set(identity, entry);
    entries.push(entry);
    totalBytes += bytes.length;
    if (onProgress) {
      onProgress({
        stage: "file",
        done: i + 1,
        total: files.length,
        skipped: skippedCount,
      });
    }
  }

  return {
    supported: true,
    downloadedCount: entries.length,
    filesCount: files.length,
    skippedCount,
    skippedRateLimited,
    skippedTimeout,
    skippedDisconnected,
    skippedOther,
    mediaUpdatedAt: Math.max(0, Number(manifest?.updatedAt || 0) || 0),
    entries,
    relayUnsupported: false,
  };
}

function applySyncDownloadedMediaPackToState(pack, downloadResult) {
  if (!pack || !pack.session || !Array.isArray(downloadResult?.entries)) {
    return false;
  }
  const refs = Array.isArray(pack.mediaRefs) ? pack.mediaRefs.slice() : [];

  const byIdentity = new Map();
  downloadResult.entries.forEach((entry) => {
    const identity = String(entry?.identity || "").trim();
    if (!identity || byIdentity.has(identity)) return;
    byIdentity.set(identity, entry);
  });
  if (byIdentity.size <= 0) return false;

  const orderedEntries = [];
  if (refs.length > 0) {
    refs.sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0));
    const used = new Set();
    refs.forEach((ref) => {
      const identity = String(ref?.identity || "").trim();
      if (!identity || used.has(identity)) return;
      const found = byIdentity.get(identity);
      if (!found) return;
      orderedEntries.push(found);
      used.add(identity);
    });
    byIdentity.forEach((entry, identity) => {
      if (used.has(identity)) return;
      orderedEntries.push(entry);
    });
  } else {
    downloadResult.entries.forEach((entry) => {
      const identity = String(entry?.identity || "").trim();
      if (!identity) return;
      const found = byIdentity.get(identity);
      if (!found) return;
      orderedEntries.push(found);
    });
  }

  if (orderedEntries.length <= 0) return false;
  state.images = orderedEntries.map((entry, index) => ({
    id: `sync-media-${entry.identity}-${index}`,
    filePath: entry.source,
    path: entry.source,
    file: entry.source,
    url: entry.source,
    thumbnailURL: entry.source,
    thumbnail: entry.source,
    name: entry.name,
    ext: entry.ext,
    mime: entry.mime,
    isSyncRemoteMedia: true,
    syncIdentity: entry.identity,
  }));
  state.originalImages = state.images.slice();
  state.currentIndex = 0;
  state.memoryPosesCount = clampMemorySessionPosesCount(
    state.memoryPosesCount,
    state.images.length,
    1,
  );

  const folderInfoEl = folderInfo || document.getElementById("folder-info");
  const startBtnEl = startBtn || document.getElementById("start-btn");
  if (folderInfoEl) {
    const mediaCounts = countSessionMediaTypes(state.images);
    const countMessage = formatSessionMediaCountLabel({
      imageCount: mediaCounts.imageCount,
      videoCount: mediaCounts.videoCount,
    });
    folderInfoEl.innerHTML = `
      <div style="display: flex; align-items: baseline; justify-content: left; gap: 8px;">
        <span class="source-message-text">${getI18nText("sync.onlineMediaSourceLabel", "Online media")}</span>
        <span class="image-count-text">${countMessage}</span>
      </div>
    `;
  }
  if (startBtnEl) {
    startBtnEl.disabled = state.images.length <= 0;
  }
  updateStartButtonState();
  updateTimerDisplay();
  return true;
}

function setClassicDurationInputsFromSeconds(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds || 0) || 0));
  if (hoursInput) {
    hoursInput.value = Math.floor(safe / 3600);
  }
  if (minutesInput) {
    minutesInput.value = Math.floor((safe % 3600) / 60);
  }
  if (secondsInput) {
    secondsInput.value = safe % 60;
  }
}

function setMinutesSecondsInputs(minutesInputEl, secondsInputEl, totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds || 0) || 0));
  if (minutesInputEl) {
    minutesInputEl.value = Math.floor(safe / 60);
  }
  if (secondsInputEl) {
    secondsInputEl.value = safe % 60;
  }
}

function applyPendingSyncSessionPackMediaOrder() {
  if (!Array.isArray(state.images) || state.images.length <= 0) {
    return false;
  }

  const runtimeKeys = syncPendingRuntimeMediaOrderKeys;
  if (Array.isArray(runtimeKeys) && runtimeKeys.length > 0) {
    const reordered = reorderSessionImagesByRemoteOrder(runtimeKeys);
    if (reordered) {
      syncPendingRuntimeMediaOrderKeys = null;
      syncPendingSessionPackMediaOrderKeys = null;
      return true;
    }
  }

  if (
    !Array.isArray(syncPendingSessionPackMediaOrderKeys) ||
    syncPendingSessionPackMediaOrderKeys.length <= 0
  ) {
    return false;
  }
  const reordered = reorderSessionImagesByRemoteOrder(
    syncPendingSessionPackMediaOrderKeys,
  );
  if (reordered) {
    syncPendingSessionPackMediaOrderKeys = null;
  }
  return reordered;
}

function applySyncSessionPackManifest(pack) {
  if (!pack || !pack.session || typeof pack.session !== "object") {
    return { reorderedMedia: false, pendingMedia: false };
  }

  const session = pack.session;
  const mode = normalizeSessionModeValue(
    session.mode || "classique",
    "classique",
  );
  switchMode(mode);

  state.selectedDuration = Math.max(
    1,
    Math.floor(
      Number(session.selectedDuration || state.selectedDuration || 60),
    ),
  );
  state.timeRemaining = Math.max(
    0,
    Math.floor(Number(session.timeRemaining || state.selectedDuration)),
  );
  setClassicDurationInputsFromSeconds(state.selectedDuration);
  toggleDurationButtonsForValue(durationBtns, state.selectedDuration);

  state.memoryType =
    session.memoryType === "progressive" ? "progressive" : "flash";
  state.memoryDuration = Math.max(
    0,
    Math.floor(Number(session.memoryDuration || state.memoryDuration || 0)),
  );
  state.memoryPosesCount = Math.max(
    1,
    Math.floor(Number(session.memoryPosesCount || state.memoryPosesCount || 1)),
  );
  state.memoryDrawingTime = Math.max(
    0,
    Math.floor(
      Number(session.memoryDrawingTime || state.memoryDrawingTime || 0),
    ),
  );
  state.memoryNoPressure = !!session.memoryNoPressure;
  syncMemoryDurationButtons();
  setMinutesSecondsInputs(
    document.getElementById("memory-flash-minutes"),
    document.getElementById("memory-flash-seconds"),
    state.memoryDuration,
  );
  setMinutesSecondsInputs(
    document.getElementById("memory-progressive-minutes"),
    document.getElementById("memory-progressive-seconds"),
    state.memoryDuration,
  );
  setMinutesSecondsInputs(
    document.getElementById("memory-drawing-minutes"),
    document.getElementById("memory-drawing-seconds"),
    state.memoryDrawingTime,
  );

  if (mode === "custom") {
    state.customQueue = Array.isArray(session.customQueue)
      ? session.customQueue
      : [];
    state.currentStepIndex = 0;
    state.currentPoseInStep = 1;
    renderCustomQueue();
  }

  updateStartButtonState();
  updateTimerDisplay();

  const mediaOrderKeys = Array.isArray(session.mediaOrderKeys)
    ? session.mediaOrderKeys
    : [];
  if (mediaOrderKeys.length <= 0) {
    syncPendingSessionPackMediaOrderKeys = null;
    return { reorderedMedia: false, pendingMedia: false };
  }

  if (!Array.isArray(state.images) || state.images.length <= 0) {
    syncPendingSessionPackMediaOrderKeys = [...mediaOrderKeys];
    return { reorderedMedia: false, pendingMedia: true };
  }

  const reorderedMedia = reorderSessionImagesByRemoteOrder(mediaOrderKeys);
  if (!reorderedMedia) {
    syncPendingSessionPackMediaOrderKeys = [...mediaOrderKeys];
    return { reorderedMedia: false, pendingMedia: true };
  }
  syncPendingSessionPackMediaOrderKeys = null;
  return { reorderedMedia: true, pendingMedia: false };
}

function buildSyncCustomQueuePayload() {
  if (!Array.isArray(state.customQueue) || state.customQueue.length <= 0)
    return [];
  const maxSteps = 600;
  const normalized = state.customQueue
    .map((step) => normalizeCustomStep(step))
    .filter((step) => !!step && typeof step === "object");
  if (normalized.length <= maxSteps) return normalized;
  return normalized.slice(0, maxSteps);
}

function getSyncCustomQueueFingerprint(queue) {
  if (!Array.isArray(queue) || queue.length <= 0) return "[]";
  try {
    return JSON.stringify(queue);
  } catch (_) {
    return "[]";
  }
}

function reorderSessionImagesByRemoteOrder(remoteOrderKeys) {
  if (!Array.isArray(remoteOrderKeys) || remoteOrderKeys.length <= 0)
    return false;
  if (!Array.isArray(state.images) || state.images.length <= 0) return false;

  const remaining = new Map();
  state.images.forEach((item) => {
    const key = getSyncMediaIdentity(item);
    if (!key) return;
    if (!remaining.has(key)) {
      remaining.set(key, []);
    }
    remaining.get(key).push(item);
  });

  const nextImages = [];
  remoteOrderKeys.forEach((key) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    const bucket = remaining.get(normalizedKey);
    if (!bucket || bucket.length <= 0) return;
    const item = bucket.shift();
    if (item) nextImages.push(item);
  });

  state.images.forEach((item) => {
    if (nextImages.includes(item)) return;
    nextImages.push(item);
  });

  if (nextImages.length !== state.images.length) return false;
  state.images = nextImages;
  return true;
}

function buildSyncRuntimePayload(reason, options = {}) {
  const includeMediaOrder = !!options.includeMediaOrder;
  const drawingVisible =
    !!drawingScreen && !drawingScreen.classList.contains("hidden");
  const reviewVisible =
    !!reviewScreen && !reviewScreen.classList.contains("hidden");

  const payload = {
    reason: String(reason || "runtime-update"),
    ts: Date.now(),
    mode: String(state.sessionMode || ""),
    sessionActive: drawingVisible && !reviewVisible,
    reviewActive: reviewVisible,
    isPlaying: !!state.isPlaying,
    selectedDuration: Math.max(0, Number(state.selectedDuration || 0) || 0),
    timeRemaining: Math.max(0, Number(state.timeRemaining || 0) || 0),
    currentIndex: Math.max(0, Number(state.currentIndex || 0) || 0),
    currentStepIndex: Math.max(0, Number(state.currentStepIndex || 0) || 0),
    currentPoseInStep: Math.max(1, Number(state.currentPoseInStep || 1) || 1),
    memoryType: String(state.memoryType || "flash"),
    memoryDuration: Math.max(0, Number(state.memoryDuration || 0) || 0),
    memoryPosesCount: Math.max(1, Number(state.memoryPosesCount || 1) || 1),
    memoryDrawingTime: Math.max(0, Number(state.memoryDrawingTime || 0) || 0),
    memoryNoPressure: !!state.memoryNoPressure,
    memoryHidden: !!state.memoryHidden,
    totalSessionTime: Math.max(0, Number(state.totalSessionTime || 0) || 0),
    imagesCount: Array.isArray(state.images) ? state.images.length : 0,
  };

  if (String(payload.mode || "").trim() === "custom") {
    const customQueue = buildSyncCustomQueuePayload();
    payload.customQueue = customQueue;
    payload.customQueueLength = customQueue.length;
  }

  if (includeMediaOrder) {
    payload.mediaOrderKeys = buildSyncMediaOrderKeys();
  }

  return payload;
}

async function emitSyncRuntimeState(reason, options = {}) {
  if (syncRuntimeApplyInProgress) return false;
  if (!isSyncSessionHostActive()) return false;

  const service = syncSessionService;
  if (!service || typeof service.publishSessionState !== "function")
    return false;

  const payload = buildSyncRuntimePayload(reason, options);
  if (
    Array.isArray(payload.mediaOrderKeys) &&
    payload.mediaOrderKeys.length > 0
  ) {
    const maxOrderEntries = 12000;
    if (payload.mediaOrderKeys.length > maxOrderEntries) {
      payload.mediaOrderCount = payload.mediaOrderKeys.length;
      payload.mediaOrderKeys = payload.mediaOrderKeys.slice(0, maxOrderEntries);
      payload.mediaOrderTruncated = true;
    }

    const maxSerializedSize = 900000;
    const roughSize = JSON.stringify(payload).length;
    if (roughSize > maxSerializedSize) {
      const originalCount =
        payload.mediaOrderCount || payload.mediaOrderKeys.length;
      delete payload.mediaOrderKeys;
      payload.mediaOrderCount = originalCount;
      payload.mediaOrderSkipped = true;
    }
  }

  const fingerprintPayload = { ...payload };
  delete fingerprintPayload.reason;
  delete fingerprintPayload.ts;
  const fingerprint = JSON.stringify(fingerprintPayload);
  const nowMs = Date.now();
  const force = !!options.force;

  if (
    !force &&
    fingerprint === syncRuntimeLastSentFingerprint &&
    nowMs - syncRuntimeLastSentAt < 1200
  ) {
    return false;
  }

  syncRuntimeLastSentFingerprint = fingerprint;
  syncRuntimeLastSentAt = nowMs;
  try {
    await service.publishSessionState(payload);
    return true;
  } catch (error) {
    console.warn("[Sync] Failed to publish runtime state:", error);
    return false;
  }
}

function scheduleSyncRuntimeState(reason, options = {}) {
  if (!isSyncSessionHostActive()) return;
  syncRuntimePendingReason = String(
    reason || syncRuntimePendingReason || "runtime-update",
  );
  syncRuntimePendingOptions = {
    includeMediaOrder:
      !!syncRuntimePendingOptions.includeMediaOrder ||
      !!options.includeMediaOrder,
    force: !!syncRuntimePendingOptions.force || !!options.force,
  };

  if (syncRuntimePublishScheduled) return;
  syncRuntimePublishScheduled = true;
  queueMicrotask(() => {
    syncRuntimePublishScheduled = false;
    const pendingReason = syncRuntimePendingReason || "runtime-update";
    const pendingOptions = { ...syncRuntimePendingOptions };
    syncRuntimePendingReason = "";
    syncRuntimePendingOptions = {
      includeMediaOrder: false,
      force: false,
    };
    void emitSyncRuntimeState(pendingReason, pendingOptions);
  });
}

function maybeScheduleSyncRuntimeHeartbeat() {
  if (!isSyncSessionHostActive()) return;
  const nowMs = Date.now();
  if (nowMs - syncRuntimeLastHeartbeatAt < 3000) return;
  syncRuntimeLastHeartbeatAt = nowMs;
  scheduleSyncRuntimeState("timer-heartbeat");
}

function applyRemoteSyncRuntimeState(remoteState) {
  if (!remoteState || typeof remoteState !== "object") return;
  if (!isSyncSessionParticipantActive()) return;

  const revision = Math.max(0, Number(remoteState.revision || 0) || 0);
  if (revision > 0 && revision <= syncRuntimeLastAppliedRevision) {
    return;
  }

  maybeShowParticipantHostActionFeedback(remoteState);
  syncRuntimeApplyInProgress = true;
  try {
    if (revision > 0) {
      syncRuntimeLastAppliedRevision = revision;
    }

    const nextMode = String(remoteState.mode || "").trim();
    if (nextMode && nextMode !== state.sessionMode) {
      switchMode(nextMode);
    }

    if (
      Array.isArray(remoteState.mediaOrderKeys) &&
      remoteState.mediaOrderKeys.length > 0
    ) {
      const reordered = reorderSessionImagesByRemoteOrder(
        remoteState.mediaOrderKeys,
      );
      if (!reordered) {
        syncPendingRuntimeMediaOrderKeys = [...remoteState.mediaOrderKeys];
      } else {
        syncPendingRuntimeMediaOrderKeys = null;
      }
    }

    if (Array.isArray(remoteState.customQueue)) {
      const normalizedQueue = remoteState.customQueue
        .map((step) => normalizeCustomStep(step))
        .filter((step) => !!step && typeof step === "object");
      const queueFingerprint = getSyncCustomQueueFingerprint(normalizedQueue);
      if (queueFingerprint !== syncRuntimeLastAppliedCustomQueueFingerprint) {
        state.customQueue = normalizedQueue;
        syncRuntimeLastAppliedCustomQueueFingerprint = queueFingerprint;
        if (
          typeof renderCustomQueue === "function" &&
          settingsScreen &&
          !settingsScreen.classList.contains("hidden") &&
          String(state.sessionMode || "").trim() === "custom"
        ) {
          renderCustomQueue();
        }
      }
    }

    const selectedDuration = Number(remoteState.selectedDuration);
    if (Number.isFinite(selectedDuration) && selectedDuration > 0) {
      state.selectedDuration = Math.max(1, Math.floor(selectedDuration));
    }

    const timeRemaining = Number(remoteState.timeRemaining);
    if (Number.isFinite(timeRemaining) && timeRemaining >= 0) {
      state.timeRemaining = Math.max(0, Math.floor(timeRemaining));
    }

    const currentStepIndex = Number(remoteState.currentStepIndex);
    if (Number.isFinite(currentStepIndex) && currentStepIndex >= 0) {
      state.currentStepIndex = Math.floor(currentStepIndex);
    }

    const currentPoseInStep = Number(remoteState.currentPoseInStep);
    if (Number.isFinite(currentPoseInStep) && currentPoseInStep >= 1) {
      state.currentPoseInStep = Math.floor(currentPoseInStep);
    }

    const memoryType = String(remoteState.memoryType || "").trim();
    if (memoryType === "flash" || memoryType === "progressive") {
      state.memoryType = memoryType;
    }
    const memoryDuration = Number(remoteState.memoryDuration);
    if (Number.isFinite(memoryDuration) && memoryDuration >= 0) {
      state.memoryDuration = Math.max(0, Math.floor(memoryDuration));
    }
    const memoryPosesCount = Number(remoteState.memoryPosesCount);
    if (Number.isFinite(memoryPosesCount) && memoryPosesCount >= 1) {
      state.memoryPosesCount = clampMemorySessionPosesCount(
        Math.floor(memoryPosesCount),
        Array.isArray(state.images) ? state.images.length : 0,
        1,
      );
    }
    const memoryDrawingTime = Number(remoteState.memoryDrawingTime);
    if (Number.isFinite(memoryDrawingTime) && memoryDrawingTime >= 0) {
      state.memoryDrawingTime = Math.max(0, Math.floor(memoryDrawingTime));
    }
    if (typeof remoteState.memoryNoPressure === "boolean") {
      state.memoryNoPressure = remoteState.memoryNoPressure;
    }
    if (typeof remoteState.memoryHidden === "boolean") {
      state.memoryHidden = remoteState.memoryHidden;
    }

    const remoteSessionActive =
      typeof remoteState.sessionActive === "boolean"
        ? remoteState.sessionActive
        : null;
    const remoteReviewActive =
      typeof remoteState.reviewActive === "boolean"
        ? remoteState.reviewActive
        : null;
    const requiresPackValidationForStart =
      remoteSessionActive === true &&
      shouldRequireSyncParticipantPackValidation(syncSessionServiceState) &&
      !isSyncParticipantPackValidationCurrent(syncSessionServiceState);

    if (requiresPackValidationForStart) {
      notifySyncParticipantPackValidationRequired();
    }

    if (remoteSessionActive === true && !requiresPackValidationForStart) {
      const activeSyncModal = document.getElementById("sync-session-modal");
      if (activeSyncModal && !activeSyncModal.classList.contains("hidden")) {
        closeSyncSessionModal({ restoreFocus: false });
      }
    }

    if (remoteSessionActive === true && requiresPackValidationForStart) {
      if (drawingScreen && !drawingScreen.classList.contains("hidden")) {
        stopTimer();
        drawingScreen.classList.add("hidden");
        if (reviewScreen) reviewScreen.classList.add("hidden");
        document.body.classList.remove("review-active");
        if (settingsScreen) settingsScreen.classList.remove("hidden");
      }
    } else if (
      remoteSessionActive === true &&
      state.images.length > 0 &&
      ((settingsScreen && !settingsScreen.classList.contains("hidden")) ||
        (reviewScreen && !reviewScreen.classList.contains("hidden")))
    ) {
      const previousShuffle = state.randomShuffle;
      state.randomShuffle = false;
      try {
        startSession();
      } finally {
        state.randomShuffle = previousShuffle;
      }

      const isMemoryMode =
        String(nextMode || state.sessionMode || "").trim() === "memory";
      if (
        isMemoryMode &&
        drawingScreen &&
        drawingScreen.classList.contains("hidden") &&
        state.images.length > 0
      ) {
        console.warn(
          "[Sync] Participant memory start fallback triggered (drawing screen stayed hidden).",
        );
        if (settingsScreen) settingsScreen.classList.add("hidden");
        if (reviewScreen) reviewScreen.classList.add("hidden");
        document.body.classList.remove("review-active");
        drawingScreen.classList.remove("hidden");
      }
    } else if (
      remoteReviewActive === true &&
      reviewScreen &&
      reviewScreen.classList.contains("hidden")
    ) {
      showReview();
    } else if (
      remoteSessionActive === false &&
      remoteReviewActive !== true &&
      drawingScreen &&
      !drawingScreen.classList.contains("hidden")
    ) {
      stopTimer();
      drawingScreen.classList.add("hidden");
      if (reviewScreen) reviewScreen.classList.add("hidden");
      document.body.classList.remove("review-active");
      if (settingsScreen) settingsScreen.classList.remove("hidden");
    }

    const currentIndex = Number(remoteState.currentIndex);
    if (
      Number.isFinite(currentIndex) &&
      currentIndex >= 0 &&
      Array.isArray(state.images) &&
      state.images.length > 0
    ) {
      const clampedIndex = Math.max(
        0,
        Math.min(Math.floor(currentIndex), state.images.length - 1),
      );
      state.currentIndex = clampedIndex;
    }

    if (
      drawingScreen &&
      !drawingScreen.classList.contains("hidden") &&
      Array.isArray(state.images) &&
      state.images.length > 0
    ) {
      updateDisplay(false);
    } else {
      updateTimerDisplay();
    }

    const remoteIsPlaying =
      typeof remoteState.isPlaying === "boolean" ? remoteState.isPlaying : null;
    if (remoteIsPlaying === true) {
      if (
        !state.isPlaying &&
        drawingScreen &&
        !drawingScreen.classList.contains("hidden")
      ) {
        startTimer();
      } else {
        state.isPlaying = true;
        updatePlayPauseIcon();
      }
      if (timerDisplay) timerDisplay.classList.remove("timer-paused");
      if (pauseBadge) pauseBadge.classList.add("hidden");
    } else if (remoteIsPlaying === false) {
      if (state.isPlaying) {
        stopTimer();
      } else {
        state.isPlaying = false;
        updatePlayPauseIcon();
      }
      if (timerDisplay) timerDisplay.classList.add("timer-paused");
      if (pauseBadge) pauseBadge.classList.remove("hidden");
    }
  } catch (error) {
    console.warn("[Sync] Failed to apply remote runtime state:", error);
  } finally {
    syncRuntimeApplyInProgress = false;
  }
}

function closeSyncSessionControlModeMenu(modal) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.closeControlModeMenu === "function"
  ) {
    SYNC_SESSION_MODAL_HELPERS.closeControlModeMenu(modal);
    return;
  }
  if (!modal) return;
  const selectRoot = modal.querySelector("#sync-session-control-mode-select");
  const trigger = modal.querySelector("#sync-session-control-mode-trigger");
  const menu = modal.querySelector("#sync-session-control-mode-menu");

  if (selectRoot) {
    selectRoot.classList.remove("is-open");
  }
  if (menu) {
    menu.hidden = true;
  }
  if (trigger) {
    trigger.setAttribute("aria-expanded", "false");
  }
}

function updateSyncSessionControlModeSelect(modal, nextControlMode = null) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.updateControlModeSelect === "function"
  ) {
    return SYNC_SESSION_MODAL_HELPERS.updateControlModeSelect(
      modal,
      nextControlMode,
      {
        options: SYNC_SESSION_CONTROL_MODE_OPTIONS,
        getText: (key, fallback) => getI18nText(key, fallback),
      },
    );
  }
  if (!modal) return SYNC_SESSION_CONTROL_MODE_OPTIONS[0].value;
  const selectRoot = modal.querySelector("#sync-session-control-mode-select");
  if (!selectRoot) return SYNC_SESSION_CONTROL_MODE_OPTIONS[0].value;

  const currentValue = nextControlMode || selectRoot.dataset.value;
  const activeConfig = getSyncSessionControlModeConfig(currentValue);
  selectRoot.dataset.value = activeConfig.value;

  const valueEl = selectRoot.querySelector(".sync-session-control-mode-value");
  if (valueEl) {
    valueEl.setAttribute("data-i18n", activeConfig.key);
    valueEl.textContent = getI18nText(activeConfig.key, activeConfig.fallback);
  }

  selectRoot
    .querySelectorAll(
      ".sync-session-control-mode-option[data-sync-control-mode]",
    )
    .forEach((optionEl) => {
      const isSelected =
        optionEl.dataset.syncControlMode === activeConfig.value;
      optionEl.classList.toggle("active", isSelected);
      optionEl.setAttribute("aria-selected", isSelected ? "true" : "false");
    });

  const trigger = selectRoot.querySelector(
    "#sync-session-control-mode-trigger",
  );
  const menu = selectRoot.querySelector("#sync-session-control-mode-menu");
  if (trigger) {
    trigger.setAttribute(
      "aria-expanded",
      menu && !menu.hidden ? "true" : "false",
    );
  }

  return activeConfig.value;
}

function getSyncSessionControlModeValue(modal) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.getControlModeValue === "function"
  ) {
    return SYNC_SESSION_MODAL_HELPERS.getControlModeValue(
      modal,
      SYNC_SESSION_CONTROL_MODE_OPTIONS,
    );
  }
  if (!modal) return SYNC_SESSION_CONTROL_MODE_OPTIONS[0].value;
  const selectRoot = modal.querySelector("#sync-session-control-mode-select");
  const current =
    selectRoot?.dataset?.value || SYNC_SESSION_CONTROL_MODE_OPTIONS[0].value;
  return getSyncSessionControlModeConfig(current).value;
}

async function copySyncSessionCodeToClipboard(sessionCode) {
  if (
    SYNC_RUNTIME_HELPERS &&
    typeof SYNC_RUNTIME_HELPERS.copyTextToClipboard === "function"
  ) {
    return SYNC_RUNTIME_HELPERS.copyTextToClipboard(sessionCode, {
      navigatorRef: typeof navigator !== "undefined" ? navigator : null,
      documentRef: typeof document !== "undefined" ? document : null,
    });
  }
  const text = String(sessionCode || "").trim();
  if (!text) return false;

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = !!document.execCommand("copy");
  } catch (_) {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

function showSyncSessionToast(options = {}) {
  if (typeof window.showPoseChronoToast !== "function") return;
  const toastType = String(options?.type || "info")
    .trim()
    .toLowerCase();
  if (toastType === "error" && typeof document !== "undefined") {
    const limit = getSyncErrorToastLimit();
    const activeErrorToasts = document.querySelectorAll(
      "#posechrono-toast-container .pc-toast.pc-toast-error",
    ).length;
    if (activeErrorToasts >= limit) {
      return;
    }
  }
  window.showPoseChronoToast(options);
}

function getSyncTransferModalElements() {
  if (typeof document === "undefined") return null;
  const modal = document.getElementById("sync-transfer-modal");
  if (!modal) return null;
  return {
    modal,
    titleEl: modal.querySelector("#sync-transfer-modal-title"),
    statusEl: modal.querySelector("#sync-transfer-modal-status"),
    progressTrackEl: modal.querySelector("#sync-transfer-modal-progress-track"),
    progressFillEl: modal.querySelector("#sync-transfer-modal-progress-fill"),
    progressTextEl: modal.querySelector("#sync-transfer-modal-progress-text"),
    metaEl: modal.querySelector("#sync-transfer-modal-meta"),
  };
}

function setSyncTransferModalTone(elements, tone = "warning") {
  if (!elements) return;
  const statusEl = elements.statusEl;
  const trackEl = elements.progressTrackEl;
  if (statusEl) {
    statusEl.classList.remove("is-success", "is-warning", "is-error");
    if (tone === "success") statusEl.classList.add("is-success");
    else if (tone === "error") statusEl.classList.add("is-error");
    else statusEl.classList.add("is-warning");
  }
  if (trackEl) {
    trackEl.classList.remove("is-success", "is-error");
    if (tone === "success") trackEl.classList.add("is-success");
    if (tone === "error") trackEl.classList.add("is-error");
  }
}

function clearSyncTransferModalAutoCloseTimer() {
  if (syncTransferModalAutoCloseTimer) {
    clearTimeout(syncTransferModalAutoCloseTimer);
    syncTransferModalAutoCloseTimer = null;
  }
}

function openSyncTransferModal(options = {}) {
  const elements = getSyncTransferModalElements();
  if (!elements) return;
  clearSyncTransferModalAutoCloseTimer();

  if (syncTransferAbortController) {
    try {
      syncTransferAbortController.abort();
    } catch (_) {}
  }
  syncTransferAbortController = new AbortController();

  const title = String(options.title || "Online transfer").trim();
  const status = String(options.status || "Preparing transfer...").trim();
  const meta = String(options.meta || "").trim();
  const tone = String(options.tone || "warning").trim();

  if (elements.titleEl) elements.titleEl.textContent = title;
  if (elements.statusEl) elements.statusEl.textContent = status;
  if (elements.metaEl) elements.metaEl.textContent = meta;
  updateSyncTransferModalProgress({ done: 0, total: 0, percent: 0 });
  setSyncTransferModalTone(elements, tone);

  const cancelBtn = elements.modal.querySelector(
    "#sync-transfer-modal-cancel-btn",
  );
  if (cancelBtn) {
    cancelBtn.classList.remove("hidden");
    cancelBtn.disabled = false;
  }

  elements.modal.classList.remove("hidden");
}

function getSyncTransferAbortSignal() {
  return syncTransferAbortController
    ? syncTransferAbortController.signal
    : null;
}

function cancelSyncTransfer() {
  if (syncTransferAbortController) {
    try {
      syncTransferAbortController.abort();
    } catch (_) {}
    syncTransferAbortController = null;
  }
  closeSyncTransferModal();
}

function updateSyncTransferModalProgress(options = {}) {
  const elements = getSyncTransferModalElements();
  if (!elements) return;
  const done = Math.max(0, Number(options.done || 0) || 0);
  const total = Math.max(0, Number(options.total || 0) || 0);
  const hasPercent = Number.isFinite(Number(options.percent));
  const rawPercent = hasPercent
    ? Number(options.percent)
    : total > 0
      ? (done / total) * 100
      : 0;
  const percent = Math.max(0, Math.min(100, rawPercent));
  const roundedPercent = Math.max(0, Math.min(100, Math.round(percent)));

  if (elements.progressFillEl) {
    elements.progressFillEl.style.width = `${percent.toFixed(1)}%`;
  }
  if (elements.progressTrackEl) {
    elements.progressTrackEl.setAttribute(
      "aria-valuenow",
      String(roundedPercent),
    );
  }

  const progressText =
    total > 0 ? `${done}/${total} (${roundedPercent}%)` : `${roundedPercent}%`;
  if (elements.progressTextEl)
    elements.progressTextEl.textContent = progressText;
}

function updateSyncTransferModalState(options = {}) {
  const elements = getSyncTransferModalElements();
  if (!elements) return;
  const status = String(options.status || "").trim();
  const meta = String(options.meta || "").trim();
  const tone = String(options.tone || "").trim();
  if (status && elements.statusEl) {
    elements.statusEl.textContent = status;
  }
  if (typeof options.meta === "string" && elements.metaEl) {
    elements.metaEl.textContent = meta;
  }
  if (tone) {
    setSyncTransferModalTone(elements, tone);
  }
  updateSyncTransferModalProgress(options);
}

function closeSyncTransferModal(options = {}) {
  const elements = getSyncTransferModalElements();
  if (!elements) return;
  const delayMs = Math.max(0, Number(options.delayMs || 0) || 0);
  clearSyncTransferModalAutoCloseTimer();
  const closeNow = () => {
    elements.modal.classList.add("hidden");
    const cancelBtn = elements.modal.querySelector(
      "#sync-transfer-modal-cancel-btn",
    );
    if (cancelBtn) cancelBtn.disabled = true;
  };
  if (delayMs > 0) {
    syncTransferModalAutoCloseTimer = setTimeout(() => {
      syncTransferModalAutoCloseTimer = null;
      closeNow();
    }, delayMs);
    return;
  }
  closeNow();
}

function getSyncErrorToastLimit() {
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("posechrono-sync-error-toast-limit")
        : null;
    const parsed = Number.parseInt(String(raw || "").trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(
        SYNC_ERROR_TOAST_LIMIT_MIN,
        Math.min(SYNC_ERROR_TOAST_LIMIT_MAX, parsed),
      );
    }
  } catch (_) {}
  return SYNC_ERROR_TOAST_LIMIT_DEFAULT;
}

function toggleSyncSessionControlModeMenu(modal) {
  if (
    SYNC_SESSION_MODAL_HELPERS &&
    typeof SYNC_SESSION_MODAL_HELPERS.toggleControlModeMenu === "function"
  ) {
    SYNC_SESSION_MODAL_HELPERS.toggleControlModeMenu(modal);
    return;
  }
  if (!modal) return;
  const selectRoot = modal.querySelector("#sync-session-control-mode-select");
  const trigger = modal.querySelector("#sync-session-control-mode-trigger");
  const menu = modal.querySelector("#sync-session-control-mode-menu");
  if (!selectRoot || !trigger || !menu) return;

  const nextOpenState = menu.hidden;
  menu.hidden = !nextOpenState;
  selectRoot.classList.toggle("is-open", nextOpenState);
  trigger.setAttribute("aria-expanded", nextOpenState ? "true" : "false");
}

function setSyncSessionModalRole(nextRole) {
  const modal = document.getElementById("sync-session-modal");
  if (
    SYNC_SESSION_CONTROLLER &&
    typeof SYNC_SESSION_CONTROLLER.setModalRole === "function"
  ) {
    syncSessionModalRole = SYNC_SESSION_CONTROLLER.setModalRole({
      modal,
      nextRole,
      state: syncSessionServiceState,
      onRoleChanged: (role) => {
        syncSessionModalRole = role;
      },
      onAfterRoleUpdated: ({ modal: activeModal }) => {
        updateSyncSessionModalPanelsVisibility(
          activeModal,
          syncSessionServiceState,
        );
        closeSyncSessionControlModeMenu(activeModal);
        renderSyncSessionStatus(activeModal);
      },
    });
    return;
  }

  const role = nextRole === "join" ? "join" : "host";
  syncSessionModalRole = role;
  if (!modal) return;
  modal
    .querySelectorAll(".sync-session-role-btn[data-sync-role]")
    .forEach((btn) => {
      const isActive = btn.dataset.syncRole === role;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  updateSyncSessionModalPanelsVisibility(modal, syncSessionServiceState);
  closeSyncSessionControlModeMenu(modal);
  renderSyncSessionStatus(modal);
}

function openSyncSessionModal() {
  if (!isSyncFeatureEnabled()) {
    return;
  }
  const modal = document.getElementById("sync-session-modal");
  if (!modal) return;
  syncSessionLastFocusedElement = document.activeElement;
  ensureSyncSessionService(modal);
  setSyncSessionModalRole(syncSessionModalRole || "host");
  updateSyncSessionControlModeSelect(modal);
  closeSyncSessionControlModeMenu(modal);
  const activeSyncSession = isSyncSessionActive(syncSessionServiceState);
  const primaryActionTarget =
    syncSessionModalRole === "join"
      ? modal.querySelector("#sync-session-join-btn")
      : modal.querySelector("#sync-session-create-btn");
  const focusTarget = activeSyncSession
    ? modal.querySelector("#sync-session-leave-btn")
    : primaryActionTarget || modal.querySelector(".modal-close-btn");
  if (
    SYNC_SESSION_CONTROLLER &&
    typeof SYNC_SESSION_CONTROLLER.openModal === "function"
  ) {
    SYNC_SESSION_CONTROLLER.openModal({
      modal,
      role: syncSessionModalRole || "host",
      state: syncSessionServiceState,
      restoreFocusTarget: focusTarget,
    });
    return;
  }

  modal.classList.remove("hidden");
  setTimeout(() => {
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }, 0);
}

function closeSyncSessionModal(options = {}) {
  const { restoreFocus = true } = options;
  const modal = document.getElementById("sync-session-modal");
  if (!modal) return;
  if (
    SYNC_SESSION_CONTROLLER &&
    typeof SYNC_SESSION_CONTROLLER.closeModal === "function"
  ) {
    SYNC_SESSION_CONTROLLER.closeModal({
      modal,
      restoreFocus,
      lastFocusedElement: syncSessionLastFocusedElement,
      onBeforeClose: ({ modal: activeModal }) => {
        closeSyncSessionControlModeMenu(activeModal);
        hideSyncSessionParticipantsTooltip();
      },
    });
    syncSessionLastFocusedElement = null;
    return;
  }

  closeSyncSessionControlModeMenu(modal);
  hideSyncSessionParticipantsTooltip();
  modal.classList.add("hidden");
  if (
    restoreFocus &&
    syncSessionLastFocusedElement &&
    typeof syncSessionLastFocusedElement.focus === "function"
  ) {
    syncSessionLastFocusedElement.focus();
  }
  syncSessionLastFocusedElement = null;
}

function setupSyncSessionModalBindings() {
  if (syncSessionModalBindingsReady) return;
  if (!isSyncFeatureEnabled()) return;
  const modal = document.getElementById("sync-session-modal");
  if (!modal) return;

  const closeBtn = modal.querySelector("#close-sync-session-modal");
  const createBtn = modal.querySelector("#sync-session-create-btn");
  const joinBtn = modal.querySelector("#sync-session-join-btn");
  const leaveBtn = modal.querySelector("#sync-session-leave-btn");
  const hostPasswordInput = modal.querySelector("#sync-session-host-password");
  const joinCodeInput = modal.querySelector("#sync-session-code");
  const joinPseudoInput = modal.querySelector("#sync-session-guest-pseudo");
  const joinPasswordInput = modal.querySelector("#sync-session-password");
  const guestActionNotificationsInput = modal.querySelector(
    "#sync-session-guest-action-notifications-btn",
  );
  const invitePanel = modal.querySelector("#sync-session-invite-panel");
  const copyCodeBtn =
    modal.querySelector("#sync-session-code-row") ||
    modal.querySelector("#sync-session-copy-code-btn");
  const copyServerAddressHostBtn = modal.querySelector(
    "#sync-session-copy-server-address-host-btn",
  );
  const copyServerAddressConnectedBtn = modal.querySelector(
    "#sync-session-copy-server-address-connected-btn",
  );
  const exportPackBtn = modal.querySelector("#sync-session-export-pack-btn");
  const importPackBtn = modal.querySelector("#sync-session-import-pack-btn");
  const publishOnlinePackBtn = modal.querySelector(
    "#sync-session-publish-online-pack-btn",
  );
  const downloadOnlinePackBtn = modal.querySelector(
    "#sync-session-download-online-pack-btn",
  );
  const statusEl = modal.querySelector("#sync-session-status");
  const controlModeSelect = modal.querySelector(
    "#sync-session-control-mode-select",
  );
  const controlModeTrigger = modal.querySelector(
    "#sync-session-control-mode-trigger",
  );
  const controlModeMenu = modal.querySelector(
    "#sync-session-control-mode-menu",
  );

  // --- Relay URL field ---
  const relayUrlInput = modal.querySelector("#sync-session-relay-url");
  const relayUrlSaveBtn = modal.querySelector(
    "#sync-session-relay-url-save-btn",
  );
  const relayUrlRow = relayUrlInput ? relayUrlInput.closest(".sync-session-relay-url-row") || relayUrlInput.parentElement : null;
  const isLoopbackRelayUrl = (url) => {
    try {
      const parsed = new URL(String(url || "").trim());
      const host = String(parsed.hostname || "").trim().toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "::1";
    } catch (_) {
      return false;
    }
  };
  const isUnshareableRelayUrl = (url) => {
    try {
      const parsed = new URL(String(url || "").trim());
      const host = String(parsed.hostname || "").trim().toLowerCase();
      return (
        host === "0.0.0.0" ||
        host === "::" ||
        isLoopbackRelayUrl(url)
      );
    } catch (_) {
      return true;
    }
  };
  const extractRelayUrlFromText = (text) => {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const match = raw.match(/wss?:\/\/[^\s"'<>]+/i);
    if (!match) return "";
    let candidate = String(match[0] || "").trim();
    candidate = candidate.replace(/[),.;]+$/, "");
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return "";
      return parsed.toString().replace(/\/$/, "");
    } catch (_) {
      return "";
    }
  };
  const rememberSuggestedLocalRelayUrl = (candidateUrl) => {
    const normalized = extractRelayUrlFromText(candidateUrl);
    if (!normalized) return;
    if (isUnshareableRelayUrl(normalized)) return;
    syncSessionSuggestedLocalRelayUrl = normalized;
  };
  const resolveShareableRelayUrl = async () => {
    const current = String(relayUrlInput?.value || "").trim();
    if (current && !isUnshareableRelayUrl(current)) return current;
    if (syncSessionSuggestedLocalRelayUrl) return syncSessionSuggestedLocalRelayUrl;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.readText === "function"
      ) {
        const clipboardText = await navigator.clipboard.readText();
        const clipUrl = extractRelayUrlFromText(clipboardText);
        if (clipUrl && !isUnshareableRelayUrl(clipUrl)) {
          rememberSuggestedLocalRelayUrl(clipUrl);
          return clipUrl;
        }
      }
    } catch (_) {}
    return current;
  };
  const copyActionFeedbackTimers = new WeakMap();
  const pulseCopyButton = (buttonEl) => {
    if (!buttonEl) return;
    const previousTimer = copyActionFeedbackTimers.get(buttonEl);
    if (previousTimer) clearTimeout(previousTimer);
    buttonEl.classList.add("is-copied");
    const timer = setTimeout(() => {
      buttonEl.classList.remove("is-copied");
      copyActionFeedbackTimers.delete(buttonEl);
    }, 1400);
    copyActionFeedbackTimers.set(buttonEl, timer);
  };
  const handleCopyServerAddressClick = async (event) => {
    const sourceButton = event?.currentTarget || null;
    const address = await resolveShareableRelayUrl();
    if (!address) {
      showSyncSessionToast({
        type: "error",
        message: getI18nText(
          "sync.copyServerAddressEmpty",
          "Aucune adresse serveur à copier.",
        ),
        duration: 2600,
      });
      return;
    }
    const copied = await copySyncSessionCodeToClipboard(address);
    if (!copied) {
      showSyncSessionToast({
        type: "error",
        message: getI18nText(
          "sync.errorCopyFailed",
          "Impossible de copier l'adresse serveur.",
        ),
        duration: 2600,
      });
      return;
    }
    if (relayUrlInput && String(relayUrlInput.value || "").trim() !== address) {
      relayUrlInput.value = address;
      rememberSuggestedLocalRelayUrl(address);
    }
    pulseCopyButton(sourceButton);
    if (isUnshareableRelayUrl(address)) {
      const loopbackMessage = decodeHtmlEntities(
        getI18nText(
          "sync.copyServerAddressLoopback",
          "Adresse locale copiée : {{address}} (même appareil uniquement).",
          { address },
        ),
      );
      showSyncSessionToast({
        type: "warning",
        message: loopbackMessage,
        duration: 3600,
      });
      return;
    }
    const copiedMessage = decodeHtmlEntities(
      getI18nText(
        "sync.copyServerAddressDone",
        "Adresse serveur copiée : {{address}}",
        { address },
      ),
    );
    showSyncSessionToast({
      type: "success",
      message: copiedMessage,
      duration: 3200,
    });
  };
  const buildInviteClipboardPayload = async () => {
    const address = String(await resolveShareableRelayUrl()).trim();
    const sessionCode = normalizeSyncSessionCode(
      syncSessionServiceState?.sessionCode || joinCodeInput?.value || "",
    );
    if (!address || !sessionCode) {
      return { ok: false, address, sessionCode, text: "" };
    }
    const text = decodeHtmlEntities(
      getI18nText(
        "sync.copyInvitePayloadTemplate",
        "Adresse du serveur :\n{{address}}\n\nCode de session :\n{{code}}",
        { address, code: sessionCode },
      ),
    );
    return { ok: true, address, sessionCode, text };
  };
  const handleInvitePanelBackgroundCopyClick = async (event) => {
    if (!invitePanel) return;
    // Only trigger when clicking empty panel area, not interactive children.
    if (event.target !== invitePanel) return;
    const payload = await buildInviteClipboardPayload();
    if (!payload.ok) {
      showSyncSessionToast({
        type: "error",
        message: getI18nText(
          "sync.copyInvitePayloadFailed",
          "Impossible de copier l'invitation complète.",
        ),
        duration: 2600,
      });
      return;
    }
    const copied = await copySyncSessionCodeToClipboard(payload.text);
    if (!copied) {
      showSyncSessionToast({
        type: "error",
        message: getI18nText(
          "sync.copyInvitePayloadFailed",
          "Impossible de copier l'invitation complète.",
        ),
        duration: 2600,
      });
      return;
    }
    pulseCopyButton(copyCodeBtn);
    if (copyServerAddressConnectedBtn) pulseCopyButton(copyServerAddressConnectedBtn);
    pulseCopyButton(invitePanel);
    showSyncSessionToast({
      type: "success",
      message: getI18nText(
        "sync.copyInvitePayloadDone",
        "Invitation complète copiée (adresse + code).",
      ),
      duration: 2600,
    });
  };
  if (relayUrlInput) {
    const RELAY_URL_STORAGE_KEY = "posechrono-sync-ws-url";
    const savedUrl = (() => {
      try {
        return localStorage.getItem(RELAY_URL_STORAGE_KEY) || "";
      } catch (_) {
        return "";
      }
    })();
    const configUrl = (() => {
      try {
        return String(CONFIG?.SYNC?.wsUrl || "").trim();
      } catch (_) {
        return "";
      }
    })();
    relayUrlInput.value = savedUrl || configUrl || "";
    rememberSuggestedLocalRelayUrl(relayUrlInput.value);

    const isLocalRelayUrl = (url) => {
      try {
        const parsed = new URL(url);
        const h = parsed.hostname;
        return (
          h === "localhost" ||
          h === "127.0.0.1" ||
          h.startsWith("192.168.") ||
          h.startsWith("10.") ||
          h.startsWith("172.16.") ||
          h.startsWith("172.17.") ||
          h.startsWith("172.18.") ||
          h.startsWith("172.19.") ||
          h.startsWith("172.2") ||
          h.startsWith("172.30.") ||
          h.startsWith("172.31.")
        );
      } catch (_) {
        return false;
      }
    };

    const saveRelayUrl = () => {
      const value = relayUrlInput.value.trim();
      const currentEffectiveUrl = savedUrl || configUrl || "";
      const urlChanged = value !== currentEffectiveUrl;

      // Reject non-local URLs that don't use wss://
      if (value && value.startsWith("ws://") && !isLocalRelayUrl(value)) {
        showSyncSessionToast({
          type: "error",
          message: getI18nText(
            "sync.errorTlsRequired",
            "Secure connection (wss://) required for internet relays.",
          ),
          duration: 3200,
        });
        relayUrlInput.focus();
        return;
      }

      try {
        if (value && value !== configUrl) {
          localStorage.setItem(RELAY_URL_STORAGE_KEY, value);
        } else {
          localStorage.removeItem(RELAY_URL_STORAGE_KEY);
        }
        // Also ensure transport mode is "ws" when a ws:// URL is set
        if (
          value &&
          (value.startsWith("ws://") || value.startsWith("wss://"))
        ) {
          localStorage.setItem("posechrono-sync-transport", "ws");
        }
      } catch (_) {}
      rememberSuggestedLocalRelayUrl(value);
      if (urlChanged) {
        // Transport is created at startup — reload immediately to apply the new URL.
        localStorage.setItem('posechrono-reopen-sync-modal', 'true');
        localStorage.setItem('posechrono-reopen-sync-modal-role', syncSessionModalRole || 'host');
        location.reload();
        return;
      }
      if (relayUrlSaveBtn) {
        relayUrlSaveBtn.classList.add("saved");
        setTimeout(() => relayUrlSaveBtn.classList.remove("saved"), 1200);
      }
    };

    if (relayUrlSaveBtn) {
      relayUrlSaveBtn.addEventListener("click", saveRelayUrl);
    }
    relayUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveRelayUrl();
      }
    });
  }

  if (copyServerAddressHostBtn) {
    copyServerAddressHostBtn.addEventListener(
      "click",
      handleCopyServerAddressClick,
    );
  }
  if (copyServerAddressConnectedBtn) {
    copyServerAddressConnectedBtn.addEventListener(
      "click",
      handleCopyServerAddressClick,
    );
  }
  if (invitePanel) {
    invitePanel.addEventListener("click", handleInvitePanelBackgroundCopyClick);
  }

  // --- Connection type (Internet / Local) ---
  const publicSyncAllowed = CONFIG?.SYNC?.allowPublicSync !== false;

  const connInternetBtn = modal.querySelector("#sync-conn-internet-btn");
  const connLocalBtn = modal.querySelector("#sync-conn-local-btn");
  const hostLocalSection = modal.querySelector(".sync-session-host-local-section");
  const joinLocalSection = modal.querySelector(".sync-session-join-local-section");
  const startLocalServerBtn = modal.querySelector("#sync-session-start-local-server-btn");
  const connTypeHint = modal.querySelector("#sync-conn-type-hint");

  // When public sync is disabled: reset any saved "internet" preference to "local"
  if (!publicSyncAllowed) {
    if (UIPreferences.get("syncConnectionType", "local") === "internet") {
      UIPreferences.set("syncConnectionType", "local");
    }
  }

  const updateConnTypeUI = (type) => {
    const effectiveType = (!publicSyncAllowed && type === "internet") ? "local" : type;
    if (connInternetBtn) connInternetBtn.classList.toggle("active", effectiveType === "internet");
    if (connLocalBtn) connLocalBtn.classList.toggle("active", effectiveType === "local");
    if (connInternetBtn) connInternetBtn.setAttribute("aria-pressed", effectiveType === "internet" ? "true" : "false");
    if (connLocalBtn) connLocalBtn.setAttribute("aria-pressed", effectiveType === "local" ? "true" : "false");

    const isLocal = effectiveType === "local";
    if (hostLocalSection) hostLocalSection.classList.toggle("hidden", !isLocal);
    if (joinLocalSection) joinLocalSection.classList.toggle("hidden", !isLocal);
    // Hide the relay URL field in internet mode (non-technical users don't need it)
    if (relayUrlRow) relayUrlRow.classList.toggle("hidden", !isLocal);

    if (connTypeHint) {
      if (isLocal) {
        connTypeHint.setAttribute("data-i18n", "sync.connLocalHint");
        connTypeHint.textContent = getI18nText("sync.connLocalHint", "Dessiner avec des artistes sur le même réseau");
      } else {
        connTypeHint.setAttribute("data-i18n", "sync.connInternetHint");
        connTypeHint.textContent = getI18nText("sync.connInternetHint", "Dessiner avec des artistes où qu'ils soient");
      }
    }
  };

  const currentConnType = UIPreferences.get("syncConnectionType", "local");
  updateConnTypeUI(currentConnType);

  if (connInternetBtn && publicSyncAllowed) {
    connInternetBtn.addEventListener("click", () => {
      if (UIPreferences.get("syncConnectionType", "local") === "internet") return;
      UIPreferences.set("syncConnectionType", "internet");
      updateConnTypeUI("internet");
      if (relayUrlInput) {
        relayUrlInput.value = "wss://posechrono-sync-online.onrender.com";
        if (relayUrlSaveBtn) relayUrlSaveBtn.click();
      }
    });
  }

  if (connLocalBtn) {
    connLocalBtn.addEventListener("click", () => {
      if (UIPreferences.get("syncConnectionType", "local") === "local") return;
      UIPreferences.set("syncConnectionType", "local");
      updateConnTypeUI("local");
      if (relayUrlInput) {
        relayUrlInput.value = "ws://127.0.0.1:8787";
        if (relayUrlSaveBtn) relayUrlSaveBtn.click();
      }
    });
  }

  if (startLocalServerBtn) {
    // Check if local server is reachable and update button state
    const markServerReady = () => {
      startLocalServerBtn.classList.add("is-ready");
      startLocalServerBtn.textContent = getI18nText("sync.localServerReady", "✓ Serveur local prêt");
      updateSyncSessionNetworkStatus(modal);
    };
    const markServerPending = () => {
      startLocalServerBtn.classList.remove("is-ready");
      startLocalServerBtn.textContent = getI18nText("sync.startLocalServer", "Démarrer mon serveur local");
      updateSyncSessionNetworkStatus(modal);
    };

    const readSuggestedRelayUrlFromHealth = (payload) => {
      if (!payload || typeof payload !== "object") return "";
      const directCandidate = extractRelayUrlFromText(
        String(payload.suggestedRelayUrl || ""),
      );
      if (directCandidate && !isUnshareableRelayUrl(directCandidate)) {
        return directCandidate;
      }
      const relayUrls = Array.isArray(payload.relayUrls) ? payload.relayUrls : [];
      for (const candidate of relayUrls) {
        const normalized = extractRelayUrlFromText(String(candidate || ""));
        if (!normalized || isUnshareableRelayUrl(normalized)) continue;
        return normalized;
      }
      return "";
    };

    const pingLocalServer = async (wsUrl) => {
      // Use HTTP /health endpoint instead of raw WebSocket to avoid protocol violations
      try {
        const httpUrl = wsUrl.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://") + "/health";
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        let response = null;
        try {
          response = await fetch(httpUrl, { signal: ctrl.signal });
        } finally {
          clearTimeout(timer);
        }
        const ok = !!response && response.ok;
        let payload = null;
        if (response) {
          try {
            payload = await response.json();
          } catch (_) {}
        }
        const suggestedUrl = readSuggestedRelayUrlFromHealth(payload);
        return { ok, suggestedUrl };
      } catch (_) {
        return { ok: false, suggestedUrl: "" };
      }
    };

    // Check on modal open + periodic health check
    const getLocalUrl = () => relayUrlInput?.value?.trim() || "ws://127.0.0.1:8787";
    const connType = UIPreferences.get("syncConnectionType", "local");

    const runHealthCheck = async () => {
      const url = getLocalUrl();
      if (!url.startsWith("ws://")) return;
      const health = await pingLocalServer(url);
      if (health.suggestedUrl) {
        rememberSuggestedLocalRelayUrl(health.suggestedUrl);
      }
      if (health.ok) markServerReady(); else markServerPending();
    };

    if (connType === "local") {
      runHealthCheck();
    }

    // Keep checking every 5s while modal is visible
    const healthInterval = setInterval(() => {
      const ct = UIPreferences.get("syncConnectionType", "local");
      if (ct !== "local" || modal.classList.contains("hidden")) {
        return;
      }
      runHealthCheck();
    }, 5000);

    // Clean up interval when modal closes
    const observer = new MutationObserver(() => {
      if (modal.classList.contains("hidden")) {
        clearInterval(healthInterval);
        observer.disconnect();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });

    startLocalServerBtn.addEventListener("click", () => {
      if (startLocalServerBtn.classList.contains("is-ready")) return;

      const platform = getPlatformAdapter();
      if (platform && platform.system) {
        try {
          const urlObj = new URL(window.location.href);
          let basePath = decodeURIComponent(urlObj.pathname);
          basePath = basePath.replace(/^\/+([a-zA-Z]:\/)/, '$1');
          const batDir = basePath.substring(0, basePath.lastIndexOf('/'));
          const batPath = batDir + '/js/syncroModule/start_local_sync_server.bat';
          const safePath = batPath.replace(/\//g, '\\');
          
          if (platform.system.openPath) {
            platform.system.openPath(safePath);
          } else if (platform.system.showItemInFolder) {
            platform.system.showItemInFolder(safePath);
          }
        } catch (e) {
          console.warn("[Sync] Failed to launch local server script:", e);
        }
      }

      startLocalServerBtn.textContent = getI18nText("sync.localServerStarting", "Lancement…");

      // Poll until server is reachable
      let pollAttempts = 0;
      const pollUrl = relayUrlInput?.value?.trim() || "ws://127.0.0.1:8787";
      const pollTimer = setInterval(async () => {
        pollAttempts++;
        if (pollAttempts > 15) { clearInterval(pollTimer); markServerPending(); return; }
        const health = await pingLocalServer(pollUrl);
        if (health.suggestedUrl) {
          rememberSuggestedLocalRelayUrl(health.suggestedUrl);
        }
        if (health.ok) {
          clearInterval(pollTimer);
          markServerReady();
          const startedAddress =
            health.suggestedUrl || (await resolveShareableRelayUrl());
          const startedAddressLabel = String(startedAddress || pollUrl).trim();
          showSyncSessionToast({
            type: "success",
            message:
              getI18nText("sync.localServerStarted", "Serveur local démarré !") +
              " (IP copiée : " +
              startedAddressLabel +
              ")",
            duration: 4000,
          });
        }
      }, 2000);

      // Auto-fill workflow: poll clipboard for the new IP pasted by the .bat
      // Only pre-fills the input — the user must click "Apply" to save.
      let autoFillDone = false;
      const checkClipboard = async () => {
        if (autoFillDone) return;
        try {
          let text = "";
          if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
          }
          const detectedUrl = extractRelayUrlFromText(text);
          if (detectedUrl && detectedUrl.includes(":8787")) {
            rememberSuggestedLocalRelayUrl(detectedUrl);
            updateSyncSessionNetworkStatus(modal);
            autoFillDone = true;
            if (relayUrlInput && relayUrlInput.value !== detectedUrl) {
              relayUrlInput.value = detectedUrl;
              // Do NOT auto-save: the user must click Apply to confirm.
            }
          }
        } catch(e) {}
      };

      window.addEventListener('focus', checkClipboard);

      let attempts = 0;
      const pollInterval = setInterval(() => {
        attempts++;
        if (attempts > 30 || autoFillDone) {
          clearInterval(pollInterval);
          window.removeEventListener('focus', checkClipboard);
          return;
        }
        checkClipboard();
      }, 1000);
    });
  }

  updateSyncSessionControlModeSelect(modal);
  ensureSyncSessionService(modal);
  updateSyncSessionGuestActionNotificationsUi(modal);
  let syncControlModeUpdateInFlight = false;

  const handleCreateClick = async () => {
    const service = ensureSyncSessionService(modal);
    if (!service || typeof service.hostSession !== "function") {
      showSyncSessionToast({
        type: "error",
        message: getI18nText("sync.errorServiceUnavailable", "Sync service unavailable in this build."),
        duration: 2600,
      });
      return;
    }

    const controlMode = getSyncSessionControlModeValue(modal);
    const passwordRaw = String(hostPasswordInput?.value || "");
    const password = await syncHashPassword(passwordRaw);

    if (createBtn) createBtn.disabled = true;
    try {
      const result = await service.hostSession({
        controlMode,
        password,
      });
      if (hostPasswordInput) hostPasswordInput.value = "";

      const sessionCode = result?.sessionCode || "";
      if (joinCodeInput && sessionCode) {
        joinCodeInput.value = sessionCode;
      }

      renderSyncSessionStatus(modal);
      scheduleSyncRuntimeState("host-session-created", {
        includeMediaOrder: true,
        force: true,
      });
      if (typeof service.publishSessionPack === "function") {
        try {
          const currentPack = buildSyncSessionPackManifest();
          await service.publishSessionPack({
            pack: currentPack,
          });
        } catch (_) {}
      }
      const autoCopied = sessionCode
        ? await copySyncSessionCodeToClipboard(sessionCode)
        : false;
      showSyncSessionToast({
        type: "success",
        message: autoCopied
          ? getI18nText("sync.sessionCreatedCopied", "Session created and code copied: {{code}}", { code: sessionCode })
          : getI18nText("sync.sessionCreated", "Session created: {{code}}", { code: sessionCode }),
        duration: 2400,
      });
    } catch (error) {
      const errorCode = error && typeof error === "object" ? String(error.message || "").trim() : "";
      const message = errorCode === "invalid-password"
        ? getI18nText("sync.errorHostPasswordInvalid", "Host password is incorrect.")
        : getSyncSessionErrorMessage(error);
      setSyncSessionStatus(modal, message, "error");
      if (errorCode === "invalid-password") {
        flashSyncSessionInputError(hostPasswordInput);
      }
      showSyncSessionToast({
        type: "error",
        message,
        duration: 2600,
      });
    } finally {
      if (createBtn) createBtn.disabled = false;
    }
  };

  const handleJoinClick = async () => {
    if (joinBtn && joinBtn.disabled) return;
    if (joinBtn) joinBtn.disabled = true;
    const service = ensureSyncSessionService(modal);
    if (!service || typeof service.joinSession !== "function") {
      showSyncSessionToast({
        type: "error",
        message: getI18nText("sync.errorServiceUnavailable", "Sync service unavailable in this build."),
        duration: 2600,
      });
      if (joinBtn) joinBtn.disabled = false;
      return;
    }

    const reEnableJoinBtn = () => { if (joinBtn) joinBtn.disabled = false; };

    const sessionCode = normalizeSyncSessionCode(joinCodeInput?.value || "");
    if (!sessionCode) {
      const message = getSyncSessionErrorMessage({
        message: "missing-session-code",
      });
      setSyncSessionStatus(modal, message, "warning");
      flashSyncSessionCodeInputError(joinCodeInput);
      showSyncSessionToast({
        type: "warning",
        message,
        duration: 2200,
      });
      reEnableJoinBtn();
      return;
    }
    if (!isSyncSessionCodeFormatValid(sessionCode)) {
      const message = getSyncSessionErrorMessage({
        message: "invalid-session-code",
      });
      setSyncSessionStatus(modal, message, "warning");
      flashSyncSessionCodeInputError(joinCodeInput);
      showSyncSessionToast({
        type: "warning",
        message,
        duration: 2200,
      });
      reEnableJoinBtn();
      return;
    }

    const password = await syncHashPassword(String(joinPasswordInput?.value || ""));
    const participantRawValue = String(joinPseudoInput?.value || "");
    const participantSanitizedInput =
      sanitizeSyncGuestPseudoInputValue(participantRawValue);
    if (participantSanitizedInput !== participantRawValue) {
      if (joinPseudoInput) {
        joinPseudoInput.value = participantSanitizedInput;
      }
      notifySyncGuestPseudoValidationError(joinPseudoInput);
      reEnableJoinBtn();
      return;
    }
    const participantName = normalizeSyncGuestPseudoValue(
      participantSanitizedInput,
    );
    try {
      const result = await service.joinSession({
        sessionCode,
        password,
        participantName,
      });
      if (joinPasswordInput) joinPasswordInput.value = "";
      const joinedCode = result?.sessionCode || sessionCode;
      if (joinCodeInput && joinedCode) {
        joinCodeInput.value = joinedCode;
      }

      renderSyncSessionStatus(modal);
      showSyncSessionToast({
        type: "success",
        message: getI18nText("sync.sessionJoined", "Session joined: {{code}}", { code: joinedCode }),
        duration: 2400,
      });
    } catch (error) {
      const errorCode =
        error && typeof error === "object"
          ? String(error.message || "").trim()
          : "";
      const message = errorCode === "invalid-password"
        ? getI18nText("sync.errorGuestPasswordInvalid", "Session password is incorrect.")
        : getSyncSessionErrorMessage(error);
      setSyncSessionStatus(modal, message, "error");
      if (errorCode === "invalid-password") {
        flashSyncSessionInputError(joinPasswordInput);
        const nowMs = Date.now();
        if (nowMs - syncSessionLastInvalidPasswordToastAt >= 1200) {
          syncSessionLastInvalidPasswordToastAt = nowMs;
          showSyncSessionToast({
            type: "error",
            message,
            duration: 1800,
          });
        }
      } else {
        showSyncSessionToast({
          type: "error",
          message,
          duration: 2600,
        });
      }
    } finally {
      if (joinBtn) joinBtn.disabled = false;
    }
  };

  const handleLeaveClick = async () => {
    const service = ensureSyncSessionService(modal);
    if (!service || typeof service.leaveSession !== "function") {
      return;
    }
    const wasHost = isSyncSessionConnectedAsHost(syncSessionServiceState);
    // Confirm before the host leaves (destroys the session for everyone)
    if (wasHost) {
      const { confirmed } = await showPoseChronoConfirmDialog({
        title: getI18nText(
          "sync.closeOnlineSessionLabel",
          "Close online session",
        ),
        message: getI18nText(
          "sync.confirmHostLeave",
          "You are the host. If you leave, the session will be closed for all participants. Continue?",
        ),
        confirmText: getI18nText(
          "sync.closeOnlineSessionLabel",
          "Close online session",
        ),
      });
      if (!confirmed) return;
    }
    if (leaveBtn) leaveBtn.disabled = true;
    try {
      syncParticipantTransferInProgress = false;
      await service.leaveSession();
      syncSessionLastParticipantsCount = null;
      setSyncSessionModalRole(wasHost ? "host" : "join");
      renderSyncSessionStatus(modal);
      // Re-enable inputs that may have been disabled during the active session
      if (hostPasswordInput) hostPasswordInput.disabled = false;
      if (joinPasswordInput) joinPasswordInput.disabled = false;
      if (createBtn) createBtn.disabled = false;
      if (joinBtn) joinBtn.disabled = false;
      showSyncSessionToast({
        type: "info",
        message: wasHost
          ? getI18nText("sync.sessionClosed", "Online session closed.")
          : getI18nText("sync.sessionLeft", "Session left."),
        duration: 1800,
      });
    } catch (error) {
      setSyncSessionStatus(
        modal,
        wasHost
          ? getI18nText("sync.errorSessionCloseFailed", "Failed to close the online session.")
          : getI18nText("sync.errorSessionLeaveFailed", "Failed to leave the session."),
        "error",
      );
    } finally {
      if (leaveBtn) leaveBtn.disabled = false;
    }
  };

  const handleCopyClick = async () => {
    const sessionCode = normalizeSyncSessionCode(
      syncSessionServiceState?.sessionCode || joinCodeInput?.value || "",
    );
    if (!sessionCode) {
      flashSyncSessionCodeInputError(joinCodeInput);
      showSyncSessionToast({
        type: "warning",
        message: getI18nText("sync.errorNoCodeToCopy", "No session code to copy."),
        duration: 1800,
      });
      return;
    }

    const copied = await copySyncSessionCodeToClipboard(sessionCode);
    if (copied) {
      pulseCopyButton(copyCodeBtn);
      showSyncSessionToast({
        type: "success",
        message: getI18nText("sync.codeCopied", "Code copied: {{code}}", { code: sessionCode }),
        duration: 1800,
      });
      return;
    }

    showSyncSessionToast({
      type: "error",
      message: getI18nText("sync.errorCopyFailed", "Failed to copy session code."),
      duration: 2200,
    });
  };

  const handleExportPackClick = async () => {
    const pack = buildSyncSessionPackManifest();
    const ok = downloadJsonPayload(createSyncSessionPackFilename(), pack);
    if (ok) {
      showSyncSessionToast({
        type: "success",
        message: getI18nText(
          "sync.sessionPackExported",
          "Session pack exported.",
        ),
        duration: 2200,
      });
      return;
    }
    showSyncSessionToast({
      type: "error",
      message: getI18nText(
        "sync.sessionPackExportFailed",
        "Session pack export failed.",
      ),
      duration: 2600,
    });
  };

  const handleImportPackClick = async () => {
    if (isSyncSessionParticipantActive()) {
      showSyncSessionToast({
        type: "warning",
        message: getI18nText("sync.warnLeaveBeforeImport", "Leave the online session before importing a pack."),
        duration: 2400,
      });
      return;
    }
    if (importPackBtn) importPackBtn.disabled = true;
    try {
      const text = await pickJsonFileText();
      if (!text) {
        showSyncSessionToast({
          type: "warning",
          message: getI18nText(
            "sync.sessionPackImportNoFile",
            "No file selected.",
          ),
          duration: 1800,
        });
        return;
      }
      let pack = null;
      try {
        pack = parseSyncSessionPackText(text);
      } catch (error) {
        const code = String(error?.message || "");
        const isTooLarge = code === "sync-pack-too-large";
        showSyncSessionToast({
          type: "error",
          message: isTooLarge
            ? getI18nText(
                "sync.sessionPackImportTooLarge",
                "Session pack file too large.",
              )
            : getI18nText(
                "sync.sessionPackImportInvalid",
                "Invalid session pack file.",
              ),
          duration: 2600,
        });
        return;
      }

      const applyResult = applySyncSessionPackManifest(pack);
      if (applyResult.pendingMedia) {
        showSyncSessionToast({
          type: "warning",
          message: getI18nText(
            "sync.sessionPackImportedPendingMedia",
            "Session pack imported. Load local media to apply media order.",
          ),
          duration: 2600,
        });
        return;
      }

      showSyncSessionToast({
        type: "success",
        message: getI18nText(
          "sync.sessionPackImported",
          "Session pack imported.",
        ),
        duration: 2200,
      });
    } catch (_) {
      showSyncSessionToast({
        type: "error",
        message: getI18nText(
          "sync.sessionPackImportFailed",
          "Session pack import failed.",
        ),
        duration: 2600,
      });
    } finally {
      if (importPackBtn) importPackBtn.disabled = false;
    }
  };

  const handlePublishOnlinePackClick = async () => {
    const service = ensureSyncSessionService(modal);
    if (!service || typeof service.publishSessionPack !== "function") {
      showSyncSessionToast({
        type: "error",
        message: getI18nText(
          "sync.onlinePackPublishUnavailable",
          "Online config pack publishing is unavailable in this build.",
        ),
        duration: 2400,
      });
      return;
    }
    if (!isSyncSessionConnectedAsHost(syncSessionServiceState)) {
      showSyncSessionToast({
        type: "warning",
        message: getI18nText(
          "sync.onlinePackPublishHostRequired",
          "Host a session first to publish an online config pack.",
        ),
        duration: 2200,
      });
      return;
    }

    if (publishOnlinePackBtn) publishOnlinePackBtn.disabled = true;
    try {
      setSyncSessionStatus(modal, getI18nText("sync.uploadStatusPublishing", "Publishing online pack..."), "warning");
      openSyncTransferModal({
        title: getI18nText("sync.uploadModalTitle", "Upload online pack"),
        status: getI18nText("sync.uploadStatusPublishingSettings", "Publishing session settings..."),
        tone: "warning",
      });
      const pack = buildSyncSessionPackManifest();
      let packMeta = await service.publishSessionPack({
        pack,
      });
      const mediaUploadSummary = await publishSyncSessionMediaPack(
        service,
        pack,
        {
          onProgress: (progress = {}) => {
            const stage = String(progress.stage || "upload").trim();
            const done = Math.max(0, Number(progress.done || 0) || 0);
            const total = Math.max(0, Number(progress.total || 0) || 0);
            const selected = Math.max(0, Number(progress.selected || 0) || 0);
            const uploaded = Math.max(0, Number(progress.uploaded || 0) || 0);
            const failed = Math.max(0, Number(progress.failed || 0) || 0);
            const skipped = Math.max(0, Number(progress.skipped || 0) || 0);
            const hasProgressTotal = total > 0;
            const progressTotal = hasProgressTotal
              ? total
              : Math.max(1, selected);
            const progressDone =
              stage === "upload" ? Math.min(progressTotal, done) : 0;

            const statusLabel =
              stage === "prepare"
                ? getI18nText("sync.uploadStatusPreparing", "Preparing media files...")
                : getI18nText("sync.uploadStatusUploading", "Uploading media files...");
            const metaLabel =
              stage === "prepare"
                ? `${selected} selected - ${skipped} skipped`
                : `${uploaded} uploaded - ${failed} failed - ${skipped} skipped`;

            updateSyncTransferModalState({
              status: statusLabel,
              tone: "warning",
              done: progressDone,
              total: progressTotal,
              meta: metaLabel,
            });
          },
        },
      );
      if (mediaUploadSummary.supported) {
        const effectivePack = buildSyncSessionPackFromUploadedMedia(
          pack,
          mediaUploadSummary.uploadedIdentities,
        );
        if (effectivePack && typeof service.publishSessionPack === "function") {
          try {
            const republishedMeta = await service.publishSessionPack({
              pack: effectivePack,
            });
            if (republishedMeta && typeof republishedMeta === "object") {
              packMeta = republishedMeta;
            }
          } catch (error) {
            console.warn(
              "[Sync] Failed to publish effective online pack:",
              error,
            );
          }
          const appliedHostSelection =
            applySyncHostOnlinePackMediaSelection(effectivePack);
          const appliedPackManifest =
            applySyncSessionPackManifest(effectivePack);
          if (
            appliedHostSelection ||
            (appliedPackManifest && appliedPackManifest.reorderedMedia)
          ) {
            scheduleSyncRuntimeState("online-pack-published", {
              includeMediaOrder: true,
              force: true,
            });
          }
          if (drawingScreen && !drawingScreen.classList.contains("hidden")) {
            updateDisplay(false);
          }
        }
      }

      renderSyncSessionStatus(modal);
      const hash = String(packMeta?.hash || "").trim();
      setSyncSessionStatus(modal, getI18nText("sync.uploadStatusPublished", "Online pack published."), "success");
      if (mediaUploadSummary.supported) {
        const uploaded = Math.max(
          0,
          Number(mediaUploadSummary.uploadedCount || 0) || 0,
        );
        const selected = Math.max(
          0,
          Number(mediaUploadSummary.selectedCount || 0) || 0,
        );
        const failed = Math.max(
          0,
          Number(mediaUploadSummary.failedCount || 0) || 0,
        );
        const failedRateLimited = Math.max(
          0,
          Number(mediaUploadSummary.failedRateLimited || 0) || 0,
        );
        const failedTimeout = Math.max(
          0,
          Number(mediaUploadSummary.failedTimeout || 0) || 0,
        );
        const failedDisconnected = Math.max(
          0,
          Number(mediaUploadSummary.failedDisconnected || 0) || 0,
        );
        const failedOther = Math.max(
          0,
          Number(mediaUploadSummary.failedOther || 0) || 0,
        );
        const skipped =
          Math.max(0, Number(mediaUploadSummary.skippedMissing || 0) || 0) +
          Math.max(0, Number(mediaUploadSummary.skippedUnsupported || 0) || 0) +
          Math.max(0, Number(mediaUploadSummary.skippedTooLarge || 0) || 0) +
          Math.max(0, Number(mediaUploadSummary.skippedFetch || 0) || 0) +
          Math.max(0, Number(mediaUploadSummary.skippedCountLimit || 0) || 0);
        const skippedMissing = Math.max(
          0,
          Number(mediaUploadSummary.skippedMissing || 0) || 0,
        );
        const skippedUnsupported = Math.max(
          0,
          Number(mediaUploadSummary.skippedUnsupported || 0) || 0,
        );
        const skippedTooLarge = Math.max(
          0,
          Number(mediaUploadSummary.skippedTooLarge || 0) || 0,
        );
        const skippedFileTooLarge = Math.max(
          0,
          Number(mediaUploadSummary.skippedFileTooLarge || 0) || 0,
        );
        const skippedTotalBudget = Math.max(
          0,
          Number(mediaUploadSummary.skippedTotalBudget || 0) || 0,
        );
        const skippedFetch = Math.max(
          0,
          Number(mediaUploadSummary.skippedFetch || 0) || 0,
        );
        const summaryTone = failed > 0 || skipped > 0 ? "warning" : "success";
        const effectiveTotal = Math.max(selected, uploaded + failed, 1);
        const summaryMessageBase = getI18nText(
          "sync.onlineMediaUploadSummary",
          "Online media upload: {{uploaded}}/{{selected}} file(s) sent ({{failed}} failed, {{skipped}} skipped).",
          {
            uploaded,
            selected,
            failed,
            skipped,
          },
        );
        const detailParts = [];
        if (failedRateLimited > 0) {
          detailParts.push(`${failedRateLimited} failed (rate-limited)`);
        }
        if (failedTimeout > 0) {
          detailParts.push(`${failedTimeout} failed (timeout)`);
        }
        if (failedDisconnected > 0) {
          detailParts.push(`${failedDisconnected} failed (disconnected)`);
        }
        if (failedOther > 0) {
          detailParts.push(`${failedOther} failed (other)`);
        }
        if (skippedFileTooLarge > 0) {
          detailParts.push(
            `${skippedFileTooLarge} file(s) > ${Math.floor(
              SYNC_SESSION_MEDIA_MAX_FILE_BYTES / (1024 * 1024),
            )}MB`,
          );
        }
        if (skippedTotalBudget > 0) {
          detailParts.push(
            `${skippedTotalBudget} skipped by total cap (${Math.floor(
              SYNC_SESSION_MEDIA_MAX_TOTAL_BYTES / (1024 * 1024),
            )}MB)`,
          );
        }
        if (skippedUnsupported > 0) {
          detailParts.push(`${skippedUnsupported} unsupported format`);
        }
        if (skippedFetch > 0) {
          detailParts.push(`${skippedFetch} read/fetch failure`);
        }
        if (skippedMissing > 0) {
          detailParts.push(`${skippedMissing} missing source`);
        }
        const summaryMessage =
          detailParts.length > 0
            ? `${summaryMessageBase} Details: ${detailParts.join(", ")}.`
            : summaryMessageBase;

        updateSyncTransferModalState({
          status:
            summaryTone === "success"
              ? getI18nText("sync.uploadStatusCompleted", "Upload completed.")
              : getI18nText("sync.uploadStatusCompletedWarnings", "Upload completed with warnings."),
          tone: summaryTone,
          done: Math.min(effectiveTotal, uploaded + failed),
          total: effectiveTotal,
          meta: summaryMessage,
        });
        closeSyncTransferModal({ delayMs: 900 });
        showSyncSessionToast({
          type: summaryTone,
          message:
            hash && summaryTone === "success"
              ? `${summaryMessage} (hash: ${hash.slice(0, 10)}...)`
              : summaryMessage,
          duration: 3000,
        });

        const saturationSignals =
          failedRateLimited +
          failedTimeout +
          failedDisconnected +
          skippedFileTooLarge +
          skippedTotalBudget;
        if (saturationSignals > 0) {
          showSyncSessionToast({
            type: "warning",
            message: getI18nText(
              "sync.onlineMediaUploadSaturationHint",
              "Transfer quality warning: reduce file count/size or retry with fewer participants for better reliability.",
            ),
            duration: 3600,
          });
        }
      } else if (mediaUploadSummary.relayUnsupported) {
        updateSyncTransferModalState({
          status: getI18nText("sync.uploadStatusSkipped", "Upload skipped."),
          tone: "warning",
          done: 0,
          total: 1,
          meta: getI18nText("sync.uploadRelayNoMediaMeta", "Relay does not support media transfer yet."),
        });
        closeSyncTransferModal({ delayMs: 1200 });
        showSyncSessionToast({
          type: "warning",
          message: getI18nText("sync.uploadRelayNoMediaToast", "Relay does not support media transfer yet. Settings pack was published, media upload skipped."),
          duration: 3200,
        });
        setSyncSessionStatus(
          modal,
          getI18nText("sync.uploadStatusRelayNoMedia", "Online pack published (relay does not support media transfer yet)."),
          "warning",
        );
      } else {
        updateSyncTransferModalState({
          status: getI18nText("sync.uploadSettingsPublished", "Settings published."),
          tone: "success",
          done: 1,
          total: 1,
          meta: hash ? `hash: ${hash.slice(0, 10)}...` : "",
        });
        closeSyncTransferModal({ delayMs: 900 });
        showSyncSessionToast({
          type: "success",
          message: hash
            ? getI18nText("sync.onlinePackPublishedWithHash", "Online config pack published (no media files, hash: {{hash}}...).", { hash: hash.slice(0, 10) })
            : getI18nText("sync.onlinePackPublished", "Online config pack published (no media files)."),
          duration: 2200,
        });
      }
    } catch (error) {
      if (String(error?.message || "") === "transfer-cancelled") {
        setSyncSessionStatus(
          modal,
          getI18nText("sync.transferCancelled", "Transfer cancelled."),
          "warning",
        );
        closeSyncTransferModal();
        showSyncSessionToast({
          type: "warning",
          message: getI18nText("sync.transferCancelled", "Transfer cancelled."),
          duration: 1800,
        });
        return;
      }
      const message = getSyncSessionErrorMessage(error);
      setSyncSessionStatus(modal, message, "error");
      updateSyncTransferModalState({
        status: getI18nText("sync.uploadStatusFailed", "Upload failed."),
        tone: "error",
        meta: message,
      });
      closeSyncTransferModal({ delayMs: 1200 });
      showSyncSessionToast({
        type: "error",
        message,
        duration: 2600,
      });
    } finally {
      if (publishOnlinePackBtn) publishOnlinePackBtn.disabled = false;
    }
  };

  const handleDownloadOnlinePackClick = async () => {
    const service = ensureSyncSessionService(modal);
    if (!service || typeof service.fetchSessionPack !== "function") {
      showSyncSessionToast({
        type: "error",
        message: getI18nText(
          "sync.onlinePackDownloadUnavailable",
          "Online config pack download is unavailable in this build.",
        ),
        duration: 2400,
      });
      return;
    }

    const sessionRunning =
      !!drawingScreen && !drawingScreen.classList.contains("hidden");
    if (sessionRunning) {
      showSyncSessionToast({
        type: "warning",
        message: getI18nText(
          "sync.onlinePackApplyStopSession",
          "Stop the active session before applying an online config pack.",
        ),
        duration: 2400,
      });
      return;
    }

    if (downloadOnlinePackBtn) {
      downloadOnlinePackBtn.disabled = true;
      downloadOnlinePackBtn.setAttribute("aria-busy", "true");
    }
    syncParticipantTransferInProgress = true;
    void publishSyncParticipantState("downloading", { force: true });
    try {
      setSyncSessionStatus(
        modal,
        getI18nText(
          "sync.onlinePackDownloadInProgress",
          "Downloading online config pack...",
        ),
        "warning",
      );
      openSyncTransferModal({
        title: getI18nText("sync.downloadModalTitle", "Download online pack"),
        status: getI18nText("sync.downloadStatusDownloading", "Downloading session settings..."),
        tone: "warning",
      });
      const payload = await service.fetchSessionPack();
      if (!payload || !payload.pack || typeof payload.pack !== "object") {
        throw new Error("session-pack-not-found");
      }

      const packText = JSON.stringify(payload.pack);
      const remoteHash = String(payload.hash || "")
        .trim()
        .toLowerCase();
      if (/^[a-f0-9]{64}$/.test(remoteHash)) {
        const localHash = await computeSyncSessionPackSha256Hex(packText);
        if (!localHash || localHash !== remoteHash) {
          throw new Error("session-pack-integrity-failed");
        }
      }

      const pack = parseSyncSessionPackText(packText);
      const downloadResult = await downloadSyncSessionMediaPack(service, {
        onProgress: ({ stage = "", done = 0, total = 0, skipped = 0 }) => {
          const normalizedStage = String(stage || "").trim();
          const safeDone = Math.max(0, Number(done || 0) || 0);
          const safeTotal = Math.max(0, Number(total || 0) || 0);
          const safeSkipped = Math.max(0, Number(skipped || 0) || 0);
          const statusLabel =
            normalizedStage === "manifest"
              ? getI18nText("sync.downloadStatusReadingManifest", "Reading media manifest...")
              : getI18nText("sync.downloadStatusDownloadingMedia", "Downloading media files...");
          const totalForProgress = Math.max(0, safeTotal);
          const doneForProgress =
            totalForProgress > 0 ? Math.min(totalForProgress, safeDone) : 0;
          const metaLabel =
            normalizedStage === "manifest"
              ? `${safeTotal} file(s) listed`
              : `${safeSkipped} skipped`;
          updateSyncTransferModalState({
            status: statusLabel,
            tone: "warning",
            done: doneForProgress,
            total: totalForProgress,
            meta: metaLabel,
          });
        },
      });
      const expectedMediaFiles = Math.max(
        0,
        Number(downloadResult?.filesCount || 0) || 0,
        Array.isArray(pack?.mediaRefs) ? pack.mediaRefs.length : 0,
      );
      const downloadedMediaFiles = Math.max(
        0,
        Number(downloadResult?.downloadedCount || 0) || 0,
      );
      if (
        downloadResult.supported &&
        expectedMediaFiles > 0 &&
        downloadedMediaFiles !== expectedMediaFiles
      ) {
        throw new Error(
          `session-media-incomplete:${downloadedMediaFiles}/${expectedMediaFiles}`,
        );
      }
      updateSyncTransferModalState({
        status: getI18nText("sync.downloadStatusApplying", "Applying downloaded pack..."),
        tone: "warning",
      });
      const hasAppliedDownloadedMedia = applySyncDownloadedMediaPackToState(
        pack,
        downloadResult,
      );
      const applyResult = applySyncSessionPackManifest(pack);

      if (applyResult.pendingMedia) {
        clearSyncParticipantPackValidation();
        syncParticipantTransferInProgress = false;
        void publishSyncParticipantState("missing", { force: true });
        renderSyncSessionStatus(modal);
        showSyncSessionToast({
          type: "warning",
          message: getI18nText(
            "sync.sessionPackImportedPendingMedia",
            "Session pack imported. Load local media to apply media order.",
          ),
          duration: 2600,
        });
        updateSyncTransferModalState({
          status: getI18nText("sync.downloadStatusCompletedWarnings", "Download completed with warnings."),
          tone: "warning",
          meta: "Local media still required for full media order.",
        });
        closeSyncTransferModal({ delayMs: 1200 });
        return;
      }

      markSyncParticipantPackValidated(syncSessionServiceState, {
        packHash: remoteHash,
        packUpdatedAt: Math.max(0, Number(payload.updatedAt || 0) || 0),
        mediaUpdatedAt: Math.max(
          0,
          Number(downloadResult.mediaUpdatedAt || 0) || 0,
        ),
      });
      syncParticipantTransferInProgress = false;
      void publishSyncParticipantState("ready", { force: true });
      renderSyncSessionStatus(modal);
      if (downloadResult.supported) {
        const downloaded = Math.max(
          0,
          Number(downloadResult.downloadedCount || 0) || 0,
        );
        const filesCount = Math.max(
          0,
          Number(downloadResult.filesCount || 0) || 0,
        );
        const skipped = Math.max(
          0,
          Number(downloadResult.skippedCount || 0) || 0,
        );
        const skippedRateLimited = Math.max(
          0,
          Number(downloadResult.skippedRateLimited || 0) || 0,
        );
        const skippedTimeout = Math.max(
          0,
          Number(downloadResult.skippedTimeout || 0) || 0,
        );
        const skippedDisconnected = Math.max(
          0,
          Number(downloadResult.skippedDisconnected || 0) || 0,
        );
        const skippedOther = Math.max(
          0,
          Number(downloadResult.skippedOther || 0) || 0,
        );
        const summaryTone =
          filesCount <= 0
            ? "warning"
            : filesCount > 0 && downloaded <= 0
              ? "error"
              : skipped > 0
                ? "warning"
                : "success";
        const summaryMessageBase = getI18nText(
          "sync.onlineMediaDownloadSummary",
          "Online media download: {{downloaded}}/{{filesCount}} file(s) received ({{skipped}} skipped).",
          {
            downloaded,
            filesCount,
            skipped,
          },
        );
        const detailParts = [];
        if (skippedRateLimited > 0) {
          detailParts.push(`${skippedRateLimited} rate-limited`);
        }
        if (skippedTimeout > 0) {
          detailParts.push(`${skippedTimeout} timeout`);
        }
        if (skippedDisconnected > 0) {
          detailParts.push(`${skippedDisconnected} disconnected`);
        }
        if (skippedOther > 0) {
          detailParts.push(`${skippedOther} other`);
        }
        const summaryMessage =
          detailParts.length > 0
            ? `${summaryMessageBase} Details: ${detailParts.join(", ")}.`
            : summaryMessageBase;
        updateSyncTransferModalState({
          status:
            summaryTone === "error"
              ? getI18nText("sync.downloadStatusCompletedErrors", "Download completed with errors.")
              : summaryTone === "warning"
                ? getI18nText("sync.downloadStatusCompletedWarnings", "Download completed with warnings.")
                : getI18nText("sync.downloadStatusCompleted", "Download completed."),
          tone: summaryTone,
          done: filesCount > 0 ? Math.min(filesCount, downloaded + skipped) : 1,
          total: Math.max(1, filesCount),
          meta: summaryMessage,
        });
        closeSyncTransferModal({ delayMs: 900 });
        if (filesCount > 0 && downloaded <= 0) {
          showSyncSessionToast({
            type: "error",
            message: getI18nText("sync.errorNoMediaDownloaded", "No online media file could be downloaded."),
            duration: 2800,
          });
        } else if (filesCount <= 0) {
          showSyncSessionToast({
            type: "warning",
            message: getI18nText("sync.errorNoMediaPublished", "No online media file was published for this session."),
            duration: 2600,
          });
        } else {
          showSyncSessionToast({
            type: summaryTone,
            message: summaryMessage,
            duration: 2800,
          });
        }
      } else if (downloadResult.relayUnsupported) {
        updateSyncTransferModalState({
          status: getI18nText("sync.downloadStatusCompletedWarnings", "Download completed with warnings."),
          tone: "warning",
          done: 1,
          total: 1,
          meta: getI18nText("sync.downloadRelayNoMediaMeta", "Relay does not support media transfer yet."),
        });
        closeSyncTransferModal({ delayMs: 1200 });
        showSyncSessionToast({
          type: "warning",
          message: getI18nText("sync.downloadRelayNoMediaToast", "Relay does not support media transfer yet. Settings pack was applied without media files."),
          duration: 3200,
        });
      } else {
        updateSyncTransferModalState({
          status: getI18nText("sync.downloadStatusCompleted", "Download completed."),
          tone: "success",
          done: 1,
          total: 1,
          meta: getI18nText(
            "sync.onlinePackDownloadedApplied",
            "Online config pack downloaded and applied.",
          ),
        });
        closeSyncTransferModal({ delayMs: 900 });
        showSyncSessionToast({
          type: "success",
          message: getI18nText(
            "sync.onlinePackDownloadedApplied",
            "Online config pack downloaded and applied.",
          ),
          duration: 2200,
        });
      }
      if (
        hasAppliedDownloadedMedia &&
        drawingScreen &&
        !drawingScreen.classList.contains("hidden")
      ) {
        updateDisplay(false);
      }
    } catch (error) {
      const code = String(error?.message || "").trim();
      if (code === "transfer-cancelled") {
        syncParticipantTransferInProgress = false;
        void publishSyncParticipantState("missing", { force: true });
        setSyncSessionStatus(
          modal,
          getI18nText("sync.transferCancelled", "Transfer cancelled."),
          "warning",
        );
        closeSyncTransferModal();
        showSyncSessionToast({
          type: "warning",
          message: getI18nText("sync.transferCancelled", "Transfer cancelled."),
          duration: 1800,
        });
        return;
      }
      const message =
        code === "session-pack-integrity-failed"
          ? getI18nText(
              "sync.onlinePackIntegrityFailed",
              "Online config pack integrity check failed.",
            )
          : getSyncSessionErrorMessage(error);
      setSyncSessionStatus(modal, message, "error");
      syncParticipantTransferInProgress = false;
      void publishSyncParticipantState("missing", { force: true });
      updateSyncTransferModalState({
        status: getI18nText("sync.downloadStatusFailed", "Download failed."),
        tone: "error",
        meta: message,
      });
      closeSyncTransferModal({ delayMs: 1200 });
      showSyncSessionToast({
        type: "error",
        message,
        duration: 2600,
      });
    } finally {
      if (downloadOnlinePackBtn) {
        downloadOnlinePackBtn.disabled = false;
        downloadOnlinePackBtn.removeAttribute("aria-busy");
      }
    }
  };

  if (
    SYNC_SESSION_CONTROLLER &&
    typeof SYNC_SESSION_CONTROLLER.bindSessionModalEvents === "function"
  ) {
    SYNC_SESSION_CONTROLLER.bindSessionModalEvents({
      modal,
      closeBtn,
      createBtn,
      joinBtn,
      leaveBtn,
      copyCodeBtn,
      statusEl,
      controlModeSelect,
      controlModeTrigger,
      controlModeMenu,
      joinPseudoInput,
      guestActionNotificationsInput,
      onCloseRequested: () => closeSyncSessionModal(),
      onCloseControlModeMenu: () => closeSyncSessionControlModeMenu(modal),
      onToggleControlModeMenu: () => toggleSyncSessionControlModeMenu(modal),
      onControlModeOptionSelected: async (controlModeValue) => {
        if (syncControlModeUpdateInFlight) return;
        const previousControlMode = getSyncSessionControlModeValue(modal);
        const nextControlMode =
          getSyncSessionControlModeConfig(controlModeValue).value;
        if (previousControlMode === nextControlMode) {
          closeSyncSessionControlModeMenu(modal);
          return;
        }

        updateSyncSessionControlModeSelect(modal, nextControlMode);
        closeSyncSessionControlModeMenu(modal);

        const service = ensureSyncSessionService(modal);
        if (!service || typeof service.updateSessionMeta !== "function") {
          updateSyncSessionControlModeSelect(modal, previousControlMode);
          showSyncSessionToast({
            type: "error",
            message: getI18nText(
              "sync.errorServiceUnavailable",
              "Sync service unavailable in this build.",
            ),
            duration: 2200,
          });
          return;
        }

        const controlModeTriggerEl = modal.querySelector(
          "#sync-session-control-mode-trigger",
        );
        syncControlModeUpdateInFlight = true;
        if (controlModeTriggerEl) {
          controlModeTriggerEl.disabled = true;
        }
        try {
          const updated = await service.updateSessionMeta({
            controlMode: nextControlMode,
          });
          if (updated === false) {
            throw new Error("request-failed");
          }
          if (syncSessionServiceState && typeof syncSessionServiceState === "object") {
            syncSessionServiceState = {
              ...syncSessionServiceState,
              controlMode: nextControlMode,
            };
          }
          renderSyncSessionStatus(modal);
        } catch (error) {
          updateSyncSessionControlModeSelect(modal, previousControlMode);
          renderSyncSessionStatus(modal);
          showSyncSessionToast({
            type: "error",
            message: getSyncSessionErrorMessage(error),
            duration: 2200,
          });
        } finally {
          syncControlModeUpdateInFlight = false;
          if (controlModeTriggerEl) {
            controlModeTriggerEl.disabled = false;
          }
        }
      },
      onStatusTriggerShow: (trigger) =>
        showSyncSessionParticipantsTooltip(trigger),
      onStatusTriggerHide: () => hideSyncSessionParticipantsTooltip(),
      isPseudoCharAllowed: (char) => isSyncGuestPseudoCharAllowed(char),
      sanitizePseudoInputValue: (value) =>
        sanitizeSyncGuestPseudoInputValue(value),
      onPseudoValidationError: (inputEl) =>
        notifySyncGuestPseudoValidationError(inputEl),
      onGuestActionNotificationsChanged: (checked) => {
        setSyncGuestActionNotificationsEnabled(!!checked);
        updateSyncSessionGuestActionNotificationsUi(modal);
      },
      onRoleButtonClicked: (role) => setSyncSessionModalRole(role),
      onCreateClicked: handleCreateClick,
      onJoinClicked: handleJoinClick,
      onLeaveClicked: handleLeaveClick,
      onCopyClicked: handleCopyClick,
    });
  } else {
    if (closeBtn) {
      closeBtn.addEventListener("click", () => closeSyncSessionModal());
    }
    if (createBtn) createBtn.addEventListener("click", handleCreateClick);
    if (joinBtn) joinBtn.addEventListener("click", handleJoinClick);
    if (leaveBtn) leaveBtn.addEventListener("click", handleLeaveClick);
    if (copyCodeBtn) copyCodeBtn.addEventListener("click", handleCopyClick);
    if (guestActionNotificationsInput) {
      guestActionNotificationsInput.addEventListener("change", () => {
        setSyncGuestActionNotificationsEnabled(
          !!guestActionNotificationsInput.checked,
        );
        updateSyncSessionGuestActionNotificationsUi(modal);
      });
    }
  }
  if (exportPackBtn) {
    exportPackBtn.addEventListener("click", handleExportPackClick);
  }
  if (importPackBtn) {
    importPackBtn.addEventListener("click", handleImportPackClick);
  }
  if (publishOnlinePackBtn) {
    publishOnlinePackBtn.addEventListener(
      "click",
      handlePublishOnlinePackClick,
    );
  }
  if (downloadOnlinePackBtn) {
    downloadOnlinePackBtn.addEventListener(
      "click",
      handleDownloadOnlinePackClick,
    );
  }

  const transferCancelBtn = document.getElementById(
    "sync-transfer-modal-cancel-btn",
  );
  if (transferCancelBtn) {
    transferCancelBtn.addEventListener("click", () => cancelSyncTransfer());
  }

  syncSessionModalBindingsReady = true;
}

platformRuntimeOnRun(async () => {
  const wasRuntimeAlreadyCompleted = runtimeLifecycleCompleted;
  await runRuntimeLifecycle();
  if (!wasRuntimeAlreadyCompleted) return;
  await refreshSelectionOnRuntimeRunIfNeeded();
});

// Filet de sécurité: certains environnements Eagle peuvent rater un hook runtime
window.addEventListener("load", () => {
  setTimeout(() => {
    void runRuntimeLifecycle();
  }, 250);
});

platformRuntimeOnHide(() => {
  stopTimer();
  if (typeof window.flushTimelineStorage === "function") {
    void window.flushTimelineStorage();
  }
});
/**
 * Charge manuellement les traductions depuis le fichier JSON
 * Eagle ne semble pas charger automatiquement les fichiers _locales
 */
let runtimeI18nCacheVersionPromise = null;
let translationsLoaded = false;

async function resolveRuntimeI18nCacheVersion() {
  if (runtimeI18nCacheVersionPromise) {
    return runtimeI18nCacheVersionPromise;
  }

  runtimeI18nCacheVersionPromise = (async () => {
    const desktopVersion =
      typeof window !== "undefined" &&
      window.poseChronoDesktop &&
      window.poseChronoDesktop.version
        ? String(window.poseChronoDesktop.version)
        : "";

    let manifestVersion = "";
    if (typeof fetch === "function") {
      try {
        const response = await fetch("./manifest.json");
        if (response && response.ok) {
          const payload = await response.json();
          if (payload && typeof payload.version === "string") {
            manifestVersion = payload.version.trim();
          }
        }
      } catch (_) {}
    }

    if (desktopVersion && manifestVersion) {
      return `desktop:${desktopVersion}|manifest:${manifestVersion}`;
    }
    if (manifestVersion) return `manifest:${manifestVersion}`;
    if (desktopVersion) return `desktop:${desktopVersion}`;
    return "";
  })();

  return runtimeI18nCacheVersionPromise;
}

async function configureI18nLoaderCacheVersion() {
  try {
    const cacheVersion = await resolveRuntimeI18nCacheVersion();
    if (!cacheVersion) return;
    callPluginSharedMethod(
      SHARED_I18N_LOADER_UTILS,
      "setCacheVersion",
      [cacheVersion],
      null,
      () => null,
    );
  } catch (_) {}
}

function getPreferredLanguageFromPreferences() {
  return resolveI18nLanguage(
    UIPreferences.get(
      PREF_KEY_PREFERRED_LANGUAGE,
      readPreferredLanguageFromStorage() || null,
    ),
    null,
  );
}

function getCurrentI18nLanguage() {
  const fromI18n = resolveI18nLanguage(
    typeof i18next !== "undefined"
      ? i18next.resolvedLanguage || i18next.language
      : null,
    null,
  );
  if (fromI18n) return fromI18n;
  const fromPreferences = getPreferredLanguageFromPreferences();
  if (fromPreferences) return fromPreferences;
  return resolveI18nLanguage(
    typeof window !== "undefined" && typeof window.getLocale === "function"
      ? window.getLocale()
      : null,
    "en",
  );
}

function getLocaleForLanguage(languageToken) {
  const normalizedLanguage = resolveI18nLanguage(languageToken, "en");
  const fallbackLocale =
    typeof window !== "undefined" && typeof window.getLocale === "function"
      ? String(window.getLocale() || I18N_LOCALE_TAG_BY_LANG.en)
      : I18N_LOCALE_TAG_BY_LANG.en;

  if (typeof i18next !== "undefined" && typeof i18next.t === "function") {
    const localizedLocale = i18next.t("_locale", {
      lng: normalizedLanguage,
      defaultValue: fallbackLocale,
    });
    if (localizedLocale && localizedLocale !== "_locale") {
      return String(localizedLocale);
    }
  }

  return I18N_LOCALE_TAG_BY_LANG[normalizedLanguage] || fallbackLocale;
}

async function fetchLocaleTranslationsForLanguage(language) {
  const normalizedLanguage = resolveI18nLanguage(language, null);
  if (!normalizedLanguage) return null;

  const fromShared = await callPluginSharedMethod(
    SHARED_I18N_LOADER_UTILS,
    "loadTranslationsForLanguage",
    [normalizedLanguage],
    null,
    () => null,
  );
  if (fromShared && typeof fromShared === "object") {
    return fromShared;
  }

  if (typeof fetch !== "function") return null;
  const fileName = I18N_LOCALE_FILE_BY_LANG[normalizedLanguage];
  if (!fileName) return null;
  try {
    const response = await fetch(`./_locales/${fileName}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function ensureLocaleResourceLoaded(language) {
  const normalizedLanguage = resolveI18nLanguage(language, null);
  if (!normalizedLanguage) return false;
  if (typeof i18next === "undefined") return false;

  if (
    typeof i18next.hasResourceBundle === "function" &&
    i18next.hasResourceBundle(normalizedLanguage, "translation")
  ) {
    return true;
  }

  const payload = await fetchLocaleTranslationsForLanguage(normalizedLanguage);
  if (!payload) return false;

  if (typeof i18next.addResourceBundle === "function") {
    i18next.addResourceBundle(
      normalizedLanguage,
      "translation",
      payload,
      true,
      true,
    );
    return true;
  }

  return false;
}

async function loadBaseLocaleTranslations() {
  return fetchLocaleTranslationsForLanguage("en");
}

async function loadTranslations() {
  // Si déjà chargé, ne rien faire
  if (translationsLoaded) {
    return true;
  }

  try {
    await configureI18nLoaderCacheVersion();

    const loadedByShared = await callPluginSharedMethod(
      SHARED_I18N_LOADER_UTILS,
      "loadTranslations",
      [],
      null,
      () => false,
    );
    if (loadedByShared) {
      translationsLoaded = true;
      return true;
    }

    // Fallback local minimal si le module shared n'est pas disponible:
    // on charge au moins la locale de base (en).
    const baseTranslations = await loadBaseLocaleTranslations();
    if (!baseTranslations) {
      return false;
    }

    const resources = {
      en: {
        translation: baseTranslations,
      },
    };

    const preferredLanguage = resolveI18nLanguage(
      getPreferredLanguageFromPreferences() ||
        readPreferredLanguageFromStorage() ||
        (typeof window !== "undefined" && typeof window.getLocale === "function"
          ? window.getLocale()
          : "en"),
      "en",
    );

    if (preferredLanguage !== "en") {
      const preferredTranslations =
        await fetchLocaleTranslationsForLanguage(preferredLanguage);
      if (preferredTranslations) {
        resources[preferredLanguage] = {
          translation: preferredTranslations,
        };
      }
    }

    const activeLang = resources[preferredLanguage] ? preferredLanguage : "en";

    if (typeof i18next !== "undefined") {
      const canInit = typeof i18next.init === "function";
      const isInitialized = !!i18next.isInitialized;

      if (!isInitialized && canInit) {
        await i18next.init({
          lng: activeLang,
          fallbackLng: "en",
          resources,
        });
      } else {
        if (typeof i18next.addResourceBundle === "function") {
          Object.entries(resources).forEach(([lang, payload]) => {
            i18next.addResourceBundle(
              lang,
              "translation",
              payload.translation,
              true,
              true,
            );
          });
        }

        if (typeof i18next.changeLanguage === "function") {
          await i18next.changeLanguage(activeLang);
        } else if (canInit) {
          await i18next.init({
            lng: activeLang,
            fallbackLng: "en",
            resources,
          });
        }
      }
    }

    translationsLoaded = true;
    return true;
  } catch (error) {
    return false;
  }
}

async function applyPreferredLanguage(language, options = {}) {
  const persist = options.persist !== false;
  const reloadPage = !!options.reloadPage;
  const preferredLanguage = resolveI18nLanguage(language, "en");

  if (persist) {
    UIPreferences.set(PREF_KEY_PREFERRED_LANGUAGE, preferredLanguage);
  }

  if (reloadPage) {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("posechrono-i18n-cache"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    location.reload();
    return true;
  }

  if (typeof i18next === "undefined") {
    return false;
  }

  await loadTranslations();

  let activeLanguage = preferredLanguage;
  if (activeLanguage !== "en") {
    const preferredLoaded = await ensureLocaleResourceLoaded(activeLanguage);
    if (!preferredLoaded) {
      activeLanguage = "en";
    }
  }
  await ensureLocaleResourceLoaded("en");

  if (typeof i18next.changeLanguage === "function") {
    await i18next.changeLanguage(activeLanguage);
  } else if (typeof i18next.init === "function") {
    await i18next.init({
      lng: activeLanguage,
      fallbackLng: "en",
    });
  }

  translateStaticHTML();
  refreshSessionDescription(
    state.sessionMode || CONFIG.defaultSessionMode || "classique",
  );
  updateButtonLabels();
  updateSidebarTooltips();
  if (typeof refreshDrawingToolbarTooltips === "function") {
    refreshDrawingToolbarTooltips();
  }
  updateGlobalSettingsModalState();
  if (typeof updateFolderInfo === "function") {
    updateFolderInfo();
  }
  updateSyncSessionVisualIndicators(syncSessionServiceState);

  return true;
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
    "#titlebar-settings-btn": {
      attr: "data-tooltip",
      key: "titlebar.settingsTooltip",
    },
    "#titlebar-sync-btn": {
      attr: "data-tooltip",
      key: "titlebar.syncTooltip",
    },
    "#pin-btn": { attr: "data-tooltip", key: "titlebar.pinTooltip" },
    "#minimize-btn": { attr: "data-tooltip", key: "titlebar.minimize" },
    "#maximize-btn": { attr: "data-tooltip", key: "titlebar.maximize" },
    "#close-btn": { attr: "data-tooltip", key: "titlebar.close" },

    // Settings screen
    ".subtitle": { text: true, key: getAppSubtitleI18nKey() },
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
    "#progressive-blur-btn": {
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

  // Attributs data-i18n-aria-label génériques
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    try {
      el.setAttribute("aria-label", i18next.t(key));
    } catch (e) {}
  });

  // Mettre à jour la langue du document et le titre
  const activeLanguage = getCurrentI18nLanguage();
  const locale = getLocaleForLanguage(activeLanguage);
  document.documentElement.lang = locale;
  document.title = `${i18next.t("app.title")} - ${i18next.t(getAppSubtitleI18nKey())}`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", i18next.t("app.description"));
}

/**
 * Initialise le plugin
 * Charge le DOM, initialise les gestionnaires, configure les événements
 */
async function initPlugin() {
  UIPreferences.init();
  applyVisualPreferencesFromStore();

  // Charger les raccourcis clavier personnalisés après le premier rendu:
  // les valeurs par défaut sont disponibles immédiatement.
  const scheduleDeferredHotkeysLoad = () => {
    const hotkeysLoadStartMs =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    void loadHotkeysFromStorage()
      .then(() => {
        bootTrace("initPlugin.hotkeysLoaded", {
          durationMs: Math.round(
            (typeof performance !== "undefined" &&
            typeof performance.now === "function"
              ? performance.now()
              : Date.now()) - hotkeysLoadStartMs,
          ),
        });
      })
      .catch((error) => {
        console.error("[Hotkeys] Deferred load failed:", error);
      });
  };
  setTimeout(scheduleDeferredHotkeysLoad, 180);

  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    await runStorageSmokeTests();
  }

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
  chooseMediaFolderBtn = document.getElementById("choose-media-folder-btn");
  if (chooseMediaFolderBtn) {
    chooseMediaFolderBtn.style.display = isDesktopStandaloneRuntime()
      ? "inline-flex"
      : "none";
  }
  const tagsModalEl = document.getElementById("tags-modal");
  if (tagsModalEl && !isTagsFeatureAvailable()) {
    tagsModalEl.classList.add("hidden");
    tagsModalEl.setAttribute("aria-hidden", "true");
  }

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
  // Boutons de filtres
  flipHorizontalBtn = document.getElementById("flip-horizontal-btn");
  flipVerticalBtn = document.getElementById("flip-vertical-btn");
  grayscaleBtn = document.getElementById("grayscale-btn");
  blurBtn = document.getElementById("blur-btn");
  annotateBtn = document.getElementById("annotate-btn");
  gridSidebarBtn = document.getElementById("grid-btn");
  silhouetteSidebarBtn = document.getElementById("silhouette-btn");
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
        "input[data-step-field]": (e, target) => {
          const index = parseIntegerValue(target.dataset.stepIndex, -1);
          const field = String(target.dataset.stepField || "").trim();
          if (index >= 0 && field) {
            window.updateStep(index, field, target.value);
          }
        },
        "input[data-step-hms]": (e, target) => {
          const index = parseIntegerValue(target.dataset.stepIndex, -1);
          const type = String(target.dataset.stepHms || "").trim();
          if (index >= 0 && type) {
            window.updateStepHMS(index, type, target.value);
          }
        },
      },
      // Gestion des clics (suppression, drag)
      click: {
        "button[data-remove-step]": (e, target) => {
          const index = parseIntegerValue(target.dataset.removeStep, -1);
          if (index >= 0) {
            window.removeStepFromQueue(index);
          }
        },
      },
      dragstart: {
        ".drag-handle[data-step-index]": (e, target) => {
          const index = parseIntegerValue(target.dataset.stepIndex, -1);
          if (index >= 0) {
            window.dragStep(e, index);
          }
        },
      },
      dragover: {
        ".step-item[data-step-index]": (e, target) => {
          window.handleDragOver(e, target);
        },
      },
      drop: {
        ".step-item[data-step-index]": (e, target) => {
          const index = parseIntegerValue(target.dataset.stepIndex, -1);
          if (index >= 0) {
            window.dropStep(e, index, target);
          }
        },
      },
      dragend: {
        ".drag-handle[data-step-index]": () => {
          window.handleDragEnd();
        },
      },
    });
  }

  // Écran de revue
  reviewGrid = document.getElementById("review-grid");
  let closeReviewBtn = document.getElementById("close-review-btn");

  // Chargement dynamique du module optionnel (présent uniquement si GabContainer/ existe)
  try {
    if (!document.getElementById("gab-container-style")) {
      const link = document.createElement("link");
      link.id = "gab-container-style";
      link.rel = "stylesheet";
      link.href = "GabContainer/gab-style.css";
      document.head.appendChild(link);
    }
    if (!document.getElementById("gab-container-module")) {
      const script = document.createElement("script");
      script.id = "gab-container-module";
      script.src = "GabContainer/gab-module.js";
      script.defer = true;
      document.body.appendChild(script);
    }
  } catch (_) {}

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

  if (settingsBtn) {
    settingsBtn.innerHTML = ICONS.HOME;
  }

  soundBtn.innerHTML = state.soundEnabled ? ICONS.SOUND_ON : ICONS.SOUND_OFF;
  grayscaleBtn.innerHTML = state.grayscale ? ICONS.BW_ON : ICONS.BW_OFF;

  if (gridSidebarBtn) {
    gridSidebarBtn.innerHTML = ICONS.GRID;
    gridSidebarBtn.classList.toggle("active", !!state.gridEnabled);
  }
  if (silhouetteSidebarBtn) {
    silhouetteSidebarBtn.innerHTML = ICONS.SILHOUETTE;
    silhouetteSidebarBtn.classList.toggle("active", state.silhouetteEnabled);
  }

  // === Activer le scrub sur les champs de saisie ===
  applyScrubbableBehavior(document);

  // === Lancer la configuration ===
  CONFIG.defaultSessionMode = loadPreferredDefaultSessionMode();
  switchMode(CONFIG.defaultSessionMode || "classique");
  updateFlipButtonUI();
  updateButtonLabels();

  // Marquer le bouton 1min comme actif au chargement (selectedDuration = 60)
  // et s'assurer qu'aucun bouton de durée mémoire n'interfère
  toggleDurationButtonsForValue(durationBtns, state.selectedDuration);

  // Nettoyer les boutons actifs des modes non sélectionnés
  const memoryFlashBtns =
    memoryFlashSettings?.querySelectorAll(".duration-btn");
  const memoryProgressiveBtns =
    memoryProgressiveSettings?.querySelectorAll(".duration-btn");
  if (memoryFlashBtns) {
    toggleDurationButtonsForValue(memoryFlashBtns, state.memoryDuration);
  }
  if (memoryProgressiveBtns) {
    clearDurationButtonsActive(memoryProgressiveBtns);
  }

  renderGlobalSettingsSections();
  applySidebarVisibility();
  setupEventListeners();
  updateTimerDisplay();

  if (!window.__posechronoTimelineFlushBound) {
    window.__posechronoTimelineFlushBound = true;
    window.addEventListener("beforeunload", () => {
      if (typeof window.flushTimelineStorage === "function") {
        void window.flushTimelineStorage();
      }
    });
  }

  // === Charger les traductions manuellement ===
  await loadTranslations();

  // === Appliquer les traductions i18n aux éléments HTML statiques ===
  translateStaticHTML();
  refreshSessionDescription(
    state.sessionMode || CONFIG.defaultSessionMode || "classique",
  );
  updateButtonLabels();
  updateTimerDisplay();

  // === Mettre à jour les tooltips avec les raccourcis dynamiques ===
  updateSidebarTooltips();

  // === Subscriptions StateManager pour réactivité UI ===
  setupStateSubscriptions();
  updateAnnotateButtonAvailability();

  // === Initialisation de la grille d'arrière-plan ===
  initBackgroundGrid();
}

/**
 * Initialise la grille d'arrière-plan selon la configuration
 */
function initBackgroundGrid() {
  const isEnabled = UIPreferences.get(
    "backgroundGridEnabled",
    typeof CONFIG !== "undefined" ? !!(CONFIG?.backgroundGrid ?? false) : false,
  );
  document.body.classList.toggle("grid-enabled", !!isEnabled);
}

function setBackgroundGridEnabled(enabled, persist = true) {
  const next = !!enabled;
  document.body.classList.toggle("grid-enabled", next);
  if (persist) {
    UIPreferences.set("backgroundGridEnabled", next);
  }
}

function setAnimationsEnabled(enabled, persist = true) {
  const next = !!enabled;
  document.body.classList.toggle("no-animations", !next);
  if (persist) {
    UIPreferences.set("animationsEnabled", next);
  }
}

function setShowProgressBar(value, persist = true) {
  const next = !!value;
  if (progressBar) {
    progressBar.style.display = next ? "block" : "none";
  }
  if (persist) {
    UIPreferences.set("showProgressBar", next);
  }
}

function applyVisualPreferencesFromStore() {
  const gridEnabled = UIPreferences.get(
    "backgroundGridEnabled",
    typeof CONFIG !== "undefined" ? !!(CONFIG?.backgroundGrid ?? false) : false,
  );
  setBackgroundGridEnabled(gridEnabled, false);
  const titlebarAlwaysVisible = UIPreferences.get(
    "titlebarAlwaysVisible",
    typeof CONFIG !== "undefined"
      ? !!(CONFIG?.titlebarAlwaysVisible ?? false)
      : false,
  );
  setTitlebarAlwaysVisible(titlebarAlwaysVisible, false);
  state.reviewDurationsVisible = UIPreferences.get(
    "reviewDurationsVisible",
    true,
  );
  const animationsEnabled = UIPreferences.get("animationsEnabled", true);
  setAnimationsEnabled(animationsEnabled, false);
  const showProgressBar = UIPreferences.get("showProgressBar", true);
  setShowProgressBar(showProgressBar, false);
  state.soundEnabled = !!UIPreferences.get(
    PREF_KEY_SOUND_ENABLED_BY_DEFAULT,
    true,
  );
  applySidebarVisibility();
}

function applyPreferredDefaultSessionMode(options = {}) {
  const { syncUi = false } = options;
  const preferred = normalizeSessionModeValue(
    UIPreferences.get(
      "defaultSessionMode",
      normalizeSessionModeValue(CONFIG?.defaultSessionMode),
    ),
    normalizeSessionModeValue(CONFIG?.defaultSessionMode),
  );
  CONFIG.defaultSessionMode = preferred;
  if (
    syncUi &&
    !state.isRunning &&
    settingsScreen &&
    !settingsScreen.classList.contains("hidden")
  ) {
    switchMode(preferred);
  }
}

function createPrefsBackupFilename() {
  return callPluginSharedMethod(
    SHARED_PREFERENCES_TRANSFER_UTILS,
    "createBackupFilename",
    [],
    "SHARED_PREFERENCES_TRANSFER_UTILS.createBackupFilename",
    () => `posechrono-backup-${Date.now()}.json`,
  );
}

function downloadJsonPayload(filename, payload) {
  return callPluginSharedMethod(
    SHARED_PREFERENCES_TRANSFER_UTILS,
    "downloadJsonPayload",
    [filename, payload],
    "SHARED_PREFERENCES_TRANSFER_UTILS.downloadJsonPayload",
    () => false,
  );
}

function pickJsonFileText() {
  return callPluginSharedMethod(
    SHARED_PREFERENCES_TRANSFER_UTILS,
    "pickJsonFileText",
    [],
    "SHARED_PREFERENCES_TRANSFER_UTILS.pickJsonFileText",
    () => Promise.resolve(null),
  );
}

function hasAnyPreferencesSectionSelected(selections) {
  return callPluginSharedMethod(
    SHARED_PREFERENCES_TRANSFER_UTILS,
    "hasAnySectionSelected",
    [selections],
    "SHARED_PREFERENCES_TRANSFER_UTILS.hasAnySectionSelected",
    () => false,
  );
}

function getAvailablePreferencesSections(parsed) {
  return callPluginSharedMethod(
    SHARED_PREFERENCES_TRANSFER_UTILS,
    "getAvailableSectionsFromPackage",
    [parsed],
    "SHARED_PREFERENCES_TRANSFER_UTILS.getAvailableSectionsFromPackage",
    () => ({
      ui: false,
      hotkeys: false,
      plans: false,
      timeline: false,
    }),
  );
}

function isValidPreferencesPackage(parsed) {
  return callPluginSharedMethod(
    SHARED_PREFERENCES_TRANSFER_UTILS,
    "isValidPreferencesPackage",
    [parsed],
    "SHARED_PREFERENCES_TRANSFER_UTILS.isValidPreferencesPackage",
    () => false,
  );
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

  // Mise à jour automatique du bouton grille
  stateManager.subscribe("gridEnabled", (enabled) => {
    if (gridSidebarBtn) {
      gridSidebarBtn.classList.toggle("active", !!enabled);
    }
  });

  // Mise à jour automatique du bouton silhouette
  stateManager.subscribe("silhouetteEnabled", (enabled) => {
    if (silhouetteSidebarBtn) {
      silhouetteSidebarBtn.classList.toggle("active", enabled);
    }
  });

  // Désactiver annotation sur médias non supportés (gif/vidéo)
  stateManager.subscribe("isVideoFile", () => {
    updateAnnotateButtonAvailability();
  });
  stateManager.subscribe("isGifFile", () => {
    updateAnnotateButtonAvailability();
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
  initGlobalModalKeyboardSupport();

  registerSessionEntryAndModeBindings();

  // === GESTION DES PLANS DE SESSION ===
  const managePlansBtn = document.getElementById("manage-plans-btn");
  const sessionPlansModal = document.getElementById("session-plans-modal");
  const closePlansModal = document.getElementById("close-plans-modal");
  const planNameInput = document.getElementById("plan-name-input");
  const savePlanBtn = document.getElementById("save-plan-btn");
  const savedPlansList = document.getElementById("saved-plans-list");
  const globalSettingsModal = document.getElementById("global-settings-modal");
  const closeGlobalSettingsModalBtn = document.getElementById(
    "close-global-settings-modal",
  );
  const globalSettingsToggleGridBtn = document.getElementById(
    "global-settings-toggle-grid-btn",
  );
  const globalSettingsToggleThemeBtn = document.getElementById(
    "global-settings-toggle-theme-btn",
  );
  const globalSettingsOpenHotkeysBtn = document.getElementById(
    "global-settings-open-hotkeys-btn",
  );
  const globalSettingsTitlebarAlwaysVisibleInput = document.getElementById(
    "global-settings-titlebar-always-visible-btn",
  );
  const globalSettingsLanguageSelect = document.getElementById(
    "global-settings-language-select",
  );
  const globalSettingsDefaultModeGroup = document.getElementById(
    "global-settings-default-mode-group",
  );
  const globalSettingsRepairStorageBtn = document.getElementById(
    "global-settings-repair-storage-btn",
  );
  const globalResetSettingsBtn = document.getElementById(
    "global-reset-settings-btn",
  );
  const globalSettingsExportPrefsBtn = document.getElementById(
    "global-settings-export-prefs-btn",
  );
  const globalSettingsImportPrefsBtn = document.getElementById(
    "global-settings-import-prefs-btn",
  );
  const globalSettingsToggleAnimationsInput = document.getElementById(
    "global-settings-toggle-animations-btn",
  );
  const globalSettingsIgnoreVideoFilesInput = document.getElementById(
    "global-settings-ignore-video-files-btn",
  );
  const globalSettingsConfirmDeleteImageInput = document.getElementById(
    "global-settings-confirm-delete-image-btn",
  );
  const globalSettingsEnableOnlineSyncInput = document.getElementById(
    "global-settings-enable-online-sync-btn",
  );
  const globalSettingsShowProgressBarInput = document.getElementById(
    "global-settings-show-progress-bar-btn",
  );
  const SESSION_PLANS_KEY = "posechrono_session_plans";
  const SESSION_PLANS_DB_KEY = STORAGE_KEYS.SESSION_PLANS_DB;
  let sessionPlansCache = null;

  // Charger les plans (IndexedDB + migration depuis localStorage)
  async function loadSessionPlans() {
    if (Array.isArray(sessionPlansCache)) {
      return sessionPlansCache;
    }
    try {
      const migrated = await PoseChronoStorage.migrateFromLocalStorage(
        SESSION_PLANS_KEY,
        SESSION_PLANS_DB_KEY,
        [],
      );
      const rawPayload =
        migrated !== undefined
          ? migrated
          : await PoseChronoStorage.getJson(SESSION_PLANS_DB_KEY, {
              schemaVersion: STORAGE_SCHEMA_VERSION,
              plans: [],
            });
      const normalized = normalizeSessionPlansPayload(rawPayload);
      sessionPlansCache = normalized.plans;
      if (normalized.repaired) {
        console.warn(
          `[Storage] Session plans repaired (${sessionPlansCache.length} plan(s)).`,
        );
        await PoseChronoStorage.setJson(
          SESSION_PLANS_DB_KEY,
          normalized.payload,
        );
      }
      return sessionPlansCache;
    } catch (e) {
      console.error(i18next.t("errors.loadPlansError") + ":", e);
      return [];
    }
  }

  // Sauvegarder les plans (IndexedDB)
  async function saveSessionPlans(plans) {
    try {
      sessionPlansCache = Array.isArray(plans) ? plans : [];
      const normalized = normalizeSessionPlansPayload({
        schemaVersion: STORAGE_SCHEMA_VERSION,
        plans: sessionPlansCache,
      });
      sessionPlansCache = normalized.plans;
      await PoseChronoStorage.setJson(SESSION_PLANS_DB_KEY, normalized.payload);
      try {
        localStorage.removeItem(SESSION_PLANS_KEY);
      } catch (_) {}
    } catch (e) {
      console.error(i18next.t("errors.savePlansError") + ":", e);
    }
  }

  // Calculer la durée totale d'un plan (en secondes)
  function calculatePlanDuration(steps) {
    return calculateSessionPlanDuration(steps);
  }

  // Formater une durée en secondes vers format lisible
  function formatDuration(seconds) {
    if (!SESSION_TIME_FORMAT_UTILS?.formatCompactDuration) {
      logMissingShared("SESSION_TIME_FORMAT_UTILS.formatCompactDuration");
      return "0s";
    }
    return SESSION_TIME_FORMAT_UTILS.formatCompactDuration(seconds);
  }

  // Labels i18n singulier/pluriel via `count` pour la section des plans
  function getPlanWord(base, count) {
    if (base === "pose") {
      return translateCountLabel("modes.custom.pose", count, "pose", "poses");
    }

    if (base === "step") {
      return translateCountLabel("modes.custom.step", count, "step", "steps");
    }

    return "";
  }

  // Afficher la liste des plans
  async function displaySavedPlans() {
    const plans = await loadSessionPlans();
    if (plans.length === 0) {
      savedPlansList.innerHTML = `<div class="empty-plans-msg">${i18next.t("modes.custom.noPlansSaved")}</div>`;
      return;
    }

    if (!SESSION_PLAN_UTILS?.renderPlansListHtml) {
      logMissingShared("SESSION_PLAN_UTILS.renderPlansListHtml");
      savedPlansList.innerHTML = "";
      return;
    }

    savedPlansList.innerHTML = SESSION_PLAN_UTILS.renderPlansListHtml(plans, {
      escapeHtml,
      formatDuration,
      calculatePlanDuration,
      calculatePlanPoses,
      getPlanWord,
      loadLabel: i18next.t("modes.custom.loadPlan", { defaultValue: "Load" }),
      deleteButtonIcon: PLAN_DELETE_BUTTON_ICON,
    });
  }

  // Supprimer un plan
  async function deletePlan(index) {
    const plans = await loadSessionPlans();
    if (index < 0 || index >= plans.length) return;

    plans.splice(index, 1);
    await saveSessionPlans(plans);
    await displaySavedPlans();
  }

  // Suppression avec corbeille logique (undo 10s)
  async function deletePlanWithUndo(index) {
    const plans = await loadSessionPlans();
    if (index < 0 || index >= plans.length) return;

    const deletedPlan = plans[index];
    const safeIndex = index;
    const actionId = `plan-delete-${Date.now()}-${index}`;

    // Suppression immédiate de l'UI, restauration possible pendant 10s
    plans.splice(index, 1);
    await saveSessionPlans(plans);
    await displaySavedPlans();

    const undoLabel = i18next.t("notifications.undo", { defaultValue: "Undo" });
    const deletedMsg = i18next.t("notifications.deleteQueued", {
      defaultValue: "Deleted. Undo available for 10 seconds.",
    });

    if (typeof window.schedulePoseChronoUndoAction === "function") {
      window.schedulePoseChronoUndoAction({
        id: actionId,
        timeoutMs: 10000,
        message: deletedMsg,
        undoLabel,
        onUndo: () => {
          (async () => {
            const currentPlans = await loadSessionPlans();
            const restoreAt = Math.max(
              0,
              Math.min(safeIndex, currentPlans.length),
            );
            currentPlans.splice(restoreAt, 0, deletedPlan);
            await saveSessionPlans(currentPlans);
            await displaySavedPlans();
          })().catch((err) => {
            console.error("[Plans] undo restore error:", err);
          });

          if (typeof window.showPoseChronoToast === "function") {
            window.showPoseChronoToast({
              type: "success",
              message: i18next.t("notifications.undoApplied", {
                defaultValue: "Action undone.",
              }),
              duration: 2000,
            });
          }
        },
      });
    }
  }

  // Calculer le total de poses d'un plan (hors pauses)
  function calculatePlanPoses(steps) {
    return calculateSessionPlanPoses(steps);
  }

  registerSessionPlansModalBindings({
    managePlansBtn,
    closePlansModal,
    sessionPlansModal,
    planNameInput,
    displaySavedPlans,
  });

  registerGlobalSettingsControlBindings({
    globalSettingsModal,
    closeGlobalSettingsModalBtn,
    globalSettingsToggleGridBtn,
    globalSettingsToggleThemeBtn,
    globalSettingsOpenHotkeysBtn,
    globalSettingsTitlebarAlwaysVisibleInput,
    globalSettingsLanguageSelect,
    globalSettingsDefaultModeGroup,
  });

  if (globalSettingsToggleAnimationsInput) {
    globalSettingsToggleAnimationsInput.addEventListener("change", () => {
      // checked = disable animations → animationsEnabled = false
      setAnimationsEnabled(!globalSettingsToggleAnimationsInput.checked);
      updateGlobalSettingsModalState();
    });
  }

  if (globalSettingsIgnoreVideoFilesInput) {
    globalSettingsIgnoreVideoFilesInput.addEventListener("change", () => {
      const checked = globalSettingsIgnoreVideoFilesInput.checked;
      UIPreferences.set("ignoreVideoFiles", checked);
      if (!state.isRunning) {
        void loadImages();
      }
      updateGlobalSettingsModalState();
    });
  }

  if (globalSettingsConfirmDeleteImageInput) {
    globalSettingsConfirmDeleteImageInput.addEventListener("change", () => {
      UIPreferences.set(
        PREF_KEY_CONFIRM_DELETE_IMAGE,
        !!globalSettingsConfirmDeleteImageInput.checked,
      );
      updateGlobalSettingsModalState();
    });
  }

  if (globalSettingsEnableOnlineSyncInput) {
    globalSettingsEnableOnlineSyncInput.addEventListener("change", () => {
      UIPreferences.set("syncEnabled", globalSettingsEnableOnlineSyncInput.checked);
      updateGlobalSettingsModalState();
      
      const syncBtn = document.getElementById("titlebar-sync-btn");
      if (syncBtn) {
        if (isSyncFeatureEnabled()) {
          syncBtn.classList.remove("hidden");
          syncBtn.removeAttribute("aria-hidden");
          syncBtn.removeAttribute("tabindex");
        } else {
          syncBtn.classList.add("hidden");
          syncBtn.setAttribute("aria-hidden", "true");
          syncBtn.setAttribute("tabindex", "-1");
        }
      }
    });
  }

  if (globalSettingsShowProgressBarInput) {
    globalSettingsShowProgressBarInput.addEventListener("change", () => {
      setShowProgressBar(globalSettingsShowProgressBarInput.checked);
      updateGlobalSettingsModalState();
    });
  }

  const globalSettingsSoundEnabledByDefaultInput = document.getElementById(
    "global-settings-sound-enabled-by-default-btn",
  );
  if (globalSettingsSoundEnabledByDefaultInput) {
    globalSettingsSoundEnabledByDefaultInput.addEventListener("change", () => {
      UIPreferences.set(
        PREF_KEY_SOUND_ENABLED_BY_DEFAULT,
        globalSettingsSoundEnabledByDefaultInput.checked,
      );
      updateGlobalSettingsModalState();
    });
  }

  const globalSettingsSoundTickInput = document.getElementById(
    "global-settings-sound-tick-btn",
  );
  if (globalSettingsSoundTickInput) {
    globalSettingsSoundTickInput.addEventListener("change", () => {
      UIPreferences.set(
        PREF_KEY_SOUND_TICK,
        globalSettingsSoundTickInput.checked,
      );
      updateGlobalSettingsModalState();
    });
  }

  const globalSettingsTickThresholdGroup = document.getElementById(
    "global-settings-tick-threshold-group",
  );
  if (globalSettingsTickThresholdGroup) {
    globalSettingsTickThresholdGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".search-toggle-btn[data-threshold]");
      if (!btn) return;
      UIPreferences.set(
        PREF_KEY_TICK_SOUND_THRESHOLD,
        Number(btn.dataset.threshold),
      );
      updateGlobalSettingsModalState();
    });
  }

  const globalSettingsSoundEndInput = document.getElementById(
    "global-settings-sound-end-btn",
  );
  if (globalSettingsSoundEndInput) {
    globalSettingsSoundEndInput.addEventListener("change", () => {
      UIPreferences.set(
        PREF_KEY_SOUND_END,
        globalSettingsSoundEndInput.checked,
      );
      updateGlobalSettingsModalState();
    });
  }

  const globalSettingsSoundImageChangeInput = document.getElementById(
    "global-settings-sound-image-change-btn",
  );
  if (globalSettingsSoundImageChangeInput) {
    globalSettingsSoundImageChangeInput.addEventListener("change", () => {
      UIPreferences.set(
        PREF_KEY_SOUND_IMAGE_CHANGE,
        globalSettingsSoundImageChangeInput.checked,
      );
      updateGlobalSettingsModalState();
    });
  }

  const globalSettingsSoundPauseInput = document.getElementById(
    "global-settings-sound-pause-btn",
  );
  if (globalSettingsSoundPauseInput) {
    globalSettingsSoundPauseInput.addEventListener("change", () => {
      UIPreferences.set(
        PREF_KEY_SOUND_PAUSE,
        globalSettingsSoundPauseInput.checked,
      );
      updateGlobalSettingsModalState();
    });
  }

  const handleResetAllSettings = async () => {
    const { confirmed } = await showPoseChronoConfirmDialog({
      title: i18next.t("settings.global.resetSettings", {
        defaultValue: "Reset settings",
      }),
      message: i18next.t("settings.global.resetSettingsConfirm", {
        defaultValue:
          "Reset all settings to defaults? (theme, UI preferences, custom hotkeys)",
      }),
      confirmText: i18next.t("settings.global.resetSettings", {
        defaultValue: "Reset settings",
      }),
      cancelText: i18next.t("notifications.deleteCancel", {
        defaultValue: "Cancel",
      }),
      container: globalSettingsModal || settingsScreen || document.body,
    });
    if (!confirmed) return;

    try {
      await PoseChronoStorage.remove(STORAGE_KEYS.HOTKEYS_DB);
    } catch (_) {}
    try {
      localStorage.removeItem(HOTKEYS_STORAGE_KEY);
    } catch (_) {}
    try {
      localStorage.removeItem(LEGACY_DEFAULT_SESSION_MODE_STORAGE_KEY);
    } catch (_) {}

    Object.keys(CONFIG.HOTKEYS).forEach((k) => {
      delete CONFIG.HOTKEYS[k];
    });
    resetConfigHotkeysToDefaults();
    enforceNonCustomizableConfigHotkeys();

    UIPreferences.resetVisualPrefs();
    UIPreferences.set(
      "backgroundGridEnabled",
      CONFIG_RUNTIME_DEFAULTS.backgroundGrid,
    );
    UIPreferences.set(
      "titlebarAlwaysVisible",
      CONFIG_RUNTIME_DEFAULTS.titlebarAlwaysVisible,
    );
    UIPreferences.set(
      "defaultSessionMode",
      CONFIG_RUNTIME_DEFAULTS.defaultSessionMode,
    );
    UIPreferences.set("reviewDurationsVisible", true);
    UIPreferences.set("animationsEnabled", true);
    UIPreferences.set("ignoreVideoFiles", false);
    UIPreferences.set(PREF_KEY_CONFIRM_DELETE_IMAGE, true);
    UIPreferences.set("showProgressBar", true);
    UIPreferences.set(PREF_KEY_SOUND_ENABLED_BY_DEFAULT, true);
    UIPreferences.set(PREF_KEY_SOUND_TICK, true);
    UIPreferences.set(PREF_KEY_TICK_SOUND_THRESHOLD, 15);
    UIPreferences.set(PREF_KEY_SOUND_END, true);
    UIPreferences.set(PREF_KEY_SOUND_IMAGE_CHANGE, true);
    UIPreferences.set(PREF_KEY_SOUND_PAUSE, true);
    state.soundEnabled = true;
    if (UIPreferences.setStringArray) {
      UIPreferences.setStringArray(PREF_KEY_SIDEBAR_HIDDEN_BUTTONS, []);
      UIPreferences.setStringArray(
        PREF_KEY_SIDEBAR_BUTTON_ORDER,
        SIDEBAR_DEFAULT_BUTTON_ORDER,
      );
    }
    applySidebarVisibility();
    globalSettingsCollapsed.clear();
    ["maintenance", "son"].forEach((k) => globalSettingsCollapsed.add(k));
    saveGlobalSettingsCollapsedState();
    globalSettingsCategoriesInitialized = false;

    CONFIG.enableFlipAnimation = CONFIG_RUNTIME_DEFAULTS.enableFlipAnimation;
    CONFIG.smoothProgress = CONFIG_RUNTIME_DEFAULTS.smoothProgress;
    CONFIG.smoothPauseCircle = CONFIG_RUNTIME_DEFAULTS.smoothPauseCircle;
    CONFIG.reverseProgressiveBlur =
      CONFIG_RUNTIME_DEFAULTS.reverseProgressiveBlur;
    CONFIG.defaultAutoFlip = CONFIG_RUNTIME_DEFAULTS.defaultAutoFlip;
    CONFIG.defaultSessionMode = CONFIG_RUNTIME_DEFAULTS.defaultSessionMode;
    CONFIG.backgroundGrid = CONFIG_RUNTIME_DEFAULTS.backgroundGrid;
    CONFIG.titlebarAlwaysVisible =
      CONFIG_RUNTIME_DEFAULTS.titlebarAlwaysVisible;

    applyTheme(CONFIG_RUNTIME_DEFAULTS.currentTheme);
    try {
      await platformPreferenceSet(
        "theme",
        CONFIG_RUNTIME_DEFAULTS.currentTheme,
      );
    } catch (_) {}

    applyVisualPreferencesFromStore();
    if (
      !state.isRunning &&
      settingsScreen &&
      !settingsScreen.classList.contains("hidden")
    ) {
      switchMode(CONFIG.defaultSessionMode);
    }
    updateGlobalSettingsModalState();
    initGlobalSettingsCategoryToggles();
    updateButtonLabels();
    updateSidebarTooltips();

    // Clear i18n cache and reload immediately to apply defaults.
    try {
      Object.keys(localStorage)
        .filter((k) => k.includes("posechrono-i18n-cache"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    localStorage.setItem("posechrono-reopen-global-settings-modal", "true");
    localStorage.setItem("posechrono-show-reset-settings-toast", "true");
    location.reload();
  };

  const handleExportPreferencesClick = async () => {
    const { confirmed, selections } = await showPreferencesPackageDialog({
      mode: "export",
      defaults: {
        ui: true,
        hotkeys: true,
        plans: true,
        timeline: false,
      },
      container: globalSettingsModal || settingsScreen || document.body,
    });
    if (!confirmed) return;

    const selected = hasAnyPreferencesSectionSelected(selections);
    if (!selected) {
      if (typeof window.showPoseChronoToast === "function") {
        window.showPoseChronoToast({
          type: "info",
          message: i18next.t("storage.nothingSelected", {
            defaultValue: "No storage section selected.",
          }),
          duration: 2200,
        });
      }
      return;
    }

    const sections = {};

    if (selections.ui) {
      sections.ui = UIPreferences.exportData();
    }

    if (selections.hotkeys) {
      const hotkeysToSave = collectCustomHotkeysBindings();
      sections.hotkeys = normalizeHotkeysPayload({
        schemaVersion: STORAGE_SCHEMA_VERSION,
        bindings: hotkeysToSave,
      }).payload;
    }

    if (selections.plans) {
      const plans = await loadSessionPlans();
      sections.plans = normalizeSessionPlansPayload({
        schemaVersion: STORAGE_SCHEMA_VERSION,
        plans,
      }).payload;
    }

    if (selections.timeline) {
      try {
        if (
          window.TimelineData &&
          typeof window.TimelineData.getData === "function"
        ) {
          sections.timeline = JSON.parse(
            JSON.stringify(window.TimelineData.getData()),
          );
        } else {
          sections.timeline = null;
        }
      } catch (e) {
        console.warn("[Prefs] timeline export read failed:", e);
        sections.timeline = null;
      }
    }

    const payload = {
      schemaVersion: PREFS_PACKAGE_SCHEMA_VERSION,
      app: "PoseChrono",
      exportedAt: new Date().toISOString(),
      sections,
    };

    const ok = downloadJsonPayload(createPrefsBackupFilename(), payload);
    if (typeof window.showPoseChronoToast === "function") {
      window.showPoseChronoToast({
        type: ok ? "success" : "error",
        message: ok
          ? i18next.t("settings.global.preferencesExportDone", {
              defaultValue: "Preferences exported.",
            })
          : i18next.t("settings.global.preferencesExportError", {
              defaultValue: "Preferences export failed.",
            }),
        duration: 2400,
      });
    }
  };

  const handleImportPreferencesClick = async () => {
    const text = await pickJsonFileText();
    if (!text) return;

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      showPoseChronoErrorMessage(
        i18next.t("settings.global.preferencesImportInvalid", {
          defaultValue: "Invalid backup file.",
        }),
      );
      return;
    }

    if (!isValidPreferencesPackage(parsed)) {
      showPoseChronoErrorMessage(
        i18next.t("settings.global.preferencesImportInvalid", {
          defaultValue: "Invalid backup file.",
        }),
      );
      return;
    }

    const available = getAvailablePreferencesSections(parsed);

    const { confirmed, selections } = await showPreferencesPackageDialog({
      mode: "import",
      available,
      defaults: available,
      container: globalSettingsModal || settingsScreen || document.body,
    });
    if (!confirmed) return;

    const selected = hasAnyPreferencesSectionSelected(selections);
    if (!selected) {
      if (typeof window.showPoseChronoToast === "function") {
        window.showPoseChronoToast({
          type: "info",
          message: i18next.t("storage.nothingSelected", {
            defaultValue: "No storage section selected.",
          }),
          duration: 2200,
        });
      }
      return;
    }

    const applied = [];
    try {
      if (selections.ui && parsed.sections.ui) {
        UIPreferences.importData(parsed.sections.ui, { persist: true });
        applyVisualPreferencesFromStore();
        applyPreferredDefaultSessionMode({ syncUi: true });
        globalSettingsCollapsed.clear();
        globalSettingsCategoriesInitialized = false;
        initGlobalSettingsCategoryToggles();
        applied.push(
          i18next.t("settings.global.packageSectionUi", {
            defaultValue: "UI preferences",
          }),
        );
      }

      if (selections.hotkeys && parsed.sections.hotkeys) {
        const normalizedHotkeys = normalizeHotkeysPayload(
          parsed.sections.hotkeys,
        );
        await PoseChronoStorage.setJson(
          STORAGE_KEYS.HOTKEYS_DB,
          normalizedHotkeys.payload,
        );
        try {
          localStorage.removeItem(HOTKEYS_STORAGE_KEY);
        } catch (_) {}
        applyCustomHotkeysToConfig(normalizedHotkeys.bindings, {
          resetToDefaults: true,
        });
        updateButtonLabels();
        updateSidebarTooltips();
        applied.push(
          i18next.t("settings.global.packageSectionHotkeys", {
            defaultValue: "Keyboard shortcuts",
          }),
        );
      }

      if (selections.plans && parsed.sections.plans) {
        const normalizedPlans = normalizeSessionPlansPayload(
          parsed.sections.plans,
        );
        sessionPlansCache = normalizedPlans.plans;
        await PoseChronoStorage.setJson(
          SESSION_PLANS_DB_KEY,
          normalizedPlans.payload,
        );
        try {
          localStorage.removeItem(SESSION_PLANS_KEY);
        } catch (_) {}
        if (
          sessionPlansModal &&
          !sessionPlansModal.classList.contains("hidden")
        ) {
          await displaySavedPlans();
        }
        applied.push(
          i18next.t("settings.global.packageSectionPlans", {
            defaultValue: "Session plans",
          }),
        );
      }

      if (selections.timeline && parsed.sections.timeline) {
        if (
          window.TimelineData &&
          typeof window.TimelineData.importJSON === "function"
        ) {
          window.TimelineData.importJSON(
            JSON.stringify(parsed.sections.timeline),
          );
        } else {
          await PoseChronoStorage.setJson(STORAGE_KEYS.TIMELINE_DB, {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            data: parsed.sections.timeline,
          });
        }
        refreshTimelineViewsSafely("preferences-import");
        applied.push(
          i18next.t("settings.global.packageSectionTimeline", {
            defaultValue: "Timeline history",
          }),
        );
      }

      updateGlobalSettingsModalState();

      if (typeof window.showPoseChronoToast === "function") {
        window.showPoseChronoToast({
          type: "success",
          message: i18next.t("settings.global.preferencesImportDone", {
            defaultValue: "Preferences imported: {{targets}}",
            targets: applied.join(", "),
          }),
          duration: 3000,
        });
      }
    } catch (e) {
      console.error("[Prefs] import error:", e);
      showPoseChronoErrorMessage(
        i18next.t("settings.global.preferencesImportError", {
          defaultValue: "Preferences import failed.",
        }),
      );
    }
  };

  const handleSavePlanClick = async () => {
    const name = planNameInput.value.trim();
    if (!SESSION_PLAN_UTILS?.getPlanSaveValidation) {
      logMissingShared("SESSION_PLAN_UTILS.getPlanSaveValidation");
      return;
    }
    const saveValidation = SESSION_PLAN_UTILS.getPlanSaveValidation({
      name,
      queueLength: state.customQueue.length,
    });

    if (!saveValidation.ok && saveValidation.reason === "empty-name") {
      // Shake et bordure rouge sur l'input
      planNameInput.classList.add("input-error");
      planNameInput.focus();
      setTimeout(() => {
        planNameInput.classList.remove("input-error");
      }, 600);
      return;
    }

    if (!saveValidation.ok && saveValidation.reason === "empty-queue") {
      // Shake sur le bouton de sauvegarde
      savePlanBtn.classList.add("shake");
      setTimeout(() => {
        savePlanBtn.classList.remove("shake");
      }, 400);
      return;
    }

    const plans = await loadSessionPlans();
    if (!SESSION_PLAN_UTILS?.createPlanEntry) {
      logMissingShared("SESSION_PLAN_UTILS.createPlanEntry");
      return;
    }
    const newPlan = SESSION_PLAN_UTILS.createPlanEntry({
      name,
      queue: state.customQueue,
      date: Date.now(),
    });

    plans.push(newPlan);
    await saveSessionPlans(plans);

    planNameInput.value = "";
    planNameInput.blur();
    await displaySavedPlans();

    // Feedback visuel
    savePlanBtn.textContent = i18next.t("notifications.planSaved");
    setTimeout(() => {
      const saveBtnLabel = i18next.t("modes.custom.saveBtn", {
        defaultValue: "Save",
      });
      savePlanBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
            <path d="M840-680v480q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h480l160 160Zm-80 34L646-760H200v560h560v-446ZM480-240q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35ZM240-560h360v-160H240v160Zm-40-86v446-560 114Z"/>
          </svg>
          ${saveBtnLabel}
        `;
      // Réactiver explicitement l'input
      planNameInput.disabled = false;
      planNameInput.readOnly = false;
    }, 2000);
  };

  const handleSavedPlansListClick = async (e) => {
    const loadBtn = e.target.closest(".plan-load-btn");
    const deleteBtn = e.target.closest(".plan-delete-btn");
    const planName = e.target.closest(".plan-name");

    if (loadBtn) {
      const index = parseInt(loadBtn.dataset.index, 10);
      const plans = await loadSessionPlans();
      if (plans[index]) {
        state.customQueue = JSON.parse(JSON.stringify(plans[index].steps));
        renderCustomQueue();
        updateStartButtonState();
        sessionPlansModal.classList.add("hidden");
      }
    } else if (deleteBtn) {
      const index = parseInt(deleteBtn.dataset.index, 10);
      const plans = await loadSessionPlans();
      const plan = plans[index];
      if (!plan) return;

      const title = i18next.t("modes.custom.managePlans", {
        defaultValue: "Session Plans",
      });
      if (!SESSION_PLAN_UTILS?.formatPlanDeleteSummary) {
        logMissingShared("SESSION_PLAN_UTILS.formatPlanDeleteSummary");
        return;
      }
      const summaryLine = SESSION_PLAN_UTILS.formatPlanDeleteSummary(plan, {
        formatDuration,
        calculatePlanDuration,
        calculatePlanPoses,
        getPlanWord,
      }).summary;
      const message = `${i18next.t("modes.custom.confirmDeletePlan", { defaultValue: "Delete this plan?" })}\n${summaryLine}`;

      const { confirmed } = await showPoseChronoConfirmDialog({
        title,
        message,
        confirmText: i18next.t("notifications.deleteConfirm", {
          defaultValue: "Delete",
        }),
        cancelText: i18next.t("notifications.deleteCancel", {
          defaultValue: "Cancel",
        }),
        container: sessionPlansModal,
      });

      if (confirmed) {
        await deletePlanWithUndo(index);
      }
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
          (async () => {
            const plans = await loadSessionPlans();
            if (plans[index]) {
              plans[index].name = newName;
              await saveSessionPlans(plans);
            }
          })().catch((err) => {
            console.error("[Plans] rename error:", err);
          });
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
  };

  registerSessionPlansCrudBindings({
    savePlanBtn,
    savedPlansList,
    onSavePlan: handleSavePlanClick,
    onSavedPlansClick: handleSavedPlansListClick,
  });

  async function handleRepairStorageClick() {
    const { confirmed, selections } = await showStorageRepairDialog({
      container: document.body,
      message: i18next.t("storage.repairMessageDetailed", {
        defaultValue:
          "Choose what to reset. Selected data will be deleted locally and cannot be recovered automatically.",
      }),
      impactItems: [
        i18next.t("storage.repairImpactTimeline", {
          defaultValue:
            "Timeline: removes day/session history and related image references.",
        }),
        i18next.t("storage.repairImpactPlans", {
          defaultValue: "Plans: removes saved session plans.",
        }),
        i18next.t("storage.repairImpactHotkeys", {
          defaultValue: "Hotkeys: restores default shortcuts.",
        }),
      ],
    });
    if (!confirmed) return;

    const hasTarget = hasAnyPreferencesSectionSelected(selections);
    if (!hasTarget) {
      if (typeof window.showPoseChronoToast === "function") {
        window.showPoseChronoToast({
          type: "info",
          message: i18next.t("storage.nothingSelected", {
            defaultValue: "No storage section selected.",
          }),
          duration: 2200,
        });
      }
      return;
    }

    const repairedLabels = [];

    try {
      if (selections.plans) {
        await PoseChronoStorage.remove(SESSION_PLANS_DB_KEY);
        try {
          localStorage.removeItem(SESSION_PLANS_KEY);
        } catch (_) {}
        sessionPlansCache = [];
        repairedLabels.push(
          i18next.t("storage.targetPlans", {
            defaultValue: "Session plans",
          }),
        );
        if (
          sessionPlansModal &&
          !sessionPlansModal.classList.contains("hidden")
        ) {
          await displaySavedPlans();
        }
      }

      if (selections.hotkeys) {
        await PoseChronoStorage.remove(STORAGE_KEYS.HOTKEYS_DB);
        try {
          localStorage.removeItem(HOTKEYS_STORAGE_KEY);
        } catch (_) {}
        resetConfigHotkeysToDefaults();
        enforceNonCustomizableConfigHotkeys();
        repairedLabels.push(
          i18next.t("storage.targetHotkeys", {
            defaultValue: "Keyboard shortcuts",
          }),
        );
      }

      if (selections.timeline) {
        await PoseChronoStorage.remove(STORAGE_KEYS.TIMELINE_DB);
        try {
          localStorage.removeItem("posechrono-timeline-data");
        } catch (_) {}
        if (
          window.TimelineData &&
          typeof window.TimelineData.reset === "function"
        ) {
          window.TimelineData.reset();
        }
        refreshTimelineViewsSafely("storage-repair");
        repairedLabels.push(
          i18next.t("storage.targetTimeline", {
            defaultValue: "Timeline history",
          }),
        );
      }

      if (typeof window.showPoseChronoToast === "function") {
        window.showPoseChronoToast({
          type: "success",
          message: i18next.t("storage.repairDone", {
            defaultValue: "Storage repaired: {{targets}}",
            targets: repairedLabels.join(", "),
          }),
          duration: 2800,
        });
      }
    } catch (e) {
      console.error("[Storage] repair error:", e);
      showPoseChronoErrorMessage(
        i18next.t("storage.repairError", {
          defaultValue: "Storage repair failed.",
        }),
      );
    }
  }

  registerGlobalSettingsActionButtonsBindings({
    globalResetSettingsBtn,
    globalSettingsExportPrefsBtn,
    globalSettingsImportPrefsBtn,
    globalSettingsRepairStorageBtn,
    onResetSettings: handleResetAllSettings,
    onExportPreferences: handleExportPreferencesClick,
    onImportPreferences: handleImportPreferencesClick,
    onRepairStorage: async () => {
      await handleRepairStorageClick();
      updateGlobalSettingsModalState();
    },
  });

  registerClassicAndMemoryTypeBindings({
    durationBtns,
    hoursInput,
    minutesInput,
    secondsInput,
    memoryTypeBtns,
    memoryFlashSettings,
    memoryProgressiveSettings,
  });

  // Gestion des boutons de durée pour le mode mémoire
  const memoryFlashBtns =
    memoryFlashSettings?.querySelectorAll(".duration-btn");
  const memoryProgressiveBtns =
    memoryProgressiveSettings?.querySelectorAll(".duration-btn");
  const memoryProgressiveMinutes = document.getElementById(
    "memory-progressive-minutes",
  );
  const memoryProgressiveSeconds = document.getElementById(
    "memory-progressive-seconds",
  );
  const memoryProgressiveCustomTime = document.querySelector(
    "#memory-progressive-settings .memory-custom-time",
  );
  const memoryFlashMinutes = document.getElementById("memory-flash-minutes");
  const memoryFlashSeconds = document.getElementById("memory-flash-seconds");
  const memoryCustomTime = document.querySelector(".memory-custom-time");

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

  const memoryPosesSlider = document.getElementById("memory-poses-slider");
  const memoryPosesValue = document.getElementById("memory-poses-value");
  const memoryTotalDuration = document.getElementById("memory-total-duration");
  const memoryTotalDurationValue = document.getElementById(
    "memory-total-duration-value",
  );

  // Fonction pour calculer et afficher la durée totale
  const updateMemoryTotalDuration = () => {
    if (!memoryTotalDuration || !memoryTotalDurationValue) return;

    if (!SESSION_CONTROLS_BINDINGS_UTILS?.resolveMemoryTotalDurationDisplay) {
      logMissingShared(
        "SESSION_CONTROLS_BINDINGS_UTILS.resolveMemoryTotalDurationDisplay",
      );
      memoryTotalDuration.style.display = "none";
      return;
    }
    const viewModel =
      SESSION_CONTROLS_BINDINGS_UTILS.resolveMemoryTotalDurationDisplay({
        state,
        calculateTotalSeconds: (posesCount, drawingTime, displayTime) =>
          calculateMemoryTotalDurationSeconds(
            posesCount,
            drawingTime,
            displayTime,
          ),
      });
    if (!viewModel.visible) {
      memoryTotalDuration.style.display = "none";
      return;
    }
    memoryTotalDurationValue.textContent = viewModel.text;
    memoryTotalDuration.style.display = "block";
  };

  const memoryProgressivePosesSlider = document.getElementById(
    "memory-progressive-poses-slider",
  );
  const memoryProgressivePosesValue = document.getElementById(
    "memory-progressive-poses-value",
  );

  registerMemoryDurationControlsBindings({
    memoryFlashBtns,
    memoryProgressiveBtns,
    memoryProgressiveMinutes,
    memoryProgressiveSeconds,
    memoryProgressiveCustomTime,
    memoryFlashMinutes,
    memoryFlashSeconds,
    memoryCustomTime,
    memoryDrawingTimeInput,
    updateMemoryTotalDuration,
  });
  registerMemoryDrawingTimeBindings({
    memoryDrawingMinutes,
    memoryDrawingSeconds,
    memoryDrawingTimeInput,
    noPressureBtn,
    updateMemoryTotalDuration,
  });
  registerMemoryPoseSlidersBindings({
    memoryPosesSlider,
    memoryPosesValue,
    memoryProgressivePosesSlider,
    memoryProgressivePosesValue,
    updateMemoryTotalDuration,
  });

  registerCustomHmsTimerInputBindings({
    hoursInput,
    minutesInput,
    secondsInput,
  });

  registerPrimarySessionControlsBindings();

  registerVideoControlsBindings();

  registerVideoScrubbingBindings();

  registerTimerAndProgressBindings();

  registerSessionSurfaceInteractionsBindings();

  // Bouton "Coup d'œil" - désactive le flou pendant le maintien du clic
  const memoryPeekBtn = document.getElementById("memory-peek-btn");
  const memoryRevealBtn = document.getElementById("memory-reveal-btn");
  registerMemoryOverlayButtonsBindings({
    memoryOverlay,
    memoryPeekBtn,
    memoryRevealBtn,
  });

  // Menu contextuel sur l'image et le fond
  registerImageContextMenuBindings();

  registerShuffleAndAutoFlipBindings();

  // === BOUTONS D'ACTION ===
  registerActionButtonsBindings();

  // === PERSONNALISATION SIDEBAR ===
  const sidebarEl = document.querySelector(".sidebar");
  if (sidebarEl) {
    sidebarEl.addEventListener("contextmenu", (e) => {
      // Ne pas intercepter le clic droit sur un bouton (laisse les handlers existants gérer)
      if (e.target.closest("button")) return;
      // Le timer a son propre menu contextuel (reset chrono).
      if (e.target.closest("#timer-display")) return;
      e.preventDefault();
      showSidebarContextMenu(e.clientX, e.clientY);
    });
  }

  // === RACCOURCIS CLAVIER ===
  registerCoreKeyboardListeners();

  // === RACCOURCI TAGS (désactivé pour l'instant) ===
  /* document.addEventListener("keydown", (e) => {
    // Ouvrir la modal tags (si pas en train de taper dans un input)
    const tagsKey = "T";
    const pressedKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (
      pressedKey === tagsKey &&
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
  }); */

  registerBackgroundScreenContextMenus();
}

/**
 * Gère tous les raccourcis clavier pendant la session
 */
// Mettre à jour les tooltips de la sidebar avec les raccourcis dynamiques
function updateSidebarTooltips() {
  if (!SIDEBAR_TOOLTIPS_UTILS?.updateSidebarTooltips) {
    logMissingShared("SIDEBAR_TOOLTIPS_UTILS.updateSidebarTooltips");
    return;
  }
  SIDEBAR_TOOLTIPS_UTILS.updateSidebarTooltips({
    buttons: {
      flipHorizontalBtn,
      flipVerticalBtn,
      grayscaleBtn,
      blurBtn,
      progressiveBlurBtn,
    },
    hotkeys: CONFIG.HOTKEYS,
    translate: i18next.t.bind(i18next),
  });
}

function handleFrameSteppingKeyup(e) {
  if (!GLOBAL_KEYBOARD_SHORTCUTS_UTILS?.shouldStopFrameSteppingOnKeyup) {
    console.error("[Hotkeys] global-keyboard-shortcuts utils unavailable.");
    return;
  }
  if (
    GLOBAL_KEYBOARD_SHORTCUTS_UTILS.shouldStopFrameSteppingOnKeyup({
      event: e,
      hotkeys: CONFIG.HOTKEYS,
    })
  ) {
    stopFrameStepping();
  }
}

function handleGlobalThemeKeydown(e) {
  if (!GLOBAL_KEYBOARD_SHORTCUTS_UTILS?.handleThemeShortcut) {
    console.error("[Hotkeys] global-keyboard-shortcuts utils unavailable.");
    return;
  }
  GLOBAL_KEYBOARD_SHORTCUTS_UTILS.handleThemeShortcut({
    event: e,
    themeHotkey: CONFIG.HOTKEYS.THEME,
    onToggleTheme: toggleTheme,
  });
}

async function handleGlobalPinKeydown(e) {
  if (!GLOBAL_KEYBOARD_SHORTCUTS_UTILS?.handlePinShortcut) {
    console.error("[Hotkeys] global-keyboard-shortcuts utils unavailable.");
    return;
  }
  await GLOBAL_KEYBOARD_SHORTCUTS_UTILS.handlePinShortcut({
    event: e,
    onToggleAlwaysOnTop: platformWindowToggleAlwaysOnTop,
    onApplyState: (isOnTop) => {
      const pinBtn = document.getElementById("pin-btn");
      if (pinBtn) {
        pinBtn.classList.toggle("active", !!isOnTop);
      }
    },
  });
}

function handleGlobalSettingsKeydown(e) {
  if (!GLOBAL_KEYBOARD_SHORTCUTS_UTILS?.handleGlobalSettingsShortcut) {
    console.error("[Hotkeys] global-keyboard-shortcuts utils unavailable.");
    return;
  }
  GLOBAL_KEYBOARD_SHORTCUTS_UTILS.handleGlobalSettingsShortcut({
    event: e,
    onOpenGlobalSettings: openGlobalSettingsModal,
  });
}

function registerSessionPlansModalBindings(input = {}) {
  const managePlansBtn = input.managePlansBtn || null;
  const closePlansModal = input.closePlansModal || null;
  const sessionPlansModal = input.sessionPlansModal || null;
  const planNameInput = input.planNameInput || null;
  const displaySavedPlans =
    typeof input.displaySavedPlans === "function"
      ? input.displaySavedPlans
      : null;

  const openPlansModal = async () => {
    if (!sessionPlansModal) return;
    sessionPlansModal.classList.remove("hidden");
    if (displaySavedPlans) {
      await displaySavedPlans();
    }
  };

  const closePlans = () => {
    if (!sessionPlansModal) return;
    sessionPlansModal.classList.add("hidden");
    if (planNameInput) {
      planNameInput.value = "";
    }
  };

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindSessionPlansModalBasics) {
    console.error("[Bindings] session-plans-modal utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindSessionPlansModalBasics({
    documentRef: document,
    managePlansBtn,
    closePlansModal,
    sessionPlansModal,
    onOpen: openPlansModal,
    onClose: closePlans,
  });
}

function registerSessionPlansCrudBindings(input = {}) {
  const savePlanBtn = input.savePlanBtn || null;
  const savedPlansList = input.savedPlansList || null;
  const onSavePlan =
    typeof input.onSavePlan === "function" ? input.onSavePlan : null;
  const onSavedPlansClick =
    typeof input.onSavedPlansClick === "function"
      ? input.onSavedPlansClick
      : null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindSessionPlansCrudControls) {
    console.error("[Bindings] session-plans-crud utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindSessionPlansCrudControls({
    savePlanBtn,
    savedPlansList,
    onSavePlan,
    onSavedPlansClick,
  });
}

function registerGlobalSettingsControlBindings(input = {}) {
  const globalSettingsModal = input.globalSettingsModal || null;
  const closeGlobalSettingsModalBtn = input.closeGlobalSettingsModalBtn || null;
  const globalSettingsToggleGridBtn = input.globalSettingsToggleGridBtn || null;
  const globalSettingsToggleThemeBtn =
    input.globalSettingsToggleThemeBtn || null;
  const globalSettingsOpenHotkeysBtn =
    input.globalSettingsOpenHotkeysBtn || null;
  const globalSettingsTitlebarAlwaysVisibleInput =
    input.globalSettingsTitlebarAlwaysVisibleInput || null;
  const globalSettingsLanguageSelect =
    input.globalSettingsLanguageSelect || null;
  const globalSettingsDefaultModeGroup =
    input.globalSettingsDefaultModeGroup || null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindGlobalSettingsControls) {
    console.error("[Bindings] global-settings-controls utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindGlobalSettingsControls({
    documentRef: document,
    globalSettingsModal,
    closeGlobalSettingsModalBtn,
    globalSettingsToggleGridBtn,
    globalSettingsToggleThemeBtn,
    globalSettingsOpenHotkeysBtn,
    globalSettingsTitlebarAlwaysVisibleInput,
    globalSettingsLanguageSelect,
    globalSettingsDefaultModeGroup,
    onCloseGlobalSettingsModal: () => closeGlobalSettingsModal(),
    onToggleGrid: ({ isCheckboxControl, checked }) => {
      if (isCheckboxControl) {
        // checked => cacher la grille
        setBackgroundGridEnabled(!checked, true);
      } else {
        const isEnabled = document.body.classList.contains("grid-enabled");
        setBackgroundGridEnabled(!isEnabled, true);
      }
      updateGlobalSettingsModalState();
    },
    onToggleTheme: () => {
      toggleTheme();
      updateGlobalSettingsModalState();
    },
    onOpenHotkeys: () => {
      closeGlobalSettingsModal({ restoreFocus: false });
      showHotkeysModal();
    },
    onTitlebarAlwaysVisibleChanged: (checked) => {
      setTitlebarAlwaysVisible(checked);
      updateGlobalSettingsModalState();
    },
    onLanguageSelected: (language) => {
      localStorage.setItem('posechrono-reopen-global-settings-modal', 'true');
      void applyPreferredLanguage(language, {
        persist: true,
        reloadPage: true,
      }).catch((error) => {
        console.error("[i18n] Language switch failed:", error);
      });
    },
    onDefaultModeSelected: (mode) => {
      const nextMode = savePreferredDefaultSessionMode(mode, true);
      updateGlobalSettingsModalState();
      if (
        !state.isRunning &&
        settingsScreen &&
        !settingsScreen.classList.contains("hidden")
      ) {
        switchMode(nextMode);
      }
    },
  });
}

function registerGlobalSettingsActionButtonsBindings(input = {}) {
  const globalResetSettingsBtn = input.globalResetSettingsBtn || null;
  const globalSettingsExportPrefsBtn =
    input.globalSettingsExportPrefsBtn || null;
  const globalSettingsImportPrefsBtn =
    input.globalSettingsImportPrefsBtn || null;
  const globalSettingsRepairStorageBtn =
    input.globalSettingsRepairStorageBtn || null;
  const onResetSettings =
    typeof input.onResetSettings === "function" ? input.onResetSettings : null;
  const onExportPreferences =
    typeof input.onExportPreferences === "function"
      ? input.onExportPreferences
      : null;
  const onImportPreferences =
    typeof input.onImportPreferences === "function"
      ? input.onImportPreferences
      : null;
  const onRepairStorage =
    typeof input.onRepairStorage === "function" ? input.onRepairStorage : null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindGlobalSettingsActionButtons) {
    console.error("[Bindings] global-settings-actions utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindGlobalSettingsActionButtons({
    globalResetSettingsBtn,
    globalSettingsExportPrefsBtn,
    globalSettingsImportPrefsBtn,
    globalSettingsRepairStorageBtn,
    onResetSettings,
    onExportPreferences,
    onImportPreferences,
    onRepairStorage,
  });
}

function registerSessionEntryAndModeBindings() {
  const closeReviewBtn = document.getElementById("close-review-btn");
  const customInputs = [
    customCountInput,
    customHInput,
    customMInput,
    customSInput,
  ];

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindSessionEntryAndModeControls) {
    console.error("[Bindings] session-entry-mode utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindSessionEntryAndModeControls({
    documentRef: document,
    startBtn,
    chooseMediaFolderBtn,
    stopBtn,
    closeReviewBtn,
    customAddBtn,
    addPauseBtn,
    customInputs,
    onStartSession: startSession,
    onChooseMediaFolder: selectDesktopMediaFolders,
    onShowReview: showReview,
    onCloseReview: () => {
      reviewScreen.classList.add("hidden");
      document.body.classList.remove("review-active");
      settingsScreen.classList.remove("hidden");
    },
    onSwitchMode: (mode) => switchMode(mode),
    onAddCustomStep: () => addStepToQueue(false),
    onAddCustomPause: () => addStepToQueue(true),
  });
}

function registerClassicAndMemoryTypeBindings(input = {}) {
  const durationBtns = Array.from(input.durationBtns || []);
  const hoursInput = input.hoursInput || null;
  const minutesInput = input.minutesInput || null;
  const secondsInput = input.secondsInput || null;
  const memoryTypeBtns = Array.from(input.memoryTypeBtns || []);
  const memoryFlashSettings = input.memoryFlashSettings || null;
  const memoryProgressiveSettings = input.memoryProgressiveSettings || null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindClassicDurationButtons) {
    console.error("[Bindings] classic-duration utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindClassicDurationButtons({
    durationBtns,
    hoursInput,
    minutesInput,
    secondsInput,
    domInputGroups: DOMCache.inputGroups,
    state,
    getDurationFromButton: (btn) => getDurationFromButton(btn),
    onToggleDurationButtonsForValue: (buttons, value) =>
      toggleDurationButtonsForValue(buttons, value),
  });

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindMemoryTypeSwitchButtons) {
    console.error("[Bindings] memory-type-switch utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindMemoryTypeSwitchButtons({
    memoryTypeBtns,
    memoryFlashSettings,
    memoryProgressiveSettings,
    state,
  });
}

function registerMemoryDurationControlsBindings(input = {}) {
  const memoryFlashBtns = Array.from(input.memoryFlashBtns || []);
  const memoryProgressiveBtns = Array.from(input.memoryProgressiveBtns || []);
  const memoryProgressiveMinutes = input.memoryProgressiveMinutes || null;
  const memoryProgressiveSeconds = input.memoryProgressiveSeconds || null;
  const memoryProgressiveCustomTime = input.memoryProgressiveCustomTime || null;
  const memoryFlashMinutes = input.memoryFlashMinutes || null;
  const memoryFlashSeconds = input.memoryFlashSeconds || null;
  const memoryCustomTime = input.memoryCustomTime || null;
  const memoryDrawingTimeInput = input.memoryDrawingTimeInput || null;
  const updateMemoryTotalDuration =
    typeof input.updateMemoryTotalDuration === "function"
      ? input.updateMemoryTotalDuration
      : null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindMemoryDurationControls) {
    console.error("[Bindings] memory-duration utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindMemoryDurationControls({
    memoryFlashBtns,
    memoryProgressiveBtns,
    memoryProgressiveMinutes,
    memoryProgressiveSeconds,
    memoryProgressiveCustomTime,
    memoryFlashMinutes,
    memoryFlashSeconds,
    memoryCustomTime,
    memoryDrawingTimeInput,
    state,
    getDurationFromButton: (btn) => getDurationFromButton(btn),
    onToggleDurationButtonsForValue: (buttons, value) =>
      toggleDurationButtonsForValue(buttons, value),
    onClearDurationButtonsActive: (buttons) =>
      clearDurationButtonsActive(buttons),
    onReadMinutesSecondsInputValues: (minutesEl, secondsEl) =>
      readMinutesSecondsInputValues(minutesEl, secondsEl),
    onUpdateMemoryTotalDuration: () => {
      if (updateMemoryTotalDuration) {
        updateMemoryTotalDuration();
      }
    },
  });
}

function registerMemoryDrawingTimeBindings(input = {}) {
  const memoryDrawingMinutes = input.memoryDrawingMinutes || null;
  const memoryDrawingSeconds = input.memoryDrawingSeconds || null;
  const memoryDrawingTimeInput = input.memoryDrawingTimeInput || null;
  const noPressureBtn = input.noPressureBtn || null;
  const updateMemoryTotalDuration =
    typeof input.updateMemoryTotalDuration === "function"
      ? input.updateMemoryTotalDuration
      : null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindMemoryDrawingTimeControls) {
    console.error("[Bindings] memory-drawing-time utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindMemoryDrawingTimeControls({
    memoryDrawingMinutes,
    memoryDrawingSeconds,
    memoryDrawingTimeInput,
    noPressureBtn,
    state,
    onReadMinutesSecondsInputValues: (minutesEl, secondsEl) =>
      readMinutesSecondsInputValues(minutesEl, secondsEl),
    onUpdateMemoryTotalDuration: () => {
      if (updateMemoryTotalDuration) {
        updateMemoryTotalDuration();
      }
    },
  });
}

function registerMemoryPoseSlidersBindings(input = {}) {
  const memoryPosesSlider = input.memoryPosesSlider || null;
  const memoryPosesValue = input.memoryPosesValue || null;
  const memoryProgressivePosesSlider =
    input.memoryProgressivePosesSlider || null;
  const memoryProgressivePosesValue = input.memoryProgressivePosesValue || null;
  const updateMemoryTotalDuration =
    typeof input.updateMemoryTotalDuration === "function"
      ? input.updateMemoryTotalDuration
      : null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindMemoryPoseSliders) {
    console.error("[Bindings] memory-pose-sliders utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindMemoryPoseSliders({
    documentRef: document,
    state,
    memoryPosesSlider,
    memoryPosesValue,
    memoryProgressivePosesSlider,
    memoryProgressivePosesValue,
    clickToEnterLabel: i18next.t("settings.clickToEnterValue"),
    onInitSliderWithGradient: (slider) => initSliderWithGradient(slider),
    onUpdateSliderGradient: (slider) => updateSliderGradient(slider),
    onUpdateMemoryTotalDuration: () => {
      if (updateMemoryTotalDuration) {
        updateMemoryTotalDuration();
      }
    },
  });
}

function registerCustomHmsTimerInputBindings(input = {}) {
  const hoursInput = input.hoursInput || null;
  const minutesInput = input.minutesInput || null;
  const secondsInput = input.secondsInput || null;
  const hmsInputs = [hoursInput, minutesInput, secondsInput];

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindCustomHmsTimerInputs) {
    console.error("[Bindings] custom-hms-timer utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindCustomHmsTimerInputs({
    inputs: hmsInputs,
    state,
    domDurationButtons: Array.from(DOMCache.durationBtns || []),
    domInputGroups: Array.from(DOMCache.inputGroups || []),
    debounceMs: 50,
    createDebounce: (fn, ms) => PerformanceUtils.debounce(fn, ms),
    onReadHmsInputValues: () =>
      readHmsInputValues(hoursInput, minutesInput, secondsInput),
    onClearDurationButtonsActive: (buttons) =>
      clearDurationButtonsActive(buttons),
    onUpdateTimerDisplay: updateTimerDisplay,
  });
}

function registerCoreKeyboardListeners() {
  if (!KEYBOARD_LISTENER_BINDINGS_UTILS?.bindCoreKeyboardShortcuts) {
    console.error("[Bindings] keyboard-listener utils unavailable.");
    return;
  }
  KEYBOARD_LISTENER_BINDINGS_UTILS.bindCoreKeyboardShortcuts({
    documentRef: document,
    onMainKeydown: handleKeyboardShortcuts,
    onSettingsKeydown: handleSettingsScreenKeyboardShortcuts,
    onFrameSteppingKeyup: handleFrameSteppingKeyup,
    onThemeKeydown: handleGlobalThemeKeydown,
    onPinKeydown: handleGlobalPinKeydown,
    onGlobalSettingsKeydown: handleGlobalSettingsKeydown,
  });
}

function registerActionButtonsBindings() {
  if (!ACTION_BUTTONS_BINDINGS_UTILS?.bindActionButtons) {
    console.error("[Bindings] action-buttons utils unavailable.");
    return;
  }
  ACTION_BUTTONS_BINDINGS_UTILS.bindActionButtons({
    deleteBtn,
    revealBtn,
    onDelete: deleteImage,
    onReveal: revealImage,
    onRevealContextMenu: (x, y) => showRevealMenu(x, y),
  });
}

function registerPrimarySessionControlsBindings() {
  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindPrimarySessionButtons) {
    console.error("[Bindings] primary-session-controls utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindPrimarySessionButtons({
    playPauseBtn,
    prevBtn,
    nextBtn,
    settingsBtn,
    flipHorizontalBtn,
    flipVerticalBtn,
    grayscaleBtn,
    blurBtn,
    annotateBtn,
    progressiveBlurBtn,
    homeProgressiveBlurBtn,
    onTogglePlayPause: togglePlayPause,
    onPreviousImage: previousImage,
    onShowPrevImageMenu: (x, y) => showPrevImageMenu(x, y),
    onNextImage: nextImage,
    onShowNextImageMenu: (x, y) => showNextImageMenu(x, y),
    onSettingsClick: async () => {
      stopTimer();
      if (
        typeof closeDrawingMode === "function" &&
        typeof isDrawingModeActive !== "undefined" &&
        isDrawingModeActive
      ) {
        closeDrawingMode();
      }
      if (timerDisplay) timerDisplay.classList.remove("timer-paused");

      if (!settingsScreen.classList.contains("hidden")) {
        await platformWindowHide();
        return;
      }

      drawingScreen.classList.add("hidden");
      reviewScreen.classList.add("hidden");
      settingsScreen.classList.remove("hidden");
    },
    onSettingsContextMenu: () => showHotkeysModal(),
    onToggleFlipHorizontal: toggleFlipHorizontal,
    onToggleFlipVertical: toggleFlipVertical,
    onToggleGrayscale: toggleGrayscale,
    onToggleBlur: () => {
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
      } else if (progressiveBlurBtn) {
        progressiveBlurBtn.style.opacity = "1";
        progressiveBlurBtn.style.pointerEvents = "all";
      }
      applyImageFilters();
    },
    onShowBlurMenu: (x, y) => showBlurMenu(x, y),
    onToggleAnnotate: () => {
      if (state.isVideoFile || state.isGifFile) return;
      void toggleDrawingModeSafely();
    },
    onToggleProgressiveBlur: toggleProgressiveBlur,
    onShowProgressiveBlurMenu: (x, y) => showProgressiveBlurMenu(x, y),
  });

  if (gridSidebarBtn) {
    gridSidebarBtn.addEventListener("click", () => {
      const nextGridEnabled = !state.gridEnabled;
      state.gridEnabled = nextGridEnabled;
      if (
        nextGridEnabled &&
        state.gridMode === "none" &&
        state.gridGuides.length === 0
      ) {
        // Éviter un "toggle vide": ajouter un repère vertical par défaut.
        state.gridGuides.push({ type: "vertical", position: 50 });
      }
      updateGridOverlay();
    });
    gridSidebarBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showGridConfig();
    });
  }
  if (silhouetteSidebarBtn) {
    silhouetteSidebarBtn.addEventListener("click", () => {
      state.silhouetteEnabled = !state.silhouetteEnabled;
      applyImageFilters();
      if (window.updateZoomContent && window.zoomFilters) {
        window.zoomFilters.silhouette = state.silhouetteEnabled;
        window.updateZoomContent();
      }
    });
    silhouetteSidebarBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllContextMenus();
      showSilhouetteContextMenu(e.clientX, e.clientY);
    });
  }
}

function registerVideoControlsBindings() {
  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindVideoControls) {
    console.error("[Bindings] video-controls utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindVideoControls({
    documentRef: document,
    videoPlayBtn,
    videoSlowerBtn,
    videoFasterBtn,
    videoPrevFrameBtn,
    videoNextFrameBtn,
    videoLoopBtn,
    videoConfigBtn,
    videoSpeedDisplay,
    videoTimeline,
    state,
    frameStepState,
    icons: ICONS,
    translate: i18next.t.bind(i18next),
    onToggleVideoPlayPause: toggleVideoPlayPause,
    onChangeVideoSpeed: (direction) => changeVideoSpeed(direction),
    onStepFrame: (direction, isRepeat) => stepFrame(direction, isRepeat),
    onProcessFrameStepLoop: processFrameStepLoop,
    onStopFrameSteppingFromButton: stopFrameSteppingFromButton,
    onToggleVideoLoop: toggleVideoLoop,
    onShowVideoConfig: showVideoConfig,
    onShowSpeedPopup: showSpeedPopup,
    onSeekVideo: seekVideo,
  });
}

function registerVideoScrubbingBindings() {
  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindVideoScrubbing) {
    console.error("[Bindings] video-scrubbing utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindVideoScrubbing({
    documentRef: document,
    currentVideo,
    state,
    frameStepState,
    performanceRef: performance,
    requestAnimationFrameRef: requestAnimationFrame,
    cancelAnimationFrameRef: cancelAnimationFrame,
    onUpdateVideoTimeDisplay: updateVideoTimeDisplay,
  });
}

function registerTimerAndProgressBindings() {
  const pauseCentralBlock = document.querySelector(".pause-central-block");

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindTimerControlsAndProgress) {
    console.error("[Bindings] timer-progress utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindTimerControlsAndProgress({
    documentRef: document,
    soundBtn,
    timerDisplay,
    progressBar,
    pauseCentralBlock,
    state,
    onToggleSound: toggleSound,
    onShowProgressBarContextMenu: (x, y) => showProgressBarContextMenu(x, y),
    onShowTimerContextMenu: (x, y) => showTimerContextMenu(x, y),
    onShowPauseCircleContextMenu: (x, y) => showPauseCircleContextMenu(x, y),
    onUpdateTimerDisplay: updateTimerDisplay,
  });
}

function registerMemoryOverlayButtonsBindings(input = {}) {
  const memoryOverlay = input.memoryOverlay || null;
  const memoryPeekBtn = input.memoryPeekBtn || null;
  const memoryRevealBtn = input.memoryRevealBtn || null;

  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindMemoryOverlayButtons) {
    console.error("[Bindings] memory-overlay utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindMemoryOverlayButtons({
    memoryOverlay,
    memoryPeekBtn,
    memoryRevealBtn,
    getRevealLabel: (isRevealed) =>
      isRevealed
        ? i18next.t("modes.memory.hide")
        : i18next.t("modes.memory.reveal"),
  });
}

function registerSessionSurfaceInteractionsBindings() {
  if (
    !SESSION_SURFACE_INTERACTIONS_BINDINGS_UTILS?.bindSessionSurfaceInteractions
  ) {
    console.error("[Bindings] session-surface-interactions utils unavailable.");
    return;
  }
  SESSION_SURFACE_INTERACTIONS_BINDINGS_UTILS.bindSessionSurfaceInteractions({
    documentRef: document,
    currentImage,
    memoryOverlay,
    state,
    onToggleSidebar: toggleSidebar,
    onNextImage: nextImage,
  });
}

function registerShuffleAndAutoFlipBindings() {
  if (!SESSION_CONTROLS_BINDINGS_UTILS?.bindShuffleAndAutoFlipButtons) {
    console.error("[Bindings] shuffle-autoflip utils unavailable.");
    return;
  }
  SESSION_CONTROLS_BINDINGS_UTILS.bindShuffleAndAutoFlipButtons({
    randomShuffleBtn,
    autoFlipBtn,
    state,
    onShuffleToggle: () => {
      if (state.originalImages.length > 0) {
        if (state.randomShuffle) {
          state.images = shuffleSessionMediaItems(state.originalImages);
        } else {
          state.images = [...state.originalImages];
        }
        imageCache.clear();
      }
    },
    onAutoFlipContextMenu: (x, y) => showFlipAnimationMenu(x, y),
  });
}

function registerImageContextMenuBindings() {
  if (!IMAGE_CONTEXT_MENU_BINDINGS_UTILS?.bindImageContextMenus) {
    console.error("[Bindings] image-context-menu utils unavailable.");
    return;
  }
  IMAGE_CONTEXT_MENU_BINDINGS_UTILS.bindImageContextMenus({
    targets: [currentImage, imageContainer],
    onOpenMenu: (x, y) => showImageContextMenu(x, y),
  });
}

function registerBackgroundScreenContextMenus() {
  const settingsScreenBody = document.getElementById("settings-screen");
  const reviewScreenBody = document.getElementById("review-screen");

  if (
    !SCREEN_CONTEXT_MENU_BINDINGS_UTILS?.bindMultipleScreenBackgroundContextMenus
  ) {
    console.error("[Bindings] screen-context-menu utils unavailable.");
    return;
  }
  SCREEN_CONTEXT_MENU_BINDINGS_UTILS.bindMultipleScreenBackgroundContextMenus({
    bindings: [
      {
        screenElement: settingsScreenBody,
        containerSelector: ".settings-container",
        onOpenMenu: (x, y) => showSettingsContextMenu(x, y),
      },
      {
        screenElement: reviewScreenBody,
        containerSelector: ".review-container",
        onOpenMenu: (x, y) => showSettingsContextMenu(x, y),
      },
    ],
  });
}

function handleKeyboardShortcuts(e) {
  if (!MAIN_KEYBOARD_SHORTCUTS_UTILS?.handleMainKeyboardShortcuts) return;
  try {
    MAIN_KEYBOARD_SHORTCUTS_UTILS.handleMainKeyboardShortcuts({
      event: e,
      documentRef: document,
      windowRef: window,
      drawingScreen,
      isDrawingModeActive:
        typeof isDrawingModeActive !== "undefined" && isDrawingModeActive,
      state,
      blurBtn,
      config: CONFIG,
      wasPlayingBeforeModal,
      startTimer,
      closeGlobalSettingsModal,
      toggleFlipHorizontal,
      togglePlayPause,
      showGridConfig,
      showSilhouetteConfig,
      showReview,
      deleteImage,
      applyImageFilters,
      updateSliderGradient,
      updateBlurAmount,
      previousImage,
      nextImage,
      toggleGrayscale,
      openDrawingMode: () => {
        void openDrawingModeSafely();
      },
      toggleSound,
      updateGridOverlay,
      toggleSidebar,
      toggleImageInfo,
      isTagsFeatureAvailable,
      openTagsModal: typeof openTagsModal === "function" ? openTagsModal : null,
      changeVideoSpeed,
      stepFrame,
      toggleVideoLoop,
      toggleVideoPlayPause,
      showVideoConfig,
    });
  } catch (error) {
    console.error("[Hotkeys] shared handler failed:", error);
  }
}

function handleSettingsScreenKeyboardShortcuts(e) {
  if (!SETTINGS_SHORTCUTS_UTILS?.handleSettingsScreenKeyboardShortcuts) return;
  try {
    SETTINGS_SHORTCUTS_UTILS.handleSettingsScreenKeyboardShortcuts({
      event: e,
      documentRef: document,
      settingsScreen,
      reviewScreen,
      startBtn,
      getTopOpenModal:
        typeof getTopOpenModal === "function" ? getTopOpenModal : null,
      onStart: () => {
        if (startBtn && !startBtn.disabled) {
          startBtn.click();
        }
      },
      onReturnHome: () => {
        if (reviewScreen) reviewScreen.classList.add("hidden");
        document.body.classList.remove("review-active");
        if (settingsScreen) settingsScreen.classList.remove("hidden");
      },
    });
  } catch (error) {
    console.error("[SettingsHotkeys] shared handler failed:", error);
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
  const runId = ++bootLoadImagesRunId;
  const loadStartMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  bootTrace(`loadImages#${runId}.start`);
  try {
    const folderInfoEl = folderInfo || document.getElementById("folder-info");
    if (!folderInfo && folderInfoEl) folderInfo = folderInfoEl;
    const startBtnEl = startBtn || document.getElementById("start-btn");
    if (!startBtn && startBtnEl) startBtn = startBtnEl;

    const resolveSelectionStartMs =
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const selection = await resolveSessionMediaSelection();
    bootTrace(`loadImages#${runId}.selectionResolved`, {
      source: selection?.source || "unknown",
      durationMs: Math.round(
        (typeof performance !== "undefined" &&
        typeof performance.now === "function"
          ? performance.now()
          : Date.now()) - resolveSelectionStartMs,
      ),
    });
    const items = Array.isArray(selection?.items) ? selection.items : [];
    const sourceMessage = i18next.t(
      getMediaSourceAnalyzedI18nKey(selection?.source === "all-items"),
    );

    state.images = filterSessionMediaItems(items);

    // Sauvegarder l'ordre original des images
    state.originalImages = [...state.images];

    // ========================================
    // OPTIMISATION: Réinitialiser le cache d'images
    // ========================================
    imageCache.clear();

    // Shuffle si activé
    if (state.randomShuffle && state.images.length > 0) {
      state.images = shuffleSessionMediaItems(state.images);
    }

    const appliedPendingPackOrder = applyPendingSyncSessionPackMediaOrder();
    if (appliedPendingPackOrder) {
      showSyncSessionToast({
        type: "success",
        message: getI18nText(
          "sync.sessionPackImportedPendingApplied",
          "Session pack media order applied.",
        ),
        duration: 1900,
      });
    }

    if (state.images.length === 0) {
      if (folderInfoEl) {
        folderInfoEl.innerHTML = `<span class="warning-text">${i18next.t("settings.noImagesFound")}</span>`;
      }
      updateStartButtonState();
    } else {
      // Compter séparément images et vidéos
      const mediaCounts = countSessionMediaTypes(state.images);
      const imageCount = mediaCounts.imageCount;
      const videoCount = mediaCounts.videoCount;
      const count = mediaCounts.totalCount;

      const countMessage = formatSessionMediaCountLabel({
        imageCount,
        videoCount,
      });

      if (folderInfoEl) {
        folderInfoEl.innerHTML = `
      <div class="folder-info-count">
        <span class="source-message-text">${sourceMessage}:</span>
        <span class="image-count-text">${countMessage}</span>
      </div>
    `;
      }
      updateStartButtonState();

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
    // ---- Widget multi-dossiers desktop ----
    if (isDesktopStandaloneRuntime()) {
      const folders = await platformFolderGetSelected();
      const perFolderStats = {};
      for (const img of state.images) {
        if (!img.folderId) continue;
        if (!perFolderStats[img.folderId])
          perFolderStats[img.folderId] = { images: 0, videos: 0 };
        if (isVideoFile(img)) perFolderStats[img.folderId].videos++;
        else perFolderStats[img.folderId].images++;
      }
      renderDesktopFolderSources(folders, perFolderStats);
    }

    if (isSyncSessionHostActive()) {
      scheduleSyncRuntimeState("media-loaded", {
        includeMediaOrder: true,
      });
    }
    bootTrace(`loadImages#${runId}.end`, {
      items: state.images.length,
      durationMs: Math.round(
        (typeof performance !== "undefined" &&
        typeof performance.now === "function"
          ? performance.now()
          : Date.now()) - loadStartMs,
      ),
    });
  } catch (e) {
    console.error("Erreur chargement:", e);
    bootTrace(`loadImages#${runId}.error`, String(e?.message || e));
    const folderInfoEl = folderInfo || document.getElementById("folder-info");
    if (folderInfoEl) {
      folderInfoEl.textContent = i18next.t("notifications.readError");
    }
  }
}

// LOGIQUE DE SESSION
function startSession() {
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    return;
  }
  if (state.images.length === 0) return;

  state.imagesSeen = [];
  state.imagesSeenMetaById = {};
  state.imagesCount = 0;
  state.totalSessionTime = 0;
  state.currentPoseTime = 0;
  state.sessionStartTime = Date.now();
  state.sessionWasOnline = isSyncSessionOnlineForHistory(syncSessionServiceState);

  // Réinitialiser les états spécifiques au mode mémoire
  state.memoryHidden = false;
  hideMemoryOverlay();

  if (state.sessionMode === "classique") {
    const {
      hours: h,
      minutes: m,
      seconds: s,
    } = readHmsInputValues(hoursInput, minutesInput, secondsInput);
    const activeBtn = document.querySelector(
      "#mode-classique-settings .duration-btn.active",
    );
    const activeDuration = getDurationFromButton(activeBtn, 0);
    state.selectedDuration = resolveClassicSessionDuration(
      h,
      m,
      s,
      activeDuration,
      state.selectedDuration,
    );
  }

  const sessionStart = resolveSessionModeStartState({
    sessionMode: state.sessionMode,
    selectedDuration: state.selectedDuration,
    customQueue: state.customQueue,
    memoryType: state.memoryType,
    memoryDuration: state.memoryDuration,
    memoryPosesCount: state.memoryPosesCount,
    imagesLength: state.images.length,
    clampMemoryPosesCount: clampMemorySessionPosesCount,
  });
  if (!sessionStart.isValid) return;

  state.selectedDuration = sessionStart.selectedDuration;
  state.timeRemaining = sessionStart.timeRemaining;
  state.currentStepIndex = sessionStart.currentStepIndex;
  state.currentPoseInStep = sessionStart.currentPoseInStep;
  state.memoryPosesCount = sessionStart.memoryPosesCount;
  state.memoryHidden = !!sessionStart.memoryHidden;
  // --------------------------------

  settingsScreen.classList.add("hidden");
  reviewScreen.classList.add("hidden");
  document.body.classList.remove("review-active");
  drawingScreen.classList.remove("hidden");

  // Re-mélanger les images à chaque nouvelle session si l'option est activée
  if (state.randomShuffle && state.images.length > 1) {
    state.images = shuffleSessionMediaItems(state.images);
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
  if (playPauseBtn) playPauseBtn.style.display = "flex";

  if (progressBar)
    progressBar.style.display = isRelax
      ? "none"
      : UIPreferences.get("showProgressBar", true)
        ? "block"
        : "none";

  SoundManager.unlockAudioContext();

  updateDisplay();
  startTimer();
  scheduleSyncRuntimeState("session-started", {
    includeMediaOrder: true,
    force: true,
  });
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
      maybeScheduleSyncRuntimeHeartbeat();
    }, 1000);
    return;
  }

  // --- LOGIQUE MODE CLASSIQUE / CUSTOM / MEMORY ---
  if (progressBar)
    progressBar.style.display = UIPreferences.get("showProgressBar", true)
      ? "block"
      : "none";
  state.timerInterval = setInterval(() => {
    if (!state.isPlaying) return;
    state.timeRemaining--;

    const isCustomPause = isCustomPauseTick(
      state.sessionMode,
      state.customQueue,
      state.currentStepIndex,
    );

    if (!isCustomPause) {
      state.totalSessionTime++;
      state.currentPoseTime++;
    }

    // LOGIQUE SPÉCIFIQUE MODE MÉMOIRE FLASH
    if (state.sessionMode === "memory" && state.memoryType === "flash") {
      if (
        shouldEnterMemoryHiddenPhaseTick({
          sessionMode: state.sessionMode,
          memoryType: state.memoryType,
          timeRemaining: state.timeRemaining,
          memoryHidden: state.memoryHidden,
        })
      ) {
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
      if (
        shouldAdvanceFromMemoryHiddenPhaseTick({
          sessionMode: state.sessionMode,
          memoryType: state.memoryType,
          timeRemaining: state.timeRemaining,
          memoryHidden: state.memoryHidden,
        })
      ) {
        stopTimer();
        // Attendre 1 seconde puis passer à l'image suivante
        setTimeout(() => {
          nextImage({ sessionSource: "auto" });
        }, 1000);
        return;
      }
    }

    if (state.soundEnabled) {
      const tickDecision = getTickSoundDecision({
        soundEnabled: state.soundEnabled,
        selectedDuration: state.selectedDuration,
        timeRemaining: state.timeRemaining,
        isCustomPause,
        thresholdOverride: UIPreferences.get(PREF_KEY_TICK_SOUND_THRESHOLD, 15),
      });
      if (tickDecision.playTick) {
        SoundManager.play("tick", { volume: tickDecision.volume });
      }
      if (
        shouldPlayEndSoundTick({
          soundEnabled: state.soundEnabled,
          timeRemaining: state.timeRemaining,
          sessionMode: state.sessionMode,
          memoryType: state.memoryType,
        })
      ) {
        SoundManager.play("end");
      }
    }

    updateTimerDisplay();
    applyImageFilters(); // Mettre à jour le flou progressif chaque seconde
    maybeScheduleSyncRuntimeHeartbeat();

    if (
      shouldAutoAdvanceOnTimerEndTick({
        timeRemaining: state.timeRemaining,
        sessionMode: state.sessionMode,
        memoryType: state.memoryType,
      })
    ) {
      stopTimer();
      setTimeout(() => {
        nextImage({ sessionSource: "auto" });
      }, 100);
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
  scheduleSyncRuntimeState("timer-stopped");
}

function ensureSeenMetaForImage(image) {
  if (!image || image.id === undefined || image.id === null) return;
  const key = String(image.id);
  if (
    !state.imagesSeenMetaById ||
    typeof state.imagesSeenMetaById !== "object"
  ) {
    state.imagesSeenMetaById = {};
  }
  if (!state.imagesSeenMetaById[key]) {
    state.imagesSeenMetaById[key] = { duration: 0 };
  }
}

function addCurrentPoseDurationToSeenMeta() {
  const image = state.images[state.currentIndex];
  if (!image || image.id === undefined || image.id === null) return;

  const elapsed = Math.max(0, Math.floor(Number(state.currentPoseTime) || 0));
  if (elapsed <= 0) return;

  ensureSeenMetaForImage(image);
  const key = String(image.id);
  state.imagesSeenMetaById[key].duration =
    (Number(state.imagesSeenMetaById[key].duration) || 0) + elapsed;
}

function finalizeCurrentPoseForReview() {
  addCurrentPoseDurationToSeenMeta();
  state.currentPoseTime = 0;
}

function getSeenImageDurationSeconds(image) {
  if (!image || image.id === undefined || image.id === null) return 0;
  const key = String(image.id);
  const raw = state.imagesSeenMetaById?.[key]?.duration;
  return Math.max(0, Math.floor(Number(raw) || 0));
}

function formatReviewDuration(seconds) {
  if (!SESSION_TIME_FORMAT_UTILS?.formatClockDuration) {
    logMissingShared("SESSION_TIME_FORMAT_UTILS.formatClockDuration");
    return "0:00";
  }
  return SESSION_TIME_FORMAT_UTILS.formatClockDuration(seconds);
}

function isReviewImageAnnotated(image) {
  if (!image || !image.filePath) return false;
  try {
    if (typeof window.hasSavedDrawingForImage === "function") {
      return !!window.hasSavedDrawingForImage(image);
    }
  } catch (_) {}

  const imageSrc = getRuntimeMediaSourceFromItem(image);
  try {
    if (
      typeof drawingStateCache !== "undefined" &&
      drawingStateCache?.has?.(imageSrc)
    ) {
      return true;
    }
  } catch (_) {}
  try {
    if (
      typeof zoomDrawingStateCache !== "undefined" &&
      zoomDrawingStateCache?.has?.(imageSrc)
    ) {
      return true;
    }
  } catch (_) {}

  return false;
}

function loadReviewDurationsVisibility() {
  return UIPreferences.get("reviewDurationsVisible", true) !== false;
}

function saveReviewDurationsVisibility(isVisible) {
  UIPreferences.set("reviewDurationsVisible", !!isVisible);
}

function ensureReviewDurationsVisibilityState() {
  if (typeof state.reviewDurationsVisible !== "boolean") {
    state.reviewDurationsVisible = loadReviewDurationsVisibility();
  }
}

function nextImage(options = null) {
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    return;
  }
  const sessionSource =
    options &&
    typeof options === "object" &&
    String(options.sessionSource || "").trim() === "auto"
      ? "auto"
      : "manual";
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

  finalizeCurrentPoseForReview();

  if (state.sessionMode === "custom") {
    handleCustomNext();
    return;
  }

  // 2. Logique pour les autres modes (Classique / Relax)
  if (state.sessionMode === "memory") {
    const memorySessionLimit = clampMemorySessionPosesCount(
      state.memoryPosesCount,
      state.images.length,
      1,
    );
    // L'image courante compte déjà comme une pose: si on atteint la limite, on termine.
    if (shouldEndMemorySessionAtIndex(state.currentIndex, memorySessionLimit)) {
      showReview();
      return;
    }

    state.currentIndex = state.currentIndex + 1;
    resetTransforms();

    state.timeRemaining = state.selectedDuration;

    updateFlipButtonUI();
    updateDisplay(false);
    startTimer();

    if (pauseBadge) pauseBadge.classList.add("hidden");
    if (timerDisplay) timerDisplay.classList.remove("timer-paused");

    const infoOverlay = document.getElementById("image-info-overlay");
    if (infoOverlay) {
      infoOverlay.remove();
      toggleImageInfo();
    }
    scheduleSyncRuntimeState(
      sessionSource === "manual" ? "image-next-manual" : "image-next-auto",
      { force: true },
    );
    return;
  }

  // Vérifier si on a vu toutes les images (pour aller au review screen)
  const nextIndex = getNextCyclicIndex(state.currentIndex, state.images.length);

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
  scheduleSyncRuntimeState(
    sessionSource === "manual" ? "image-next-manual" : "image-next-auto",
    { force: true },
  );
}

function nextPoseGroup() {
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    return;
  }
  // Passer au prochain groupe de poses (étape de type "pose")
  if (state.sessionMode !== "custom") return;

  const nextGroupIndex = findNextCustomPoseStepIndex(
    state.customQueue,
    state.currentStepIndex,
  );

  if (nextGroupIndex >= 0) {
    finalizeCurrentPoseForReview();
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
    scheduleSyncRuntimeState("custom-group-next", { force: true });
  }
}

function previousPoseGroup() {
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    return;
  }
  // Revenir au groupe de poses précédent (étape de type "pose")
  if (state.sessionMode !== "custom") return;

  const prevGroupIndex = findPrevCustomPoseStepIndex(
    state.customQueue,
    state.currentStepIndex,
  );

  if (prevGroupIndex >= 0) {
    finalizeCurrentPoseForReview();
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
    scheduleSyncRuntimeState("custom-group-prev", { force: true });
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
  const hasPrevGroup =
    state.sessionMode === "custom"
      ? hasPrevCustomPoseGroup(state.customQueue, state.currentStepIndex)
      : false;

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
  const hasNextGroup =
    state.sessionMode === "custom"
      ? hasNextCustomPoseGroup(state.customQueue, state.currentStepIndex)
      : false;

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
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    return;
  }
  // Fermer le mode dessin overlay si actif
  if (typeof isDrawingModeActive !== "undefined" && isDrawingModeActive) {
    if (typeof closeDrawingMode === "function") {
      closeDrawingMode();
    }
  }

  if (state.currentIndex <= 0) return;
  finalizeCurrentPoseForReview();
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
  scheduleSyncRuntimeState("image-prev-manual", { force: true });
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
  // applyImageFilters couvre déjà les transforms ET tous les filtres (grayscale, blur, silhouette)
  applyImageFilters();
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
  if (!SESSION_MEDIA_UTILS?.isVideoFile) {
    logMissingShared("SESSION_MEDIA_UTILS.isVideoFile");
    return false;
  }
  return SESSION_MEDIA_UTILS.isVideoFile(item, VIDEO_EXTENSIONS);
}

/**
 * Vérifie si l'item est un fichier GIF animé
 * @param {Object} item - Item Eagle avec propriété ext
 * @returns {boolean}
 */
function isGifFile(item) {
  if (!SESSION_MEDIA_UTILS?.isGifFile) {
    logMissingShared("SESSION_MEDIA_UTILS.isGifFile");
    return false;
  }
  return SESSION_MEDIA_UTILS.isGifFile(item);
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

function updateAnnotateButtonAvailability() {
  if (!annotateBtn) return;
  const disabled = !!state.isVideoFile || !!state.isGifFile;
  annotateBtn.classList.toggle("disabled", disabled);
  annotateBtn.setAttribute("aria-disabled", disabled ? "true" : "false");

  if (
    disabled &&
    typeof isDrawingModeActive !== "undefined" &&
    isDrawingModeActive &&
    typeof closeDrawingMode === "function"
  ) {
    closeDrawingMode();
  }
}

/**
 * Gère l'affichage du média (image ou vidéo)
 * @param {Object} media - Objet média depuis state.images
 * @param {boolean} shouldAnimateFlip - Si true, anime le flip
 */
function updateMediaElement(media, shouldAnimateFlip = false) {
  const isVideo = isVideoFile(media);
  const isGif = !isVideo && isGifFile(media);
  state.isVideoFile = isVideo;
  state.isGifFile = isGif;

  const abortAllMissing = () => {
    state.consecutiveSkipCount = 0;
    stopTimer();
    if (drawingScreen) drawingScreen.classList.add("hidden");
    if (reviewScreen) reviewScreen.classList.add("hidden");
    if (settingsScreen) settingsScreen.classList.remove("hidden");
    showPoseChronoToast({
      type: "error",
      message: i18next.t("settings.allMediaMissing"),
      duration: 4000,
    });
  };
  updateAnnotateButtonAvailability();

  if (isVideo) {
    // === AFFICHAGE VIDÉO ===
    currentImage.style.display = "none";
    currentVideo.style.display = "block";

    // Nettoyer et charger la vidéo
    currentVideo.src = getRuntimeMediaSourceFromItem(media);
    currentVideo.playbackRate = state.videoPlaybackRate;
    currentVideo.loop = state.videoLoop;
    currentVideo.muted = true; // Toujours muet (pas de son nécessaire)

    // Événements vidéo
    currentVideo.onloadedmetadata = () => {
      state.consecutiveSkipCount = 0;
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
      console.warn("[Plugin] Vidéo manquante/corrompue, passage à la suivante:", media.filePath);
      state.consecutiveSkipCount = (state.consecutiveSkipCount || 0) + 1;
      if (state.consecutiveSkipCount < state.images.length) {
        nextImage({ sessionSource: "auto" });
      } else {
        abortAllMissing();
      }
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
    currentImage.src = getRuntimeMediaSourceFromItem(media);

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

    currentImage.onerror = () => {
      console.warn("[Plugin] Image/GIF manquant(e)/corrompu(e), passage à la suivante:", media.filePath);
      state.consecutiveSkipCount = (state.consecutiveSkipCount || 0) + 1;
      if (state.consecutiveSkipCount < state.images.length) {
        nextImage({ sessionSource: "auto" });
      } else {
        abortAllMissing();
      }
    };

    if (currentImage.complete) {
      state.consecutiveSkipCount = 0;
      applyFiltersOnLoad();
      setTimeout(() => updateGridOverlay(), 100);
    } else {
      currentImage.onload = () => {
        state.consecutiveSkipCount = 0;
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

    const nextPoseStep = findNextCustomPoseStep(
      state.customQueue,
      state.currentStepIndex,
    );

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

    if (!state.imagesSeen.some((img) => img.id === image.id)) {
      state.imagesSeen.push(image);
    }
    ensureSeenMetaForImage(image);

    const displayTotal =
      state.sessionMode === "memory"
        ? clampMemorySessionPosesCount(
            state.memoryPosesCount,
            state.images.length,
            1,
          )
        : state.images.length;
    imageCounter.textContent = `${state.currentIndex + 1} / ${displayTotal}`;

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
        const customProgress = getCustomPoseSessionProgress(
          state.customQueue,
          state.currentStepIndex,
          state.currentPoseInStep || 1,
        );
        const totalPosesInSession = customProgress.totalPoses;
        const globalPoseIndex = customProgress.globalPoseIndex;
        const showGlobal = customProgress.showGlobal;

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
  applyGuestRestrictions();
  updateImageTransform();
  applyImageFilters();
}

function applyGuestRestrictions() {
  const allBtns = [stopBtn, settingsBtn, deleteBtn, prevBtn, nextBtn, playPauseBtn, revealBtn];
  
  const resetStyles = (el) => {
    if (!el) return;
    el.style.removeProperty("pointer-events");
    el.style.removeProperty("opacity");
    el.style.removeProperty("cursor");
  };

  const applyStyles = (el) => {
    if (!el) return;
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("opacity", "0.3", "important");
    el.style.setProperty("cursor", "not-allowed", "important");
  };

  if (!isSyncSessionParticipantActive()) {
    allBtns.forEach(resetStyles);
    return;
  }

  const controlMode = syncSessionServiceState?.controlMode || "host-only";
  let toDisable = [];

  if (controlMode === "host-only") {
    toDisable = [stopBtn, settingsBtn, deleteBtn, prevBtn, nextBtn, playPauseBtn, revealBtn];
  } else if (controlMode === "shared-pause") {
    // Keep play/pause enabled
    toDisable = [stopBtn, settingsBtn, deleteBtn, prevBtn, nextBtn, revealBtn];
  }

  allBtns.forEach(resetStyles);
  toDisable.forEach(applyStyles);
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

  const isGuest = isSyncSessionParticipantActive();
  const guestControlMode = isGuest ? (syncSessionServiceState?.controlMode || "host-only") : null;
  const isHostOnlyGuest = isGuest && guestControlMode === "host-only";

  const menuItems = [
    {
      text: state.isPlaying ? "Pause" : "Play",
      onClick: togglePlayPause,
      icon: state.isPlaying ? ICONS.PAUSE : ICONS.PLAY,
      shortcut: i18next.t("controls.spaceKey"),
      disabled: isHostOnlyGuest,
    },
    {
      text: i18next.t("drawing.nextImage"),
      onClick: nextImage,
      icon: ICONS.NEXT,
      shortcut: "→",
      disabled: isGuest,
    },
    {
      text: i18next.t("drawing.previousImage"),
      onClick: previousImage,
      icon: ICONS.PREV,
      shortcut: "←",
      visible: state.currentIndex > 0,
      disabled: isGuest,
    },

    "separator",

    {
      text: i18next.t("draw.annotate"),
      onClick: () => {
        void openDrawingModeSafely();
      },
      icon: ICON_DRAW,
      shortcut: CONFIG.HOTKEYS.DRAWING_TOOL_PENCIL.toUpperCase(),
      visible: !state.isVideoFile && !state.isGifFile,
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
      text: i18next.t(getRevealActionI18nKey()),
      onClick: revealImage,
      icon: ICONS.REVEAL,
      disabled: isHostOnlyGuest,
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
    createMenuItem(
      i18next.t(getRevealActionI18nKey()),
      revealImage,
      ICONS.REVEAL,
    ),
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
// SIDEBAR CUSTOMIZATION
// ================================================================

/**
 * Helpers de personnalisation de la sidebar:
 * ordre des boutons + visibilité.
 */
function normalizeSidebarButtonOrder(input) {
  const order = [];
  const seen = new Set();

  if (Array.isArray(input)) {
    input.forEach((entry) => {
      if (typeof entry !== "string") return;
      const id = entry.trim();
      if (!id || seen.has(id) || !SIDEBAR_CONFIGURABLE_BUTTON_IDS.has(id)) {
        return;
      }
      seen.add(id);
      order.push(id);
    });
  }

  SIDEBAR_DEFAULT_BUTTON_ORDER.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
  });

  return order;
}

function areStringArraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function getSidebarButtonOrder() {
  const rawOrder = UIPreferences.getStringArray
    ? UIPreferences.getStringArray(PREF_KEY_SIDEBAR_BUTTON_ORDER)
    : [];
  const normalized = normalizeSidebarButtonOrder(rawOrder);

  if (
    UIPreferences.setStringArray &&
    !areStringArraysEqual(rawOrder, normalized)
  ) {
    UIPreferences.setStringArray(PREF_KEY_SIDEBAR_BUTTON_ORDER, normalized);
  }

  return normalized;
}

function setSidebarButtonOrder(order) {
  const normalized = normalizeSidebarButtonOrder(order);
  if (UIPreferences.setStringArray) {
    UIPreferences.setStringArray(PREF_KEY_SIDEBAR_BUTTON_ORDER, normalized);
  }
  return normalized;
}

function reorderSidebarButtonsInSection(sectionEl, orderedIds, beforeEl = null) {
  if (!sectionEl || !Array.isArray(orderedIds)) return;
  orderedIds.forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    if (beforeEl) {
      sectionEl.insertBefore(button, beforeEl);
    } else {
      sectionEl.appendChild(button);
    }
  });
}

function ensureProgressiveBlurSidebarDefaultHidden() {
  if (
    !UIPreferences.get ||
    !UIPreferences.set ||
    !UIPreferences.getStringArray ||
    !UIPreferences.setStringArray
  ) {
    return;
  }
  const alreadyMigrated = !!UIPreferences.get(
    PREF_KEY_SIDEBAR_PROGRESSIVE_BLUR_HIDDEN_MIGRATED,
    false,
  );
  if (alreadyMigrated) return;

  const hidden = UIPreferences.getStringArray(PREF_KEY_SIDEBAR_HIDDEN_BUTTONS);
  if (!hidden.includes("progressive-blur-btn")) {
    UIPreferences.setStringArray(PREF_KEY_SIDEBAR_HIDDEN_BUTTONS, [
      ...hidden,
      "progressive-blur-btn",
    ]);
  }
  UIPreferences.set(PREF_KEY_SIDEBAR_PROGRESSIVE_BLUR_HIDDEN_MIGRATED, true);
}

function ensureProgressiveBlurSidebarDefaultOrder() {
  if (
    !UIPreferences.get ||
    !UIPreferences.set ||
    !UIPreferences.getStringArray ||
    !UIPreferences.setStringArray
  ) {
    return;
  }
  const alreadyMigrated = !!UIPreferences.get(
    PREF_KEY_SIDEBAR_PROGRESSIVE_BLUR_ORDER_MIGRATED,
    false,
  );
  if (alreadyMigrated) return;

  const currentOrder = normalizeSidebarButtonOrder(
    UIPreferences.getStringArray(PREF_KEY_SIDEBAR_BUTTON_ORDER),
  );
  const withoutProgressive = currentOrder.filter(
    (id) => id !== "progressive-blur-btn",
  );
  const blurIndex = withoutProgressive.indexOf("blur-btn");

  if (blurIndex >= 0) {
    withoutProgressive.splice(blurIndex + 1, 0, "progressive-blur-btn");
  } else {
    withoutProgressive.push("progressive-blur-btn");
  }

  UIPreferences.setStringArray(
    PREF_KEY_SIDEBAR_BUTTON_ORDER,
    normalizeSidebarButtonOrder(withoutProgressive),
  );
  UIPreferences.set(PREF_KEY_SIDEBAR_PROGRESSIVE_BLUR_ORDER_MIGRATED, true);
}

function applySidebarButtonOrder() {
  const order = getSidebarButtonOrder();
  const grouped = {
    standalone: [],
    filters: [],
    actions: [],
    secondary: [],
  };

  order.forEach((id) => {
    const cfg = SIDEBAR_CONFIGURABLE_BUTTONS_BY_ID[id];
    const group = cfg?.group;
    if (!grouped[group]) return;
    grouped[group].push(id);
  });

  const sidebarRoot = document.querySelector(".sidebar");
  const controlsSection = sidebarRoot?.querySelector(".controls-section") || null;
  reorderSidebarButtonsInSection(
    sidebarRoot,
    grouped.standalone,
    controlsSection,
  );

  const transformSection = document.querySelector(".transform-controls");
  const actionsDivider = document.getElementById("transform-actions-divider");
  reorderSidebarButtonsInSection(
    transformSection,
    grouped.filters,
    actionsDivider,
  );
  if (transformSection && actionsDivider) {
    const firstActionButton = grouped.actions
      .map((id) => document.getElementById(id))
      .find((el) => !!el);
    if (firstActionButton) {
      transformSection.insertBefore(actionsDivider, firstActionButton);
    } else {
      transformSection.appendChild(actionsDivider);
    }
  }
  reorderSidebarButtonsInSection(transformSection, grouped.actions);

  const secondarySection = document.querySelector(".secondary-controls");
  reorderSidebarButtonsInSection(secondarySection, grouped.secondary);
}

function applySidebarVisibility() {
  ensureProgressiveBlurSidebarDefaultHidden();
  ensureProgressiveBlurSidebarDefaultOrder();
  applySidebarButtonOrder();

  const hidden = UIPreferences.getStringArray
    ? UIPreferences.getStringArray(PREF_KEY_SIDEBAR_HIDDEN_BUTTONS)
    : [];

  SIDEBAR_CONFIGURABLE_BUTTONS.forEach(({ id }) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle("sb-btn-hidden", hidden.includes(id));
  });

  // Divider entre groupe "filters" et groupe "actions"
  const divider = document.getElementById("transform-actions-divider");
  if (divider) {
    const filtersGroup = [
      "flip-horizontal-btn",
      "flip-vertical-btn",
      "grayscale-btn",
      "blur-btn",
      "progressive-blur-btn",
      "annotate-btn",
      "grid-btn",
      "silhouette-btn",
    ];
    const actionsGroup = ["reveal-btn", "delete-btn"];
    const anyFiltersVisible = filtersGroup.some((id) => !hidden.includes(id));
    const anyActionsVisible = actionsGroup.some((id) => !hidden.includes(id));
    divider.classList.toggle(
      "sb-btn-hidden",
      !anyFiltersVisible || !anyActionsVisible,
    );
  }

  // Section transform-controls: caché si tous ses boutons masquables sont masqués
  const transformSection = document.querySelector(".transform-controls");
  if (transformSection) {
    const transformIds = [
      "flip-horizontal-btn",
      "flip-vertical-btn",
      "grayscale-btn",
      "blur-btn",
      "progressive-blur-btn",
      "annotate-btn",
      "grid-btn",
      "silhouette-btn",
      "reveal-btn",
      "delete-btn",
    ];
    const anyTransformVisible = transformIds.some((id) => !hidden.includes(id));
    transformSection.classList.toggle("sb-btn-hidden", !anyTransformVisible);
  }

  // Section secondary-controls: caché si stop ET settings sont masqués
  const secondarySection = document.querySelector(".secondary-controls");
  if (secondarySection) {
    const anySecondaryVisible =
      !hidden.includes("stop-btn") || !hidden.includes("settings-btn");
    secondarySection.classList.toggle("sb-btn-hidden", !anySecondaryVisible);
  }
}

/**
 * Affiche un mini menu contextuel pour la sidebar.
 */
function showSidebarContextMenu(x, y) {
  closeAllContextMenus();

  const menu = document.createElement("div");
  menu.id = "sidebar-context-menu";
  menu.className = "context-menu";

  const item = document.createElement("div");
  item.className = "context-menu-item";
  item.innerHTML = `<span class="context-menu-item-icon">${ICONS.SIDEBAR}</span><span class="context-menu-text">${i18next.t("sidebar.config.openMenu", { defaultValue: "Régler la barre latérale" })}</span>`;
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    showSidebarConfigModal();
  });
  menu.appendChild(item);

  adjustMenuPosition(menu, x, y);
}

/**
 * Affiche le modal de configuration de la barre latérale (masquer/afficher boutons).
 */
function showSidebarConfigModal() {
  closeAllContextMenus();

  const existing = document.getElementById("sidebar-config-popup");
  if (existing) {
    existing.remove();
    return;
  }

  ensureProgressiveBlurSidebarDefaultHidden();

  const hidden = UIPreferences.getStringArray
    ? UIPreferences.getStringArray(PREF_KEY_SIDEBAR_HIDDEN_BUTTONS)
    : [];

  const t = (key, fb) => i18next.t(key, { defaultValue: fb });

  const groups = [
    {
      key: "standalone",
      label: null,
      ids: ["sound-btn"],
    },
    {
      key: "filters",
      label: t("sidebar.config.groupFilters", "Filtres"),
      ids: [
        "flip-horizontal-btn",
        "flip-vertical-btn",
        "grayscale-btn",
        "blur-btn",
        "progressive-blur-btn",
        "annotate-btn",
        "grid-btn",
        "silhouette-btn",
      ],
    },
    {
      key: "actions",
      label: t("sidebar.config.groupActions", "Action sur le fichier"),
      ids: ["reveal-btn", "delete-btn"],
    },
    {
      key: "secondary",
      label: t("sidebar.config.groupSecondary", "Session"),
      ids: ["stop-btn", "settings-btn"],
    },
  ];

  const DEFAULT_HIDDEN = [
    "grid-btn",
    "silhouette-btn",
    "progressive-blur-btn",
  ];
  const getHidden = () =>
    UIPreferences.getStringArray
      ? UIPreferences.getStringArray(PREF_KEY_SIDEBAR_HIDDEN_BUTTONS)
      : [];

  const SVG_EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>`;
  const SVG_EYE_OFF = `<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"/></svg>`;

  let sidebarOrder = getSidebarButtonOrder();
  let orderIndexMap = new Map(sidebarOrder.map((id, index) => [id, index]));

  const refreshOrderIndexMap = () => {
    orderIndexMap = new Map(sidebarOrder.map((id, index) => [id, index]));
  };

  const moveSidebarOrder = (sourceId, targetId, placeAfter) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const next = sidebarOrder.filter((id) => id !== sourceId);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex < 0) return;
    next.splice(targetIndex + (placeAfter ? 1 : 0), 0, sourceId);
    sidebarOrder = setSidebarButtonOrder(next);
    refreshOrderIndexMap();
    applySidebarVisibility();
  };

  const popup = document.createElement("div");
  popup.id = "sidebar-config-popup";
  popup.className = "sidebar-config-popup";

  const headerEl = document.createElement("div");
  headerEl.className = "sidebar-config-header";
  headerEl.innerHTML = `
    <div class="sidebar-config-title-wrap">
      <span class="sidebar-config-title-icon">${ICONS.SIDEBAR}</span>
      <h3 class="sidebar-config-title">${t("sidebar.config.title", "Barre latérale")}</h3>
    </div>
    <button type="button" class="sidebar-config-close modal-close-btn" aria-label="${t("sidebar.config.close", "Close")}">
      ${ICONS.CLOSE || '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'}
    </button>
  `;

  const bodyEl = document.createElement("div");
  bodyEl.className = "sidebar-config-body";

  // Map id → item element for reset sync
  const itemEls = {};
  let draggedItemEl = null;

  const clearModalDragClasses = () => {
    bodyEl.querySelectorAll(".sidebar-config-item").forEach((el) => {
      el.classList.remove("dragging", "drop-target-above", "drop-target-below");
    });
  };

  const reorderConfigModalItems = () => {
    bodyEl.querySelectorAll(".sidebar-config-group").forEach((groupEl) => {
      const items = Array.from(
        groupEl.querySelectorAll(".sidebar-config-item[data-btn-id]"),
      );
      items
        .sort(
          (a, b) =>
            (orderIndexMap.get(a.dataset.btnId) ?? Number.MAX_SAFE_INTEGER) -
            (orderIndexMap.get(b.dataset.btnId) ?? Number.MAX_SAFE_INTEGER),
        )
        .forEach((item) => groupEl.appendChild(item));
    });
  };

  groups.forEach(({ label, ids }) => {
    const groupEl = document.createElement("div");
    groupEl.className = "sidebar-config-group";

    if (label) {
      const titleEl = document.createElement("div");
      titleEl.className = "sidebar-config-group-title";
      titleEl.textContent = label;
      groupEl.appendChild(titleEl);
    }

    const orderedIds = ids
      .filter((id) => !!SIDEBAR_CONFIGURABLE_BUTTONS_BY_ID[id])
      .sort(
        (a, b) =>
          (orderIndexMap.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndexMap.get(b) ?? Number.MAX_SAFE_INTEGER),
      );

    orderedIds.forEach((id) => {
      const cfg = SIDEBAR_CONFIGURABLE_BUTTONS_BY_ID[id];
      if (!cfg) return;

      const isHidden = hidden.includes(id);
      const domBtn = document.getElementById(id);
      const btnSvg =
        id === "stop-btn"
          ? '<span class="stop-square sidebar-config-stop-square" aria-hidden="true"></span>'
          : domBtn?.querySelector("svg")?.outerHTML || "";

      const itemEl = document.createElement("div");
      itemEl.className =
        "sidebar-config-item" + (isHidden ? " sidebar-config-item--hidden" : "");
      itemEl.dataset.btnId = id;
      itemEl.dataset.groupKey = cfg.group;

      const dragHandleEl = document.createElement("span");
      dragHandleEl.className = "sidebar-config-drag-handle";
      dragHandleEl.textContent = "⋮⋮";
      dragHandleEl.draggable = true;
      dragHandleEl.setAttribute(
        "data-tooltip",
        t("sidebar.config.reorderHint", "Glisser pour réordonner"),
      );
      dragHandleEl.removeAttribute("title");
      dragHandleEl.addEventListener("click", (e) => e.stopPropagation());
      dragHandleEl.addEventListener("mousedown", (e) => e.stopPropagation());
      dragHandleEl.addEventListener("dragstart", (e) => {
        draggedItemEl = itemEl;
        itemEl.classList.add("dragging");
        bodyEl.classList.add("sidebar-config-body--dragging");
        clearModalDragClasses();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      });
      dragHandleEl.addEventListener("dragend", () => {
        draggedItemEl = null;
        bodyEl.classList.remove("sidebar-config-body--dragging");
        clearModalDragClasses();
      });

      const btnIconEl = document.createElement("span");
      btnIconEl.className = "sidebar-config-btn-icon";
      btnIconEl.innerHTML = btnSvg;

      const labelEl = document.createElement("span");
      labelEl.className = "sidebar-config-item-label";
      labelEl.textContent = t(cfg.i18nKey, cfg.fallback);

      const eyeEl = document.createElement("span");
      eyeEl.className = "sidebar-config-eye";
      eyeEl.innerHTML = isHidden ? SVG_EYE_OFF : SVG_EYE_OPEN;

      itemEl.appendChild(dragHandleEl);
      itemEl.appendChild(btnIconEl);
      itemEl.appendChild(labelEl);
      itemEl.appendChild(eyeEl);

      itemEl.addEventListener("dragover", (e) => {
        if (!draggedItemEl || draggedItemEl === itemEl) return;
        if (draggedItemEl.dataset.groupKey !== itemEl.dataset.groupKey) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        const rect = itemEl.getBoundingClientRect();
        const dropAfter = e.clientY - rect.top > rect.height / 2;
        itemEl.classList.toggle("drop-target-above", !dropAfter);
        itemEl.classList.toggle("drop-target-below", dropAfter);
      });

      itemEl.addEventListener("dragleave", () => {
        itemEl.classList.remove("drop-target-above", "drop-target-below");
      });

      itemEl.addEventListener("drop", (e) => {
        if (!draggedItemEl || draggedItemEl === itemEl) return;
        if (draggedItemEl.dataset.groupKey !== itemEl.dataset.groupKey) return;
        e.preventDefault();

        const sourceId = draggedItemEl.dataset.btnId;
        const targetId = itemEl.dataset.btnId;
        if (!sourceId || !targetId) return;

        const rect = itemEl.getBoundingClientRect();
        const dropAfter = e.clientY - rect.top > rect.height / 2;

        if (dropAfter) {
          itemEl.after(draggedItemEl);
        } else {
          itemEl.before(draggedItemEl);
        }

        moveSidebarOrder(sourceId, targetId, dropAfter);
        clearModalDragClasses();
      });

      itemEl.addEventListener("click", () => {
        if (draggedItemEl) return;
        const current = getHidden();
        const nowHidden = current.includes(id);
        const next = nowHidden
          ? current.filter((v) => v !== id)
          : [...current, id];
        if (UIPreferences.setStringArray) {
          UIPreferences.setStringArray(PREF_KEY_SIDEBAR_HIDDEN_BUTTONS, next);
        }
        applySidebarVisibility();
        const visible = !next.includes(id);
        itemEl.classList.toggle("sidebar-config-item--hidden", !visible);
        eyeEl.innerHTML = visible ? SVG_EYE_OPEN : SVG_EYE_OFF;
      });

      itemEls[id] = { el: itemEl, eyeEl };
      groupEl.appendChild(itemEl);
    });

    bodyEl.appendChild(groupEl);
  });

  const footerEl = document.createElement("div");
  footerEl.className = "sidebar-config-footer";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.id = "sidebar-config-reset-btn";
  resetBtn.textContent = t("sidebar.config.resetBtn", "Réinitialiser");
  resetBtn.addEventListener("click", () => {
    if (UIPreferences.setStringArray) {
      UIPreferences.setStringArray(
        PREF_KEY_SIDEBAR_HIDDEN_BUTTONS,
        DEFAULT_HIDDEN,
      );
    }
    sidebarOrder = setSidebarButtonOrder(SIDEBAR_DEFAULT_BUTTON_ORDER);
    refreshOrderIndexMap();
    reorderConfigModalItems();
    applySidebarVisibility();
    Object.entries(itemEls).forEach(([btnId, { el, eyeEl }]) => {
      const isHidden = DEFAULT_HIDDEN.includes(btnId);
      el.classList.toggle("sidebar-config-item--hidden", isHidden);
      eyeEl.innerHTML = isHidden ? SVG_EYE_OFF : SVG_EYE_OPEN;
    });
  });
  footerEl.appendChild(resetBtn);

  popup.appendChild(headerEl);
  popup.appendChild(bodyEl);
  popup.appendChild(footerEl);
  document.body.appendChild(popup);

  // Fermer via le bouton X
  const closeBtn = popup.querySelector(".sidebar-config-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => popup.remove());
  }

  // Fermer via Escape
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      popup.remove();
      document.removeEventListener("keydown", handleEscape, true);
    }
  };
  document.addEventListener("keydown", handleEscape, true);
  popup.addEventListener("remove", () =>
    document.removeEventListener("keydown", handleEscape, true),
  );

  // Drag sur le header
  let isDragging = false,
    dragStartX = 0,
    dragStartY = 0,
    popupStartX = 0,
    popupStartY = 0;
  const rect = popup.getBoundingClientRect();
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";

  headerEl.style.cursor = "move";
  headerEl.style.userSelect = "none";

  headerEl.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    isDragging = true;
    const r = popup.getBoundingClientRect();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    popupStartX = r.left;
    popupStartY = r.top;
    popup.style.transform = "none";
    popup.style.left = r.left + "px";
    popup.style.top = r.top + "px";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    popup.style.left = popupStartX + e.clientX - dragStartX + "px";
    popup.style.top = popupStartY + e.clientY - dragStartY + "px";
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
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
 * Affiche le menu contextuel de la silhouette (luminosité + inversion)
 */
function showSilhouetteContextMenu(x, y) {
  const menu = document.createElement("div");
  menu.className = "context-menu silhouette-ctx-menu";
  menu.innerHTML = `
    <div class="silhouette-ctx-section">
      <div class="silhouette-ctx-row">
        <span>${i18next.t("filters.brightness")}</span>
        <span class="silhouette-ctx-brightness-val">${state.silhouetteBrightness.toFixed(2)}</span>
      </div>
      <input type="range" class="threshold-slider silhouette-ctx-slider" min="0" max="6" step="0.01" value="${state.silhouetteBrightness}">
      <div class="silhouette-ctx-markers">
        <span>0</span>
        <span>3</span>
        <span>6</span>
      </div>
    </div>
    <div class="silhouette-ctx-divider"></div>
    <div class="silhouette-ctx-row silhouette-ctx-invert-row">
      <span>${i18next.t("filters.invertColors")}</span>
      <label class="silhouette-switch">
        <input type="checkbox" class="silhouette-ctx-invert-cb" ${state.silhouetteInvert ? "checked" : ""}>
        <span class="silhouette-slider"></span>
      </label>
    </div>
  `;

  document.body.appendChild(menu);
  adjustMenuPosition(menu, x, y);
  menu.addEventListener("click", (e) => e.stopPropagation());
  menu.addEventListener("mousedown", (e) => e.stopPropagation());

  const slider = menu.querySelector(".silhouette-ctx-slider");
  const brightnessVal = menu.querySelector(".silhouette-ctx-brightness-val");
  const invertCb = menu.querySelector(".silhouette-ctx-invert-cb");

  initSliderWithGradient(slider);

  slider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    brightnessVal.textContent = value.toFixed(2);
    state.silhouetteBrightness = value;
    updateSliderGradient(slider);
    applyImageFilters();
    if (window.updateZoomContent && window.zoomFilters?.silhouette) {
      window.updateZoomContent();
    }
  });

  const applyInvertToggle = (checked) => {
    state.silhouetteInvert = !!checked;
    applyImageFilters();
    if (window.updateZoomContent && window.zoomFilters?.silhouette) {
      window.updateZoomContent();
    }
  };

  invertCb.addEventListener("input", (e) => {
    applyInvertToggle(e.target.checked);
  });

  invertCb.addEventListener("change", (e) => {
    applyInvertToggle(e.target.checked);
  });

  let leaveTimer;
  menu.addEventListener("mouseleave", () => {
    leaveTimer = setTimeout(() => menu.remove(), 300);
  });
  menu.addEventListener("mouseenter", () => {
    clearTimeout(leaveTimer);
  });
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
  document.querySelectorAll(".context-menu").forEach((menu) => menu.remove());
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
  checkbox.className = "context-menu-checkbox checkbox-simple";

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
// ================================================================
// DESKTOP MULTI-SOURCES WIDGET
// ================================================================

let desktopSourcesExpanded = false;

function renderDesktopFolderSources(folders, perFolderStats) {
  const widget = document.getElementById("desktop-sources-widget");
  const folderInfoRow = document.getElementById("folder-info-row");
  const chooseBtn = document.getElementById("choose-media-folder-btn");
  if (!widget) return;

  // Afficher le widget, masquer la ligne classique
  widget.classList.remove("hidden");
  if (folderInfoRow) folderInfoRow.style.display = "none";
  if (chooseBtn) chooseBtn.style.display = "none";

  const summaryEl = document.getElementById("desktop-sources-summary");
  const listEl = document.getElementById("desktop-sources-list");
  const toggleBtn = document.getElementById("desktop-sources-toggle");

  // ---- Résumé ----
  if (summaryEl) {
    if (!folders || folders.length === 0) {
      summaryEl.textContent = i18next.t(
        "controls.selectMediaFolder",
        "Choisir un dossier source",
      );
    } else {
      const totalImages = state.images.filter(
        (img) => !isVideoFile(img),
      ).length;
      const totalVideos = state.images.filter((img) => isVideoFile(img)).length;
      const folderWord =
        folders.length > 1
          ? i18next.t("settings.foldersLabel", { defaultValue: "dossiers" })
          : i18next.t("settings.folderLabel", { defaultValue: "dossier" });
      const parts = [`${folders.length} ${folderWord}`];
      if (totalImages > 0) parts.push(`${totalImages} img`);
      if (totalVideos > 0) parts.push(`${totalVideos} vid`);
      summaryEl.textContent = parts.join(" • ");
    }
  }

  // ---- Liste déroulante ----
  if (listEl) {
    if (!folders || folders.length === 0) {
      listEl.innerHTML = `<div class="desktop-sources-empty">${i18next.t("settings.noFoldersConfigured", { defaultValue: "Aucun dossier configuré" })}</div>`;
    } else {
      listEl.innerHTML = folders
        .map((folder) => {
          const stats = perFolderStats?.[folder.id] || { images: 0, videos: 0 };
          const countParts = [];
          if (stats.images > 0) countParts.push(`${stats.images} img`);
          if (stats.videos > 0) countParts.push(`${stats.videos} vid`);
          if (countParts.length === 0)
            countParts.push(
              i18next.t("settings.zeroMedia", { defaultValue: "0 média" }),
            );
          const countStr = countParts.join(", ");
          const parentPath = escapeHtml(
            folder.path.replace(/[/\\][^/\\]+$/, "") || folder.path,
          );
          return `
            <div class="desktop-source-item">
              <span class="desktop-source-item-icon">
                <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Z"/></svg>
              </span>
              <div class="desktop-source-item-info">
                <span class="desktop-source-item-name">${escapeHtml(folder.name)}</span>
                <span class="desktop-source-item-path">${parentPath}</span>
              </div>
              <span class="desktop-source-item-count">${escapeHtml(countStr)}</span>
              <button
                type="button"
                class="desktop-source-remove-btn"
                data-folder-id="${escapeHtml(folder.id)}"
                aria-label="${i18next.t("settings.removeSourceFolder", { defaultValue: "Supprimer ce dossier" })}"
                data-tooltip="${i18next.t("settings.removeSourceFolder", { defaultValue: "Supprimer ce dossier" })}"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
              </button>
            </div>`;
        })
        .join("");

      // Attacher les handlers de suppression
      listEl.querySelectorAll(".desktop-source-remove-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const fid = btn.dataset.folderId;
          if (fid) removeDesktopMediaFolder(fid);
        });
      });
    }

    // Appliquer l'état expand/collapse
    if (desktopSourcesExpanded) {
      listEl.hidden = false;
      widget.classList.add("expanded");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
    } else {
      listEl.hidden = true;
      widget.classList.remove("expanded");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
    }
  }

  // Attacher le toggle (une seule fois via dataset flag)
  if (toggleBtn && !toggleBtn.dataset.sourcesToggleBound) {
    toggleBtn.dataset.sourcesToggleBound = "1";
    toggleBtn.addEventListener("click", () => {
      desktopSourcesExpanded = !desktopSourcesExpanded;
      if (listEl) listEl.hidden = !desktopSourcesExpanded;
      widget.classList.toggle("expanded", desktopSourcesExpanded);
      toggleBtn.setAttribute("aria-expanded", String(desktopSourcesExpanded));
    });
  }

  // Attacher le bouton Ajouter (une seule fois)
  const addBtn = document.getElementById("desktop-sources-add-btn");
  if (addBtn && !addBtn.dataset.sourcesAddBound) {
    addBtn.dataset.sourcesAddBound = "1";
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectDesktopMediaFolders();
    });
  }
}

async function selectDesktopMediaFolders() {
  if (!isDesktopStandaloneRuntime()) return false;
  const folders = await platformFolderBrowseAndAdd();
  if (!folders) return false;
  await loadImages();
  return true;
}

async function removeDesktopMediaFolder(folderId) {
  if (!isDesktopStandaloneRuntime()) return;
  await platformFolderRemove(folderId);
  await loadImages();
}

function showSettingsContextMenu(x, y) {
  const isGridEnabled = document.body.classList.contains("grid-enabled");

  // Helper pour obtenir les traductions avec fallback
  const t = createI18nTextGetter(true);

  const items = [
    {
      text: t("controls.appearance", "Apparence"),
      label: true,
    },
    {
      text: isGridEnabled
        ? t("controls.hideGrid", "Masquer la grille de fond")
        : t("controls.showGrid", "Afficher la grille de fond"),
      icon: ICONS.GRID_TOGGLE,
      active: isGridEnabled,
      onClick: () => {
        setBackgroundGridEnabled(!isGridEnabled, true);
      },
    },
    {
      text: t("controls.changeTheme", "Changer de thème"),
      icon: ICONS.THEME,
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
        platformPreferenceSet("theme", nextTheme).catch(() => {});
      },
    },
    "separator",
    {
      text: t("controls.configuration", "Configuration"),
      label: true,
    },
    {
      text: t("settings.global.title", "Global settings"),
      icon: ICONS.SETTINGS,
      onClick: () => {
        openGlobalSettingsModal();
      },
    },
    {
      text: t("hotkeys.configure", "Configurer les raccourcis clavier"),
      icon: ICONS.KEYBOARD,
      onClick: () => {
        showHotkeysModal();
      },
    },
  ];

  buildContextMenu("settings-context-menu", items, x, y);
}

// ================================================================
// MODAL DES RACCOURCIS CLAVIER
// ================================================================

/**
 * Raccourcis ayant un modificateur implicite non encodé dans la valeur config.
 * Par ex. DRAWING_EXPORT vaut "s" mais est déclenché par Ctrl+S dans draw.js.
 */
const HOTKEY_IMPLICIT_MODIFIERS = {
  DRAWING_EXPORT: "Ctrl",
};

/**
 * Formate la valeur d'un raccourci pour l'affichage humain.
 * - Lettre majuscule seule (A-Z) → "Shift + X"
 * - Raccourci avec modificateur implicite (ex: DRAWING_EXPORT) → "Ctrl + S"
 * - Combinaisons explicites (Ctrl+Alt+S) → affichées telles quelles avec " + "
 */
function formatHotkeyDisplay(hotkeyName, value) {
  const hotkeysUtils = getHotkeysUtils();
  if (!hotkeysUtils?.formatHotkeyDisplay) {
    logMissingShared("HOTKEYS_UTILS.formatHotkeyDisplay");
    return value ? String(value) : "";
  }
  return hotkeysUtils.formatHotkeyDisplay(hotkeyName, value, {
    implicitModifiers: HOTKEY_IMPLICIT_MODIFIERS,
  });
}

/**
 * Structure des catégories de raccourcis clavier
 */
const HOTKEY_CATEGORIES = {
  general: [
    "FLIP_H",
    "GRAYSCALE",
    "BLUR",
    "MUTE",
    "GRID",
    "GRID_MODAL",
    "SIDEBAR",
    "INFO",
    "SILHOUETTE",
    "SILHOUETTE_MODAL",
    "THEME",
    "ANNOTATE",
    "TAGS",
  ],
  drawing: [
    "DRAWING_EXPORT",
    "DRAWING_LIGHTBOX",
    "DRAWING_ROTATE_SHAPE",
    "DRAWING_SIZE_DECREASE",
    "DRAWING_SIZE_INCREASE",
    "DRAWING_TOOL_PENCIL",
    "DRAWING_TOOL_ERASER",
    "DRAWING_TOOL_RECTANGLE",
    "DRAWING_TOOL_CIRCLE",
    "DRAWING_TOOL_LINE",
    "DRAWING_TOOL_ARROW",
    "DRAWING_TOOL_MEASURE",
    "DRAWING_TOOL_CALIBRATE",
    "DRAWING_TOOL_LASER",
    "DRAWING_TOOL_PROTRACTOR",
  ],
  video: [
    "VIDEO_SLOWER",
    "VIDEO_FASTER",
    "VIDEO_PREV_FRAME",
    "VIDEO_NEXT_FRAME",
    "VIDEO_LOOP",
    "VIDEO_CONFIG",
  ],
};

const NON_CUSTOMIZABLE_HOTKEYS = new Set(["DRAWING_CLOSE"]);

/**
 * Dialog de confirmation stylée (réutilisable dans le plugin + timeline).
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} options.confirmText
 * @param {string} options.cancelText
 * @param {string} [options.checkboxLabel]
 * @param {boolean} [options.checkboxChecked]
 * @param {HTMLElement} [options.container]
 * @returns {Promise<{confirmed: boolean, checkboxChecked: boolean}>}
 */
let poseChronoConfirmDialogQueue = Promise.resolve();
let poseChronoConfirmDialogCounter = 0;
const poseChronoUndoTimers = new Map();

function enqueuePoseChronoDialog(openDialog) {
  const resultPromise = poseChronoConfirmDialogQueue.then(() => openDialog());
  poseChronoConfirmDialogQueue = resultPromise
    .then(() => undefined)
    .catch(() => undefined);
  return resultPromise;
}

function isElementActuallyVisible(el) {
  if (!el) return false;
  if (el.classList && el.classList.contains("hidden")) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

function getFocusableElementsIn(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => isElementActuallyVisible(el));
}

function getTopOpenModal() {
  const candidates = Array.from(
    document.querySelectorAll(
      ".hotkey-capture-overlay, .hotkeys-warning-overlay, .timeline-day-modal, .modal-overlay, .modal",
    ),
  ).filter((el) => isElementActuallyVisible(el));

  if (candidates.length === 0) return null;

  const withZ = candidates.map((el) => {
    const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
    return { el, z: Number.isFinite(z) ? z : 0 };
  });
  withZ.sort((a, b) => a.z - b.z);
  return withZ[withZ.length - 1].el;
}

function getModalFocusRoot(modal) {
  if (!modal) return null;
  return (
    modal.querySelector(
      ".hotkey-capture-dialog, .hotkeys-warning-dialog, .timeline-day-modal-content, .modal-container, .modal-content",
    ) || modal
  );
}

let modalKeyboardSupportInitialized = false;
function initGlobalModalKeyboardSupport() {
  if (modalKeyboardSupportInitialized || typeof document === "undefined")
    return;
  modalKeyboardSupportInitialized = true;

  document.addEventListener(
    "keydown",
    (e) => {
      const modal = getTopOpenModal();
      if (!modal) return;

      const focusRoot = getModalFocusRoot(modal);
      const focusables = getFocusableElementsIn(focusRoot);

      if (e.key === "Tab") {
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const activeInside = focusRoot && focusRoot.contains(active);

        if (!activeInside) {
          e.preventDefault();
          first.focus();
          return;
        }

        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
          return;
        }

        if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
          return;
        }

        return;
      }

      if (e.key === "Escape") {
        const closeBtn = modal.querySelector(
          '[data-modal-close="true"], .modal-close-btn, #close-hotkeys-btn, #close-tags-modal, #close-plans-modal, [data-action="close"], #cancel-export',
        );
        if (closeBtn && typeof closeBtn.click === "function") {
          e.preventDefault();
          e.stopPropagation();
          closeBtn.click();
        }
        return;
      }

      if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLButtonElement ||
          (target && target.isContentEditable)
        ) {
          return;
        }

        const primaryBtn = modal.querySelector(
          '[data-modal-primary="true"], .hotkeys-warning-btn-confirm, .ok, #save-plan-btn, #create-tag-btn',
        );
        if (
          primaryBtn &&
          !primaryBtn.disabled &&
          typeof primaryBtn.click === "function"
        ) {
          e.preventDefault();
          e.stopPropagation();
          primaryBtn.click();
        }
      }
    },
    true,
  );
}

/**
 * Toast unifié (info/success/error) avec action optionnelle.
 * @param {Object} options
 * @param {"info"|"success"|"error"} [options.type]
 * @param {string} options.message
 * @param {string} [options.actionLabel]
 * @param {Function} [options.onAction]
 * @param {number} [options.duration]
 */
function showPoseChronoToast(options = {}) {
  const {
    type = "info",
    message = "",
    actionLabel = "",
    onAction = null,
    duration = 3000,
  } = options;

  let container = document.getElementById("posechrono-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "posechrono-toast-container";
    container.className = "pc-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `pc-toast pc-toast-${type}`;

  const messageEl = document.createElement("span");
  messageEl.className = "pc-toast-message";
  messageEl.textContent = message;
  toast.appendChild(messageEl);

  if (actionLabel && typeof onAction === "function") {
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "pc-toast-action";
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener("click", () => {
      try {
        onAction();
      } catch (e) {
        console.error("[Toast] action error:", e);
      }
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 180);
    });
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 180);
  }, duration);
}

function showPoseChronoErrorMessage(message, duration = 2500) {
  if (typeof window.showPoseChronoToast === "function") {
    window.showPoseChronoToast({
      type: "error",
      message: String(message || ""),
      duration,
    });
    return;
  }
  console.error(String(message || ""));
}

/**
 * Planifie une action supprimée avec fenêtre d'annulation.
 * @param {Object} options
 * @param {string} options.id
 * @param {number} [options.timeoutMs]
 * @param {Function} options.onUndo
 * @param {Function} [options.onCommit]
 * @param {string} options.message
 * @param {string} options.undoLabel
 */
function schedulePoseChronoUndoAction(options = {}) {
  const {
    id,
    timeoutMs = 10000,
    onUndo,
    onCommit = null,
    message,
    undoLabel,
  } = options;

  if (!id || typeof onUndo !== "function") return;

  if (poseChronoUndoTimers.has(id)) {
    clearTimeout(poseChronoUndoTimers.get(id));
    poseChronoUndoTimers.delete(id);
  }

  const timer = setTimeout(() => {
    poseChronoUndoTimers.delete(id);
    if (typeof onCommit === "function") {
      try {
        onCommit();
      } catch (e) {
        console.error("[Undo] commit error:", e);
      }
    }
  }, timeoutMs);
  poseChronoUndoTimers.set(id, timer);

  showPoseChronoToast({
    type: "info",
    message,
    actionLabel: undoLabel,
    duration: timeoutMs,
    onAction: () => {
      const activeTimer = poseChronoUndoTimers.get(id);
      if (activeTimer) {
        clearTimeout(activeTimer);
        poseChronoUndoTimers.delete(id);
      }
      onUndo();
    },
  });
}

function showPoseChronoConfirmDialog(options = {}) {
  const openDialog = () =>
    new Promise((resolve) => {
      const {
        title = "",
        message = "",
        confirmText = getI18nText("notifications.deleteConfirm", "Confirm"),
        cancelText = getI18nText("notifications.deleteCancel", "Cancel"),
        checkboxLabel = "",
        checkboxChecked = false,
        container = document.body,
      } = options;

      const host =
        container && typeof container.appendChild === "function"
          ? container
          : document.body;

      if (!host) {
        resolve({ confirmed: false, checkboxChecked: false });
        return;
      }

      const dialogIndex = ++poseChronoConfirmDialogCounter;
      const titleId = `posechrono-confirm-title-${dialogIndex}`;
      const descriptionId = `posechrono-confirm-description-${dialogIndex}`;

      const warningOverlay = document.createElement("div");
      warningOverlay.className = "hotkeys-warning-overlay";

      const warningDialog = document.createElement("div");
      warningDialog.className = "hotkeys-warning-dialog";
      warningDialog.setAttribute("role", "alertdialog");
      warningDialog.setAttribute("aria-modal", "true");
      warningDialog.setAttribute("aria-labelledby", titleId);
      warningDialog.setAttribute("aria-describedby", descriptionId);
      warningDialog.tabIndex = -1;

      const dialogContainer = document.createElement("div");
      dialogContainer.className = "dialog-container";

      const iconWrapper = document.createElement("div");
      iconWrapper.className = "image-vue dialog-icon";
      const iconImage = document.createElement("img");
      iconImage.src = "assets/icones/dialog-warning.png";
      iconImage.alt = "dialog-warning";
      iconImage.loading = "lazy";
      iconWrapper.appendChild(iconImage);

      const main = document.createElement("div");
      main.className = "main";

      const titleEl = document.createElement("div");
      titleEl.className = "title";
      titleEl.id = titleId;
      titleEl.textContent = title;

      const descriptionEl = document.createElement("div");
      descriptionEl.className = "description";
      descriptionEl.id = descriptionId;
      descriptionEl.textContent = message;

      main.appendChild(titleEl);
      main.appendChild(descriptionEl);

      let checkboxEl = null;
      if (checkboxLabel) {
        const checkboxLabelEl = document.createElement("label");
        checkboxLabelEl.className = "hotkeys-warning-checkbox";

        checkboxEl = document.createElement("input");
        checkboxEl.type = "checkbox";
        checkboxEl.className = "hotkeys-warning-checkbox-input checkbox-simple";
        checkboxEl.checked = !!checkboxChecked;

        const checkboxText = document.createElement("span");
        checkboxText.textContent = checkboxLabel;

        checkboxLabelEl.appendChild(checkboxEl);
        checkboxLabelEl.appendChild(checkboxText);
        main.appendChild(checkboxLabelEl);
      }

      const action = document.createElement("div");
      action.className = "action";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className =
        "hotkeys-warning-btn hotkeys-warning-btn-cancel cancel";
      cancelBtn.textContent = cancelText;

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className =
        "hotkeys-warning-btn hotkeys-warning-btn-confirm ok";
      confirmBtn.textContent = confirmText;

      action.appendChild(cancelBtn);
      action.appendChild(confirmBtn);
      main.appendChild(action);

      dialogContainer.appendChild(iconWrapper);
      dialogContainer.appendChild(main);
      warningDialog.appendChild(dialogContainer);
      warningOverlay.appendChild(warningDialog);
      host.appendChild(warningOverlay);

      const previouslyFocused = document.activeElement;

      const getFocusableElements = () =>
        Array.from(
          warningDialog.querySelectorAll(
            'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.disabled);

      const cleanupAndResolve = (confirmed) => {
        const checked = checkboxEl ? checkboxEl.checked : false;
        warningOverlay.removeEventListener("click", handleOverlayClick);
        warningDialog.removeEventListener("keydown", handleKeyDown);
        cancelBtn.removeEventListener("click", handleCancelClick);
        confirmBtn.removeEventListener("click", handleConfirmClick);
        warningOverlay.remove();

        if (
          previouslyFocused &&
          typeof previouslyFocused.focus === "function"
        ) {
          previouslyFocused.focus();
        }

        resolve({ confirmed, checkboxChecked: checked });
      };

      const handleOverlayClick = (e) => {
        if (e.target === warningOverlay) {
          cleanupAndResolve(false);
        }
      };

      const handleCancelClick = () => cleanupAndResolve(false);
      const handleConfirmClick = () => cleanupAndResolve(true);

      const handleKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cleanupAndResolve(false);
          return;
        }

        if (e.key === "Tab") {
          const focusables = getFocusableElements();
          if (focusables.length === 0) return;

          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement;

          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
          return;
        }

        if (
          e.key === "Enter" &&
          !(e.target instanceof HTMLButtonElement) &&
          !(e.target instanceof HTMLInputElement)
        ) {
          e.preventDefault();
          e.stopPropagation();
          cleanupAndResolve(true);
        }
      };

      warningOverlay.addEventListener("click", handleOverlayClick);
      warningDialog.addEventListener("keydown", handleKeyDown);
      cancelBtn.addEventListener("click", handleCancelClick);
      confirmBtn.addEventListener("click", handleConfirmClick);

      confirmBtn.focus();
    });

  return enqueuePoseChronoDialog(openDialog);
}

function showStorageRepairDialog(options = {}) {
  const t = getI18nText;

  const openDialog = () =>
    new Promise((resolve) => {
      const {
        container = document.body,
        defaults = {
          timeline: true,
          plans: true,
          hotkeys: false,
        },
        message = t(
          "storage.repairMessage",
          "Choose what to reset. This action cannot be undone.",
        ),
        impactItems = [],
      } = options;

      const host =
        container && typeof container.appendChild === "function"
          ? container
          : document.body;

      if (!host) {
        resolve({
          confirmed: false,
          selections: { timeline: false, plans: false, hotkeys: false },
        });
        return;
      }

      const overlay = document.createElement("div");
      overlay.className = "hotkeys-warning-overlay";

      const dialog = document.createElement("div");
      dialog.className = "hotkeys-warning-dialog storage-repair-dialog";
      dialog.setAttribute("role", "alertdialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.tabIndex = -1;

      const dialogContainer = document.createElement("div");
      dialogContainer.className = "dialog-container";

      const iconWrapper = document.createElement("div");
      iconWrapper.className = "image-vue dialog-icon";
      const iconImage = document.createElement("img");
      iconImage.src = "assets/icones/dialog-warning.png";
      iconImage.alt = "dialog-warning";
      iconImage.loading = "lazy";
      iconWrapper.appendChild(iconImage);

      const main = document.createElement("div");
      main.className = "main";

      const titleEl = document.createElement("div");
      titleEl.className = "title";
      titleEl.textContent = t("storage.repairTitle", "Repair storage");

      const descriptionEl = document.createElement("div");
      descriptionEl.className = "description";
      descriptionEl.textContent = message;

      if (Array.isArray(impactItems) && impactItems.length > 0) {
        const impactList = document.createElement("ul");
        impactList.className = "storage-repair-impact";
        impactItems.forEach((item) => {
          if (!item) return;
          const li = document.createElement("li");
          li.textContent = String(item);
          impactList.appendChild(li);
        });
        if (impactList.children.length > 0) {
          descriptionEl.appendChild(document.createElement("br"));
          descriptionEl.appendChild(impactList);
        }
      }

      const optionsWrap = document.createElement("div");
      optionsWrap.className = "storage-repair-options";

      const mkCheckbox = (id, labelText, checked) => {
        const label = document.createElement("label");
        label.className = "hotkeys-warning-checkbox";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "hotkeys-warning-checkbox-input checkbox-simple";
        input.id = id;
        input.checked = !!checked;
        const span = document.createElement("span");
        span.textContent = labelText;
        label.appendChild(input);
        label.appendChild(span);
        optionsWrap.appendChild(label);
        return input;
      };

      const cbTimeline = mkCheckbox(
        "repair-storage-timeline",
        t("storage.targetTimeline", "Timeline history"),
        defaults.timeline,
      );
      const cbPlans = mkCheckbox(
        "repair-storage-plans",
        t("storage.targetPlans", "Session plans"),
        defaults.plans,
      );
      const cbHotkeys = mkCheckbox(
        "repair-storage-hotkeys",
        t("storage.targetHotkeys", "Keyboard shortcuts"),
        defaults.hotkeys,
      );

      const action = document.createElement("div");
      action.className = "action";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className =
        "hotkeys-warning-btn hotkeys-warning-btn-cancel cancel";
      cancelBtn.textContent = t("notifications.deleteCancel", "Cancel");

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className =
        "hotkeys-warning-btn hotkeys-warning-btn-confirm ok";
      confirmBtn.textContent = t("storage.repairConfirm", "Repair");
      confirmBtn.setAttribute("data-modal-primary", "true");

      action.appendChild(cancelBtn);
      action.appendChild(confirmBtn);

      main.appendChild(titleEl);
      main.appendChild(descriptionEl);
      main.appendChild(optionsWrap);
      main.appendChild(action);

      dialogContainer.appendChild(iconWrapper);
      dialogContainer.appendChild(main);
      dialog.appendChild(dialogContainer);
      overlay.appendChild(dialog);
      host.appendChild(overlay);

      const previouslyFocused = document.activeElement;
      const focusables = () =>
        Array.from(
          dialog.querySelectorAll(
            'button, input, [href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.disabled);

      const close = (confirmed) => {
        const selections = {
          timeline: !!cbTimeline.checked,
          plans: !!cbPlans.checked,
          hotkeys: !!cbHotkeys.checked,
        };
        overlay.removeEventListener("click", onOverlayClick);
        dialog.removeEventListener("keydown", onKeyDown);
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        overlay.remove();
        if (
          previouslyFocused &&
          typeof previouslyFocused.focus === "function"
        ) {
          previouslyFocused.focus();
        }
        resolve({ confirmed, selections });
      };

      const onOverlayClick = (e) => {
        if (e.target === overlay) close(false);
      };
      const onCancel = () => close(false);
      const onConfirm = () => close(true);
      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close(false);
          return;
        }
        if (e.key === "Tab") {
          const list = focusables();
          if (list.length === 0) return;
          const first = list[0];
          const last = list[list.length - 1];
          const active = document.activeElement;
          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      overlay.addEventListener("click", onOverlayClick);
      dialog.addEventListener("keydown", onKeyDown);
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);

      cbTimeline.focus();
    });

  return enqueuePoseChronoDialog(openDialog);
}

function showPreferencesPackageDialog(options = {}) {
  const t = getI18nText;

  const mode = options.mode === "import" ? "import" : "export";
  const available = {
    ui: options.available?.ui !== false,
    hotkeys: options.available?.hotkeys !== false,
    plans: options.available?.plans !== false,
    timeline: options.available?.timeline !== false,
  };
  const defaultAll = mode === "export";
  const defaults = {
    ui: options.defaults?.ui ?? defaultAll,
    hotkeys: options.defaults?.hotkeys ?? defaultAll,
    plans: options.defaults?.plans ?? defaultAll,
    timeline: options.defaults?.timeline ?? defaultAll,
  };

  const openDialog = () =>
    new Promise((resolve) => {
      const host =
        options.container && typeof options.container.appendChild === "function"
          ? options.container
          : document.body;

      if (!host) {
        resolve({
          confirmed: false,
          selections: {
            ui: false,
            hotkeys: false,
            plans: false,
            timeline: false,
          },
        });
        return;
      }

      const overlay = document.createElement("div");
      overlay.className = "hotkeys-warning-overlay";

      const dialog = document.createElement("div");
      dialog.className = "hotkeys-warning-dialog storage-repair-dialog";
      dialog.setAttribute("role", "alertdialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.tabIndex = -1;

      const dialogContainer = document.createElement("div");
      dialogContainer.className = "dialog-container";

      const iconWrapper = document.createElement("div");
      iconWrapper.className = "image-vue dialog-icon";
      const iconImage = document.createElement("img");
      iconImage.src = "assets/icones/dialog-warning.png";
      iconImage.alt = "dialog-warning";
      iconImage.loading = "lazy";
      iconWrapper.appendChild(iconImage);

      const main = document.createElement("div");
      main.className = "main";

      const titleEl = document.createElement("div");
      titleEl.className = "title";
      titleEl.textContent =
        mode === "import"
          ? t("settings.global.importPreferences", "Import preferences")
          : t("settings.global.exportPreferences", "Export preferences");

      const descriptionEl = document.createElement("div");
      descriptionEl.className = "description";
      descriptionEl.textContent =
        mode === "import"
          ? t(
              "settings.global.preferencesPackageImportMessage",
              "Choose what to import from this backup file.",
            )
          : t(
              "settings.global.preferencesPackageExportMessage",
              "Choose what to include in the backup file.",
            );

      const optionsWrap = document.createElement("div");
      optionsWrap.className = "storage-repair-options";

      const mkCheckbox = (id, labelText, checked) => {
        const label = document.createElement("label");
        label.className = "hotkeys-warning-checkbox";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "hotkeys-warning-checkbox-input checkbox-simple";
        input.id = id;
        input.checked = !!checked;
        const span = document.createElement("span");
        span.textContent = labelText;
        label.appendChild(input);
        label.appendChild(span);
        optionsWrap.appendChild(label);
        return input;
      };

      const cbUi = available.ui
        ? mkCheckbox(
            `prefs-package-ui-${mode}`,
            t("settings.global.packageSectionUi", "UI preferences"),
            defaults.ui,
          )
        : null;
      const cbHotkeys = available.hotkeys
        ? mkCheckbox(
            `prefs-package-hotkeys-${mode}`,
            t("settings.global.packageSectionHotkeys", "Keyboard shortcuts"),
            defaults.hotkeys,
          )
        : null;
      const cbPlans = available.plans
        ? mkCheckbox(
            `prefs-package-plans-${mode}`,
            t("settings.global.packageSectionPlans", "Session plans"),
            defaults.plans,
          )
        : null;
      const cbTimeline = available.timeline
        ? mkCheckbox(
            `prefs-package-timeline-${mode}`,
            t("settings.global.packageSectionTimeline", "Timeline history"),
            defaults.timeline,
          )
        : null;

      const action = document.createElement("div");
      action.className = "action";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className =
        "hotkeys-warning-btn hotkeys-warning-btn-cancel cancel";
      cancelBtn.textContent = t("notifications.deleteCancel", "Cancel");

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className =
        "hotkeys-warning-btn hotkeys-warning-btn-confirm ok";
      confirmBtn.textContent =
        mode === "import"
          ? t("settings.global.importPreferences", "Import preferences")
          : t("settings.global.exportPreferences", "Export preferences");
      confirmBtn.setAttribute("data-modal-primary", "true");

      action.appendChild(cancelBtn);
      action.appendChild(confirmBtn);

      main.appendChild(titleEl);
      main.appendChild(descriptionEl);
      main.appendChild(optionsWrap);
      main.appendChild(action);

      dialogContainer.appendChild(iconWrapper);
      dialogContainer.appendChild(main);
      dialog.appendChild(dialogContainer);
      overlay.appendChild(dialog);
      host.appendChild(overlay);

      const previouslyFocused = document.activeElement;
      const focusables = () =>
        Array.from(
          dialog.querySelectorAll(
            'button, input, [href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.disabled);

      const close = (confirmed) => {
        const selections = {
          ui: cbUi ? !!cbUi.checked : false,
          hotkeys: cbHotkeys ? !!cbHotkeys.checked : false,
          plans: cbPlans ? !!cbPlans.checked : false,
          timeline: cbTimeline ? !!cbTimeline.checked : false,
        };
        overlay.removeEventListener("click", onOverlayClick);
        dialog.removeEventListener("keydown", onKeyDown);
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        overlay.remove();
        if (
          previouslyFocused &&
          typeof previouslyFocused.focus === "function"
        ) {
          previouslyFocused.focus();
        }
        resolve({ confirmed, selections });
      };

      const onOverlayClick = (e) => {
        if (e.target === overlay) close(false);
      };
      const onCancel = () => close(false);
      const onConfirm = () => close(true);
      const onKeyDown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close(false);
          return;
        }
        if (e.key === "Tab") {
          const list = focusables();
          if (list.length === 0) return;
          const first = list[0];
          const last = list[list.length - 1];
          const active = document.activeElement;
          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      overlay.addEventListener("click", onOverlayClick);
      dialog.addEventListener("keydown", onKeyDown);
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);

      const firstInput =
        cbUi || cbHotkeys || cbPlans || cbTimeline || confirmBtn;
      if (firstInput && typeof firstInput.focus === "function") {
        firstInput.focus();
      }
    });

  return enqueuePoseChronoDialog(openDialog);
}

if (typeof window !== "undefined") {
  window.showPoseChronoConfirmDialog = showPoseChronoConfirmDialog;
  window.showStorageRepairDialog = showStorageRepairDialog;
  window.showPreferencesPackageDialog = showPreferencesPackageDialog;
  window.showPoseChronoToast = showPoseChronoToast;
  window.schedulePoseChronoUndoAction = schedulePoseChronoUndoAction;
}

async function confirmImageDeletionDialog(options = {}) {
  const { image = null, container = document.body } = options;
  const shouldConfirmDeletion = shouldConfirmImageDeletion();
  if (!shouldConfirmDeletion) {
    return true;
  }

  const title = i18next.t("drawing.deleteImage", {
    defaultValue: "Delete image",
  });
  const baseMessage = i18next.t("drawing.deleteImage", {
    defaultValue: "Delete image",
  });
  const message = image?.name ? `${baseMessage}\n${image.name}` : baseMessage;

  const { confirmed } = await showPoseChronoConfirmDialog({
    title,
    message,
    confirmText: i18next.t("notifications.deleteConfirm", {
      defaultValue: "Delete",
    }),
    cancelText: i18next.t("notifications.deleteCancel", {
      defaultValue: "Cancel",
    }),
    container,
  });

  return confirmed;
}

function shouldConfirmImageDeletion() {
  return !!UIPreferences.get(PREF_KEY_CONFIRM_DELETE_IMAGE, true);
}

function queueImageDeletionWithUndo(options = {}) {
  const {
    image = null,
    removeLocal = null,
    restoreLocal = null,
    commitDelete = null,
    actionId = `image-delete-${Date.now()}`,
  } = options;

  if (!image || typeof removeLocal !== "function") return false;

  removeLocal();

  const runCommit = () => {
    if (typeof commitDelete === "function") {
      try {
        const maybePromise = commitDelete();
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch((e) => {
            console.error("[DeleteImage] commit error:", e);
          });
        }
      } catch (e) {
        console.error("[DeleteImage] commit error:", e);
      }
    }
  };

  const deletedMsg = i18next.t("notifications.deleteQueued", {
    defaultValue: "Deleted. Undo available for 10 seconds.",
  });
  const undoLabel = i18next.t("notifications.undo", { defaultValue: "Undo" });

  if (typeof window.schedulePoseChronoUndoAction === "function") {
    window.schedulePoseChronoUndoAction({
      id: actionId,
      timeoutMs: 10000,
      message: deletedMsg,
      undoLabel,
      onUndo: () => {
        if (typeof restoreLocal === "function") {
          restoreLocal();
        }
        if (typeof window.showPoseChronoToast === "function") {
          window.showPoseChronoToast({
            type: "success",
            message: i18next.t("notifications.undoApplied", {
              defaultValue: "Action undone.",
            }),
            duration: 2000,
          });
        }
      },
      onCommit: runCommit,
    });
    return true;
  }

  runCommit();
  return false;
}

/**
 * Affiche le modal de configuration des raccourcis clavier
 */
function showHotkeysModal() {
  closeAllContextMenus();

  // Empêcher l'ouverture si un autre modal est ouvert
  if (document.getElementById("hotkeys-modal")) return;

  // Créer le modal
  const modal = document.createElement("div");
  modal.id = "hotkeys-modal";
  modal.className = "modal-overlay";

  // Helper pour obtenir les traductions
  const t = createI18nTextGetter(true);

  // Générer le contenu des catégories
  const generateCategorySection = (categoryKey, hotkeyKeys) => {
    const categoryTitle = t(`hotkeys.categories.${categoryKey}`, categoryKey);

    const items = hotkeyKeys
      .map((key) => {
        const currentValue = CONFIG.HOTKEYS[key] ?? "";
        const description = t(`hotkeys.descriptions.${key}`, key);
        const defaultValue = DEFAULT_HOTKEYS[key] ?? "";
        const isDefault = currentValue === defaultValue;
        const displayValue = currentValue
          ? formatHotkeyDisplay(key, currentValue)
          : t("hotkeys.none", "—");
        const isEmpty = !currentValue;

        return `
        <div class="hotkey-item ${isDefault ? "" : "hotkey-modified"} ${isEmpty ? "hotkey-empty" : ""}" data-key="${key}">
          <span class="hotkey-description">${description}</span>
          <div class="hotkey-actions">
            <button type="button" class="hotkey-value-btn ${isEmpty ? "hotkey-unassigned" : ""}" data-key="${key}" aria-label="${t("hotkeys.pressKey", "Press a key")} - ${description}">
              <kbd>${displayValue}</kbd>
            </button>
            <button type="button" class="hotkey-reset-btn ${isDefault ? "disabled" : ""}" data-key="${key}" data-default="${defaultValue}" ${isDefault ? "disabled" : ""} aria-label="${t("hotkeys.resetIndividual", "Reset to default")}" title="${t("hotkeys.resetIndividual", "Reset to default")}">
              <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
                <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-88.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
              </svg>
            </button>
          </div>
        </div>
      `;
      })
      .join("");

    return `
      <div class="hotkey-category" data-category="${categoryKey}">
        <button type="button" class="hotkey-category-toggle" aria-expanded="true">
          <span class="hotkey-category-title">${categoryTitle}</span>
          <span class="hotkey-category-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="hotkey-list" data-category-list="${categoryKey}">${items}</div>
      </div>
    `;
  };

  // Construire le contenu du modal
  const categoriesContent = Object.entries(HOTKEY_CATEGORIES)
    .map(([cat, keys]) => generateCategorySection(cat, keys))
    .join("");

  modal.innerHTML = `
    <div class="modal-container" role="dialog" aria-modal="true" aria-label="${t("hotkeys.title", "Keyboard Shortcuts")}" tabindex="-1" style="max-width: 600px; max-height: 80vh;">
      <div class="modal-header">
        <h3 class="modal-title">
          ${ICONS.KEYBOARD}
          ${t("hotkeys.title", "Keyboard Shortcuts")}
        </h3>
        <button type="button" class="modal-close-btn" id="close-hotkeys-modal" data-modal-close="true" aria-label="${t("notifications.deleteCancel", "Close")}">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>
        <div class="hotkeys-search-bar">
          <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
            <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
          </svg>
          <input type="text" id="hotkeys-search-input" placeholder="${t("hotkeys.search", "Search shortcuts...")}" autocomplete="off" />
          <div class="hotkeys-search-toggle">
            <button type="button" class="search-toggle-btn active" data-mode="name">${t("hotkeys.searchByName", "Name")}</button>
            <button type="button" class="search-toggle-btn" data-mode="key">${t("hotkeys.searchByKey", "Key")}</button>
          </div>
        </div>
      </div>
      <div class="modal-body" style="overflow-y: auto; max-height: 55vh; min-height: 240px;">
        <div class="hotkeys-container">
          ${categoriesContent}
        </div>
        <p class="hotkeys-no-results hidden">${t("hotkeys.noResults", "No results found.")}</p>
      </div>
      <div class="modal-footer hotkeys-footer">
        <button type="button" class="hotkeys-footer-btn hotkeys-reset-all-btn" id="reset-hotkeys-btn">
          <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor">
            <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-88.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
          </svg>
          ${t("hotkeys.reset", "Reset")}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Cleanup unique pour fermer le modal proprement
  const closeModal = () => {
    document.removeEventListener("keydown", handleEscape, true);
    modal.remove();
  };

  // Fermer avec Escape (capture phase pour intercepter avant les autres handlers)
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      // Ne pas interférer si la capture overlay est ouverte
      if (
        document.querySelector(".hotkey-capture-overlay") ||
        document.querySelector(".hotkeys-warning-overlay")
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    }
  };
  document.addEventListener("keydown", handleEscape, true);

  modal
    .querySelector("#close-hotkeys-modal")
    .addEventListener("click", closeModal);
  modal
    .querySelector("#close-hotkeys-btn")
    ?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Helper pour rafraîchir l'affichage d'un item dans le DOM
  const refreshHotkeyItem = (item) => {
    const key = item.dataset.key;
    const currentValue = CONFIG.HOTKEYS[key] ?? "";
    const defaultValue = DEFAULT_HOTKEYS[key] ?? "";
    const isDefault = currentValue === defaultValue;
    const isEmpty = !currentValue;

    item.querySelector(".hotkey-value-btn kbd").textContent = currentValue
      ? formatHotkeyDisplay(key, currentValue)
      : t("hotkeys.none", "—");
    item
      .querySelector(".hotkey-value-btn")
      .classList.toggle("hotkey-unassigned", isEmpty);
    item.classList.toggle("hotkey-modified", !isDefault);
    item.classList.toggle("hotkey-empty", isEmpty);

    const resetBtn = item.querySelector(".hotkey-reset-btn");
    if (resetBtn) {
      resetBtn.classList.toggle("disabled", isDefault);
      resetBtn.disabled = isDefault;
    }
  };

  // Événement pour réinitialiser tous les raccourcis
  modal
    .querySelector("#reset-hotkeys-btn")
    .addEventListener("click", async () => {
      const { confirmed } = await showPoseChronoConfirmDialog({
        title: t("hotkeys.title", "Keyboard Shortcuts"),
        message: t("hotkeys.resetAll", "Reset all shortcuts to default?"),
        confirmText: t("hotkeys.reset", "Reset"),
        cancelText: t("notifications.deleteCancel", "Cancel"),
        container: modal,
      });

      if (confirmed) {
        resetConfigHotkeysToDefaults();
        enforceNonCustomizableConfigHotkeys();
        try {
          await PoseChronoStorage.remove(STORAGE_KEYS.HOTKEYS_DB);
          localStorage.removeItem(HOTKEYS_STORAGE_KEY);
        } catch (e) {
          console.error("Error removing hotkeys from storage:", e);
        }
        // Rafraîchir le DOM sans recréer le modal
        modal.querySelectorAll(".hotkey-item").forEach(refreshHotkeyItem);

        platformNotify({
          title: t("hotkeys.title", "Keyboard Shortcuts"),
          body: t("hotkeys.resetDone", "All shortcuts reset to default."),
          mute: true,
          duration: 2000,
        });
      }
    });

  // Événements pour éditer les raccourcis (délégation d'événements)
  modal.querySelector(".hotkeys-container").addEventListener("click", (e) => {
    const valueBtn = e.target.closest(".hotkey-value-btn");
    if (valueBtn) {
      editHotkey(valueBtn.dataset.key, valueBtn);
      return;
    }

    const resetBtn = e.target.closest(".hotkey-reset-btn");
    if (resetBtn && !resetBtn.disabled) {
      const hotkeyName = resetBtn.dataset.key;
      const defaultValue = resetBtn.dataset.default;

      CONFIG.HOTKEYS[hotkeyName] = defaultValue;
      void saveHotkeysToStorage();

      const item = resetBtn.closest(".hotkey-item");
      if (item) {
        refreshHotkeyItem(item);
        item.classList.add("hotkey-flash");
        setTimeout(() => item.classList.remove("hotkey-flash"), 600);
      }
    }
  });

  // Barre de recherche avec toggle button group
  const searchInput = modal.querySelector("#hotkeys-search-input");
  const toggleBtns = modal.querySelectorAll(".search-toggle-btn");
  const categoryToggles = modal.querySelectorAll(".hotkey-category-toggle");
  let searchMode = "name";
  const collapsedCategories = new Set();
  UIPreferences.getStringArray("hotkeysCollapsedCategories").forEach((key) => {
    collapsedCategories.add(key);
  });
  const categoryTransitionDurationMs = 240;
  const categoryTransitionState = new WeakMap();

  const clearCategoryTransition = (listEl) => {
    const prev = categoryTransitionState.get(listEl);
    if (!prev) return;
    if (typeof prev.onEnd === "function") {
      listEl.removeEventListener("transitionend", prev.onEnd);
    }
    if (prev.timeoutId) {
      clearTimeout(prev.timeoutId);
    }
    categoryTransitionState.delete(listEl);
  };

  const setCategoryCollapsed = (
    categoryEl,
    collapsed,
    persist = true,
    animate = true,
  ) => {
    if (!categoryEl) return;
    const key = categoryEl.dataset.category;
    const listEl = categoryEl.querySelector(".hotkey-list");
    const toggleEl = categoryEl.querySelector(".hotkey-category-toggle");
    if (!key || !listEl || !toggleEl) return;

    const isCollapsed = categoryEl.classList.contains("collapsed");
    const wantsCollapsed = !!collapsed;

    if (persist) {
      if (wantsCollapsed) {
        collapsedCategories.add(key);
      } else {
        collapsedCategories.delete(key);
      }
      UIPreferences.setStringArray(
        "hotkeysCollapsedCategories",
        Array.from(collapsedCategories),
      );
    }

    if (isCollapsed === wantsCollapsed) {
      toggleEl.setAttribute("aria-expanded", wantsCollapsed ? "false" : "true");
      return;
    }

    clearCategoryTransition(listEl);
    categoryEl.classList.toggle("collapsed", !!collapsed);
    toggleEl.setAttribute("aria-expanded", wantsCollapsed ? "false" : "true");

    if (!animate) {
      if (wantsCollapsed) {
        listEl.hidden = true;
        listEl.style.maxHeight = "0px";
        listEl.style.opacity = "0";
        listEl.style.transform = "translateY(-8px)";
        listEl.style.overflow = "hidden";
        listEl.style.pointerEvents = "none";
      } else {
        listEl.hidden = false;
        listEl.style.maxHeight = "none";
        listEl.style.opacity = "1";
        listEl.style.transform = "translateY(0)";
        listEl.style.overflow = "visible";
        listEl.style.pointerEvents = "auto";
      }
      return;
    }

    if (wantsCollapsed) {
      listEl.hidden = false;
      const startHeight = Math.max(listEl.scrollHeight, 1);
      listEl.style.maxHeight = `${startHeight}px`;
      listEl.style.opacity = "1";
      listEl.style.transform = "translateY(0)";
      listEl.style.overflow = "hidden";
      listEl.style.pointerEvents = "none";
      // Force reflow before animating to collapsed state.
      void listEl.offsetHeight;
      listEl.style.maxHeight = "0px";
      listEl.style.opacity = "0";
      listEl.style.transform = "translateY(-8px)";

      const finish = () => {
        clearCategoryTransition(listEl);
        listEl.hidden = true;
        listEl.style.maxHeight = "0px";
        listEl.style.overflow = "hidden";
        listEl.style.pointerEvents = "none";
      };

      const onEnd = (evt) => {
        if (evt.propertyName !== "max-height") return;
        finish();
      };
      listEl.addEventListener("transitionend", onEnd);
      const timeoutId = setTimeout(finish, categoryTransitionDurationMs + 80);
      categoryTransitionState.set(listEl, { onEnd, timeoutId });
      return;
    }

    listEl.hidden = false;
    listEl.style.maxHeight = "0px";
    listEl.style.opacity = "0";
    listEl.style.transform = "translateY(-8px)";
    listEl.style.overflow = "hidden";
    listEl.style.pointerEvents = "none";
    // Force reflow before animating to expanded state.
    void listEl.offsetHeight;
    const targetHeight = Math.max(listEl.scrollHeight, 1);
    listEl.style.maxHeight = `${targetHeight}px`;
    listEl.style.opacity = "1";
    listEl.style.transform = "translateY(0)";

    const finish = () => {
      clearCategoryTransition(listEl);
      if (!categoryEl.classList.contains("collapsed")) {
        listEl.style.maxHeight = "none";
        listEl.style.overflow = "visible";
        listEl.style.pointerEvents = "auto";
      }
    };

    const onEnd = (evt) => {
      if (evt.propertyName !== "max-height") return;
      finish();
    };
    listEl.addEventListener("transitionend", onEnd);
    const timeoutId = setTimeout(finish, categoryTransitionDurationMs + 80);
    categoryTransitionState.set(listEl, { onEnd, timeoutId });
  };

  categoryToggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      const categoryEl = btn.closest(".hotkey-category");
      const willCollapse = !categoryEl.classList.contains("collapsed");
      setCategoryCollapsed(categoryEl, willCollapse, true, true);
    });
  });

  modal.querySelectorAll(".hotkey-category").forEach((categoryEl) => {
    setCategoryCollapsed(
      categoryEl,
      collapsedCategories.has(categoryEl.dataset.category),
      false,
      false,
    );
  });

  // Autofocus sur la recherche à l'ouverture du modal
  requestAnimationFrame(() => {
    if (searchInput && document.body.contains(searchInput)) {
      searchInput.focus();
      searchInput.select();
    }
  });

  const performSearch = () => {
    const query = searchInput.value.toLowerCase().trim();
    const items = modal.querySelectorAll(".hotkey-item");
    const categories = modal.querySelectorAll(".hotkey-category");

    items.forEach((item) => {
      if (!query) {
        item.style.display = "";
        return;
      }
      if (searchMode === "key") {
        const kbd = item.querySelector("kbd").textContent.toLowerCase();
        item.style.display = kbd.includes(query) ? "" : "none";
      } else {
        const desc = item
          .querySelector(".hotkey-description")
          .textContent.toLowerCase();
        item.style.display = desc.includes(query) ? "" : "none";
      }
    });

    // Masquer les catégories vides
    let totalVisible = 0;
    categories.forEach((cat) => {
      const visibleCount = Array.from(
        cat.querySelectorAll(".hotkey-item"),
      ).filter((item) => item.style.display !== "none").length;
      totalVisible += visibleCount;
      cat.style.display = visibleCount > 0 ? "" : "none";

      if (query && visibleCount > 0) {
        setCategoryCollapsed(cat, false, false, false);
      } else if (!query) {
        setCategoryCollapsed(
          cat,
          collapsedCategories.has(cat.dataset.category),
          false,
          false,
        );
      }
    });

    // Afficher le message "aucun résultat"
    const noResults = modal.querySelector(".hotkeys-no-results");
    if (noResults) {
      noResults.classList.toggle("hidden", !query || totalVisible > 0);
    }
  };

  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      searchMode = btn.dataset.mode;
      performSearch();
    });
  });

  searchInput.addEventListener("input", performSearch);

  // Empêcher la propagation du clavier depuis le champ de recherche
  searchInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      if (searchInput.value) {
        searchInput.value = "";
        performSearch();
      } else {
        closeModal();
      }
    }
  });
}

/**
 * Sauvegarde les raccourcis clavier personnalisés dans IndexedDB
 */
async function saveHotkeysToStorage() {
  try {
    const hotkeysToSave = collectCustomHotkeysBindings();

    const normalized = normalizeHotkeysPayload({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      bindings: hotkeysToSave,
    });

    if (Object.keys(normalized.bindings).length > 0) {
      await PoseChronoStorage.setJson(
        STORAGE_KEYS.HOTKEYS_DB,
        normalized.payload,
      );
      try {
        localStorage.removeItem(HOTKEYS_STORAGE_KEY);
      } catch (_) {}
    } else {
      await PoseChronoStorage.remove(STORAGE_KEYS.HOTKEYS_DB);
      try {
        localStorage.removeItem(HOTKEYS_STORAGE_KEY);
      } catch (_) {}
    }
  } catch (e) {
    console.error("Error saving hotkeys to storage:", e);
  }
}

/**
 * Charge les raccourcis clavier personnalisés (IndexedDB + migration locale)
 */
async function loadHotkeysFromStorage() {
  try {
    // Hotkeys internes non customisables: toujours forcés à leur valeur par défaut.
    enforceNonCustomizableConfigHotkeys();

    const stored = await PoseChronoStorage.migrateFromLocalStorage(
      HOTKEYS_STORAGE_KEY,
      STORAGE_KEYS.HOTKEYS_DB,
      {},
    );
    const rawPayload =
      stored && typeof stored === "object"
        ? stored
        : await PoseChronoStorage.getJson(STORAGE_KEYS.HOTKEYS_DB, {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            bindings: {},
          });

    const normalized = normalizeHotkeysPayload(rawPayload);
    if (normalized.repaired) {
      console.warn("[Storage] Hotkeys payload repaired.");
      await PoseChronoStorage.setJson(
        STORAGE_KEYS.HOTKEYS_DB,
        normalized.payload,
      );
    }

    applyCustomHotkeysToConfig(normalized.bindings, { resetToDefaults: false });
  } catch (e) {
    console.error("Error loading hotkeys from storage:", e);
  }
}

/**
 * Cherche les conflits de raccourcis dans la même catégorie contextuelle
 * Retourne le nom de la fonction en conflit ou null
 */
function findHotkeyConflict(hotkeyName, newValue) {
  const hotkeysUtils = getHotkeysUtils();
  if (!hotkeysUtils?.findHotkeyConflict) {
    logMissingShared("HOTKEYS_UTILS.findHotkeyConflict");
    return null;
  }
  return hotkeysUtils.findHotkeyConflict(CONFIG.HOTKEYS, hotkeyName, newValue, {
    drawingPrefix: "DRAWING_",
  });
}

/**
 * Permet d'éditer un raccourci clavier
 */
function editHotkey(hotkeyName, buttonElement) {
  const t = createI18nTextGetter(true);

  // Obtenir la description de la fonction et la valeur actuelle
  const functionName = t(`hotkeys.descriptions.${hotkeyName}`, hotkeyName);
  const currentValue = CONFIG.HOTKEYS[hotkeyName] ?? "";
  const currentDisplay = currentValue
    ? formatHotkeyDisplay(hotkeyName, currentValue)
    : t("hotkeys.none", "—");

  // Créer un overlay temporaire pour capturer la touche
  const captureOverlay = document.createElement("div");
  captureOverlay.className = "hotkey-capture-overlay";
  captureOverlay.innerHTML = `
    <div class="hotkey-capture-dialog">
      <p class="capture-title">${t("hotkeys.pressKey", "Press a key...")}</p>
      <p class="capture-function">${functionName}</p>
      <p class="capture-current">${t("hotkeys.current", "Current")}: <kbd>${currentDisplay}</kbd></p>
      <kbd class="hotkey-preview">...</kbd>
      <p class="capture-conflict hidden"></p>
      <div class="capture-buttons">
        <button type="button" class="guide-add-btn" id="clear-hotkey-capture">
          ${t("hotkeys.clear", "Clear")}
        </button>
        <button type="button" class="guide-add-btn" id="cancel-hotkey-capture">
          ${t("notifications.deleteCancel", "Cancel")}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(captureOverlay);

  const preview = captureOverlay.querySelector(".hotkey-preview");
  const conflictMsg = captureOverlay.querySelector(".capture-conflict");
  let capturedKey = null;

  const cleanup = () => {
    document.removeEventListener("keydown", handleKeyDown, true);
    captureOverlay.remove();
  };

  // Appliquer le raccourci capturé
  const applyHotkey = (newValue) => {
    // Vérifier les conflits (sauf si on vide le raccourci)
    if (newValue) {
      const conflictKey = findHotkeyConflict(hotkeyName, newValue);
      if (conflictKey) {
        const conflictName = t(
          `hotkeys.descriptions.${conflictKey}`,
          conflictKey,
        );
        conflictMsg.textContent = t(
          "hotkeys.conflict",
          `Already used by: ${conflictName}`,
        ).replace("{{action}}", conflictName);
        conflictMsg.classList.remove("hidden");
        // Ne pas valider, laisser l'utilisateur réessayer
        capturedKey = null;
        return;
      }
    }

    CONFIG.HOTKEYS[hotkeyName] = newValue;
    const defaultValue = DEFAULT_HOTKEYS[hotkeyName] ?? "";
    const isDefault = newValue === defaultValue;
    const isEmpty = !newValue;
    const t2 = t; // closure

    buttonElement.querySelector("kbd").textContent = newValue
      ? formatHotkeyDisplay(hotkeyName, newValue)
      : t2("hotkeys.none", "—");
    buttonElement.classList.toggle("hotkey-unassigned", isEmpty);

    // Activer le bouton reset si on n'est plus sur la valeur par défaut
    const resetBtn =
      buttonElement.parentElement.querySelector(".hotkey-reset-btn");
    if (resetBtn) {
      resetBtn.classList.toggle("disabled", isDefault);
      resetBtn.disabled = isDefault;
    }

    // Mettre à jour l'indicateur modifié + flash animation
    const item = buttonElement.closest(".hotkey-item");
    if (item) {
      item.classList.toggle("hotkey-modified", !isDefault);
      item.classList.toggle("hotkey-empty", isEmpty);
      // Flash de confirmation
      item.classList.add("hotkey-flash");
      setTimeout(() => item.classList.remove("hotkey-flash"), 600);
    }

    void saveHotkeysToStorage();
    cleanup();
  };

  // Capturer la touche
  const handleKeyDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignorer les touches de modification seules
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
      return;
    }

    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      cleanup();
      return;
    }

    // Construire la représentation de la touche
    let keyCombo = "";
    if (e.ctrlKey) keyCombo += "Ctrl+";
    if (e.altKey) keyCombo += "Alt+";

    // Pour les touches simples, on stocke la casse réelle (e.key)
    // Shift n'est ajouté comme préfixe que pour les touches spéciales ou combinaisons
    const specialKeys = [
      "Enter",
      "Escape",
      "Tab",
      "Space",
      "Backspace",
      "Delete",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      "Insert",
    ];

    if (specialKeys.includes(e.key)) {
      if (e.shiftKey) keyCombo += "Shift+";
      keyCombo += e.key;
    } else if (e.key.length === 1) {
      // Pour un caractère simple : stocker tel quel (la casse encode déjà Shift)
      // Sauf si Ctrl ou Alt sont aussi pressés, là on ajoute Shift explicitement
      if (e.shiftKey && (e.ctrlKey || e.altKey)) {
        keyCombo += "Shift+";
        keyCombo += e.key.toUpperCase();
      } else {
        // Stocker e.key tel quel : "a" pour a, "A" pour Shift+A, "é" pour é, etc.
        keyCombo += e.key;
      }
    } else {
      if (e.shiftKey) keyCombo += "Shift+";
      keyCombo += e.key;
    }

    capturedKey = keyCombo;
    preview.textContent = formatHotkeyDisplay(hotkeyName, capturedKey);
    conflictMsg.classList.add("hidden");

    // Vérifier immédiatement s'il y a un conflit (feedback visuel)
    const conflictKey = findHotkeyConflict(hotkeyName, capturedKey);
    if (conflictKey) {
      const conflictName = t(
        `hotkeys.descriptions.${conflictKey}`,
        conflictKey,
      );
      conflictMsg.textContent = t(
        "hotkeys.conflict",
        `Already used by: ${conflictName}`,
      ).replace("{{action}}", conflictName);
      conflictMsg.classList.remove("hidden");
      // Ne pas auto-valider, laisser l'utilisateur réessayer une autre touche
      return;
    }

    // Valider après un court instant pour laisser voir la preview
    setTimeout(() => {
      if (capturedKey) {
        applyHotkey(capturedKey);
      }
    }, 150);
  };

  document.addEventListener("keydown", handleKeyDown, true);

  // Bouton Clear : vider le raccourci
  captureOverlay
    .querySelector("#clear-hotkey-capture")
    .addEventListener("click", () => {
      applyHotkey("");
    });

  captureOverlay
    .querySelector("#cancel-hotkey-capture")
    .addEventListener("click", cleanup);
  captureOverlay.addEventListener("click", (e) => {
    if (e.target === captureOverlay) cleanup();
  });
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
  checkbox.className = "context-menu-checkbox checkbox-simple";

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
  const resetIcon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  resetIcon.setAttribute("width", "16");
  resetIcon.setAttribute("height", "16");
  resetIcon.setAttribute("viewBox", "0 0 24 24");
  resetIcon.setAttribute("fill", "none");
  resetIcon.setAttribute("stroke", "currentColor");
  resetIcon.setAttribute("stroke-width", "2");

  const resetPathPrimary = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  resetPathPrimary.setAttribute(
    "d",
    "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
  );
  const resetPathSecondary = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  resetPathSecondary.setAttribute("d", "M3 3v5h5");
  resetIcon.appendChild(resetPathPrimary);
  resetIcon.appendChild(resetPathSecondary);

  const resetLabel = document.createElement("span");
  const resetTimerFallback =
    getCurrentI18nLanguage() === "fr"
      ? "Réinitialiser le chrono"
      : "Reset timer";
  resetLabel.textContent = getI18nText(
    "timer.resetTimerOption",
    resetTimerFallback,
  );

  resetOption.appendChild(resetIcon);
  resetOption.appendChild(resetLabel);

  const isGuest = isSyncSessionParticipantActive();
  const guestControlMode = isGuest ? (syncSessionServiceState?.controlMode || "host-only") : null;
  const isGuestDisabled = isGuest && (guestControlMode === "host-only" || guestControlMode === "shared-pause");

  if (isGuestDisabled) {
    resetOption.style.opacity = "0.4";
    resetOption.style.cursor = "not-allowed";
    resetOption.style.pointerEvents = "none";
  } else {
    resetOption.onclick = () => {
      state.timeRemaining = state.selectedDuration;
      updateTimerDisplay();
      scheduleSyncRuntimeState("timer-reset", { force: true });
      closeAllContextMenus();
    };
  }

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
  checkbox.className = "context-menu-checkbox checkbox-simple";

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
  adjustMenuPosition(menu, x, y, false);
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
  checkbox.className = "context-menu-checkbox checkbox-simple";

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
    onIndexChange,
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

  const normalizedPath = normalizeRuntimeMediaPath(imagePath);

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
  const syncZoomIndex = () => {
    if (typeof onIndexChange === "function") {
      try {
        onIndexChange(currentZoomIndex, image);
      } catch (e) {
        console.error("[openZoomForImage] onIndexChange error:", e);
      }
    }
  };
  if (allowNavigation && imageList && imageList.length > 0) {
    currentZoomIndex = Math.max(
      0,
      Math.min(currentZoomIndex, imageList.length - 1),
    );
    image = imageList[currentZoomIndex] || image;
  }

  function updateZoomContent() {
    const overlay = document.getElementById("zoom-overlay");
    if (!overlay) return;
    window.zoomOverlayCurrentImage = image || null;

    // Recalculer le chemin normalisé pour l'image courante (important pour la navigation)
    const currentImagePath = image.filePath || image.path || image.file;
    const normalizedPath = normalizeRuntimeMediaPath(currentImagePath);

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
          <video id="zoom-video" src="${escapeHtml(normalizedPath)}"
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
        void openZoomDrawingModeSafely(overlay, image);
      };
    }

    // Bouton Révéler
    const btnReveal = document.createElement("button");
    btnReveal.className = "control-btn-small";
    btnReveal.setAttribute("data-tooltip", i18next.t(getRevealActionI18nKey()));
    btnReveal.innerHTML = ICONS.REVEAL;
    btnReveal.onclick = async () => {
      await platformWindowMinimize();
      await platformItemOpen(image.id);
    };

    // Bouton Supprimer (optionnel, seulement si onDelete est fourni)
    let btnDelete = null;
    if (onDelete) {
      btnDelete = document.createElement("button");
      btnDelete.className = "control-btn-small btn-danger-hover";
      btnDelete.setAttribute("data-tooltip", i18next.t("drawing.deleteImage"));
      btnDelete.innerHTML = ICONS.DELETE;
      btnDelete.onclick = async () => {
        const customDeleteCtx = {
          image,
          currentZoomIndex,
          imageList,
          closeZoom: closeZoomOverlay,
          refresh: updateZoomContent,
          setCurrentIndex: (nextIndex) => {
            if (!allowNavigation || !imageList || imageList.length === 0)
              return;
            currentZoomIndex = Math.max(
              0,
              Math.min(nextIndex, imageList.length - 1),
            );
            image = imageList[currentZoomIndex] || image;
            syncZoomIndex();
          },
          setImage: (nextImage) => {
            if (!nextImage) return;
            image = nextImage;
          },
        };

        let customHandled = false;
        try {
          const customResult = await onDelete(customDeleteCtx);
          customHandled = customResult !== false;
        } catch (e) {
          console.error("Erreur suppression custom:", e);
          customHandled = true;
        }
        if (customHandled) return;

        const confirmed = await confirmImageDeletionDialog({
          image,
          container: document.body,
        });
        if (!confirmed) return;
        try {
          if (typeof image.moveToTrash === "function") {
            await image.moveToTrash();
          } else if (image?.id !== undefined && image?.id !== null) {
            await platformItemMoveToTrash([image.id]);
          }
        } catch (e) {
          console.error("Erreur suppression:", e);
          return;
        }
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
    window.zoomOverlayCurrentImage = null;
    document.body.style.overflow = "auto";
    document.removeEventListener("keydown", handleZoomKeyboard);
    window.zoomFilters = null;
    window.updateZoomContent = null;
    // Marquer qu'on vient de fermer le zoom (pour empêcher le day-modal de se fermer aussi)
    window._zoomJustClosed = Date.now();
    if (typeof onIndexChange === "function") {
      try {
        onIndexChange(null, null);
      } catch (e) {
        console.error("[openZoomForImage] onIndexChange close error:", e);
      }
    }
    if (onClose) onClose();
  }

  function handleZoomKeyboard(e) {
    const hk = CONFIG.HOTKEYS;
    const key = e.key;
    const keyLow = e.key.toLowerCase();
    const hasSystemModifier = e.ctrlKey || e.altKey || e.metaKey;
    const drawingExportKey = String(hk.DRAWING_EXPORT || "s").toLowerCase();
    const zoomOverlayEl = document.getElementById("zoom-overlay");
    const zoomDrawingActive =
      (typeof isZoomDrawingModeActive !== "undefined" &&
        isZoomDrawingModeActive) ||
      !!(
        zoomOverlayEl && zoomOverlayEl.classList.contains("zoom-drawing-active")
      );

    // Navigation entre images (seulement si allowNavigation)
    if (allowNavigation && imageList && imageList.length > 1) {
      if (e.key === "ArrowRight") {
        if (typeof closeZoomDrawingMode === "function") closeZoomDrawingMode();
        currentZoomIndex = (currentZoomIndex + 1) % imageList.length;
        image = imageList[currentZoomIndex];
        syncZoomIndex();
        updateZoomContent();
        return;
      } else if (e.key === "ArrowLeft") {
        if (typeof closeZoomDrawingMode === "function") closeZoomDrawingMode();
        currentZoomIndex =
          (currentZoomIndex - 1 + imageList.length) % imageList.length;
        image = imageList[currentZoomIndex];
        syncZoomIndex();
        updateZoomContent();
        return;
      }
    }

    // When zoom drawing is active, disable zoom-toolbar shortcuts and route
    // only drawing-level shortcuts (Escape / Ctrl+S).
    if (zoomDrawingActive) {
      if ((e.ctrlKey || e.metaKey) && keyLow === drawingExportKey) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
        if (typeof window.showExportModal === "function") {
          window.showExportModal("zoom");
        } else if (typeof window.showDrawingExportOptions === "function") {
          window.showDrawingExportOptions();
        } else {
          const zoomExportBtn = document.getElementById("zoom-export-btn");
          if (zoomExportBtn && typeof zoomExportBtn.click === "function") {
            zoomExportBtn.click();
          }
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
        if (typeof closeZoomDrawingMode === "function") {
          closeZoomDrawingMode();
        }
        return;
      }

      return;
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
      if (zoomDrawingActive) {
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
    } else if (!hasSystemModifier && keyLow === hk.GRAYSCALE.toLowerCase()) {
      e.preventDefault();
      zoomFilters.gray = !zoomFilters.gray;
      updateZoomContent();
    } else if (!hasSystemModifier && keyLow === hk.BLUR.toLowerCase()) {
      e.preventDefault();
      zoomFilters.blur = !zoomFilters.blur;
      updateZoomContent();
    } else if (
      !hasSystemModifier &&
      e.shiftKey &&
      key === hk.SILHOUETTE_MODAL
    ) {
      e.preventDefault();
      showSilhouetteConfig();
    } else if (!hasSystemModifier && keyLow === hk.SILHOUETTE.toLowerCase()) {
      e.preventDefault();
      zoomFilters.silhouette = !zoomFilters.silhouette;
      updateZoomContent();
    } else if (
      (!hasSystemModifier && keyLow === hk.ANNOTATE.toLowerCase()) ||
      (!hasSystemModifier && keyLow === hk.DRAWING_TOOL_PENCIL.toLowerCase()) ||
      (!hasSystemModifier && keyLow === "b")
    ) {
      if (zoomDrawingActive) {
        return;
      }
      e.preventDefault();
      if (!isVideoFile(image)) {
        const overlay = document.getElementById("zoom-overlay");
        void openZoomDrawingModeSafely(overlay, image);
      }
    } else if (!hasSystemModifier && keyLow === hk.TAGS.toLowerCase()) {
      e.preventDefault();
      if (!isTagsFeatureAvailable()) {
        return;
      }
      if (typeof openTagsModal === "function") {
        openTagsModal(null, image);
      }
    }
  }

  // Initialiser
  syncZoomIndex();
  updateZoomContent();
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", handleZoomKeyboard);

  // Exposer la fonction de fermeture globalement
  window.closeZoom = closeZoomOverlay;
}

// Exposer la fonction globalement
window.openZoomForImage = openZoomForImage;

function showReview() {
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    return;
  }
  stopTimer();
  finalizeCurrentPoseForReview();
  ensureReviewDurationsVisibilityState();
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
  scheduleSyncRuntimeState("session-review", { force: true });

  // Fermer l'image info overlay s'il est ouvert
  const infoOverlay = document.getElementById("image-info-overlay");
  if (infoOverlay) {
    infoOverlay.remove();
  }

  // Réinitialiser les états du mode mémoire
  state.memoryHidden = false;
  hideMemoryOverlay();

  // === ENREGISTRER LA SESSION DANS L'HISTORIQUE ===
  const reviewSummary = computeReviewSessionSummary(
    state.imagesSeen,
    state.totalSessionTime,
  );
  const sessionPoses = reviewSummary.sessionPoses;
  const sessionTime = reviewSummary.sessionTime;
  if (reviewSummary.shouldRecord) {
    const sessionDetails = {
      ...buildReviewSessionDetailsPayload({
        sessionMode: state.sessionMode || "classique",
        memoryType: state.memoryType,
        customQueue: state.customQueue,
        imagesSeen: state.imagesSeen,
      }),
      startTime: state.sessionStartTime || null,
      isOnline:
        state.sessionWasOnline ||
        isSyncSessionOnlineForHistory(syncSessionServiceState),
    };
    void ensureTimelineModuleLoaded("record-session")
      .then(() => {
        const root = getDrawBundleWindow();
        if (root && typeof root.recordSession === "function") {
          root.recordSession(sessionPoses, sessionTime, sessionDetails);
        }
      })
      .catch((error) => {
        console.error("[Timeline] record session failed:", error);
      });
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

  const mins = reviewSummary.mins;
  const secs = reviewSummary.secs;
  const count = reviewSummary.sessionPoses;
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

  let reviewDurationToggle = document.getElementById("review-duration-toggle");
  if (!reviewDurationToggle && reviewGrid?.parentElement) {
    reviewDurationToggle = document.createElement("button");
    reviewDurationToggle.type = "button";
    reviewDurationToggle.id = "review-duration-toggle";
    reviewDurationToggle.className = "review-duration-toggle";
    reviewGrid.parentElement.insertBefore(reviewDurationToggle, reviewGrid);
  }

  const updateReviewDurationToggleLabel = () => {
    if (!reviewDurationToggle) return;
    const copy = getReviewDurationToggleCopy(state.reviewDurationsVisible);
    const label = i18next.t(copy.i18nKey, { defaultValue: copy.defaultValue });
    reviewDurationToggle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="12" viewBox="0 -960 960 960" width="12" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M360-840v-80h240v80H360Zm80 440h80v-240h-80v240Zm40 320q-74 0-139.5-28.5T226-186q-49-49-77.5-114.5T120-440q0-74 28.5-139.5T226-694q49-49 114.5-77.5T480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm0-80q116 0 198-82t82-198q0-116-82-198t-198-82q-116 0-198 82t-82 198q0 116 82 198t198 82Zm0-280Z"/>
      </svg>
      <span>${label}</span>
    `;
  };

  const REVIEW_DURATION_HIDE_ANIM_MS = 180;
  let reviewDurationHideTimer = null;
  const animateHideReviewDurationBadges = (onDone) => {
    const durationBadges = reviewGrid.querySelectorAll(
      ".review-duration-badge",
    );
    if (!durationBadges.length) {
      if (typeof onDone === "function") onDone();
      return;
    }

    durationBadges.forEach((badge) => {
      badge.classList.add("is-zipping-out");
    });

    if (reviewDurationHideTimer) {
      clearTimeout(reviewDurationHideTimer);
      reviewDurationHideTimer = null;
    }

    reviewDurationHideTimer = setTimeout(() => {
      reviewDurationHideTimer = null;
      if (typeof onDone === "function") onDone();
    }, REVIEW_DURATION_HIDE_ANIM_MS);
  };

  const animateShowReviewDurationBadges = () => {
    const durationBadges = reviewGrid.querySelectorAll(
      ".review-duration-badge",
    );
    if (!durationBadges.length) return;

    durationBadges.forEach((badge) => {
      badge.classList.add("is-zipping-in");
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        durationBadges.forEach((badge) => {
          badge.classList.remove("is-zipping-in");
        });
      });
    });
  };

  function renderReviewGrid() {
    reviewGrid.innerHTML = "";

    const reviewItems = buildReviewGridItemsModel(state.imagesSeen, {
      isVideoFile,
      getDurationSeconds: getSeenImageDurationSeconds,
      isAnnotated: isReviewImageAnnotated,
      includeDurations: state.reviewDurationsVisible,
      formatDuration: formatReviewDuration,
    });

    reviewItems.forEach((item) => {
      const div = document.createElement("div");
      div.className = "review-item";
      const img = document.createElement("img");
      img.src = item.src;
      img.onerror = () => {
        div.style.display = "none";
      };

      // Ajouter un indicateur vidéo
      if (item.isVideo) {
        div.classList.add("is-video");
        const videoIndicator = document.createElement("div");
        videoIndicator.className = "video-indicator";
        videoIndicator.innerHTML = ICONS.VIDEO_PLAY;
        div.appendChild(videoIndicator);
      }

      const metaBadges = document.createElement("div");
      metaBadges.className = "review-meta-badges";

      if (item.durationText) {
        const durationBadge = document.createElement("div");
        durationBadge.className = "review-duration-badge";
        durationBadge.textContent = item.durationText;
        metaBadges.appendChild(durationBadge);
      }

      if (item.annotated) {
        const annotatedBadge = document.createElement("div");
        annotatedBadge.className = "review-annotated-badge";
        annotatedBadge.innerHTML = ICONS.PENCIL;
        metaBadges.appendChild(annotatedBadge);
      }

      if (item.hasMetaBadge) {
        div.appendChild(metaBadges);
      }

      div.onclick = () => openZoom(item.index);

      div.appendChild(img);
      reviewGrid.appendChild(div);
    });
  }

  if (reviewDurationToggle) {
    reviewDurationToggle.onclick = () => {
      if (reviewDurationHideTimer) {
        clearTimeout(reviewDurationHideTimer);
        reviewDurationHideTimer = null;
      }
      const transition = getReviewDurationToggleTransition(
        state.reviewDurationsVisible,
      );
      state.reviewDurationsVisible = !!transition.nextVisible;
      saveReviewDurationsVisibility(state.reviewDurationsVisible);
      updateReviewDurationToggleLabel();

      if (transition.animateHide) {
        animateHideReviewDurationBadges(() => {
          if (!state.reviewDurationsVisible) {
            renderReviewGrid();
          }
        });
        return;
      }

      if (transition.renderBeforeShow) {
        renderReviewGrid();
      }
      if (transition.animateShow) {
        animateShowReviewDurationBadges();
      }
    };
    updateReviewDurationToggleLabel();
  }

  renderReviewGrid();

  // Initialiser/rafraîchir le timeline dans l'écran review
  void ensureTimelineInitialized("review-refresh")
    .then(() => {
      const root = getDrawBundleWindow();
      if (root && typeof root.refreshTimelineReview === "function") {
        root.refreshTimelineReview();
      }
    })
    .catch((error) => {
      console.error("[Timeline] review refresh failed:", error);
    });

  let currentZoomIndex = null;
  // Exposer pour accès global depuis le raccourci T
  window.currentZoomIndex = null;

  function openZoom(index) {
    currentZoomIndex = index;
    window.currentZoomIndex = index;
    const safeIndex = normalizeReviewZoomIndex(index, state.imagesSeen.length);
    const zoomImage = state.imagesSeen[safeIndex];
    if (!zoomImage || typeof window.openZoomForImage !== "function") return;

    window.openZoomForImage(zoomImage, {
      allowNavigation: true,
      imageList: state.imagesSeen,
      currentIndex: safeIndex,
      onIndexChange: (nextIndex) => {
        currentZoomIndex = Number.isInteger(nextIndex) ? nextIndex : null;
        window.currentZoomIndex = currentZoomIndex;
      },
      onClose: () => {
        renderReviewGrid();
        currentZoomIndex = null;
        window.currentZoomIndex = null;
      },
      onDelete: async (ctx = {}) => {
        const targetImage = ctx.image || state.imagesSeen[safeIndex];
        if (!targetImage) return true;

        const confirmed = await confirmImageDeletionDialog({
          image: targetImage,
          container: document.body,
        });
        if (!confirmed) return true;

        const imageIdKey =
          targetImage?.id === undefined || targetImage?.id === null
            ? null
            : String(targetImage.id);
        const removedReviewIndex = Number.isInteger(ctx.currentZoomIndex)
          ? Math.max(
              0,
              Math.min(
                ctx.currentZoomIndex,
                Math.max(0, state.imagesSeen.length - 1),
              ),
            )
          : safeIndex;
        const removedReviewImage = targetImage;
        const originalMeta =
          imageIdKey && state.imagesSeenMetaById
            ? state.imagesSeenMetaById[imageIdKey]
            : undefined;
        const stateIndex =
          imageIdKey === null
            ? -1
            : state.images.findIndex((img) => String(img.id) === imageIdKey);
        let removedStateImage = null;

        queueImageDeletionWithUndo({
          image: targetImage,
          actionId: `delete-image-review-${Date.now()}-${imageIdKey || "noid"}`,
          removeLocal: () => {
            if (
              imageIdKey &&
              state.imagesSeenMetaById?.[imageIdKey] !== undefined
            ) {
              delete state.imagesSeenMetaById[imageIdKey];
            }

            state.imagesSeen.splice(removedReviewIndex, 1);

            if (stateIndex >= 0) {
              removedStateImage = state.images.splice(stateIndex, 1)[0];
              if (state.currentIndex >= state.images.length) {
                state.currentIndex = Math.max(0, state.images.length - 1);
              }
            }

            renderReviewGrid();

            if (state.imagesSeen.length === 0) {
              if (typeof ctx.closeZoom === "function") ctx.closeZoom();
              return;
            }

            const nextIndex = Math.min(
              removedReviewIndex,
              state.imagesSeen.length - 1,
            );
            if (typeof ctx.setCurrentIndex === "function")
              ctx.setCurrentIndex(nextIndex);
            if (typeof ctx.setImage === "function")
              ctx.setImage(state.imagesSeen[nextIndex]);
            if (typeof ctx.refresh === "function") ctx.refresh();
          },
          restoreLocal: () => {
            const restoreReviewAt = Math.max(
              0,
              Math.min(removedReviewIndex, state.imagesSeen.length),
            );
            const alreadyInReview = state.imagesSeen.some(
              (img) => imageIdKey !== null && String(img.id) === imageIdKey,
            );
            if (!alreadyInReview) {
              state.imagesSeen.splice(restoreReviewAt, 0, removedReviewImage);
            }

            if (removedStateImage && stateIndex >= 0) {
              const alreadyInState = state.images.some(
                (img) => imageIdKey !== null && String(img.id) === imageIdKey,
              );
              if (!alreadyInState) {
                const restoreStateAt = Math.max(
                  0,
                  Math.min(stateIndex, state.images.length),
                );
                state.images.splice(restoreStateAt, 0, removedStateImage);
              }
            }

            if (imageIdKey) {
              if (
                !state.imagesSeenMetaById ||
                typeof state.imagesSeenMetaById !== "object"
              ) {
                state.imagesSeenMetaById = {};
              }
              if (originalMeta !== undefined) {
                state.imagesSeenMetaById[imageIdKey] = originalMeta;
              } else if (!state.imagesSeenMetaById[imageIdKey]) {
                state.imagesSeenMetaById[imageIdKey] = { duration: 0 };
              }
            }

            renderReviewGrid();
            if (state.imagesSeen.length > 0) {
              const restoreIndex = Math.min(
                restoreReviewAt,
                state.imagesSeen.length - 1,
              );
              if (typeof ctx.setCurrentIndex === "function")
                ctx.setCurrentIndex(restoreIndex);
              if (typeof ctx.setImage === "function")
                ctx.setImage(state.imagesSeen[restoreIndex]);
              if (typeof ctx.refresh === "function") ctx.refresh();
            }
          },
          commitDelete: async () => {
            try {
              if (typeof targetImage.moveToTrash === "function") {
                await targetImage.moveToTrash();
              } else if (
                targetImage?.id !== undefined &&
                targetImage?.id !== null
              ) {
                await platformItemMoveToTrash([targetImage.id]);
              }
            } catch (e) {
              console.error("Erreur suppression:", e);
              try {
                if (targetImage?.id !== undefined && targetImage?.id !== null) {
                  await platformItemMoveToTrash([targetImage.id]);
                }
              } catch (_) {}
            }
          },
        });

        return true;
      },
    });
    return;

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
    window.zoomOverlayCurrentImage = image || null;
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
          <video id="zoom-video" src="${getRuntimeMediaSourceFromItem(image)}"
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
        <img src="${getRuntimeMediaSourceFromItem(image)}"
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
        void openZoomDrawingModeSafely(overlay, image);
      };
    }

    // Bouton Révéler
    const btnReveal = document.createElement("button");
    btnReveal.className = "control-btn-small";
    btnReveal.setAttribute("data-tooltip", i18next.t(getRevealActionI18nKey()));
    btnReveal.innerHTML = ICONS.REVEAL;
    btnReveal.onclick = async () => {
      await platformWindowMinimize();
      await platformItemOpen(image.id);
    };

    // Bouton Supprimer
    const btnDelete = document.createElement("button");
    btnDelete.className = "control-btn-small btn-danger-hover";
    btnDelete.setAttribute("data-tooltip", i18next.t("drawing.deleteImage"));
    btnDelete.innerHTML = ICONS.DELETE;
    btnDelete.onclick = async () => {
      const confirmed = await confirmImageDeletionDialog({
        image,
        container: document.body,
      });
      if (!confirmed) return;

      const imageIdKey =
        image?.id === undefined || image?.id === null ? null : String(image.id);
      const removedReviewIndex = currentZoomIndex;
      const removedReviewImage = image;
      const originalMeta =
        imageIdKey && state.imagesSeenMetaById
          ? state.imagesSeenMetaById[imageIdKey]
          : undefined;
      const stateIndex =
        imageIdKey === null
          ? -1
          : state.images.findIndex((img) => String(img.id) === imageIdKey);
      let removedStateImage = null;

      queueImageDeletionWithUndo({
        image,
        actionId: `delete-image-review-${Date.now()}-${imageIdKey || "noid"}`,
        removeLocal: () => {
          if (
            imageIdKey &&
            state.imagesSeenMetaById?.[imageIdKey] !== undefined
          ) {
            delete state.imagesSeenMetaById[imageIdKey];
          }

          state.imagesSeen.splice(removedReviewIndex, 1);

          if (stateIndex >= 0) {
            removedStateImage = state.images.splice(stateIndex, 1)[0];
            if (state.currentIndex >= state.images.length) {
              state.currentIndex = Math.max(0, state.images.length - 1);
            }
          }

          renderReviewGrid();

          if (state.imagesSeen.length === 0) {
            closeZoom();
          } else {
            currentZoomIndex = Math.min(
              removedReviewIndex,
              state.imagesSeen.length - 1,
            );
            updateZoomContent();
          }
        },
        restoreLocal: () => {
          const restoreReviewAt = Math.max(
            0,
            Math.min(removedReviewIndex, state.imagesSeen.length),
          );
          const alreadyInReview = state.imagesSeen.some(
            (img) => imageIdKey !== null && String(img.id) === imageIdKey,
          );
          if (!alreadyInReview) {
            state.imagesSeen.splice(restoreReviewAt, 0, removedReviewImage);
          }

          if (removedStateImage && stateIndex >= 0) {
            const alreadyInState = state.images.some(
              (img) => imageIdKey !== null && String(img.id) === imageIdKey,
            );
            if (!alreadyInState) {
              const restoreStateAt = Math.max(
                0,
                Math.min(stateIndex, state.images.length),
              );
              state.images.splice(restoreStateAt, 0, removedStateImage);
            }
          }

          if (imageIdKey) {
            if (
              !state.imagesSeenMetaById ||
              typeof state.imagesSeenMetaById !== "object"
            ) {
              state.imagesSeenMetaById = {};
            }
            if (originalMeta !== undefined) {
              state.imagesSeenMetaById[imageIdKey] = originalMeta;
            } else if (!state.imagesSeenMetaById[imageIdKey]) {
              state.imagesSeenMetaById[imageIdKey] = { duration: 0 };
            }
          }

          renderReviewGrid();
          if (currentZoomIndex !== null && state.imagesSeen.length > 0) {
            currentZoomIndex = Math.min(
              restoreReviewAt,
              state.imagesSeen.length - 1,
            );
            updateZoomContent();
          }
        },
        commitDelete: async () => {
          try {
            if (typeof image.moveToTrash === "function") {
              await image.moveToTrash();
            } else if (image?.id !== undefined && image?.id !== null) {
              await platformItemMoveToTrash([image.id]);
            }
          } catch (e) {
            console.error("Erreur suppression:", e);
            try {
              if (image?.id !== undefined && image?.id !== null) {
                await platformItemMoveToTrash([image.id]);
              }
            } catch (_) {}
          }
        },
      });
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
    window.zoomOverlayCurrentImage = null;
    renderReviewGrid();
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
    const hasSystemModifier = e.ctrlKey || e.altKey || e.metaKey;
    const drawingExportKey = String(hk.DRAWING_EXPORT || "s").toLowerCase();
    const zoomOverlayEl = document.getElementById("zoom-overlay");
    const zoomDrawingActive =
      (typeof isZoomDrawingModeActive !== "undefined" &&
        isZoomDrawingModeActive) ||
      !!(
        zoomOverlayEl && zoomOverlayEl.classList.contains("zoom-drawing-active")
      );

    // When zoom drawing is active, disable zoom-toolbar shortcuts and route
    // only drawing-level shortcuts (Escape / Ctrl+S).
    if (zoomDrawingActive) {
      if ((e.ctrlKey || e.metaKey) && keyLow === drawingExportKey) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
        if (typeof window.showExportModal === "function") {
          window.showExportModal("zoom");
        } else if (typeof window.showDrawingExportOptions === "function") {
          window.showDrawingExportOptions();
        } else {
          const zoomExportBtn = document.getElementById("zoom-export-btn");
          if (zoomExportBtn && typeof zoomExportBtn.click === "function") {
            zoomExportBtn.click();
          }
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
        if (typeof closeZoomDrawingMode === "function") {
          closeZoomDrawingMode();
        }
        return;
      }

      return;
    }

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
    } else if (!hasSystemModifier && keyLow === hk.GRAYSCALE.toLowerCase()) {
      e.preventDefault();
      zoomFilters.gray = !zoomFilters.gray;
      updateZoomContent();
    } else if (!hasSystemModifier && keyLow === hk.BLUR.toLowerCase()) {
      e.preventDefault();
      zoomFilters.blur = !zoomFilters.blur;
      updateZoomContent();
    } else if (
      !hasSystemModifier &&
      e.shiftKey &&
      key === hk.SILHOUETTE_MODAL
    ) {
      // Tester SHIFT+S en premier pour ouvrir le modal
      e.preventDefault();
      showSilhouetteConfig();
    } else if (!hasSystemModifier && keyLow === hk.SILHOUETTE.toLowerCase()) {
      // Puis tester S seul pour toggle la silhouette
      e.preventDefault();
      zoomFilters.silhouette = !zoomFilters.silhouette;
      updateZoomContent();
    } else if (
      (!hasSystemModifier && keyLow === hk.ANNOTATE.toLowerCase()) ||
      (!hasSystemModifier && keyLow === hk.DRAWING_TOOL_PENCIL.toLowerCase()) ||
      (!hasSystemModifier && keyLow === "b")
    ) {
      // D ou B pour ouvrir le mode dessin (seulement pour les images)
      // Si le mode dessin est déjà actif, laisser handleZoomDrawingKeydown gérer (B = pencil)
      if (zoomDrawingActive) {
        return;
      }
      e.preventDefault();
      const image = state.imagesSeen[currentZoomIndex];
      if (image && !isVideoFile(image)) {
        const overlay = document.getElementById("zoom-overlay");
        void openZoomDrawingModeSafely(overlay, image);
      }
    } else if (!hasSystemModifier && keyLow === hk.TAGS.toLowerCase()) {
      e.preventDefault();
      if (!isTagsFeatureAvailable()) {
        return;
      }
      if (typeof openTagsModal === "function") {
        const zoomImage = state.imagesSeen[currentZoomIndex] || null;
        openTagsModal(currentZoomIndex, zoomImage);
      }
    }
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
      totalRemainingSeconds = calculateCustomTotalRemainingSeconds(
        state.customQueue,
        state.currentStepIndex,
        state.currentPoseInStep,
        state.timeRemaining,
      );
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
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    if (!isSyncControlModeSharedPause()) {
      return;
    }
    const requestType = state.isPlaying ? "pause" : "play";
    void requestSyncSharedPlayback(
      requestType,
      `participant-toggle-${requestType}`,
    );
    return;
  }

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
  scheduleSyncRuntimeState(state.isPlaying ? "timer-resumed" : "timer-paused", {
    force: true,
  });
  // Note: La vidéo est contrôlée indépendamment via toggleVideoPlayPause()
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  soundBtn.innerHTML = state.soundEnabled ? ICONS.SOUND_ON : ICONS.SOUND_OFF;
  soundBtn.classList.toggle("muted", !state.soundEnabled);
  if (soundBtn) {
    soundBtn.setAttribute(
      "data-tooltip",
      state.soundEnabled
        ? i18next.t("controls.muteSound", { defaultValue: "Mute sound" })
        : i18next.t("controls.unmuteSound", { defaultValue: "Unmute sound" }),
    );
    soundBtn.removeAttribute("title");
  }
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
  const showTagsSection = isTagsFeatureAvailable();
  const tagsSectionMarkup = showTagsSection
    ? image.tags && image.tags.length > 0
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
              ${escapeHtml(tag)}
              <button class="tag-remove-btn" data-tag="${encodeDataToken(tag)}" aria-label="${i18next.t("tags.remove")}">×</button>
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
    : "";

  overlay.innerHTML = `
    <div class="info-grid">
      <div>
        <div class="info-label">Nom</div>
        <div class="info-value">${escapeHtml(image.name || "N/A")}</div>
      </div>
      <div>
        <div class="info-label">Dimensions</div>
        <div class="info-value">${escapeHtml(dimensions)}</div>
      </div>
      <div>
        <div class="info-label">Taille</div>
        <div class="info-value">${escapeHtml(
          image.size ? formatFileSize(image.size) : "N/A",
        )}</div>
      </div>
      ${tagsSectionMarkup}
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
      const tagName = decodeDataToken(btn.dataset.tag);

      try {
        // Récupérer l'item Eagle
        const item = await platformItemGetById(image.id);
        if (!item) throw new Error("Item not found");

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
        showPoseChronoErrorMessage(i18next.t("errors.tagError"));
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

async function openTagsModal(reviewIndex = null, explicitImage = null) {
  if (!isTagsFeatureAvailable()) {
    return;
  }

  const tagsModal = document.getElementById("tags-modal");
  const closeTagsModal = document.getElementById("close-tags-modal");
  const newTagInput = document.getElementById("new-tag-input");
  const createTagBtn = document.getElementById("create-tag-btn");
  const availableTagsList = document.getElementById("available-tags-list");

  if (!tagsModal) return;

  // Déterminer l'image selon le contexte (session ou review)
  let currentImage = explicitImage || null;
  if (!currentImage && reviewIndex !== null) {
    // Mode review : utiliser state.imagesSeen
    currentImage = state.imagesSeen[reviewIndex];
  } else if (!currentImage) {
    // Mode session : utiliser state.images
    currentImage = state.images[state.currentIndex];
  }

  if (!currentImage) return;
  if (!currentImage.id) {
    showPoseChronoErrorMessage(i18next.t("errors.tagError"));
    return;
  }

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
      const tagGroups = await platformTagGroupGet();

      if (!tagGroups || tagGroups.length === 0) {
        return;
      }

      // Récupérer tous les tags pour compter les tags par groupe
      const allTags = await platformTagGet();

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
          <div class="group-item" data-group="${encodeDataToken(group.id)}">
            <span class="group-name">${escapeHtml(group.name)}</span>
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
          selectedGroup = decodeDataToken(item.dataset.group);
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
      const allTags = await platformTagGet();
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
        availableTagsList.innerHTML = `<div class="tags-empty-msg">${i18next.t("tags.noTagsAvailable", { defaultValue: "No tags available. Create a new one above." })}</div>`;
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
          }" data-tag="${encodeDataToken(tagName)}">
            ${
              isActive
                ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>'
                : ""
            }
            ${escapeHtml(tagName)}
          </div>
        `;
        })
        .join("");

      // Gérer les clics sur les tags
      availableTagsList.querySelectorAll(".tag-item").forEach((tagItem) => {
        tagItem.addEventListener("click", async () => {
          const tagName = decodeDataToken(tagItem.dataset.tag);
          const isActive = tagItem.classList.contains("active");

          try {
            // Récupérer l'item Eagle
            const item = await platformItemGetById(currentImage.id);
            if (!item) throw new Error("Item not found");

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
            showPoseChronoErrorMessage(i18next.t("errors.tagError"));
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
      availableTagsList.innerHTML = `<div class="tags-error-msg">${i18next.t("errors.tagError")}</div>`;
    }
  }

  // Créer un nouveau tag
  async function createNewTag() {
    const tagName = newTagInput.value.trim();
    if (!tagName) return;

    try {
      // Récupérer l'item Eagle
      const item = await platformItemGetById(currentImage.id);
      if (!item) throw new Error("Item not found");

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
      showPoseChronoErrorMessage(i18next.t("errors.creationError"));
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
        let displayTag = escapeHtml(tag);

        if (startIndex !== -1 && searchTerm) {
          const before = tag.substring(0, startIndex);
          const match = tag.substring(
            startIndex,
            startIndex + searchTerm.length,
          );
          const after = tag.substring(startIndex + searchTerm.length);
          displayTag = `${escapeHtml(before)}<span class="highlight">${escapeHtml(match)}</span>${escapeHtml(after)}`;
        }

        return `<div class="autocomplete-item" data-index="${index}" data-tag="${encodeDataToken(tag)}">${displayTag}</div>`;
      })
      .join("");

    autocompleteEl.classList.remove("hidden");
    selectedAutocompleteIndex = -1;

    // Event listeners pour les clics
    autocompleteEl.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("click", async () => {
        newTagInput.value = decodeDataToken(item.dataset.tag);
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
      const allTags = await platformTagGet();
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
          newTagInput.value = decodeDataToken(
            items[selectedAutocompleteIndex].dataset.tag,
          );
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
    if (await platformClipboardCopyFiles([image.filePath])) {
      console.log("Fichier image copié dans le presse-papier");

      // Notification de succès
      platformNotify({
        title: i18next.t("notifications.imageCopied"),
        body: i18next.t("notifications.imageCopiedToClipboard"),
        duration: 2000,
        mute: true,
      });
      return;
    }

    // Fallback : méthode navigateur standard
    const response = await fetch(getRuntimeMediaSourceFromItem(image));
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    console.log(i18next.t("notifications.imageCopiedToClipboard"));

    // Notification de succès (fallback)
    platformNotify({
      title: i18next.t("notifications.imageCopied"),
      body: i18next.t("notifications.imageCopiedToClipboard"),
      duration: 2000,
      mute: true,
    });
  } catch (err) {
    console.error("Erreur lors de la copie:", err);
  }
}

async function openImageInExplorer() {
  const image = state.images[state.currentIndex];
  if (!image) return;

  try {
    // Utiliser l'API Eagle pour ouvrir dans l'explorateur
    if (await platformShellShowItemInFolder(image.filePath)) {
      return;
    }
    if (await platformItemShowInFolder(image.id)) {
      return;
    } else {
      // Fallback: ouvrir directement le fichier
      window.open(getRuntimeMediaSourceFromItem(image));
    }
  } catch (e) {
    console.error("Erreur ouverture explorateur:", e);
    // Dernier fallback
    try {
      window.open(getRuntimeMediaSourceFromItem(image));
    } catch (err) {
      console.error("Fallback échoué:", err);
    }
  }
}

async function revealImage() {
  if (isDesktopStandaloneRuntime()) {
    await openImageInExplorer();
    return;
  }

  const image = state.images[state.currentIndex];
  if (image) {
    try {
      const wasPlaying = state.isPlaying;
      if (wasPlaying) {
        state.isPlaying = false;
        updatePlayPauseIcon();
        stopTimer();
      }
      await platformWindowMinimize();
      await platformItemOpen(image.id);
    } catch (e) {
      console.error("Erreur reveal:", e);
    }
  }
}

async function deleteImage() {
  const image = state.images[state.currentIndex];
  if (!image) return;

  const confirmed = await confirmImageDeletionDialog({
    image,
    container: drawingScreen || document.body,
  });
  if (!confirmed) return;

  const imageId = image?.id;
  const imageIdKey =
    imageId === undefined || imageId === null ? null : String(imageId);

  const originalIndex = state.currentIndex;
  const originalSeenIndex =
    imageIdKey === null
      ? -1
      : state.imagesSeen.findIndex((img) => String(img.id) === imageIdKey);
  const originalSeenImage =
    originalSeenIndex >= 0 ? state.imagesSeen[originalSeenIndex] : null;
  const originalMeta =
    imageIdKey && state.imagesSeenMetaById
      ? state.imagesSeenMetaById[imageIdKey]
      : undefined;
  const wasPlayingBeforeDelete = state.isPlaying;

  queueImageDeletionWithUndo({
    image,
    actionId: `delete-image-main-${Date.now()}-${imageIdKey || "noid"}`,
    removeLocal: () => {
      state.images.splice(originalIndex, 1);

      if (originalSeenIndex >= 0) {
        state.imagesSeen.splice(originalSeenIndex, 1);
      }

      if (imageIdKey && state.imagesSeenMetaById?.[imageIdKey] !== undefined) {
        delete state.imagesSeenMetaById[imageIdKey];
      }

      if (state.images.length === 0) {
        stopTimer();
        if (drawingScreen) drawingScreen.classList.add("hidden");
        if (reviewScreen) reviewScreen.classList.add("hidden");
        if (settingsScreen) settingsScreen.classList.remove("hidden");
        document.body.classList.remove("review-active");
        if (folderInfo) {
          folderInfo.textContent = i18next.t("settings.noImagesFound");
        }
        return;
      }

      if (state.currentIndex >= state.images.length) {
        state.currentIndex = state.images.length - 1;
      }
      state.timeRemaining = state.selectedDuration;
      updateDisplay();
    },
    restoreLocal: () => {
      const restoreAt = Math.max(
        0,
        Math.min(originalIndex, state.images.length),
      );
      state.images.splice(restoreAt, 0, image);

      if (originalSeenImage) {
        const alreadySeen = state.imagesSeen.some(
          (img) => String(img.id) === imageIdKey,
        );
        if (!alreadySeen) {
          const restoreSeenAt = Math.max(
            0,
            Math.min(originalSeenIndex, state.imagesSeen.length),
          );
          state.imagesSeen.splice(restoreSeenAt, 0, originalSeenImage);
        }
      }

      if (imageIdKey) {
        if (
          !state.imagesSeenMetaById ||
          typeof state.imagesSeenMetaById !== "object"
        ) {
          state.imagesSeenMetaById = {};
        }
        if (originalMeta !== undefined) {
          state.imagesSeenMetaById[imageIdKey] = originalMeta;
        } else if (!state.imagesSeenMetaById[imageIdKey]) {
          state.imagesSeenMetaById[imageIdKey] = { duration: 0 };
        }
      }

      state.currentIndex = restoreAt;
      state.timeRemaining = state.selectedDuration;

      if (settingsScreen && !settingsScreen.classList.contains("hidden")) {
        settingsScreen.classList.add("hidden");
        if (reviewScreen) reviewScreen.classList.add("hidden");
        if (drawingScreen) drawingScreen.classList.remove("hidden");
      }

      updateDisplay();
      if (wasPlayingBeforeDelete && !state.isPlaying) {
        startTimer();
      }
    },
    commitDelete: async () => {
      try {
        if (typeof image.moveToTrash === "function") {
          await image.moveToTrash();
        } else if (imageId !== undefined && imageId !== null) {
          await platformItemMoveToTrash([imageId]);
        }
      } catch (e) {
        console.error("Erreur suppression:", e);
        try {
          if (imageId !== undefined && imageId !== null) {
            await platformItemMoveToTrash([imageId]);
          }
        } catch (err) {}
      }

      if (state.images.length === 0) {
        showPoseChronoErrorMessage(i18next.t("settings.noImagesFound"));
        location.reload();
      }
    },
  });
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
    const hInput = DOMCache.customHInput;
    const mInput = DOMCache.customMInput;
    const sInput = DOMCache.customSInput;
    const countInput = DOMCache.customCountInput;

    const {
      hours: h,
      minutes: m,
      seconds: s,
      totalSeconds: parsedTotalSeconds,
    } = readHmsInputValues(hInput, mInput, sInput);

    let totalSeconds = parsedTotalSeconds;

    // LOGIQUE PAUSE PAR DÉFAUT
    if (isPause && totalSeconds === 0) {
      totalSeconds = 300;
    }

    const nextStep = createCustomQueueStep({
      isPause,
      duration: totalSeconds,
      count: parseIntegerValue(countInput?.value, 5),
      now: () => Date.now(),
    });

    if (nextStep) {
      state.customQueue.push(nextStep);

      // On vide les champs
      if (hInput) hInput.value = "";
      if (mInput) mInput.value = "";
      if (sInput) sInput.value = "";

      renderCustomQueue();
      updateStartButtonState();
      scheduleSyncRuntimeState("custom-queue-updated");
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
  const container =
    DOMCache.customStepsList || document.getElementById("custom-steps-list");
  if (!container) return;

  if (state.customQueue.length === 0) {
    container.innerHTML = `<div class="empty-queue-msg">${i18next.t("modes.custom.emptyQueueMsg")}</div>`;
    updateTotalDisplay(0);
    customQueueScroller = null;
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
      const stepModel = getCustomStepDisplayModel(step);
      const isPause = stepModel.isPause;
      const groupTotalSeconds = stepModel.groupTotalSeconds;
      const h = stepModel.hours;
      const m = stepModel.minutes;
      const s = stepModel.seconds;
      const modifier = isPause ? "step-item--pause" : "step-item--pose";

      return `
        <div class="step-item ${modifier} step-item--virtual" data-step-index="${index}">
            <div class="step-item-left">
                <div class="drag-handle step-item-drag-handle" draggable="true" data-step-index="${index}">⋮⋮</div>
                ${
                  isPause
                    ? `<span class="step-item-pause-label">☕ PAUSE</span>`
                    : `<input type="number" value="${step.count}" min="1"
                            data-step-index="${index}" data-step-field="count"
                            class="step-item-pose-count">
                     <span class="step-item-poses-of">Poses de</span>`
                }
                <div class="hms-group step-item-hms">
                    <input type="number" value="${h}" min="0" data-step-index="${index}" data-step-hms="h">
                    <span class="step-item-hms-sep">h</span>
                    <input type="number" value="${m}" min="0" max="59" data-step-index="${index}" data-step-hms="m">
                    <span class="step-item-hms-sep">m</span>
                    <input type="number" value="${s}" min="0" max="59" data-step-index="${index}" data-step-hms="s">
                    <span class="step-item-hms-sep">s</span>
                </div>
            </div>
            <div class="step-item-right">
                <span class="step-item-total">TOTAL: ${formatTime(groupTotalSeconds)}</span>
                <button data-remove-step="${index}" class="step-item-remove">✕</button>
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
        const stepModel = getCustomStepDisplayModel(step);
        const isPause = stepModel.isPause;
        const groupTotalSeconds = stepModel.groupTotalSeconds;
        totalSessionSeconds += groupTotalSeconds;
        const h = stepModel.hours;
        const m = stepModel.minutes;
        const s = stepModel.seconds;
        const modifier = isPause ? "step-item--pause" : "step-item--pose";

        return `
          <div class="step-item ${modifier}" data-step-index="${index}">
              <div class="step-item-left">
                  <div class="drag-handle step-item-drag-handle" draggable="true" data-step-index="${index}">⋮⋮</div>
                  ${
                    isPause
                      ? `<span class="step-item-pause-label">☕ PAUSE</span>`
                      : `<input type="number" value="${step.count}" min="1"
                              data-step-index="${index}" data-step-field="count"
                              class="step-item-pose-count">
                       <span class="step-item-poses-of">Poses de</span>`
                  }
                  <div class="hms-group step-item-hms">
                      <input type="number" value="${h}" min="0" data-step-index="${index}" data-step-hms="h">
                      <span class="step-item-hms-sep">h</span>
                      <input type="number" value="${m}" min="0" max="59" data-step-index="${index}" data-step-hms="m">
                      <span class="step-item-hms-sep">m</span>
                      <input type="number" value="${s}" min="0" max="59" data-step-index="${index}" data-step-hms="s">
                      <span class="step-item-hms-sep">s</span>
                  </div>
              </div>
              <div class="step-item-right">
                  <span class="step-item-total">TOTAL: ${formatTime(groupTotalSeconds)}</span>
                  <button data-remove-step="${index}" class="step-item-remove">✕</button>
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
    const totalSessionSeconds = calculateCustomQueueTotalSeconds(
      state.customQueue,
    );
    updateTotalDisplay(totalSessionSeconds);
  }
}

function updateCustomStepRowDisplay(index) {
  const container =
    DOMCache.customStepsList || document.getElementById("custom-steps-list");
  if (!container) return;
  const row = container.querySelector(`.step-item[data-step-index="${index}"]`);
  if (!row) return;

  const step = state.customQueue[index];
  if (!step) return;

  const stepModel = getCustomStepDisplayModel(step);
  const totalEl = row.querySelector(".step-item-total");
  if (totalEl) {
    totalEl.textContent = `TOTAL: ${formatTime(stepModel.groupTotalSeconds)}`;
  }
}

function refreshCustomQueueTotalsLive(index) {
  updateCustomStepRowDisplay(index);
  const totalSessionSeconds = calculateCustomQueueTotalSeconds(state.customQueue);
  updateTotalDisplay(totalSessionSeconds);
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
        const item = await platformItemGetById(id);
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
    state.images = filterSessionMediaItems(items);

    // Sauvegarder l'ordre original
    state.originalImages = [...state.images];

    // Réinitialiser le cache
    imageCache.clear();

    // Mélanger si l'option est activée
    if (state.randomShuffle && state.images.length > 1) {
      state.images = shuffleSessionMediaItems(state.images);
    }

    const replayOptions = normalizeSessionReplayLoadOptions(options);

    // Configurer le mode de session
    if (replayOptions.mode) {
      // Utiliser switchMode pour gérer correctement l'affichage des panneaux
      if (typeof switchMode === "function") {
        switchMode(replayOptions.mode);
      } else {
        // Fallback si switchMode n'est pas disponible
        state.sessionMode = replayOptions.mode;
        document.querySelectorAll("[data-mode]").forEach((btn) => {
          btn.classList.toggle(
            "active",
            btn.dataset.mode === replayOptions.mode,
          );
        });
      }
    }

    // Restaurer la custom queue si mode custom
    if (
      replayOptions.mode === "custom" &&
      replayOptions.customQueue &&
      replayOptions.customQueue.length > 0
    ) {
      state.customQueue = [...replayOptions.customQueue];
      // Rafraîchir l'affichage de la custom queue
      if (typeof renderCustomQueue === "function") {
        renderCustomQueue();
      }
    }

    // Restaurer le type de mémoire si mode memory
    if (replayOptions.mode === "memory" && replayOptions.memoryType) {
      state.memoryType = replayOptions.memoryType;
      // Mettre à jour l'UI du type de mémoire
      document.querySelectorAll("[data-memory-type]").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.dataset.memoryType === replayOptions.memoryType,
        );
      });
    }

    // Configurer la durée si fournie
    if (replayOptions.duration) {
      state.selectedDuration = replayOptions.duration;
      const durationInput = document.getElementById("duration-input");
      if (durationInput) {
        durationInput.value = state.selectedDuration;
      }
    }

    // Mettre à jour l'affichage
    const folderInfo = document.getElementById("folder-info");
    if (folderInfo) {
      const mediaCounts = countSessionMediaTypes(state.images);
      const imageCount = mediaCounts.imageCount;
      const videoCount = mediaCounts.videoCount;

      const countMessage = formatSessionMediaCountLabel({
        imageCount,
        videoCount,
      });

      folderInfo.innerHTML = `<span class="success-text">${i18next.t("settings.loadedFromSession", { count: countMessage })}</span>`;
    }

    // Mettre à jour l'état du bouton start
    updateStartButtonState();

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

// Met à jour les heures, minutes ou secondes d'une ligne
window.updateStepHMS = function (index, type, value) {
  const step = state.customQueue[index];
  if (!step) return;

  const result = updateCustomStepDurationFromUnit(step, type, value, 1);
  if (!result.updated) return;

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

  if (isCustomStepInputScrubbing) {
    hasCustomStepInputScrubChanges = true;
    refreshCustomQueueTotalsLive(index);
    return;
  }

  // === Relancer le rendu pour actualiser tous les affichages (totaux, inputs, etc.) ===
  renderCustomQueue();
  scheduleSyncRuntimeState("custom-queue-updated");

  if (typeof saveCustomQueue === "function") saveCustomQueue();
};

function updateTotalDisplay(totalSeconds) {
  let totalDiv = document.getElementById("custom-total-duration");
  const container = document.getElementById("custom-steps-list");

  if (!totalDiv) {
    totalDiv = document.createElement("div");
    totalDiv.id = "custom-total-duration";
    totalDiv.className = "custom-total-duration";
    container.parentNode.insertBefore(totalDiv, container.nextSibling);
  }

  totalDiv.style.display = "";
  totalDiv.innerHTML = `${i18next.t("modes.custom.totalDuration")} : <b>${formatTime(
    totalSeconds,
  )}</b>`;
}

window.removeStepFromQueue = function (index) {
  state.customQueue.splice(index, 1);
  renderCustomQueue();
  updateStartButtonState();
  scheduleSyncRuntimeState("custom-queue-updated");
};

function updateStartButtonState() {
  if (!SESSION_MODE_UI_UTILS?.resolveStartButtonUiState) {
    logMissingShared("SESSION_MODE_UI_UTILS.resolveStartButtonUiState");
    return;
  }
  const startState = SESSION_MODE_UI_UTILS.resolveStartButtonUiState({
    sessionMode: state.sessionMode,
    customQueueLength: state.customQueue.length,
    selectedDuration: state.selectedDuration,
    imagesCount: Array.isArray(state.images) ? state.images.length : 0,
  });
  startBtn.disabled = !!startState.disabled;
  startBtn.style.opacity = startState.opacity;

  // Disable progressive blur button in relax mode
  if (homeProgressiveBlurBtn) {
    if (!SESSION_MODE_UI_UTILS?.resolveHomeProgressiveBlurState) {
      logMissingShared("SESSION_MODE_UI_UTILS.resolveHomeProgressiveBlurState");
      return;
    }
    const relaxState = SESSION_MODE_UI_UTILS.resolveHomeProgressiveBlurState(
      state.sessionMode,
    );
    homeProgressiveBlurBtn.disabled = !!relaxState.disabled;
    homeProgressiveBlurBtn.style.opacity = relaxState.opacity;
    homeProgressiveBlurBtn.classList.toggle(
      "disabled",
      !!relaxState.classDisabled,
    );
  }
}

function parseIntegerValue(value, fallback = 0) {
  if (!SESSION_TIME_INPUT_UTILS?.toInt) {
    logMissingShared("SESSION_TIME_INPUT_UTILS.toInt");
    return Number(fallback) || 0;
  }
  return SESSION_TIME_INPUT_UTILS.toInt(value, fallback);
}

function clampIntegerValue(value, min, max, fallback = 0) {
  if (!SESSION_TIME_INPUT_UTILS?.clampInt) {
    logMissingShared("SESSION_TIME_INPUT_UTILS.clampInt");
    return parseIntegerValue(value, fallback);
  }
  return SESSION_TIME_INPUT_UTILS.clampInt(value, min, max, fallback);
}

function readInputNumberBound(input, attrName, fallback = 0) {
  if (!SESSION_TIME_INPUT_UTILS?.readInputBound) {
    logMissingShared("SESSION_TIME_INPUT_UTILS.readInputBound");
    return Number(fallback) || 0;
  }
  return SESSION_TIME_INPUT_UTILS.readInputBound(input, attrName, fallback);
}

function readHmsInputValues(hoursInput, minutesInput, secondsInput) {
  if (!SESSION_TIME_INPUT_UTILS?.readHmsInputs) {
    logMissingShared("SESSION_TIME_INPUT_UTILS.readHmsInputs");
    return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  }
  return SESSION_TIME_INPUT_UTILS.readHmsInputs(
    hoursInput,
    minutesInput,
    secondsInput,
  );
}

function readMinutesSecondsInputValues(minutesInput, secondsInput) {
  if (!SESSION_TIME_INPUT_UTILS?.readMinutesSecondsInputs) {
    logMissingShared("SESSION_TIME_INPUT_UTILS.readMinutesSecondsInputs");
    return { minutes: 0, seconds: 0, totalSeconds: 0 };
  }
  return SESSION_TIME_INPUT_UTILS.readMinutesSecondsInputs(
    minutesInput,
    secondsInput,
  );
}

function hmsToTotalSeconds(hours, minutes, seconds) {
  if (!SESSION_TIME_INPUT_UTILS?.hmsToSeconds) {
    logMissingShared("SESSION_TIME_INPUT_UTILS.hmsToSeconds");
    return 0;
  }
  return SESSION_TIME_INPUT_UTILS.hmsToSeconds(hours, minutes, seconds);
}

function resolveProgressiveBlurControlState(disabled, keepActive = false) {
  if (!SESSION_MODE_UI_UTILS?.resolveProgressiveBlurControlState) {
    logMissingShared(
      "SESSION_MODE_UI_UTILS.resolveProgressiveBlurControlState",
    );
    return {
      disabled: !!disabled,
      opacity: "1",
      pointerEvents: "all",
      shouldClearActive: false,
    };
  }
  return SESSION_MODE_UI_UTILS.resolveProgressiveBlurControlState({
    disabled,
    keepActive,
  });
}

function applyProgressiveBlurControlState(button, controlState) {
  if (!button || !controlState) return;
  if (controlState.shouldClearActive) {
    button.classList.remove("active");
  }
  button.style.opacity = controlState.opacity;
  button.style.pointerEvents = controlState.pointerEvents;
}

function getDurationFromButton(button, fallback = 0) {
  if (!SESSION_DURATION_BUTTONS_UTILS?.getButtonDuration) {
    logMissingShared("SESSION_DURATION_BUTTONS_UTILS.getButtonDuration");
    return Number(fallback) || 0;
  }
  return SESSION_DURATION_BUTTONS_UTILS.getButtonDuration(button, fallback);
}

function clearDurationButtonsActive(buttons) {
  if (!SESSION_DURATION_BUTTONS_UTILS?.clearActiveDurationButtons) {
    logMissingShared(
      "SESSION_DURATION_BUTTONS_UTILS.clearActiveDurationButtons",
    );
    return;
  }
  SESSION_DURATION_BUTTONS_UTILS.clearActiveDurationButtons(buttons);
}

function toggleDurationButtonsForValue(buttons, activeDuration) {
  if (!SESSION_DURATION_BUTTONS_UTILS?.setActiveDurationButtons) {
    logMissingShared("SESSION_DURATION_BUTTONS_UTILS.setActiveDurationButtons");
    return;
  }
  SESSION_DURATION_BUTTONS_UTILS.setActiveDurationButtons(
    buttons,
    activeDuration,
  );
}

function syncClassicDurationButtons(classicPanel) {
  const classicBtns = classicPanel?.querySelectorAll(".duration-btn");
  toggleDurationButtonsForValue(classicBtns, state.selectedDuration);
}

function resolveMemoryDurationTarget(
  memoryType,
  memoryDuration,
  selectedDuration,
) {
  if (!SESSION_MODE_UI_UTILS?.resolveMemoryDurationTarget) {
    logMissingShared("SESSION_MODE_UI_UTILS.resolveMemoryDurationTarget");
    return {
      memoryType: "flash",
      duration: Number(memoryDuration) || Number(selectedDuration) || 0,
    };
  }
  return SESSION_MODE_UI_UTILS.resolveMemoryDurationTarget({
    memoryType,
    memoryDuration,
    selectedDuration,
  });
}

function syncMemoryDurationButtons() {
  const target = resolveMemoryDurationTarget(
    state.memoryType,
    state.memoryDuration,
    state.selectedDuration,
  );
  const memoryFlashBtns =
    memoryFlashSettings?.querySelectorAll(".duration-btn");
  const memoryProgressiveBtns =
    memoryProgressiveSettings?.querySelectorAll(".duration-btn");
  if (target.memoryType === "flash") {
    toggleDurationButtonsForValue(memoryFlashBtns, target.duration);
    return;
  }
  toggleDurationButtonsForValue(memoryProgressiveBtns, target.duration);
}

function resolveModeTransitionPlan(mode, previousMode) {
  if (!SESSION_MODE_UI_UTILS?.resolveModeTransition) {
    logMissingShared("SESSION_MODE_UI_UTILS.resolveModeTransition");
    return {
      mode: String(mode || "classique").toLowerCase(),
      isRelax: false,
      incomingPanelKey: "classique",
      outgoingPanelKey: null,
      hideAllPanelsFirst: false,
      relaxFrozenPanelKey: null,
      disableProgressiveBlur: false,
    };
  }
  return SESSION_MODE_UI_UTILS.resolveModeTransition(mode, previousMode);
}

function switchMode(mode) {
  if (isSyncSessionParticipantActive() && !syncRuntimeApplyInProgress) {
    return;
  }
  const classicPanel = document.getElementById("mode-classique-settings");
  const customPanel = document.getElementById("mode-custom-settings");
  const memoryPanel = document.getElementById("mode-memory-settings");
  const descEl = document.getElementById("session-description");
  const container = document.querySelector(".settings-modes-container");

  if (!classicPanel || !customPanel || !memoryPanel) return;
  refreshSessionDescription(mode, descEl);
  if (state.sessionMode === mode) return;

  const previousMode = state.sessionMode;
  const transitionPlan = resolveModeTransitionPlan(mode, previousMode);
  const panelByKey = {
    classique: classicPanel,
    custom: customPanel,
    memory: memoryPanel,
  };

  state.sessionMode = mode;

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  classicPanel.classList.remove("mode-frozen");
  customPanel.classList.remove("mode-frozen");
  memoryPanel.classList.remove("mode-frozen");

  if (transitionPlan.isRelax) {
    const activePanel =
      panelByKey[transitionPlan.relaxFrozenPanelKey] || classicPanel;
    activePanel.classList.add("mode-frozen");
    activePanel.style.display = "block";
    activePanel.classList.add("fade-in");
    activePanel.classList.remove("fade-out");
  } else {
    let incoming = panelByKey[transitionPlan.incomingPanelKey] || null;
    let outgoing = panelByKey[transitionPlan.outgoingPanelKey] || null;

    if (mode === "classique") {
      syncClassicDurationButtons(classicPanel);
    } else if (mode === "custom" && typeof renderCustomQueue === "function") {
      renderCustomQueue();
    }

    // Garder les états de boutons mémoire synchronisés même hors mode mémoire
    syncMemoryDurationButtons();

    if (transitionPlan.hideAllPanelsFirst) {
      [classicPanel, customPanel, memoryPanel].forEach((panel) => {
        panel.classList.remove("mode-frozen");
        panel.style.display = "none";
        panel.classList.add("fade-out");
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
      applyScrubbableBehavior(document);
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
  applyScrubbableBehavior(document);

  if (transitionPlan.disableProgressiveBlur) {
    const disabledState = resolveProgressiveBlurControlState(true, false);
    applyProgressiveBlurControlState(progressiveBlurBtn, disabledState);
    applyProgressiveBlurControlState(homeProgressiveBlurBtn, disabledState);
  } else {
    if (progressiveBlurBtn && !state.isBlurEnabled) {
      const enabledState = resolveProgressiveBlurControlState(false, true);
      applyProgressiveBlurControlState(progressiveBlurBtn, enabledState);
    }
    if (homeProgressiveBlurBtn && !state.isBlurEnabled) {
      const enabledState = resolveProgressiveBlurControlState(false, true);
      applyProgressiveBlurControlState(homeProgressiveBlurBtn, enabledState);
    }
  }

  scheduleSyncRuntimeState("mode-changed", { force: true });
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
  if (!SESSION_TIME_FORMAT_UTILS?.formatCompactDuration) {
    logMissingShared("SESSION_TIME_FORMAT_UTILS.formatCompactDuration");
    return "0s";
  }
  return SESSION_TIME_FORMAT_UTILS.formatCompactDuration(seconds);
}

function handleCustomNext() {
  const advanced = advanceCustomSessionCursor(
    state.customQueue,
    state.currentStepIndex,
    state.currentPoseInStep,
  );

  if (advanced.finished) {
    stopTimer();
    showReview();
    return;
  }

  state.currentStepIndex = advanced.currentStepIndex;
  state.currentPoseInStep = advanced.currentPoseInStep;

  if (advanced.soundCue) {
    playSound(advanced.soundCue);
  }

  const nextStep = advanced.nextStep;
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
  scheduleSyncRuntimeState("custom-step-next", { force: true });
}

window.updateStep = function (index, field, value) {
  const step = state.customQueue[index];
  if (!step) return;
  const updated = updateCustomStepPositiveIntField(step, field, value, 1);
  if (!updated.updated) return;

  if (isCustomStepInputScrubbing) {
    hasCustomStepInputScrubChanges = true;
    refreshCustomQueueTotalsLive(index);
    return;
  }

  renderCustomQueue();
  scheduleSyncRuntimeState("custom-queue-updated");
};

function makeInputScrubbable(input) {
  if (!input || input.dataset.scrubbed) return;
  input.dataset.scrubbed = "true";

  let startX, startVal, currentVal;
  const baseScrubSensitivity = Math.max(
    1,
    Number(UI_CONSTANTS?.SCRUB_SENSITIVITY) || 1,
  );
  const altSensitivityMultiplier = 6;
  const shiftSnapStep = 5;
  const isCustomStepInput =
    input.hasAttribute("data-step-index") &&
    (input.hasAttribute("data-step-hms") ||
      input.hasAttribute("data-step-field"));
  input.style.cursor = "ew-resize";

  input.onmousedown = (e) => {
    startX = e.clientX;
    startVal = parseIntegerValue(input.value, 0);
    currentVal = startVal;

    if (isCustomStepInput) {
      isCustomStepInputScrubbing = true;
      hasCustomStepInputScrubChanges = false;
    }

    const onMouseMove = (e) => {
      const effectiveSensitivity = e.altKey
        ? baseScrubSensitivity * altSensitivityMultiplier
        : baseScrubSensitivity;
      let delta = Math.round((e.clientX - startX) / effectiveSensitivity);
      let newVal = startVal + delta;

      if (e.shiftKey && delta !== 0) {
        newVal =
          delta > 0
            ? Math.ceil(newVal / shiftSnapStep) * shiftSnapStep
            : Math.floor(newVal / shiftSnapStep) * shiftSnapStep;
      }
      const min = readInputNumberBound(input, "min", 0);
      const max = readInputNumberBound(input, "max", 999);
      const clampedValue = clampIntegerValue(newVal, min, max, min);

      if (clampedValue === currentVal) return;
      currentVal = clampedValue;
      input.value = clampedValue;

      // Utilisation de la version debouncée pour éviter trop d'appels
      debouncedChronoSync();

      // On garde ça pour la forme
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "default";

      if (isCustomStepInput) {
        const shouldFlush = hasCustomStepInputScrubChanges;
        isCustomStepInputScrubbing = false;
        hasCustomStepInputScrubChanges = false;

        if (shouldFlush) {
          renderCustomQueue();
          scheduleSyncRuntimeState("custom-queue-updated");
          if (typeof saveCustomQueue === "function") saveCustomQueue();
        }
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "ew-resize";
  };
}

function applyScrubbableBehavior(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  root.querySelectorAll('input[type="number"]').forEach((input) => {
    if (!input || input.dataset.noScrub === "true") return;
    if (input.closest(".drag-handle")) return;
    makeInputScrubbable(input);
  });
}

// DRAG

window.dragStep = function (e, index) {
  dragSourceIndex = parseIntegerValue(index, -1);
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

window.dropStep = function (e, targetIndex, targetElement = null) {
  e.preventDefault();

  let sIdx = dragSourceIndex;
  if (sIdx === null) {
    sIdx = parseIntegerValue(e.dataTransfer.getData("text/plain"), -1);
  }

  const tIdx = parseIntegerValue(targetIndex, -1);
  if (sIdx < 0 || tIdx < 0) return;

  const dropTargetElement = targetElement || e.currentTarget;
  if (
    !dropTargetElement ||
    typeof dropTargetElement.getBoundingClientRect !== "function"
  ) {
    return;
  }
  const rect = dropTargetElement.getBoundingClientRect();
  const isBelow = e.clientY - rect.top > rect.height / 2;

  const result = applyCustomQueueDropOperation(
    state.customQueue,
    sIdx,
    tIdx,
    isBelow,
    isDuplicatingWithAlt,
  );

  if (result.changed) {
    renderCustomQueue();
    scheduleSyncRuntimeState("custom-queue-updated");
  } else {
    handleDragEnd();
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
  const isGridEnabled = UIPreferences.get(
    "backgroundGridEnabled",
    typeof CONFIG !== "undefined" ? !!(CONFIG?.backgroundGrid ?? false) : false,
  );
  document.body.classList.toggle("grid-enabled", !!isGridEnabled);

  applyScrubbableBehavior(document);

  const shouldReopenSync = localStorage.getItem('posechrono-reopen-sync-modal');
  if (shouldReopenSync === 'true') {
    localStorage.removeItem('posechrono-reopen-sync-modal');
    const savedRole = localStorage.getItem('posechrono-reopen-sync-modal-role');
    localStorage.removeItem('posechrono-reopen-sync-modal-role');
    if (savedRole === 'join' || savedRole === 'host') {
      syncSessionModalRole = savedRole;
    }
    setTimeout(() => {
      if (typeof openSyncSessionModal === 'function' && isSyncFeatureEnabled()) {
        openSyncSessionModal();
      }
    }, 400);
  }

  const shouldReopenSettings = localStorage.getItem('posechrono-reopen-global-settings-modal');
  if (shouldReopenSettings === 'true') {
    localStorage.removeItem('posechrono-reopen-global-settings-modal');
    setTimeout(() => {
      if (typeof openGlobalSettingsModal === 'function') {
        openGlobalSettingsModal();
      }
    }, 400);
  }

  const shouldShowResetSettingsToast = localStorage.getItem(
    "posechrono-show-reset-settings-toast",
  );
  if (shouldShowResetSettingsToast === "true") {
    localStorage.removeItem("posechrono-show-reset-settings-toast");
    setTimeout(() => {
      if (typeof window.showPoseChronoToast === "function") {
        window.showPoseChronoToast({
          type: "success",
          message: i18next.t("settings.global.resetSettingsDone", {
            defaultValue: "All settings reset to defaults.",
          }),
          duration: 1800,
        });
      }
    }, 500);
  }
});

function updateButtonLabels() {
  const hk = CONFIG.HOTKEYS;
  const soundTooltip = state.soundEnabled
    ? i18next.t("controls.muteSound", { defaultValue: "Mute sound" })
    : i18next.t("controls.unmuteSound", { defaultValue: "Unmute sound" });

  const labels = {
    "autoflip-btn": i18next.t("filters.autoFlipTooltip"),
    "home-progressive-blur-btn": i18next.t("filters.progressiveBlurHome"),
    "sound-btn": soundTooltip,
    "flip-horizontal-btn":
      i18next.t("drawing.flipHorizontal") + ` (${hk.FLIP_H})`,
    "grayscale-btn": i18next.t("filters.grayscaleTooltip", {
      hotkey: hk.GRAYSCALE.toUpperCase(),
    }),
    "blur-btn": i18next.t("filters.blurTooltip", {
      hotkey: hk.BLUR.toUpperCase(),
    }),
    "progressive-blur-btn": i18next.t("filters.progressiveBlurTooltip"),
    "prev-btn": i18next.t("drawing.previousTooltip"),
    "next-btn": i18next.t("drawing.nextTooltip"),
    "play-pause-btn": i18next.t("controls.playPauseTooltip"),
    "flip-vertical-btn": i18next.t("drawing.flipVertical"),
    "annotate-btn": i18next.t("drawing.annotateTooltip", {
      hotkey: hk.ANNOTATE.toUpperCase(),
    }),
    "grid-btn": i18next.t("filters.gridTooltip", {
      hotkey: hk.GRID.toUpperCase(),
    }),
    "silhouette-btn": i18next.t("filters.silhouetteTooltip", {
      hotkey: hk.SILHOUETTE.toUpperCase(),
    }),
    "reveal-btn": i18next.t(getRevealActionI18nKey()),
    "delete-btn": i18next.t("drawing.deleteImage"),
    "stop-btn": i18next.t("timer.endSession"),
    "settings-btn": i18next.t("sidebar.config.settings"),
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
let activeTooltipTarget = null;
let activeTooltipFollowCursor = false;
let tooltipPointerX = 0;
let tooltipPointerY = 0;

const positionTooltipForTarget = (target) => {
  if (!target) return;
  let left = 0;
  let top = 0;
  if (activeTooltipFollowCursor) {
    left = tooltipPointerX + 14;
    top = tooltipPointerY + 16;
    if (left + tooltip.offsetWidth > window.innerWidth - 10) {
      left = tooltipPointerX - tooltip.offsetWidth - 14;
    }
    if (top + tooltip.offsetHeight > window.innerHeight - 10) {
      top = tooltipPointerY - tooltip.offsetHeight - 14;
    }
  } else {
    const rect = target.getBoundingClientRect();
    left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
    top = rect.top - tooltip.offsetHeight - 8;
    if (top < 0) top = rect.bottom + 8;
  }

  if (left < 10) left = 10;
  if (left + tooltip.offsetWidth > window.innerWidth - 10) {
    left = window.innerWidth - tooltip.offsetWidth - 10;
  }
  if (top < 10) top = 10;
  if (top + tooltip.offsetHeight > window.innerHeight - 10) {
    top = window.innerHeight - tooltip.offsetHeight - 10;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
};

document.addEventListener("mouseover", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (!target) return;

  // Ignorer les cellules du timeline (elles ont leur propre système de tooltip)
  if (target.classList.contains("heatmap-cell")) return;

  const text = target.getAttribute("data-tooltip");
  if (!text) return;
  clearTimeout(tooltipTimeout);
  activeTooltipTarget = target;
  activeTooltipFollowCursor = target.id === "sync-session-network-status";
  tooltipPointerX = Number(e.clientX || 0);
  tooltipPointerY = Number(e.clientY || 0);
  target.removeAttribute("title");

  // On utilise CONFIG.tooltipDelay ici
  tooltipTimeout = setTimeout(() => {
    if (!activeTooltipTarget || activeTooltipTarget !== target) return;
    const liveText = target.getAttribute("data-tooltip");
    if (!liveText) return;
    // Formater les raccourcis entre crochets ou parenthèses en gris
    const safeText = escapeHtml(liveText);
    const formattedText = safeText
      .replace(/\[([^\]]+)\]/g, '<span class="tooltip-shortcut">[$1]</span>')
      .replace(/\(([^)]+)\)/g, '<span class="tooltip-shortcut">($1)</span>')
      .replace(/( - .+)$/, '<span class="tooltip-shortcut">$1</span>');
    tooltip.innerHTML = formattedText;

    // Détecter si le texte contient un saut de ligne
    if (liveText.includes("\n")) {
      tooltip.classList.add("multiline");
    } else {
      tooltip.classList.remove("multiline");
    }

    tooltip.style.opacity = "1";
    positionTooltipForTarget(target);
  }, CONFIG.tooltipDelay); // <--- Appel dynamique à la config
});

document.addEventListener("mousemove", (e) => {
  if (!activeTooltipFollowCursor || !activeTooltipTarget) return;
  const target = e.target.closest("[data-tooltip]");
  if (!target || target !== activeTooltipTarget) return;
  tooltipPointerX = Number(e.clientX || 0);
  tooltipPointerY = Number(e.clientY || 0);
  if (tooltip.style.opacity === "1") {
    positionTooltipForTarget(activeTooltipTarget);
  }
});

document.addEventListener("mouseout", (e) => {
  const target = e.target.closest("[data-tooltip]");
  if (!target) return;
  const relatedTarget = e.relatedTarget;
  if (relatedTarget && target.contains(relatedTarget)) return;
  clearTimeout(tooltipTimeout);
  tooltip.style.opacity = "0";
  if (activeTooltipTarget === target) {
    activeTooltipTarget = null;
    activeTooltipFollowCursor = false;
  }
});

document.addEventListener("mousedown", () => {
  clearTimeout(tooltipTimeout);
  tooltip.style.opacity = "0";
  activeTooltipTarget = null;
  activeTooltipFollowCursor = false;
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
