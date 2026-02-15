(function initPoseChronoSharedReviewSessionUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toInt(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.round(num);
  }

  function sanitizeCustomQueue(queue) {
    if (!Array.isArray(queue)) return null;
    return queue
      .filter((step) => step && typeof step === "object")
      .map((step) => ({
        type: step.type,
        count: toInt(step.count, 0),
        duration: toInt(step.duration, 0),
      }));
  }

  function mapSessionImages(images) {
    if (!Array.isArray(images)) return [];
    return images
      .filter((img) => img && typeof img === "object")
      .map((img) => ({
        id: img.id,
        filePath: img.filePath,
        path: img.path || img.filePath,
        file: img.file || img.filePath,
        ext: img.ext,
        thumbnailURL: img.thumbnailURL || img.thumbnail || "",
        thumbnail: img.thumbnail || img.thumbnailURL || "",
        url: img.url,
        name: img.name,
      }));
  }

  function buildSessionDetails(input = {}) {
    const mode = String(input.sessionMode || "classique");
    const images = mapSessionImages(input.imagesSeen);
    return {
      mode,
      memoryType: mode === "memory" ? input.memoryType || null : null,
      customQueue: mode === "custom" ? sanitizeCustomQueue(input.customQueue) : null,
      images,
    };
  }

  function computeReviewSummary(imagesSeen, totalSessionTime) {
    const poses = Array.isArray(imagesSeen) ? imagesSeen.length : 0;
    const sessionTime = Math.max(0, toInt(totalSessionTime, 0));
    const mins = Math.floor(sessionTime / 60);
    const secs = sessionTime % 60;
    return {
      sessionPoses: poses,
      sessionTime,
      mins,
      secs,
      shouldRecord: poses > 0 && sessionTime > 0,
    };
  }

  function createReviewSessionUtils() {
    return {
      sanitizeCustomQueue,
      mapSessionImages,
      buildSessionDetails,
      computeReviewSummary,
    };
  }

  sharedRoot.createReviewSessionUtils = createReviewSessionUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
