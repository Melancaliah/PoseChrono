#!/usr/bin/env node
/* eslint-disable no-console */
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const DESKTOP_PACKAGE_PATH = path.join(ROOT, "apps", "desktop", "package.json");

function isValidVersion(version) {
  const value = String(version || "").trim();
  return /^[0-9A-Za-z.+-]+$/.test(value) && value.length > 0;
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const desktopPkg = await readJson(DESKTOP_PACKAGE_PATH);

  const manifestVersion = String(manifest?.version || "").trim();
  if (!isValidVersion(manifestVersion)) {
    throw new Error(`Invalid manifest version: "${manifestVersion}"`);
  }

  const desktopVersion = String(desktopPkg?.version || "").trim();
  if (desktopVersion === manifestVersion) {
    console.log(
      `[sync:desktop-version] OK (already aligned): ${manifestVersion}`,
    );
    return;
  }

  desktopPkg.version = manifestVersion;
  await writeJson(DESKTOP_PACKAGE_PATH, desktopPkg);
  console.log(
    `[sync:desktop-version] apps/desktop/package.json: ${desktopVersion || "(empty)"} -> ${manifestVersion}`,
  );
}

main().catch((err) => {
  console.error("[sync:desktop-version] Failed:", err.message || err);
  process.exitCode = 1;
});

