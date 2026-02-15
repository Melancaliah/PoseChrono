(function initPoseChronoSharedSettingsShortcutsUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || !!target.isContentEditable;
  }

  function isPlainSpacePress(event) {
    const isSpace =
      event?.key === " " || event?.key === "Spacebar" || event?.code === "Space";
    if (!isSpace) return false;
    return !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
  }

  function handleSettingsScreenKeyboardShortcuts(input = {}) {
    const event = input.event;
    const settingsScreen = input.settingsScreen;
    const startBtn = input.startBtn;
    const getTopOpenModal =
      typeof input.getTopOpenModal === "function" ? input.getTopOpenModal : null;
    const onStart = typeof input.onStart === "function" ? input.onStart : null;

    if (!event || !settingsScreen || settingsScreen.classList.contains("hidden")) {
      return false;
    }

    if (!isPlainSpacePress(event) || isTypingTarget(event.target)) {
      return false;
    }

    if (getTopOpenModal && getTopOpenModal()) return false;
    if (!startBtn || startBtn.disabled) return false;

    event.preventDefault();
    if (onStart) {
      onStart();
    } else if (typeof startBtn.click === "function") {
      startBtn.click();
    }
    return true;
  }

  function createSettingsShortcutsUtils() {
    return {
      handleSettingsScreenKeyboardShortcuts,
    };
  }

  sharedRoot.createSettingsShortcutsUtils = createSettingsShortcutsUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

