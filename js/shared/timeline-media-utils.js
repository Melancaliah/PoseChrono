(function initPoseChronoSharedTimelineMediaUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toFileUrl(path) {
    if (typeof path !== "string") return "";
    const raw = path.trim();
    if (!raw) return "";
    if (/^(https?:|file:|data:|blob:)/i.test(raw)) return raw;

    const normalized = raw.replace(/\\/g, "/");
    if (/^[a-zA-Z]:\//.test(normalized)) {
      return `file:///${normalized}`;
    }
    if (normalized.startsWith("//")) {
      return `file:${normalized}`;
    }
    if (normalized.startsWith("/")) {
      return `file://${normalized}`;
    }
    return normalized;
  }

  function resolveTimelineImageSrc(image) {
    if (typeof image === "string") {
      return toFileUrl(image);
    }
    if (!image || typeof image !== "object") return "";

    const direct = [image.thumbnailURL, image.thumbnail, image.url].find(
      (v) => typeof v === "string" && v.trim().length > 0,
    );
    if (direct) return toFileUrl(direct);

    const fromPath = [image.filePath, image.path, image.file].find(
      (v) => typeof v === "string" && v.trim().length > 0,
    );
    return toFileUrl(fromPath || "");
  }

  function createTimelineMediaUtils() {
    return {
      toFileUrl,
      resolveTimelineImageSrc,
    };
  }

  sharedRoot.createTimelineMediaUtils = createTimelineMediaUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

