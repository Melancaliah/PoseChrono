(function initPoseChronoSharedSessionTimeFormatUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toSafeSeconds(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function formatCompactDuration(seconds) {
    const safe = toSafeSeconds(seconds);
    if (safe <= 0) return "0s";

    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(" ");
  }

  function formatClockDuration(seconds) {
    const safe = toSafeSeconds(seconds);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function createSessionTimeFormatUtils() {
    return {
      toSafeSeconds,
      formatCompactDuration,
      formatClockDuration,
    };
  }

  sharedRoot.createSessionTimeFormatUtils = createSessionTimeFormatUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
