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

function isAppImageFileName(name) {
  return (
    /^PoseChrono-.*\.AppImage$/i.test(String(name || "")) ||
    /^posechrono-desktop-[0-9A-Za-z._-]+-x64\.AppImage$/i.test(String(name || "")) ||
    /^PoseChrono_v[0-9A-Za-z._-]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_linux_T[0-9]{2}-[0-9]{2}_[0-9]{2}\.AppImage$/i.test(String(name || ""))
  );
}

function toSafeVersion(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[^0-9A-Za-z._-]/g, "-");
  return raw || "0.0.0";
}

function extractVersionFromAppImageName(filePath) {
  const fileName = path.basename(String(filePath || ""));
  const match = fileName.match(/^PoseChrono-(.+)\.AppImage$/i);
  if (match && match[1]) return String(match[1]).trim();
  const destMatch = fileName.match(/^posechrono-desktop-([0-9A-Za-z._-]+)-x64\.AppImage$/i);
  if (destMatch && destMatch[1]) return String(destMatch[1]).trim();
  return "";
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
  throw new Error(`[release:linux] Unable to allocate output folder for '${platform}'.`);
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

async function findLatestAppImage() {
  let entries;
  try {
    entries = await fsp.readdir(DESKTOP_DIST_DIR, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isAppImageFileName(entry.name)) continue;
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
  const desktopVersion = desktopPkg && desktopPkg.version ? String(desktopPkg.version) : "";

  if (manifestVersion && desktopVersion && manifestVersion !== desktopVersion) {
    console.warn(
      `[release:linux] Version mismatch: manifest=${manifestVersion} desktop=${desktopVersion}`,
    );
  }

  console.log("[release:linux] Step 0/3: sync desktop package version from manifest");
  await runCommand("node", [SYNC_DESKTOP_VERSION_SCRIPT]);

  const desktopPkgAfterSync = await readJson(DESKTOP_PACKAGE_PATH);
  const desktopVersionAfterSync = String(desktopPkgAfterSync?.version || "");

  if (process.platform === "win32") {
    console.warn(
      "[release:linux] WARNING: Building Linux AppImage on Windows requires symlink privileges.\n" +
      "  If the build fails with 'A required privilege is not held':\n" +
      "  → Enable Windows Developer Mode (Settings → System → For developers)\n" +
      "  → OR run as Administrator\n" +
      "  → OR build from WSL2 / Linux / macOS",
    );
  }

  console.log("[release:linux] Step 1/3: build Linux AppImage");
  try {
    await runCommand("npm", ["--prefix", "apps/desktop", "run", "build:linux"]);
  } catch (error) {
    const existing = await findLatestAppImage();
    if (!existing) throw error;
    console.warn(
      `[release:linux] Build step failed. Reusing latest existing AppImage from apps/desktop/dist.`,
    );
  }

  console.log("[release:linux] Step 2/3: collect artifacts to dist/linux");
  const latestAppImage = await findLatestAppImage();
  if (!latestAppImage) {
    throw new Error("No AppImage found in apps/desktop/dist");
  }

  const releaseVersion = toSafeVersion(
    manifestVersion || desktopVersionAfterSync || desktopVersion,
  );
  const sourceVersion = toSafeVersion(extractVersionFromAppImageName(latestAppImage));
  if (sourceVersion && sourceVersion !== releaseVersion) {
    throw new Error(
      [
        "AppImage version mismatch.",
        `Expected ${releaseVersion} from manifest/package, got ${sourceVersion} in ${path.basename(latestAppImage)}.`,
        "Run the Linux build again and ensure no stale AppImage is reused.",
      ].join(" "),
    );
  }

  const { dirPath: linuxDistDir, baseName } = await createArtifactDir(DIST_ROOT, releaseVersion, "linux");
  const appImageName = `${baseName}.AppImage`;
  const appImageDest = path.join(linuxDistDir, appImageName);
  await fsp.copyFile(latestAppImage, appImageDest);

  const releaseMeta = {
    generatedAt: new Date().toISOString(),
    manifestVersion,
    desktopVersion: desktopVersionAfterSync || desktopVersion,
    appImageFile: path.basename(appImageDest),
    source: path.relative(ROOT, latestAppImage),
    sourceAppImageFile: path.basename(latestAppImage),
  };
  await fsp.writeFile(
    path.join(linuxDistDir, "release.json"),
    JSON.stringify(releaseMeta, null, 2),
    "utf8",
  );

  console.log("[release:linux] Build complete");
  console.log(`[release:linux] AppImage: ${appImageDest}`);
  console.log(`[release:linux] Metadata: ${path.join(linuxDistDir, "release.json")}`);

  console.log("[release:linux] Step 3/3: verify linux dist");
  await runCommand("node", ["scripts/verify-linux-dist.js"]);
}

main().catch((err) => {
  console.error("[release:linux] Failed:", err);
  process.exitCode = 1;
});
