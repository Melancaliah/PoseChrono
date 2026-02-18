#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(ROOT, "dist");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const OPTIONAL_FILES = new Set(["release.json"]);

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

function isDmgFileName(name) {
  return (
    /^PoseChrono-.*\.dmg$/i.test(name) ||
    /^posechrono-desktop-[0-9A-Za-z._-]+\.dmg$/i.test(name) ||
    /^PoseChrono_v[0-9A-Za-z._-]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_mac(?:-(?:x64|arm64))?_T[0-9]{2}-[0-9]{2}_[0-9]{2}\.dmg$/i.test(name)
  );
}

function isAllowedEntry(name) {
  if (isDmgFileName(name)) return true;
  if (OPTIONAL_FILES.has(name)) return true;
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
            (entry.name === "mac" ||
              entry.name.startsWith("mac-") ||
              /^PoseChrono_v[^_]+.*_mac_T/i.test(entry.name)),
        )
        .map((entry) => entry.name);

      const dated = candidates
        .filter((name) => name.startsWith("mac-") || /^PoseChrono_v/i.test(name))
        .sort((a, b) => b.localeCompare(a));
      if (dated.length > 0) {
        distDir = path.join(DIST_ROOT, dated[0]);
      } else if (candidates.includes("mac")) {
        distDir = path.join(DIST_ROOT, "mac");
      }
    }
  }

  if (!distDir || !(await exists(distDir))) {
    console.error(
      `[verify:mac-dist] Missing folder: ${distDir || "dist/mac*"}\nRun: npm run release:mac (requires macOS)`,
    );
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const entries = await fsp.readdir(distDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  if (dirs.length > 0) {
    errors.push(`Unexpected directories in dist/mac: ${dirs.join(", ")}`);
  }

  const dmgFiles = files.filter((name) => isDmgFileName(name));
  if (dmgFiles.length === 0) {
    errors.push("No DMG found (PoseChrono-*.dmg or posechrono-desktop-*.dmg).");
  }

  for (const file of files) {
    if (!isAllowedEntry(file)) {
      errors.push(`Unexpected file in dist/mac: ${file}`);
    }
  }

  const releaseMetaPath = path.join(distDir, "release.json");
  if (!(await exists(releaseMetaPath))) {
    errors.push("Missing release.json in dist/mac.");
  } else {
    try {
      const meta = await readJson(releaseMetaPath);
      const dmgFilesList = Array.isArray(meta.dmgFiles) ? meta.dmgFiles : [];
      if (dmgFilesList.length === 0) {
        errors.push("release.json: dmgFiles is missing or empty.");
      } else {
        for (const dmgFile of dmgFilesList) {
          if (!isDmgFileName(dmgFile)) {
            errors.push(`release.json: invalid dmg entry: ${dmgFile}`);
          } else if (!(await exists(path.join(distDir, dmgFile)))) {
            errors.push(`release.json: dmgFile not found: ${dmgFile}`);
          }
        }
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
    console.error("[verify:mac-dist] FAILED");
    errors.forEach((msg) => console.error(`  - ${msg}`));
    process.exitCode = 1;
    return;
  }

  console.log("[verify:mac-dist] OK");
  console.log(`[verify:mac-dist] Folder: ${distDir}`);
  console.log(`[verify:mac-dist] Files: ${files.length}`);
}

main().catch((err) => {
  console.error("[verify:mac-dist] Failed:", err);
  process.exitCode = 1;
});
