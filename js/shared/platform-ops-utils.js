(function initPoseChronoSharedPlatformOpsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function resolvePath(target, path) {
    const parts = String(path || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!target || parts.length === 0) return null;
    let node = target;
    for (const part of parts) {
      if (!node || typeof node !== "object") return null;
      node = node[part];
    }
    return node;
  }

  function createPlatformOpsUtils(options = {}) {
    const getPlatform =
      typeof options.getPlatform === "function" ? options.getPlatform : () => null;
    const warnMissingCapability =
      typeof options.warnMissingCapability === "function"
        ? options.warnMissingCapability
        : () => {};

    function call(path, args = [], config = {}) {
      const platform = getPlatform();
      const fn = resolvePath(platform, path);
      const safeArgs = Array.isArray(args) ? args : [args];
      if (typeof fn === "function") {
        try {
          fn(...safeArgs);
          return true;
        } catch (_) {}
      }
      if (config.capability && config.operationLabel) {
        warnMissingCapability(config.capability, config.operationLabel);
      }
      return false;
    }

    async function callAsync(path, args = [], config = {}) {
      const platform = getPlatform();
      const fn = resolvePath(platform, path);
      const safeArgs = Array.isArray(args) ? args : [args];
      if (typeof fn === "function") {
        try {
          return await fn(...safeArgs);
        } catch (_) {}
      }
      if (config.capability && config.operationLabel) {
        warnMissingCapability(config.capability, config.operationLabel);
      }
      return config.fallback;
    }

    async function callBoolean(path, args = [], config = {}) {
      const failToken = Symbol("platform-op-fail");
      const result = await callAsync(path, args, {
        capability: config.capability,
        operationLabel: config.operationLabel,
        fallback: failToken,
      });
      return result !== failToken;
    }

    async function callArray(path, args = [], config = {}) {
      const result = await callAsync(path, args, {
        capability: config.capability,
        operationLabel: config.operationLabel,
        fallback: [],
      });
      return Array.isArray(result) ? result : [];
    }

    return {
      call,
      callAsync,
      callBoolean,
      callArray,
    };
  }

  sharedRoot.createPlatformOpsUtils = createPlatformOpsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
