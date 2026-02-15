(function initPoseChronoSharedSessionReplayUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  const VALID_MODES = new Set(["classique", "custom", "relax", "memory"]);
  const VALID_MEMORY_TYPES = new Set(["flash", "progressive"]);

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function normalizeMode(mode, fallback = "classique") {
    const normalized = String(mode || "").trim().toLowerCase();
    if (VALID_MODES.has(normalized)) return normalized;
    const fb = String(fallback || "classique").trim().toLowerCase();
    return VALID_MODES.has(fb) ? fb : "classique";
  }

  function normalizeMemoryType(memoryType, mode = "classique") {
    if (normalizeMode(mode) !== "memory") return null;
    const normalized = String(memoryType || "").trim().toLowerCase();
    if (VALID_MEMORY_TYPES.has(normalized)) return normalized;
    return "flash";
  }

  function sanitizeCustomQueue(customQueue) {
    if (!Array.isArray(customQueue)) return [];
    return customQueue
      .filter((step) => step && typeof step === "object")
      .map((step) => ({
        type: step.type === "pause" ? "pause" : "pose",
        count: Math.max(1, Math.round(toNumber(step.count, 1))),
        duration: Math.max(1, Math.round(toNumber(step.duration, 60))),
      }));
  }

  function extractImageIdsFromSession(session) {
    const images = Array.isArray(session?.images) ? session.images : [];
    const out = [];
    const seen = new Set();
    images.forEach((img) => {
      const id = typeof img === "object" && img !== null ? img.id : null;
      if (id === undefined || id === null) return;
      const key = String(id);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(id);
    });
    return out;
  }

  function computeReplayDuration(session) {
    const poses = Math.max(0, toNumber(session?.poses, 0));
    const time = Math.max(0, toNumber(session?.time, 0));
    if (poses <= 0 || time <= 0) return null;
    return time / poses;
  }

  function buildReplayOptionsFromSession(session) {
    const mode = normalizeMode(session?.mode);
    const duration = computeReplayDuration(session);
    const customQueue = mode === "custom" ? sanitizeCustomQueue(session?.customQueue) : [];
    const memoryType = normalizeMemoryType(session?.memoryType, mode);
    return {
      mode,
      duration,
      customQueue,
      memoryType,
    };
  }

  function normalizeLoadSessionOptions(options) {
    const mode = normalizeMode(options?.mode);
    const durationRaw = toNumber(options?.duration, 0);
    const duration = durationRaw > 0 ? Math.round(durationRaw) : null;
    const customQueue = mode === "custom" ? sanitizeCustomQueue(options?.customQueue) : [];
    const memoryType = normalizeMemoryType(options?.memoryType, mode);
    return {
      mode,
      duration,
      customQueue,
      memoryType,
    };
  }

  function createSessionReplayUtils() {
    return {
      normalizeMode,
      normalizeMemoryType,
      sanitizeCustomQueue,
      extractImageIdsFromSession,
      computeReplayDuration,
      buildReplayOptionsFromSession,
      normalizeLoadSessionOptions,
    };
  }

  sharedRoot.createSessionReplayUtils = createSessionReplayUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
