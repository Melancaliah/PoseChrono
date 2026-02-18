(function initPoseChronoSharedSettingsShortcutsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || !!target.isContentEditable;
  }

  function isPlainSpacePress(event) {
    const isSpace =
      event?.key === " " || event?.key === "Spacebar" || event?.code === "Space";
    if (!isSpace) return false;
    return !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
  }

  function handleSettingsScreenKeyboardShortcuts(input = {}) {
    const event = input.event;
    const settingsScreen = input.settingsScreen;
    const reviewScreen = input.reviewScreen;
    const startBtn = input.startBtn;
    const getTopOpenModal =
      typeof input.getTopOpenModal === "function" ? input.getTopOpenModal : null;
    const onStart = typeof input.onStart === "function" ? input.onStart : null;
    const onReturnHome =
      typeof input.onReturnHome === "function" ? input.onReturnHome : null;
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);

    if (!event) {
      return false;
    }

    if (!isPlainSpacePress(event) || isTypingTarget(event.target)) {
      return false;
    }

    const isSettingsVisible =
      !!settingsScreen && !settingsScreen.classList.contains("hidden");
    const isReviewVisible =
      !!reviewScreen && !reviewScreen.classList.contains("hidden");

    if (!isSettingsVisible && !isReviewVisible) {
      return false;
    }

    if (getTopOpenModal && getTopOpenModal()) return false;

    if (isReviewVisible) {
      const zoomOverlay =
        documentRef && typeof documentRef.getElementById === "function"
          ? documentRef.getElementById("zoom-overlay")
          : null;
      if (zoomOverlay) return false;

      event.preventDefault();
      if (onReturnHome) {
        onReturnHome();
      }
      return true;
    }

    if (!startBtn || startBtn.disabled) return false;

    event.preventDefault();
    if (onStart) {
      onStart();
    } else if (typeof startBtn.click === "function") {
      startBtn.click();
    }
    return true;
  }

  function createSettingsShortcutsUtils() {
    return {
      handleSettingsScreenKeyboardShortcuts,
    };
  }

  sharedRoot.createSettingsShortcutsUtils = createSettingsShortcutsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

