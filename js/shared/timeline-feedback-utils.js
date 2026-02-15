(function initPoseChronoSharedTimelineFeedbackUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createTimelineFeedbackUtils(deps = {}) {
    const doc =
      deps.document ||
      (typeof document !== "undefined" ? document : null);
    const raf =
      typeof deps.requestAnimationFrame === "function"
        ? deps.requestAnimationFrame
        : typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : (cb) => cb();
    const scheduleTimeout =
      typeof deps.setTimeout === "function" ? deps.setTimeout : setTimeout;
    const cancelTimeout =
      typeof deps.clearTimeout === "function" ? deps.clearTimeout : clearTimeout;

    async function openConfirmDialog(options = {}) {
      const {
        title = "",
        message = "",
        confirmText = "OK",
        cancelText = "Cancel",
        checkboxLabel = "",
      } = options;

      if (typeof deps.showPoseChronoConfirmDialog === "function") {
        return deps.showPoseChronoConfirmDialog({
          title,
          message,
          confirmText,
          cancelText,
          checkboxLabel,
        });
      }

      if (typeof deps.showMessageBox === "function") {
        try {
          const result = await deps.showMessageBox({
            type: "warning",
            title,
            message,
            buttons: [cancelText, confirmText],
            defaultId: 0,
            cancelId: 0,
            ...(checkboxLabel ? { checkboxLabel } : {}),
          });

          return {
            confirmed: result.response === 1,
            checkboxChecked: !!result.checkboxChecked,
          };
        } catch (error) {
          if (typeof deps.logError === "function") {
            deps.logError(error);
          }
        }
      }

      return { confirmed: false, checkboxChecked: false };
    }

    function showToast(type, message, duration = 2500) {
      if (typeof deps.showPoseChronoToast === "function") {
        deps.showPoseChronoToast({ type, message, duration });
        return;
      }

      if (typeof deps.notify === "function") {
        deps.notify({
          title: message,
          body: "",
          mute: false,
          duration,
        });
      }
    }

    function scheduleUndoAction(options = {}) {
      if (typeof deps.schedulePoseChronoUndoAction === "function") {
        deps.schedulePoseChronoUndoAction(options);
        return true;
      }

      const {
        timeoutMs = 10000,
        onUndo,
        message = "Deleted. Undo available for 10 seconds.",
        undoLabel = "Undo",
      } = options;
      if (typeof onUndo !== "function" || !doc || !doc.body) return false;

      let container = doc.getElementById("posechrono-toast-container");
      if (!container) {
        container = doc.createElement("div");
        container.id = "posechrono-toast-container";
        container.className = "pc-toast-container";
        doc.body.appendChild(container);
      }

      const toast = doc.createElement("div");
      toast.className = "pc-toast pc-toast-info";

      const msg = doc.createElement("span");
      msg.className = "pc-toast-message";
      msg.textContent = message;
      toast.appendChild(msg);

      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "pc-toast-action";
      btn.textContent = undoLabel;
      let timer = null;
      btn.addEventListener("click", () => {
        if (timer !== null) cancelTimeout(timer);
        try {
          onUndo();
        } catch (_) {}
        toast.classList.remove("visible");
        scheduleTimeout(() => toast.remove(), 180);
      });
      toast.appendChild(btn);

      container.appendChild(toast);
      raf(() => toast.classList.add("visible"));

      timer = scheduleTimeout(() => {
        toast.classList.remove("visible");
        scheduleTimeout(() => toast.remove(), 180);
      }, timeoutMs);

      return true;
    }

    return {
      openConfirmDialog,
      showToast,
      scheduleUndoAction,
    };
  }

  sharedRoot.createTimelineFeedbackUtils = createTimelineFeedbackUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

