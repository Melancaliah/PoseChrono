(function initPoseChronoSharedReviewInteractionsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function getDurationToggleCopy(isVisible) {
    return isVisible
      ? {
          i18nKey: "drawing.hideDurations",
          defaultValue: "Hide durations",
        }
      : {
          i18nKey: "drawing.showDurations",
          defaultValue: "Show durations",
        };
  }

  function getDurationToggleTransition(isVisible) {
    if (isVisible) {
      return {
        nextVisible: false,
        animateHide: true,
        renderBeforeShow: false,
        animateShow: false,
      };
    }
    return {
      nextVisible: true,
      animateHide: false,
      renderBeforeShow: true,
      animateShow: true,
    };
  }

  function normalizeReviewIndex(index, length) {
    const total = Math.max(0, Math.floor(Number(length) || 0));
    if (total === 0) return 0;
    const idx = Math.floor(Number(index) || 0);
    return Math.max(0, Math.min(idx, total - 1));
  }

  function createReviewInteractionsUtils() {
    return {
      getDurationToggleCopy,
      getDurationToggleTransition,
      normalizeReviewIndex,
    };
  }

  sharedRoot.createReviewInteractionsUtils = createReviewInteractionsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
