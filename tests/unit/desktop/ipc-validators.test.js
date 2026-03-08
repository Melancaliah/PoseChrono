import { describe, it, expect } from "vitest";
import path from "path";

// Charger le module CommonJS via createRequire
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const validators = require("../../../apps/desktop/src/ipc-validators.js");

const {
  isPathAllowed,
  isValidStorageKey,
  sanitizeDialogOptions,
  isAllowedUpdateUrl,
  filterAllowedPaths,
  ALLOWED_MESSAGEBOX_KEYS,
  ALLOWED_OPEN_DIALOG_KEYS,
  ALLOWED_SAVE_DIALOG_KEYS,
} = validators;

describe("ipc-validators", () => {
  describe("isPathAllowed", () => {
    const allowedRoots = ["/home/user/data", "/media/photos"];

    it("devrait accepter un path sous un root autorisé", () => {
      expect(isPathAllowed("/home/user/data/file.txt", allowedRoots)).toBe(true);
      expect(isPathAllowed("/home/user/data/sub/deep/file.txt", allowedRoots)).toBe(true);
      expect(isPathAllowed("/media/photos/img.jpg", allowedRoots)).toBe(true);
    });

    it("devrait accepter le root lui-même", () => {
      expect(isPathAllowed("/home/user/data", allowedRoots)).toBe(true);
    });

    it("devrait rejeter un path hors des roots", () => {
      expect(isPathAllowed("/etc/passwd", allowedRoots)).toBe(false);
      expect(isPathAllowed("/home/user/other/file.txt", allowedRoots)).toBe(false);
    });

    it("devrait empêcher le prefix-matching partiel (databaz vs data)", () => {
      // /home/user/databaz ne devrait PAS matcher /home/user/data
      expect(isPathAllowed("/home/user/databaz/file.txt", allowedRoots)).toBe(false);
    });

    it("devrait rejeter les entrées invalides", () => {
      expect(isPathAllowed(null, allowedRoots)).toBe(false);
      expect(isPathAllowed("", allowedRoots)).toBe(false);
      expect(isPathAllowed(undefined, allowedRoots)).toBe(false);
    });

    it("devrait gérer un tableau de roots vide", () => {
      expect(isPathAllowed("/any/path", [])).toBe(false);
    });
  });

  describe("isValidStorageKey", () => {
    it("devrait accepter des clés valides", () => {
      expect(isValidStorageKey("session-mode")).toBe(true);
      expect(isValidStorageKey("user.settings")).toBe(true);
      expect(isValidStorageKey("timeline:data")).toBe(true);
      expect(isValidStorageKey("abc_123")).toBe(true);
    });

    it("devrait rejeter les clés vides ou non-string", () => {
      expect(isValidStorageKey("")).toBe(false);
      expect(isValidStorageKey(null)).toBe(false);
      expect(isValidStorageKey(undefined)).toBe(false);
      expect(isValidStorageKey(42)).toBe(false);
      expect(isValidStorageKey("   ")).toBe(false);
    });

    it("devrait rejeter les clés contenant '..'", () => {
      expect(isValidStorageKey("../secret")).toBe(false);
      expect(isValidStorageKey("path..traversal")).toBe(false);
    });

    it("devrait rejeter les clés trop longues", () => {
      const longKey = "a".repeat(201);
      expect(isValidStorageKey(longKey)).toBe(false);
      const okKey = "a".repeat(200);
      expect(isValidStorageKey(okKey)).toBe(true);
    });

    it("devrait rejeter les clés avec des caractères spéciaux", () => {
      expect(isValidStorageKey("key with spaces")).toBe(false);
      expect(isValidStorageKey("key/path")).toBe(false);
      expect(isValidStorageKey("key\\path")).toBe(false);
      expect(isValidStorageKey("<script>")).toBe(false);
    });
  });

  describe("sanitizeDialogOptions", () => {
    it("devrait filtrer les clés non autorisées", () => {
      const raw = {
        title: "Open",
        defaultPath: "/home",
        properties: ["openFile"],
        dangerous: "value",
        __proto__: "hack",
      };
      const safe = sanitizeDialogOptions(raw, ALLOWED_OPEN_DIALOG_KEYS);
      expect(safe).toEqual({
        title: "Open",
        defaultPath: "/home",
        properties: ["openFile"],
      });
      expect(safe.dangerous).toBeUndefined();
    });

    it("devrait retourner un objet vide pour null/undefined", () => {
      expect(sanitizeDialogOptions(null, ALLOWED_OPEN_DIALOG_KEYS)).toEqual({});
      expect(sanitizeDialogOptions(undefined, ALLOWED_OPEN_DIALOG_KEYS)).toEqual({});
    });

    it("devrait fonctionner avec les clés de messageBox", () => {
      const raw = { type: "info", title: "Test", message: "Hello", extra: "bad" };
      const safe = sanitizeDialogOptions(raw, ALLOWED_MESSAGEBOX_KEYS);
      expect(safe).toEqual({ type: "info", title: "Test", message: "Hello" });
    });

    it("devrait fonctionner avec les clés de saveDialog", () => {
      const raw = { title: "Save", filters: [], extra: "bad" };
      const safe = sanitizeDialogOptions(raw, ALLOWED_SAVE_DIALOG_KEYS);
      expect(safe).toEqual({ title: "Save", filters: [] });
    });
  });

  describe("isAllowedUpdateUrl", () => {
    it("devrait accepter les URLs GitHub valides", () => {
      expect(
        isAllowedUpdateUrl(
          "https://github.com/Melancaliah/PoseChrono/releases/download/v1.0.7/setup.exe",
        ),
      ).toBe(true);
      expect(
        isAllowedUpdateUrl(
          "https://objects.githubusercontent.com/something/release.exe",
        ),
      ).toBe(true);
    });

    it("devrait rejeter les URLs non-HTTPS", () => {
      expect(
        isAllowedUpdateUrl("http://github.com/some/release.exe"),
      ).toBe(false);
    });

    it("devrait rejeter les domaines non autorisés", () => {
      expect(isAllowedUpdateUrl("https://evil.com/malware.exe")).toBe(false);
      expect(isAllowedUpdateUrl("https://github.com.evil.com/file")).toBe(false);
    });

    it("devrait rejeter les entrées invalides", () => {
      expect(isAllowedUpdateUrl(null)).toBe(false);
      expect(isAllowedUpdateUrl("")).toBe(false);
      expect(isAllowedUpdateUrl("not-a-url")).toBe(false);
      expect(isAllowedUpdateUrl(42)).toBe(false);
    });
  });

  describe("filterAllowedPaths", () => {
    const allowedRoots = ["/media/photos"];

    it("devrait filtrer les chemins non autorisés", () => {
      const paths = ["/media/photos/a.jpg", "/etc/passwd", "/media/photos/b.png"];
      const result = filterAllowedPaths(paths, allowedRoots);
      expect(result).toHaveLength(2);
    });

    it("devrait retourner un tableau vide pour un input non-tableau", () => {
      expect(filterAllowedPaths(null, allowedRoots)).toEqual([]);
      expect(filterAllowedPaths("string", allowedRoots)).toEqual([]);
    });

    it("devrait filtrer les non-strings dans le tableau", () => {
      const paths = ["/media/photos/a.jpg", 42, null, "/media/photos/b.png"];
      const result = filterAllowedPaths(paths, allowedRoots);
      expect(result).toHaveLength(2);
    });
  });
});
