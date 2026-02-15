(function initPoseChronoSharedSessionMetrics(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createSessionMetricsUtils() {
    function toFiniteNumber(value, fallback = 0) {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    }

    function calculatePlanDuration(steps) {
      if (!Array.isArray(steps)) return 0;
      return steps.reduce((total, step) => {
        if (!step || typeof step !== "object") return total;
        const duration = Math.max(0, toFiniteNumber(step.duration, 0));
        if (step.type === "pause") return total + duration;
        const count = Math.max(0, toFiniteNumber(step.count, 0));
        return total + count * duration;
      }, 0);
    }

    function calculatePlanPoses(steps) {
      if (!Array.isArray(steps)) return 0;
      return steps.reduce((total, step) => {
        if (!step || typeof step !== "object" || step.type === "pause") {
          return total;
        }
        return total + Math.max(0, toFiniteNumber(step.count, 0));
      }, 0);
    }

    function clampMemoryPosesCount(requestedCount, imagesCount, fallback = 1) {
      const min = 1;
      const images = Math.max(min, Math.round(toFiniteNumber(imagesCount, min)));
      const desired = Math.round(toFiniteNumber(requestedCount, fallback));
      return Math.max(min, Math.min(desired, images));
    }

    function calculateMemoryTotalSeconds(posesCount, drawingTime, displayTime) {
      const poses = Math.max(0, toFiniteNumber(posesCount, 0));
      const drawing = Math.max(0, toFiniteNumber(drawingTime, 0));
      const display = Math.max(0, toFiniteNumber(displayTime, 0));
      return poses * (drawing + display);
    }

    return {
      calculatePlanDuration,
      calculatePlanPoses,
      clampMemoryPosesCount,
      calculateMemoryTotalSeconds,
    };
  }

  sharedRoot.createSessionMetricsUtils = createSessionMetricsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
