(function initPoseChronoSharedSidebarTooltipsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function safeSetTooltip(element, value) {
    if (!element || typeof element.setAttribute !== "function") return;
    element.setAttribute("data-tooltip", String(value || ""));
  }

  function updateSidebarTooltips(input = {}) {
    const buttons = input.buttons || {};
    const hotkeys = input.hotkeys || {};
    const t =
      typeof input.translate === "function"
        ? input.translate
        : (key, options = {}) => {
            if (options && typeof options.defaultValue === "string") {
              return options.defaultValue;
            }
            return key;
          };

    safeSetTooltip(
      buttons.flipHorizontalBtn,
      `${t("drawing.flipHorizontal")} (${hotkeys.FLIP_H || ""})`,
    );
    safeSetTooltip(buttons.flipVerticalBtn, t("drawing.flipVertical"));
    safeSetTooltip(
      buttons.grayscaleBtn,
      `${t("filters.grayscale")} (${String(hotkeys.GRAYSCALE || "").toUpperCase()})`,
    );
    safeSetTooltip(
      buttons.blurBtn,
      t("filters.blurTooltip", {
        hotkey: String(hotkeys.BLUR || "").toUpperCase(),
      }),
    );
    safeSetTooltip(buttons.progressiveBlurBtn, t("filters.progressiveBlur"));
  }

  function createSidebarTooltipsUtils() {
    return {
      updateSidebarTooltips,
    };
  }

  sharedRoot.createSidebarTooltipsUtils = createSidebarTooltipsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

