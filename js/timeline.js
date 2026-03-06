// ================================================================
// MODULE HISTORIQUE / TIMELINE (PoseChrono)
// ================================================================



// ================================================================
// UTILITAIRES DOM
// ================================================================

function escapeTimelineHtml(input) {
  const str = String(input ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ================================================================
// CONSTANTES
// ================================================================

const TIMELINE_STORAGE_KEY = "posechrono-timeline-data";
const TIMELINE_DB_KEY = "timeline_data";
const TIMELINE_FALLBACK_LOCAL_KEY = "posechrono-db:timeline_data";
const TIMELINE_BACKUP_PREFIXES = [
  "posechrono-timeline-backup:",
  "posechrono-db:timeline_data:backup:",
];
const TIMELINE_SCHEMA_VERSION = 2;
const TIMELINE_SAVE_DEBOUNCE_MS = 220;
const DAYS_IN_WEEK = 7;
const WEEKS_TO_SHOW = 53; // ~1 an
const MIN_YEAR = 2024;
const MAX_FUTURE_WEEKS = 8; // Limite de navigation dans le futur
const YEARS_TO_KEEP = 3; // Nombre d'années à conserver

function getTimelineStorage() {
  if (
    typeof window !== "undefined" &&
    window.PoseChronoStorage &&
    typeof window.PoseChronoStorage.getJson === "function" &&
    typeof window.PoseChronoStorage.setJson === "function"
  ) {
    return window.PoseChronoStorage;
  }
  return null;
}

function getTimelinePlatformAdapter() {
  const shared = getSharedTimelinePlatformAccessUtils();
  if (shared && typeof shared.getPlatform === "function") {
    return shared.getPlatform();
  }
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.getPoseChronoPlatform === "function"
    ) {
      return window.getPoseChronoPlatform();
    }
  } catch (_) {}
  return null;
}

const TIMELINE_CAPABILITY_WARNER = (() => {
  try {
    const createCapabilityWarner = getTimelineSharedFactory(
      "createCapabilityWarner",
    );
    if (createCapabilityWarner) {
      return createCapabilityWarner({
        getPlatform: () => getTimelinePlatformAdapter(),
        prefix: "[Timeline:Platform]",
        logger: (...args) => console.warn(...args),
      });
    }
  } catch (_) {}
  const warned = new Set();
  return (capabilityKey, operationLabel) => {
    const platform = getTimelinePlatformAdapter();
    const capability = String(capabilityKey || "").trim();
    if (!capability) return;
    if (warned.has(capability)) return;

    const hasPlatformCapabilities =
      !!platform &&
      !!platform.capabilities &&
      Object.prototype.hasOwnProperty.call(
        platform.capabilities,
        capability,
      );

    if (!hasPlatformCapabilities || platform.capabilities[capability]) {
      return;
    }

    warned.add(capability);
    console.warn(
      `[Timeline:Platform] Missing capability "${capability}" for "${operationLabel}".`,
    );
  };
})();

function timelineWarnMissingCapability(capabilityKey, operationLabel) {
  TIMELINE_CAPABILITY_WARNER(capabilityKey, operationLabel);
}

function resolveTimelinePlatformMethod(platform, operationName) {
  if (!platform || !operationName) return null;
  const parts = String(operationName)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let cursor = platform;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = cursor?.[parts[i]];
    if (!cursor) return null;
  }
  const methodName = parts[parts.length - 1];
  const method =
    cursor && typeof cursor[methodName] === "function"
      ? cursor[methodName].bind(cursor)
      : null;
  return method;
}

async function timelinePlatformCallAsync(
  operationName,
  args = [],
  { capability, operationLabel, fallback } = {},
) {
  const safeOperationLabel = operationLabel || operationName;
  const ops = getSharedTimelinePlatformOpsUtils();
  if (ops && typeof ops.callAsync === "function") {
    return ops.callAsync(operationName, args, {
      capability,
      operationLabel: safeOperationLabel,
      fallback,
    });
  }

  const platform = getTimelinePlatformAdapter();
  try {
    const method = resolveTimelinePlatformMethod(platform, operationName);
    if (method) {
      return await method(...(Array.isArray(args) ? args : []));
    }
  } catch (_) {}

  timelineWarnMissingCapability(capability, safeOperationLabel);
  return fallback;
}

async function timelineDialogShowMessageBox(options) {
  return timelinePlatformCallAsync("dialogs.showMessageBox", [options], {
    capability: "dialogs",
    operationLabel: "dialogs.showMessageBox",
    fallback: { response: 0, checkboxChecked: false },
  });
}

function timelineNotify(payload) {
  if (!payload) return;
  void timelinePlatformCallAsync("notification.show", [payload], {
    capability: "notifications",
    operationLabel: "notification.show",
    fallback: undefined,
  });
}

async function timelineItemGetById(id) {
  return timelinePlatformCallAsync("item.getById", [id], {
    capability: "items",
    operationLabel: "item.getById",
    fallback: null,
  });
}

// Validation des sessions
const SESSION_VALIDATION = {
  MIN_POSES: 1,
  MIN_TIME_SECONDS: 15, // Une session doit durer au moins 15 secondes pour être enregistrée dans l'historique
  MAX_TIME_PER_SESSION: 86400, // 24h max (anti-abus)
};

// Seuils pour les niveaux d'activité (en secondes)
const ACTIVITY_LEVELS = {
  LEVEL_0: 0,
  LEVEL_1: 600, // < 10min
  LEVEL_2: 1800, // < 30min
  LEVEL_3: 3600, // < 60min
  // LEVEL_4: >= 60min
};

// ================================================================
// HELPERS i18n
// ================================================================

function getSharedI18nUtils() {
  const value = getTimelineSharedNamespaceValue("i18n");
  if (value) return value;
  return null;
}

function getTimelineSharedNamespaceValue(key) {
  try {
    if (typeof window !== "undefined" && window.PoseChronoShared) {
      return window.PoseChronoShared[key] ?? null;
    }
  } catch (_) {}
  return null;
}

function getTimelineSharedFactory(factoryName) {
  const fn = getTimelineSharedNamespaceValue(factoryName);
  if (typeof fn === "function") return fn;
  return null;
}

const TIMELINE_SHARED_SINGLETONS = Object.create(null);
const TIMELINE_MISSING_SHARED_WARNINGS = new Set();

function logMissingTimelineShared(capabilityKey) {
  const key = String(capabilityKey || "").trim();
  if (!key || TIMELINE_MISSING_SHARED_WARNINGS.has(key)) return;
  TIMELINE_MISSING_SHARED_WARNINGS.add(key);
  console.warn(`[Timeline:shared] ${key} unavailable`);
}

function callTimelineSharedMethod(
  utils,
  methodName,
  args,
  missingKey,
  fallbackFn,
) {
  if (utils && typeof utils[methodName] === "function") {
    return utils[methodName](...(Array.isArray(args) ? args : []));
  }
  if (missingKey) logMissingTimelineShared(missingKey);
  return typeof fallbackFn === "function" ? fallbackFn() : undefined;
}

function getTimelineSharedSingleton(factoryName, initInstance) {
  const existing = TIMELINE_SHARED_SINGLETONS[factoryName];
  if (existing) return existing;

  const factory = getTimelineSharedFactory(factoryName);
  if (!factory) return null;

  const instance =
    typeof initInstance === "function" ? initInstance(factory) : factory();
  if (instance) {
    TIMELINE_SHARED_SINGLETONS[factoryName] = instance;
    return instance;
  }
  return null;
}

function getSharedSessionReplayUtils() {
  return getTimelineSharedSingleton("createSessionReplayUtils");
}

function getSharedTimelineSanitizerUtils() {
  return getTimelineSharedSingleton(
    "createTimelineSanitizerUtils",
    (factory) =>
      factory({
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      minPoses: SESSION_VALIDATION.MIN_POSES,
      minTimeSeconds: SESSION_VALIDATION.MIN_TIME_SECONDS,
      maxTimePerSession: SESSION_VALIDATION.MAX_TIME_PER_SESSION,
      nowIso: () => new Date().toISOString(),
      }),
  );
}

function getSharedTimelineFormatUtils() {
  return getTimelineSharedSingleton(
    "createTimelineFormatUtils",
    (factory) =>
      factory({
      getLocale,
      minuteLabel: "min",
      }),
  );
}

function getSharedTimelinePlatformAccessUtils() {
  return getTimelineSharedSingleton(
    "createPlatformAccessUtils",
    (factory) =>
      factory({
      getterName: "getPoseChronoPlatform",
      }),
  );
}

function getSharedTimelinePlatformOpsUtils() {
  return getTimelineSharedSingleton(
    "createPlatformOpsUtils",
    (factory) =>
      factory({
      getPlatform: () => getTimelinePlatformAdapter(),
      warnMissingCapability: (capabilityKey, operationLabel) =>
        timelineWarnMissingCapability(capabilityKey, operationLabel),
      }),
  );
}

function getSharedTimelineDateUtils() {
  return getTimelineSharedSingleton("createTimelineDateUtils");
}

function getSharedTimelineMediaUtils() {
  return getTimelineSharedSingleton("createTimelineMediaUtils");
}

function getSharedTimelineDisplayUtils() {
  return getTimelineSharedSingleton(
    "createTimelineDisplayUtils",
    (factory) =>
      factory({
      t: (key, options = {}, fallback = "") => tl(key, options, fallback),
      formatTime: (seconds) => FormatUtils.time(seconds),
      }),
  );
}

function getSharedTimelineFeedbackUtils() {
  return getTimelineSharedSingleton(
    "createTimelineFeedbackUtils",
    (factory) =>
      factory({
      showPoseChronoConfirmDialog:
        typeof window.showPoseChronoConfirmDialog === "function"
          ? window.showPoseChronoConfirmDialog
          : null,
      showMessageBox: (options) => timelineDialogShowMessageBox(options),
      logError: (error) =>
        console.error("[Timeline] Erreur ouverture dialog:", error),
      showPoseChronoToast:
        typeof window.showPoseChronoToast === "function"
          ? window.showPoseChronoToast
          : null,
      notify: (payload) => timelineNotify(payload),
      schedulePoseChronoUndoAction:
        typeof window.schedulePoseChronoUndoAction === "function"
          ? window.schedulePoseChronoUndoAction
          : null,
      document: typeof document !== "undefined" ? document : null,
      requestAnimationFrame:
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : null,
      setTimeout: typeof setTimeout === "function" ? setTimeout : null,
      clearTimeout: typeof clearTimeout === "function" ? clearTimeout : null,
      }),
  );
}

function extractReplayImageIds(session) {
  const utils = getSharedSessionReplayUtils();
  return callTimelineSharedMethod(
    utils,
    "extractImageIdsFromSession",
    [session],
    "session-replay.extractImageIdsFromSession",
    () => {
      const images = Array.isArray(session?.images) ? session.images : [];
      return images
        .map((img) => (typeof img === "object" && img !== null ? img.id : null))
        .filter((id) => id !== undefined && id !== null);
    },
  );
}

function buildReplayOptions(session) {
  const utils = getSharedSessionReplayUtils();
  return callTimelineSharedMethod(
    utils,
    "buildReplayOptionsFromSession",
    [session],
    "session-replay.buildReplayOptionsFromSession",
    () => {
      const poses = Math.max(0, Number(session?.poses) || 0);
      const time = Math.max(0, Number(session?.time) || 0);
      const mode = String(session?.mode || "classique").toLowerCase();
      const duration = poses > 0 && time > 0 ? time / poses : null;
      const customQueue = Array.isArray(session?.customQueue)
        ? session.customQueue
        : [];
      const memoryType =
        mode === "memory" &&
        (session?.memoryType === "flash" || session?.memoryType === "progressive")
          ? session.memoryType
          : null;
      return { mode, duration, customQueue, memoryType };
    },
  );
}

/**
 * Retourne le code locale BCP47 basé sur la langue active de i18next
 * @returns {string}
 */
function getLocale() {
  const utils = getSharedI18nUtils();
  const fromShared = callTimelineSharedMethod(
    utils,
    "getLocale",
    [typeof i18next !== "undefined" ? i18next : null, "fr-FR"],
    "i18n.getLocale",
    null,
  );
  if (typeof fromShared === "string" && fromShared) return fromShared;

  // Lire la locale déclarée dans le fichier de traductions chargé
  if (typeof i18next !== "undefined" && i18next.t) {
    const locale = i18next.t("_locale");
    if (locale && locale !== "_locale") return locale;
  }
  return "fr-FR";
}

/**
 * Récupère une traduction avec fallback
 * @param {string} key - Clé de traduction
 * @param {Object} vars - Options i18next
 * @param {string} fallback - Valeur par défaut
 * @returns {string}
 */
function getTimelineI18nText(
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
  const utils = getSharedI18nUtils();
  const fromShared = callTimelineSharedMethod(
    utils,
    "t",
    [i18nInstance, key, { ...(vars || {}), defaultValue: fallback }, fallback],
    "i18n.t",
    null,
  );
  if (typeof fromShared === "string") return fromShared;

  if (i18nInstance) {
    const result = i18nInstance.t(key, {
      ...(vars || {}),
      defaultValue: fallback,
    });
    // i18next retourne la clé si non trouvée
    return result !== key ? result : fallback;
  }
  return fallback;
}

function tl(key, options = {}, fallback = "") {
  return getTimelineI18nText(key, fallback, options);
}

function toFileUrl(path) {
  const shared = getSharedTimelineMediaUtils();
  const fromShared = callTimelineSharedMethod(
    shared,
    "toFileUrl",
    [path],
    "timeline-media.toFileUrl",
    null,
  );
  if (typeof fromShared === "string") return fromShared;
  if (typeof path !== "string") return "";
  const raw = path.trim();
  if (!raw) return "";
  if (/^(https?:|file:|data:|blob:)/i.test(raw)) return raw;

  const normalized = raw.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  if (normalized.startsWith("//")) {
    return `file:${normalized}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  return normalized;
}

function resolveTimelineImageSrc(image) {
  const shared = getSharedTimelineMediaUtils();
  const fromShared = callTimelineSharedMethod(
    shared,
    "resolveTimelineImageSrc",
    [image],
    "timeline-media.resolveTimelineImageSrc",
    null,
  );
  if (typeof fromShared === "string") return fromShared;
  if (typeof image === "string") {
    return toFileUrl(image);
  }
  if (!image || typeof image !== "object") return "";

  const direct = [
    image.thumbnailURL,
    image.thumbnail,
    image.url,
  ].find((v) => typeof v === "string" && v.trim().length > 0);
  if (direct) return toFileUrl(direct);

  const fromPath = [image.filePath, image.path, image.file].find(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  return toFileUrl(fromPath || "");
}

/**
 * Ouvre une confirmation stylée (fallback Eagle si indisponible).
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} options.confirmText
 * @param {string} options.cancelText
 * @param {string} [options.checkboxLabel]
 * @returns {Promise<{confirmed: boolean, checkboxChecked: boolean}>}
 */
async function openTimelineConfirmDialog(options = {}) {
  const shared = getSharedTimelineFeedbackUtils();
  if (shared && typeof shared.openConfirmDialog === "function") {
    return shared.openConfirmDialog(options);
  }
  logMissingTimelineShared("timeline-feedback.openConfirmDialog");

  const {
    title = "",
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
    checkboxLabel = "",
  } = options;

  // Utiliser la modal custom du plugin si disponible
  if (
    typeof window !== "undefined" &&
    typeof window.showPoseChronoConfirmDialog === "function"
  ) {
    return window.showPoseChronoConfirmDialog({
      title,
      message,
      confirmText,
      cancelText,
      checkboxLabel,
    });
  }

  // Fallback legacy (dialog Eagle native)
  try {
    const result = await timelineDialogShowMessageBox({
      type: "warning",
      title,
      message,
      buttons: [cancelText, confirmText],
      defaultId: 0,
      cancelId: 0,
      ...(checkboxLabel ? { checkboxLabel } : {}),
    });

    return {
      confirmed: result.response === 1,
      checkboxChecked: !!result.checkboxChecked,
    };
  } catch (e) {
    console.error("[Timeline] Erreur ouverture dialog:", e);
    return { confirmed: false, checkboxChecked: false };
  }
}

function showTimelineToast(type, message, duration = 2500) {
  const shared = getSharedTimelineFeedbackUtils();
  if (shared && typeof shared.showToast === "function") {
    shared.showToast(type, message, duration);
    return;
  }
  logMissingTimelineShared("timeline-feedback.showToast");

  if (
    typeof window !== "undefined" &&
    typeof window.showPoseChronoToast === "function"
  ) {
    window.showPoseChronoToast({ type, message, duration });
    return;
  }

  timelineNotify({
    title: message,
    body: "",
    mute: false,
    duration,
  });
}

function scheduleTimelineUndoAction(options = {}) {
  const shared = getSharedTimelineFeedbackUtils();
  if (shared && typeof shared.scheduleUndoAction === "function") {
    return shared.scheduleUndoAction(options);
  }
  logMissingTimelineShared("timeline-feedback.scheduleUndoAction");

  if (
    typeof window !== "undefined" &&
    typeof window.schedulePoseChronoUndoAction === "function"
  ) {
    window.schedulePoseChronoUndoAction(options);
    return true;
  }

  const {
    id = `timeline-undo-${Date.now()}`,
    timeoutMs = 10000,
    onUndo,
    message = "Deleted. Undo available for 10 seconds.",
    undoLabel = "Undo",
  } = options;
  if (typeof onUndo !== "function") return false;

  let container = document.getElementById("posechrono-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "posechrono-toast-container";
    container.className = "pc-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "pc-toast pc-toast-info";

  const msg = document.createElement("span");
  msg.className = "pc-toast-message";
  msg.textContent = message;
  toast.appendChild(msg);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pc-toast-action";
  btn.textContent = undoLabel;
  btn.addEventListener("click", () => {
    clearTimeout(timer);
    try {
      onUndo();
    } catch (e) {
      console.error("[Timeline] undo fallback error:", e);
    }
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 180);
  });
  toast.appendChild(btn);

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));

  const timer = setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 180);
  }, timeoutMs);

  return true;
}

/**
 * Récupère les labels des jours (abrégés)
 * @returns {string[]}
 */
function getDayLabels() {
  const shared = getSharedTimelineDisplayUtils();
  if (shared && typeof shared.getDayLabels === "function") {
    return shared.getDayLabels();
  }
  const result = tl("timeline.dayLabels", { returnObjects: true }, null);
  if (Array.isArray(result)) return result;
  return ["L", "M", "M", "J", "V", "S", "D"];
}

/**
 * Formate la structure d'une session custom en texte compact
 * @param {Array} customQueue - Liste des étapes
 * @returns {string} - HTML formaté
 */
function formatCustomStructure(customQueue) {
  const shared = getSharedTimelineDisplayUtils();
  if (shared && typeof shared.formatCustomStructure === "function") {
    return shared.formatCustomStructure(customQueue);
  }
  if (!customQueue || customQueue.length === 0) return "";

  const title = `<div class="custom-structure-title">${tl("timeline.sessionPlan", {}, "Plan de la session")}</div>`;

  const steps = customQueue.map((step) => {
    const timeStr = FormatUtils.time(step.duration);
    if (step.type === "pause") {
      return `<div class="custom-step pause">${tl("timeline.pauseStep", {}, "Pause")} ${timeStr}</div>`;
    } else {
      const poseWord =
        step.count > 1
          ? tl("timeline.poses", {}, "poses")
          : tl("timeline.pose", {}, "pose");
      return `<div class="custom-step pose">${step.count} ${poseWord} ${tl("timeline.of", {}, "de")} ${timeStr}</div>`;
    }
  });

  return title + steps.join("");
}

/**
 * Traduit le mode de session en libellé lisible
 * @param {string} mode - Mode technique (classique, custom, relax, memory)
 * @param {string} memoryType - Type d'entraînement mémoire (flash, progressive)
 * @returns {string}
 */
function getModeLabel(mode, memoryType) {
  const shared = getSharedTimelineDisplayUtils();
  if (shared && typeof shared.getModeLabel === "function") {
    return shared.getModeLabel(mode, memoryType);
  }
  const labels = {
    classique: tl("modes.classic.title", {}, "Classique"),
    custom: tl("modes.custom.title", {}, "Personnalisé"),
    relax: tl("modes.relax.title", {}, "Tranquille"),
    memory: tl("modes.memory.title", {}, "Mémoire"),
  };

  let label = labels[mode] || mode;

  // Pour le mode mémoire, ajouter le type entre parenthèses
  if (mode === "memory" && memoryType) {
    const memoryTypeLabels = {
      flash: tl("modes.memory.flash", {}, "Flash"),
      progressive: tl("modes.memory.progressive", {}, "Progressif"),
    };
    const typeLabel = memoryTypeLabels[memoryType] || memoryType;
    label += ` (${typeLabel})`;
  }

  return label;
}

/**
 * Récupère les labels des mois
 * @returns {string[]}
 */
function getMonthLabels() {
  const shared = getSharedTimelineDisplayUtils();
  if (shared && typeof shared.getMonthLabels === "function") {
    return shared.getMonthLabels();
  }
  const result = tl("timeline.monthLabels", { returnObjects: true }, null);
  if (Array.isArray(result)) return result;
  return [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
}

// ================================================================
// UTILITAIRES DE DATE
// ================================================================

const DateUtils = {
  /**
   * Convertit une Date en clé string "YYYY-MM-DD"
   * @param {Date} date
   * @returns {string}
   */
  toKey(date) {
    const shared = getSharedTimelineDateUtils();
    if (shared && typeof shared.toKey === "function") {
      return shared.toKey(date);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  /**
   * Obtient aujourd'hui à minuit
   * @returns {Date}
   */
  getToday() {
    const shared = getSharedTimelineDateUtils();
    if (shared && typeof shared.getToday === "function") {
      return shared.getToday();
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  },

  /**
   * Vérifie si deux dates sont le même jour
   * @param {Date} d1
   * @param {Date} d2
   * @returns {boolean}
   */
  isSameDay(d1, d2) {
    const shared = getSharedTimelineDateUtils();
    if (shared && typeof shared.isSameDay === "function") {
      return shared.isSameDay(d1, d2);
    }
    return d1.toDateString() === d2.toDateString();
  },

  /**
   * Vérifie si une date est dans le futur
   * @param {Date} date
   * @param {Date} today
   * @returns {boolean}
   */
  isFuture(date, today) {
    const shared = getSharedTimelineDateUtils();
    if (shared && typeof shared.isFuture === "function") {
      return shared.isFuture(date, today);
    }
    return date > today;
  },

  /**
   * Obtient le premier lundi avant une date donnée
   * @param {Date} date
   * @returns {Date}
   */
  getMondayBefore(date) {
    const shared = getSharedTimelineDateUtils();
    if (shared && typeof shared.getMondayBefore === "function") {
      return shared.getMondayBefore(date);
    }
    const result = new Date(date);
    const dayOfWeek = result.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  },

  /**
   * Obtient la date de début de l'année (premier lundi avant le 1er janvier)
   * @param {number} year
   * @returns {Date}
   */
  getYearStartDate(year) {
    const shared = getSharedTimelineDateUtils();
    if (shared && typeof shared.getYearStartDate === "function") {
      return shared.getYearStartDate(year);
    }
    const jan1 = new Date(year, 0, 1);
    return this.getMondayBefore(jan1);
  },

  /**
   * Calcule la différence en jours entre deux dates
   * @param {Date} d1
   * @param {Date} d2
   * @returns {number}
   */
  diffInDays(d1, d2) {
    const shared = getSharedTimelineDateUtils();
    if (shared && typeof shared.diffInDays === "function") {
      return shared.diffInDays(d1, d2);
    }
    return Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
  },
};

// ================================================================
// UTILITAIRES DE FORMATAGE
// ================================================================

const FormatUtils = {
  /**
   * Formate un nombre avec séparateur de milliers
   * @param {number} num
   * @returns {string}
   */
  number(num) {
    const shared = getSharedTimelineFormatUtils();
    if (shared && typeof shared.formatNumber === "function") {
      return shared.formatNumber(num);
    }
    return num.toLocaleString(getLocale());
  },

  /**
   * Formate le temps en format lisible (abrégé)
   * Format: "xh ymin zs" (adapte selon les valeurs)
   * @param {number} seconds
   * @returns {string}
   */
  time(seconds) {
    const shared = getSharedTimelineFormatUtils();
    if (shared && typeof shared.formatTime === "function") {
      return shared.formatTime(seconds);
    }
    if (seconds <= 0) return "0s";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];

    // Heures
    if (hours > 0) {
      parts.push(`${hours}h`);
    }

    // Minutes
    if (minutes > 0) {
      parts.push(`${minutes}min`);
    }

    // Secondes (seulement si pas d'heures, ou si c'est la seule valeur)
    if (secs > 0 && hours === 0) {
      parts.push(`${secs}s`);
    }

    if (parts.length === 0) return "0s";
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;

    // 3 parties: heures, minutes, secondes
    return `${parts[0]} ${parts[1]} ${parts[2]}`;
  },

  /**
   * Formate une date en français
   * @param {Date} date
   * @param {Object} options
   * @returns {string}
   */
  date(date, options = { weekday: "long", day: "numeric", month: "long" }) {
    const shared = getSharedTimelineFormatUtils();
    if (shared && typeof shared.formatDate === "function") {
      return shared.formatDate(date, options);
    }
    return date.toLocaleDateString(getLocale(), options);
  },
};

// ================================================================
// GESTIONNAIRE DE DONNÉES
// ================================================================

const TimelineData = {
  _data: null,
  _persistPromise: Promise.resolve(),
  _hydratePromise: null,
  _hydrated: false,
  _saveDebounceTimer: null,
  _pendingPersistData: null,

  /**
   * Structure de données par défaut
   * @returns {Object}
   */
  _getDefaultData() {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "getDefaultData",
      [],
      "timeline-sanitizer.getDefaultData",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    return {
      days: {},
      stats: {
        totalPoses: 0,
        totalTime: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastSessionDate: null,
      },
    };
  },

  _sanitizeSessionEntry(session) {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "sanitizeSessionEntry",
      [session],
      "timeline-sanitizer.sanitizeSessionEntry",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    if (!session || typeof session !== "object") return null;
    const poses = Math.max(0, Math.round(Number(session.poses) || 0));
    const time = Math.max(0, Math.min(SESSION_VALIDATION.MAX_TIME_PER_SESSION, Math.round(Number(session.time) || 0)));
    if (poses < SESSION_VALIDATION.MIN_POSES || time < SESSION_VALIDATION.MIN_TIME_SECONDS) {
      return null;
    }
    const hour = Math.max(0, Math.min(23, Math.round(Number(session.hour) || 0)));
    const minute = Math.max(0, Math.min(59, Math.round(Number(session.minute) || 0)));
    const timestamp =
      typeof session.timestamp === "string" && !Number.isNaN(Date.parse(session.timestamp))
        ? session.timestamp
        : new Date().toISOString();
    const mode = typeof session.mode === "string" ? session.mode.slice(0, 32) : "classique";
    const memoryType =
      session.memoryType === "flash" || session.memoryType === "progressive"
        ? session.memoryType
        : null;
    const customQueue = Array.isArray(session.customQueue) ? session.customQueue : null;
    const images = Array.isArray(session.images)
      ? session.images
          .map((img) => this._sanitizeSessionImageEntry(img))
          .filter(Boolean)
          .slice(0, 1000)
      : [];

    const isOnline = session.isOnline === true;

    return {
      timestamp,
      hour,
      minute,
      poses,
      time,
      mode,
      memoryType,
      customQueue,
      images,
      ...(isOnline ? { isOnline: true } : {}),
    };
  },

  _sanitizeSessionImageEntry(image) {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "sanitizeSessionImageEntry",
      [image],
      "timeline-sanitizer.sanitizeSessionImageEntry",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    if (typeof image === "string") {
      const value = image.trim();
      if (!value) return null;
      return value.slice(0, 4096);
    }

    if (!image || typeof image !== "object") return null;

    const out = {};

    if (
      image.id !== undefined &&
      image.id !== null &&
      (typeof image.id === "string" || typeof image.id === "number")
    ) {
      out.id = image.id;
    }

    const copyString = (key, maxLen = 4096) => {
      if (typeof image[key] !== "string") return;
      const value = image[key].trim();
      if (!value) return;
      out[key] = value.slice(0, maxLen);
    };

    copyString("filePath");
    copyString("path");
    copyString("file");
    copyString("thumbnailURL");
    copyString("thumbnail");
    copyString("url");
    copyString("name", 256);
    copyString("ext", 32);

    if (Object.keys(out).length === 0) return null;
    return out;
  },

  _sanitizeData(candidate) {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "sanitizeData",
      [candidate],
      "timeline-sanitizer.sanitizeData",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    const base = this._getDefaultData();
    const raw = candidate && typeof candidate === "object" ? candidate : {};
    let repaired = false;

    const rawDays = raw.days && typeof raw.days === "object" ? raw.days : {};
    if (!raw.days || typeof raw.days !== "object") repaired = true;

    for (const [dateKey, dayValue] of Object.entries(rawDays)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        repaired = true;
        continue;
      }
      const day = dayValue && typeof dayValue === "object" ? dayValue : {};
      if (!dayValue || typeof dayValue !== "object") repaired = true;

      const sessionsRaw = Array.isArray(day.sessions) ? day.sessions : [];
      if (!Array.isArray(day.sessions)) repaired = true;
      const sessions = sessionsRaw
        .map((s) => this._sanitizeSessionEntry(s))
        .filter(Boolean)
        .slice(-50);
      if (sessions.length !== sessionsRaw.length) repaired = true;

      const posesFromSessions = sessions.reduce((sum, s) => sum + (s.poses || 0), 0);
      const timeFromSessions = sessions.reduce((sum, s) => sum + (s.time || 0), 0);
      const posesRaw = Math.max(0, Math.round(Number(day.poses) || 0));
      const timeRaw = Math.max(0, Math.round(Number(day.time) || 0));
      const poses = sessions.length > 0 ? posesFromSessions : posesRaw;
      const time = sessions.length > 0 ? timeFromSessions : timeRaw;

      if (poses !== posesRaw || time !== timeRaw) repaired = true;

      base.days[dateKey] = { poses, time, sessions };
    }

    base.stats = {
      totalPoses: Math.max(0, Math.round(Number(raw.stats?.totalPoses) || 0)),
      totalTime: Math.max(0, Math.round(Number(raw.stats?.totalTime) || 0)),
      currentStreak: Math.max(0, Math.round(Number(raw.stats?.currentStreak) || 0)),
      bestStreak: Math.max(0, Math.round(Number(raw.stats?.bestStreak) || 0)),
      lastSessionDate:
        typeof raw.stats?.lastSessionDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(raw.stats.lastSessionDate)
          ? raw.stats.lastSessionDate
          : null,
    };

    const computedPoses = Object.values(base.days).reduce(
      (sum, day) => sum + (day.poses || 0),
      0,
    );
    const computedTime = Object.values(base.days).reduce(
      (sum, day) => sum + (day.time || 0),
      0,
    );

    if (base.stats.totalPoses !== computedPoses || base.stats.totalTime !== computedTime) {
      repaired = true;
      base.stats.totalPoses = computedPoses;
      base.stats.totalTime = computedTime;
    }

    return { data: base, repaired };
  },

  _normalizePayload(rawPayload) {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "normalizePayload",
      [rawPayload],
      "timeline-sanitizer.normalizePayload",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    if (!rawPayload || typeof rawPayload !== "object") {
      const sanitized = this._sanitizeData(null);
      return {
        payload: {
          schemaVersion: TIMELINE_SCHEMA_VERSION,
          data: sanitized.data,
        },
        data: sanitized.data,
        repaired: true,
      };
    }

    const sourceData =
      rawPayload.schemaVersion === TIMELINE_SCHEMA_VERSION && rawPayload.data
        ? rawPayload.data
        : rawPayload;
    const sanitized = this._sanitizeData(sourceData);
    const payload = {
      schemaVersion: TIMELINE_SCHEMA_VERSION,
      data: sanitized.data,
    };

    const repaired =
      sanitized.repaired ||
      rawPayload.schemaVersion !== TIMELINE_SCHEMA_VERSION ||
      !rawPayload.data;

    return { payload, data: sanitized.data, repaired };
  },

  _mergeDayEntries(existingDay, incomingDay) {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "mergeDayEntries",
      [existingDay, incomingDay],
      "timeline-sanitizer.mergeDayEntries",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    const base = existingDay && typeof existingDay === "object" ? existingDay : {};
    const next =
      incomingDay && typeof incomingDay === "object" ? incomingDay : {};

    const existingSessions = Array.isArray(base.sessions) ? base.sessions : [];
    const incomingSessions = Array.isArray(next.sessions) ? next.sessions : [];
    const mergedSessions = [];
    const seen = new Set();

    [...existingSessions, ...incomingSessions].forEach((session) => {
      if (!session || typeof session !== "object") return;
      const signature = [
        session.timestamp || "",
        session.hour ?? "",
        session.minute ?? "",
        session.poses ?? "",
        session.time ?? "",
        session.mode || "",
        session.memoryType || "",
        Array.isArray(session.images) ? session.images.length : 0,
      ].join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      mergedSessions.push(session);
    });

    mergedSessions.sort((a, b) => {
      const at = Date.parse(a?.timestamp || "") || 0;
      const bt = Date.parse(b?.timestamp || "") || 0;
      return at - bt;
    });

    const limitedSessions = mergedSessions.slice(-50);
    const posesFromSessions = limitedSessions.reduce(
      (sum, s) => sum + (Number(s?.poses) || 0),
      0,
    );
    const timeFromSessions = limitedSessions.reduce(
      (sum, s) => sum + (Number(s?.time) || 0),
      0,
    );

    return {
      poses:
        limitedSessions.length > 0
          ? posesFromSessions
          : Math.max(Number(base.poses) || 0, Number(next.poses) || 0),
      time:
        limitedSessions.length > 0
          ? timeFromSessions
          : Math.max(Number(base.time) || 0, Number(next.time) || 0),
      sessions: limitedSessions,
    };
  },

  _mergeTimelineDatas(datasets) {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "mergeTimelineDatas",
      [datasets],
      "timeline-sanitizer.mergeTimelineDatas",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    const merged = this._getDefaultData();
    const sources = Array.isArray(datasets) ? datasets : [];
    sources.forEach((data) => {
      if (!data || typeof data !== "object" || !data.days) return;
      Object.entries(data.days).forEach(([dateKey, day]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
        if (!merged.days[dateKey]) {
          merged.days[dateKey] = this._mergeDayEntries(null, day);
          return;
        }
        merged.days[dateKey] = this._mergeDayEntries(merged.days[dateKey], day);
      });
    });
    return merged;
  },

  _loadFromLocalStorageKey(storageKey) {
    const utils = getSharedTimelineSanitizerUtils();
    return callTimelineSharedMethod(
      utils,
      "loadFromLocalStorageKey",
      [
        localStorage,
        storageKey,
        (parsed) => this._normalizePayload(parsed),
        {
          backupPrefixes: TIMELINE_BACKUP_PREFIXES,
          reportBackupRepairs: false,
          onRepaired: (key) => {
            if (
              TIMELINE_BACKUP_PREFIXES.some((prefix) =>
                String(key || "").startsWith(prefix),
              )
            ) {
              return;
            }
            console.warn(`[Timeline] Local data repaired during load (${key}).`);
          },
        },
      ],
      "timeline-sanitizer.loadFromLocalStorageKey",
      () => {
        try {
          const stored = localStorage.getItem(storageKey);
          if (!stored) return null;
          const parsed = JSON.parse(stored);
          const normalized = this._normalizePayload(parsed);
          const isBackupKey = TIMELINE_BACKUP_PREFIXES.some((prefix) =>
            String(storageKey || "").startsWith(prefix),
          );
          if (normalized.repaired && !isBackupKey) {
            console.warn(
              `[Timeline] Local data repaired during load (${storageKey}).`,
            );
          }
          return normalized.data;
        } catch (e) {
          console.error(
            `[Timeline] Erreur chargement localStorage (${storageKey}):`,
            e,
          );
          return null;
        }
      },
    );
  },

  _listLocalCandidateKeys(options = {}) {
    const includeBackups = options.includeBackups === true;
    const utils = getSharedTimelineSanitizerUtils();
    return callTimelineSharedMethod(
      utils,
      "listLocalCandidateKeys",
      [
        localStorage,
        {
          baseKeys: [TIMELINE_STORAGE_KEY, TIMELINE_FALLBACK_LOCAL_KEY],
          backupPrefixes: TIMELINE_BACKUP_PREFIXES,
          includeBackupsIfPrimaryMissing: includeBackups,
          maxBackupsPerPrefix: 2,
        },
      ],
      "timeline-sanitizer.listLocalCandidateKeys",
      () => {
        const keys = new Set([TIMELINE_STORAGE_KEY, TIMELINE_FALLBACK_LOCAL_KEY]);
        try {
          const hasPrimaryData =
            localStorage.getItem(TIMELINE_STORAGE_KEY) != null ||
            localStorage.getItem(TIMELINE_FALLBACK_LOCAL_KEY) != null;
          if (!hasPrimaryData && includeBackups) {
            const buckets = new Map();
            TIMELINE_BACKUP_PREFIXES.forEach((prefix) => buckets.set(prefix, []));
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (!key) continue;
              const prefix = TIMELINE_BACKUP_PREFIXES.find((p) =>
                key.startsWith(p),
              );
              if (!prefix) continue;
              buckets.get(prefix).push(key);
            }
            buckets.forEach((bucketKeys) => {
              bucketKeys
                .sort()
                .reverse()
                .slice(0, 2)
                .forEach((backupKey) => keys.add(backupKey));
            });
          }
        } catch (_) {}
        return Array.from(keys);
      },
    );
  },

  _loadLocalCandidates(options = {}) {
    const includeBackups = options.includeBackups === true;
    const utils = getSharedTimelineSanitizerUtils();
    return callTimelineSharedMethod(
      utils,
      "loadLocalCandidates",
      [
        localStorage,
        this._listLocalCandidateKeys({ includeBackups }),
        (parsed) => this._normalizePayload(parsed),
        {
          backupPrefixes: TIMELINE_BACKUP_PREFIXES,
          reportBackupRepairs: false,
          onRepaired: (key) => {
            if (
              TIMELINE_BACKUP_PREFIXES.some((prefix) =>
                String(key || "").startsWith(prefix),
              )
            ) {
              return;
            }
            console.warn(`[Timeline] Local data repaired during load (${key}).`);
          },
        },
      ],
      "timeline-sanitizer.loadLocalCandidates",
      () => {
        const candidates = [];
        const candidateKeys = this._listLocalCandidateKeys({ includeBackups });
        for (const key of candidateKeys) {
          const data = this._loadFromLocalStorageKey(key);
          if (!data) continue;
          candidates.push(data);
        }
        return candidates;
      },
    );
  },

  _loadFromLocalStorage() {
    const candidates = this._loadLocalCandidates({ includeBackups: false });
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "resolveLocalTimelineData",
      [
        candidates,
        (list) => this._mergeTimelineDatas(list),
        () => this._getDefaultData(),
      ],
      "timeline-sanitizer.resolveLocalTimelineData",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    if (candidates.length === 0) {
      return this._getDefaultData();
    }
    return this._mergeTimelineDatas(candidates);
  },

  _writeTimelineBackup(payload, prefix = "posechrono-timeline-backup:") {
    const utils = getSharedTimelineSanitizerUtils();
    callTimelineSharedMethod(
      utils,
      "writeTimelineBackup",
      [localStorage, payload, { prefix, keep: 3 }],
      "timeline-sanitizer.writeTimelineBackup",
      () => {
        try {
          const key = `${prefix}${Date.now()}`;
          localStorage.setItem(key, JSON.stringify(payload));

          const backupKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const existingKey = localStorage.key(i);
            if (existingKey && existingKey.startsWith(prefix)) {
              backupKeys.push(existingKey);
            }
          }
          backupKeys.sort();
          while (backupKeys.length > 3) {
            const oldest = backupKeys.shift();
            if (oldest) localStorage.removeItem(oldest);
          }
        } catch (_) {}
      },
    );
  },

  _cloneData(data) {
    const utils = getSharedTimelineSanitizerUtils();
    return callTimelineSharedMethod(
      utils,
      "cloneData",
      [data],
      "timeline-sanitizer.cloneData",
      () => {
        try {
          if (typeof structuredClone === "function") {
            return structuredClone(data);
          }
        } catch (_) {}
        return JSON.parse(JSON.stringify(data));
      },
    );
  },

  _scheduleHydrateFromIndexedDB() {
    if (this._hydrated || this._hydratePromise) return;
    const storage = getTimelineStorage();
    if (!storage) {
      this._hydrated = true;
      return;
    }

    this._hydratePromise = (async () => {
      try {
        let localCandidates = this._loadLocalCandidates({ includeBackups: false });
        const idbPayload = await storage.getJson(TIMELINE_DB_KEY, undefined);
        const statusAfterRead =
          typeof storage.status === "function" ? storage.status() : null;
        const usingIndexedDb = statusAfterRead
          ? !!statusAfterRead.indexedDbAvailable
          : true;
        if (idbPayload !== undefined) {
          const normalized = this._normalizePayload(idbPayload);
          if (normalized.repaired) {
            this._writeTimelineBackup(
              idbPayload,
              "posechrono-db:timeline_data:backup:",
            );
          }
          const merged = this._mergeTimelineDatas([
            normalized.data,
            ...localCandidates,
          ]);
          this._data = merged;
          this._recalculateStats();
          this._cleanupOldData();
          this.save({ immediate: true });
          if (normalized.repaired && usingIndexedDb) {
            console.warn("[Timeline] IndexedDB data repaired during hydration.");
          }
          this._notifyHydrated();
          return;
        }

        const localData =
          localCandidates.length > 0
            ? this._mergeTimelineDatas(localCandidates)
            : this._getDefaultData();
        if (!usingIndexedDb && localCandidates.length === 0) {
          localCandidates = this._loadLocalCandidates({ includeBackups: true });
        }
        const fallbackLocalData =
          localCandidates.length > 0
            ? this._mergeTimelineDatas(localCandidates)
            : localData;
        this._data = fallbackLocalData;
        this._recalculateStats();
        const normalizedLocal = this._normalizePayload(this._data);
        await storage.setJson(TIMELINE_DB_KEY, normalizedLocal.payload);
        this._notifyHydrated();
      } catch (e) {
        console.error("[Timeline] Erreur migration IndexedDB:", e);
      } finally {
        this._hydrated = true;
        this._hydratePromise = null;
      }
    })();
  },

  _notifyHydrated() {
    if (timelineRendererSettings && timelineRendererSettings.container) {
      timelineRendererSettings._debouncedRender();
    }
    if (timelineRendererReview && timelineRendererReview.container) {
      timelineRendererReview._debouncedRender();
    }
  },

  /**
   * Charge les données (sync immédiat + hydrate IndexedDB en arrière-plan)
   * @returns {Object}
   */
  load() {
    if (this._data) return this._data;
    this._data = this._loadFromLocalStorage();
    this._scheduleHydrateFromIndexedDB();
    return this._data;
  },

  async ensureHydrated() {
    this.load();
    if (this._hydratePromise) {
      try {
        await this._hydratePromise;
      } catch (_) {}
    }
    return this._data;
  },

  /**
   * Nettoie les données anciennes pour libérer de l'espace
   * Garde seulement les YEARS_TO_KEEP dernières années
   */
  _cleanupOldData() {
    if (!this._data || !this._data.days || typeof this._data.days !== "object") {
      this._data = this._getDefaultData();
      return;
    }
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - YEARS_TO_KEEP);
    cutoff.setMonth(0, 1); // 1er janvier de l'année limite
    const cutoffKey = DateUtils.toKey(cutoff);

    let deletedCount = 0;
    for (const dateKey in this._data.days) {
      if (dateKey < cutoffKey) {
        delete this._data.days[dateKey];
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(
        `[Timeline] Nettoyage: ${deletedCount} entrées anciennes supprimées`,
      );
      // Recalculer les stats globales
      this._recalculateStats();
    }
  },

  /**
   * Recalcule les statistiques globales à partir des données journalières
   */
  _recalculateStats() {
    let totalPoses = 0;
    let totalTime = 0;

    for (const dateKey in this._data.days) {
      const day = this._data.days[dateKey];
      totalPoses += day.poses || 0;
      totalTime += day.time || 0;
    }

    this._data.stats.totalPoses = totalPoses;
    this._data.stats.totalTime = totalTime;
    this._recalculateStreak();
  },

  /**
   * Recalcule le streak (jours consécutifs) à partir des données journalières
   * Parcourt les jours depuis aujourd'hui en arrière pour trouver la série actuelle
   */
  _recalculateStreak() {
    const days = this._data.days;
    const sortedKeys = Object.keys(days).sort().reverse(); // Du plus récent au plus ancien

    if (sortedKeys.length === 0) {
      this._data.stats.currentStreak = 0;
      this._data.stats.bestStreak = 0;
      this._data.stats.lastSessionDate = null;
      return;
    }

    // Mettre à jour lastSessionDate
    this._data.stats.lastSessionDate = sortedKeys[0];

    // Calculer le streak actuel depuis aujourd'hui
    const today = DateUtils.getToday();
    const todayKey = DateUtils.toKey(today);
    let currentStreak = 0;
    let checkDate = new Date(today);

    // Le streak actuel commence aujourd'hui ou hier
    // Si aujourd'hui n'a pas d'activité, on commence à vérifier depuis hier
    if (!days[todayKey]) {
      checkDate.setDate(checkDate.getDate() - 1);
      const yesterdayKey = DateUtils.toKey(checkDate);
      if (!days[yesterdayKey]) {
        // Ni aujourd'hui ni hier : streak = 0
        this._data.stats.currentStreak = 0;
        // Recalculer bestStreak en parcourant tout l'historique
        this._data.stats.bestStreak = this._findBestStreak(sortedKeys);
        return;
      }
    }

    // Compter les jours consécutifs en arrière
    while (true) {
      const key = DateUtils.toKey(checkDate);
      if (days[key]) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    this._data.stats.currentStreak = currentStreak;

    // Recalculer bestStreak
    const bestStreak = this._findBestStreak(sortedKeys);
    this._data.stats.bestStreak = Math.max(bestStreak, currentStreak);
  },

  /**
   * Trouve la meilleure série dans tout l'historique
   * @param {string[]} sortedKeys - Clés de dates triées (ordre décroissant)
   * @returns {number}
   */
  _findBestStreak(sortedKeys) {
    if (sortedKeys.length === 0) return 0;

    // Trier en ordre croissant pour parcourir chronologiquement
    const keys = sortedKeys.slice().sort();
    let bestStreak = 1;
    let streak = 1;

    for (let i = 1; i < keys.length; i++) {
      const prevDate = new Date(keys[i - 1]);
      const currDate = new Date(keys[i]);
      const diff = DateUtils.diffInDays(currDate, prevDate);

      if (diff === 1) {
        streak++;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 1;
      }
    }

    return bestStreak;
  },

  _persistNow(dataToPersist) {
    const storage = getTimelineStorage();
    const normalized = this._normalizePayload(dataToPersist);
    this._writeTimelineBackup(normalized.payload, "posechrono-timeline-backup:");

    if (!storage) {
      try {
        localStorage.setItem(
          TIMELINE_STORAGE_KEY,
          JSON.stringify(normalized.payload),
        );
      } catch (e) {
        console.error("[Timeline] Erreur sauvegarde fallback localStorage:", e);
      }
      return Promise.resolve();
    }

    return storage
      .setJson(TIMELINE_DB_KEY, normalized.payload)
      .then(() => {
        try {
          localStorage.removeItem(TIMELINE_STORAGE_KEY);
        } catch (_) {}
      })
      .catch((e) => {
        console.error("[Timeline] Erreur sauvegarde IndexedDB:", e);
      });
  },

  /**
   * Sauvegarde les données (debounce + IndexedDB)
   */
  save(options = {}) {
    const { immediate = false } = options;
    this._cleanupOldData();
    this._pendingPersistData = this._data
      ? this._cloneData(this._data)
      : this._getDefaultData();

    if (immediate) {
      this.flushPersist();
      return;
    }

    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
    }
    this._saveDebounceTimer = setTimeout(() => {
      this._saveDebounceTimer = null;
      this.flushPersist();
    }, TIMELINE_SAVE_DEBOUNCE_MS);
  },

  flushPersist() {
    if (this._saveDebounceTimer) {
      clearTimeout(this._saveDebounceTimer);
      this._saveDebounceTimer = null;
    }

    const toPersist = this._pendingPersistData
      ? this._cloneData(this._pendingPersistData)
      : this._data
        ? this._cloneData(this._data)
        : this._getDefaultData();
    this._pendingPersistData = null;

    this._persistPromise = this._persistPromise
      .then(() => this._persistNow(toPersist))
      .catch((e) => {
        console.error("[Timeline] flush queue error:", e);
      });

    return this._persistPromise;
  },

  /**
   * Récupère les données (charge si nécessaire)
   * @returns {Object}
   */
  getData() {
    if (!this._data) this.load();
    return this._data;
  },

  /**
   * Récupère les données d'un jour spécifique
   * @param {string} dateKey - Format "YYYY-MM-DD"
   * @returns {{poses: number, time: number, sessions: Array}}
   */
  getDayData(dateKey) {
    const data = this.getData();
    return data.days[dateKey] || { poses: 0, time: 0, sessions: [] };
  },

  /**
   * Alias lisible pour récupérer une journée (compatibilité avec le renderer)
   * @param {string} dateKey - Format "YYYY-MM-DD"
   * @returns {{poses: number, time: number, sessions: Array}}
   */
  getDay(dateKey) {
    return this.getDayData(dateKey);
  },

  /**
   * Valide et normalise les paramètres d'une session
   * @param {number} poses
   * @param {number} time
   * @returns {{poses: number, time: number, isValid: boolean}}
   */
  _validateSession(poses, time) {
    const utils = getSharedTimelineSanitizerUtils();
    const fromShared = callTimelineSharedMethod(
      utils,
      "validateSessionValues",
      [poses, time],
      "timeline-sanitizer.validateSessionValues",
      null,
    );
    if (fromShared !== undefined) return fromShared;
    // Convertir en nombres et valider
    let validPoses = Math.max(0, Math.round(Number(poses) || 0));
    let validTime = Math.max(0, Math.round(Number(time) || 0));

    // Plafonner le temps pour éviter les abus/erreurs
    validTime = Math.min(validTime, SESSION_VALIDATION.MAX_TIME_PER_SESSION);

    // Une session est valide si elle a au moins MIN_POSES poses ET au moins MIN_TIME_SECONDS
    const isValid =
      validPoses >= SESSION_VALIDATION.MIN_POSES &&
      validTime >= SESSION_VALIDATION.MIN_TIME_SECONDS;

    return { poses: validPoses, time: validTime, isValid };
  },

  /**
   * Ajoute une session au jour courant
   * @param {number} poses - Nombre de poses
   * @param {number} time - Temps en secondes
   * @param {Object} details - Détails optionnels de la session
   * @param {string} details.mode - Mode de session (classique, custom, etc.)
   * @param {Array} details.images - Tableau des URLs des images vues
   * @returns {Object|null} - Données mises à jour ou null si session invalide
   */
  addSession(poses, time, details = {}) {
    const validated = this._validateSession(poses, time);

    // Ignorer les sessions vides ou invalides
    if (!validated.isValid) {
      console.log("[Timeline] Session ignorée (invalide):", { poses, time });
      return null;
    }

    const data = this.getData();
    const now = new Date();
    const sessionDate = details.startTime ? new Date(details.startTime) : now;
    const today = DateUtils.toKey(sessionDate);

    // Ajouter aux données du jour
    if (!data.days[today]) {
      data.days[today] = { poses: 0, time: 0, sessions: [] };
    }
    data.days[today].poses += validated.poses;
    data.days[today].time += validated.time;

    // Ajouter la session détaillée
    if (!data.days[today].sessions) {
      data.days[today].sessions = [];
    }
    data.days[today].sessions.push({
      timestamp: now.toISOString(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      poses: validated.poses,
      time: validated.time,
      mode: details.mode || "classique",
      memoryType: details.memoryType || null,
      customQueue: details.customQueue || null,
      images: details.images || [],
      ...(details.isOnline ? { isOnline: true } : {}),
    });

    // Limiter le nombre de sessions détaillées conservées (garder les 50 dernières par jour)
    if (data.days[today].sessions.length > 50) {
      data.days[today].sessions = data.days[today].sessions.slice(-50);
    }

    // Mettre à jour les stats globales
    data.stats.totalPoses += validated.poses;
    data.stats.totalTime += validated.time;

    // Mettre à jour le streak
    this._updateStreak(today);

    this.save();
    return data;
  },

  /**
   * Met à jour le streak (jours consécutifs)
   * @param {string} today - Clé de date
   */
  _updateStreak(today) {
    const data = this.getData();
    const lastDate = data.stats.lastSessionDate;

    if (!lastDate) {
      // Première session
      data.stats.currentStreak = 1;
    } else {
      const lastDateObj = new Date(lastDate);
      const todayObj = new Date(today);
      const diffDays = DateUtils.diffInDays(todayObj, lastDateObj);

      if (diffDays === 0) {
        // Même jour, pas de changement de streak
      } else if (diffDays === 1) {
        // Jour consécutif
        data.stats.currentStreak++;
      } else {
        // Streak cassé
        data.stats.currentStreak = 1;
      }
    }

    // Mettre à jour le meilleur streak
    if (data.stats.currentStreak > data.stats.bestStreak) {
      data.stats.bestStreak = data.stats.currentStreak;
    }

    data.stats.lastSessionDate = today;
  },

  /**
   * Récupère les statistiques
   * @returns {Object}
   */
  getStats() {
    return this.getData().stats;
  },

  /**
   * Réinitialise toutes les données
   */
  reset() {
    this._data = this._getDefaultData();
    this.save();
  },

  /**
   * Supprime une journée spécifique
   * @param {string} dateKey - Format "YYYY-MM-DD"
   * @returns {boolean} - Succès de la suppression
   */
  deleteDay(dateKey) {
    const data = this.getData();
    if (!data.days[dateKey]) {
      return false;
    }

    const dayData = data.days[dateKey];

    // Mettre à jour les stats globales
    data.stats.totalPoses -= dayData.poses || 0;
    data.stats.totalTime -= dayData.time || 0;

    // S'assurer que les stats ne sont pas négatives
    data.stats.totalPoses = Math.max(0, data.stats.totalPoses);
    data.stats.totalTime = Math.max(0, data.stats.totalTime);

    // Supprimer la journée
    delete data.days[dateKey];

    // Recalculer le streak
    this._recalculateStreak();

    this.save();
    return true;
  },

  /**
   * Supprime une session spécifique d'une journée
   * @param {string} dateKey - Format "YYYY-MM-DD"
   * @param {number} sessionIndex - Index de la session dans le tableau
   * @returns {{success: boolean, dayDeleted: boolean}} - Résultat de la suppression
   */
  deleteSession(dateKey, sessionIndex) {
    const data = this.getData();
    if (!data.days[dateKey] || !data.days[dateKey].sessions) {
      return { success: false, dayDeleted: false };
    }

    const dayData = data.days[dateKey];
    const sessions = dayData.sessions;

    if (sessionIndex < 0 || sessionIndex >= sessions.length) {
      return { success: false, dayDeleted: false };
    }

    const session = sessions[sessionIndex];

    // Mettre à jour les totaux du jour
    dayData.poses -= session.poses || 0;
    dayData.time -= session.time || 0;

    // S'assurer que les totaux ne sont pas négatifs
    dayData.poses = Math.max(0, dayData.poses);
    dayData.time = Math.max(0, dayData.time);

    // Mettre à jour les stats globales
    data.stats.totalPoses -= session.poses || 0;
    data.stats.totalTime -= session.time || 0;
    data.stats.totalPoses = Math.max(0, data.stats.totalPoses);
    data.stats.totalTime = Math.max(0, data.stats.totalTime);

    // Supprimer la session
    sessions.splice(sessionIndex, 1);

    // Si plus de sessions, supprimer la journée
    let dayDeleted = false;
    if (sessions.length === 0) {
      delete data.days[dateKey];
      dayDeleted = true;
    }

    this.save();
    return { success: true, dayDeleted };
  },

  /**
   * Exporte les données en JSON
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(this.getData(), null, 2);
  },

  /**
   * Importe des données depuis JSON
   * @param {string} jsonStr
   * @returns {boolean} - Succès de l'import
   */
  importJSON(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      if (imported && imported.days && imported.stats) {
        this._data = imported;
        this.save();
        return true;
      }
      return false;
    } catch (e) {
      console.error("[Timeline] Erreur import:", e);
      return false;
    }
  },
};

// ================================================================
// TEMPLATES HTML (séparés pour lisibilité)
// ================================================================

const TimelineTemplates = {
  /**
   * Header avec navigation et stats
   */
  header(navTitle, stats, currentView) {
    const ICONS = typeof window.ICONS !== "undefined" ? window.ICONS : {};

    const streakHtml =
      stats.currentStreak > 1
        ? `<span class="timeline-streak${stats.currentStreak > 3 ? " hot" : ""}">
             <span class="streak-icon">${ICONS.FIRE || "🔥"}</span>
             ${stats.currentStreak} ${tl("timeline.daysInARow", {}, "jours d'affilée")}
           </span>`
        : "";

    return `
      <div class="timeline-header">
        <div class="timeline-title">
          <span class="timeline-label">${tl("timeline.activity", {}, "Activité")}</span>
          <button type="button" class="timeline-nav-btn" data-direction="-1">‹</button>
          <span class="timeline-nav-title">${navTitle}</span>
          <button type="button" class="timeline-nav-btn" data-direction="1">›</button>
        </div>
        <div class="timeline-stats-summary">
          ${streakHtml}
          <div class="timeline-view-tabs">
            <button type="button" class="timeline-tab ${currentView === "year" ? "active" : ""}" data-view="year">
              ${tl("timeline.viewYear", {}, "Année")}
            </button>
            <button type="button" class="timeline-tab ${currentView === "month" ? "active" : ""}" data-view="month">
              ${tl("timeline.viewMonth", {}, "Mois")}
            </button>
            <button type="button" class="timeline-tab ${currentView === "week" ? "active" : ""}" data-view="week">
              ${tl("timeline.viewWeek", {}, "Semaine")}
            </button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Footer avec légende et totaux
   */
  footer(stats) {
    const ICONS = typeof window.ICONS !== "undefined" ? window.ICONS : {};

    // Stats dérivées calculées à la volée
    const days = TimelineData.getData().days;
    const practicedDays = Object.values(days).filter((d) => (d.poses || 0) > 0).length;
    const avgTimePerPose = stats.totalPoses > 0 ? Math.round(stats.totalTime / stats.totalPoses) : 0;
    const avgTimePerDay = practicedDays > 0 ? Math.round(stats.totalTime / practicedDays) : 0;
    const avgPosesPerDay = practicedDays > 0 ? Math.round(stats.totalPoses / practicedDays) : 0;

    // Breakdown des modes (sur toutes les sessions)
    const modeCounts = { classique: 0, memory: 0, custom: 0, relax: 0 };
    let totalSessions = 0;
    for (const day of Object.values(days)) {
      for (const session of day.sessions || []) {
        const m = String(session.mode || "classique").toLowerCase();
        if (m in modeCounts) modeCounts[m]++;
        else modeCounts.classique++;
        totalSessions++;
      }
    }
    const modeBreakdownHtml = totalSessions > 0
      ? Object.entries(modeCounts)
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([mode, count]) => {
            const pct = Math.round((count / totalSessions) * 100);
            const label = getModeLabel(mode, null);
            return `<div class="extra-stat-row extra-stat-mode-row">
              <span class="extra-stat-label">${label}</span>
              <div class="extra-stat-mode-bar-wrap">
                <div class="extra-stat-mode-bar" style="width:${pct}%"></div>
              </div>
              <span class="extra-stat-value">${pct}%</span>
            </div>`;
          })
          .join("")
      : "";

    const statsBarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M160-160v-320h160v320H160Zm240 0v-640h160v640H400Zm240 0v-440h160v440H640Z"/></svg>`;

    return `
      <div class="timeline-footer">
        <button type="button" class="timeline-reset-btn" data-action="reset-history" data-tooltip="${tl("timeline.resetHistory", {}, "Réinitialiser l'historique")}">
          <span class="reset-icon">${ICONS.CLEAR || "🗑️"}</span>
        </button>
        <div class="timeline-legend">
          <span class="legend-label">${tl("timeline.drawingTime", {}, "Temps de dessin")} :</span>
          <div class="legend-scale">
            <div class="legend-item"><span class="legend-cell level-0"></span><span class="legend-text">0</span></div>
            <div class="legend-item"><span class="legend-cell level-1"></span><span class="legend-text">&lt;10min</span></div>
            <div class="legend-item"><span class="legend-cell level-2"></span><span class="legend-text">&lt;30min</span></div>
            <div class="legend-item"><span class="legend-cell level-3"></span><span class="legend-text">&lt;60min</span></div>
            <div class="legend-item"><span class="legend-cell level-4"></span><span class="legend-text">≥60min</span></div>
          </div>
        </div>
        <div class="timeline-totals">
          <div class="timeline-stat">
            <span class="stat-value">
              <span class="stat-icon">${ICONS.POSEMAN || ""}</span>
              ${FormatUtils.number(stats.totalPoses)}
            </span>
            <span class="stat-label">${tl("timeline.posesDrawn", {}, "Poses dessinées")}</span>
          </div>
          <div class="timeline-stat">
            <span class="stat-value">
              <span class="stat-icon">${ICONS.TIMERCHRONO || ""}</span>
              ${FormatUtils.time(stats.totalTime)}
            </span>
            <span class="stat-label">${tl("timeline.totalTime", {}, "Temps total")}</span>
          </div>
          <div class="timeline-stat">
            <span class="stat-value">
              <span class="stat-icon">${ICONS.SCORE || ""}</span>
              ${stats.bestStreak}
            </span>
            <span class="stat-label">${tl("timeline.streakRecord", {}, "Record de streak")}</span>
          </div>
          <div class="timeline-extra-stats-wrapper">
            <button type="button" class="timeline-extra-stats-btn">
              ${statsBarIconSvg}
            </button>
            <div class="timeline-extra-stats-popover">
              <div class="extra-stat-row extra-stat-row--highlight">
                <span class="extra-stat-value--big">${practicedDays}</span>
                <span class="extra-stat-label--big">${tl("timeline.practicedDays", {}, "jours pratiqués")}</span>
              </div>
              <div class="extra-stat-divider"></div>
              <div class="extra-stat-row">
                <span class="extra-stat-label">${tl("timeline.avgTimePerPose", {}, "Durée / pose")}</span>
                <span class="extra-stat-value">${FormatUtils.time(avgTimePerPose)}</span>
              </div>
              <div class="extra-stat-row">
                <span class="extra-stat-label">${tl("timeline.avgTimePerDay", {}, "Durée / jour")}</span>
                <span class="extra-stat-value">${FormatUtils.time(avgTimePerDay)}</span>
              </div>
              <div class="extra-stat-row">
                <span class="extra-stat-label">${tl("timeline.avgPosesPerDay", {}, "Poses / jour")}</span>
                <span class="extra-stat-value">${avgPosesPerDay}</span>
              </div>
              ${modeBreakdownHtml ? `<div class="extra-stat-divider"></div>${modeBreakdownHtml}` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Modal de détail d'une journée
   */
  dayDetailModal(dateKey, dayData) {
    const ICONS = typeof window.ICONS !== "undefined" ? window.ICONS : {};
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString(getLocale(), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Formatter les sessions
    let sessionsHtml = "";
    if (dayData.sessions && dayData.sessions.length > 0) {
      sessionsHtml = dayData.sessions
        .slice()
        .reverse()
        .map(
          (session, index) => `
        <div class="day-detail-session" data-session-index="${dayData.sessions.length - 1 - index}" data-date="${dateKey}" data-alt-hint="${tl("timeline.altDeleteHint", {}, "Alt+clic pour supprimer")}">
          <div class="session-delete-overlay">
            <span class="delete-hint">${ICONS.CLEAR || "🗑️"} ${tl("timeline.altDelete", {}, "Alt+clic")}</span>
          </div>
          <div class="session-header">
            <span class="session-number">#${dayData.sessions.length - index}</span>
            <span class="session-mode">${escapeTimelineHtml(getModeLabel(session.mode, session.memoryType))}${session.isOnline ? ` <span class="session-online-badge">${escapeTimelineHtml(tl("timeline.onlineBadge", {}, "(en ligne)"))}</span>` : ""}</span>
          </div>
          <div class="session-stats">
            <span class="session-poses ${session.mode === "custom" && session.customQueue ? "has-custom-structure" : ""}" 
                  ${session.mode === "custom" && session.customQueue ? `data-custom-structure="${encodeURIComponent(formatCustomStructure(session.customQueue))}"` : ""}>
              ${session.poses} ${session.poses > 1 ? tl("timeline.poses", {}, "poses") : tl("timeline.pose", {}, "pose")}
            </span>
            <span class="session-duration">${FormatUtils.time(session.time)}</span>
            <button type="button" class="session-reuse-btn" data-action="reuse-session" data-session-index="${dayData.sessions.length - 1 - index}" data-tooltip="${tl("timeline.reuseSession", {}, "Rejouer cette session")}">
              <span class="reuse-icon">${ICONS.REPLAY || "↻"}</span>
            </button>
          </div>
          ${
            session.images && session.images.length > 0
              ? `
            <div class="session-images" data-expanded="false" data-total="${session.images.length}">
              ${session.images
                .slice(0, 6)
                .map((img, idx) => {
                  // Gérer à la fois l'ancien format (string URL) et le nouveau format (objet)
                  const imgData =
                    typeof img === "object" ? img : { id: null, url: img };
                  const imgSrc = resolveTimelineImageSrc(imgData);
                  if (!imgSrc) return "";
                  const imgId = imgData.id || "";
                  const isVideo = VIDEO_EXTENSIONS.includes(
                    (imgData.ext || "").toLowerCase(),
                  );
                  const videoClass = isVideo ? "is-video" : "";
                  const videoIndicator = isVideo
                    ? `<div class="video-thumb-indicator">${ICONS.VIDEO_PLAY || "▶"}</div>`
                    : "";
                  return `
                <div class="session-image-wrapper ${videoClass}" data-img-index="${idx}" data-img-id="${escapeTimelineHtml(imgId)}">
                  <img src="${escapeTimelineHtml(imgSrc)}" alt="" loading="lazy" class="session-image-thumb">
                  ${videoIndicator}
                </div>
              `;
                })
                .join("")}
              ${session.images.length > 6 ? `<button type="button" class="more-images" data-action="expand-images" data-session-index="${dayData.sessions.length - 1 - index}" data-remaining="${session.images.length - 6}">+${session.images.length - 6}</button>` : ""}
            </div>
          `
              : ""
          }
        </div>
      `,
        )
        .join("");
    } else {
      sessionsHtml = `<div class="day-detail-empty">${tl("timeline.noSessionDetails", {}, "Aucun détail de session disponible")}</div>`;
    }

    return `
      <div class="timeline-day-modal" id="day-modal-${dateKey}">
        <div class="timeline-day-modal-backdrop"></div>
        <div class="timeline-day-modal-content">
          <div class="timeline-day-modal-header">
            <h3>${dateStr}</h3>
            <button type="button" class="timeline-day-modal-close" data-action="close">${ICONS.CLOSE || "×"}</button>
          </div>
          <div class="timeline-day-modal-body">
            <div class="day-summary">
              <div class="day-summary-item">
                <span class="stat-icon">${ICONS.TIMERCHRONO || ""}</span>
                <span class="stat-value">${FormatUtils.time(dayData.time || 0)}</span>
                <span class="stat-label">${tl("timeline.drawingTimeLabel", {}, "Temps à dessiner")}</span>
              </div>

              <div class="day-summary-item">
                <span class="stat-icon">${ICONS.POSEMAN || ""}</span>
                <span class="stat-value">${FormatUtils.number(dayData.poses || 0)}</span>
                <span class="stat-label">${tl("timeline.posesLabel", {}, "Poses")}</span>
              </div>
              
              <div class="day-summary-item">
                <span class="stat-icon">${ICONS.INFO || ""}</span>
                <span class="stat-value">${dayData.sessions ? dayData.sessions.length : 0}</span>
                <span class="stat-label">${tl("timeline.sessionsLabel", {}, "sessions")}</span>
              </div>
              <button type="button" class="day-delete-btn" data-action="delete-day" data-date="${dateKey}" data-tooltip="${tl("timeline.deleteDay", {}, "Supprimer cette journée")}">
                <span class="delete-icon">${ICONS.CLEAR || "🗑️"}</span>
              </button>
            </div>
            <div class="day-sessions-list">
              ${sessionsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Génère une cellule de heatmap
   */
  cell(options) {
    const {
      dateKey,
      level,
      isToday,
      isFuture,
      isCurrentPeriod = true,
      tooltipText,
      extraClasses = "",
      innerHtml = "",
    } = options;

    const classes = [
      "heatmap-cell",
      `level-${level}`,
      extraClasses,
      isToday ? "today" : "",
      isFuture || !isCurrentPeriod ? "out-of-range" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="${classes}" 
           data-date="${dateKey}" 
           ${tooltipText ? `data-tooltip="${tooltipText}"` : ""}>
        ${innerHtml}
      </div>
    `;
  },
};

// ================================================================
// CLASSE TIMELINE RENDERER (instanciable)
// ================================================================

class TimelineRenderer {
  /**
   * @param {string} containerId - ID du conteneur DOM
   * @param {string} defaultView - Vue par défaut ('year'|'month'|'week')
   */
  constructor(containerId, defaultView = "year") {
    this.containerId = containerId;
    this.container = null;
    this.currentView = defaultView;
    this.currentYear = new Date().getFullYear();
    this.currentMonth = new Date().getMonth();
    this._weekOffset = 0;
    this._tooltip = null;
    this._eventListeners = []; // Pour cleanup
    this._debouncedRender = this._createDebouncedRender();
  }

  /**
   * Crée une version debounced de render()
   * @returns {Function}
   */
  _createDebouncedRender() {
    let timeoutId = null;
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        this.render();
        timeoutId = null;
      }, 50); // 50ms de debounce
    };
  }

  /**
   * Initialise le renderer
   * @returns {boolean}
   */
  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.warn("[Timeline] Conteneur non trouvé:", this.containerId);
      return false;
    }
    return true;
  }

  /**
   * Nettoie les ressources (event listeners, tooltip)
   */
  destroy() {
    // Retirer les event listeners
    this._eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this._eventListeners = [];

    // Supprimer le tooltip de heatmap si créé par cette instance
    if (this._tooltip && this._tooltip.parentNode) {
      this._tooltip.parentNode.removeChild(this._tooltip);
      this._tooltip = null;
    }

    // Supprimer le tooltip custom des sessions si créé
    if (this._customTooltip && this._customTooltip.parentNode) {
      this._customTooltip.parentNode.removeChild(this._customTooltip);
      this._customTooltip = null;
    }
  }

  /**
   * Ajoute un event listener avec tracking pour cleanup
   */
  _addEvent(element, event, handler) {
    element.addEventListener(event, handler);
    this._eventListeners.push({ element, event, handler });
  }

  /**
   * Génère et affiche la heatmap
   */
  render() {
    if (!this.container) return;

    // Cleanup avant re-render
    this.destroy();

    const data = TimelineData.getData();
    const stats = data.stats;
    const navTitle = this._getNavTitle();

    this.container.innerHTML = `
      <div class="timeline-module">
        ${TimelineTemplates.header(navTitle, stats, this.currentView)}
        <div class="timeline-heatmap-container">
          ${this._renderCurrentView(data)}
        </div>
        ${TimelineTemplates.footer(stats)}
      </div>
    `;

    this._attachEvents();
  }

  /**
   * Obtient le titre de navigation selon la vue
   */
  _getNavTitle() {
    const monthLabels = getMonthLabels();

    if (this.currentView === "year") {
      return `${this.currentYear}`;
    } else if (this.currentView === "month") {
      return `${monthLabels[this.currentMonth]} ${this.currentYear}`;
    } else if (this.currentView === "week") {
      const weekStart = this._getCurrentWeekStart();
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${weekStart.getDate()} - ${weekEnd.getDate()} ${monthLabels[weekEnd.getMonth()]}`;
    }
    return "";
  }

  /**
   * Rendu selon la vue active
   */
  _renderCurrentView(data) {
    switch (this.currentView) {
      case "month":
        return this._renderMonthView(data);
      case "week":
        return this._renderWeekView(data);
      default:
        return this._renderYearView(data);
    }
  }

  /**
   * Calcule les infos d'une cellule (factorisé)
   */
  _getCellInfo(cellDate, data) {
    const today = DateUtils.getToday();
    const dateKey = DateUtils.toKey(cellDate);
    const dayData = data.days[dateKey] || { poses: 0, time: 0, sessions: [] };
    const level = this._getActivityLevel(dayData.time);
    const isToday = DateUtils.isSameDay(cellDate, today);
    const isFuture = DateUtils.isFuture(cellDate, today);

    return { dateKey, dayData, level, isToday, isFuture, today };
  }

  /**
   * Génère le texte du tooltip
   */
  _getTooltipText(dayData, dateStr) {
    const activityText =
      dayData.poses > 0
        ? `${dayData.poses} pose${dayData.poses > 1 ? "s" : ""} • ${FormatUtils.time(dayData.time)}`
        : tl("timeline.noActivity", {}, "Aucune activité");
    return `${dateStr}\n${activityText}`;
  }

  /**
   * Vue ANNÉE
   */
  _renderYearView(data) {
    const dayLabels = getDayLabels();

    return `
      <div class="timeline-months-labels">${this._renderMonthLabels()}</div>
      <div class="timeline-grid-wrapper">
        <div class="timeline-day-labels">
          ${dayLabels.map((d) => `<span>${d}</span>`).join("")}
        </div>
        <div class="timeline-grid view-year" id="timeline-grid">
          ${this._renderYearGrid(data)}
        </div>
      </div>
    `;
  }

  /**
   * Génère les labels des mois (vue année)
   */
  _renderMonthLabels() {
    const monthLabels = getMonthLabels();
    const labels = [];
    const startDate = DateUtils.getYearStartDate(this.currentYear);
    let currentMonth = -1;

    for (let week = 0; week < WEEKS_TO_SHOW; week++) {
      const weekDate = new Date(startDate);
      weekDate.setDate(weekDate.getDate() + week * 7);

      if (weekDate.getFullYear() > this.currentYear) break;

      const month = weekDate.getMonth();
      if (
        month !== currentMonth &&
        weekDate.getFullYear() === this.currentYear
      ) {
        currentMonth = month;
        labels.push(
          `<span class="month-label" style="grid-column: ${week + 1}">${monthLabels[month]}</span>`,
        );
      }
    }

    return labels.join("");
  }

  /**
   * Génère la grille année
   */
  _renderYearGrid(data) {
    const cells = [];
    const startDate = DateUtils.getYearStartDate(this.currentYear);

    for (let week = 0; week < WEEKS_TO_SHOW; week++) {
      const weekCells = [];

      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(cellDate.getDate() + week * 7 + day);

        const { dateKey, dayData, level, isToday, isFuture } =
          this._getCellInfo(cellDate, data);
        const isCurrentYear = cellDate.getFullYear() === this.currentYear;
        const dateStr = FormatUtils.date(cellDate);
        const tooltipText = this._getTooltipText(dayData, dateStr);

        weekCells.push(
          TimelineTemplates.cell({
            dateKey,
            dayData,
            level,
            isToday,
            isFuture,
            isCurrentPeriod: isCurrentYear,
            tooltipText,
          }),
        );
      }

      cells.push(`<div class="heatmap-week">${weekCells.join("")}</div>`);
    }

    return cells.join("");
  }

  /**
   * Vue MOIS
   */
  _renderMonthView(data) {
    const dayLabels = getDayLabels();
    const monthLabels = getMonthLabels();
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);

    // Jour de la semaine du 1er (0=Dim, on veut Lun=0)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    let html = `
      <div class="timeline-grid-wrapper month-view">
        <div class="timeline-day-labels-horizontal">
          ${dayLabels.map((d) => `<span>${d}</span>`).join("")}
        </div>
        <div class="timeline-grid view-month" id="timeline-grid" style="--start-col: ${startDayOfWeek + 1}">
    `;

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const cellDate = new Date(this.currentYear, this.currentMonth, day);
      const { dateKey, dayData, level, isToday, isFuture } = this._getCellInfo(
        cellDate,
        data,
      );
      const tooltipText = this._getTooltipText(
        dayData,
        `${day} ${monthLabels[this.currentMonth]}`,
      );

      html += TimelineTemplates.cell({
        dateKey,
        dayData,
        level,
        isToday,
        isFuture,
        tooltipText,
        extraClasses: "month-cell",
        innerHtml: `<span class="day-number">${day}</span>`,
      });
    }

    html += `</div></div>`;
    return html;
  }

  /**
   * Vue SEMAINE
   */
  _renderWeekView(data) {
    const weekStart = this._getCurrentWeekStart();

    let html = `<div class="timeline-grid view-week" id="timeline-grid">`;

    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(weekStart);
      cellDate.setDate(cellDate.getDate() + i);

      const { dateKey, dayData, level, isToday, isFuture } = this._getCellInfo(
        cellDate,
        data,
      );
      const dayName = cellDate.toLocaleDateString(getLocale(), { weekday: "long" });
      const dayNum = cellDate.getDate();

      html += TimelineTemplates.cell({
        dateKey,
        dayData,
        level,
        isToday,
        isFuture,
        extraClasses: "week-cell",
        innerHtml: `
          <div class="week-day-header">
            <span class="week-day-name">${dayName}</span>
            <span class="week-day-num">${dayNum}</span>
          </div>
          <div class="week-day-stats">
            <span class="week-poses">${dayData.poses} ${dayData.poses !== 1 ? tl("timeline.poses", {}, "poses") : tl("timeline.pose", {}, "pose")}</span>
            <span class="week-time">${FormatUtils.time(dayData.time)}</span>
          </div>
        `,
      });
    }

    html += `</div>`;
    return html;
  }

  /**
   * Obtient le lundi de la semaine courante (avec offset)
   */
  _getCurrentWeekStart() {
    const today = new Date();
    const monday = DateUtils.getMondayBefore(today);
    monday.setDate(monday.getDate() + this._weekOffset * 7);
    return monday;
  }

  /**
   * Calcule le niveau d'activité (0-4)
   */
  _getActivityLevel(timeInSeconds) {
    if (timeInSeconds <= ACTIVITY_LEVELS.LEVEL_0) return 0;
    if (timeInSeconds < ACTIVITY_LEVELS.LEVEL_1) return 1; // < 10min
    if (timeInSeconds < ACTIVITY_LEVELS.LEVEL_2) return 2; // < 30min
    if (timeInSeconds < ACTIVITY_LEVELS.LEVEL_3) return 3; // < 60min
    return 4; // >= 60min
  }

  /**
   * Attache les événements
   */
  _attachEvents() {
    // Navigation
    this.container.querySelectorAll(".timeline-nav-btn").forEach((btn) => {
      const handler = (e) => {
        const direction = parseInt(e.target.dataset.direction);
        this._navigate(direction);
      };
      this._addEvent(btn, "click", handler);
    });

    // Tabs de vue
    this.container.querySelectorAll(".timeline-tab").forEach((tab) => {
      const handler = (e) => {
        const view = e.target.dataset.view;
        if (view !== this.currentView) {
          this.currentView = view;
          this._weekOffset = 0; // Reset
          this.render();
        }
      };
      this._addEvent(tab, "click", handler);
    });

    // Tooltips
    if (this.currentView === "year" || this.currentView === "month") {
      this._initTooltips();
    }

    // Clic sur les cellules pour ouvrir le modal de détail
    this.container.querySelectorAll(".heatmap-cell").forEach((cell) => {
      const handler = (e) => {
        const dateKey = e.currentTarget.dataset.date;
        if (dateKey) {
          this._showDayDetail(dateKey);
        }
      };
      this._addEvent(cell, "click", handler);
    });

    // Bouton de réinitialisation de l'historique
    const resetBtn = this.container.querySelector(
      "[data-action='reset-history']",
    );
    if (resetBtn) {
      const handler = (e) => {
        e.preventDefault();
        this._confirmResetHistory();
      };
      this._addEvent(resetBtn, "click", handler);
    }
  }

  /**
   * Affiche le modal de détail d'une journée
   * @param {string} dateKey - Format "YYYY-MM-DD"
   */
  _showDayDetail(dateKey) {
    // Fermer le modal existant s'il y en a un
    this._closeDayDetail();

    const data = TimelineData.getData();
    const dayData = data.days[dateKey] || { poses: 0, time: 0, sessions: [] };

    // Ne pas ouvrir si aucune activité
    if (!dayData.sessions || dayData.sessions.length === 0) {
      return;
    }

    // Créer et injecter le modal
    const modalHtml = TimelineTemplates.dayDetailModal(dateKey, dayData);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = modalHtml;
    const modal = wrapper.firstElementChild;
    document.body.appendChild(modal);
    this._currentModal = modal;

    // Gérer les images manquantes/corrompues (onerror inline bloqué par CSP)
    this._initMissingImageHandlers(modal);

    // Configurer les événements du modal
    this._setupModalEvents(modal, dateKey);

    // Fermer avec Escape (mais pas si le zoom-overlay est ouvert ou vient d'être fermé)
    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        // Ne pas fermer le day-modal si le zoom-overlay est ouvert
        // ou si on vient de fermer le zoom (dans les 100ms)
        const zoomOverlay = document.getElementById("zoom-overlay");
        const justClosedZoom =
          window._zoomJustClosed && Date.now() - window._zoomJustClosed < 100;

        if (zoomOverlay || justClosedZoom) {
          // Le zoom-overlay va se fermer lui-même ou vient d'être fermé
          // On ne ferme pas le day-modal
          return;
        }

        this._closeDayDetail();
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
    this._modalEscapeHandler = escapeHandler;

    // Animation d'entrée
    requestAnimationFrame(() => {
      modal.classList.add("visible");
    });
  }

  /**
   * Ferme le modal de détail
   */
  _closeDayDetail() {
    if (this._currentModal) {
      this._currentModal.classList.remove("visible");
      setTimeout(() => {
        if (this._currentModal && this._currentModal.parentNode) {
          this._currentModal.parentNode.removeChild(this._currentModal);
        }
        this._currentModal = null;
      }, 200);
    }
    if (this._modalEscapeHandler) {
      document.removeEventListener("keydown", this._modalEscapeHandler);
      this._modalEscapeHandler = null;
    }
    // Nettoyer les handlers Alt
    if (this._altKeyHandler) {
      document.removeEventListener("keydown", this._altKeyHandler);
      document.removeEventListener("keyup", this._altKeyHandler);
      this._altKeyHandler = null;
    }

    // Nettoyer le tooltip custom si présent
    if (this._customTooltip && this._customTooltip.parentNode) {
      this._customTooltip.parentNode.removeChild(this._customTooltip);
      this._customTooltip = null;
    }
  }

  /**
   * Configure les handlers pour Alt+clic suppression de session
   */
  _setupAltDeleteHandlers(modal, dateKey) {
    const sessionElements = modal.querySelectorAll(".day-detail-session");
    if (sessionElements.length === 0) return;

    // Gestionnaire pour la touche Alt - ajoute une classe sur le modal
    const handleAltKey = (e) => {
      const isAltPressed = e.type === "keydown" && e.key === "Alt";
      const isAltReleased = e.type === "keyup" && e.key === "Alt";

      if (isAltPressed) {
        modal.classList.add("alt-pressed");
      } else if (isAltReleased) {
        modal.classList.remove("alt-pressed");
      }
    };

    document.addEventListener("keydown", handleAltKey);
    document.addEventListener("keyup", handleAltKey);
    this._altKeyHandler = handleAltKey;

    // Gestionnaire de clic sur chaque session
    sessionElements.forEach((sessionEl) => {
      const clickHandler = async (e) => {
        if (!e.altKey) return;

        e.preventDefault();
        e.stopPropagation();

        const sessionIndex = parseInt(sessionEl.dataset.sessionIndex);
        if (isNaN(sessionIndex)) return;

        await this._confirmDeleteSession(dateKey, sessionIndex);
      };
      sessionEl.addEventListener("click", clickHandler);
      // Tracker pour nettoyage
      this._eventListeners.push({
        element: sessionEl,
        event: "click",
        handler: clickHandler,
      });
    });
  }

  /**
   * Demande confirmation avant de supprimer une session
   */
  async _confirmDeleteSession(dateKey, sessionIndex) {
    // Vérifier si l'utilisateur a choisi de ne plus être prévenu
    const skipConfirm =
      localStorage.getItem("timeline-skip-session-delete-confirm") === "true";

    if (!skipConfirm) {
      const dayData = TimelineData.getDay(dateKey);
      const targetSession =
        dayData && dayData.sessions ? dayData.sessions[sessionIndex] : null;

      const title = tl(
        "timeline.deleteSessionTitle",
        {},
        "Supprimer la session",
      );
      const baseMessage = tl(
        "timeline.deleteSessionConfirm",
        {},
        "Êtes-vous sûr de vouloir supprimer cette session ?",
      );
      const detailLine = targetSession
        ? `${targetSession.poses || 0} ${tl("timeline.poses", {}, "poses")}  |  ${FormatUtils.time(targetSession.time || 0)}`
        : "";
      const message = detailLine ? `${baseMessage}\n${detailLine}` : baseMessage;

      const { confirmed, checkboxChecked } = await openTimelineConfirmDialog({
        title,
        message,
        cancelText: tl("timeline.deleteCancel", {}, "Annuler"),
        confirmText: tl("timeline.deleteConfirmBtn", {}, "Supprimer"),
        checkboxLabel: tl(
          "timeline.skipConfirm",
          {},
          "Ne plus demander confirmation",
        ),
      });

      // Sauvegarder la préférence si cochée
      if (checkboxChecked) {
        localStorage.setItem("timeline-skip-session-delete-confirm", "true");
      }

      if (!confirmed) {
        return; // Annulé
      }
    }

    const snapshotBeforeDelete = TimelineData.exportJSON();

    // Supprimer la session
    const result = TimelineData.deleteSession(dateKey, sessionIndex);

    if (result.success) {
      if (result.dayDeleted) {
        // La journée a été supprimée (plus de sessions), fermer le modal
        this._closeDayDetail();
        this.render(); // Rafraîchir le timeline
      } else {
        // Rafraîchir le contenu du modal sans le fermer
        this._refreshDayDetail(dateKey);
      }

      const deletedMsg = tl(
        "notifications.deleteQueued",
        {},
        "Deleted. Undo available for 10 seconds.",
      );
      const undoLabel = tl("notifications.undo", {}, "Undo");

      if (
        !scheduleTimelineUndoAction({
          id: `timeline-session-delete-${Date.now()}-${dateKey}-${sessionIndex}`,
          timeoutMs: 10000,
          message: deletedMsg,
          undoLabel,
          onUndo: () => {
            TimelineData.importJSON(snapshotBeforeDelete);
            this.render();
            this._showDayDetail(dateKey);
            showTimelineToast(
              "success",
              tl("notifications.undoApplied", {}, "Action undone."),
              2000,
            );
          },
        })
      ) {
        showTimelineToast(
          "info",
          tl("timeline.sessionDeleted", {}, "Session supprimée"),
          2000,
        );
      }
    }
  }

  /**
   * Rafraîchit le contenu du modal de détail sans le fermer
   * @param {string} dateKey - Format "YYYY-MM-DD"
   */
  _refreshDayDetail(dateKey) {
    if (!this._currentModal) return;

    const data = TimelineData.getData();
    const dayData = data.days[dateKey];

    // Si la journée n'existe plus, fermer le modal
    if (!dayData || !dayData.sessions || dayData.sessions.length === 0) {
      this._closeDayDetail();
      this.render();
      return;
    }

    // Régénérer le HTML du modal
    const modalHtml = TimelineTemplates.dayDetailModal(dateKey, dayData);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = modalHtml;
    const newModal = wrapper.firstElementChild;

    // Remplacer le contenu sans fermer le modal
    const oldContent = this._currentModal.querySelector(
      ".timeline-day-modal-content",
    );
    const newContent = newModal.querySelector(".timeline-day-modal-content");
    if (oldContent && newContent) {
      oldContent.innerHTML = newContent.innerHTML;
    }

    // Réattacher les événements
    this._setupModalEvents(this._currentModal, dateKey);
  }

  /**
   * Configure les événements du modal
   */
  _setupModalEvents(modal, dateKey) {
    // Attacher les événements du modal
    const backdrop = modal.querySelector(".timeline-day-modal-backdrop");
    const closeBtn = modal.querySelector("[data-action='close']");
    const deleteDayBtn = modal.querySelector("[data-action='delete-day']");

    const closeHandler = () => this._closeDayDetail();

    if (backdrop) {
      backdrop.addEventListener("click", closeHandler);
      this._eventListeners.push({
        element: backdrop,
        event: "click",
        handler: closeHandler,
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", closeHandler);
      this._eventListeners.push({
        element: closeBtn,
        event: "click",
        handler: closeHandler,
      });
    }
    if (deleteDayBtn) {
      const deleteHandler = (e) => {
        e.stopPropagation();
        const dateKey = deleteDayBtn.dataset.date;
        this._confirmDeleteDay(dateKey);
      };
      deleteDayBtn.addEventListener("click", deleteHandler);
      this._eventListeners.push({
        element: deleteDayBtn,
        event: "click",
        handler: deleteHandler,
      });
    }

    // Gestion Alt+clic pour supprimer une session
    this._setupAltDeleteHandlers(modal, dateKey);

    // Gestion des tooltips de structure custom
    this._setupCustomStructureTooltips(modal);

    // Gestion de l'expansion des images
    this._setupImageExpansion(modal, dateKey);

    // Gestion des boutons "réutiliser la session"
    this._setupReuseSessionHandlers(modal, dateKey);
  }

  /**
   * Configure les handlers pour les boutons "réutiliser la session"
   */
  _setupReuseSessionHandlers(modal, dateKey) {
    const reuseButtons = modal.querySelectorAll(
      "[data-action='reuse-session']",
    );
    if (reuseButtons.length === 0) return;

    reuseButtons.forEach((btn) => {
      const clickHandler = async (e) => {
        e.stopPropagation();
        const sessionIndex = parseInt(btn.dataset.sessionIndex);
        await this._reuseSession(dateKey, sessionIndex);
      };
      btn.addEventListener("click", clickHandler);
      this._eventListeners.push({
        element: btn,
        event: "click",
        handler: clickHandler,
      });
    });
  }

  /**
   * Réutilise une session : charge les images dans le plugin
   */
  async _reuseSession(dateKey, sessionIndex) {
    const data = TimelineData.getData();
    const dayData = data.days[dateKey];
    if (!dayData || !dayData.sessions || !dayData.sessions[sessionIndex])
      return;

    const session = dayData.sessions[sessionIndex];
    if (!session.images || session.images.length === 0) {
      console.warn("[Timeline] Pas d'images dans cette session");
      return;
    }

    // Extraire les IDs des images
    const imageIds = extractReplayImageIds(session);

    if (imageIds.length === 0) {
      console.warn(
        "[Timeline] Pas d'IDs d'images disponibles (anciennes sessions sans ID)",
      );
      // Notification à l'utilisateur
      timelineNotify({
        title: tl("timeline.reuseError", {}, "Impossible de rejouer"),
        body: tl(
          "timeline.reuseErrorOldSession",
          {},
          "Cette session est trop ancienne et ne contient pas les IDs des images.",
        ),
        mute: false,
        duration: 3000,
      });
      return;
    }

    // Appeler la fonction globale du plugin pour charger les images
    if (typeof window.loadSessionImages === "function") {
      try {
        await window.loadSessionImages(imageIds, buildReplayOptions(session));

        // Fermer le modal
        this._closeDayDetail();

        // Notification de succès
        timelineNotify({
          title: tl("timeline.reuseSuccess", {}, "Session restaurée avec succès"),
          body: tl(
            "timeline.reuseSuccessBody",
            { count: imageIds.length },
            `${imageIds.length} images chargées`,
          ),
          mute: false,
          duration: 2000,
        });
      } catch (e) {
        console.error("[Timeline] Erreur lors du chargement des images:", e);
      }
    } else {
      console.error("[Timeline] Fonction loadSessionImages non disponible");
    }
  }

  /**
   * Configure les tooltips pour la structure custom
   */
  _setupCustomStructureTooltips(modal) {
    const posesElements = modal.querySelectorAll(
      ".session-poses.has-custom-structure",
    );
    if (posesElements.length === 0) return;

    // Créer ou récupérer le tooltip
    let tooltip = document.getElementById("timeline-custom-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "timeline-custom-tooltip";
      tooltip.className = "timeline-custom-tooltip";
      document.body.appendChild(tooltip);
    }
    // Stocker la référence pour nettoyage
    this._customTooltip = tooltip;

    posesElements.forEach((el) => {
      const structureHtml = decodeURIComponent(el.dataset.customStructure);

      const enterHandler = (e) => {
        tooltip.innerHTML = structureHtml;
        tooltip.classList.add("visible");

        // Positionner le tooltip
        const rect = el.getBoundingClientRect();
        tooltip.style.left = rect.left + rect.width / 2 + "px";
        tooltip.style.top = rect.bottom + 8 + "px";
      };

      const leaveHandler = () => {
        tooltip.classList.remove("visible");
      };

      el.addEventListener("mouseenter", enterHandler);
      el.addEventListener("mouseleave", leaveHandler);

      // Tracker pour nettoyage
      this._eventListeners.push(
        { element: el, event: "mouseenter", handler: enterHandler },
        { element: el, event: "mouseleave", handler: leaveHandler },
      );
    });
  }

  /**
   * Configure l'expansion des images au clic sur "+X" et le zoom au clic sur les images
   */
  _setupImageExpansion(modal, dateKey) {
    const expandButtons = modal.querySelectorAll(
      "[data-action='expand-images']",
    );

    // Attacher les événements de zoom sur toutes les images du modal
    // (même s'il n'y a pas de bouton d'expansion)
    this._attachAllImageZoomHandlers(modal, dateKey);

    if (expandButtons.length === 0) return;

    expandButtons.forEach((btn) => {
      const clickHandler = (e) => {
        e.stopPropagation();

        const sessionIndex = parseInt(btn.dataset.sessionIndex);
        const container = btn.closest(".session-images");
        if (!container) return;

        const isExpanded = container.dataset.expanded === "true";

        if (!isExpanded) {
          // Récupérer les données de la session
          const data = TimelineData.getData();
          const dayData = data.days[dateKey];
          if (!dayData || !dayData.sessions || !dayData.sessions[sessionIndex])
            return;

          const session = dayData.sessions[sessionIndex];
          if (!session.images || session.images.length <= 6) return;

          // Ajouter les images restantes
          const remainingImages = session.images.slice(6);
          remainingImages.forEach((img, idx) => {
            const imgData =
              typeof img === "object" ? img : { id: null, url: img };
            const imgSrc = resolveTimelineImageSrc(imgData);
            if (!imgSrc) return;
            const imgId = imgData.id || "";
            const isVideo = VIDEO_EXTENSIONS.includes(
              (imgData.ext || "").toLowerCase(),
            );

            // Créer un wrapper pour gérer l'indicateur vidéo
            const wrapper = document.createElement("div");
            wrapper.className = `session-image-wrapper ${isVideo ? "is-video" : ""}`;
            wrapper.dataset.imgIndex = 6 + idx;
            wrapper.dataset.imgId = imgId;

            const imgEl = document.createElement("img");
            imgEl.src = imgSrc;
            imgEl.alt = "";
            imgEl.loading = "lazy";
            imgEl.className = "session-image-thumb";
            imgEl.onerror = function () {
              this.style.display = "none";
              this.closest(".session-image-wrapper").classList.add("img-missing");
            };

            wrapper.appendChild(imgEl);

            if (isVideo) {
              const indicator = document.createElement("div");
              indicator.className = "video-thumb-indicator";
              indicator.innerHTML = ICONS.VIDEO_PLAY || "▶";
              wrapper.appendChild(indicator);
            }

            container.insertBefore(wrapper, btn);
          });

          // Mettre à jour le bouton
          btn.textContent = tl("timeline.collapseImages", {}, "−");
          btn.dataset.expanded = "true";
          container.dataset.expanded = "true";

          // Attacher les événements de zoom sur les nouvelles images
          this._attachImageZoomHandlers(container, dateKey, sessionIndex);
        } else {
          // Supprimer les images supplémentaires (les wrappers)
          const extraWrappers = container.querySelectorAll(
            ".session-image-wrapper[data-img-index]:not([data-img-index='0']):not([data-img-index='1']):not([data-img-index='2']):not([data-img-index='3']):not([data-img-index='4']):not([data-img-index='5'])",
          );
          extraWrappers.forEach((wrapper) => wrapper.remove());

          // Remettre le texte original
          const remaining = btn.dataset.remaining;
          btn.textContent = `+${remaining}`;
          btn.dataset.expanded = "false";
          container.dataset.expanded = "false";
        }
      };
      btn.addEventListener("click", clickHandler);
      // Tracker pour nettoyage
      this._eventListeners.push({
        element: btn,
        event: "click",
        handler: clickHandler,
      });
    });
  }

  /**
   * Marque les images manquantes/corrompues avec la classe img-missing.
   * Remplace l'onerror inline (bloqué par le CSP d'Electron).
   */
  _initMissingImageHandlers(container) {
    container.querySelectorAll(".session-image-thumb").forEach((img) => {
      const markMissing = () => {
        img.style.display = "none";
        const wrapper = img.closest(".session-image-wrapper");
        if (wrapper) {
          wrapper.classList.add("img-missing");
          this._checkSessionAllMissing(wrapper);
        }
      };
      // Image déjà en erreur au moment de l'appel
      if (img.complete && img.naturalWidth === 0) {
        markMissing();
      } else {
        img.addEventListener("error", markMissing, { once: true });
      }
    });
  }

  /**
   * Désactive le bouton "reuse-session" si toutes les images de la session sont confirmées manquantes.
   */
  _checkSessionAllMissing(wrapper) {
    const sessionEl = wrapper.closest(".day-detail-session");
    if (!sessionEl) return;
    const sessionImages = sessionEl.querySelector(".session-images");
    if (!sessionImages) return;

    const total = parseInt(sessionImages.dataset.total || "0");
    if (total === 0) return;

    const shownCount = sessionImages.querySelectorAll(".session-image-wrapper").length;
    const missingCount = sessionImages.querySelectorAll(".session-image-wrapper.img-missing").length;

    // On ne peut confirmer que si tous les wrappers affichés = toutes les images de la session
    if (shownCount === total && missingCount === total) {
      sessionImages.style.display = "none";

      const reuseBtn = sessionEl.querySelector("[data-action='reuse-session']");
      if (reuseBtn && !reuseBtn.disabled) {
        reuseBtn.disabled = true;
        reuseBtn.setAttribute(
          "data-tooltip",
          tl("timeline.reuseSessionAllMissing", {}, "Fichiers introuvables"),
        );
      }
    }
  }

  /**
   * Attache les handlers de zoom sur les images d'un conteneur
   */
  _attachImageZoomHandlers(container, dateKey, sessionIndex) {
    const wrappers = container.querySelectorAll(".session-image-wrapper");
    wrappers.forEach((wrapper) => {
      const handler = (e) => {
        e.stopPropagation();
        if (wrapper.classList.contains("img-missing")) return;
        this._openZoomForSessionImage(
          dateKey,
          sessionIndex,
          parseInt(wrapper.dataset.imgIndex),
        );
      };
      wrapper.addEventListener("click", handler);
      // Tracker pour nettoyage quand on ferme le modal
      this._eventListeners.push({ element: wrapper, event: "click", handler });
    });
  }

  /**
   * Attache les handlers de zoom sur toutes les images du modal
   */
  _attachAllImageZoomHandlers(modal, dateKey) {
    const sessionImages = modal.querySelectorAll(".session-images");
    sessionImages.forEach((container) => {
      const sessionEl = container.closest(".day-detail-session");
      if (!sessionEl) return;
      const sessionIndex = parseInt(sessionEl.dataset.sessionIndex);
      if (isNaN(sessionIndex)) return;

      const wrappers = container.querySelectorAll(".session-image-wrapper");
      wrappers.forEach((wrapper) => {
        const handler = (e) => {
          e.stopPropagation();
          if (wrapper.classList.contains("img-missing")) return;
          this._openZoomForSessionImage(
            dateKey,
            sessionIndex,
            parseInt(wrapper.dataset.imgIndex),
          );
        };
        wrapper.addEventListener("click", handler);
        // Tracker pour nettoyage
        this._eventListeners.push({
          element: wrapper,
          event: "click",
          handler,
        });
      });
    });
  }

  /**
   * Ouvre le zoom pour une image d'une session historique
   */
  async _openZoomForSessionImage(dateKey, sessionIndex, imgIndex) {
    const data = TimelineData.getData();
    const dayData = data.days[dateKey];
    if (!dayData || !dayData.sessions || !dayData.sessions[sessionIndex])
      return;

    const session = dayData.sessions[sessionIndex];
    if (!session.images || !session.images[imgIndex]) return;

    const imgData = session.images[imgIndex];
    
    // Normaliser la liste des images pour la navigation (gérer ancien format string)
    const normalizedImageList = session.images.map((img) => {
      if (typeof img === "object") {
        return {
          id: img.id || null,
          filePath: img.filePath || img.path || img.file || "",
          ext: img.ext || "",
          thumbnailURL: img.thumbnailURL || img.thumbnail || "",
          url: img.url || "",
          name: img.name || "Image",
        };
      }
      // Ancien format: string URL
      return {
        id: null,
        filePath: img,
        ext: "",
        thumbnailURL: img,
        url: img,
        name: "Image",
      };
    });
    
    // Préparer les options de navigation pour le zoom
    const zoomOptions = {
      allowNavigation: true,
      imageList: normalizedImageList,
      currentIndex: imgIndex,
      onClose: () => {
        // Callback optionnel quand le zoom se ferme
      },
    };

    // Si on a l'ID et qu'on n'a pas le filePath, récupérer l'item via l'API Eagle
    // Éviter d'appeler l'API si on a déjà toutes les données nécessaires
    if (imgData.id && !imgData.filePath) {
      try {
        const item = await timelineItemGetById(imgData.id);
        console.log("[Timeline] Item récupéré via API Eagle:", item);

        // Vérifier que l'item retourné est valide (a un id)
        if (item && item.id && typeof window.openZoomForImage === "function") {
          // L'API Eagle retourne l'item directement
          console.log("[Timeline] Propriétés reçues de l'API:", {
            id: item.id,
            filePath: item.filePath,
            path: item.path,
            file: item.file,
            name: item.name,
          });

          // S'assurer qu'on a les propriétés nécessaires
          // PRIORITÉ: filePath de l'API > filePath stocké
          const imageForZoom = {
            id: item.id || imgData.id,
            filePath:
              item.filePath || item.path || item.file || imgData.filePath,
            ext: item.ext || imgData.ext || "",
            thumbnailURL:
              item.thumbnailURL || item.thumbnail || imgData.thumbnailURL,
            url: item.url || imgData.url,
            name: item.name || imgData.name || "Image",
          };

          console.log("[Timeline] Image envoyée au zoom:", imageForZoom);
          window.openZoomForImage(imageForZoom, zoomOptions);
          return;
        }
      } catch (e) {
        console.warn(
          "[Timeline] Impossible de récupérer l'item via l'API Eagle:",
          e,
        );
      }
    }

    // Fallback: utiliser les données stockées si l'API échoue ou si pas d'ID
    if (typeof window.openZoomForImage === "function") {
      const fallbackImage =
        typeof imgData === "object"
          ? {
              id: imgData.id || null,
              filePath: imgData.filePath || "", // PRIORITÉ: filePath = image originale
              ext: imgData.ext || "",
              thumbnailURL: imgData.thumbnailURL || "",
              url: imgData.url,
              name: imgData.name || "Image",
            }
          : {
              id: null,
              filePath: imgData, // Si c'est une string, c'est probablement l'ancien format (thumbnail URL)
              ext: "",
              thumbnailURL: imgData,
              url: imgData,
              name: "Image",
            };

      // Pour les anciennes sessions, essayer d'extraire l'ID du chemin du thumbnail
      // et appeler l'API Eagle
      const thumbPath = fallbackImage.filePath || fallbackImage.url;
      if (thumbPath && thumbPath.includes(".info/")) {
        // Extraire l'ID du dossier .info/ : .../ITEM_ID.info/...
        const match = thumbPath.match(/\/([A-Z0-9]+)\.info\//i);
        if (match && match[1]) {
          const extractedId = match[1];
          console.log(
            "[Timeline] ID extrait du chemin thumbnail:",
            extractedId,
          );

          // Essayer de récupérer l'item via l'API
          // NOTE: Désactivé car l'API Eagle peut planter si l'item n'existe plus
          // On préfère reconstruire le chemin à partir du thumbnail
          console.log("[Timeline] ID extrait mais API désactivée pour éviter les erreurs:", extractedId);
        }

        // Fallback: reconstruction du chemin (sans garantie)
        console.log("[Timeline] Tentative de reconstruction du chemin...");
        try {
          const basePath = thumbPath
            .replace(/\.info\//, "/")
            .replace(/_thumbnail\.(png|jpg)$/i, "");
          fallbackImage.filePath = basePath;
          fallbackImage.isReconstructed = true;
        } catch (e) {
          console.warn("[Timeline] Impossible de reconstruire le chemin:", e);
        }
      }

      console.log(
        "[Timeline] Fallback - Image envoyée au zoom:",
        fallbackImage,
      );
      window.openZoomForImage(fallbackImage, zoomOptions);
    }
  }

  /**
   * Demande confirmation avant de réinitialiser l'historique
   */
  async _confirmResetHistory() {
    const data = TimelineData.getData();
    const sessionsCount = Object.values(data.days || {}).reduce(
      (sum, day) => sum + ((day.sessions && day.sessions.length) || 0),
      0,
    );

    const title = tl("timeline.resetTitle", {}, "Réinitialiser l'historique");
    const baseMessage = tl(
      "timeline.resetConfirm",
      {},
      "Êtes-vous sûr de vouloir réinitialiser tout l'historique ? Cette action est irréversible.",
    );
    const totalPoses = data.stats && typeof data.stats.totalPoses === "number"
      ? data.stats.totalPoses
      : 0;
    const detailLine = `${totalPoses} ${tl("timeline.poses", {}, "poses")}  |  ${sessionsCount} ${tl("timeline.sessionsLabel", {}, "sessions")}`;
    const message = `${baseMessage}\n${detailLine}`;

    const { confirmed } = await openTimelineConfirmDialog({
      title,
      message,
      cancelText: tl("timeline.resetCancel", {}, "Annuler"),
      confirmText: tl("timeline.resetConfirmBtn", {}, "Réinitialiser"),
    });

    if (!confirmed) return;

    const snapshotBeforeReset = TimelineData.exportJSON();
    TimelineData.reset();
    this.render();

    const deletedMsg = tl(
      "notifications.deleteQueued",
      {},
      "Deleted. Undo available for 10 seconds.",
    );
    const undoLabel = tl("notifications.undo", {}, "Undo");

    if (
      scheduleTimelineUndoAction({
        id: `timeline-reset-${Date.now()}`,
        timeoutMs: 10000,
        message: deletedMsg,
        undoLabel,
        onUndo: () => {
          TimelineData.importJSON(snapshotBeforeReset);
          this.render();
          showTimelineToast(
            "success",
            tl("notifications.undoApplied", {}, "Action undone."),
            2000,
          );
        },
      })
    ) {
      return;
    }

    showTimelineToast(
      "success",
      tl("timeline.resetNotifBody", {}, "Tout l'historique a ete efface"),
      3000,
    );
  }

  /**
   * Demande confirmation avant de supprimer une journée
   * @param {string} dateKey - Format "YYYY-MM-DD"
   */
  async _confirmDeleteDay(dateKey) {
    const date = new Date(dateKey);
    const dayData = TimelineData.getDay(dateKey);
    const sessionsCount =
      dayData && dayData.sessions ? dayData.sessions.length : 0;
    const posesCount = dayData && typeof dayData.poses === "number"
      ? dayData.poses
      : 0;
    const totalTime = dayData && typeof dayData.time === "number"
      ? dayData.time
      : 0;
    const dateStr = date.toLocaleDateString(getLocale(), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const title = tl("timeline.deleteDayTitle", {}, "Supprimer la journée");
    const baseMessage = tl(
      "timeline.deleteDayConfirm",
      { date: dateStr },
      `Êtes-vous sûr de vouloir supprimer l'historique du ${dateStr} ?`,
    );
    const detailLine = `${sessionsCount} ${tl("timeline.sessionsLabel", {}, "sessions")}  |  ${posesCount} ${tl("timeline.poses", {}, "poses")}  |  ${FormatUtils.time(totalTime)}`;
    const message = `${baseMessage}\n${detailLine}`;

    const { confirmed } = await openTimelineConfirmDialog({
      title,
      message,
      cancelText: tl("timeline.deleteCancel", {}, "Annuler"),
      confirmText: tl("timeline.deleteConfirmBtn", {}, "Supprimer"),
    });

    if (!confirmed) return;

    const snapshotBeforeDelete = TimelineData.exportJSON();
    TimelineData.deleteDay(dateKey);
    this._closeDayDetail();
    this.render();

    const deletedMsg = tl(
      "notifications.deleteQueued",
      {},
      "Deleted. Undo available for 10 seconds.",
    );
    const undoLabel = tl("notifications.undo", {}, "Undo");

    if (
      scheduleTimelineUndoAction({
        id: `timeline-day-delete-${Date.now()}-${dateKey}`,
        timeoutMs: 10000,
        message: deletedMsg,
        undoLabel,
        onUndo: () => {
          TimelineData.importJSON(snapshotBeforeDelete);
          this.render();
          this._showDayDetail(dateKey);
          showTimelineToast(
            "success",
            tl("notifications.undoApplied", {}, "Action undone."),
            2000,
          );
        },
      })
    ) {
      return;
    }

    showTimelineToast(
      "success",
      tl("timeline.deleteNotifBody", {}, "Day history deleted"),
      3000,
    );
  }

  /**
   * Navigation avec limites
   */
  _navigate(direction) {
    const currentYear = new Date().getFullYear();
    const maxYear = currentYear + 1;

    if (this.currentView === "year") {
      const newYear = this.currentYear + direction;
      if (newYear >= MIN_YEAR && newYear <= maxYear) {
        this.currentYear = newYear;
        this.render();
      }
    } else if (this.currentView === "month") {
      let newMonth = this.currentMonth + direction;
      let newYear = this.currentYear;

      if (newMonth > 11) {
        newMonth = 0;
        newYear++;
      } else if (newMonth < 0) {
        newMonth = 11;
        newYear--;
      }

      if (newYear >= MIN_YEAR && newYear <= maxYear) {
        this.currentMonth = newMonth;
        this.currentYear = newYear;
        this.render();
      }
    } else if (this.currentView === "week") {
      const newOffset = this._weekOffset + direction;
      // Limiter la navigation dans le futur
      if (newOffset <= MAX_FUTURE_WEEKS) {
        this._weekOffset = newOffset;
        this.render();
      }
    }
  }

  /**
   * Initialise les tooltips
   */
  _initTooltips() {
    const cells = this.container.querySelectorAll(
      ".heatmap-cell[data-tooltip]",
    );

    // Réutiliser ou créer le tooltip
    let tooltip = document.getElementById(
      `timeline-tooltip-${this.containerId}`,
    );
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = `timeline-tooltip-${this.containerId}`;
      tooltip.className = "timeline-tooltip";
      document.body.appendChild(tooltip);
    }
    this._tooltip = tooltip;

    cells.forEach((cell) => {
      const enterHandler = (e) => {
        const text = e.target.dataset.tooltip;
        tooltip.innerHTML = escapeTimelineHtml(text).replace(/\n/g, "<br>");
        tooltip.classList.add("visible");

        const rect = e.target.getBoundingClientRect();
        tooltip.style.left = rect.left + rect.width / 2 + "px";
        tooltip.style.top = rect.top - 8 + "px";
      };

      const leaveHandler = () => {
        tooltip.classList.remove("visible");
      };

      this._addEvent(cell, "mouseenter", enterHandler);
      this._addEvent(cell, "mouseleave", leaveHandler);
    });
  }
}

// ================================================================
// API PUBLIQUE
// ================================================================

let timelineRendererSettings = null;
let timelineRendererReview = null;

/**
 * Initialise le module timeline (écran settings)
 * @param {boolean} forceShow - Si true, affiche immédiatement
 */
async function initTimeline(forceShow = false) {
  if (typeof CONFIG !== "undefined" && CONFIG.enableTimeline === false) {
    console.log("[Timeline] Module désactivé via CONFIG.enableTimeline");
    return;
  }

  await TimelineData.ensureHydrated();

  timelineRendererSettings = new TimelineRenderer("timeline-container", "year");

  if (!timelineRendererSettings.init()) return;

  const toggleBtn = document.getElementById("timeline-toggle-btn");
  const container = document.getElementById("timeline-container");

  if (toggleBtn && container) {
    const defaultVisible =
      typeof CONFIG !== "undefined" && CONFIG.timelineVisibleByDefault === true;
    const isVisible = forceShow || defaultVisible;

    if (isVisible) {
      container.classList.remove("collapsed");
      toggleBtn.classList.add("expanded");
      timelineRendererSettings.render();
    } else {
      container.classList.add("collapsed");
      toggleBtn.classList.remove("expanded");
    }

    toggleBtn.addEventListener("click", () => {
      const isCollapsed = container.classList.contains("collapsed");

      if (isCollapsed) {
        timelineRendererSettings.render();
        container.classList.remove("collapsed");
        toggleBtn.classList.add("expanded");

        const settingsScreen = document.getElementById("settings-screen");
        if (settingsScreen) {
          settingsScreen.scrollTo({
            top: settingsScreen.scrollHeight,
            behavior: "smooth",
          });
        }
      } else {
        container.classList.add("collapsed");
        toggleBtn.classList.remove("expanded");
      }
    });
  }
}

/**
 * Initialise le timeline pour l'écran review
 */
async function initTimelineReview() {
  if (typeof CONFIG !== "undefined" && CONFIG.enableTimeline === false) {
    return;
  }

  // Vérifier si le conteneur existe avant d'initialiser
  const container = document.getElementById("timeline-container-review");
  if (!container) {
    // Le conteneur n'existe pas, ne pas initialiser
    return;
  }

  await TimelineData.ensureHydrated();

  timelineRendererReview = new TimelineRenderer(
    "timeline-container-review",
    "month",
  );

  if (timelineRendererReview.init()) {
    timelineRendererReview.render();
  }
}

/**
 * Rafraîchit le timeline review
 */
function refreshTimelineReview() {
  if (typeof CONFIG !== "undefined" && CONFIG.enableTimeline === false) {
    return;
  }

  if (timelineRendererReview && timelineRendererReview.container) {
    timelineRendererReview.render();
  } else {
    void initTimelineReview();
  }
}

function refreshTimelineSettings() {
  if (typeof CONFIG !== "undefined" && CONFIG.enableTimeline === false) {
    return;
  }

  if (timelineRendererSettings && timelineRendererSettings.container) {
    timelineRendererSettings.render();
  } else {
    void initTimeline();
  }
}

async function flushTimelineStorage() {
  if (
    window.TimelineData &&
    typeof window.TimelineData.flushPersist === "function"
  ) {
    try {
      await window.TimelineData.flushPersist();
    } catch (e) {
      console.error("[Timeline] flush error:", e);
    }
  }
}

/**
 * Enregistre une session terminée
 * @param {number} poses - Nombre de poses
 * @param {number} timeSeconds - Temps en secondes
 * @param {Object} details - Détails de la session (mode, images, etc.)
 */
function recordSession(poses, timeSeconds, details = {}) {
  const result = TimelineData.addSession(poses, timeSeconds, details);

  // Session invalide, ne rien faire
  if (!result) return;

  // Rafraîchir settings si visible (avec debounce)
  const settingsContainer = document.getElementById("timeline-container");
  if (
    settingsContainer &&
    !settingsContainer.classList.contains("collapsed") &&
    timelineRendererSettings
  ) {
    timelineRendererSettings._debouncedRender();
  }

  // Rafraîchir review si initialisé (avec debounce)
  if (timelineRendererReview && timelineRendererReview.container) {
    timelineRendererReview._debouncedRender();
  }
}

/**
 * Récupère les statistiques globales
 */
function getTimelineStats() {
  return TimelineData.getStats();
}

// Exposer pour accès global
window.getLocale = getLocale;
window.initTimeline = initTimeline;
window.initTimelineReview = initTimelineReview;
window.refreshTimelineReview = refreshTimelineReview;
window.refreshTimelineSettings = refreshTimelineSettings;
window.flushTimelineStorage = flushTimelineStorage;
window.recordSession = recordSession;
window.getTimelineStats = getTimelineStats;
window.TimelineData = TimelineData;
