(function initI18nextLite(globalScope) {
  "use strict";

  if (
    globalScope &&
    globalScope.i18next &&
    typeof globalScope.i18next.t === "function"
  ) {
    return;
  }

  const store = {};
  let currentLanguage = "en";

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function deepMerge(target, source, overwrite) {
    if (!isObject(target) || !isObject(source)) return target;
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (isObject(sourceValue)) {
        if (!isObject(targetValue)) {
          target[key] = {};
        }
        deepMerge(target[key], sourceValue, overwrite);
        return;
      }
      if (overwrite || typeof target[key] === "undefined") {
        target[key] = sourceValue;
      }
    });
    return target;
  }

  function getByPath(obj, path) {
    if (!isObject(obj) || !path) return undefined;
    const segments = String(path).split(".");
    let node = obj;
    for (const segment of segments) {
      if (!isObject(node) && !Array.isArray(node)) return undefined;
      node = node[segment];
      if (typeof node === "undefined") return undefined;
    }
    return node;
  }

  function interpolate(text, vars) {
    if (typeof text !== "string") return text;
    if (!vars || typeof vars !== "object") return text;
    return text.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => {
      const value = vars[key];
      return value == null ? "" : String(value);
    });
  }

  function getActiveResources() {
    return store[currentLanguage] || {};
  }

  const api = {
    language: currentLanguage,
    isInitialized: false,
    options: {},
    async init(options = {}) {
      this.options = options;
      currentLanguage = options.lng || currentLanguage || "en";
      this.language = currentLanguage;

      const resources = options.resources || {};
      Object.keys(resources).forEach((lang) => {
        const translation = resources[lang]?.translation;
        if (isObject(translation)) {
          if (!store[lang]) store[lang] = {};
          deepMerge(store[lang], translation, true);
        }
      });

      this.isInitialized = true;
      return this;
    },
    addResourceBundle(lang, ns, data, deep = true, overwrite = true) {
      if (ns !== "translation" || !isObject(data)) return;
      if (!store[lang]) store[lang] = {};
      if (deep) {
        deepMerge(store[lang], data, overwrite);
      } else if (overwrite || !store[lang]) {
        store[lang] = { ...data };
      }
    },
    changeLanguage(lang) {
      if (typeof lang === "string" && lang.trim()) {
        currentLanguage = lang.trim();
        this.language = currentLanguage;
      }
      return Promise.resolve(this.language);
    },
    t(key, options = {}) {
      const active = getActiveResources();
      let value = getByPath(active, key);

      if (typeof value === "undefined") {
        const fallbackLng = this.options?.fallbackLng;
        if (typeof fallbackLng === "string" && store[fallbackLng]) {
          value = getByPath(store[fallbackLng], key);
        }
      }

      if (typeof value === "undefined") {
        if (Object.prototype.hasOwnProperty.call(options, "defaultValue")) {
          value = options.defaultValue;
        } else {
          return key;
        }
      }

      if (options && options.returnObjects === true) {
        return value;
      }

      return interpolate(value, options);
    },
  };

  globalScope.i18next = api;
})(
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);

