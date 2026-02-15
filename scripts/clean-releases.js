#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ROOT_DIST = path.join(ROOT, "dist");
const DESKTOP_DIST = path.join(ROOT, "apps", "desktop", "dist");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const DESKTOP_PACKAGE_PATH = path.join(ROOT, "apps", "desktop", "package.json");

async function exists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function removePath(targetPath, removed, skipped, dryRun) {
  if (!(await exists(targetPath))) return;
  if (!dryRun) {
    try {
      await fsp.rm(targetPath, { recursive: true, force: true });
    } catch (err) {
      const lockError =
        err && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES");
      if (lockError) {
        console.warn(`[clean-releases] Skipped locked path: ${targetPath}`);
        skipped.push(targetPath);
        return;
      }
      throw err;
    }
  }
  removed.push(targetPath);
}

async function cleanRootDist(removed, skipped, dryRun) {
  if (!(await exists(ROOT_DIST))) return;
  const entries = await fsp.readdir(ROOT_DIST, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (
      name.startsWith("eagle-plugin-") ||
      name.startsWith("desktop-app-") ||
      name.startsWith("windows-")
    ) {
      await removePath(path.join(ROOT_DIST, name), removed, skipped, dryRun);
    }
  }
}

async function cleanDesktopDist(currentVersion, removed, skipped, dryRun) {
  if (!(await exists(DESKTOP_DIST))) return;
  const entries = await fsp.readdir(DESKTOP_DIST, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(DESKTOP_DIST, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "win-unpacked") {
        await removePath(fullPath, removed, skipped, dryRun);
      }
      continue;
    }

    if (/^PoseChrono-Setup-.*\.exe$/i.test(entry.name)) {
      const currentSetupName = `PoseChrono-Setup-${currentVersion}.exe`;
      if (entry.name !== currentSetupName) {
        await removePath(fullPath, removed, skipped, dryRun);
      }
      continue;
    }

    if (/^PoseChrono-Setup-.*\.exe\.blockmap$/i.test(entry.name)) {
      const currentBlockmapName = `PoseChrono-Setup-${currentVersion}.exe.blockmap`;
      if (entry.name !== currentBlockmapName) {
        await removePath(fullPath, removed, skipped, dryRun);
      }
      continue;
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const manifest = await readJson(MANIFEST_PATH);
  const desktopPkg = await readJson(DESKTOP_PACKAGE_PATH);
  const currentVersion = String(desktopPkg.version || manifest.version || "").trim();

  if (!currentVersion) {
    throw new Error("Could not determine current version.");
  }

  const removed = [];
  const skipped = [];
  await cleanRootDist(removed, skipped, dryRun);
  await cleanDesktopDist(currentVersion, removed, skipped, dryRun);

  if (removed.length === 0 && skipped.length === 0) {
    console.log("[clean-releases] Nothing to remove.");
    return;
  }

  if (removed.length > 0) {
    console.log(`[clean-releases] ${dryRun ? "Would remove" : "Removed"} ${removed.length} paths:`);
    removed.forEach((p) => console.log(`  - ${p}`));
  }
  if (skipped.length > 0) {
    console.log(`[clean-releases] Skipped locked paths: ${skipped.length}`);
    skipped.forEach((p) => console.log(`  - ${p}`));
  }
}

main().catch((err) => {
  console.error("[clean-releases] Failed:", err.message || err);
  process.exitCode = 1;
});
