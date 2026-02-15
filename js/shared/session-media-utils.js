(function initPoseChronoSharedSessionMediaUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function normalizeExt(ext) {
    return String(ext || "").trim().toLowerCase();
  }

  function toExtSet(extensions) {
    const set = new Set();
    if (!Array.isArray(extensions)) return set;
    extensions.forEach((ext) => {
      const key = normalizeExt(ext);
      if (key) set.add(key);
    });
    return set;
  }

  function filterByExtensions(items, extensions) {
    const source = Array.isArray(items) ? items : [];
    const extSet = toExtSet(extensions);
    if (extSet.size === 0) return [];
    return source.filter((item) => {
      if (!item || typeof item !== "object") return false;
      return extSet.has(normalizeExt(item.ext));
    });
  }

  function shuffleArray(items, randomFn = Math.random) {
    const arr = Array.isArray(items) ? [...items] : [];
    for (let i = arr.length - 1; i > 0; i--) {
      const r = Number(randomFn());
      const ratio = Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0;
      const j = Math.floor(ratio * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function countByExtensions(items, imageExtensions, videoExtensions) {
    const source = Array.isArray(items) ? items : [];
    const imageSet = toExtSet(imageExtensions);
    const videoSet = toExtSet(videoExtensions);
    let imageCount = 0;
    let videoCount = 0;

    source.forEach((item) => {
      const ext = normalizeExt(item?.ext);
      if (!ext) return;
      if (imageSet.has(ext)) {
        imageCount += 1;
        return;
      }
      if (videoSet.has(ext)) {
        videoCount += 1;
      }
    });

    return {
      imageCount,
      videoCount,
      totalCount: imageCount + videoCount,
    };
  }

  function isVideoFile(item, videoExtensions) {
    if (!item || typeof item !== "object") return false;
    const ext = normalizeExt(item.ext);
    if (!ext) return false;
    const videoSet = toExtSet(videoExtensions);
    return videoSet.has(ext);
  }

  function isGifFile(item) {
    if (!item || typeof item !== "object") return false;
    return normalizeExt(item.ext) === "gif";
  }

  function createSessionMediaUtils() {
    return {
      normalizeExt,
      filterByExtensions,
      shuffleArray,
      countByExtensions,
      isVideoFile,
      isGifFile,
    };
  }

  sharedRoot.createSessionMediaUtils = createSessionMediaUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
