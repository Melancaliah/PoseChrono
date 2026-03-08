/**
 * IPC Input Validation — Sécurisation des handlers IPC Electron.
 *
 * Valide les entrées du renderer avant traitement dans le main process.
 * Empêche l'accès fichier arbitraire, l'écriture hors périmètre,
 * et le téléchargement depuis des domaines non autorisés.
 */

"use strict";

const path = require("path");

// ================================================================
// PATH VALIDATION
// ================================================================

/**
 * Vérifie qu'un chemin résolu est contenu dans l'un des dossiers autorisés.
 * @param {string} resolvedPath - Chemin absolu résolu (via path.resolve)
 * @param {string[]} allowedRoots - Liste de dossiers racine autorisés
 * @returns {boolean}
 */
function isPathAllowed(resolvedPath, allowedRoots) {
  if (!resolvedPath || typeof resolvedPath !== "string") return false;
  const normalized = path.resolve(resolvedPath);
  return allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    // Le path doit être sous le dossier root (avec séparateur pour éviter /foo/bar matches /foo/barbaz)
    return (
      normalized === normalizedRoot ||
      normalized.startsWith(normalizedRoot + path.sep)
    );
  });
}

// ================================================================
// KEY VALIDATION (storage / preferences)
// ================================================================

const MAX_STORAGE_KEY_LENGTH = 200;
const STORAGE_KEY_PATTERN = /^[\w\-.:]+$/; // alphanumérique, tirets, points, deux-points

/**
 * Vérifie qu'une clé storage/preferences est valide.
 * @param {*} key
 * @returns {boolean}
 */
function isValidStorageKey(key) {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > MAX_STORAGE_KEY_LENGTH) return false;
  if (trimmed.includes("..")) return false; // anti-traversal
  return STORAGE_KEY_PATTERN.test(trimmed);
}

// ================================================================
// DIALOG OPTIONS SANITIZATION
// ================================================================

const ALLOWED_MESSAGEBOX_KEYS = new Set([
  "type",
  "title",
  "message",
  "detail",
  "buttons",
  "defaultId",
  "cancelId",
  "noLink",
  "checkboxLabel",
  "checkboxChecked",
]);

const ALLOWED_OPEN_DIALOG_KEYS = new Set([
  "title",
  "defaultPath",
  "buttonLabel",
  "filters",
  "properties",
  "message",
]);

const ALLOWED_SAVE_DIALOG_KEYS = new Set([
  "title",
  "defaultPath",
  "buttonLabel",
  "filters",
  "message",
  "nameFieldLabel",
  "showsTagField",
]);

/**
 * Filtre un objet d'options pour ne garder que les clés autorisées.
 * @param {Object} options - Options brutes du renderer
 * @param {Set<string>} allowedKeys - Clés autorisées
 * @returns {Object}
 */
function sanitizeDialogOptions(options, allowedKeys) {
  if (!options || typeof options !== "object") return {};
  const out = {};
  for (const key of Object.keys(options)) {
    if (allowedKeys.has(key)) {
      out[key] = options[key];
    }
  }
  return out;
}

// ================================================================
// UPDATE URL VALIDATION
// ================================================================

const ALLOWED_UPDATE_DOMAINS = [
  "github.com",
  "objects.githubusercontent.com",
  "github-releases.githubusercontent.com",
];

/**
 * Vérifie qu'une URL de mise à jour provient d'un domaine autorisé.
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedUpdateUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_UPDATE_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain ||
        parsed.hostname.endsWith("." + domain),
    );
  } catch (_) {
    return false;
  }
}

// ================================================================
// CLIPBOARD PATH VALIDATION
// ================================================================

/**
 * Filtre un tableau de chemins pour ne garder que ceux dans les dossiers autorisés.
 * @param {string[]} paths
 * @param {string[]} allowedRoots
 * @returns {string[]}
 */
function filterAllowedPaths(paths, allowedRoots) {
  if (!Array.isArray(paths)) return [];
  return paths.filter(
    (p) =>
      typeof p === "string" &&
      p.trim() &&
      isPathAllowed(path.resolve(p), allowedRoots),
  );
}

module.exports = {
  isPathAllowed,
  isValidStorageKey,
  sanitizeDialogOptions,
  isAllowedUpdateUrl,
  filterAllowedPaths,
  ALLOWED_MESSAGEBOX_KEYS,
  ALLOWED_OPEN_DIALOG_KEYS,
  ALLOWED_SAVE_DIALOG_KEYS,
  MAX_STORAGE_KEY_LENGTH,
};
