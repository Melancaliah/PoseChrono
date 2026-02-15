(function initPoseChronoSharedActionButtonsBindingsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function bindActionButtons(input = {}) {
    const deleteBtn = input.deleteBtn;
    const revealBtn = input.revealBtn;
    const onDelete = typeof input.onDelete === "function" ? input.onDelete : null;
    const onReveal = typeof input.onReveal === "function" ? input.onReveal : null;
    const onRevealContextMenu =
      typeof input.onRevealContextMenu === "function"
        ? input.onRevealContextMenu
        : null;

    let hasAnyBinding = false;

    if (deleteBtn && onDelete && typeof deleteBtn.addEventListener === "function") {
      deleteBtn.addEventListener("click", onDelete);
      hasAnyBinding = true;
    }

    if (revealBtn && typeof revealBtn.addEventListener === "function") {
      if (onReveal) {
        revealBtn.addEventListener("click", onReveal);
        hasAnyBinding = true;
      }
      if (onRevealContextMenu) {
        revealBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onRevealContextMenu(event.clientX, event.clientY, event);
        });
        hasAnyBinding = true;
      }
    }

    return hasAnyBinding;
  }

  function createActionButtonsBindingsUtils() {
    return {
      bindActionButtons,
    };
  }

  sharedRoot.createActionButtonsBindingsUtils = createActionButtonsBindingsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

