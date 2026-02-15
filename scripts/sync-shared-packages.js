#!/usr/bin/env node
/* eslint-disable no-console */
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_DIR = path.join(ROOT, "packages", "shared");
const PACKAGE_META_FILES = new Set(["package.json", "README.md"]);

async function collectFiles(dir, baseDir = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, baseDir)));
      continue;
    }
    if (!entry.isFile()) continue;
    files.push(path.relative(baseDir, fullPath));
  }
  return files;
}

async function writeSharedPackageManifest() {
  const packageManifest = {
    name: "@posechrono/shared",
    version: "0.0.1",
    private: true,
    description:
      "Shared PoseChrono browser utilities (source of truth for runtime)",
    sideEffects: true,
  };
  const manifestPath = path.join(PACKAGE_DIR, "package.json");
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify(packageManifest, null, 2)}\n`,
    "utf8",
  );
}

async function writeSharedReadme() {
  const readmePath = path.join(PACKAGE_DIR, "README.md");
  const content = [
    "# @posechrono/shared",
    "",
    "This folder is the source of truth for shared browser utilities.",
    "Edit files here.",
  ].join("\n");
  await fsp.writeFile(readmePath, `${content}\n`, "utf8");
}

function toUnixPath(relPath) {
  return relPath.replace(/\\/g, "/");
}

async function getSharedModuleFiles(dir) {
  let files = [];
  try {
    files = await collectFiles(dir);
  } catch (_) {
    return [];
  }
  return files
    .map(toUnixPath)
    .filter((file) => !PACKAGE_META_FILES.has(file))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  await fsp.mkdir(PACKAGE_DIR, { recursive: true });
  const sourceFiles = await getSharedModuleFiles(PACKAGE_DIR);
  if (!sourceFiles.length) {
    throw new Error(
      `No shared modules found in source of truth: ${PACKAGE_DIR}`,
    );
  }

  await writeSharedPackageManifest();
  await writeSharedReadme();

  console.log("[shared:sync] OK");
  console.log(`[shared:sync] Source: ${PACKAGE_DIR}`);
  console.log(`[shared:sync] Source files: ${sourceFiles.length}`);
}

main().catch((error) => {
  console.error("[shared:sync] Failed:", error);
  process.exitCode = 1;
});
