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

  async function resolveMediaSelection(operations = {}) {
    const getSelectedItems =
      typeof operations.getSelectedItems === "function"
        ? operations.getSelectedItems
        : async () => [];
    const getSelectedFolders =
      typeof operations.getSelectedFolders === "function"
        ? operations.getSelectedFolders
        : async () => [];
    const queryItems =
      typeof operations.queryItems === "function"
        ? operations.queryItems
        : async () => [];
    const toFolderIds =
      typeof operations.toFolderIds === "function"
        ? operations.toFolderIds
        : (folders) =>
            (Array.isArray(folders) ? folders : [])
              .map((folder) => folder?.id)
              .filter((id) => id !== undefined && id !== null && id !== "");

    const selectedItems = await getSelectedItems();
    if (Array.isArray(selectedItems) && selectedItems.length > 0) {
      return { items: selectedItems, source: "selected-items" };
    }

    const selectedFolders = await getSelectedFolders();
    const folderIds = toFolderIds(selectedFolders);
    if (folderIds.length > 0) {
      const folderItems = await queryItems({ folders: folderIds });
      if (Array.isArray(folderItems) && folderItems.length > 0) {
        return { items: folderItems, source: "selected-folders" };
      }
    }

    const allItems = await queryItems({});
    return {
      items: Array.isArray(allItems) ? allItems : [],
      source: "all-items",
    };
  }

  function formatLoadedMediaCount(mediaCounts, translate, options = {}) {
    const counts = mediaCounts && typeof mediaCounts === "object" ? mediaCounts : {};
    const imageCount = Number.isFinite(Number(counts.imageCount))
      ? Number(counts.imageCount)
      : 0;
    const videoCount = Number.isFinite(Number(counts.videoCount))
      ? Number(counts.videoCount)
      : 0;
    const t =
      typeof translate === "function" ? translate : (key, fallback) => fallback || key;

    const imageSingularKey = options.imageSingularKey || "settings.imageLoaded";
    const imagePluralKey = options.imagePluralKey || "settings.imagesLoaded";
    const videoSingularKey = options.videoSingularKey || "settings.videoLoaded";
    const videoPluralKey = options.videoPluralKey || "settings.videosLoaded";
    const andKey = options.andKey || "misc.and";

    const parts = [];
    if (imageCount > 0) {
      parts.push(
        `${imageCount} ${t(
          imageCount === 1 ? imageSingularKey : imagePluralKey,
          imageCount === 1 ? "image loaded" : "images loaded",
        )}`,
      );
    }
    if (videoCount > 0) {
      parts.push(
        `${videoCount} ${t(
          videoCount === 1 ? videoSingularKey : videoPluralKey,
          videoCount === 1 ? "video loaded" : "videos loaded",
        )}`,
      );
    }

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${t(andKey, "and")} ${parts[1]}`;
  }

  function createSessionMediaUtils() {
    return {
      normalizeExt,
      filterByExtensions,
      shuffleArray,
      countByExtensions,
      isVideoFile,
      isGifFile,
      resolveMediaSelection,
      formatLoadedMediaCount,
    };
  }

  sharedRoot.createSessionMediaUtils = createSessionMediaUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
