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
    let fallbackMaximizedState = false;

    async function toggleMaximize() {
      const platform = getPlatform();
      try {
        if (platform?.window) {
          const canMaximize = typeof platform.window.maximize === "function";
          const canUnmaximize = typeof platform.window.unmaximize === "function";
          const canReadMaximized = typeof platform.window.isMaximized === "function";

          if (canReadMaximized) {
            try {
              const isMaximized = !!(await platform.window.isMaximized());
              fallbackMaximizedState = isMaximized;
              if (isMaximized && canUnmaximize) {
                await platform.window.unmaximize();
                fallbackMaximizedState = false;
                return null;
              }
              if (!isMaximized && canMaximize) {
                await platform.window.maximize();
                fallbackMaximizedState = true;
                return null;
              }
            } catch (_) {}
          }

          if (canMaximize && canUnmaximize) {
            if (fallbackMaximizedState) {
              await platform.window.unmaximize();
              fallbackMaximizedState = false;
            } else {
              await platform.window.maximize();
              fallbackMaximizedState = true;
            }
            return null;
          }
          if (canMaximize) {
            await platform.window.maximize();
            fallbackMaximizedState = true;
            return null;
          }
          if (canUnmaximize) {
            await platform.window.unmaximize();
            fallbackMaximizedState = false;
            return null;
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

