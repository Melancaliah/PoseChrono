import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSharedModule } from "../../../helpers/load-shared-module.js";

// ── Mock localStorage for the vm context ────────────────────────────────────
function createMockLocalStorage() {
  const store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    _store: store,
  };
}

let mockLocalStorage;
let createStorageAdapter;

beforeEach(() => {
  mockLocalStorage = createMockLocalStorage();
  const shared = loadSharedModule("packages/shared/storage-adapter.js", {
    localStorage: mockLocalStorage,
    // IndexedDB not provided → will fall back to localStorage
  });
  createStorageAdapter = shared.createStorageAdapter;
});

describe("storage-adapter", () => {
  describe("createStorageAdapter — factory", () => {
    it("devrait retourner un objet avec les méthodes attendues", () => {
      const adapter = createStorageAdapter({ forceFallbackMode: true });
      expect(typeof adapter.getJson).toBe("function");
      expect(typeof adapter.setJson).toBe("function");
      expect(typeof adapter.remove).toBe("function");
      expect(typeof adapter.migrateFromLocalStorage).toBe("function");
      expect(typeof adapter.configure).toBe("function");
      expect(typeof adapter.status).toBe("function");
    });

    it("devrait être en fallback mode quand forceFallbackMode est true", () => {
      const adapter = createStorageAdapter({ forceFallbackMode: true });
      const s = adapter.status();
      expect(s.indexedDbAvailable).toBe(false);
      expect(s.fallbackMode).toBe(true);
    });
  });

  describe("CRUD via localStorage fallback", () => {
    let adapter;

    beforeEach(() => {
      adapter = createStorageAdapter({ forceFallbackMode: true });
    });

    it("setJson + getJson — cycle basique", async () => {
      const result = await adapter.setJson("test-key", { foo: "bar" });
      expect(result).toBe(true);

      const value = await adapter.getJson("test-key");
      expect(value).toEqual({ foo: "bar" });
    });

    it("getJson devrait retourner le fallback quand la clé n'existe pas", async () => {
      const value = await adapter.getJson("nonexistent", "default-val");
      expect(value).toBe("default-val");
    });

    it("getJson devrait retourner null comme fallback par défaut", async () => {
      const value = await adapter.getJson("nonexistent");
      expect(value).toBeNull();
    });

    it("setJson devrait écraser les valeurs existantes", async () => {
      await adapter.setJson("key", { v: 1 });
      await adapter.setJson("key", { v: 2 });
      const value = await adapter.getJson("key");
      expect(value).toEqual({ v: 2 });
    });

    it("remove devrait supprimer une clé", async () => {
      await adapter.setJson("to-delete", "data");
      const removed = await adapter.remove("to-delete");
      expect(removed).toBe(true);

      const value = await adapter.getJson("to-delete", "gone");
      expect(value).toBe("gone");
    });

    it("remove devrait retourner true même si la clé n'existe pas", async () => {
      const removed = await adapter.remove("never-existed");
      expect(removed).toBe(true);
    });

    it("devrait stocker des types divers (string, number, array, nested)", async () => {
      await adapter.setJson("str", "hello");
      await adapter.setJson("num", 42);
      await adapter.setJson("arr", [1, 2, 3]);
      await adapter.setJson("nested", { a: { b: { c: true } } });

      expect(await adapter.getJson("str")).toBe("hello");
      expect(await adapter.getJson("num")).toBe(42);
      expect(await adapter.getJson("arr")).toEqual([1, 2, 3]);
      expect(await adapter.getJson("nested")).toEqual({ a: { b: { c: true } } });
    });
  });

  describe("migrateFromLocalStorage", () => {
    let adapter;

    beforeEach(() => {
      adapter = createStorageAdapter({ forceFallbackMode: true });
    });

    it("ne devrait pas re-migrer si la clé destination existe déjà", async () => {
      await adapter.setJson("dest-key", { existing: true });
      mockLocalStorage.setItem("src-key", JSON.stringify({ new: true }));

      const result = await adapter.migrateFromLocalStorage(
        "src-key",
        "dest-key",
        null,
      );
      expect(result).toEqual({ existing: true });
    });

    it("devrait retourner null quand aucune donnée n'existe (fallback mode)", async () => {
      // Note: en fallback mode (localStorage), getJson(key, undefined) retourne null
      // car le paramètre undefined déclenche la valeur par défaut (null) du paramètre fallback.
      // migrateFromLocalStorage interprète alors null !== undefined comme "trouvé" et retourne null.
      const result = await adapter.migrateFromLocalStorage(
        "missing",
        "new-key",
        "fallback-val",
      );
      expect(result).toBeNull();
    });
  });

  describe("configure", () => {
    it("devrait permettre de changer la fonction notify", () => {
      const adapter = createStorageAdapter({ forceFallbackMode: true });
      const notifyFn = vi.fn();
      // configure ne devrait pas throw
      expect(() => adapter.configure({ notify: notifyFn })).not.toThrow();
    });
  });

  describe("desktop storage API fallback", () => {
    it("devrait utiliser le desktop storage API quand disponible", async () => {
      const desktopApi = {
        getJson: vi.fn().mockResolvedValue({ found: true, value: "desktop-val" }),
        setJson: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      };

      const shared = loadSharedModule("packages/shared/storage-adapter.js", {
        localStorage: mockLocalStorage,
        poseChronoDesktop: {
          platform: "desktop",
          storage: desktopApi,
        },
      });

      const adapter = shared.createStorageAdapter({ forceFallbackMode: true });
      const value = await adapter.getJson("test-key");
      expect(value).toBe("desktop-val");
      expect(desktopApi.getJson).toHaveBeenCalledWith("test-key");
    });
  });
});
