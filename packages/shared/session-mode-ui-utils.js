(function initPoseChronoSharedSessionModeUiUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  const MODE_CLASSIQUE = "classique";
  const MODE_CUSTOM = "custom";
  const MODE_RELAX = "relax";
  const MODE_MEMORY = "memory";
  const VALID_MODES = new Set([
    MODE_CLASSIQUE,
    MODE_CUSTOM,
    MODE_RELAX,
    MODE_MEMORY,
  ]);
  const MODE_DESCRIPTION_KEY_BY_MODE = Object.freeze({
    [MODE_CLASSIQUE]: "modes.classic.description",
    [MODE_CUSTOM]: "modes.custom.description",
    [MODE_RELAX]: "modes.relax.description",
    [MODE_MEMORY]: "modes.memory.description",
  });

  function normalizeMode(mode, fallback = MODE_CLASSIQUE) {
    const normalized = String(mode ?? "")
      .trim()
      .toLowerCase();
    if (VALID_MODES.has(normalized)) return normalized;

    const fallbackNormalized = String(fallback ?? MODE_CLASSIQUE)
      .trim()
      .toLowerCase();
    return VALID_MODES.has(fallbackNormalized) ? fallbackNormalized : MODE_CLASSIQUE;
  }

  function resolveIncomingPanelKey(mode) {
    const normalizedMode = normalizeMode(mode, MODE_CLASSIQUE);
    if (
      normalizedMode === MODE_CLASSIQUE ||
      normalizedMode === MODE_CUSTOM ||
      normalizedMode === MODE_MEMORY
    ) {
      return normalizedMode;
    }
    return null;
  }

  function resolveOutgoingPanelKey(previousModeRaw) {
    const previousMode = String(previousModeRaw ?? "")
      .trim()
      .toLowerCase();
    if (
      previousMode === MODE_CLASSIQUE ||
      previousMode === MODE_CUSTOM ||
      previousMode === MODE_MEMORY
    ) {
      return previousMode;
    }
    return null;
  }

  function shouldHideAllPanelsFirst(previousModeRaw) {
    const previousMode = String(previousModeRaw ?? "")
      .trim()
      .toLowerCase();
    return previousMode === "" || previousMode === MODE_RELAX;
  }

  function resolveRelaxFrozenPanelKey(previousModeRaw) {
    const previousMode = String(previousModeRaw ?? "")
      .trim()
      .toLowerCase();
    if (previousMode === MODE_MEMORY) return MODE_MEMORY;
    if (previousMode === MODE_CUSTOM) return MODE_CUSTOM;
    return MODE_CLASSIQUE;
  }

  function resolveMemoryDurationTarget(input = {}) {
    const memoryType = String(input.memoryType || "flash")
      .trim()
      .toLowerCase();
    const targetType = memoryType === "progressive" ? "progressive" : "flash";
    const duration =
      targetType === "flash"
        ? Math.max(0, Number(input.memoryDuration) || 0)
        : Math.max(0, Number(input.selectedDuration) || 0);

    return {
      memoryType: targetType,
      duration,
    };
  }

  function shouldDisableProgressiveBlurForMode(mode) {
    const normalizedMode = normalizeMode(mode, MODE_CLASSIQUE);
    return normalizedMode === MODE_MEMORY || normalizedMode === MODE_RELAX;
  }

  function resolveStartButtonDisabled(input = {}) {
    const imagesCount = Math.max(0, Number(input.imagesCount) || 0);
    if (imagesCount === 0) return true;
    const mode = normalizeMode(input.sessionMode, MODE_CLASSIQUE);
    if (mode === MODE_CUSTOM) {
      const customQueueLength = Math.max(0, Number(input.customQueueLength) || 0);
      return customQueueLength === 0;
    }
    if (mode === MODE_RELAX) return false;
    return (Number(input.selectedDuration) || 0) <= 0;
  }

  function resolveStartButtonUiState(input = {}) {
    const disabled = resolveStartButtonDisabled(input);
    return {
      disabled,
      opacity: disabled ? "0.5" : "1",
    };
  }

  function resolveHomeProgressiveBlurState(mode) {
    const normalizedMode = normalizeMode(mode, MODE_CLASSIQUE);
    const isRelax = normalizedMode === MODE_RELAX;
    return {
      disabled: isRelax,
      opacity: isRelax ? "0.5" : "1",
      classDisabled: isRelax,
    };
  }

  function resolveProgressiveBlurControlState(input = {}) {
    const disabled = !!input.disabled;
    const keepActive = !!input.keepActive;
    return {
      disabled,
      opacity: disabled ? "0.3" : "1",
      pointerEvents: disabled ? "none" : "all",
      shouldClearActive: disabled && !keepActive,
    };
  }

  function resolveModeTransition(mode, previousModeRaw) {
    const normalizedMode = normalizeMode(mode, MODE_CLASSIQUE);
    const isRelax = normalizedMode === MODE_RELAX;
    return {
      mode: normalizedMode,
      isRelax,
      incomingPanelKey: isRelax ? null : resolveIncomingPanelKey(normalizedMode),
      outgoingPanelKey: resolveOutgoingPanelKey(previousModeRaw),
      hideAllPanelsFirst: !isRelax && shouldHideAllPanelsFirst(previousModeRaw),
      relaxFrozenPanelKey: isRelax
        ? resolveRelaxFrozenPanelKey(previousModeRaw)
        : null,
      disableProgressiveBlur: shouldDisableProgressiveBlurForMode(normalizedMode),
    };
  }

  function getModeDescriptionI18nKey(mode) {
    const normalizedMode = normalizeMode(mode, MODE_CLASSIQUE);
    return (
      MODE_DESCRIPTION_KEY_BY_MODE[normalizedMode] ||
      MODE_DESCRIPTION_KEY_BY_MODE[MODE_CLASSIQUE]
    );
  }

  function resolveModeDescription(mode, translate, options = {}) {
    const t =
      typeof translate === "function" ? translate : (key, fallback) => fallback || key;
    const key = getModeDescriptionI18nKey(mode);
    const translated = t(key, "");

    if (translated && translated !== key) {
      return translated;
    }

    const fallbackKey = String(
      options.fallbackKey || "settings.sessionDescription",
    );
    const fallbackText = String(
      options.fallbackText || "Choose a session type",
    );
    return t(fallbackKey, fallbackText);
  }

  function createSessionModeUiUtils() {
    return {
      normalizeMode,
      resolveIncomingPanelKey,
      resolveOutgoingPanelKey,
      shouldHideAllPanelsFirst,
      resolveRelaxFrozenPanelKey,
      resolveMemoryDurationTarget,
      shouldDisableProgressiveBlurForMode,
      resolveStartButtonDisabled,
      resolveStartButtonUiState,
      resolveHomeProgressiveBlurState,
      resolveProgressiveBlurControlState,
      resolveModeTransition,
      getModeDescriptionI18nKey,
      resolveModeDescription,
    };
  }

  sharedRoot.createSessionModeUiUtils = createSessionModeUiUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
