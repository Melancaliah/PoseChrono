(function initPoseChronoSharedPlatformWindowUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createPlatformWindowUtils(options = {}) {
    const getPlatform =
      typeof options.getPlatform === "function" ? options.getPlatform : () => null;
    const warnMissingCapability =
      typeof options.warnMissingCapability === "function"
        ? options.warnMissingCapability
        : () => {};

    async function toggleMaximize() {
      const platform = getPlatform();
      try {
        if (platform?.window) {
          const isMaximized = await (platform.window.isMaximized?.() || false);
          if (isMaximized && platform.window.unmaximize) {
            await platform.window.unmaximize();
            return;
          }
          if (!isMaximized && platform.window.maximize) {
            await platform.window.maximize();
            return;
          }
        }
      } catch (_) {}
      warnMissingCapability("windowControls", "window.toggleMaximize");
    }

    async function toggleAlwaysOnTop() {
      const platform = getPlatform();
      try {
        if (platform?.window) {
          const isOnTop = await (platform.window.isAlwaysOnTop?.() || false);
          if (platform.window.setAlwaysOnTop) {
            await platform.window.setAlwaysOnTop(!isOnTop);
          }
          return !isOnTop;
        }
      } catch (_) {}
      warnMissingCapability("windowControls", "window.toggleAlwaysOnTop");
      return false;
    }

    return {
      toggleMaximize,
      toggleAlwaysOnTop,
    };
  }

  sharedRoot.createPlatformWindowUtils = createPlatformWindowUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

