(function initPoseChronoSharedReviewGridUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function defaultIsVideoFile() {
    return false;
  }

  function defaultGetDurationSeconds() {
    return 0;
  }

  function defaultIsAnnotated() {
    return false;
  }

  function defaultFormatDuration(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function buildReviewGridItems(imagesSeen, options = {}) {
    const images = Array.isArray(imagesSeen) ? imagesSeen : [];
    const isVideoFile =
      typeof options.isVideoFile === "function"
        ? options.isVideoFile
        : defaultIsVideoFile;
    const getDurationSeconds =
      typeof options.getDurationSeconds === "function"
        ? options.getDurationSeconds
        : defaultGetDurationSeconds;
    const isAnnotated =
      typeof options.isAnnotated === "function"
        ? options.isAnnotated
        : defaultIsAnnotated;
    const formatDuration =
      typeof options.formatDuration === "function"
        ? options.formatDuration
        : defaultFormatDuration;
    const includeDurations = options.includeDurations !== false;

    return images.map((image, index) => {
      const isVideo = !!isVideoFile(image);
      const thumbnailSrc = image?.thumbnailURL || image?.thumbnail || "";
      const fallbackSrc = image?.filePath ? `file:///${image.filePath}` : "";
      const durationSeconds = includeDurations ? getDurationSeconds(image) : 0;
      const durationText = includeDurations
        ? formatDuration(durationSeconds)
        : null;
      const annotated = !!isAnnotated(image);
      const hasMetaBadge = !!durationText || annotated;

      return {
        index,
        image,
        isVideo,
        src: thumbnailSrc || fallbackSrc,
        durationText,
        annotated,
        hasMetaBadge,
      };
    });
  }

  function createReviewGridUtils() {
    return {
      buildReviewGridItems,
    };
  }

  sharedRoot.createReviewGridUtils = createReviewGridUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
