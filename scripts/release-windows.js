#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DESKTOP_DIR = path.join(ROOT, "apps", "desktop");
const DESKTOP_DIST_DIR = path.join(DESKTOP_DIR, "dist");
const DIST_ROOT = path.join(ROOT, "dist");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const DESKTOP_PACKAGE_PATH = path.join(DESKTOP_DIR, "package.json");
const SYNC_DESKTOP_VERSION_SCRIPT = path.join(
  ROOT,
  "scripts",
  "sync-desktop-version-from-manifest.js",
);

function isWindowsSetupFileName(name) {
  const value = String(name || "");
  return (
    /^PoseChrono-Setup-.*\.exe$/i.test(value) ||
    /^posechrono-desktop-[0-9A-Za-z._-]+-setup\.exe$/i.test(value) ||
    // Legacy format (compat anciens builds)
    /^PoseChrono_v[0-9A-Za-z._-]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_windows_T[0-9]{2}-[0-9]{2}_[0-9]{2}\.exe$/i.test(value) ||
    // Nouveau format aligné sur release-all : v{ver}_{date}_windows_T{HH-mm}[_NN].exe
    /^v[0-9A-Za-z._-]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_windows_T[0-9]{2}-[0-9]{2}(?:_[0-9]{2})?\.exe$/i.test(value)
  );
}

function toSafeVersion(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[^0-9A-Za-z._-]/g, "-");
  return raw || "0.0.0";
}

function extractVersionFromSetupName(filePath) {
  const fileName = path.basename(String(filePath || ""));
  const poseChronoMatch = fileName.match(/^PoseChrono-Setup-(.+)\.exe$/i);
  if (poseChronoMatch && poseChronoMatch[1]) {
    return String(poseChronoMatch[1]).trim();
  }
  const desktopMatch = fileName.match(
    /^posechrono-desktop-([0-9A-Za-z._-]+)-setup\.exe$/i,
  );
  if (desktopMatch && desktopMatch[1]) {
    return String(desktopMatch[1]).trim();
  }
  return "";
}

function isSpawnEpermBuildError(error) {
  const text = String(error?.message || error || "");
  return /spawn\s+EPERM/i.test(text) || /app-builder\.exe/i.test(text);
}

function toShellArg(value) {
  const str = String(value ?? "");
  if (!/[\s"&|<>^]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function formatArtifactBaseName(version, platform, date = new Date()) {
  const safe = String(version || "0.0.0").trim().replace(/[^0-9A-Za-z._-]/g, "-");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `v${safe}_${year}-${month}-${day}_${platform}_T${hours}-${minutes}`;
}

async function createArtifactDir(rootDir, version, platform) {
  await fsp.mkdir(rootDir, { recursive: true });
  const base = formatArtifactBaseName(version, platform);
  // Try without suffix first, then _02, _03, ... (aligned with release-all.js)
  const firstCandidate = path.join(rootDir, base);
  try {
    await fsp.mkdir(firstCandidate, { recursive: false });
    return { dirPath: firstCandidate, baseName: base };
  } catch (err) {
    if (!err || err.code !== "EEXIST") throw err;
  }
  for (let index = 2; index < 1000; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const fullName = `${base}_${suffix}`;
    const candidate = path.join(rootDir, fullName);
    try {
      await fsp.mkdir(candidate, { recursive: false });
      return { dirPath: candidate, baseName: fullName };
    } catch (err) {
      if (err && err.code === "EEXIST") {
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `[release:windows] Unable to allocate output folder for '${platform}'.`,
  );
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === "win32";
    const child = useShell
      ? spawn(
          [command, ...args.map((arg) => toShellArg(arg))].join(" "),
          {
            cwd: ROOT,
            stdio: "inherit",
            shell: true,
            ...options,
          },
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
      else reject(new Error(`Command failed (${command} ${args.join(" ")}): ${code}`));
    });
  });
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function findLatestWindowsSetup() {
  const entries = await fsp.readdir(DESKTOP_DIST_DIR, { withFileTypes: true });
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

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const desktopPkg = await readJson(DESKTOP_PACKAGE_PATH);
  const manifestVersion = manifest && manifest.version ? String(manifest.version) : "";
  const desktopVersion =
    desktopPkg && desktopPkg.version ? String(desktopPkg.version) : "";

  if (manifestVersion && desktopVersion && manifestVersion !== desktopVersion) {
    console.warn(
      `[release:windows] Version mismatch: manifest=${manifestVersion} desktop=${desktopVersion}`,
    );
  }

  console.log(
    "[release:windows] Step 0/3: sync desktop package version from manifest",
  );
  await runCommand("node", [SYNC_DESKTOP_VERSION_SCRIPT]);

  const desktopPkgAfterSync = await readJson(DESKTOP_PACKAGE_PATH);
  const desktopVersionAfterSync = String(desktopPkgAfterSync?.version || "");

  console.log("[release:windows] Step 1/3: build unsigned Windows installer");
  let buildSkippedUsingExistingInstaller = false;
  let latestSetup = null;
  try {
    await runCommand("npm", [
      "--prefix",
      "apps/desktop",
      "run",
      "build:win:unsigned",
    ]);
  } catch (error) {
    latestSetup = await findLatestWindowsSetup();
    if (!latestSetup) {
      throw error;
    }
    buildSkippedUsingExistingInstaller = true;
    const reason = isSpawnEpermBuildError(error)
      ? "EPERM on app-builder"
      : "build failure";
    console.warn(
      `[release:windows] Build step failed (${reason}). Reusing latest existing installer from apps/desktop/dist.`,
    );
  }

  console.log("[release:windows] Step 2/3: collect artifacts to dist/windows");
  if (!latestSetup) {
    latestSetup = await findLatestWindowsSetup();
  }
  if (!latestSetup) {
    if (buildSkippedUsingExistingInstaller) {
      throw new Error(
        "Build blocked and no existing setup .exe found in apps/desktop/dist. Run desktop build manually once.",
      );
    }
    throw new Error("No setup .exe found in apps/desktop/dist");
  }

  const releaseVersion = toSafeVersion(
    manifestVersion || desktopVersionAfterSync || desktopVersion,
  );
  const sourceSetupVersion = toSafeVersion(extractVersionFromSetupName(latestSetup));
  if (sourceSetupVersion && sourceSetupVersion !== releaseVersion) {
    throw new Error(
      [
        "Installer version mismatch.",
        `Expected ${releaseVersion} from manifest/package, got ${sourceSetupVersion} in ${path.basename(latestSetup)}.`,
        "Run the Windows build again and ensure no stale installer is reused.",
      ].join(" "),
    );
  }

  const { dirPath: windowsDistDir } = await createArtifactDir(DIST_ROOT, releaseVersion, "windows");
  // Aligné sur release-all : PoseChrono_v{version}_windows.exe
  const setupName = `PoseChrono_v${releaseVersion}_windows.exe`;
  const setupDest = path.join(windowsDistDir, setupName);
  await fsp.copyFile(latestSetup, setupDest);

  console.log("[release:windows] Build complete");
  console.log(`[release:windows] Setup: ${setupDest}`);

  console.log("[release:windows] Step 3/3: verify windows dist");
  await runCommand("node", ["scripts/verify-windows-dist.js"]);
}

main().catch((err) => {
  console.error("[release:windows] Failed:", err);
  process.exitCode = 1;
});
