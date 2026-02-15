(function initPoseChronoSharedI18nLoaderUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function normalizeLocaleToken(token) {
    if (!token) return "";
    return String(token).trim().replace(/_/g, "-").toLowerCase();
  }

  function resolveLocaleLang(token, localeAliases, localeFileByLang) {
    const normalized = normalizeLocaleToken(token);
    if (!normalized) return null;

    if (localeAliases && localeAliases[normalized]) {
      return localeAliases[normalized];
    }

    const primary = normalized.split("-")[0];
    if (localeFileByLang && localeFileByLang[primary]) {
      return primary;
    }
    return null;
  }

  function createI18nLoaderUtils(options = {}) {
    const i18nextInstance = options.i18nextInstance || null;
    const fetchImpl =
      typeof options.fetchImpl === "function" ? options.fetchImpl : null;
    const windowObj = options.windowObj || null;
    const documentObj = options.documentObj || null;
    const navigatorObj = options.navigatorObj || null;
    const localesPath = String(options.localesPath || "./_locales/");
    const baseLang = String(options.baseLang || "en");
    const localeFileByLang = options.localeFileByLang || {};
    const localeAliases = options.localeAliases || {};
    const localeGetter =
      typeof options.localeGetter === "function" ? options.localeGetter : null;

    function getPreferredLocaleLang() {
      const candidates = [];

      if (i18nextInstance && typeof i18nextInstance.language === "string") {
        candidates.push(i18nextInstance.language);
      }

      if (
        documentObj &&
        documentObj.documentElement &&
        typeof documentObj.documentElement.lang === "string"
      ) {
        candidates.push(documentObj.documentElement.lang);
      }

      if (navigatorObj) {
        if (Array.isArray(navigatorObj.languages)) {
          candidates.push(...navigatorObj.languages);
        }
        if (typeof navigatorObj.language === "string") {
          candidates.push(navigatorObj.language);
        }
      }

      if (typeof localeGetter === "function") {
        candidates.push(localeGetter());
      } else if (windowObj && typeof windowObj.getLocale === "function") {
        candidates.push(windowObj.getLocale());
      }

      for (const candidate of candidates) {
        const lang = resolveLocaleLang(candidate, localeAliases, localeFileByLang);
        if (lang) return lang;
      }

      return baseLang;
    }

    async function fetchLocaleTranslations(fileName) {
      if (!fetchImpl || !fileName) return null;
      try {
        const response = await fetchImpl(`${localesPath}${fileName}`);
        if (!response || !response.ok) return null;
        return await response.json();
      } catch (_) {
        return null;
      }
    }

    async function loadTranslations() {
      if (!i18nextInstance) return false;

      const preferredLang = getPreferredLocaleLang();
      const baseFileName = localeFileByLang[baseLang];
      if (!baseFileName) return false;

      const baseTranslations = await fetchLocaleTranslations(baseFileName);
      if (!baseTranslations) return false;

      const resources = {
        [baseLang]: {
          translation: baseTranslations,
        },
      };

      if (
        preferredLang !== baseLang &&
        Object.prototype.hasOwnProperty.call(localeFileByLang, preferredLang)
      ) {
        const preferredTranslations = await fetchLocaleTranslations(
          localeFileByLang[preferredLang],
        );
        if (preferredTranslations) {
          resources[preferredLang] = {
            translation: preferredTranslations,
          };
        }
      }

      const activeLang = resources[preferredLang] ? preferredLang : baseLang;
      const canInit = typeof i18nextInstance.init === "function";
      const isInitialized = !!i18nextInstance.isInitialized;

      if (!isInitialized && canInit) {
        await i18nextInstance.init({
          lng: activeLang,
          fallbackLng: baseLang,
          resources,
        });
        return true;
      }

      if (typeof i18nextInstance.addResourceBundle === "function") {
        Object.entries(resources).forEach(([lang, payload]) => {
          i18nextInstance.addResourceBundle(
            lang,
            "translation",
            payload.translation,
            true,
            true,
          );
        });
      }

      if (typeof i18nextInstance.changeLanguage === "function") {
        await i18nextInstance.changeLanguage(activeLang);
        return true;
      }

      if (canInit) {
        await i18nextInstance.init({
          lng: activeLang,
          fallbackLng: baseLang,
          resources,
        });
        return true;
      }

      return false;
    }

    return {
      loadTranslations,
      getPreferredLocaleLang,
    };
  }

  sharedRoot.createI18nLoaderUtils = createI18nLoaderUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

