(function initPoseChronoSharedCustomSessionUtils(globalScope) {
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

  function isPoseStep(step) {
    return !!step && typeof step === "object" && step.type === "pose";
  }

  function findNextPoseStepIndex(queue, fromIndex) {
    if (!Array.isArray(queue)) return -1;
    const start = Math.max(-1, toInt(fromIndex, -1));
    for (let i = start + 1; i < queue.length; i++) {
      if (isPoseStep(queue[i])) return i;
    }
    return -1;
  }

  function findPrevPoseStepIndex(queue, fromIndex) {
    if (!Array.isArray(queue)) return -1;
    const start = Math.min(queue.length, toInt(fromIndex, queue.length));
    for (let i = start - 1; i >= 0; i--) {
      if (isPoseStep(queue[i])) return i;
    }
    return -1;
  }

  function findNextPoseStep(queue, fromIndex) {
    const idx = findNextPoseStepIndex(queue, fromIndex);
    return idx >= 0 ? queue[idx] : null;
  }

  function hasNextPoseGroup(queue, fromIndex) {
    return findNextPoseStepIndex(queue, fromIndex) >= 0;
  }

  function hasPrevPoseGroup(queue, fromIndex) {
    return findPrevPoseStepIndex(queue, fromIndex) >= 0;
  }

  function getCustomPoseSessionProgress(queue, currentStepIndex, currentPoseInStep) {
    if (!Array.isArray(queue) || queue.length === 0) {
      return {
        totalPoses: 0,
        globalPoseIndex: 0,
        poseGroupCount: 0,
        showGlobal: false,
      };
    }

    const stepIndex = toInt(currentStepIndex, 0);
    const poseInStep = Math.max(1, toInt(currentPoseInStep, 1));
    let totalPoses = 0;
    let poseGroupCount = 0;
    let globalPoseIndex = 0;

    for (let i = 0; i < queue.length; i++) {
      const step = queue[i];
      if (!isPoseStep(step)) continue;
      const count = Math.max(1, toInt(step.count, 1));
      poseGroupCount += 1;
      totalPoses += count;
      if (i < stepIndex) {
        globalPoseIndex += count;
      }
    }

    const current = queue[stepIndex];
    if (isPoseStep(current)) {
      const currentCount = Math.max(1, toInt(current.count, 1));
      globalPoseIndex += Math.min(currentCount, Math.max(1, poseInStep));
    } else if (totalPoses > 0 && globalPoseIndex <= 0) {
      globalPoseIndex = 1;
    }

    return {
      totalPoses,
      globalPoseIndex: Math.min(Math.max(globalPoseIndex, 0), totalPoses),
      poseGroupCount,
      showGlobal: poseGroupCount > 1,
    };
  }

  function calculateCustomTotalRemainingSeconds(
    queue,
    currentStepIndex,
    currentPoseInStep,
    timeRemaining,
  ) {
    const totalNow = toPositiveInt(timeRemaining, 0);
    if (!Array.isArray(queue) || queue.length === 0) return totalNow;

    const stepIndex = toInt(currentStepIndex, 0);
    const poseInStep = Math.max(1, toInt(currentPoseInStep, 1));
    let total = totalNow;

    for (let i = stepIndex + 1; i < queue.length; i++) {
      const step = queue[i];
      if (!step || typeof step !== "object") continue;
      const duration = toPositiveInt(step.duration, 0);
      if (step.type === "pause") {
        total += duration;
      } else {
        const count = Math.max(1, toInt(step.count, 1));
        total += duration * count;
      }
    }

    const current = queue[stepIndex];
    if (isPoseStep(current)) {
      const duration = toPositiveInt(current.duration, 0);
      const count = Math.max(1, toInt(current.count, 1));
      const posesRemaining = Math.max(0, count - poseInStep);
      total += posesRemaining * duration;
    }

    return total;
  }

  function getStepTotalSeconds(step) {
    if (!step || typeof step !== "object") return 0;
    const duration = toPositiveInt(step.duration, 0);
    if (step.type === "pause") return duration;
    const count = Math.max(1, toInt(step.count, 1));
    return duration * count;
  }

  function calculateQueueTotalSeconds(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return 0;
    return queue.reduce((total, step) => total + getStepTotalSeconds(step), 0);
  }

  function stepDurationToHms(duration) {
    const safe = Math.max(0, toInt(duration, 0));
    return {
      hours: Math.floor(safe / 3600),
      minutes: Math.floor((safe % 3600) / 60),
      seconds: safe % 60,
    };
  }

  function updateStepDurationFromUnit(step, type, value, minDuration = 1) {
    if (!step || typeof step !== "object") {
      return { updated: false, duration: 0 };
    }
    const safeType = String(type || "").toLowerCase();
    if (safeType !== "h" && safeType !== "m" && safeType !== "s") {
      return { updated: false, duration: toPositiveInt(step.duration, 0) };
    }

    const parts = stepDurationToHms(step.duration);
    const nextValue = Math.max(0, toInt(value, 0));

    if (safeType === "h") parts.hours = nextValue;
    if (safeType === "m") parts.minutes = nextValue;
    if (safeType === "s") parts.seconds = nextValue;

    const rawDuration =
      parts.hours * 3600 + parts.minutes * 60 + parts.seconds;
    const boundedDuration = Math.max(
      Math.max(0, toInt(minDuration, 1)),
      rawDuration,
    );
    step.duration = boundedDuration;
    return {
      updated: true,
      duration: boundedDuration,
      parts: {
        hours: parts.hours,
        minutes: parts.minutes,
        seconds: parts.seconds,
      },
    };
  }

  function updateStepPositiveIntField(step, field, value, minValue = 1) {
    if (!step || typeof step !== "object") {
      return { updated: false, value: 0 };
    }
    const safeField = String(field || "").trim();
    if (!safeField) {
      return { updated: false, value: 0 };
    }

    const min = Math.max(0, toInt(minValue, 1));
    const nextValue = toInt(value, NaN);
    if (!Number.isFinite(nextValue) || nextValue < min) {
      return { updated: false, value: toPositiveInt(step[safeField], 0) };
    }

    step[safeField] = nextValue;
    return {
      updated: true,
      value: nextValue,
      field: safeField,
    };
  }

  function getStepDisplayModel(step) {
    const safeStep = step && typeof step === "object" ? step : {};
    const isPause = safeStep.type === "pause";
    const duration = toPositiveInt(safeStep.duration, 0);
    const count = isPause ? 1 : Math.max(1, toInt(safeStep.count, 1));
    const hms = stepDurationToHms(duration);
    return {
      isPause,
      count,
      duration,
      groupTotalSeconds: duration * count,
      hours: hms.hours,
      minutes: hms.minutes,
      seconds: hms.seconds,
    };
  }

  function createQueueStep(input = {}) {
    const isPause = !!input.isPause;
    const duration = toPositiveInt(input.duration, 0);
    if (duration <= 0) return null;

    const count = isPause ? 1 : Math.max(1, toInt(input.count, 5));
    const idValue = input.id;
    const id =
      idValue !== undefined && idValue !== null
        ? idValue
        : typeof input.now === "function"
          ? input.now()
          : Date.now();

    return {
      type: isPause ? "pause" : "pose",
      count,
      duration,
      id,
    };
  }

  function resolveDropInsertIndex(sourceIndex, targetIndex, isBelow) {
    const sIdx = toInt(sourceIndex, -1);
    const tIdx = toInt(targetIndex, -1);
    if (sIdx < 0 || tIdx < 0) return -1;
    return isBelow ? tIdx + 1 : tIdx;
  }

  function applyQueueDropOperation(
    queue,
    sourceIndex,
    targetIndex,
    isBelow,
    isDuplicate,
    cloneItem,
  ) {
    if (!Array.isArray(queue) || queue.length === 0) {
      return { changed: false, finalIndex: -1 };
    }

    const sIdx = toInt(sourceIndex, -1);
    const tIdx = toInt(targetIndex, -1);
    if (
      sIdx < 0 ||
      tIdx < 0 ||
      sIdx >= queue.length ||
      tIdx >= queue.length
    ) {
      return { changed: false, finalIndex: -1 };
    }

    let finalIndex = resolveDropInsertIndex(sIdx, tIdx, !!isBelow);
    if (finalIndex < 0) return { changed: false, finalIndex: -1 };

    if (sIdx < finalIndex) {
      finalIndex -= 1;
    }

    if (isDuplicate) {
      const sourceItem = queue[sIdx];
      if (!sourceItem || typeof sourceItem !== "object") {
        return { changed: false, finalIndex };
      }
      const duplicate =
        typeof cloneItem === "function"
          ? cloneItem(sourceItem)
          : { ...sourceItem };
      queue.splice(finalIndex, 0, duplicate);
      return { changed: true, finalIndex, duplicate: true };
    }

    if (sIdx === finalIndex) {
      return { changed: false, finalIndex };
    }

    const moved = queue.splice(sIdx, 1)[0];
    queue.splice(finalIndex, 0, moved);
    return { changed: true, finalIndex, duplicate: false };
  }

  function createCustomSessionUtils() {
    return {
      findNextPoseStepIndex,
      findPrevPoseStepIndex,
      findNextPoseStep,
      hasNextPoseGroup,
      hasPrevPoseGroup,
      getCustomPoseSessionProgress,
      calculateCustomTotalRemainingSeconds,
      getStepTotalSeconds,
      calculateQueueTotalSeconds,
      stepDurationToHms,
      updateStepDurationFromUnit,
      updateStepPositiveIntField,
      getStepDisplayModel,
      createQueueStep,
      resolveDropInsertIndex,
      applyQueueDropOperation,
    };
  }

  sharedRoot.createCustomSessionUtils = createCustomSessionUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
