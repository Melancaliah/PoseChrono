(function initPoseChronoSharedTimelineDisplayUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createTimelineDisplayUtils(deps = {}) {
    const t = typeof deps.t === "function" ? deps.t : null;
    const formatTime =
      typeof deps.formatTime === "function" ? deps.formatTime : (seconds) => String(seconds || 0);

    function translate(key, options, fallback) {
      if (t) {
        return t(key, options || {}, fallback || "");
      }
      return fallback || "";
    }

    function getDayLabels() {
      const result = translate("timeline.dayLabels", { returnObjects: true }, null);
      if (Array.isArray(result)) return result;
      return ["L", "M", "M", "J", "V", "S", "D"];
    }

    function getMonthLabels() {
      const result = translate("timeline.monthLabels", { returnObjects: true }, null);
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

    function getModeLabel(mode, memoryType) {
      const labels = {
        classique: translate("modes.classic.title", {}, "Classique"),
        custom: translate("modes.custom.title", {}, "Personnalisé"),
        relax: translate("modes.relax.title", {}, "Tranquille"),
        memory: translate("modes.memory.title", {}, "Mémoire"),
      };

      let label = labels[mode] || mode;
      if (mode === "memory" && memoryType) {
        const memoryTypeLabels = {
          flash: translate("modes.memory.flash", {}, "Flash"),
          progressive: translate("modes.memory.progressive", {}, "Progressif"),
        };
        const typeLabel = memoryTypeLabels[memoryType] || memoryType;
        label += ` (${typeLabel})`;
      }
      return label;
    }

    function formatCustomStructure(customQueue) {
      if (!customQueue || customQueue.length === 0) return "";

      const title = `<div class="custom-structure-title">${translate("timeline.sessionPlan", {}, "Plan de la session")}</div>`;

      const steps = customQueue.map((step) => {
        const timeStr = formatTime(step.duration);
        if (step.type === "pause") {
          return `<div class="custom-step pause">${translate("timeline.pauseStep", {}, "Pause")} ${timeStr}</div>`;
        }
        const poseWord =
          step.count > 1
            ? translate("timeline.poses", {}, "poses")
            : translate("timeline.pose", {}, "pose");
        return `<div class="custom-step pose">${step.count} ${poseWord} ${translate("timeline.of", {}, "de")} ${timeStr}</div>`;
      });

      return title + steps.join("");
    }

    return {
      getDayLabels,
      getMonthLabels,
      getModeLabel,
      formatCustomStructure,
    };
  }

  sharedRoot.createTimelineDisplayUtils = createTimelineDisplayUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

