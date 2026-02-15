#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(ROOT, "dist");
const DEFAULT_OUT_DIR = path.join(DIST_ROOT, "eagle-plugin");

// Keep this list explicit to avoid desktop/standalone pollution.
const REQUIRED_ENTRIES = [
  "manifest.json",
  "index.html",
  "logo.png",
  "_locales",
  "css",
  "js",
  "assets",
];

const OPTIONAL_ENTRIES = ["LICENSE", "README.md"];

function existsSyncSafe(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function copyRecursive(src, dest) {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src);
    for (const entry of entries) {
      const srcEntry = path.join(src, entry);
      const destEntry = path.join(dest, entry);
      await copyRecursive(srcEntry, destEntry);
    }
    return;
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
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

function bytesToHuman(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const missing = REQUIRED_ENTRIES.filter(
    (entry) => !existsSyncSafe(path.join(ROOT, entry)),
  );
  if (missing.length > 0) {
    console.error(
      `[release:eagle] Missing required entries: ${missing.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  let outDir = DEFAULT_OUT_DIR;
  try {
    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.mkdir(outDir, { recursive: true });
  } catch (err) {
    // Common on Windows if Eagle imported folder is still open/locked.
    const lockError =
      err && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES");
    if (!lockError) throw err;

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    outDir = path.join(DIST_ROOT, `eagle-plugin-${ts}`);
    await fsp.mkdir(outDir, { recursive: true });
    console.warn(
      `[release:eagle] '${DEFAULT_OUT_DIR}' is locked. Using fallback output: ${outDir}`,
    );
  }

  const copied = [];

  for (const entry of REQUIRED_ENTRIES) {
    const src = path.join(ROOT, entry);
    const dest = path.join(outDir, entry);
    await copyRecursive(src, dest);
    copied.push(entry);
  }

  for (const entry of OPTIONAL_ENTRIES) {
    const src = path.join(ROOT, entry);
    if (!existsSyncSafe(src)) continue;
    const dest = path.join(outDir, entry);
    await copyRecursive(src, dest);
    copied.push(entry);
  }

  const files = await listFilesRecursive(outDir);
  let totalBytes = 0;
  for (const file of files) {
    const stat = await fsp.stat(file);
    totalBytes += stat.size;
  }

  console.log("[release:eagle] Build complete");
  console.log(`[release:eagle] Output: ${outDir}`);
  console.log(`[release:eagle] Entries copied: ${copied.join(", ")}`);
  console.log(
    `[release:eagle] Files: ${files.length} | Size: ${bytesToHuman(totalBytes)}`,
  );
  console.log(
    "[release:eagle] Import this folder in Eagle: Developer Options > Import Local Project",
  );
}

main().catch((err) => {
  console.error("[release:eagle] Failed:", err);
  process.exitCode = 1;
});
