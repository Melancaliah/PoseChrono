(function initPoseChronoSharedStorageAdapter(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createStorageAdapter(options = {}) {
    const DB_NAME = "posechrono-storage";
    const DB_VERSION = 1;
    const STORE_NAME = "kv";
    const FALLBACK_PREFIX = "posechrono-db:";
    let openPromise = null;
    let indexedDbAvailable = true;
    let fallbackNotified = false;
    let notify = typeof options.notify === "function" ? options.notify : null;

    function configure(nextOptions = {}) {
      if (typeof nextOptions.notify === "function") {
        notify = nextOptions.notify;
      }
    }

    const i18nText = (key, fallback) => {
      try {
        if (
          typeof i18next !== "undefined" &&
          typeof i18next.t === "function"
        ) {
          return i18next.t(key, { defaultValue: fallback });
        }
      } catch (_) {}
      return fallback;
    };

    const notifyFallbackMode = () => {
      if (fallbackNotified) return;
      fallbackNotified = true;
      const message = i18nText(
        "storage.fallbackActive",
        "Storage fallback enabled: IndexedDB unavailable, using local storage.",
      );

      if (
        typeof globalObj.showPoseChronoToast === "function"
      ) {
        globalObj.showPoseChronoToast({
          type: "error",
          message,
          duration: 5000,
        });
        return;
      }

      if (typeof notify === "function") {
        notify({
          title: message,
          body: "",
          mute: false,
          duration: 5000,
        });
      }
    };

    const cloneValue = (value) => {
      try {
        if (typeof structuredClone === "function") {
          return structuredClone(value);
        }
      } catch (_) {}
      return JSON.parse(JSON.stringify(value));
    };

    const openDb = () => {
      if (openPromise) return openPromise;
      openPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("IndexedDB unavailable"));
          return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error || new Error("open db failed"));
      }).catch((error) => {
        console.warn(
          "[Storage] IndexedDB disabled, fallback localStorage:",
          error,
        );
        indexedDbAvailable = false;
        notifyFallbackMode();
        return null;
      });
      return openPromise;
    };

    const getFallbackKey = (key) => `${FALLBACK_PREFIX}${key}`;

    const withStore = async (mode, fn) => {
      const db = await openDb();
      if (!db) return null;
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, mode);
          const store = tx.objectStore(STORE_NAME);
          const req = fn(store);
          tx.oncomplete = () => resolve(req ? req.result : null);
          tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
          tx.onerror = () => reject(tx.error || new Error("transaction error"));
        } catch (e) {
          reject(e);
        }
      });
    };

    const getJson = async (key, fallback = null) => {
      try {
        const db = await openDb();
        if (!db) {
          try {
            const raw = localStorage.getItem(getFallbackKey(key));
            if (raw === null) return fallback;
            return JSON.parse(raw);
          } catch (_) {
            return fallback;
          }
        }
        const row = await withStore("readonly", (store) => store.get(key));
        if (!row || row.value === undefined || row.value === null) return fallback;
        return cloneValue(row.value);
      } catch (e) {
        console.warn("[Storage] getJson failed:", key, e);
        return fallback;
      }
    };

    const setJson = async (key, value) => {
      try {
        const db = await openDb();
        if (!db) {
          localStorage.setItem(
            getFallbackKey(key),
            JSON.stringify(cloneValue(value)),
          );
          return true;
        }
        const payload = {
          key,
          value: cloneValue(value),
          updatedAt: Date.now(),
        };
        await withStore("readwrite", (store) => store.put(payload));
        return true;
      } catch (e) {
        console.warn("[Storage] setJson failed:", key, e);
        return false;
      }
    };

    const remove = async (key) => {
      try {
        const db = await openDb();
        if (!db) {
          localStorage.removeItem(getFallbackKey(key));
          return true;
        }
        await withStore("readwrite", (store) => store.delete(key));
        return true;
      } catch (e) {
        console.warn("[Storage] remove failed:", key, e);
        return false;
      }
    };

    const migrateFromLocalStorage = async (
      localStorageKey,
      dbKey,
      fallback = null,
    ) => {
      const existing = await getJson(dbKey, undefined);
      if (existing !== undefined) return existing;

      let parsed = fallback;
      try {
        const raw = localStorage.getItem(localStorageKey);
        if (raw) parsed = JSON.parse(raw);
      } catch (e) {
        console.warn("[Storage] migration parse failed:", localStorageKey, e);
      }

      if (parsed !== undefined) {
        const written = await setJson(dbKey, parsed);
        if (written) {
          try {
            localStorage.removeItem(localStorageKey);
          } catch (_) {}
        }
      }
      return parsed;
    };

    return {
      getJson,
      setJson,
      remove,
      migrateFromLocalStorage,
      configure,
      status() {
        return {
          indexedDbAvailable,
          fallbackMode: !indexedDbAvailable,
        };
      },
    };
  }

  sharedRoot.createStorageAdapter = createStorageAdapter;
  globalObj.PoseChronoShared = sharedRoot;

  if (!globalObj.PoseChronoStorage) {
    globalObj.PoseChronoStorage = createStorageAdapter();
  }
})(typeof window !== "undefined" ? window : globalThis);

