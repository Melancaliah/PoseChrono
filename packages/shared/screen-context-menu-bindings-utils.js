(function initPoseChronoSharedScreenContextMenuBindingsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function bindScreenBackgroundContextMenu(input = {}) {
    const screenElement = input.screenElement;
    const containerSelector = input.containerSelector;
    const onOpenMenu =
      typeof input.onOpenMenu === "function" ? input.onOpenMenu : null;

    if (
      !screenElement ||
      typeof screenElement.addEventListener !== "function" ||
      !containerSelector ||
      !onOpenMenu
    ) {
      return false;
    }

    screenElement.addEventListener("contextmenu", (event) => {
      const target = event.target;
      const isInsideContainer =
        target && typeof target.closest === "function"
          ? target.closest(containerSelector)
          : null;
      if (isInsideContainer) return;
      event.preventDefault();
      onOpenMenu(event.clientX, event.clientY, event);
    });
    return true;
  }

  function bindMultipleScreenBackgroundContextMenus(input = {}) {
    const bindings = Array.isArray(input.bindings) ? input.bindings : [];
    let boundCount = 0;
    bindings.forEach((binding) => {
      if (bindScreenBackgroundContextMenu(binding)) {
        boundCount += 1;
      }
    });
    return boundCount;
  }

  function createScreenContextMenuBindingsUtils() {
    return {
      bindScreenBackgroundContextMenu,
      bindMultipleScreenBackgroundContextMenus,
    };
  }

  sharedRoot.createScreenContextMenuBindingsUtils =
    createScreenContextMenuBindingsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

