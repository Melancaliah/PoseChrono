(function initPoseChronoSharedUIPreferences(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createUIPreferences(options = {}) {
    const storage =
      options.storage ||
      (typeof localStorage !== "undefined" ? localStorage : null);

    const storageKey = String(options.storageKey || "posechrono-ui-prefs");
    const schemaVersion = Number(options.schemaVersion || 1);

    const legacyKeys = options.legacyKeys || {};
    const legacyDefaultSessionModeStorageKey = String(
      options.legacyDefaultSessionModeStorageKey || "posechrono-default-session-mode",
    );

    const normalizeSessionModeValue =
      typeof options.normalizeSessionModeValue === "function"
        ? options.normalizeSessionModeValue
        : (value, fallback = "classique") => {
            const modes = new Set(["classique", "custom", "relax", "memory"]);
            const normalized = String(value ?? "")
              .trim()
              .toLowerCase();
            const fallbackNormalized = String(fallback ?? "classique")
              .trim()
              .toLowerCase();
            return modes.has(normalized)
              ? normalized
              : modes.has(fallbackNormalized)
                ? fallbackNormalized
                : "classique";
          };

    const normalizeStringArray =
      typeof options.normalizeStringArray === "function"
        ? options.normalizeStringArray
        : (input) => {
            if (!Array.isArray(input)) return [];
            const seen = new Set();
            const out = [];
            input.forEach((entry) => {
              if (typeof entry !== "string") return;
              const key = entry.trim();
              if (!key || seen.has(key)) return;
              seen.add(key);
              out.push(key);
            });
            return out;
          };

    const defaultsInput = options.defaults || {};
    const BASE_DEFAULT_GRID_ENABLED = !!defaultsInput.backgroundGridEnabled;
    const BASE_DEFAULT_TITLEBAR_ALWAYS_VISIBLE =
      !!defaultsInput.titlebarAlwaysVisible;
    const BASE_DEFAULT_SESSION_MODE = normalizeSessionModeValue(
      defaultsInput.defaultSessionMode,
      "classique",
    );
    const BASE_DEFAULT_REVIEW_DURATIONS_VISIBLE =
      defaultsInput.reviewDurationsVisible !== false;
    const BASE_DEFAULT_HOTKEYS_COLLAPSED = normalizeStringArray(
      defaultsInput.hotkeysCollapsedCategories,
    );
    const BASE_DEFAULT_GLOBAL_SETTINGS_COLLAPSED = normalizeStringArray(
      defaultsInput.globalSettingsCollapsedCategories?.length
        ? defaultsInput.globalSettingsCollapsedCategories
        : ["maintenance"],
    );

    const getDefaultPrefs = () => ({
      schemaVersion,
      backgroundGridEnabled: BASE_DEFAULT_GRID_ENABLED,
      titlebarAlwaysVisible: BASE_DEFAULT_TITLEBAR_ALWAYS_VISIBLE,
      defaultSessionMode: BASE_DEFAULT_SESSION_MODE,
      reviewDurationsVisible: BASE_DEFAULT_REVIEW_DURATIONS_VISIBLE,
      hotkeysCollapsedCategories: BASE_DEFAULT_HOTKEYS_COLLAPSED,
      globalSettingsCollapsedCategories: BASE_DEFAULT_GLOBAL_SETTINGS_COLLAPSED,
    });

    let cache = null;

    const persist = () => {
      if (!cache || !storage) return;
      try {
        storage.setItem(storageKey, JSON.stringify(cache));
      } catch (_) {}
    };

    const load = () => {
      if (cache) return cache;

      const defaults = getDefaultPrefs();
      let parsed = {};
      let changed = false;

      if (storage) {
        try {
          const raw = storage.getItem(storageKey);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object") {
              parsed = obj;
            }
          }
        } catch (_) {
          changed = true;
        }
      }

      cache = {
        ...defaults,
        ...parsed,
        schemaVersion,
      };

      cache.backgroundGridEnabled = !!cache.backgroundGridEnabled;
      cache.titlebarAlwaysVisible = !!cache.titlebarAlwaysVisible;
      cache.reviewDurationsVisible = cache.reviewDurationsVisible !== false;
      cache.defaultSessionMode = normalizeSessionModeValue(
        cache.defaultSessionMode,
        defaults.defaultSessionMode,
      );
      cache.hotkeysCollapsedCategories = normalizeStringArray(
        cache.hotkeysCollapsedCategories,
      );
      cache.globalSettingsCollapsedCategories = normalizeStringArray(
        cache.globalSettingsCollapsedCategories,
      );

      if (
        !Object.prototype.hasOwnProperty.call(parsed, "reviewDurationsVisible")
      ) {
        try {
          if (storage && legacyKeys.REVIEW_DURATIONS_VISIBLE) {
            const raw = storage.getItem(legacyKeys.REVIEW_DURATIONS_VISIBLE);
            if (raw !== null) {
              cache.reviewDurationsVisible = raw !== "0";
              changed = true;
              storage.removeItem(legacyKeys.REVIEW_DURATIONS_VISIBLE);
            }
          }
        } catch (_) {}
      }

      if (
        !Object.prototype.hasOwnProperty.call(
          parsed,
          "globalSettingsCollapsedCategories",
        )
      ) {
        try {
          if (storage && legacyKeys.GLOBAL_SETTINGS_COLLAPSED) {
            const raw = storage.getItem(legacyKeys.GLOBAL_SETTINGS_COLLAPSED);
            if (raw) {
              cache.globalSettingsCollapsedCategories = normalizeStringArray(
                JSON.parse(raw),
              );
              changed = true;
              storage.removeItem(legacyKeys.GLOBAL_SETTINGS_COLLAPSED);
            }
          }
        } catch (_) {}
      }

      if (!Object.prototype.hasOwnProperty.call(parsed, "defaultSessionMode")) {
        try {
          if (storage) {
            const raw = storage.getItem(legacyDefaultSessionModeStorageKey);
            if (raw) {
              cache.defaultSessionMode = normalizeSessionModeValue(
                raw,
                defaults.defaultSessionMode,
              );
              changed = true;
              storage.removeItem(legacyDefaultSessionModeStorageKey);
            }
          }
        } catch (_) {}
      }

      if (changed) persist();
      return cache;
    };

    const sanitizeByKey = (key, value) => {
      switch (key) {
        case "backgroundGridEnabled":
        case "titlebarAlwaysVisible":
        case "reviewDurationsVisible":
          return !!value;
        case "defaultSessionMode":
          return normalizeSessionModeValue(value, BASE_DEFAULT_SESSION_MODE);
        case "hotkeysCollapsedCategories":
        case "globalSettingsCollapsedCategories":
          return normalizeStringArray(value);
        default:
          return value;
      }
    };

    return {
      init() {
        return load();
      },
      get(key, fallback = undefined) {
        const prefs = load();
        return Object.prototype.hasOwnProperty.call(prefs, key)
          ? prefs[key]
          : fallback;
      },
      set(key, value, optionsArg = {}) {
        const { persist: shouldPersist = true } = optionsArg || {};
        const prefs = load();
        prefs[key] = sanitizeByKey(key, value);
        if (shouldPersist) persist();
        return prefs[key];
      },
      getStringArray(key) {
        return normalizeStringArray(this.get(key, []));
      },
      setStringArray(key, value, optionsArg = {}) {
        return this.set(key, normalizeStringArray(value), optionsArg);
      },
      exportData() {
        const prefs = load();
        return {
          schemaVersion,
          backgroundGridEnabled: !!prefs.backgroundGridEnabled,
          titlebarAlwaysVisible: !!prefs.titlebarAlwaysVisible,
          defaultSessionMode: normalizeSessionModeValue(
            prefs.defaultSessionMode,
            BASE_DEFAULT_SESSION_MODE,
          ),
          reviewDurationsVisible: !!prefs.reviewDurationsVisible,
          hotkeysCollapsedCategories: normalizeStringArray(
            prefs.hotkeysCollapsedCategories,
          ),
          globalSettingsCollapsedCategories: normalizeStringArray(
            prefs.globalSettingsCollapsedCategories,
          ),
        };
      },
      importData(data, optionsArg = {}) {
        if (!data || typeof data !== "object") return false;
        const { persist: shouldPersist = true } = optionsArg || {};
        const prefs = load();
        const knownKeys = [
          "backgroundGridEnabled",
          "titlebarAlwaysVisible",
          "defaultSessionMode",
          "reviewDurationsVisible",
          "hotkeysCollapsedCategories",
          "globalSettingsCollapsedCategories",
        ];
        let changed = false;
        knownKeys.forEach((key) => {
          if (!Object.prototype.hasOwnProperty.call(data, key)) return;
          prefs[key] = sanitizeByKey(key, data[key]);
          changed = true;
        });
        if (changed && shouldPersist) persist();
        return changed;
      },
      resetVisualPrefs() {
        cache = getDefaultPrefs();
        persist();
        return this.exportData();
      },
    };
  }

  sharedRoot.createUIPreferences = createUIPreferences;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

