import { describe, it, expect, vi } from "vitest";
import { loadSharedModule } from "../../../helpers/load-shared-module.js";

const shared = loadSharedModule("packages/shared/i18n-loader-utils.js");
// Module exports a single factory function
const createI18nLoaderUtils = shared.createI18nLoaderUtils;

// ── Test fixtures ──────────────────────────────────────────────────────────
const LOCALE_FILE_BY_LANG = {
  en: "en.json",
  fr: "fr.json",
  zh: "zh.json",
  de: "de.json",
};

const LOCALE_ALIASES = {
  "zh-cn": "zh",
  "zh-tw": "zh",
  "pt-br": "pt",
};

function createMockStorage() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
    _store: store,
  };
}

describe("i18n-loader-utils", () => {
  describe("createI18nLoaderUtils — factory", () => {
    it("devrait retourner un objet avec les méthodes publiques", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
      });
      expect(typeof utils.loadTranslations).toBe("function");
      expect(typeof utils.getPreferredLocaleLang).toBe("function");
      expect(typeof utils.loadTranslationsForLanguage).toBe("function");
      expect(typeof utils.setCacheVersion).toBe("function");
    });
  });

  describe("getPreferredLocaleLang", () => {
    it("devrait retourner baseLang quand aucune source de locale n'est fournie", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
      });
      expect(utils.getPreferredLocaleLang()).toBe("en");
    });

    it("devrait résoudre via localeGetter", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        localeAliases: LOCALE_ALIASES,
        baseLang: "en",
        localeGetter: () => "fr",
      });
      expect(utils.getPreferredLocaleLang()).toBe("fr");
    });

    it("devrait résoudre les alias via localeGetter", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        localeAliases: LOCALE_ALIASES,
        baseLang: "en",
        localeGetter: () => "zh-CN",
      });
      expect(utils.getPreferredLocaleLang()).toBe("zh");
    });

    it("devrait fallback sur baseLang pour une locale inconnue", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        localeGetter: () => "xx-YY",
      });
      expect(utils.getPreferredLocaleLang()).toBe("en");
    });

    it("devrait résoudre via navigatorObj.languages", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        navigatorObj: { languages: ["de-AT", "en"], language: "de" },
      });
      expect(utils.getPreferredLocaleLang()).toBe("de");
    });

    it("devrait résoudre via i18nextInstance.language", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        // isInitialized:true requis — on ignore .language si i18next pas encore prêt
        i18nextInstance: { language: "fr", isInitialized: true },
      });
      expect(utils.getPreferredLocaleLang()).toBe("fr");
    });
  });

  describe("setCacheVersion", () => {
    it("devrait mettre à jour la version du cache", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
      });
      expect(utils.setCacheVersion("v2")).toBe("v2");
    });

    it("devrait convertir null en string vide", () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        cacheVersion: "v1",
      });
      expect(utils.setCacheVersion(null)).toBe("");
    });
  });

  describe("loadTranslationsForLanguage", () => {
    it("devrait retourner null pour une langue inconnue", async () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
      });
      const result = await utils.loadTranslationsForLanguage("xx");
      expect(result).toBeNull();
    });

    it("devrait utiliser le cache quand disponible", async () => {
      const mockStorage = createMockStorage();
      const cacheData = JSON.stringify({
        lang: "fr",
        version: "",
        savedAt: Date.now(),
        translation: { hello: "Bonjour" },
      });
      mockStorage._store["posechrono-i18n-cache:fr"] = cacheData;

      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        cacheStorage: mockStorage,
        cacheTtlMs: 60000,
      });

      const result = await utils.loadTranslationsForLanguage("fr");
      expect(result).toEqual({ hello: "Bonjour" });
    });

    it("devrait fetch quand le cache est vide", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ greeting: "Hallo" }),
      });

      const mockStorage = createMockStorage();
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        fetchImpl: mockFetch,
        cacheStorage: mockStorage,
        localesPath: "/locales/",
      });

      const result = await utils.loadTranslationsForLanguage("de");
      expect(result).toEqual({ greeting: "Hallo" });
      expect(mockFetch).toHaveBeenCalledWith("/locales/de.json");
      // Devrait être mis en cache
      expect(mockStorage._store["posechrono-i18n-cache:de"]).toBeTruthy();
    });

    it("devrait retourner null si fetch échoue et pas de cache", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });

      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        fetchImpl: mockFetch,
      });

      const result = await utils.loadTranslationsForLanguage("fr");
      expect(result).toBeNull();
    });

    it("devrait déclencher un refresh en arrière-plan si le cache est expiré", async () => {
      const mockStorage = createMockStorage();
      const expiredData = JSON.stringify({
        lang: "fr",
        version: "",
        savedAt: Date.now() - 999999999, // expiré
        translation: { old: "stale" },
      });
      mockStorage._store["posechrono-i18n-cache:fr"] = expiredData;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ fresh: "data" }),
      });

      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
        cacheStorage: mockStorage,
        cacheTtlMs: 1000,
        fetchImpl: mockFetch,
      });

      // Devrait retourner les données expirées immédiatement
      const result = await utils.loadTranslationsForLanguage("fr");
      expect(result).toEqual({ old: "stale" });
      // Le fetch de refresh devrait avoir été déclenché
      // (attendre un tick pour que le fire-and-forget resolve)
      await new Promise((r) => setTimeout(r, 50));
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("loadTranslations (full integration)", () => {
    it("devrait retourner false sans i18nextInstance", async () => {
      const utils = createI18nLoaderUtils({
        localeFileByLang: LOCALE_FILE_BY_LANG,
        baseLang: "en",
      });
      const result = await utils.loadTranslations();
      expect(result).toBe(false);
    });

    it("devrait initialiser i18next avec les traductions fetchées", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key: "value" }),
      });

      const mockI18next = {
        language: "en",
        isInitialized: false,
        init: vi.fn().mockResolvedValue(undefined),
      };

      const utils = createI18nLoaderUtils({
        localeFileByLang: { en: "en.json" },
        baseLang: "en",
        fetchImpl: mockFetch,
        i18nextInstance: mockI18next,
      });

      const result = await utils.loadTranslations();
      expect(result).toBe(true);
      expect(mockI18next.init).toHaveBeenCalledWith(
        expect.objectContaining({
          lng: "en",
          fallbackLng: "en",
          resources: expect.objectContaining({
            en: { translation: { key: "value" } },
          }),
        }),
      );
    });
  });
});
