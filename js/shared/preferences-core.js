(function initPoseChronoSharedPreferencesCore(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  const SESSION_MODES = ["classique", "custom", "relax", "memory"];
  const SESSION_MODE_SET = new Set(SESSION_MODES);

  function normalizeSessionModeValue(mode, fallback = "classique") {
    const normalized = String(mode ?? "")
      .trim()
      .toLowerCase();
    const fallbackNormalized = String(fallback ?? "classique")
      .trim()
      .toLowerCase();
    if (SESSION_MODE_SET.has(normalized)) return normalized;
    return SESSION_MODE_SET.has(fallbackNormalized)
      ? fallbackNormalized
      : "classique";
  }

  function normalizeStringArray(input) {
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
  }

  function createDefaultSessionModeUtils(options = {}) {
    const normalize =
      typeof options.normalizeSessionModeValue === "function"
        ? options.normalizeSessionModeValue
        : normalizeSessionModeValue;
    const getValue =
      typeof options.getValue === "function" ? options.getValue : () => undefined;
    const setValue =
      typeof options.setValue === "function" ? options.setValue : null;

    function load(fallback = "classique") {
      const safeFallback = normalize(fallback);
      try {
        const value = getValue();
        if (value === undefined || value === null || value === "") {
          return safeFallback;
        }
        return normalize(value, safeFallback);
      } catch (_) {
        return safeFallback;
      }
    }

    function save(mode, persist = true) {
      const next = normalize(mode);
      if (!persist || typeof setValue !== "function") return next;
      try {
        setValue(next);
      } catch (_) {}
      return next;
    }

    return {
      load,
      save,
    };
  }

  sharedRoot.prefs = {
    SESSION_MODES: SESSION_MODES.slice(),
    normalizeSessionModeValue,
    normalizeStringArray,
    createDefaultSessionModeUtils,
  };

  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
