(function initPoseChronoSharedTimerTickUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function isCustomPauseStep(sessionMode, customQueue, currentStepIndex) {
    if (String(sessionMode) !== "custom") return false;
    const queue = Array.isArray(customQueue) ? customQueue : [];
    const index = Math.max(0, Math.round(toNumber(currentStepIndex, 0)));
    return queue[index]?.type === "pause";
  }

  function shouldEnterMemoryHiddenPhase(state) {
    return (
      String(state?.sessionMode) === "memory" &&
      String(state?.memoryType) === "flash" &&
      toNumber(state?.timeRemaining, 0) < 0 &&
      !state?.memoryHidden
    );
  }

  function shouldAdvanceFromMemoryHiddenPhase(state) {
    return (
      String(state?.sessionMode) === "memory" &&
      String(state?.memoryType) === "flash" &&
      !!state?.memoryHidden &&
      toNumber(state?.timeRemaining, 0) < 0
    );
  }

  function getTickSoundDecision(state) {
    if (!state?.soundEnabled) {
      return { playTick: false, volume: 0 };
    }
    const timeRemaining = toNumber(state.timeRemaining, 0);
    const selectedDuration = Math.max(0, toNumber(state.selectedDuration, 0));
    const isCustomPause = !!state.isCustomPause;
    const thresholdOverride = state.thresholdOverride != null
      ? Number(state.thresholdOverride)
      : null;
    const threshold =
      thresholdOverride != null && Number.isFinite(thresholdOverride) && thresholdOverride >= 0
        ? thresholdOverride
        : Math.min(selectedDuration * 0.2, 15);
    if (
      !isCustomPause &&
      threshold > 0 &&
      timeRemaining <= threshold &&
      timeRemaining > 0
    ) {
      return {
        playTick: true,
        volume: (threshold - timeRemaining) / threshold,
      };
    }
    return { playTick: false, volume: 0 };
  }

  function shouldPlayEndSound(state) {
    if (!state?.soundEnabled) return false;
    const isMemoryFlash =
      String(state?.sessionMode) === "memory" &&
      String(state?.memoryType) === "flash";
    return toNumber(state?.timeRemaining, 0) === 0 && !isMemoryFlash;
  }

  function shouldAutoAdvanceOnTimerEnd(state) {
    const isMemoryFlash =
      String(state?.sessionMode) === "memory" &&
      String(state?.memoryType) === "flash";
    return toNumber(state?.timeRemaining, 0) <= 0 && !isMemoryFlash;
  }

  function createTimerTickUtils() {
    return {
      isCustomPauseStep,
      shouldEnterMemoryHiddenPhase,
      shouldAdvanceFromMemoryHiddenPhase,
      getTickSoundDecision,
      shouldPlayEndSound,
      shouldAutoAdvanceOnTimerEnd,
    };
  }

  sharedRoot.createTimerTickUtils = createTimerTickUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
