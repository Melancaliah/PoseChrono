/**
 * Helper pour charger les modules IIFE de packages/shared/ dans un environnement de test.
 *
 * Les modules shared utilisent le pattern :
 *   (function initXxx(globalScope) { ... globalScope.PoseChronoShared.xxx = { ... }; })(window || globalThis);
 *
 * Ce helper crée un faux `window` global et exécute le code du module dedans,
 * puis retourne les exports depuis `window.PoseChronoShared`.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";

const ROOT = resolve(import.meta.dirname, "..", "..");

/**
 * Charge un module IIFE shared et retourne PoseChronoShared.
 * @param {string} relativePath - Chemin relatif depuis la racine du projet (ex: "packages/shared/preferences-core.js")
 * @param {Object} [extraGlobals={}] - Objets supplémentaires à injecter dans le scope global
 * @returns {Object} L'objet PoseChronoShared tel que modifié par le module
 */
export function loadSharedModule(relativePath, extraGlobals = {}) {
  const filePath = resolve(ROOT, relativePath);
  const code = readFileSync(filePath, "utf8");

  // Créer un contexte simulant un environnement navigateur minimal
  const fakeWindow = {
    PoseChronoShared: {},
    ...extraGlobals,
  };
  fakeWindow.window = fakeWindow;
  fakeWindow.globalThis = fakeWindow;

  const context = vm.createContext(fakeWindow);
  vm.runInContext(code, context, { filename: filePath });

  return fakeWindow.PoseChronoShared;
}

/**
 * Version spécialisée pour charger une seule clé de PoseChronoShared.
 * @param {string} relativePath
 * @param {string} key - Ex: "prefs", "i18nLoaderUtils", "storageAdapter"
 * @param {Object} [extraGlobals={}]
 * @returns {Object} Le sous-objet demandé
 */
export function loadSharedModuleKey(relativePath, key, extraGlobals = {}) {
  const shared = loadSharedModule(relativePath, extraGlobals);
  return shared[key];
}
