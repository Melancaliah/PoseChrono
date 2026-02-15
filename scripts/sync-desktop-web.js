#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DESKTOP_ROOT = path.join(ROOT, "apps", "desktop");
const DESKTOP_WEB_DIR = path.join(DESKTOP_ROOT, "web");

const WEB_RUNTIME_ENTRIES = [
  "index.html",
  "manifest.json",
  "logo.png",
  "_locales",
  "css",
  "js",
  "assets",
  "LICENSE",
];

async function exists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fsp.copyFile(src, dest);
  } catch (err) {
    const lockError =
      err && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES");
    if (!lockError) throw err;
    if (await exists(dest)) {
      console.warn(
        `[desktop:sync-web] Skipped locked file (keeping existing): ${dest}`,
      );
      return;
    }
    throw err;
  }
}

async function main() {
  if (!(await exists(DESKTOP_ROOT))) {
    console.error(`[desktop:sync-web] Missing desktop folder: ${DESKTOP_ROOT}`);
    process.exitCode = 1;
    return;
  }

  await fsp.mkdir(DESKTOP_WEB_DIR, { recursive: true });

  for (const relPath of WEB_RUNTIME_ENTRIES) {
    const src = path.join(ROOT, relPath);
    if (!(await exists(src))) {
      throw new Error(`[desktop:sync-web] Missing runtime entry: ${relPath}`);
    }
    const dest = path.join(DESKTOP_WEB_DIR, relPath);
    await copyRecursive(src, dest);
  }

  console.log(`[desktop:sync-web] Synced runtime web files to: ${DESKTOP_WEB_DIR}`);
}

main().catch((err) => {
  console.error("[desktop:sync-web] Failed:", err);
  process.exitCode = 1;
});
