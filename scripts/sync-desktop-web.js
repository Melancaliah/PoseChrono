#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DESKTOP_ROOT = path.join(ROOT, "apps", "desktop");
const DESKTOP_WEB_DIR = path.join(DESKTOP_ROOT, "web");

const WEB_RUNTIME_ENTRIES = [
  "index.html",
  "manifest.json",
  "logo.png",
  "GabContainer",
  "_locales",
  "css",
  "js",
  "packages",
  "assets",
  "LICENSE",
];

function runNodeScriptOrThrow(relPath, args = []) {
  const scriptPath = path.join(ROOT, relPath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`[desktop:sync-web] Failed running ${relPath}`);
  }
}

async function exists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function copyRecursive(src, dest) {
  const relFromRoot = path.relative(ROOT, src).split(path.sep).join("/");
  if (relFromRoot === "js/shared" || relFromRoot.startsWith("js/shared/")) {
    return;
  }

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
  runNodeScriptOrThrow("scripts/build-shared-bundle.js");

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

  // Runtime now loads shared modules from packages/shared.
  // Ensure legacy js/shared does not persist from previous syncs.
  const legacySharedDir = path.join(DESKTOP_WEB_DIR, "js", "shared");
  await fsp.rm(legacySharedDir, { recursive: true, force: true });

  console.log(`[desktop:sync-web] Synced runtime web files to: ${DESKTOP_WEB_DIR}`);
}

main().catch((err) => {
  console.error("[desktop:sync-web] Failed:", err);
  process.exitCode = 1;
});
