#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * release-all.js
 *
 * Unified release script: builds Eagle plugin + Windows installer into a single
 * versioned output folder, ready for GitHub release drag-and-drop.
 *
 * Output structure:
 *   dist/v{VERSION}_{YYYY-MM-DD}_T{HH}-{mm}/
 *     PoseChrono_v{VERSION}_eagle.zip        <- GitHub release asset
 *     PoseChrono_v{VERSION}_windows.exe      <- GitHub release asset
 *     eagle/                                  <- decompressed plugin (official store, no GabContainer)
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(ROOT, "dist");
const DESKTOP_DIR = path.join(ROOT, "apps", "desktop");
const DESKTOP_DIST_DIR = path.join(DESKTOP_DIR, "dist");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");

// ── Entries to copy into Eagle build ─────────────────────────────────────────
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
const OPTIONAL_ENTRIES = ["LICENSE", "README.md", "GabContainer"];

// ── Production manifest overrides ────────────────────────────────────────────
const RELEASE_MANIFEST_OVERRIDES = {
  id: "b459df53-4b7c-4116-a996-647c1ef63dc9",
  logo: "/logo.png",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toUnixPath(input) {
  return String(input || "").split(path.sep).join("/");
}

function existsSyncSafe(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function escapePowerShellSingleQuotes(input) {
  return String(input ?? "").replace(/'/g, "''");
}

function bytesToHuman(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function runNodeScriptOrThrow(relPath, args = []) {
  const scriptPath = path.join(ROOT, relPath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`[release:all] Failed running ${relPath}`);
  }
}

function toShellArg(value) {
  const str = String(value ?? "");
  if (!/[\s"&|<>^]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function runCommandAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === "win32";
    const child = useShell
      ? spawn(
          [command, ...args.map((arg) => toShellArg(arg))].join(" "),
          { cwd: ROOT, stdio: "inherit", shell: true, ...options },
        )
      : spawn(command, args, {
          cwd: ROOT,
          stdio: "inherit",
          shell: false,
          ...options,
        });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${command} ${args.join(" ")}): exit ${code}`));
    });
  });
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function copyRecursive(src, dest) {
  const relFromRoot = toUnixPath(path.relative(ROOT, src));
  if (relFromRoot === "js/shared" || relFromRoot.startsWith("js/shared/")) {
    return;
  }
  if (relFromRoot === "_fab" || relFromRoot.startsWith("_fab/")) {
    return;
  }

  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
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
      const result = spawnSync(cmd, ["-NoProfile", "-Command", command], {
        stdio: "inherit",
      });
      if (result.error) continue;
      if (result.status === 0) return;
    }
    throw new Error(
      "Unable to create zip archive on Windows (powershell/pwsh failed).",
    );
  }

  const zipResult = spawnSync("zip", ["-r", destinationZipPath, "."], {
    cwd: sourceDir,
    stdio: "inherit",
  });
  if (zipResult.status !== 0) {
    throw new Error("Unable to create zip archive (zip command failed).");
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

// ── Output folder creation ───────────────────────────────────────────────────

function formatOutputFolderName(version, date = new Date()) {
  const safe = String(version || "0.0.0").trim().replace(/[^0-9A-Za-z._-]/g, "-");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `v${safe}_${year}-${month}-${day}_T${hours}-${minutes}`;
}

async function createOutputDir(version) {
  await fsp.mkdir(DIST_ROOT, { recursive: true });
  const base = formatOutputFolderName(version);
  // Try without suffix first, then with _02, _03, etc.
  const firstCandidate = path.join(DIST_ROOT, base);
  try {
    await fsp.mkdir(firstCandidate, { recursive: false });
    return firstCandidate;
  } catch (err) {
    if (!err || err.code !== "EEXIST") throw err;
  }
  for (let i = 2; i < 1000; i++) {
    const suffix = String(i).padStart(2, "0");
    const candidate = path.join(DIST_ROOT, `${base}_${suffix}`);
    try {
      await fsp.mkdir(candidate, { recursive: false });
      return candidate;
    } catch (err) {
      if (err && err.code === "EEXIST") continue;
      throw err;
    }
  }
  throw new Error("[release:all] Unable to allocate output folder.");
}

// ── Windows setup finder ─────────────────────────────────────────────────────

function isWindowsSetupFileName(name) {
  return (
    /^PoseChrono-Setup-.*\.exe$/i.test(String(name || "")) ||
    /^posechrono-desktop-[0-9A-Za-z._-]+-setup\.exe$/i.test(String(name || ""))
  );
}

async function findLatestWindowsSetup() {
  let entries;
  try {
    entries = await fsp.readdir(DESKTOP_DIST_DIR, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isWindowsSetupFileName(entry.name)) continue;
    const fullPath = path.join(DESKTOP_DIST_DIR, entry.name);
    const stat = await fsp.stat(fullPath);
    candidates.push({ fullPath, stat });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return candidates[0].fullPath;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const version = String(manifest.version || "0.0.0").trim();
  if (!version || version === "0.0.0") {
    throw new Error("[release:all] manifest.json has no valid version.");
  }

  console.log(`\n[release:all] Starting unified release for v${version}\n`);

  // ── Step 1: Build shared bundle ────────────────────────────────────────
  console.log("[release:all] Step 1/5: Build shared bundle...");
  runNodeScriptOrThrow("scripts/build-shared-bundle.js");

  // ── Step 2: Sync desktop version ───────────────────────────────────────
  console.log("[release:all] Step 2/5: Sync desktop version from manifest...");
  runNodeScriptOrThrow("scripts/sync-desktop-version-from-manifest.js");

  // ── Step 3: Create output folder ───────────────────────────────────────
  console.log("[release:all] Step 3/5: Create output folder...");
  const outputDir = await createOutputDir(version);
  const eagleDir = path.join(outputDir, "eagle");

  console.log(`[release:all] Output: ${outputDir}`);

  // ── Step 4: Build Eagle ────────────────────────────────────────────────
  console.log("[release:all] Step 4/5: Build Eagle plugin...");

  // Check required entries exist
  const missing = REQUIRED_ENTRIES.filter(
    (entry) => !existsSyncSafe(path.join(ROOT, entry)),
  );
  if (missing.length > 0) {
    throw new Error(`[release:all] Missing required entries: ${missing.join(", ")}`);
  }

  // Copy required entries
  for (const entry of REQUIRED_ENTRIES) {
    const src = path.join(ROOT, entry);
    const dest = path.join(eagleDir, entry);
    await copyRecursive(src, dest);
  }

  // Copy optional entries
  for (const entry of OPTIONAL_ENTRIES) {
    const src = path.join(ROOT, entry);
    if (!existsSyncSafe(src)) continue;
    const dest = path.join(eagleDir, entry);
    await copyRecursive(src, dest);
  }

  // Patch manifest.json with production values (overrides dev ID and logo)
  const outManifestPath = path.join(eagleDir, "manifest.json");
  const outManifestRaw = await fsp.readFile(outManifestPath, "utf8");
  const outManifest = JSON.parse(outManifestRaw);
  Object.assign(outManifest, RELEASE_MANIFEST_OVERRIDES);
  await fsp.writeFile(
    outManifestPath,
    JSON.stringify(outManifest, null, 2) + "\n",
    "utf8",
  );

  // Create zip BEFORE removing GabContainer (zip includes easter egg)
  const eagleZipName = `PoseChrono_v${version}_eagle.zip`;
  const eagleZipPath = path.join(outputDir, eagleZipName);
  await createZipArchive(eagleDir, eagleZipPath);

  const eagleZipStat = await fsp.stat(eagleZipPath);
  console.log(
    `[release:all] Eagle zip: ${eagleZipName} (${bytesToHuman(eagleZipStat.size)})`,
  );

  // Remove GabContainer from decompressed eagle/ (official store version)
  const gabContainerDir = path.join(eagleDir, "GabContainer");
  await fsp.rm(gabContainerDir, { recursive: true, force: true });

  // Stats for decompressed eagle folder
  const eagleFiles = await listFilesRecursive(eagleDir);
  let eagleTotalBytes = 0;
  for (const file of eagleFiles) {
    const stat = await fsp.stat(file);
    eagleTotalBytes += stat.size;
  }
  console.log(
    `[release:all] Eagle folder: ${eagleFiles.length} files, ${bytesToHuman(eagleTotalBytes)} (store version, no GabContainer)`,
  );

  // ── Step 5: Build Windows ──────────────────────────────────────────────
  console.log("[release:all] Step 5/5: Build Windows installer...");

  await runCommandAsync("npm", [
    "--prefix",
    "apps/desktop",
    "run",
    "build:win:unsigned",
  ]);

  const latestSetup = await findLatestWindowsSetup();
  if (!latestSetup) {
    throw new Error(
      "[release:all] No setup .exe found in apps/desktop/dist after build.",
    );
  }

  const windowsExeName = `PoseChrono_v${version}_windows.exe`;
  const windowsExeDest = path.join(outputDir, windowsExeName);
  await fsp.copyFile(latestSetup, windowsExeDest);

  const exeStat = await fsp.stat(windowsExeDest);
  console.log(
    `[release:all] Windows exe: ${windowsExeName} (${bytesToHuman(exeStat.size)})`,
  );

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n[release:all] ============================================");
  console.log("[release:all] BUILD COMPLETE");
  console.log("[release:all] ============================================");
  console.log(`[release:all] Version: ${version}`);
  console.log(`[release:all] Output:  ${outputDir}`);
  console.log("[release:all]");
  console.log("[release:all] GitHub release assets (drag & drop):");
  console.log(`[release:all]   ${eagleZipName}`);
  console.log(`[release:all]   ${windowsExeName}`);
  console.log("[release:all]");
  console.log("[release:all] Official store (decompressed, no GabContainer):");
  console.log(`[release:all]   eagle/`);
  console.log("[release:all] ============================================\n");
}

main().catch((err) => {
  console.error("[release:all] Failed:", err.message || err);
  process.exitCode = 1;
});
