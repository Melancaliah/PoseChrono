(function initPoseChronoSharedTimelineFormatUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toSafeSeconds(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function createTimelineFormatUtils(options = {}) {
    const getLocale =
      typeof options.getLocale === "function" ? options.getLocale : () => "en-US";
    const minuteLabel =
      typeof options.minuteLabel === "string" && options.minuteLabel
        ? options.minuteLabel
        : "min";

    function formatNumber(num) {
      try {
        return Number(num || 0).toLocaleString(getLocale());
      } catch (_) {
        return String(Number(num || 0));
      }
    }

    function formatTime(seconds) {
      const safe = toSafeSeconds(seconds);
      if (safe <= 0) return "0s";

      const hours = Math.floor(safe / 3600);
      const minutes = Math.floor((safe % 3600) / 60);
      const secs = safe % 60;
      const parts = [];

      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}${minuteLabel}`);
      if (secs > 0 && hours === 0) parts.push(`${secs}s`);

      if (parts.length === 0) return "0s";
      return parts.join(" ");
    }

    function formatDate(date, optionsArg) {
      const options =
        optionsArg || { weekday: "long", day: "numeric", month: "long" };
      try {
        return date.toLocaleDateString(getLocale(), options);
      } catch (_) {
        return String(date);
      }
    }

    return {
      toSafeSeconds,
      formatNumber,
      formatTime,
      formatDate,
    };
  }

  sharedRoot.createTimelineFormatUtils = createTimelineFormatUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

