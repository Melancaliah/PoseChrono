(function initPoseChronoSyncNotificationPreferences(globalScope) {
  "use strict";

  const globalObj =
    globalScope || (typeof window !== "undefined" ? window : globalThis);

  const PREF_KEYS = {
    syncGuestActionNotificationsEnabled: "syncGuestActionNotificationsEnabled",
  };

  function readPreference(preferencesApi, fallback = true) {
    if (!preferencesApi || typeof preferencesApi.get !== "function") {
      return !!fallback;
    }
    return (
      preferencesApi.get(PREF_KEYS.syncGuestActionNotificationsEnabled, fallback) !==
      false
    );
  }

  function writePreference(preferencesApi, enabled) {
    if (!preferencesApi || typeof preferencesApi.set !== "function") {
      return !!enabled;
    }
    return (
      preferencesApi.set(
        PREF_KEYS.syncGuestActionNotificationsEnabled,
        !!enabled,
      ) !== false
    );
  }

  function syncCheckbox(inputEl, preferencesApi, fallback = true) {
    if (!inputEl) return false;
    const isCheckbox =
      inputEl.tagName === "INPUT" &&
      String(inputEl.type || "").toLowerCase() === "checkbox";
    if (!isCheckbox) return false;
    inputEl.checked = readPreference(preferencesApi, fallback);
    return true;
  }

  globalObj.PoseChronoSyncroModule = {
    ...(globalObj.PoseChronoSyncroModule || {}),
    PREF_KEYS,
    readPreference,
    writePreference,
    syncCheckbox,
  };
})(typeof window !== "undefined" ? window : globalThis);
