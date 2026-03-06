(function initPoseChronoSharedMainKeyboardShortcutsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA";
  }

  function callIfFn(fn, ...args) {
    if (typeof fn === "function") {
      return fn(...args);
    }
    return undefined;
  }

  function handleMainKeyboardShortcuts(input = {}) {
    const e = input.event;
    if (!e) return false;

    const drawingScreen = input.drawingScreen;
    if (!drawingScreen || drawingScreen.classList.contains("hidden")) return true;
    if (isTypingTarget(e.target)) return true;
    if (input.isDrawingModeActive) return true;

    const doc = input.documentRef || (typeof document !== "undefined" ? document : null);
    const win = input.windowRef || (typeof window !== "undefined" ? window : null);
    const state = input.state || {};
    const blurBtn = input.blurBtn || null;
    const config = input.config || {};
    const hk = config.HOTKEYS || {};

    if (!doc) return true;

    const key = e.key;
    const keyLow = String(key || "").toLowerCase();

    const tagsModal = doc.getElementById("tags-modal");
    const sessionPlansModal = doc.getElementById("session-plans-modal");
    const globalSettingsModal = doc.getElementById("global-settings-modal");

    const isAnyModalOpen =
      (tagsModal && !tagsModal.classList.contains("hidden")) ||
      (sessionPlansModal && !sessionPlansModal.classList.contains("hidden")) ||
      (globalSettingsModal && !globalSettingsModal.classList.contains("hidden"));

    if (isAnyModalOpen && key === "Escape") {
      e.preventDefault();

      if (tagsModal && !tagsModal.classList.contains("hidden")) {
        tagsModal.classList.add("hidden");
        if (state.wasPlayingBeforeModal) {
          callIfFn(input.startTimer);
          state.wasPlayingBeforeModal = false;
        }
        return true;
      }

      if (sessionPlansModal && !sessionPlansModal.classList.contains("hidden")) {
        sessionPlansModal.classList.add("hidden");
        return true;
      }

      if (
        globalSettingsModal &&
        !globalSettingsModal.classList.contains("hidden")
      ) {
        callIfFn(input.closeGlobalSettingsModal);
        return true;
      }

      return true;
    }

    if (isAnyModalOpen) return true;

    if (key === hk.FLIP_H) {
      e.preventDefault();
      callIfFn(input.toggleFlipHorizontal);
      return true;
    }

    if (key === " " && !e.shiftKey) {
      e.preventDefault();
      callIfFn(input.togglePlayPause);
      return true;
    }

    if (e.shiftKey && key === hk.GRID_MODAL) {
      e.preventDefault();
      callIfFn(input.showGridConfig);
      return true;
    }

    if (e.shiftKey && key === hk.SILHOUETTE_MODAL) {
      e.preventDefault();
      callIfFn(input.showSilhouetteConfig);
      return true;
    }

    switch (key) {
      case "Escape": {
        e.preventDefault();
        const gridPopup = doc.getElementById("grid-config-popup");
        const silhouettePopup = doc.getElementById("silhouette-config-popup");
        const imageInfoOverlay = doc.getElementById("image-info-overlay");

        if (gridPopup) {
          gridPopup.remove();
          if (input.wasPlayingBeforeModal && !state.isPlaying) {
            callIfFn(input.togglePlayPause);
          }
        } else if (silhouettePopup) {
          silhouettePopup.remove();
          if (input.wasPlayingBeforeModal && !state.isPlaying) {
            callIfFn(input.togglePlayPause);
          }
        } else if (!imageInfoOverlay) {
          callIfFn(input.showReview);
        }
        break;
      }
      case "Delete":
        e.preventDefault();
        callIfFn(input.deleteImage);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (e.shiftKey) {
          if (state.silhouetteEnabled) {
            state.silhouetteBrightness = Math.min(
              state.silhouetteBrightness + 0.1,
              6,
            );
            callIfFn(input.applyImageFilters);
            const brightnessSlider = doc.getElementById("brightness-slider");
            const brightnessValue = doc.getElementById("brightness-value");
            if (brightnessSlider) {
              brightnessSlider.value = state.silhouetteBrightness;
              callIfFn(input.updateSliderGradient, brightnessSlider);
            }
            if (brightnessValue) {
              brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
            }
          }
        } else if (state.isBlurEnabled) {
          state.blurAmount = Math.min(state.blurAmount + 2.5, 100);
          callIfFn(input.updateBlurAmount);
          callIfFn(input.applyImageFilters);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (e.shiftKey) {
          if (state.silhouetteEnabled) {
            state.silhouetteBrightness = Math.max(
              state.silhouetteBrightness - 0.1,
              0,
            );
            callIfFn(input.applyImageFilters);
            const brightnessSlider = doc.getElementById("brightness-slider");
            const brightnessValue = doc.getElementById("brightness-value");
            if (brightnessSlider) {
              brightnessSlider.value = state.silhouetteBrightness;
              callIfFn(input.updateSliderGradient, brightnessSlider);
            }
            if (brightnessValue) {
              brightnessValue.textContent = state.silhouetteBrightness.toFixed(2);
            }
          }
        } else if (state.isBlurEnabled) {
          state.blurAmount = Math.max(state.blurAmount - 2.5, 0);
          callIfFn(input.updateBlurAmount);
          callIfFn(input.applyImageFilters);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        callIfFn(input.previousImage);
        break;
      case "ArrowRight":
        e.preventDefault();
        callIfFn(input.nextImage);
        break;
      default:
        break;
    }

    if (
      keyLow === String(hk.GRAYSCALE || "").toLowerCase() ||
      (e.ctrlKey && e.altKey && keyLow === "g")
    ) {
      callIfFn(input.toggleGrayscale);
    } else if (keyLow === String(hk.BLUR || "").toLowerCase()) {
      if (!state.isProgressiveBlur && blurBtn) {
        blurBtn.click();
      }
    } else if (keyLow === String(hk.ANNOTATE || "").toLowerCase()) {
      e.preventDefault();
      callIfFn(input.openDrawingMode);
    } else if (keyLow === String(hk.MUTE || "").toLowerCase()) {
      callIfFn(input.toggleSound);
    } else if (keyLow === String(hk.GRID || "").toLowerCase()) {
      state.gridEnabled = !state.gridEnabled;
      if (
        state.gridEnabled &&
        state.gridMode === "none" &&
        (!Array.isArray(state.gridGuides) || state.gridGuides.length === 0)
      ) {
        if (!Array.isArray(state.gridGuides)) state.gridGuides = [];
        state.gridGuides.push({ type: "vertical", position: 50 });
      }
      callIfFn(input.updateGridOverlay);
    } else if (keyLow === String(hk.SILHOUETTE || "").toLowerCase()) {
      state.silhouetteEnabled = !state.silhouetteEnabled;
      callIfFn(input.applyImageFilters);
    } else if (keyLow === String(hk.SIDEBAR || "").toLowerCase()) {
      callIfFn(input.toggleSidebar);
    } else if (keyLow === String(hk.INFO || "").toLowerCase()) {
      callIfFn(input.toggleImageInfo);
    } else if (keyLow === String(hk.TAGS || "").toLowerCase()) {
      e.preventDefault();
      if (!callIfFn(input.isTagsFeatureAvailable)) return true;
      if (typeof input.openTagsModal === "function") {
        const zoomOverlay = doc.getElementById("zoom-overlay");
        const zoomImage = win ? win.zoomOverlayCurrentImage || null : null;
        if (zoomOverlay && zoomImage) {
          input.openTagsModal(null, zoomImage);
        } else if (
          zoomOverlay &&
          win &&
          win.currentZoomIndex !== undefined &&
          win.currentZoomIndex !== null
        ) {
          input.openTagsModal(win.currentZoomIndex);
        } else {
          input.openTagsModal();
        }
      }
    }

    if (state.isVideoFile) {
      if (key === hk.VIDEO_SLOWER) {
        e.preventDefault();
        callIfFn(input.changeVideoSpeed, -1);
        return true;
      }
      if (key === hk.VIDEO_FASTER) {
        e.preventDefault();
        callIfFn(input.changeVideoSpeed, 1);
        return true;
      }
      if (key === hk.VIDEO_PREV_FRAME) {
        e.preventDefault();
        callIfFn(input.stepFrame, -1, e.repeat);
        return true;
      }
      if (key === hk.VIDEO_NEXT_FRAME) {
        e.preventDefault();
        callIfFn(input.stepFrame, 1, e.repeat);
        return true;
      }
      if (keyLow === String(hk.VIDEO_LOOP || "").toLowerCase()) {
        e.preventDefault();
        callIfFn(input.toggleVideoLoop);
        return true;
      }
      if (e.shiftKey && key === " ") {
        e.preventDefault();
        callIfFn(input.toggleVideoPlayPause);
        return true;
      }
      if (e.shiftKey && key === hk.VIDEO_CONFIG) {
        e.preventDefault();
        callIfFn(input.showVideoConfig);
        return true;
      }
    }

    return true;
  }

  function createMainKeyboardShortcutsUtils() {
    return {
      handleMainKeyboardShortcuts,
    };
  }

  sharedRoot.createMainKeyboardShortcutsUtils = createMainKeyboardShortcutsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

