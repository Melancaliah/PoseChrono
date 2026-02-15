(function initPoseChronoSharedRuntimeModeUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createRuntimeModeUtils(options = {}) {
    const desktopPlatformValue = String(options.desktopPlatformValue || "desktop");

    function isDesktopStandaloneRuntime() {
      try {
        return (
          typeof window !== "undefined" &&
          !!window.poseChronoDesktop &&
          window.poseChronoDesktop.platform === desktopPlatformValue
        );
      } catch (_) {
        return false;
      }
    }

    function getRevealActionI18nKey() {
      return isDesktopStandaloneRuntime()
        ? "drawing.revealInExplorer"
        : "drawing.openInEagle";
    }

    return {
      isDesktopStandaloneRuntime,
      getRevealActionI18nKey,
    };
  }

  sharedRoot.createRuntimeModeUtils = createRuntimeModeUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

