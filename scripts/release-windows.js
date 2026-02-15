#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DESKTOP_DIR = path.join(ROOT, "apps", "desktop");
const DESKTOP_DIST_DIR = path.join(DESKTOP_DIR, "dist");
const WINDOWS_DIST_DIR = path.join(ROOT, "dist", "windows");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const DESKTOP_PACKAGE_PATH = path.join(DESKTOP_DIR, "package.json");

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
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
    if (!/^PoseChrono-Setup-.*\.exe$/i.test(entry.name)) continue;
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
  await runCommand("npm", ["--prefix", "apps/desktop", "run", "build:win:unsigned"]);

  console.log("[release:windows] Step 2/2: collect artifacts to dist/windows");
  const latestSetup = await findLatestWindowsSetup();
  if (!latestSetup) {
    throw new Error("No setup .exe found in apps/desktop/dist");
  }

  await fsp.mkdir(WINDOWS_DIST_DIR, { recursive: true });
  const setupName = path.basename(latestSetup);
  const setupDest = path.join(WINDOWS_DIST_DIR, setupName);
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
  };
  await fsp.writeFile(
    path.join(WINDOWS_DIST_DIR, "release.json"),
    JSON.stringify(releaseMeta, null, 2),
    "utf8",
  );

  console.log("[release:windows] Build complete");
  console.log(`[release:windows] Setup: ${setupDest}`);
  if (blockmapCopied) {
    console.log(`[release:windows] Blockmap: ${blockmapDest}`);
  }
  console.log(
    `[release:windows] Metadata: ${path.join(WINDOWS_DIST_DIR, "release.json")}`,
  );
}

main().catch((err) => {
  console.error("[release:windows] Failed:", err);
  process.exitCode = 1;
});

