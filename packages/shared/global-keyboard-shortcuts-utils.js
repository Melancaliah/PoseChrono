(function initPoseChronoSharedGlobalKeyboardShortcutsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || !!target.isContentEditable;
  }

  function shouldStopFrameSteppingOnKeyup(input = {}) {
    const event = input.event;
    const hotkeys = input.hotkeys || {};
    if (!event) return false;
    const key = event.key;
    return (
      key === "'" ||
      key === "PageDown" ||
      key === hotkeys.VIDEO_PREV_FRAME ||
      key === "(" ||
      key === "PageUp" ||
      key === hotkeys.VIDEO_NEXT_FRAME
    );
  }

  function handleThemeShortcut(input = {}) {
    const event = input.event;
    const themeHotkey = input.themeHotkey;
    const onToggleTheme =
      typeof input.onToggleTheme === "function" ? input.onToggleTheme : null;
    if (!event || !themeHotkey || !onToggleTheme) return false;
    if (event.key !== themeHotkey) return false;
    event.preventDefault();
    onToggleTheme();
    return true;
  }

  function isPinShortcutEvent(event) {
    return !!event && event.shiftKey && event.code === "KeyT";
  }

  async function handlePinShortcut(input = {}) {
    const event = input.event;
    const onToggleAlwaysOnTop =
      typeof input.onToggleAlwaysOnTop === "function"
        ? input.onToggleAlwaysOnTop
        : null;
    const onApplyState =
      typeof input.onApplyState === "function" ? input.onApplyState : null;

    if (!isPinShortcutEvent(event) || !onToggleAlwaysOnTop) return false;

    event.preventDefault();
    const isOnTop = await onToggleAlwaysOnTop();
    if (onApplyState) {
      onApplyState(!!isOnTop);
    }
    return true;
  }

  function handleGlobalSettingsShortcut(input = {}) {
    const event = input.event;
    const onOpenGlobalSettings =
      typeof input.onOpenGlobalSettings === "function"
        ? input.onOpenGlobalSettings
        : null;
    if (!event || !onOpenGlobalSettings) return false;

    const isModifier = event.ctrlKey || event.metaKey;
    const isGlobalSettingsKey =
      isModifier &&
      !event.shiftKey &&
      !event.altKey &&
      String(event.key || "").toLowerCase() === "k";
    if (!isGlobalSettingsKey || isTypingTarget(event.target)) return false;

    event.preventDefault();
    onOpenGlobalSettings();
    return true;
  }

  function createGlobalKeyboardShortcutsUtils() {
    return {
      shouldStopFrameSteppingOnKeyup,
      handleThemeShortcut,
      isPinShortcutEvent,
      handlePinShortcut,
      handleGlobalSettingsShortcut,
    };
  }

  sharedRoot.createGlobalKeyboardShortcutsUtils = createGlobalKeyboardShortcutsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

