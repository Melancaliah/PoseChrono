#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");

function toBoolString(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return "true";
  if (normalized === "false" || normalized === "0") return "false";
  throw new Error(`Invalid boolean value: '${value}'`);
}

async function findLatestDirectory(nameRegex) {
  const entries = await fsp.readdir(DIST_DIR, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!nameRegex.test(entry.name)) continue;
    const fullPath = path.join(DIST_DIR, entry.name);
    const stat = await fsp.stat(fullPath);
    candidates.push({ name: entry.name, fullPath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] || null;
}

async function findLatestFile(nameRegex) {
  const entries = await fsp.readdir(DIST_DIR, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!nameRegex.test(entry.name)) continue;
    const fullPath = path.join(DIST_DIR, entry.name);
    const stat = await fsp.stat(fullPath);
    candidates.push({ name: entry.name, fullPath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] || null;
}

async function findLatestExe(directoryPath) {
  const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.exe$/i.test(entry.name)) continue;
    const fullPath = path.join(directoryPath, entry.name);
    const stat = await fsp.stat(fullPath);
    candidates.push({ name: entry.name, fullPath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] || null;
}

async function main() {
  const targetRelative = process.argv[2];
  const variant = process.argv[3] || "";
  const syncEnabled = toBoolString(process.argv[4]);
  const allowPublicSync = toBoolString(process.argv[5]);

  if (!targetRelative) {
    throw new Error(
      "Usage: node scripts/collect-multi-artifacts.js <targetRelativeDir> <variant> <syncEnabled> <allowPublicSync>",
    );
  }

  const targetDir = path.join(ROOT, targetRelative);
  await fsp.mkdir(targetDir, { recursive: true });

  const windows = await findLatestDirectory(/^PoseChrono_v.+_windows_T\d{2}-\d{2}_\d{2}$/);
  if (!windows) {
    throw new Error("No Windows artifact folder found in dist.");
  }
  const desktopExe = await findLatestExe(windows.fullPath);
  if (!desktopExe) {
    throw new Error(`No .exe found in ${windows.fullPath}`);
  }

  const eagle = await findLatestDirectory(/^PoseChrono_v.+_eagle_T\d{2}-\d{2}_\d{2}$/);
  if (!eagle) {
    throw new Error("No Eagle artifact folder found in dist.");
  }

  const eagleZip = await findLatestFile(
    /^PoseChrono_v.+_eagle_T\d{2}-\d{2}_\d{2}(-locked-[0-9TZ:.-]+)?\.zip$/,
  );

  const desktopDest = path.join(targetDir, "desktop");
  const eagleDest = path.join(targetDir, "eagle");
  await fsp.mkdir(desktopDest, { recursive: true });
  await fsp.mkdir(eagleDest, { recursive: true });

  const movedExePath = path.join(desktopDest, desktopExe.name);
  await fsp.copyFile(desktopExe.fullPath, movedExePath);

  const movedEagleDir = path.join(eagleDest, eagle.name);
  await fsp.cp(
    eagle.fullPath,
    movedEagleDir,
    { recursive: true, force: true },
  );

  let movedZipPath = null;
  if (eagleZip) {
    movedZipPath = path.join(eagleDest, eagleZip.name);
    await fsp.copyFile(eagleZip.fullPath, movedZipPath);
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    variant,
    syncEnabled,
    allowPublicSync,
    desktopExe: desktopExe.name,
    windowsArtifactFolder: windows.name,
    eagleArtifact: eagle.name,
    eagleZip: eagleZip ? eagleZip.name : null,
    movedDesktopExeTo: path.relative(ROOT, movedExePath),
    movedEagleDirTo: path.relative(ROOT, movedEagleDir),
    movedEagleZipTo: movedZipPath ? path.relative(ROOT, movedZipPath) : null,
  };

  await fsp.writeFile(
    path.join(targetDir, "build-info.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
