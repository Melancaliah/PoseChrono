(function initPoseChronoSharedSessionFlowUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toInt(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.round(num);
  }

  function toPositiveInt(value, fallback = 0) {
    return Math.max(0, toInt(value, fallback));
  }

  function resolveClassicDuration(
    hours,
    minutes,
    seconds,
    activeButtonDuration,
    fallbackSelectedDuration,
  ) {
    const h = Math.max(0, toInt(hours, 0));
    const m = Math.max(0, toInt(minutes, 0));
    const s = Math.max(0, toInt(seconds, 0));
    const manualTotal = h * 3600 + m * 60 + s;
    if (manualTotal > 0) return manualTotal;
    const fromButton = toPositiveInt(activeButtonDuration, 0);
    if (fromButton > 0) return fromButton;
    return toPositiveInt(fallbackSelectedDuration, 60);
  }

  function resolveSessionStartState(input = {}) {
    const mode = String(input.sessionMode || "classique").toLowerCase();
    const selectedDuration = toPositiveInt(input.selectedDuration, 60);
    const queue = Array.isArray(input.customQueue) ? input.customQueue : [];
    const memoryType = String(input.memoryType || "flash").toLowerCase();
    const imagesLength = Math.max(1, toInt(input.imagesLength, 1));
    const memoryPosesCountRaw = toInt(input.memoryPosesCount, 1);
    const clampMemoryPosesCount =
      typeof input.clampMemoryPosesCount === "function"
        ? input.clampMemoryPosesCount
        : (count, len, fallback = 1) =>
            Math.max(1, Math.min(toInt(count, fallback), Math.max(1, len)));

    const out = {
      isValid: true,
      selectedDuration,
      timeRemaining: selectedDuration,
      currentStepIndex: 0,
      currentPoseInStep: 1,
      memoryPosesCount: clampMemoryPosesCount(memoryPosesCountRaw, imagesLength, 1),
      memoryHidden: false,
    };

    if (mode === "custom") {
      if (queue.length === 0) {
        out.isValid = false;
        return out;
      }
      const firstStep = queue[0] || {};
      const firstDuration = toPositiveInt(firstStep.duration, selectedDuration);
      out.currentStepIndex = 0;
      out.currentPoseInStep = 1;
      out.selectedDuration = firstDuration;
      out.timeRemaining = firstDuration;
      return out;
    }

    if (mode === "memory") {
      if (memoryType === "flash") {
        const duration = toPositiveInt(input.memoryDuration, selectedDuration);
        out.selectedDuration = duration;
        out.timeRemaining = duration;
      } else {
        out.timeRemaining = selectedDuration;
      }
      return out;
    }

    if (mode === "relax") {
      out.timeRemaining = 0;
      return out;
    }

    out.timeRemaining = selectedDuration;
    return out;
  }

  function advanceCustomCursor(queue, currentStepIndex, currentPoseInStep) {
    const safeQueue = Array.isArray(queue) ? queue : [];
    let stepIndex = toInt(currentStepIndex, 0);
    let poseInStep = Math.max(1, toInt(currentPoseInStep, 1));

    const current = safeQueue[stepIndex];
    if (!current || typeof current !== "object") {
      return {
        finished: true,
        currentStepIndex: stepIndex,
        currentPoseInStep: poseInStep,
        nextStep: null,
        enteredNewStep: false,
        soundCue: null,
      };
    }

    const count = Math.max(1, toInt(current.count, 1));
    let enteredNewStep = false;
    if (poseInStep < count) {
      poseInStep += 1;
    } else {
      stepIndex += 1;
      poseInStep = 1;
      enteredNewStep = true;
    }

    if (stepIndex >= safeQueue.length) {
      return {
        finished: true,
        currentStepIndex: stepIndex,
        currentPoseInStep: poseInStep,
        nextStep: null,
        enteredNewStep,
        soundCue: null,
      };
    }

    const nextStep = safeQueue[stepIndex];
    const soundCue = enteredNewStep
      ? nextStep?.type === "pause"
        ? "pause"
        : "group"
      : null;

    return {
      finished: false,
      currentStepIndex: stepIndex,
      currentPoseInStep: poseInStep,
      nextStep,
      enteredNewStep,
      soundCue,
    };
  }

  function shouldEndMemorySession(currentIndex, memoryPosesCount) {
    const idx = Math.max(0, toInt(currentIndex, 0));
    const limit = Math.max(1, toInt(memoryPosesCount, 1));
    return idx + 1 >= limit;
  }

  function nextCyclicIndex(index, length) {
    const total = Math.max(1, toInt(length, 1));
    const current = Math.max(0, toInt(index, 0));
    return (current + 1) % total;
  }

  function createSessionFlowUtils() {
    return {
      resolveClassicDuration,
      resolveSessionStartState,
      advanceCustomCursor,
      shouldEndMemorySession,
      nextCyclicIndex,
    };
  }

  sharedRoot.createSessionFlowUtils = createSessionFlowUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
