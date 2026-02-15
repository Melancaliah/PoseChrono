#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(ROOT, "dist");
const DEFAULT_OUT_DIR = path.join(DIST_ROOT, "desktop-app");
const DESKTOP_APP_DIR = path.join(ROOT, "apps", "desktop");
const DESKTOP_WEB_DIRNAME = "web";

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

const EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "out",
  ".git",
]);

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
  if (
    relFromRoot === "apps/desktop/web" ||
    relFromRoot.startsWith("apps/desktop/web/")
  ) {
    return;
  }
  if (relFromRoot === "js/shared" || relFromRoot.startsWith("js/shared/")) {
    return;
  }

  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    const entries = await fsp.readdir(src, { withFileTypes: true });
    await fsp.mkdir(dest, { recursive: true });
    for (const entry of entries) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
      await copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
}

async function copyRootRuntimeFiles(destWebRoot) {
  for (const relPath of WEB_RUNTIME_ENTRIES) {
    const src = path.join(ROOT, relPath);
    if (!(await exists(src))) {
      throw new Error(`[release:desktop] Missing runtime entry: ${relPath}`);
    }
    const dest = path.join(destWebRoot, relPath);
    await copyRecursive(src, dest);
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

function bytesToHuman(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  if (!(await exists(DESKTOP_APP_DIR))) {
    console.error(`[release:desktop] Missing folder: ${DESKTOP_APP_DIR}`);
    process.exitCode = 1;
    return;
  }

  let outDir = DEFAULT_OUT_DIR;
  try {
    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.mkdir(outDir, { recursive: true });
  } catch (err) {
    const lockError =
      err && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES");
    if (!lockError) throw err;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    outDir = path.join(DIST_ROOT, `desktop-app-${ts}`);
    await fsp.mkdir(outDir, { recursive: true });
    console.warn(
      `[release:desktop] '${DEFAULT_OUT_DIR}' is locked. Using fallback output: ${outDir}`,
    );
  }

  const outAppDir = path.join(outDir, "app");
  await copyRecursive(DESKTOP_APP_DIR, outAppDir);
  await copyRootRuntimeFiles(path.join(outAppDir, DESKTOP_WEB_DIRNAME));

  const files = await listFilesRecursive(outDir);
  let totalBytes = 0;
  for (const file of files) {
    const stat = await fsp.stat(file);
    totalBytes += stat.size;
  }

  console.log("[release:desktop] Build complete");
  console.log(`[release:desktop] Output: ${outDir}`);
  console.log(`[release:desktop] Files: ${files.length} | Size: ${bytesToHuman(totalBytes)}`);
  console.log(
    `[release:desktop] Next: cd "${path.join(outDir, "app")}" && npm install && npm run start`,
  );
}

main().catch((err) => {
  console.error("[release:desktop] Failed:", err);
  process.exitCode = 1;
});
