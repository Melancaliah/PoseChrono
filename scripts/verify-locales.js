#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "_locales");
const BASE_FILE = "en.json";

function flattenObject(obj, prefix = "", out = {}) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value, nextKey, out);
    } else {
      out[nextKey] = value;
    }
  }
  return out;
}

async function main() {
  const exists = fs.existsSync(LOCALES_DIR);
  if (!exists) {
    console.error(`[verify:locales] Missing folder: ${LOCALES_DIR}`);
    process.exitCode = 1;
    return;
  }

  const localeFiles = (await fsp.readdir(LOCALES_DIR))
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  if (localeFiles.length === 0) {
    console.error("[verify:locales] No locale JSON file found");
    process.exitCode = 1;
    return;
  }

  if (!localeFiles.includes(BASE_FILE)) {
    console.error(`[verify:locales] Missing base locale: ${BASE_FILE}`);
    process.exitCode = 1;
    return;
  }

  const parseErrors = [];
  const flattenedByFile = {};

  for (const file of localeFiles) {
    const fullPath = path.join(LOCALES_DIR, file);
    try {
      const raw = await fsp.readFile(fullPath, "utf8");
      const json = JSON.parse(raw);
      flattenedByFile[file] = flattenObject(json);
    } catch (err) {
      parseErrors.push(`${file}: ${err.message}`);
    }
  }

  if (parseErrors.length > 0) {
    console.error("[verify:locales] JSON parse error(s):");
    parseErrors.forEach((msg) => console.error(`  - ${msg}`));
    process.exitCode = 1;
    return;
  }

  const baseFlat = flattenedByFile[BASE_FILE];
  const baseKeys = Object.keys(baseFlat).sort((a, b) => a.localeCompare(b));
  const missingErrors = [];
  const extraWarnings = [];

  for (const file of localeFiles) {
    if (file === BASE_FILE) continue;
    const flat = flattenedByFile[file];
    const keys = Object.keys(flat);
    const keySet = new Set(keys);

    const missing = baseKeys.filter((key) => !keySet.has(key));
    if (missing.length > 0) {
      missingErrors.push(
        `${file}: ${missing.length} missing key(s) -> ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " ..." : ""}`,
      );
    }

    const baseSet = new Set(baseKeys);
    const extra = keys.filter((key) => !baseSet.has(key));
    if (extra.length > 0) {
      extraWarnings.push(
        `${file}: ${extra.length} extra key(s) -> ${extra.slice(0, 12).join(", ")}${extra.length > 12 ? " ..." : ""}`,
      );
    }
  }

  if (missingErrors.length > 0) {
    console.error("[verify:locales] FAILED (missing keys):");
    missingErrors.forEach((msg) => console.error(`  - ${msg}`));
    process.exitCode = 1;
    return;
  }

  console.log("[verify:locales] OK");
  console.log(
    `[verify:locales] Files: ${localeFiles.length} | Base keys (${BASE_FILE}): ${baseKeys.length}`,
  );

  if (extraWarnings.length > 0) {
    console.warn("[verify:locales] Warning (extra keys not present in base):");
    extraWarnings.forEach((msg) => console.warn(`  - ${msg}`));
  }
}

main().catch((err) => {
  console.error("[verify:locales] Failed:", err);
  process.exitCode = 1;
});

