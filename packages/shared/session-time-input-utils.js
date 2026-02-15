(function initPoseChronoSharedSessionTimeInputUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampInt(value, min, max, fallback = 0) {
    const num = toInt(value, fallback);
    const lower = Number.isFinite(Number(min)) ? Number(min) : 0;
    const upper = Number.isFinite(Number(max)) ? Number(max) : lower;
    const safeMin = Math.min(lower, upper);
    const safeMax = Math.max(lower, upper);
    return Math.min(safeMax, Math.max(safeMin, num));
  }

  function readInputBound(input, attrName, fallback = 0) {
    if (!input || typeof input.getAttribute !== "function") return fallback;
    if (!input.hasAttribute(attrName)) return fallback;
    return toInt(input.getAttribute(attrName), fallback);
  }

  function hmsToSeconds(hours, minutes, seconds) {
    const h = toInt(hours, 0);
    const m = toInt(minutes, 0);
    const s = toInt(seconds, 0);
    return h * 3600 + m * 60 + s;
  }

  function msToSeconds(minutes, seconds) {
    const m = toInt(minutes, 0);
    const s = toInt(seconds, 0);
    return m * 60 + s;
  }

  function secondsToHms(totalSeconds) {
    const safe = Math.max(0, toInt(totalSeconds, 0));
    return {
      hours: Math.floor(safe / 3600),
      minutes: Math.floor((safe % 3600) / 60),
      seconds: safe % 60,
      totalSeconds: safe,
    };
  }

  function readHmsInputs(hoursInput, minutesInput, secondsInput) {
    const hours = toInt(hoursInput?.value, 0);
    const minutes = toInt(minutesInput?.value, 0);
    const seconds = toInt(secondsInput?.value, 0);
    return {
      hours,
      minutes,
      seconds,
      totalSeconds: hmsToSeconds(hours, minutes, seconds),
    };
  }

  function readMinutesSecondsInputs(minutesInput, secondsInput) {
    const minutes = toInt(minutesInput?.value, 0);
    const seconds = toInt(secondsInput?.value, 0);
    return {
      minutes,
      seconds,
      totalSeconds: msToSeconds(minutes, seconds),
    };
  }

  function createSessionTimeInputUtils() {
    return {
      toInt,
      clampInt,
      readInputBound,
      hmsToSeconds,
      msToSeconds,
      secondsToHms,
      readHmsInputs,
      readMinutesSecondsInputs,
    };
  }

  sharedRoot.createSessionTimeInputUtils = createSessionTimeInputUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
