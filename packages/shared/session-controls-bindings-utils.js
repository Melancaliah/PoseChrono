(function initPoseChronoSharedSessionControlsBindingsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function bindMemoryOverlayButtons(input = {}) {
    const memoryOverlay = input.memoryOverlay || null;
    const memoryPeekBtn = input.memoryPeekBtn || null;
    const memoryRevealBtn = input.memoryRevealBtn || null;
    const getRevealLabel =
      typeof input.getRevealLabel === "function" ? input.getRevealLabel : null;

    let bound = false;

    if (memoryPeekBtn && typeof memoryPeekBtn.addEventListener === "function") {
      memoryPeekBtn.addEventListener("mousedown", (event) => {
        event.stopPropagation();
        if (memoryOverlay && !memoryPeekBtn.disabled) {
          memoryOverlay.classList.add("peek-active");
          memoryOverlay.classList.add("peek-content-hidden");
        }
      });

      memoryPeekBtn.addEventListener("mouseup", (event) => {
        event.stopPropagation();
        if (memoryOverlay) {
          memoryOverlay.classList.remove("peek-active");
          memoryOverlay.classList.remove("peek-content-hidden");
        }
      });

      memoryPeekBtn.addEventListener("mouseleave", () => {
        if (memoryOverlay) {
          memoryOverlay.classList.remove("peek-active");
          memoryOverlay.classList.remove("peek-content-hidden");
        }
      });

      bound = true;
    }

    if (memoryRevealBtn && typeof memoryRevealBtn.addEventListener === "function") {
      memoryRevealBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!memoryOverlay) return;
        const isRevealed = memoryOverlay.classList.toggle("revealed");
        if (getRevealLabel) {
          memoryRevealBtn.textContent = getRevealLabel(isRevealed);
        }
        if (memoryPeekBtn) {
          memoryPeekBtn.disabled = isRevealed;
        }
      });
      bound = true;
    }

    return bound;
  }

  function bindShuffleAndAutoFlipButtons(input = {}) {
    const randomShuffleBtn = input.randomShuffleBtn || null;
    const autoFlipBtn = input.autoFlipBtn || null;
    const state = input.state || null;
    const onShuffleToggle =
      typeof input.onShuffleToggle === "function" ? input.onShuffleToggle : null;
    const onAutoFlipContextMenu =
      typeof input.onAutoFlipContextMenu === "function"
        ? input.onAutoFlipContextMenu
        : null;

    let bound = false;

    if (randomShuffleBtn && state && typeof randomShuffleBtn.addEventListener === "function") {
      randomShuffleBtn.classList.toggle("active", !!state.randomShuffle);
      randomShuffleBtn.addEventListener("click", () => {
        state.randomShuffle = !state.randomShuffle;
        randomShuffleBtn.classList.toggle("active", !!state.randomShuffle);
        if (onShuffleToggle) {
          onShuffleToggle(!!state.randomShuffle);
        }
      });
      bound = true;
    }

    if (autoFlipBtn && state && typeof autoFlipBtn.addEventListener === "function") {
      autoFlipBtn.classList.toggle("active", !!state.autoFlip);
      autoFlipBtn.addEventListener("click", () => {
        state.autoFlip = !state.autoFlip;
        autoFlipBtn.classList.toggle("active", !!state.autoFlip);
      });

      if (onAutoFlipContextMenu) {
        autoFlipBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onAutoFlipContextMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    return bound;
  }

  function bindTimerControlsAndProgress(input = {}) {
    const soundBtn = input.soundBtn || null;
    const toggleTimerBtn = input.toggleTimerBtn || null;
    const timerDisplay = input.timerDisplay || null;
    const progressBar = input.progressBar || null;
    const pauseCentralBlock = input.pauseCentralBlock || null;
    const state = input.state || {};
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);

    const onToggleSound =
      typeof input.onToggleSound === "function" ? input.onToggleSound : null;
    const onToggleTimer =
      typeof input.onToggleTimer === "function" ? input.onToggleTimer : null;
    const onShowProgressBarContextMenu =
      typeof input.onShowProgressBarContextMenu === "function"
        ? input.onShowProgressBarContextMenu
        : null;
    const onShowTimerContextMenu =
      typeof input.onShowTimerContextMenu === "function"
        ? input.onShowTimerContextMenu
        : null;
    const onShowPauseCircleContextMenu =
      typeof input.onShowPauseCircleContextMenu === "function"
        ? input.onShowPauseCircleContextMenu
        : null;
    const onUpdateTimerDisplay =
      typeof input.onUpdateTimerDisplay === "function"
        ? input.onUpdateTimerDisplay
        : null;

    let bound = false;
    let isDraggingProgress = false;

    if (soundBtn && onToggleSound && typeof soundBtn.addEventListener === "function") {
      soundBtn.addEventListener("click", onToggleSound);
      bound = true;
    }

    if (toggleTimerBtn && typeof toggleTimerBtn.addEventListener === "function") {
      if (onToggleTimer) {
        toggleTimerBtn.addEventListener("click", onToggleTimer);
      }
      if (onShowProgressBarContextMenu) {
        toggleTimerBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onShowProgressBarContextMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    if (
      timerDisplay &&
      onShowTimerContextMenu &&
      typeof timerDisplay.addEventListener === "function"
    ) {
      timerDisplay.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        onShowTimerContextMenu(event.clientX, event.clientY, event);
      });
      bound = true;
    }

    if (progressBar && typeof progressBar.addEventListener === "function") {
      progressBar.addEventListener("click", (event) => {
        if (!state.isPlaying && state.selectedDuration > 0) return;
        const rect = progressBar.getBoundingClientRect();
        const percent = (event.clientX - rect.left) / rect.width;
        state.timeRemaining = Math.round(percent * state.selectedDuration);
        if (onUpdateTimerDisplay) {
          onUpdateTimerDisplay();
        }
      });

      progressBar.addEventListener("mousedown", (event) => {
        if (state.selectedDuration <= 0) return;
        isDraggingProgress = true;
        const rect = progressBar.getBoundingClientRect();
        const percent = (event.clientX - rect.left) / rect.width;
        state.timeRemaining = Math.max(
          0,
          Math.min(
            state.selectedDuration,
            Math.round(percent * state.selectedDuration),
          ),
        );
        if (onUpdateTimerDisplay) {
          onUpdateTimerDisplay();
        }
        progressBar.style.cursor = "grabbing";
      });
      bound = true;
    }

    if (documentRef && progressBar && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("mousemove", (event) => {
        if (!isDraggingProgress) return;
        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / rect.width),
        );
        state.timeRemaining = Math.round(percent * state.selectedDuration);
        if (onUpdateTimerDisplay) {
          onUpdateTimerDisplay();
        }
      });

      documentRef.addEventListener("mouseup", () => {
        if (!isDraggingProgress) return;
        isDraggingProgress = false;
        progressBar.style.cursor = "pointer";
      });
      bound = true;
    }

    if (
      pauseCentralBlock &&
      onShowPauseCircleContextMenu &&
      typeof pauseCentralBlock.addEventListener === "function"
    ) {
      pauseCentralBlock.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        onShowPauseCircleContextMenu(event.clientX, event.clientY, event);
      });
      bound = true;
    }

    return bound;
  }

  function bindVideoScrubbing(input = {}) {
    const currentVideo = input.currentVideo || null;
    const state = input.state || {};
    const frameStepState = input.frameStepState || {};
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    const performanceRef =
      input.performanceRef ||
      (typeof performance !== "undefined" ? performance : null);
    const requestAnimationFrameRef =
      input.requestAnimationFrameRef ||
      (typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : null);
    const cancelAnimationFrameRef =
      input.cancelAnimationFrameRef ||
      (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
    const onUpdateVideoTimeDisplay =
      typeof input.onUpdateVideoTimeDisplay === "function"
        ? input.onUpdateVideoTimeDisplay
        : null;

    if (
      !currentVideo ||
      !documentRef ||
      !performanceRef ||
      !requestAnimationFrameRef
    ) {
      return false;
    }

    let isScrubbingVideo = false;
    let scrubStartX = 0;
    let scrubStartTime = 0;
    let scrubTargetTime = 0;
    let scrubRafId = null;
    let scrubLastSeekTime = 0;
    const SCRUB_MIN_INTERVAL = 1000 / 30;

    function performScrubSeek() {
      scrubRafId = null;

      if (!isScrubbingVideo || !currentVideo.duration) return;

      const now = performanceRef.now();
      if (now - scrubLastSeekTime < SCRUB_MIN_INTERVAL) {
        scrubRafId = requestAnimationFrameRef(performScrubSeek);
        return;
      }

      scrubLastSeekTime = now;

      if (
        frameStepState.vfcSupported &&
        typeof currentVideo.requestVideoFrameCallback === "function"
      ) {
        currentVideo.currentTime = scrubTargetTime;
        currentVideo.requestVideoFrameCallback(() => {
          if (onUpdateVideoTimeDisplay) {
            onUpdateVideoTimeDisplay();
          }
          if (isScrubbingVideo && scrubTargetTime !== currentVideo.currentTime) {
            scrubRafId = requestAnimationFrameRef(performScrubSeek);
          }
        });
      } else {
        currentVideo.currentTime = scrubTargetTime;
        if (onUpdateVideoTimeDisplay) {
          onUpdateVideoTimeDisplay();
        }
      }
    }

    currentVideo.addEventListener("keydown", (event) => {
      if (event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
    });

    currentVideo.addEventListener("mousedown", (event) => {
      if (!state.isVideoFile || !currentVideo.duration) return;
      isScrubbingVideo = true;
      scrubStartX = event.clientX;
      scrubStartTime = currentVideo.currentTime;
      scrubTargetTime = scrubStartTime;
      currentVideo.style.cursor = "ew-resize";
      event.preventDefault();
    });

    documentRef.addEventListener("mousemove", (event) => {
      if (!isScrubbingVideo || !currentVideo.duration) return;

      const deltaX = event.clientX - scrubStartX;
      const videoWidth = currentVideo.offsetWidth || 800;
      let sensitivity = currentVideo.duration / videoWidth;

      if (event.shiftKey) {
        sensitivity *= 0.1;
      }

      scrubTargetTime = Math.max(
        0,
        Math.min(currentVideo.duration, scrubStartTime + deltaX * sensitivity),
      );

      if (!scrubRafId) {
        scrubRafId = requestAnimationFrameRef(performScrubSeek);
      }
    });

    documentRef.addEventListener("mouseup", () => {
      if (!isScrubbingVideo) return;
      isScrubbingVideo = false;
      currentVideo.style.cursor = "";
      if (scrubRafId && cancelAnimationFrameRef) {
        cancelAnimationFrameRef(scrubRafId);
        scrubRafId = null;
      }
      if (currentVideo.currentTime !== scrubTargetTime) {
        currentVideo.currentTime = scrubTargetTime;
        if (onUpdateVideoTimeDisplay) {
          onUpdateVideoTimeDisplay();
        }
      }
    });

    return true;
  }

  function bindVideoControls(input = {}) {
    const videoPlayBtn = input.videoPlayBtn || null;
    const videoSlowerBtn = input.videoSlowerBtn || null;
    const videoFasterBtn = input.videoFasterBtn || null;
    const videoPrevFrameBtn = input.videoPrevFrameBtn || null;
    const videoNextFrameBtn = input.videoNextFrameBtn || null;
    const videoLoopBtn = input.videoLoopBtn || null;
    const videoConfigBtn = input.videoConfigBtn || null;
    const videoSpeedDisplay = input.videoSpeedDisplay || null;
    const videoTimeline = input.videoTimeline || null;
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    const state = input.state || {};
    const frameStepState = input.frameStepState || {};
    const icons = input.icons || {};
    const t = typeof input.translate === "function" ? input.translate : null;

    const onToggleVideoPlayPause =
      typeof input.onToggleVideoPlayPause === "function"
        ? input.onToggleVideoPlayPause
        : null;
    const onChangeVideoSpeed =
      typeof input.onChangeVideoSpeed === "function"
        ? input.onChangeVideoSpeed
        : null;
    const onStepFrame =
      typeof input.onStepFrame === "function" ? input.onStepFrame : null;
    const onProcessFrameStepLoop =
      typeof input.onProcessFrameStepLoop === "function"
        ? input.onProcessFrameStepLoop
        : null;
    const onStopFrameSteppingFromButton =
      typeof input.onStopFrameSteppingFromButton === "function"
        ? input.onStopFrameSteppingFromButton
        : null;
    const onToggleVideoLoop =
      typeof input.onToggleVideoLoop === "function" ? input.onToggleVideoLoop : null;
    const onShowVideoConfig =
      typeof input.onShowVideoConfig === "function" ? input.onShowVideoConfig : null;
    const onShowSpeedPopup =
      typeof input.onShowSpeedPopup === "function" ? input.onShowSpeedPopup : null;
    const onSeekVideo =
      typeof input.onSeekVideo === "function" ? input.onSeekVideo : null;

    let bound = false;

    if (videoPlayBtn && typeof videoPlayBtn.addEventListener === "function") {
      if (icons.VIDEO_PLAY) {
        videoPlayBtn.innerHTML = icons.VIDEO_PLAY;
      }
      if (onToggleVideoPlayPause) {
        videoPlayBtn.addEventListener("click", onToggleVideoPlayPause);
      }
      bound = true;
    }

    if (videoSlowerBtn && typeof videoSlowerBtn.addEventListener === "function") {
      if (icons.VIDEO_SLOWER) {
        videoSlowerBtn.innerHTML = icons.VIDEO_SLOWER;
      }
      if (onChangeVideoSpeed) {
        videoSlowerBtn.addEventListener("click", () => onChangeVideoSpeed(-1));
      }
      bound = true;
    }

    if (videoFasterBtn && typeof videoFasterBtn.addEventListener === "function") {
      if (icons.VIDEO_FASTER) {
        videoFasterBtn.innerHTML = icons.VIDEO_FASTER;
      }
      if (onChangeVideoSpeed) {
        videoFasterBtn.addEventListener("click", () => onChangeVideoSpeed(1));
      }
      bound = true;
    }

    if (videoPrevFrameBtn && typeof videoPrevFrameBtn.addEventListener === "function") {
      if (icons.VIDEO_PREV_FRAME) {
        videoPrevFrameBtn.innerHTML = icons.VIDEO_PREV_FRAME;
      }
      if (onStepFrame && onProcessFrameStepLoop) {
        videoPrevFrameBtn.addEventListener("mousedown", (event) => {
          event.preventDefault();
          onStepFrame(-1, false);
          frameStepState.buttonHoldTimeout = setTimeout(() => {
            frameStepState.isHoldingKey = true;
            frameStepState.pendingDirection = -1;
            onProcessFrameStepLoop();
          }, 200);
        });
      }
      if (onStopFrameSteppingFromButton) {
        videoPrevFrameBtn.addEventListener("mouseup", onStopFrameSteppingFromButton);
        videoPrevFrameBtn.addEventListener(
          "mouseleave",
          onStopFrameSteppingFromButton,
        );
      }
      bound = true;
    }

    if (videoNextFrameBtn && typeof videoNextFrameBtn.addEventListener === "function") {
      if (icons.VIDEO_NEXT_FRAME) {
        videoNextFrameBtn.innerHTML = icons.VIDEO_NEXT_FRAME;
      }
      if (onStepFrame && onProcessFrameStepLoop) {
        videoNextFrameBtn.addEventListener("mousedown", (event) => {
          event.preventDefault();
          onStepFrame(1, false);
          frameStepState.buttonHoldTimeout = setTimeout(() => {
            frameStepState.isHoldingKey = true;
            frameStepState.pendingDirection = 1;
            onProcessFrameStepLoop();
          }, 200);
        });
      }
      if (onStopFrameSteppingFromButton) {
        videoNextFrameBtn.addEventListener("mouseup", onStopFrameSteppingFromButton);
        videoNextFrameBtn.addEventListener(
          "mouseleave",
          onStopFrameSteppingFromButton,
        );
      }
      bound = true;
    }

    if (videoLoopBtn && typeof videoLoopBtn.addEventListener === "function") {
      if (state.videoLoop) {
        videoLoopBtn.innerHTML = icons.VIDEO_LOOP_ON || "";
      } else {
        videoLoopBtn.innerHTML = icons.VIDEO_LOOP_OFF || "";
      }
      if (onToggleVideoLoop) {
        videoLoopBtn.addEventListener("click", onToggleVideoLoop);
      }
      if (onShowVideoConfig) {
        videoLoopBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onShowVideoConfig();
        });
      }
      bound = true;
    }

    if (videoConfigBtn && typeof videoConfigBtn.addEventListener === "function") {
      if (icons.VIDEO_CONFIG) {
        videoConfigBtn.innerHTML = icons.VIDEO_CONFIG;
      }
      if (onShowVideoConfig) {
        videoConfigBtn.addEventListener("click", onShowVideoConfig);
      }
      bound = true;
    }

    if (videoSpeedDisplay && typeof videoSpeedDisplay.addEventListener === "function") {
      const speedIndicator = videoSpeedDisplay.parentElement;
      if (speedIndicator) {
        speedIndicator.style.cursor = "pointer";
        if (onShowSpeedPopup) {
          speedIndicator.addEventListener("click", onShowSpeedPopup);
        }
        if (t) {
          speedIndicator.setAttribute("data-tooltip", t("video.clickToAdjustSpeed"));
        }
      }
      bound = true;
    }

    if (videoTimeline && onSeekVideo && typeof videoTimeline.addEventListener === "function") {
      let isDraggingTimeline = false;

      videoTimeline.addEventListener("click", onSeekVideo);
      videoTimeline.addEventListener("mousedown", (event) => {
        isDraggingTimeline = true;
        onSeekVideo(event);
      });

      if (documentRef && typeof documentRef.addEventListener === "function") {
        documentRef.addEventListener("mousemove", (event) => {
          if (!isDraggingTimeline) return;
          onSeekVideo(event);
        });

        documentRef.addEventListener("mouseup", () => {
          isDraggingTimeline = false;
        });
      }
      bound = true;
    }

    return bound;
  }

  function bindPrimarySessionButtons(input = {}) {
    const playPauseBtn = input.playPauseBtn || null;
    const prevBtn = input.prevBtn || null;
    const nextBtn = input.nextBtn || null;
    const settingsBtn = input.settingsBtn || null;
    const flipHorizontalBtn = input.flipHorizontalBtn || null;
    const flipVerticalBtn = input.flipVerticalBtn || null;
    const grayscaleBtn = input.grayscaleBtn || null;
    const blurBtn = input.blurBtn || null;
    const annotateBtn = input.annotateBtn || null;
    const progressiveBlurBtn = input.progressiveBlurBtn || null;
    const homeProgressiveBlurBtn = input.homeProgressiveBlurBtn || null;

    const onTogglePlayPause =
      typeof input.onTogglePlayPause === "function"
        ? input.onTogglePlayPause
        : null;
    const onPreviousImage =
      typeof input.onPreviousImage === "function" ? input.onPreviousImage : null;
    const onShowPrevImageMenu =
      typeof input.onShowPrevImageMenu === "function"
        ? input.onShowPrevImageMenu
        : null;
    const onNextImage =
      typeof input.onNextImage === "function" ? input.onNextImage : null;
    const onShowNextImageMenu =
      typeof input.onShowNextImageMenu === "function"
        ? input.onShowNextImageMenu
        : null;
    const onSettingsClick =
      typeof input.onSettingsClick === "function" ? input.onSettingsClick : null;
    const onSettingsContextMenu =
      typeof input.onSettingsContextMenu === "function"
        ? input.onSettingsContextMenu
        : null;
    const onToggleFlipHorizontal =
      typeof input.onToggleFlipHorizontal === "function"
        ? input.onToggleFlipHorizontal
        : null;
    const onToggleFlipVertical =
      typeof input.onToggleFlipVertical === "function"
        ? input.onToggleFlipVertical
        : null;
    const onToggleGrayscale =
      typeof input.onToggleGrayscale === "function"
        ? input.onToggleGrayscale
        : null;
    const onToggleBlur =
      typeof input.onToggleBlur === "function" ? input.onToggleBlur : null;
    const onShowBlurMenu =
      typeof input.onShowBlurMenu === "function" ? input.onShowBlurMenu : null;
    const onToggleAnnotate =
      typeof input.onToggleAnnotate === "function"
        ? input.onToggleAnnotate
        : null;
    const onToggleProgressiveBlur =
      typeof input.onToggleProgressiveBlur === "function"
        ? input.onToggleProgressiveBlur
        : null;
    const onShowProgressiveBlurMenu =
      typeof input.onShowProgressiveBlurMenu === "function"
        ? input.onShowProgressiveBlurMenu
        : null;

    let bound = false;

    if (playPauseBtn && onTogglePlayPause) {
      playPauseBtn.addEventListener("click", onTogglePlayPause);
      bound = true;
    }

    if (prevBtn) {
      if (onPreviousImage) {
        prevBtn.addEventListener("click", onPreviousImage);
      }
      if (onShowPrevImageMenu) {
        prevBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onShowPrevImageMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    if (nextBtn) {
      if (onNextImage) {
        nextBtn.addEventListener("click", onNextImage);
      }
      if (onShowNextImageMenu) {
        nextBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onShowNextImageMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    if (settingsBtn) {
      if (onSettingsClick) {
        settingsBtn.addEventListener("click", () => {
          void onSettingsClick();
        });
      }
      if (onSettingsContextMenu) {
        settingsBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onSettingsContextMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    if (flipHorizontalBtn && onToggleFlipHorizontal) {
      flipHorizontalBtn.addEventListener("click", onToggleFlipHorizontal);
      bound = true;
    }
    if (flipVerticalBtn && onToggleFlipVertical) {
      flipVerticalBtn.addEventListener("click", onToggleFlipVertical);
      bound = true;
    }
    if (grayscaleBtn && onToggleGrayscale) {
      grayscaleBtn.addEventListener("click", onToggleGrayscale);
      bound = true;
    }

    if (blurBtn) {
      if (onToggleBlur) {
        blurBtn.addEventListener("click", onToggleBlur);
      }
      if (onShowBlurMenu) {
        blurBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onShowBlurMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    if (annotateBtn && onToggleAnnotate) {
      annotateBtn.addEventListener("click", onToggleAnnotate);
      bound = true;
    }

    if (progressiveBlurBtn) {
      if (onToggleProgressiveBlur) {
        progressiveBlurBtn.addEventListener("click", onToggleProgressiveBlur);
      }
      if (onShowProgressiveBlurMenu) {
        progressiveBlurBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onShowProgressiveBlurMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    if (homeProgressiveBlurBtn) {
      if (onToggleProgressiveBlur) {
        homeProgressiveBlurBtn.addEventListener("click", onToggleProgressiveBlur);
      }
      if (onShowProgressiveBlurMenu) {
        homeProgressiveBlurBtn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          onShowProgressiveBlurMenu(event.clientX, event.clientY, event);
        });
      }
      bound = true;
    }

    return bound;
  }

  function bindSessionEntryAndModeControls(input = {}) {
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    const startBtn = input.startBtn || null;
    const chooseMediaFolderBtn = input.chooseMediaFolderBtn || null;
    const stopBtn = input.stopBtn || null;
    const closeReviewBtn = input.closeReviewBtn || null;
    const customAddBtn = input.customAddBtn || null;
    const addPauseBtn = input.addPauseBtn || null;
    const customInputs = Array.isArray(input.customInputs) ? input.customInputs : [];

    const onStartSession =
      typeof input.onStartSession === "function" ? input.onStartSession : null;
    const onChooseMediaFolder =
      typeof input.onChooseMediaFolder === "function"
        ? input.onChooseMediaFolder
        : null;
    const onShowReview =
      typeof input.onShowReview === "function" ? input.onShowReview : null;
    const onCloseReview =
      typeof input.onCloseReview === "function" ? input.onCloseReview : null;
    const onSwitchMode =
      typeof input.onSwitchMode === "function" ? input.onSwitchMode : null;
    const onAddCustomStep =
      typeof input.onAddCustomStep === "function" ? input.onAddCustomStep : null;
    const onAddCustomPause =
      typeof input.onAddCustomPause === "function" ? input.onAddCustomPause : null;

    let bound = false;

    if (startBtn && onStartSession) {
      startBtn.addEventListener("click", onStartSession);
      bound = true;
    }

    if (chooseMediaFolderBtn && onChooseMediaFolder) {
      chooseMediaFolderBtn.addEventListener("click", () => {
        void onChooseMediaFolder();
      });
      bound = true;
    }

    if (stopBtn && onShowReview) {
      stopBtn.addEventListener("click", onShowReview);
      bound = true;
    }

    if (closeReviewBtn && onCloseReview) {
      closeReviewBtn.addEventListener("click", onCloseReview);
      bound = true;
    }

    if (documentRef && onSwitchMode) {
      documentRef.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          onSwitchMode(btn.dataset.mode);
        });
      });
      bound = true;
    }

    if (customAddBtn && onAddCustomStep) {
      customAddBtn.onclick = (event) => {
        event.preventDefault();
        onAddCustomStep();
      };
      bound = true;
    }

    if (addPauseBtn && onAddCustomPause) {
      addPauseBtn.onclick = (event) => {
        event.preventDefault();
        onAddCustomPause();
      };
      bound = true;
    }

    if (onAddCustomStep) {
      customInputs.forEach((inputEl) => {
        if (!inputEl || typeof inputEl.addEventListener !== "function") return;
        inputEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAddCustomStep();
        });
      });
      bound = bound || customInputs.length > 0;
    }

    return bound;
  }

  function bindGlobalSettingsControls(input = {}) {
    const globalSettingsModal = input.globalSettingsModal || null;
    const closeGlobalSettingsModalBtn = input.closeGlobalSettingsModalBtn || null;
    const globalSettingsToggleGridBtn = input.globalSettingsToggleGridBtn || null;
    const globalSettingsToggleThemeBtn = input.globalSettingsToggleThemeBtn || null;
    const globalSettingsOpenHotkeysBtn = input.globalSettingsOpenHotkeysBtn || null;
    const globalSettingsTitlebarAlwaysVisibleInput =
      input.globalSettingsTitlebarAlwaysVisibleInput || null;
    const globalSettingsDefaultModeGroup = input.globalSettingsDefaultModeGroup || null;

    const onCloseGlobalSettingsModal =
      typeof input.onCloseGlobalSettingsModal === "function"
        ? input.onCloseGlobalSettingsModal
        : null;
    const onToggleGrid =
      typeof input.onToggleGrid === "function" ? input.onToggleGrid : null;
    const onToggleTheme =
      typeof input.onToggleTheme === "function" ? input.onToggleTheme : null;
    const onOpenHotkeys =
      typeof input.onOpenHotkeys === "function" ? input.onOpenHotkeys : null;
    const onTitlebarAlwaysVisibleChanged =
      typeof input.onTitlebarAlwaysVisibleChanged === "function"
        ? input.onTitlebarAlwaysVisibleChanged
        : null;
    const onDefaultModeSelected =
      typeof input.onDefaultModeSelected === "function"
        ? input.onDefaultModeSelected
        : null;

    let bound = false;

    if (closeGlobalSettingsModalBtn && onCloseGlobalSettingsModal) {
      closeGlobalSettingsModalBtn.addEventListener("click", () => {
        onCloseGlobalSettingsModal();
      });
      bound = true;
    }

    if (globalSettingsModal && onCloseGlobalSettingsModal) {
      globalSettingsModal.addEventListener("click", (event) => {
        if (event.target !== globalSettingsModal) return;
        onCloseGlobalSettingsModal();
      });
      bound = true;
    }

    if (globalSettingsToggleGridBtn && onToggleGrid) {
      const isCheckboxControl =
        globalSettingsToggleGridBtn.tagName === "INPUT" &&
        String(globalSettingsToggleGridBtn.type || "").toLowerCase() ===
          "checkbox";
      const eventName = isCheckboxControl ? "change" : "click";
      globalSettingsToggleGridBtn.addEventListener(eventName, () => {
        onToggleGrid({
          isCheckboxControl,
          checked: !!globalSettingsToggleGridBtn.checked,
        });
      });
      bound = true;
    }

    if (globalSettingsToggleThemeBtn && onToggleTheme) {
      globalSettingsToggleThemeBtn.addEventListener("click", onToggleTheme);
      bound = true;
    }

    if (globalSettingsOpenHotkeysBtn && onOpenHotkeys) {
      globalSettingsOpenHotkeysBtn.addEventListener("click", onOpenHotkeys);
      bound = true;
    }

    if (
      globalSettingsTitlebarAlwaysVisibleInput &&
      onTitlebarAlwaysVisibleChanged
    ) {
      globalSettingsTitlebarAlwaysVisibleInput.addEventListener("change", () => {
        onTitlebarAlwaysVisibleChanged(
          !!globalSettingsTitlebarAlwaysVisibleInput.checked,
        );
      });
      bound = true;
    }

    if (globalSettingsDefaultModeGroup && onDefaultModeSelected) {
      globalSettingsDefaultModeGroup.addEventListener("click", (event) => {
        const modeBtn = event.target.closest(".search-toggle-btn[data-mode]");
        if (!modeBtn || !globalSettingsDefaultModeGroup.contains(modeBtn)) return;
        onDefaultModeSelected(modeBtn.dataset.mode);
      });
      bound = true;
    }

    return bound;
  }

  function bindGlobalSettingsActionButtons(input = {}) {
    const globalResetSettingsBtn = input.globalResetSettingsBtn || null;
    const globalSettingsExportPrefsBtn = input.globalSettingsExportPrefsBtn || null;
    const globalSettingsImportPrefsBtn = input.globalSettingsImportPrefsBtn || null;
    const globalSettingsRepairStorageBtn = input.globalSettingsRepairStorageBtn || null;

    const onResetSettings =
      typeof input.onResetSettings === "function" ? input.onResetSettings : null;
    const onExportPreferences =
      typeof input.onExportPreferences === "function"
        ? input.onExportPreferences
        : null;
    const onImportPreferences =
      typeof input.onImportPreferences === "function"
        ? input.onImportPreferences
        : null;
    const onRepairStorage =
      typeof input.onRepairStorage === "function" ? input.onRepairStorage : null;

    let bound = false;

    if (globalResetSettingsBtn && onResetSettings) {
      globalResetSettingsBtn.addEventListener("click", async () => {
        await onResetSettings();
      });
      bound = true;
    }

    if (globalSettingsExportPrefsBtn && onExportPreferences) {
      globalSettingsExportPrefsBtn.addEventListener("click", async () => {
        await onExportPreferences();
      });
      bound = true;
    }

    if (globalSettingsImportPrefsBtn && onImportPreferences) {
      globalSettingsImportPrefsBtn.addEventListener("click", async () => {
        await onImportPreferences();
      });
      bound = true;
    }

    if (globalSettingsRepairStorageBtn && onRepairStorage) {
      globalSettingsRepairStorageBtn.addEventListener("click", async () => {
        await onRepairStorage();
      });
      bound = true;
    }

    return bound;
  }

  function bindClassicDurationButtons(input = {}) {
    const durationBtns = Array.isArray(input.durationBtns) ? input.durationBtns : [];
    const hoursInput = input.hoursInput || null;
    const minutesInput = input.minutesInput || null;
    const secondsInput = input.secondsInput || null;
    const domInputGroups = Array.isArray(input.domInputGroups)
      ? input.domInputGroups
      : [];
    const state = input.state || {};
    const getDurationFromButton =
      typeof input.getDurationFromButton === "function"
        ? input.getDurationFromButton
        : null;
    const onToggleDurationButtonsForValue =
      typeof input.onToggleDurationButtonsForValue === "function"
        ? input.onToggleDurationButtonsForValue
        : null;

    if (
      durationBtns.length === 0 ||
      !getDurationFromButton ||
      !onToggleDurationButtonsForValue
    ) {
      return false;
    }

    durationBtns.forEach((btn) => {
      if (!btn || typeof btn.addEventListener !== "function") return;
      btn.addEventListener("click", () => {
        const durationValue = getDurationFromButton(btn);
        onToggleDurationButtonsForValue(durationBtns, durationValue);
        state.selectedDuration = durationValue;
        if (hoursInput) hoursInput.value = 0;
        if (minutesInput) minutesInput.value = 0;
        if (secondsInput) secondsInput.value = 0;
        domInputGroups.forEach((group) => {
          if (group && group.classList) {
            group.classList.remove("active");
          }
        });
      });
    });

    return true;
  }

  function bindMemoryTypeSwitchButtons(input = {}) {
    const memoryTypeBtns = Array.isArray(input.memoryTypeBtns)
      ? input.memoryTypeBtns
      : [];
    const memoryFlashSettings = input.memoryFlashSettings || null;
    const memoryProgressiveSettings = input.memoryProgressiveSettings || null;
    const state = input.state || {};

    if (memoryTypeBtns.length === 0) return false;

    memoryTypeBtns.forEach((btn) => {
      if (!btn || typeof btn.addEventListener !== "function") return;
      btn.addEventListener("click", () => {
        const memoryType = btn.dataset.memoryType;
        state.memoryType = memoryType;

        memoryTypeBtns.forEach((item) => item.classList.remove("active"));
        btn.classList.add("active");

        if (!memoryFlashSettings || !memoryProgressiveSettings) return;
        if (memoryType === "flash") {
          memoryFlashSettings.style.display = "block";
          memoryProgressiveSettings.style.display = "none";
        } else {
          memoryFlashSettings.style.display = "none";
          memoryProgressiveSettings.style.display = "block";
        }
      });
    });

    return true;
  }

  function bindMemoryDurationControls(input = {}) {
    const memoryFlashBtns = Array.isArray(input.memoryFlashBtns)
      ? input.memoryFlashBtns
      : [];
    const memoryProgressiveBtns = Array.isArray(input.memoryProgressiveBtns)
      ? input.memoryProgressiveBtns
      : [];
    const memoryProgressiveMinutes = input.memoryProgressiveMinutes || null;
    const memoryProgressiveSeconds = input.memoryProgressiveSeconds || null;
    const memoryProgressiveCustomTime = input.memoryProgressiveCustomTime || null;
    const memoryFlashMinutes = input.memoryFlashMinutes || null;
    const memoryFlashSeconds = input.memoryFlashSeconds || null;
    const memoryCustomTime = input.memoryCustomTime || null;
    const memoryDrawingTimeInput = input.memoryDrawingTimeInput || null;
    const state = input.state || {};

    const getDurationFromButton =
      typeof input.getDurationFromButton === "function"
        ? input.getDurationFromButton
        : null;
    const onToggleDurationButtonsForValue =
      typeof input.onToggleDurationButtonsForValue === "function"
        ? input.onToggleDurationButtonsForValue
        : null;
    const onClearDurationButtonsActive =
      typeof input.onClearDurationButtonsActive === "function"
        ? input.onClearDurationButtonsActive
        : null;
    const onReadMinutesSecondsInputValues =
      typeof input.onReadMinutesSecondsInputValues === "function"
        ? input.onReadMinutesSecondsInputValues
        : null;
    const onUpdateMemoryTotalDuration =
      typeof input.onUpdateMemoryTotalDuration === "function"
        ? input.onUpdateMemoryTotalDuration
        : null;

    let bound = false;

    if (
      memoryFlashBtns.length > 0 &&
      getDurationFromButton &&
      onToggleDurationButtonsForValue
    ) {
      memoryFlashBtns.forEach((btn) => {
        if (!btn || typeof btn.addEventListener !== "function") return;
        btn.addEventListener("click", () => {
          const durationValue = getDurationFromButton(btn);
          onToggleDurationButtonsForValue(memoryFlashBtns, durationValue);
          state.memoryDuration = durationValue;

          if (memoryCustomTime) {
            memoryCustomTime.classList.remove("active");
          }
          if (memoryFlashMinutes) memoryFlashMinutes.value = 0;
          if (memoryFlashSeconds) memoryFlashSeconds.value = 0;
          if (onUpdateMemoryTotalDuration) {
            onUpdateMemoryTotalDuration();
          }
          if (state.memoryDrawingTime > 0 && memoryDrawingTimeInput) {
            memoryDrawingTimeInput.classList.add("active");
          }
        });
      });
      bound = true;
    }

    if (
      memoryProgressiveBtns.length > 0 &&
      getDurationFromButton &&
      onToggleDurationButtonsForValue
    ) {
      memoryProgressiveBtns.forEach((btn) => {
        if (!btn || typeof btn.addEventListener !== "function") return;
        btn.addEventListener("click", () => {
          const durationValue = getDurationFromButton(btn);
          onToggleDurationButtonsForValue(memoryProgressiveBtns, durationValue);
          state.selectedDuration = durationValue;
          if (memoryProgressiveCustomTime) {
            memoryProgressiveCustomTime.classList.remove("active");
          }
          if (memoryProgressiveMinutes) memoryProgressiveMinutes.value = 0;
          if (memoryProgressiveSeconds) memoryProgressiveSeconds.value = 0;
        });
      });
      bound = true;
    }

    if (
      memoryProgressiveMinutes &&
      memoryProgressiveSeconds &&
      onReadMinutesSecondsInputValues
    ) {
      const updateMemoryProgressiveDuration = () => {
        const result = onReadMinutesSecondsInputValues(
          memoryProgressiveMinutes,
          memoryProgressiveSeconds,
        );
        const totalSeconds = Number(result?.totalSeconds || 0);

        if (totalSeconds > 0) {
          if (onClearDurationButtonsActive) {
            onClearDurationButtonsActive(memoryProgressiveBtns);
          }
          if (memoryProgressiveCustomTime) {
            memoryProgressiveCustomTime.classList.add("active");
          }
          state.selectedDuration = totalSeconds;
        } else if (memoryProgressiveCustomTime) {
          memoryProgressiveCustomTime.classList.remove("active");
        }
      };

      memoryProgressiveMinutes.addEventListener(
        "input",
        updateMemoryProgressiveDuration,
      );
      memoryProgressiveSeconds.addEventListener(
        "input",
        updateMemoryProgressiveDuration,
      );
      bound = true;
    }

    if (memoryFlashMinutes && memoryFlashSeconds && onReadMinutesSecondsInputValues) {
      const updateMemoryDuration = () => {
        const result = onReadMinutesSecondsInputValues(
          memoryFlashMinutes,
          memoryFlashSeconds,
        );
        const totalSeconds = Number(result?.totalSeconds || 0);

        if (totalSeconds > 0) {
          if (onClearDurationButtonsActive) {
            onClearDurationButtonsActive(memoryFlashBtns);
          }
          if (memoryCustomTime) {
            memoryCustomTime.classList.add("active");
          }
          state.memoryDuration = totalSeconds;
        } else if (memoryCustomTime) {
          memoryCustomTime.classList.remove("active");
        }

        if (onUpdateMemoryTotalDuration) {
          onUpdateMemoryTotalDuration();
        }
      };

      memoryFlashMinutes.addEventListener("input", updateMemoryDuration);
      memoryFlashSeconds.addEventListener("input", updateMemoryDuration);
      bound = true;
    }

    return bound;
  }

  function bindMemoryDrawingTimeControls(input = {}) {
    const memoryDrawingMinutes = input.memoryDrawingMinutes || null;
    const memoryDrawingSeconds = input.memoryDrawingSeconds || null;
    const memoryDrawingTimeInput = input.memoryDrawingTimeInput || null;
    const noPressureBtn = input.noPressureBtn || null;
    const state = input.state || {};

    const onReadMinutesSecondsInputValues =
      typeof input.onReadMinutesSecondsInputValues === "function"
        ? input.onReadMinutesSecondsInputValues
        : null;
    const onUpdateMemoryTotalDuration =
      typeof input.onUpdateMemoryTotalDuration === "function"
        ? input.onUpdateMemoryTotalDuration
        : null;

    let bound = false;

    if (
      memoryDrawingMinutes &&
      memoryDrawingSeconds &&
      onReadMinutesSecondsInputValues
    ) {
      const updateMemoryDrawingTime = () => {
        const result = onReadMinutesSecondsInputValues(
          memoryDrawingMinutes,
          memoryDrawingSeconds,
        );
        const totalSeconds = Number(result?.totalSeconds || 0);

        if (totalSeconds > 0) {
          if (memoryDrawingTimeInput) {
            memoryDrawingTimeInput.classList.add("active");
          }
          if (noPressureBtn) {
            noPressureBtn.classList.remove("active");
          }
          state.memoryDrawingTime = totalSeconds;
          state.memoryNoPressure = false;
        } else {
          if (memoryDrawingTimeInput) {
            memoryDrawingTimeInput.classList.remove("active");
          }
          state.memoryDrawingTime = 0;
        }

        if (onUpdateMemoryTotalDuration) {
          onUpdateMemoryTotalDuration();
        }
      };

      memoryDrawingMinutes.addEventListener("input", updateMemoryDrawingTime);
      memoryDrawingSeconds.addEventListener("input", updateMemoryDrawingTime);
      bound = true;
    }

    if (noPressureBtn) {
      noPressureBtn.addEventListener("click", () => {
        const isActive = noPressureBtn.classList.toggle("active");
        if (isActive) {
          if (memoryDrawingTimeInput) {
            memoryDrawingTimeInput.classList.remove("active");
          }
          if (memoryDrawingMinutes) memoryDrawingMinutes.value = 0;
          if (memoryDrawingSeconds) memoryDrawingSeconds.value = 0;
          state.memoryDrawingTime = 0;
          state.memoryNoPressure = true;
        } else {
          state.memoryNoPressure = false;
        }

        if (onUpdateMemoryTotalDuration) {
          onUpdateMemoryTotalDuration();
        }
      });
      bound = true;
    }

    return bound;
  }

  function makeEditableNumericValue(input = {}) {
    const valueElement = input.valueElement || null;
    const sliderElement = input.sliderElement || null;
    const onUpdate =
      typeof input.onUpdate === "function" ? input.onUpdate : null;
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    if (!valueElement || !sliderElement || !documentRef) return false;

    const currentValue = parseInt(valueElement.textContent, 10);
    const min = parseInt(sliderElement.min, 10);
    const max = parseInt(sliderElement.max, 10);

    const editInput = documentRef.createElement("input");
    editInput.type = "number";
    editInput.min = min;
    editInput.max = max;
    editInput.value = Number.isFinite(currentValue) ? currentValue : min;
    editInput.style.cssText = `
      width: 50px;
      padding: 2px 4px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--color-primary);
      border-radius: 4px;
      color: var(--color-primary);
      font-weight: bold;
      font-size: inherit;
      text-align: center;
    `;

    const validateAndRestore = () => {
      let newValue = parseInt(editInput.value, 10);
      if (Number.isNaN(newValue) || newValue < min) {
        newValue = min;
      } else if (newValue > max) {
        newValue = max;
      }
      sliderElement.value = newValue;
      valueElement.textContent = newValue;
      valueElement.style.display = "";
      if (onUpdate) {
        onUpdate(newValue);
      }
      editInput.remove();
    };

    valueElement.style.display = "none";
    valueElement.parentElement.appendChild(editInput);
    editInput.focus();
    editInput.select();

    editInput.addEventListener("blur", validateAndRestore);
    editInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        validateAndRestore();
      } else if (event.key === "Escape") {
        event.preventDefault();
        valueElement.style.display = "";
        editInput.remove();
      }
    });

    return true;
  }

  function bindMemoryPoseSliders(input = {}) {
    const memoryPosesSlider = input.memoryPosesSlider || null;
    const memoryPosesValue = input.memoryPosesValue || null;
    const memoryProgressivePosesSlider = input.memoryProgressivePosesSlider || null;
    const memoryProgressivePosesValue = input.memoryProgressivePosesValue || null;
    const state = input.state || {};
    const clickToEnterLabel = input.clickToEnterLabel || "";

    const onInitSliderWithGradient =
      typeof input.onInitSliderWithGradient === "function"
        ? input.onInitSliderWithGradient
        : null;
    const onUpdateSliderGradient =
      typeof input.onUpdateSliderGradient === "function"
        ? input.onUpdateSliderGradient
        : null;
    const onUpdateMemoryTotalDuration =
      typeof input.onUpdateMemoryTotalDuration === "function"
        ? input.onUpdateMemoryTotalDuration
        : null;
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);

    let bound = false;

    if (memoryPosesSlider && memoryPosesValue) {
      if (onInitSliderWithGradient) {
        onInitSliderWithGradient(memoryPosesSlider);
      }

      memoryPosesSlider.addEventListener("input", (event) => {
        const value = parseInt(event.target.value, 10);
        state.memoryPosesCount = value;
        memoryPosesValue.textContent = value;
        if (onUpdateSliderGradient) {
          onUpdateSliderGradient(memoryPosesSlider);
        }
        if (onUpdateMemoryTotalDuration) {
          onUpdateMemoryTotalDuration();
        }
      });

      memoryPosesValue.style.cursor = "pointer";
      if (clickToEnterLabel) {
        memoryPosesValue.title = clickToEnterLabel;
      }
      memoryPosesValue.addEventListener("click", () => {
        makeEditableNumericValue({
          valueElement: memoryPosesValue,
          sliderElement: memoryPosesSlider,
          documentRef,
          onUpdate: (newValue) => {
            state.memoryPosesCount = newValue;
            if (onUpdateSliderGradient) {
              onUpdateSliderGradient(memoryPosesSlider);
            }
            if (onUpdateMemoryTotalDuration) {
              onUpdateMemoryTotalDuration();
            }
          },
        });
      });
      bound = true;
    }

    if (memoryProgressivePosesSlider && memoryProgressivePosesValue) {
      if (onInitSliderWithGradient) {
        onInitSliderWithGradient(memoryProgressivePosesSlider);
      }

      memoryProgressivePosesSlider.addEventListener("input", (event) => {
        const value = parseInt(event.target.value, 10);
        state.memoryPosesCount = value;
        memoryProgressivePosesValue.textContent = value;
        if (onUpdateSliderGradient) {
          onUpdateSliderGradient(memoryProgressivePosesSlider);
        }
      });

      memoryProgressivePosesValue.style.cursor = "pointer";
      if (clickToEnterLabel) {
        memoryProgressivePosesValue.title = clickToEnterLabel;
      }
      memoryProgressivePosesValue.addEventListener("click", () => {
        makeEditableNumericValue({
          valueElement: memoryProgressivePosesValue,
          sliderElement: memoryProgressivePosesSlider,
          documentRef,
          onUpdate: (newValue) => {
            state.memoryPosesCount = newValue;
            if (onUpdateSliderGradient) {
              onUpdateSliderGradient(memoryProgressivePosesSlider);
            }
          },
        });
      });
      bound = true;
    }

    return bound;
  }

  function bindCustomHmsTimerInputs(input = {}) {
    const inputs = Array.isArray(input.inputs) ? input.inputs : [];
    const state = input.state || {};
    const domDurationButtons = Array.isArray(input.domDurationButtons)
      ? input.domDurationButtons
      : [];
    const domInputGroups = Array.isArray(input.domInputGroups)
      ? input.domInputGroups
      : [];

    const onReadHmsInputValues =
      typeof input.onReadHmsInputValues === "function"
        ? input.onReadHmsInputValues
        : null;
    const onClearDurationButtonsActive =
      typeof input.onClearDurationButtonsActive === "function"
        ? input.onClearDurationButtonsActive
        : null;
    const onUpdateTimerDisplay =
      typeof input.onUpdateTimerDisplay === "function"
        ? input.onUpdateTimerDisplay
        : null;
    const createDebounce =
      typeof input.createDebounce === "function" ? input.createDebounce : null;
    const debounceMs = Number(input.debounceMs || 50);

    if (!onReadHmsInputValues || inputs.length === 0) return false;

    const handler = () => {
      const result = onReadHmsInputValues();
      const totalCustom = Number(result?.totalSeconds || 0);
      if (totalCustom > 0) {
        if (onClearDurationButtonsActive) {
          onClearDurationButtonsActive(domDurationButtons);
        }
        domInputGroups.forEach((group) => {
          if (group && group.classList) {
            group.classList.add("active");
          }
        });
        state.selectedDuration = totalCustom;
      }
      state.timeRemaining = state.selectedDuration;
      if (onUpdateTimerDisplay) {
        onUpdateTimerDisplay();
      }
    };

    const debouncedHandler = createDebounce
      ? createDebounce(handler, debounceMs)
      : handler;

    inputs.forEach((inputEl) => {
      if (!inputEl || typeof inputEl.addEventListener !== "function") return;
      inputEl.addEventListener("input", debouncedHandler);
    });

    return true;
  }

  function bindSessionPlansModalBasics(input = {}) {
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    const managePlansBtn = input.managePlansBtn || null;
    const closePlansModal = input.closePlansModal || null;
    const sessionPlansModal = input.sessionPlansModal || null;
    const onOpen = typeof input.onOpen === "function" ? input.onOpen : null;
    const onClose = typeof input.onClose === "function" ? input.onClose : null;

    if (!sessionPlansModal) return false;

    const escapeHandler = (event) => {
      if (
        event.key === "Escape" &&
        !sessionPlansModal.classList.contains("hidden")
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (onClose) {
          onClose("escape");
        }
        if (documentRef) {
          documentRef.removeEventListener("keydown", escapeHandler, true);
        }
      }
    };

    if (managePlansBtn) {
      managePlansBtn.addEventListener("click", async () => {
        if (onOpen) {
          await onOpen();
        }
        if (documentRef) {
          documentRef.addEventListener("keydown", escapeHandler, true);
        }
      });
    }

    if (closePlansModal) {
      closePlansModal.addEventListener("click", () => {
        if (onClose) {
          onClose("button");
        }
        if (documentRef) {
          documentRef.removeEventListener("keydown", escapeHandler, true);
        }
      });
    }

    sessionPlansModal.addEventListener("click", (event) => {
      if (event.target !== sessionPlansModal) return;
      if (onClose) {
        onClose("overlay");
      }
    });

    return true;
  }

  function bindSessionPlansCrudControls(input = {}) {
    const savePlanBtn = input.savePlanBtn || null;
    const savedPlansList = input.savedPlansList || null;
    const onSavePlan =
      typeof input.onSavePlan === "function" ? input.onSavePlan : null;
    const onSavedPlansClick =
      typeof input.onSavedPlansClick === "function"
        ? input.onSavedPlansClick
        : null;

    let bound = false;

    if (savePlanBtn && onSavePlan) {
      savePlanBtn.addEventListener("click", async () => {
        await onSavePlan();
      });
      bound = true;
    }

    if (savedPlansList && onSavedPlansClick) {
      savedPlansList.addEventListener("click", async (event) => {
        await onSavedPlansClick(event);
      });
      bound = true;
    }

    return bound;
  }

  function resolveMemoryTotalDurationDisplay(input = {}) {
    const state = input.state || {};
    const calculateTotalSeconds =
      typeof input.calculateTotalSeconds === "function"
        ? input.calculateTotalSeconds
        : null;

    if (state.memoryNoPressure) {
      return { visible: false, text: "" };
    }

    if (!state.memoryDrawingTime || state.memoryDrawingTime === 0) {
      return { visible: false, text: "" };
    }

    if (!calculateTotalSeconds) {
      return { visible: false, text: "" };
    }

    const posesCount = state.memoryPosesCount || 10;
    const drawingTime = state.memoryDrawingTime || 0;
    const displayTime = state.memoryDuration || 0;
    const totalSeconds = Number(
      calculateTotalSeconds(posesCount, drawingTime, displayTime),
    );

    const safeSeconds = Number.isFinite(totalSeconds)
      ? Math.max(0, Math.floor(totalSeconds))
      : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    let formattedTime = "";
    if (hours > 0) {
      formattedTime += `${hours}h `;
    }
    if (minutes > 0 || hours > 0) {
      formattedTime += `${minutes}min `;
    }
    formattedTime += `${seconds}s`;

    return {
      visible: true,
      text: formattedTime.trim(),
      totalSeconds: safeSeconds,
    };
  }

  function createSessionControlsBindingsUtils() {
    return {
      bindMemoryOverlayButtons,
      bindShuffleAndAutoFlipButtons,
      bindTimerControlsAndProgress,
      bindVideoScrubbing,
      bindVideoControls,
      bindPrimarySessionButtons,
      bindSessionEntryAndModeControls,
      bindGlobalSettingsControls,
      bindGlobalSettingsActionButtons,
      bindClassicDurationButtons,
      bindMemoryTypeSwitchButtons,
      bindMemoryDurationControls,
      bindMemoryDrawingTimeControls,
      makeEditableNumericValue,
      bindMemoryPoseSliders,
      bindCustomHmsTimerInputs,
      bindSessionPlansModalBasics,
      bindSessionPlansCrudControls,
      resolveMemoryTotalDurationDisplay,
    };
  }

  sharedRoot.createSessionControlsBindingsUtils = createSessionControlsBindingsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
