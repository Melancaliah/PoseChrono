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

function isWindowsSetupFileName(name) {
  return (
    /^PoseChrono-Setup-.*\.exe$/i.test(String(name || "")) ||
    /^posechrono-desktop-[0-9A-Za-z._-]+-setup\.exe$/i.test(
      String(name || ""),
    )
  );
}

function toSafeVersion(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[^0-9A-Za-z._-]/g, "-");
  return raw || "0.0.0";
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
    `[release:windows] Unable to allocate output folder for prefix '${prefix}'.`,
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

async function copyIfExists(src, dest) {
  try {
    await fsp.access(src, fs.constants.F_OK);
  } catch (_) {
    return false;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  return true;
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

  console.log("[release:windows] Step 1/2: build unsigned Windows installer");
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

  console.log("[release:windows] Step 2/2: collect artifacts to dist/windows");
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

  const windowsDistDir = await createIncrementedOutputDir(DIST_ROOT, "windows");
  const releaseVersion = toSafeVersion(manifestVersion || desktopVersion);
  const setupName = `posechrono-desktop-${releaseVersion}-setup.exe`;
  const setupDest = path.join(windowsDistDir, setupName);
  await fsp.copyFile(latestSetup, setupDest);

  const blockmapSrc = `${latestSetup}.blockmap`;
  const blockmapDest = `${setupDest}.blockmap`;
  const blockmapCopied = await copyIfExists(blockmapSrc, blockmapDest);

  const releaseMeta = {
    generatedAt: new Date().toISOString(),
    manifestVersion,
    desktopVersion,
    setupFile: path.basename(setupDest),
    blockmapFile: blockmapCopied ? path.basename(blockmapDest) : null,
    source: path.relative(ROOT, latestSetup),
    sourceSetupFile: path.basename(latestSetup),
  };
  await fsp.writeFile(
    path.join(windowsDistDir, "release.json"),
    JSON.stringify(releaseMeta, null, 2),
    "utf8",
  );

  console.log("[release:windows] Build complete");
  console.log(`[release:windows] Setup: ${setupDest}`);
  if (blockmapCopied) {
    console.log(`[release:windows] Blockmap: ${blockmapDest}`);
  }
  console.log(
    `[release:windows] Metadata: ${path.join(windowsDistDir, "release.json")}`,
  );

  console.log("[release:windows] Step 3/3: verify windows dist");
  await runCommand("node", ["scripts/verify-windows-dist.js"]);
}

main().catch((err) => {
  console.error("[release:windows] Failed:", err);
  process.exitCode = 1;
});
