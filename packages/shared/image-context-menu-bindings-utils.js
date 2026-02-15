(function initPoseChronoSharedImageContextMenuBindingsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function bindImageContextMenus(input = {}) {
    const targets = Array.isArray(input.targets) ? input.targets : [];
    const onOpenMenu =
      typeof input.onOpenMenu === "function" ? input.onOpenMenu : null;
    if (!targets.length || !onOpenMenu) return false;

    let boundCount = 0;
    targets.forEach((target) => {
      if (!target || typeof target.addEventListener !== "function") return;
      target.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        onOpenMenu(event.clientX, event.clientY, event);
      });
      boundCount += 1;
    });

    return boundCount > 0;
  }

  function createImageContextMenuBindingsUtils() {
    return {
      bindImageContextMenus,
    };
  }

  sharedRoot.createImageContextMenuBindingsUtils =
    createImageContextMenuBindingsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

