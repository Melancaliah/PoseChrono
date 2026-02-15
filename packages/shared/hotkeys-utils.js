(function initPoseChronoSharedHotkeysUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toSchemaVersion(value, fallback = 1) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(1, Math.round(num)) : fallback;
  }

  function toSet(input) {
    if (input instanceof Set) return new Set(input);
    if (Array.isArray(input)) return new Set(input);
    return new Set();
  }

  function createHotkeysUtils(options = {}) {
    const schemaVersion = toSchemaVersion(options.schemaVersion, 1);
    const defaultBindings =
      options.defaultBindings && typeof options.defaultBindings === "object"
        ? options.defaultBindings
        : {};
    const nonCustomizableKeys = toSet(options.nonCustomizableKeys);

    function normalizeHotkeysPayload(raw) {
      const sourceBindings =
        raw &&
        typeof raw === "object" &&
        raw.bindings &&
        typeof raw.bindings === "object"
          ? raw.bindings
          : raw && typeof raw === "object"
            ? raw
            : {};

      let repaired = false;
      const bindings = {};

      Object.keys(defaultBindings).forEach((key) => {
        if (nonCustomizableKeys.has(key)) return;
        if (!Object.prototype.hasOwnProperty.call(sourceBindings, key)) return;

        const rawValue = sourceBindings[key];
        if (typeof rawValue !== "string") {
          repaired = true;
          return;
        }
        const value = rawValue.trim();
        if (value.length === 0) {
          repaired = true;
          return;
        }
        if (value.length > 48) {
          repaired = true;
          bindings[key] = value.slice(0, 48);
          return;
        }
        bindings[key] = value;
      });

      const payload = {
        schemaVersion,
        bindings,
      };

      if (
        !raw ||
        typeof raw !== "object" ||
        raw.schemaVersion !== schemaVersion ||
        !raw.bindings
      ) {
        repaired = true;
      }

      return { payload, bindings, repaired };
    }

    function collectCustomBindings(currentBindings) {
      const source =
        currentBindings && typeof currentBindings === "object"
          ? currentBindings
          : {};
      const out = {};

      Object.keys(defaultBindings).forEach((key) => {
        if (nonCustomizableKeys.has(key)) return;
        if (!Object.prototype.hasOwnProperty.call(source, key)) return;
        if (source[key] === defaultBindings[key]) return;
        out[key] = source[key];
      });

      return out;
    }

    function countCustomBindings(currentBindings) {
      return Object.keys(collectCustomBindings(currentBindings)).length;
    }

    function normalizeForConflictCompare(value) {
      if (!value) return "";
      const text = String(value);
      if (text.includes("+")) return text;
      return text.toLowerCase();
    }

    function findHotkeyConflict(
      currentBindings,
      hotkeyName,
      newValue,
      options = {},
    ) {
      if (!newValue) return null;
      const source =
        currentBindings && typeof currentBindings === "object"
          ? currentBindings
          : {};
      const drawingPrefix = String(options.drawingPrefix || "DRAWING_");
      const isDrawingKey = String(hotkeyName || "").startsWith(drawingPrefix);
      const normalizedNew = normalizeForConflictCompare(newValue);

      for (const [key, value] of Object.entries(source)) {
        if (key === hotkeyName) continue;
        if (!value) continue;
        const normalizedExisting = normalizeForConflictCompare(value);
        if (normalizedExisting !== normalizedNew) continue;
        const isOtherDrawing = key.startsWith(drawingPrefix);
        if (isDrawingKey === isOtherDrawing) {
          return key;
        }
      }
      return null;
    }

    function formatHotkeyDisplay(hotkeyName, value, optionsArg = {}) {
      if (!value) return "";
      const options = optionsArg && typeof optionsArg === "object" ? optionsArg : {};
      const implicitModifiers =
        options.implicitModifiers && typeof options.implicitModifiers === "object"
          ? options.implicitModifiers
          : {};
      const raw = String(value);

      if (raw.includes("+")) {
        return raw.split("+").join(" + ");
      }

      const parts = [];
      const implicitMod = implicitModifiers[hotkeyName];
      if (implicitMod) {
        parts.push(String(implicitMod));
      }

      if (
        !implicitMod &&
        raw.length === 1 &&
        raw >= "A" &&
        raw <= "Z"
      ) {
        parts.push("Shift");
      }

      parts.push(raw.length === 1 ? raw.toUpperCase() : raw);
      return parts.join(" + ");
    }

    function resetBindingsToDefaults(targetBindings) {
      if (!targetBindings || typeof targetBindings !== "object") return targetBindings;
      Object.keys(defaultBindings).forEach((key) => {
        targetBindings[key] = defaultBindings[key];
      });
      return targetBindings;
    }

    function enforceNonCustomizableBindings(targetBindings) {
      if (!targetBindings || typeof targetBindings !== "object") return targetBindings;
      nonCustomizableKeys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(defaultBindings, key)) return;
        targetBindings[key] = defaultBindings[key];
      });
      return targetBindings;
    }

    function applyCustomBindings(targetBindings, customBindings, optionsArg = {}) {
      if (!targetBindings || typeof targetBindings !== "object") return targetBindings;
      const options = optionsArg && typeof optionsArg === "object" ? optionsArg : {};
      const resetFirst = !!options.resetToDefaults;
      const enforceAfter =
        options.enforceNonCustomizable === undefined
          ? true
          : !!options.enforceNonCustomizable;
      const requireTargetKey =
        options.requireTargetKey === undefined ? true : !!options.requireTargetKey;
      const source =
        customBindings && typeof customBindings === "object" ? customBindings : {};

      if (resetFirst) {
        resetBindingsToDefaults(targetBindings);
      }

      Object.keys(source).forEach((key) => {
        if (nonCustomizableKeys.has(key)) return;
        if (!Object.prototype.hasOwnProperty.call(defaultBindings, key)) return;
        if (
          requireTargetKey &&
          !Object.prototype.hasOwnProperty.call(targetBindings, key)
        ) {
          return;
        }
        targetBindings[key] = source[key];
      });

      if (enforceAfter) {
        enforceNonCustomizableBindings(targetBindings);
      }
      return targetBindings;
    }

    return {
      normalizeHotkeysPayload,
      collectCustomBindings,
      countCustomBindings,
      normalizeForConflictCompare,
      findHotkeyConflict,
      formatHotkeyDisplay,
      resetBindingsToDefaults,
      enforceNonCustomizableBindings,
      applyCustomBindings,
    };
  }

  sharedRoot.createHotkeysUtils = createHotkeysUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
