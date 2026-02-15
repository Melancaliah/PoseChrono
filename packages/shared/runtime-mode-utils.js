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

    function getAppSubtitleI18nKey() {
      return isDesktopStandaloneRuntime() ? "app.subtitleDesktop" : "app.subtitle";
    }

    function getMediaSourceAnalyzedI18nKey(useFallbackSource = false) {
      if (isDesktopStandaloneRuntime()) {
        return "settings.mediaFoldersAnalyzed";
      }
      return useFallbackSource
        ? "settings.allLibraryAnalyzed"
        : "settings.imagesAnalyzed";
    }

    function isCapabilityEnabled(platform, capabilityKey, fallback = false) {
      const key = String(capabilityKey || "").trim();
      if (!key) return !!fallback;
      const capabilities = platform?.capabilities;
      if (
        capabilities &&
        Object.prototype.hasOwnProperty.call(capabilities, key)
      ) {
        return !!capabilities[key];
      }
      return !!fallback;
    }

    function isTagsFeatureAvailable(platform) {
      return isCapabilityEnabled(
        platform,
        "tags",
        !isDesktopStandaloneRuntime(),
      );
    }

    return {
      isDesktopStandaloneRuntime,
      getRevealActionI18nKey,
      getAppSubtitleI18nKey,
      getMediaSourceAnalyzedI18nKey,
      isCapabilityEnabled,
      isTagsFeatureAvailable,
    };
  }

  sharedRoot.createRuntimeModeUtils = createRuntimeModeUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
