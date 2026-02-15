(function initPoseChronoSharedPreferencesTransferUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createPreferencesTransferUtils(options = {}) {
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    const urlApi = options.URL || (typeof URL !== "undefined" ? URL : null);
    const BlobCtor = options.Blob || (typeof Blob !== "undefined" ? Blob : null);
    const FileReaderCtor =
      options.FileReader || (typeof FileReader !== "undefined" ? FileReader : null);
    const scheduleTimeout =
      typeof options.setTimeout === "function" ? options.setTimeout : setTimeout;
    const logError =
      typeof options.logError === "function" ? options.logError : () => {};

    function createBackupFilename(nowDate = null) {
      const now = nowDate instanceof Date ? nowDate : new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      return `posechrono-backup-${yyyy}${mm}${dd}-${hh}${min}${ss}.json`;
    }

    function downloadJsonPayload(filename, payload) {
      if (!doc || !doc.body || !urlApi || !BlobCtor) return false;
      try {
        const content = JSON.stringify(payload, null, 2);
        const blob = new BlobCtor([content], {
          type: "application/json;charset=utf-8",
        });
        const objectUrl = urlApi.createObjectURL(blob);
        const anchor = doc.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        doc.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        scheduleTimeout(() => urlApi.revokeObjectURL(objectUrl), 0);
        return true;
      } catch (error) {
        logError(error);
        return false;
      }
    }

    function pickJsonFileText() {
      return new Promise((resolve) => {
        if (!doc || !doc.body || !FileReaderCtor) {
          resolve(null);
          return;
        }
        const input = doc.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.style.display = "none";
        doc.body.appendChild(input);

        const cleanup = () => {
          input.remove();
        };

        input.addEventListener(
          "change",
          () => {
            const file = input.files && input.files[0];
            if (!file) {
              cleanup();
              resolve(null);
              return;
            }
            const reader = new FileReaderCtor();
            reader.onload = () => {
              cleanup();
              resolve(typeof reader.result === "string" ? reader.result : null);
            };
            reader.onerror = () => {
              cleanup();
              resolve(null);
            };
            reader.readAsText(file, "utf-8");
          },
          { once: true },
        );

        input.click();
      });
    }

    function hasAnySectionSelected(selections) {
      if (!selections || typeof selections !== "object") return false;
      return Object.values(selections).some(Boolean);
    }

    function getAvailableSectionsFromPackage(parsed) {
      const sections =
        parsed && typeof parsed === "object" && parsed.sections
          ? parsed.sections
          : {};
      return {
        ui: !!sections.ui,
        hotkeys: !!sections.hotkeys,
        plans: !!sections.plans,
        timeline: !!sections.timeline,
      };
    }

    function isValidPreferencesPackage(parsed) {
      return !!(
        parsed &&
        typeof parsed === "object" &&
        parsed.sections &&
        typeof parsed.sections === "object"
      );
    }

    return {
      createBackupFilename,
      downloadJsonPayload,
      pickJsonFileText,
      hasAnySectionSelected,
      getAvailableSectionsFromPackage,
      isValidPreferencesPackage,
    };
  }

  sharedRoot.createPreferencesTransferUtils = createPreferencesTransferUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
