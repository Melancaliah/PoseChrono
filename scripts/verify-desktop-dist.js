#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DIST_DIR = path.join(ROOT, "dist", "desktop-app");
const APP_DIR_REL = "app";

const REQUIRED_RELATIVE_FILES = [
  "app/package.json",
  "app/src/main.js",
  "app/src/preload.js",
  "app/src/renderer/index.html",
  "app/src/renderer/renderer.js",
  "app/web/index.html",
  "app/web/manifest.json",
  "app/web/GabContainer/gab-module.js",
  "app/web/js/plugin.js",
  "app/web/js/timeline.js",
  "app/web/packages/shared/preferences-core.js",
  "app/web/css/modals.css",
  "app/web/_locales/en.json",
];

const FORBIDDEN_RELATIVE_FILES = [
  "app/manifest.json",
  "app/index.html",
];

async function exists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function listFilesRecursive(baseDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        out.push(full);
      }
    }
  }
  await walk(baseDir);
  return out;
}

async function main() {
  const argDir = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : null;
  let distDir = argDir || DEFAULT_DIST_DIR;

  if (!argDir) {
    const distRoot = path.join(ROOT, "dist");
    if (await exists(distRoot)) {
      const entries = await fsp.readdir(distRoot, { withFileTypes: true });
      const names = entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            (entry.name === "desktop-app" ||
              entry.name.startsWith("desktop-app-")),
        )
        .map((entry) => entry.name);

      const timestamped = names
        .filter((name) => name.startsWith("desktop-app-"))
        .sort((a, b) => b.localeCompare(a));
      if (timestamped.length > 0) {
        distDir = path.join(distRoot, timestamped[0]);
      } else if (names.includes("desktop-app")) {
        distDir = path.join(distRoot, "desktop-app");
      }
    }
  }

  if (!(await exists(distDir))) {
    console.error(
      `[verify:desktop-dist] Missing folder: ${distDir}\nRun: node scripts/release-desktop.js`,
    );
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const appDir = path.join(distDir, APP_DIR_REL);
  if (!(await exists(appDir))) {
    errors.push(`Missing app folder: ${APP_DIR_REL}`);
  }

  for (const rel of REQUIRED_RELATIVE_FILES) {
    const full = path.join(distDir, rel);
    if (!(await exists(full))) {
      errors.push(`Missing required file: ${rel}`);
    }
  }

  for (const rel of FORBIDDEN_RELATIVE_FILES) {
    const full = path.join(distDir, rel);
    if (await exists(full)) {
      errors.push(`Forbidden file found in desktop dist: ${rel}`);
    }
  }

  const nodeModulesPath = path.join(distDir, "app", "node_modules");
  if (await exists(nodeModulesPath)) {
    errors.push("Forbidden folder found in desktop dist: app/node_modules");
  }

  const legacySharedPath = path.join(distDir, "app", "web", "js", "shared");
  if (await exists(legacySharedPath)) {
    errors.push("Forbidden folder found in desktop dist: app/web/js/shared");
  }

  if (errors.length > 0) {
    console.error("[verify:desktop-dist] FAILED");
    errors.forEach((msg) => console.error(`  - ${msg}`));
    process.exitCode = 1;
    return;
  }

  const files = await listFilesRecursive(distDir);
  console.log("[verify:desktop-dist] OK");
  console.log(`[verify:desktop-dist] Folder: ${distDir}`);
  console.log(`[verify:desktop-dist] Files: ${files.length}`);
}

main().catch((err) => {
  console.error("[verify:desktop-dist] Failed:", err);
  process.exitCode = 1;
});
