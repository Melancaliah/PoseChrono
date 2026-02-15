(function initPoseChronoSharedPlatformAccessUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createPlatformAccessUtils(options = {}) {
    const getterName = String(options.getterName || "getPoseChronoPlatform");

    function getPlatform() {
      try {
        if (
          typeof window !== "undefined" &&
          typeof window[getterName] === "function"
        ) {
          return window[getterName]();
        }
      } catch (_) {}
      return null;
    }

    return {
      getPlatform,
    };
  }

  sharedRoot.createPlatformAccessUtils = createPlatformAccessUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

