#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(ROOT, "dist");
const EAGLE_ZIP_DIR = path.join(DIST_ROOT, "eagle");
const EAGLE_LATEST_DIR = path.join(DIST_ROOT, "eagle-plugin");

// Keep this list explicit to avoid desktop/standalone pollution.
const REQUIRED_ENTRIES = [
  "manifest.json",
  "index.html",
  "logo.png",
  "_locales",
  "css",
  "js",
  "packages",
  "assets",
];

const OPTIONAL_ENTRIES = ["LICENSE", "README.md"];
const ZIP_NAME_PREFIX = "posechrono-eagle-";

function escapePowerShellSingleQuotes(input) {
  return String(input ?? "").replace(/'/g, "''");
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
}

function runNodeScriptOrThrow(relPath, args = []) {
  const scriptPath = path.join(ROOT, relPath);
  const result = runCommand(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
  });
  if (result.status !== 0) {
    throw new Error(`[release:eagle] Failed running ${relPath}`);
  }
}

function buildVersionedZipName(version) {
  const safe = String(version || "0.0.0")
    .trim()
    .replace(/[^0-9A-Za-z._-]/g, "-");
  return `${ZIP_NAME_PREFIX}${safe}.zip`;
}

async function readManifestVersion() {
  const manifestPath = path.join(ROOT, "manifest.json");
  try {
    const raw = await fsp.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    const value = manifest?.version;
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch (_) {
    // Fallback below
  }
  return "0.0.0";
}

async function createZipArchive(sourceDir, destinationZipPath) {
  await fsp.mkdir(path.dirname(destinationZipPath), { recursive: true });
  await fsp.rm(destinationZipPath, { force: true });

  if (process.platform === "win32") {
    const sourcePattern = `${path.resolve(sourceDir)}\\*`;
    const command =
      `$ErrorActionPreference='Stop';` +
      `Compress-Archive -Path '${escapePowerShellSingleQuotes(sourcePattern)}' ` +
      `-DestinationPath '${escapePowerShellSingleQuotes(path.resolve(destinationZipPath))}' -Force`;

    const winCandidates = ["powershell.exe", "pwsh.exe"];
    for (const cmd of winCandidates) {
      const result = runCommand(cmd, ["-NoProfile", "-Command", command]);
      if (result.error) continue;
      if (result.status === 0) return;
    }
    throw new Error(
      "Unable to create zip archive on Windows (powershell/pwsh failed).",
    );
  }

  const zipResult = runCommand("zip", ["-r", destinationZipPath, "."], {
    cwd: sourceDir,
  });
  if (zipResult.status !== 0) {
    throw new Error("Unable to create zip archive (zip command failed).");
  }
}

function existsSyncSafe(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function toUnixPath(inputPath) {
  return String(inputPath || "").split(path.sep).join("/");
}

async function copyRecursive(src, dest) {
  const relFromRoot = toUnixPath(path.relative(ROOT, src));
  if (relFromRoot === "js/shared" || relFromRoot.startsWith("js/shared/")) {
    return;
  }

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

async function copyDirectoryRaw(srcDir, destDir) {
  const stat = await fsp.stat(srcDir);
  if (!stat.isDirectory()) {
    throw new Error(`[release:eagle] copyDirectoryRaw source is not a directory: ${srcDir}`);
  }

  await fsp.mkdir(destDir, { recursive: true });
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRaw(srcPath, destPath);
    } else {
      await fsp.mkdir(path.dirname(destPath), { recursive: true });
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

function bytesToHuman(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function isLockError(err) {
  return !!(
    err &&
    (err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY")
  );
}

function formatReleaseStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}_T${hours}-${minutes}`;
}

async function createIncrementedOutputDir(rootDir, prefix) {
  await fsp.mkdir(rootDir, { recursive: true });
  const stamp = formatReleaseStamp();
  for (let index = 1; index < 1000; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const candidate = path.join(rootDir, `${prefix}-${stamp}_${suffix}`);
    try {
      await fsp.mkdir(candidate, { recursive: false });
      return candidate;
    } catch (err) {
      if (err && err.code === "EEXIST") {
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `[release:eagle] Unable to allocate output folder for prefix '${prefix}'.`,
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldSyncLatestAlias = args.has("--update-latest");

  runNodeScriptOrThrow("scripts/build-shared-bundle.js");

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

  const outDir = await createIncrementedOutputDir(DIST_ROOT, "eagle-plugin");

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

  let latestAliasSynced = false;
  if (shouldSyncLatestAlias) {
    try {
      await fsp.rm(EAGLE_LATEST_DIR, { recursive: true, force: true });
      await copyDirectoryRaw(outDir, EAGLE_LATEST_DIR);
      latestAliasSynced = true;
    } catch (err) {
      if (!isLockError(err)) throw err;
      console.warn(
        `[release:eagle] Latest alias not updated (folder locked): ${EAGLE_LATEST_DIR}`,
      );
      console.warn(
        "[release:eagle] Close Eagle (or release file locks) then rerun: npm run release:eagle:latest",
      );
    }
  }

  const files = await listFilesRecursive(outDir);
  let totalBytes = 0;
  for (const file of files) {
    const stat = await fsp.stat(file);
    totalBytes += stat.size;
  }
  const version = await readManifestVersion();
  const zipName = buildVersionedZipName(version);
  let zipPath = path.join(EAGLE_ZIP_DIR, zipName);
  try {
    await createZipArchive(outDir, zipPath);
  } catch (err) {
    if (!isLockError(err)) throw err;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fallbackZipName = zipName.replace(/\.zip$/i, `-${ts}.zip`);
    zipPath = path.join(EAGLE_ZIP_DIR, fallbackZipName);
    await createZipArchive(outDir, zipPath);
    console.warn(
      `[release:eagle] '${path.join(EAGLE_ZIP_DIR, zipName)}' is locked. Using fallback zip: ${zipPath}`,
    );
  }

  console.log("[release:eagle] Build complete");
  console.log(`[release:eagle] Output: ${outDir}`);
  if (shouldSyncLatestAlias && latestAliasSynced) {
    console.log(`[release:eagle] Latest alias updated: ${EAGLE_LATEST_DIR}`);
  }
  console.log(`[release:eagle] Entries copied: ${copied.join(", ")}`);
  console.log(
    `[release:eagle] Files: ${files.length} | Size: ${bytesToHuman(totalBytes)}`,
  );
  console.log(`[release:eagle] Zip: ${zipPath}`);
  console.log(
    "[release:eagle] Import this folder in Eagle: Developer Options > Import Local Project",
  );
}

main().catch((err) => {
  console.error("[release:eagle] Failed:", err);
  process.exitCode = 1;
});
