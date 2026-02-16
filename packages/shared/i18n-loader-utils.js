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
    const cacheStorage =
      options.cacheStorage ||
      (windowObj && windowObj.localStorage ? windowObj.localStorage : null);
    const cacheEnabled = options.cacheEnabled !== false && !!cacheStorage;
    const cachePrefix = String(options.cachePrefix || "posechrono-i18n-cache");
    const cacheTtlMsRaw = Number(options.cacheTtlMs);
    const cacheTtlMs =
      Number.isFinite(cacheTtlMsRaw) && cacheTtlMsRaw > 0
        ? cacheTtlMsRaw
        : 7 * 24 * 60 * 60 * 1000;
    let cacheVersion =
      options.cacheVersion === null || options.cacheVersion === undefined
        ? ""
        : String(options.cacheVersion);
    const pendingRefreshByLang = new Map();

    function normalizeLanguageToken(token) {
      const lang = resolveLocaleLang(token, localeAliases, localeFileByLang);
      if (!lang) return null;
      if (!Object.prototype.hasOwnProperty.call(localeFileByLang, lang)) return null;
      return lang;
    }

    function buildCacheKey(lang) {
      const versionToken = String(cacheVersion || "").trim();
      if (!versionToken) return `${cachePrefix}:${lang}`;
      return `${cachePrefix}:${versionToken}:${lang}`;
    }

    function readCachedLocale(lang) {
      if (!cacheEnabled || !cacheStorage) return null;
      try {
        const raw = cacheStorage.getItem(buildCacheKey(lang));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const translation = parsed.translation;
        if (!translation || typeof translation !== "object") return null;
        const savedAt = Number(parsed.savedAt) || 0;
        const expired = !savedAt || Date.now() - savedAt > cacheTtlMs;
        return {
          translation,
          expired,
          savedAt,
        };
      } catch (_) {
        return null;
      }
    }

    function writeCachedLocale(lang, translation) {
      if (!cacheEnabled || !cacheStorage) return;
      if (!translation || typeof translation !== "object") return;
      try {
        cacheStorage.setItem(
          buildCacheKey(lang),
          JSON.stringify({
            lang,
            version: String(cacheVersion || ""),
            savedAt: Date.now(),
            translation,
          }),
        );
      } catch (_) {}
    }

    function setCacheVersion(nextVersion) {
      cacheVersion =
        nextVersion === null || nextVersion === undefined
          ? ""
          : String(nextVersion);
      return cacheVersion;
    }

    function getPreferredLocaleLang() {
      const candidates = [];

      if (typeof localeGetter === "function") {
        candidates.push(localeGetter());
      }

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

      if (windowObj && typeof windowObj.getLocale === "function") {
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

    async function fetchAndCacheLocale(language) {
      const normalizedLanguage = normalizeLanguageToken(language);
      if (!normalizedLanguage) return null;

      if (pendingRefreshByLang.has(normalizedLanguage)) {
        return pendingRefreshByLang.get(normalizedLanguage);
      }

      const run = (async () => {
        const fileName = localeFileByLang[normalizedLanguage];
        if (!fileName) return null;
        const payload = await fetchLocaleTranslations(fileName);
        if (payload && typeof payload === "object") {
          writeCachedLocale(normalizedLanguage, payload);
          return payload;
        }
        return null;
      })();

      pendingRefreshByLang.set(normalizedLanguage, run);
      try {
        return await run;
      } finally {
        pendingRefreshByLang.delete(normalizedLanguage);
      }
    }

    async function loadTranslationsForLanguage(language) {
      const normalizedLanguage = normalizeLanguageToken(language);
      if (!normalizedLanguage) return null;

      const cached = readCachedLocale(normalizedLanguage);
      if (cached && cached.translation) {
        if (cached.expired) {
          void fetchAndCacheLocale(normalizedLanguage);
        }
        return cached.translation;
      }

      return await fetchAndCacheLocale(normalizedLanguage);
    }

    async function loadTranslations() {
      if (!i18nextInstance) return false;

      const preferredLang = getPreferredLocaleLang();
      const baseFileName = localeFileByLang[baseLang];
      if (!baseFileName) return false;

      const baseTranslations = await loadTranslationsForLanguage(baseLang);
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
        const preferredTranslations =
          await loadTranslationsForLanguage(preferredLang);
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
      loadTranslationsForLanguage,
      setCacheVersion,
    };
  }

  sharedRoot.createI18nLoaderUtils = createI18nLoaderUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

