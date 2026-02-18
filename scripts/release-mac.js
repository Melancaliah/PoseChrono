#!/usr/bin/env node
/* eslint-disable no-console */
// NOTE: macOS DMG builds require running on macOS. This script will fail on Windows/Linux.
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

function isDmgFileName(name) {
  return (
    /^PoseChrono-.*\.dmg$/i.test(String(name || "")) ||
    /^posechrono-desktop-[0-9A-Za-z._-]+\.dmg$/i.test(String(name || "")) ||
    /^PoseChrono_v[0-9A-Za-z._-]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_mac(?:-(?:x64|arm64))?_T[0-9]{2}-[0-9]{2}_[0-9]{2}\.dmg$/i.test(String(name || ""))
  );
}

function toSafeVersion(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[^0-9A-Za-z._-]/g, "-");
  return raw || "0.0.0";
}

function extractVersionAndArchFromDmgName(filePath) {
  const fileName = path.basename(String(filePath || ""));
  // PoseChrono-1.0.6-arm64.dmg or PoseChrono-1.0.6.dmg
  const match = fileName.match(/^PoseChrono-([0-9A-Za-z._-]+?)(?:-(x64|arm64))?\.dmg$/i);
  if (match) {
    return { version: String(match[1]).trim(), arch: match[2] || "x64" };
  }
  return { version: "", arch: "x64" };
}

function formatArtifactBaseName(version, platform, date = new Date()) {
  const safe = String(version || "0.0.0").trim().replace(/[^0-9A-Za-z._-]/g, "-");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `PoseChrono_v${safe}_${year}-${month}-${day}_${platform}_T${hours}-${minutes}`;
}

async function createArtifactDir(rootDir, version, platform) {
  await fsp.mkdir(rootDir, { recursive: true });
  const base = formatArtifactBaseName(version, platform);
  for (let index = 1; index < 1000; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const fullName = `${base}_${suffix}`;
    const candidate = path.join(rootDir, fullName);
    try {
      await fsp.mkdir(candidate, { recursive: false });
      return { dirPath: candidate, baseName: fullName };
    } catch (err) {
      if (err && err.code === "EEXIST") continue;
      throw err;
    }
  }
  throw new Error(`[release:mac] Unable to allocate output folder for '${platform}'.`);
}

function toShellArg(value) {
  const str = String(value ?? "");
  if (!/[\s"&|<>^]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === "win32";
    const child = useShell
      ? spawn(
          [command, ...args.map((arg) => toShellArg(arg))].join(" "),
          { cwd: ROOT, stdio: "inherit", shell: true, ...options },
        )
      : spawn(command, args, { cwd: ROOT, stdio: "inherit", shell: false, ...options });
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

async function findAllDmgFiles() {
  let entries;
  try {
    entries = await fsp.readdir(DESKTOP_DIST_DIR, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isDmgFileName(entry.name)) continue;
    const fullPath = path.join(DESKTOP_DIST_DIR, entry.name);
    const stat = await fsp.stat(fullPath);
    candidates.push({ fullPath, stat, name: entry.name });
  }
  candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return candidates;
}

async function main() {
  if (process.platform !== "darwin") {
    console.error(
      "[release:mac] ERROR: macOS DMG builds require running on macOS.\n" +
      "This script cannot be run on Windows or Linux.\n" +
      "Use a Mac or a CI/CD pipeline with a macOS runner.",
    );
    process.exitCode = 1;
    return;
  }

  const manifest = await readJson(MANIFEST_PATH);
  const desktopPkg = await readJson(DESKTOP_PACKAGE_PATH);
  const manifestVersion = manifest && manifest.version ? String(manifest.version) : "";
  const desktopVersion = desktopPkg && desktopPkg.version ? String(desktopPkg.version) : "";

  if (manifestVersion && desktopVersion && manifestVersion !== desktopVersion) {
    console.warn(
      `[release:mac] Version mismatch: manifest=${manifestVersion} desktop=${desktopVersion}`,
    );
  }

  console.log("[release:mac] Step 0/3: sync desktop package version from manifest");
  await runCommand("node", [SYNC_DESKTOP_VERSION_SCRIPT]);

  const desktopPkgAfterSync = await readJson(DESKTOP_PACKAGE_PATH);
  const desktopVersionAfterSync = String(desktopPkgAfterSync?.version || "");

  console.log("[release:mac] Step 1/3: build macOS DMG");
  try {
    await runCommand("npm", ["--prefix", "apps/desktop", "run", "build:mac"]);
  } catch (error) {
    const existing = await findAllDmgFiles();
    if (!existing.length) throw error;
    console.warn(
      `[release:mac] Build step failed. Reusing latest existing DMG(s) from apps/desktop/dist.`,
    );
  }

  console.log("[release:mac] Step 2/3: collect artifacts to dist/mac");
  const dmgFiles = await findAllDmgFiles();
  if (!dmgFiles.length) {
    throw new Error("No DMG found in apps/desktop/dist");
  }

  const releaseVersion = toSafeVersion(
    manifestVersion || desktopVersionAfterSync || desktopVersion,
  );

  const { dirPath: macDistDir, baseName } = await createArtifactDir(DIST_ROOT, releaseVersion, "mac");
  const copiedFiles = [];

  for (const dmg of dmgFiles) {
    const { version: sourceVersion, arch } = extractVersionAndArchFromDmgName(dmg.fullPath);
    if (sourceVersion && sourceVersion !== releaseVersion) {
      console.warn(
        `[release:mac] Skipping ${dmg.name}: version mismatch (expected ${releaseVersion}, got ${sourceVersion})`,
      );
      continue;
    }
    // baseName = "PoseChrono_v1.0.6_2026-02-18_mac_T15-38_01"
    // destName = "PoseChrono_v1.0.6_2026-02-18_mac-x64_T15-38_01.dmg"
    const [namePrefix, nameSuffix] = baseName.split("_mac_");
    const destName = `${namePrefix}_mac-${arch}_${nameSuffix}.dmg`;
    const destPath = path.join(macDistDir, destName);
    await fsp.copyFile(dmg.fullPath, destPath);
    copiedFiles.push({ src: dmg.name, dest: destName, arch });
    console.log(`[release:mac] DMG (${arch}): ${destPath}`);
  }

  if (!copiedFiles.length) {
    throw new Error("No DMG files matched the expected version. Run the macOS build again.");
  }

  const releaseMeta = {
    generatedAt: new Date().toISOString(),
    manifestVersion,
    desktopVersion: desktopVersionAfterSync || desktopVersion,
    dmgFiles: copiedFiles.map((f) => f.dest),
    sources: copiedFiles.map((f) => f.src),
  };
  await fsp.writeFile(
    path.join(macDistDir, "release.json"),
    JSON.stringify(releaseMeta, null, 2),
    "utf8",
  );

  console.log("[release:mac] Build complete");
  console.log(`[release:mac] Metadata: ${path.join(macDistDir, "release.json")}`);

  console.log("[release:mac] Step 3/3: verify mac dist");
  await runCommand("node", ["scripts/verify-mac-dist.js"]);
}

main().catch((err) => {
  console.error("[release:mac] Failed:", err);
  process.exitCode = 1;
});
