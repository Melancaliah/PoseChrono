#!/usr/bin/env node
/* eslint-disable no-console */
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILES = {
  manifest: path.join(ROOT, "manifest.json"),
  desktop: path.join(ROOT, "apps", "desktop", "package.json"),
  tooling: path.join(ROOT, "package.json"),
};

function isValidSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(String(version || "").trim());
}

function bumpSemver(version, kind) {
  const [major, minor, patch] = String(version)
    .split(".")
    .map((n) => Number.parseInt(n, 10));
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    throw new Error(`Invalid version: ${version}`);
  }
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "major") return `${major + 1}.0.0`;
  throw new Error(`Unknown bump kind: ${kind}`);
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Usage:");
    console.log("  node scripts/bump-version.js <x.y.z>");
    console.log("  node scripts/bump-version.js patch|minor|major");
    process.exitCode = 1;
    return;
  }

  const manifest = await readJson(FILES.manifest);
  const desktop = await readJson(FILES.desktop);
  const tooling = await readJson(FILES.tooling);

  const current = String(manifest.version || "").trim();
  const currentDesktop = String(desktop.version || "").trim();
  const currentTooling = String(tooling.version || "").trim();
  if (!isValidSemver(current)) {
    throw new Error(`manifest.json has invalid version: "${current}"`);
  }

  let nextVersion = arg.trim();
  if (["patch", "minor", "major"].includes(nextVersion)) {
    nextVersion = bumpSemver(current, nextVersion);
  }

  if (!isValidSemver(nextVersion)) {
    throw new Error(`Invalid target version: "${nextVersion}"`);
  }

  manifest.version = nextVersion;
  desktop.version = nextVersion;
  tooling.version = nextVersion;

  await writeJson(FILES.manifest, manifest);
  await writeJson(FILES.desktop, desktop);
  await writeJson(FILES.tooling, tooling);

  console.log(`[bump-version] manifest.json: ${current} -> ${nextVersion}`);
  console.log(`[bump-version] apps/desktop/package.json: ${currentDesktop} -> ${nextVersion}`);
  console.log(`[bump-version] package.json: ${currentTooling} -> ${nextVersion}`);
}

main().catch((err) => {
  console.error("[bump-version] Failed:", err.message || err);
  process.exitCode = 1;
});
