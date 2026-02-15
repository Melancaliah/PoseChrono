(function initPoseChronoSharedI18nUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function getLocale(i18nInstance, fallback = "en-US") {
    try {
      const i18n = i18nInstance || (typeof i18next !== "undefined" ? i18next : null);
      if (i18n && typeof i18n.t === "function") {
        const locale = i18n.t("_locale");
        if (locale && locale !== "_locale") return locale;
      }
    } catch (_) {}
    return fallback;
  }

  function t(i18nInstance, key, options = {}, fallback = "") {
    try {
      const i18n = i18nInstance || (typeof i18next !== "undefined" ? i18next : null);
      if (i18n && typeof i18n.t === "function") {
        const result = i18n.t(key, options || {});
        return result !== key ? result : fallback;
      }
    } catch (_) {}
    return fallback;
  }

  function tCountLabel(
    i18nInstance,
    key,
    count,
    fallbackSingular = "",
    fallbackPlural = "",
  ) {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const fallback = safeCount === 1 ? fallbackSingular : fallbackPlural;
    return t(i18nInstance, key, { count: safeCount, defaultValue: fallback }, fallback);
  }

  sharedRoot.i18n = {
    getLocale,
    t,
    tCountLabel,
  };

  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
