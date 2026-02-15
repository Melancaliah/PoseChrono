(function initPoseChronoSharedStorageDiagnosticsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function safeCall(fn, fallback) {
    try {
      if (typeof fn === "function") return fn();
    } catch (_) {}
    return fallback;
  }

  function extractTimelineStatsFromData(data) {
    const source =
      data &&
      typeof data === "object" &&
      data.data &&
      typeof data.data === "object"
        ? data.data
        : data;
    const daysObj =
      source && typeof source === "object" && source.days ? source.days : {};
    const daysEntries =
      daysObj && typeof daysObj === "object" ? Object.values(daysObj) : [];
    const days = daysEntries.length;
    const sessions = daysEntries.reduce(
      (sum, day) =>
        sum + (Array.isArray(day && day.sessions) ? day.sessions.length : 0),
      0,
    );
    return { days, sessions };
  }

  async function collectStorageDiagnostics(input = {}) {
    const diagnostics = {
      timelineDays: 0,
      timelineSessions: 0,
      plansCount: 0,
      customHotkeysCount: 0,
    };

    const hotkeysCount =
      typeof input.customHotkeysCount === "number"
        ? input.customHotkeysCount
        : safeCall(input.getCustomHotkeysCount, 0);
    diagnostics.customHotkeysCount = Math.max(
      0,
      Number.isFinite(hotkeysCount) ? Math.round(hotkeysCount) : 0,
    );

    try {
      let timelineSource = undefined;
      if (typeof input.getTimelineData === "function") {
        timelineSource = await input.getTimelineData();
      }
      if (
        timelineSource === undefined &&
        typeof input.loadTimelinePayload === "function"
      ) {
        timelineSource = await input.loadTimelinePayload();
      }
      if (timelineSource !== undefined) {
        const timelineStats = extractTimelineStatsFromData(timelineSource);
        diagnostics.timelineDays = timelineStats.days;
        diagnostics.timelineSessions = timelineStats.sessions;
      }
    } catch (_) {}

    try {
      let plansPayload = undefined;
      if (typeof input.loadPlansPayload === "function") {
        plansPayload = await input.loadPlansPayload();
      }
      if (
        plansPayload === undefined &&
        typeof input.loadLegacyPlansPayload === "function"
      ) {
        plansPayload = await input.loadLegacyPlansPayload();
      }

      if (plansPayload !== undefined && plansPayload !== null) {
        if (typeof input.normalizeSessionPlansPayload === "function") {
          const normalized = input.normalizeSessionPlansPayload(plansPayload);
          const count = normalized && normalized.plans && normalized.plans.length;
          diagnostics.plansCount = Math.max(
            0,
            Number.isFinite(count) ? Math.round(count) : 0,
          );
        } else if (Array.isArray(plansPayload)) {
          diagnostics.plansCount = plansPayload.length;
        } else if (plansPayload && Array.isArray(plansPayload.plans)) {
          diagnostics.plansCount = plansPayload.plans.length;
        }
      }
    } catch (_) {}

    return diagnostics;
  }

  function createStorageDiagnosticsUtils() {
    return {
      extractTimelineStatsFromData,
      collectStorageDiagnostics,
    };
  }

  sharedRoot.createStorageDiagnosticsUtils = createStorageDiagnosticsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

