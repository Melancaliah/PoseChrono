// ================================================================
// MODULE HISTORIQUE / TIMELINE (PoseChrono)
// ================================================================



// ================================================================
// CONSTANTES
// ================================================================

const TIMELINE_STORAGE_KEY = "posechrono-timeline-data";
const DAYS_IN_WEEK = 7;
const WEEKS_TO_SHOW = 53; // ~1 an
const MIN_YEAR = 2024;
const MAX_FUTURE_WEEKS = 8; // Limite de navigation dans le futur
const YEARS_TO_KEEP = 3; // Nombre d'années à conserver dans localStorage

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

/**
 * Retourne le code locale BCP47 basé sur la langue active de i18next
 * @returns {string}
 */
function getLocale() {
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
 * @param {Object} options - Options i18next
 * @param {string} fallback - Valeur par défaut
 * @returns {string}
 */
function tl(key, options = {}, fallback = "") {
  if (typeof i18next !== "undefined" && i18next.t) {
    const result = i18next.t(key, options);
    // i18next retourne la clé si non trouvée
    return result !== key ? result : fallback;
  }
  return fallback;
}

/**
 * Récupère les labels des jours (abrégés)
 * @returns {string[]}
 */
function getDayLabels() {
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
    return d1.toDateString() === d2.toDateString();
  },

  /**
   * Vérifie si une date est dans le futur
   * @param {Date} date
   * @param {Date} today
   * @returns {boolean}
   */
  isFuture(date, today) {
    return date > today;
  },

  /**
   * Obtient le premier lundi avant une date donnée
   * @param {Date} date
   * @returns {Date}
   */
  getMondayBefore(date) {
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
    return num.toLocaleString(getLocale());
  },

  /**
   * Formate le temps en format lisible (abrégé)
   * Format: "xh ymin zs" (adapte selon les valeurs)
   * @param {number} seconds
   * @returns {string}
   */
  time(seconds) {
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
    return date.toLocaleDateString(getLocale(), options);
  },
};

// ================================================================
// GESTIONNAIRE DE DONNÉES
// ================================================================

const TimelineData = {
  _data: null,

  /**
   * Structure de données par défaut
   * @returns {Object}
   */
  _getDefaultData() {
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

  /**
   * Charge les données depuis localStorage
   * @returns {Object}
   */
  load() {
    try {
      const stored = localStorage.getItem(TIMELINE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validation basique de la structure
        if (
          parsed &&
          typeof parsed === "object" &&
          parsed.days &&
          parsed.stats
        ) {
          this._data = parsed;
        } else {
          console.warn("[Timeline] Données corrompues, réinitialisation");
          this._data = this._getDefaultData();
        }
      } else {
        this._data = this._getDefaultData();
      }
    } catch (e) {
      console.error("[Timeline] Erreur chargement données:", e);
      this._data = this._getDefaultData();
    }
    return this._data;
  },

  /**
   * Nettoie les données anciennes pour libérer de l'espace
   * Garde seulement les YEARS_TO_KEEP dernières années
   */
  _cleanupOldData() {
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
    // Note: currentStreak et bestStreak nécessitent un recalcul complexe
    // On les garde telles quelles pour l'instant
  },

  /**
   * Sauvegarde les données dans localStorage
   */
  save() {
    try {
      localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      if (
        e.name === "QuotaExceededError" ||
        (e.message && e.message.includes("quota"))
      ) {
        console.warn(
          "[Timeline] Quota localStorage dépassé, nettoyage des anciennes données...",
        );
        this._cleanupOldData();
        // Retry une fois
        try {
          localStorage.setItem(
            TIMELINE_STORAGE_KEY,
            JSON.stringify(this._data),
          );
          console.log("[Timeline] Sauvegarde réussie après nettoyage");
        } catch (e2) {
          console.error(
            "[Timeline] Échec sauvegarde même après nettoyage:",
            e2,
          );
        }
      } else {
        console.error("[Timeline] Erreur sauvegarde données:", e);
      }
    }
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
   * Valide et normalise les paramètres d'une session
   * @param {number} poses
   * @param {number} time
   * @returns {{poses: number, time: number, isValid: boolean}}
   */
  _validateSession(poses, time) {
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
    const today = DateUtils.toKey(new Date());
    const now = new Date();

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
            <span class="session-mode">${getModeLabel(session.mode, session.memoryType)}</span>
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
                  const imgSrc = imgData.thumbnailURL || imgData.url || img;
                  const imgId = imgData.id || "";
                  const isVideo = VIDEO_EXTENSIONS.includes(
                    (imgData.ext || "").toLowerCase(),
                  );
                  const videoClass = isVideo ? "is-video" : "";
                  const videoIndicator = isVideo
                    ? `<div class="video-thumb-indicator">${ICONS.VIDEO_PLAY || "▶"}</div>`
                    : "";
                  return `
                <div class="session-image-wrapper ${videoClass}" data-img-index="${idx}" data-img-id="${imgId}">
                  <img src="${imgSrc}" alt="" loading="lazy" onerror="this.style.display='none'" class="session-image-thumb">
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
      const title = tl(
        "timeline.deleteSessionTitle",
        {},
        "Supprimer la session",
      );
      const message = tl(
        "timeline.deleteSessionConfirm",
        {},
        "Êtes-vous sûr de vouloir supprimer cette session ?",
      );

      try {
        // Utiliser une dialog custom avec checkbox
        const result = await eagle.dialog.showMessageBox({
          type: "warning",
          title: title,
          message: message,
          buttons: [
            tl("timeline.deleteCancel", {}, "Annuler"),
            tl("timeline.deleteConfirmBtn", {}, "Supprimer"),
          ],
          defaultId: 0,
          cancelId: 0,
          checkboxLabel: tl(
            "timeline.skipConfirm",
            {},
            "Ne plus demander confirmation",
          ),
        });

        // Sauvegarder la préférence si cochée
        if (result.checkboxChecked) {
          localStorage.setItem("timeline-skip-session-delete-confirm", "true");
        }

        if (result.response !== 1) {
          return; // Annulé
        }
      } catch (e) {
        console.error("[Timeline] Erreur dialog:", e);
        return;
      }
    }

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

      // Notification
      if (
        typeof eagle !== "undefined" &&
        eagle.notification &&
        eagle.notification.show
      ) {
        eagle.notification.show({
          title: tl("timeline.sessionDeleted", {}, "Session supprimée"),
          body: tl(
            "timeline.sessionDeletedBody",
            {},
            "La session a été supprimée",
          ),
          mute: false,
          duration: 2000,
        });
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
    const imageIds = session.images
      .map((img) => (typeof img === "object" ? img.id : null))
      .filter((id) => id);

    if (imageIds.length === 0) {
      console.warn(
        "[Timeline] Pas d'IDs d'images disponibles (anciennes sessions sans ID)",
      );
      // Notification à l'utilisateur
      if (typeof eagle !== "undefined" && eagle.notification) {
        eagle.notification.show({
          title: tl("timeline.reuseError", {}, "Impossible de rejouer"),
          body: tl(
            "timeline.reuseErrorOldSession",
            {},
            "Cette session est trop ancienne et ne contient pas les IDs des images.",
          ),
          mute: false,
          duration: 3000,
        });
      }
      return;
    }

    // Appeler la fonction globale du plugin pour charger les images
    if (typeof window.loadSessionImages === "function") {
      try {
        await window.loadSessionImages(imageIds, {
          mode: session.mode,
          duration: session.time / session.poses, // Durée moyenne par pose
          customQueue: session.customQueue, // Restaurer la structure custom si présente
          memoryType: session.memoryType, // Restaurer le type de mémoire si présent
        });

        // Fermer le modal
        this._closeDayDetail();

        // Notification de succès
        if (typeof eagle !== "undefined" && eagle.notification) {
          eagle.notification.show({
            title: tl(
              "timeline.reuseSuccess",
              {},
              "Session restaurée avec succès",
            ),
            body: tl(
              "timeline.reuseSuccessBody",
              { count: imageIds.length },
              `${imageIds.length} images chargées`,
            ),
            mute: false,
            duration: 2000,
          });
        }
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
            const imgSrc = imgData.thumbnailURL || imgData.url || img;
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
   * Attache les handlers de zoom sur les images d'un conteneur
   */
  _attachImageZoomHandlers(container, dateKey, sessionIndex) {
    const wrappers = container.querySelectorAll(".session-image-wrapper");
    wrappers.forEach((wrapper) => {
      const handler = (e) => {
        e.stopPropagation();
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
    if (
      imgData.id &&
      !imgData.filePath && // Ne pas appeler l'API si on a déjà le filePath
      typeof eagle !== "undefined" &&
      eagle.item &&
      eagle.item.getById
    ) {
      try {
        const item = await eagle.item.getById(imgData.id);
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
    const title = tl("timeline.resetTitle", {}, "Réinitialiser l'historique");
    const message = tl(
      "timeline.resetConfirm",
      {},
      "Êtes-vous sûr de vouloir réinitialiser tout l'historique ? Cette action est irréversible.",
    );

    try {
      const result = await eagle.dialog.showMessageBox({
        type: "warning",
        title: title,
        message: message,
        buttons: [
          tl("timeline.resetCancel", {}, "Annuler"),
          tl("timeline.resetConfirmBtn", {}, "Réinitialiser"),
        ],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response === 1) {
        TimelineData.reset();
        this.render();

        // Notification de confirmation
        if (
          typeof eagle !== "undefined" &&
          eagle.notification &&
          eagle.notification.show
        ) {
          eagle.notification.show({
            title: tl("timeline.resetNotifTitle", {}, "Historique effacé"),
            body: tl(
              "timeline.resetNotifBody",
              {},
              "Tout l'historique a été effacé",
            ),
            mute: false,
            duration: 3000,
          });
        }
      }
    } catch (e) {
      console.error("[Timeline] Erreur dialog Eagle:", e);
    }
  }

  /**
   * Demande confirmation avant de supprimer une journée
   * @param {string} dateKey - Format "YYYY-MM-DD"
   */
  async _confirmDeleteDay(dateKey) {
    const date = new Date(dateKey);
    const dateStr = date.toLocaleDateString(getLocale(), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const title = tl("timeline.deleteDayTitle", {}, "Supprimer la journée");
    const message = tl(
      "timeline.deleteDayConfirm",
      { date: dateStr },
      `Êtes-vous sûr de vouloir supprimer l'historique du ${dateStr} ?`,
    );

    try {
      const result = await eagle.dialog.showMessageBox({
        type: "warning",
        title: title,
        message: message,
        buttons: [
          tl("timeline.deleteCancel", {}, "Annuler"),
          tl("timeline.deleteConfirmBtn", {}, "Supprimer"),
        ],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response === 1) {
        TimelineData.deleteDay(dateKey);
        this._closeDayDetail();
        this.render();

        // Notification de confirmation
        if (
          typeof eagle !== "undefined" &&
          eagle.notification &&
          eagle.notification.show
        ) {
          eagle.notification.show({
            title: tl("timeline.deleteNotifTitle", {}, "Journée supprimée"),
            body: tl(
              "timeline.deleteNotifBody",
              {},
              "L'historique de la journée a bien été effacé",
            ),
            mute: false,
            duration: 3000,
          });
        }
      }
    } catch (e) {
      console.error("[Timeline] Erreur dialog Eagle:", e);
    }
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
        tooltip.innerHTML = text.replace(/\n/g, "<br>");
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
function initTimeline(forceShow = false) {
  if (typeof CONFIG !== "undefined" && CONFIG.enableTimeline === false) {
    console.log("[Timeline] Module désactivé via CONFIG.enableTimeline");
    return;
  }

  TimelineData.load();

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
function initTimelineReview() {
  if (typeof CONFIG !== "undefined" && CONFIG.enableTimeline === false) {
    return;
  }

  // Vérifier si le conteneur existe avant d'initialiser
  const container = document.getElementById("timeline-container-review");
  if (!container) {
    // Le conteneur n'existe pas, ne pas initialiser
    return;
  }

  TimelineData.load();

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
    initTimelineReview();
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
window.recordSession = recordSession;
window.getTimelineStats = getTimelineStats;
window.TimelineData = TimelineData;
