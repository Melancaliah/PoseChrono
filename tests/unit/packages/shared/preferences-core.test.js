import { describe, it, expect } from "vitest";
import { loadSharedModule } from "../../../helpers/load-shared-module.js";

const shared = loadSharedModule("packages/shared/preferences-core.js");
const prefs = shared.prefs;

describe("preferences-core", () => {
  describe("SESSION_MODES", () => {
    it("devrait contenir les 4 modes", () => {
      expect(prefs.SESSION_MODES).toEqual([
        "classique",
        "custom",
        "relax",
        "memory",
      ]);
    });

    it("devrait être un tableau distinct de l'original (copie)", () => {
      prefs.SESSION_MODES.push("test");
      // Recharger pour vérifier l'immutabilité
      const fresh = loadSharedModule("packages/shared/preferences-core.js");
      expect(fresh.prefs.SESSION_MODES).toHaveLength(4);
    });
  });

  describe("normalizeSessionModeValue", () => {
    it("devrait accepter les modes valides", () => {
      expect(prefs.normalizeSessionModeValue("classique")).toBe("classique");
      expect(prefs.normalizeSessionModeValue("custom")).toBe("custom");
      expect(prefs.normalizeSessionModeValue("relax")).toBe("relax");
      expect(prefs.normalizeSessionModeValue("memory")).toBe("memory");
    });

    it("devrait normaliser la casse", () => {
      expect(prefs.normalizeSessionModeValue("CLASSIQUE")).toBe("classique");
      expect(prefs.normalizeSessionModeValue("Custom")).toBe("custom");
      expect(prefs.normalizeSessionModeValue("  relax  ")).toBe("relax");
    });

    it("devrait retourner le fallback pour les valeurs invalides", () => {
      expect(prefs.normalizeSessionModeValue("invalid")).toBe("classique");
      expect(prefs.normalizeSessionModeValue("")).toBe("classique");
      expect(prefs.normalizeSessionModeValue(null)).toBe("classique");
      expect(prefs.normalizeSessionModeValue(undefined)).toBe("classique");
      expect(prefs.normalizeSessionModeValue(42)).toBe("classique");
    });

    it("devrait respecter le fallback personnalisé", () => {
      expect(prefs.normalizeSessionModeValue("invalid", "relax")).toBe(
        "relax",
      );
      expect(prefs.normalizeSessionModeValue("invalid", "memory")).toBe(
        "memory",
      );
    });

    it("devrait fallback sur classique si le fallback est aussi invalide", () => {
      expect(prefs.normalizeSessionModeValue("bad", "worse")).toBe(
        "classique",
      );
    });
  });

  describe("normalizeStringArray", () => {
    it("devrait retourner un tableau filtré et dédupliqué", () => {
      expect(prefs.normalizeStringArray(["a", "b", "c"])).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    it("devrait supprimer les doublons", () => {
      expect(prefs.normalizeStringArray(["a", "b", "a", "c", "b"])).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    it("devrait filtrer les non-strings", () => {
      expect(prefs.normalizeStringArray(["a", 42, null, "b", undefined])).toEqual([
        "a",
        "b",
      ]);
    });

    it("devrait filtrer les strings vides", () => {
      expect(prefs.normalizeStringArray(["a", "", "  ", "b"])).toEqual([
        "a",
        "b",
      ]);
    });

    it("devrait retourner un tableau vide pour les non-tableaux", () => {
      expect(prefs.normalizeStringArray(null)).toEqual([]);
      expect(prefs.normalizeStringArray(undefined)).toEqual([]);
      expect(prefs.normalizeStringArray("string")).toEqual([]);
      expect(prefs.normalizeStringArray(42)).toEqual([]);
    });
  });

  describe("createDefaultSessionModeUtils", () => {
    it("devrait créer un objet avec load et save", () => {
      const utils = prefs.createDefaultSessionModeUtils();
      expect(typeof utils.load).toBe("function");
      expect(typeof utils.save).toBe("function");
    });

    it("load() devrait retourner le fallback par défaut quand getValue retourne undefined", () => {
      const utils = prefs.createDefaultSessionModeUtils({
        getValue: () => undefined,
      });
      expect(utils.load()).toBe("classique");
      expect(utils.load("relax")).toBe("relax");
    });

    it("load() devrait normaliser la valeur retournée par getValue", () => {
      const utils = prefs.createDefaultSessionModeUtils({
        getValue: () => "custom",
      });
      expect(utils.load()).toBe("custom");
    });

    it("load() devrait retourner le fallback si getValue lance une erreur", () => {
      const utils = prefs.createDefaultSessionModeUtils({
        getValue: () => {
          throw new Error("boom");
        },
      });
      expect(utils.load()).toBe("classique");
    });

    it("save() devrait normaliser et persister via setValue", () => {
      let stored = null;
      const utils = prefs.createDefaultSessionModeUtils({
        setValue: (v) => {
          stored = v;
        },
      });
      const result = utils.save("memory");
      expect(result).toBe("memory");
      expect(stored).toBe("memory");
    });

    it("save() devrait normaliser les valeurs invalides", () => {
      let stored = null;
      const utils = prefs.createDefaultSessionModeUtils({
        setValue: (v) => {
          stored = v;
        },
      });
      const result = utils.save("invalid");
      expect(result).toBe("classique");
      expect(stored).toBe("classique");
    });

    it("save() devrait fonctionner sans setValue (persist=false)", () => {
      const utils = prefs.createDefaultSessionModeUtils();
      const result = utils.save("relax", false);
      expect(result).toBe("relax");
    });
  });
});
