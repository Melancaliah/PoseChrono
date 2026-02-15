#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "packages", "shared");
const TARGET_DIR = path.join(ROOT, "js", "shared");

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function listFiles(dir, baseDir = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, baseDir)));
      continue;
    }
    if (!entry.isFile()) continue;
    files.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function main() {
  if (!(await exists(SOURCE_DIR))) {
    throw new Error(`Missing source dir: ${SOURCE_DIR}`);
  }

  const sourceFilesRaw = await listFiles(SOURCE_DIR);
  const sourceFiles = sourceFilesRaw.filter(
    (file) => file !== "README.md" && file !== "package.json",
  );
  if (!sourceFiles.length) {
    throw new Error(`No shared module files found in ${SOURCE_DIR}`);
  }

  if (!(await exists(TARGET_DIR))) {
    console.log("[verify:shared-sync] OK");
    console.log(`[verify:shared-sync] Source files: ${sourceFiles.length}`);
    console.log("[verify:shared-sync] Legacy mirror: absent (expected)");
    return;
  }

  const targetFilesRaw = await listFiles(TARGET_DIR);
  const targetFiles = targetFilesRaw.filter(
    (file) => file !== "README.md" && file !== "package.json",
  );
  console.error("[verify:shared-sync] FAILED");
  console.error(
    `  - Legacy mirror directory should be removed: ${TARGET_DIR} (${targetFiles.length} file(s))`,
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("[verify:shared-sync] Failed:", error);
  process.exitCode = 1;
});
