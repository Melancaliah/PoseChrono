(function initPoseChronoSharedKeyboardListenerBindingsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function bindCoreKeyboardShortcuts(input = {}) {
    const documentRef = input.documentRef;
    if (!documentRef || typeof documentRef.addEventListener !== "function") {
      return false;
    }

    if (typeof input.onMainKeydown === "function") {
      documentRef.addEventListener("keydown", input.onMainKeydown);
    }
    if (typeof input.onSettingsKeydown === "function") {
      documentRef.addEventListener("keydown", input.onSettingsKeydown);
    }
    if (typeof input.onFrameSteppingKeyup === "function") {
      documentRef.addEventListener("keyup", input.onFrameSteppingKeyup);
    }
    if (typeof input.onThemeKeydown === "function") {
      documentRef.addEventListener("keydown", input.onThemeKeydown);
    }
    if (typeof input.onPinKeydown === "function") {
      documentRef.addEventListener("keydown", input.onPinKeydown);
    }
    if (typeof input.onGlobalSettingsKeydown === "function") {
      documentRef.addEventListener("keydown", input.onGlobalSettingsKeydown);
    }

    return true;
  }

  function createKeyboardListenerBindingsUtils() {
    return {
      bindCoreKeyboardShortcuts,
    };
  }

  sharedRoot.createKeyboardListenerBindingsUtils =
    createKeyboardListenerBindingsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

