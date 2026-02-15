(function initPoseChronoSharedSessionSurfaceInteractionsBindingsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function bindSessionSurfaceInteractions(input = {}) {
    const documentRef = input.documentRef || null;
    const currentImage = input.currentImage || null;
    const memoryOverlay = input.memoryOverlay || null;
    const state = input.state || null;
    const onToggleSidebar =
      typeof input.onToggleSidebar === "function" ? input.onToggleSidebar : null;
    const onNextImage =
      typeof input.onNextImage === "function" ? input.onNextImage : null;

    let bound = false;

    if (currentImage && typeof currentImage.addEventListener === "function" && onToggleSidebar) {
      currentImage.addEventListener("click", () => {
        if (!documentRef) {
          onToggleSidebar();
          return;
        }
        const gridPopup = documentRef.getElementById("grid-config-popup");
        const silhouettePopup = documentRef.getElementById(
          "silhouette-config-popup",
        );
        if (gridPopup || silhouettePopup) return;
        onToggleSidebar();
      });
      bound = true;
    }

    if (memoryOverlay && typeof memoryOverlay.addEventListener === "function" && state && onNextImage) {
      memoryOverlay.addEventListener("click", (event) => {
        if (event?.target && typeof event.target.closest === "function") {
          if (event.target.closest(".memory-overlay-btn")) return;
        }
        if (
          state.sessionMode === "memory" &&
          state.memoryHidden &&
          state.memoryNoPressure
        ) {
          onNextImage();
        }
      });
      bound = true;
    }

    return bound;
  }

  function createSessionSurfaceInteractionsBindingsUtils() {
    return {
      bindSessionSurfaceInteractions,
    };
  }

  sharedRoot.createSessionSurfaceInteractionsBindingsUtils =
    createSessionSurfaceInteractionsBindingsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

