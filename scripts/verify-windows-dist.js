#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(ROOT, "dist");
const LEGACY_DIST_DIR = path.join(DIST_ROOT, "windows");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const OPTIONAL_FILES = new Set(["release.json"]);
const OPTIONAL_EXTENSIONS = new Set([".blockmap"]);

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

function isSetupFileName(name) {
  return (
    /^PoseChrono-Setup-.*\.exe$/i.test(name) ||
    /^posechrono-desktop-[0-9A-Za-z._-]+-setup\.exe$/i.test(name)
  );
}

function isAllowedEntry(name) {
  if (isSetupFileName(name)) return true;
  if (OPTIONAL_FILES.has(name)) return true;
  const ext = path.extname(name).toLowerCase();
  if (OPTIONAL_EXTENSIONS.has(ext)) return true;
  return false;
}

async function main() {
  const argDir = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : null;
  let distDir = argDir;

  if (!distDir) {
    if (await exists(DIST_ROOT)) {
      const entries = await fsp.readdir(DIST_ROOT, { withFileTypes: true });
      const candidates = entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            (entry.name === "windows" || entry.name.startsWith("windows-")),
        )
        .map((entry) => entry.name);

      const dated = candidates
        .filter((name) => name.startsWith("windows-"))
        .sort((a, b) => b.localeCompare(a));
      if (dated.length > 0) {
        distDir = path.join(DIST_ROOT, dated[0]);
      } else if (candidates.includes("windows")) {
        distDir = LEGACY_DIST_DIR;
      }
    }
  }

  if (!distDir) {
    distDir = LEGACY_DIST_DIR;
  }

  if (!(await exists(distDir))) {
    console.error(
      `[verify:windows-dist] Missing folder: ${distDir}\nRun: npm run release:windows`,
    );
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const entries = await fsp.readdir(distDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  if (dirs.length > 0) {
    errors.push(
      `Unexpected directories in dist/windows: ${dirs.join(", ")}`,
    );
  }

  const setupFiles = files.filter((name) => isSetupFileName(name));
  if (setupFiles.length === 0) {
    errors.push(
      "No setup executable found (PoseChrono-Setup-*.exe or posechrono-desktop-<version>-setup.exe).",
    );
  }

  for (const file of files) {
    if (!isAllowedEntry(file)) {
      errors.push(`Unexpected file in dist/windows: ${file}`);
    }
  }

  const releaseMetaPath = path.join(distDir, "release.json");
  if (!(await exists(releaseMetaPath))) {
    errors.push("Missing release.json in dist/windows.");
  } else {
    try {
      const meta = await readJson(releaseMetaPath);
      const setupFile = String(meta.setupFile || "").trim();
      if (!setupFile || !isSetupFileName(setupFile)) {
        errors.push("release.json: setupFile is missing or invalid.");
      } else if (!(await exists(path.join(distDir, setupFile)))) {
        errors.push(`release.json: setupFile not found: ${setupFile}`);
      }

      const manifest = await readJson(MANIFEST_PATH);
      const manifestVersion = String(manifest?.version || "").trim();
      const metaVersion = String(meta?.manifestVersion || "").trim();
      if (manifestVersion && metaVersion && manifestVersion !== metaVersion) {
        errors.push(
          `Version mismatch: manifest.json=${manifestVersion}, release.json.manifestVersion=${metaVersion}`,
        );
      }
    } catch (err) {
      errors.push(`release.json parse/validation error: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error("[verify:windows-dist] FAILED");
    errors.forEach((msg) => console.error(`  - ${msg}`));
    process.exitCode = 1;
    return;
  }

  console.log("[verify:windows-dist] OK");
  console.log(`[verify:windows-dist] Folder: ${distDir}`);
  console.log(`[verify:windows-dist] Files: ${files.length}`);
}

main().catch((err) => {
  console.error("[verify:windows-dist] Failed:", err);
  process.exitCode = 1;
});
