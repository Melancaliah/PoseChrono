#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_DIST_DIR = path.join(ROOT, "dist", "eagle-plugin");

const REQUIRED_ROOT_ENTRIES = new Set([
  "manifest.json",
  "index.html",
  "logo.png",
  "_locales",
  "css",
  "js",
  "packages",
  "assets",
]);

const OPTIONAL_ROOT_ENTRIES = new Set(["LICENSE", "README.md"]);

const FORBIDDEN_PATH_SEGMENTS = new Set([
  ".git",
  ".claude",
  "node_modules",
  "apps",
  "tasks",
  "dist",
]);

function toUnixPath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

async function listTree(baseDir) {
  const entries = [];

  async function walk(current) {
    const dirents = await fsp.readdir(current, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(current, dirent.name);
      const rel = path.relative(baseDir, full);
      entries.push({
        name: dirent.name,
        full,
        rel,
        relUnix: toUnixPath(rel),
        isDir: dirent.isDirectory(),
      });
      if (dirent.isDirectory()) {
        await walk(full);
      }
    }
  }

  await walk(baseDir);
  return entries;
}

async function exists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
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
            (entry.name === "eagle-plugin" ||
              entry.name.startsWith("eagle-plugin-")),
        )
        .map((entry) => entry.name);

      const timestamped = names
        .filter((name) => name.startsWith("eagle-plugin-"))
        .sort((a, b) => b.localeCompare(a));
      if (timestamped.length > 0) {
        distDir = path.join(distRoot, timestamped[0]);
      } else if (names.includes("eagle-plugin")) {
        distDir = path.join(distRoot, "eagle-plugin");
      }
    }
  }

  if (!(await exists(distDir))) {
    console.error(
      `[verify:eagle-dist] Missing folder: ${distDir}\nRun: node scripts/release-eagle.js`,
    );
    process.exitCode = 1;
    return;
  }

  const rootDirents = await fsp.readdir(distDir, { withFileTypes: true });
  const rootNames = new Set(rootDirents.map((entry) => entry.name));

  const errors = [];
  const warnings = [];

  for (const required of REQUIRED_ROOT_ENTRIES) {
    if (!rootNames.has(required)) {
      errors.push(`Missing required root entry: ${required}`);
    }
  }

  for (const name of rootNames) {
    const allowed =
      REQUIRED_ROOT_ENTRIES.has(name) || OPTIONAL_ROOT_ENTRIES.has(name);
    if (!allowed) {
      errors.push(`Unexpected root entry in dist/eagle-plugin: ${name}`);
    }
  }

  const tree = await listTree(distDir);
  for (const entry of tree) {
    const segments = entry.relUnix.split("/");
    for (const segment of segments) {
      if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
        errors.push(`Forbidden path segment found: ${entry.relUnix}`);
        break;
      }
    }
  }

  const manifestPath = path.join(distDir, "manifest.json");
  if (await exists(manifestPath)) {
    try {
      const raw = await fsp.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw);
      const mainUrl = manifest?.main?.url;
      if (!mainUrl || typeof mainUrl !== "string") {
        errors.push("manifest.json: main.url is missing or invalid");
      } else {
        const mainUrlPath = path.join(distDir, mainUrl);
        if (!(await exists(mainUrlPath))) {
          errors.push(`manifest.json: main.url target not found: ${mainUrl}`);
        }
      }
    } catch (err) {
      errors.push(`manifest.json parse error: ${err.message}`);
    }
  }

  const fileCount = tree.filter((entry) => !entry.isDir).length;
  const dirCount = tree.filter((entry) => entry.isDir).length;

  const legacySharedDir = path.join(distDir, "js", "shared");
  if (await exists(legacySharedDir)) {
    errors.push("Legacy shared folder should not be packaged: js/shared");
  }

  if (errors.length > 0) {
    console.error("[verify:eagle-dist] FAILED");
    errors.forEach((msg) => console.error(`  - ${msg}`));
    if (warnings.length > 0) {
      warnings.forEach((msg) => console.warn(`  - warning: ${msg}`));
    }
    process.exitCode = 1;
    return;
  }

  console.log("[verify:eagle-dist] OK");
  console.log(`[verify:eagle-dist] Folder: ${distDir}`);
  console.log(`[verify:eagle-dist] Root entries: ${rootNames.size}`);
  console.log(`[verify:eagle-dist] Directories: ${dirCount} | Files: ${fileCount}`);
  if (warnings.length > 0) {
    warnings.forEach((msg) => console.warn(`  - warning: ${msg}`));
  }
}

main().catch((err) => {
  console.error("[verify:eagle-dist] Failed:", err);
  process.exitCode = 1;
});
