(function initPoseChronoSharedSessionDurationButtonsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toDurationSeconds(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getButtonDuration(button, fallback = 0) {
    if (!button || !button.dataset) return fallback;
    return toDurationSeconds(button.dataset.duration, fallback);
  }

  function setActiveDurationButtons(buttons, duration) {
    if (!buttons || typeof buttons.forEach !== "function") return;
    buttons.forEach((btn) => {
      if (!btn?.classList) return;
      btn.classList.toggle("active", getButtonDuration(btn) === duration);
    });
  }

  function clearActiveDurationButtons(buttons) {
    if (!buttons || typeof buttons.forEach !== "function") return;
    buttons.forEach((btn) => {
      if (!btn?.classList) return;
      btn.classList.remove("active");
    });
  }

  function createSessionDurationButtonsUtils() {
    return {
      toDurationSeconds,
      getButtonDuration,
      setActiveDurationButtons,
      clearActiveDurationButtons,
    };
  }

  sharedRoot.createSessionDurationButtonsUtils = createSessionDurationButtonsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
