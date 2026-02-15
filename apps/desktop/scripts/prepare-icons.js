#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(DESKTOP_ROOT, "build");

const ROOT_LOGO_PNG = path.join(ROOT, "logo.png");
const ROOT_LOGO_ICO = path.join(ROOT, "logo.ico");

async function exists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function copyFile(src, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
}

async function main() {
  await fsp.mkdir(BUILD_DIR, { recursive: true });

  const iconPngOut = path.join(BUILD_DIR, "icon.png");
  const iconIcoOut = path.join(BUILD_DIR, "icon.ico");

  if (!(await exists(ROOT_LOGO_PNG))) {
    throw new Error(`Missing required icon source: ${ROOT_LOGO_PNG}`);
  }
  if (!(await exists(ROOT_LOGO_ICO))) {
    throw new Error(`Missing required icon source: ${ROOT_LOGO_ICO}`);
  }

  await copyFile(ROOT_LOGO_PNG, iconPngOut);
  await copyFile(ROOT_LOGO_ICO, iconIcoOut);

  console.log(`[desktop:prepare-icons] icon.png <- ${ROOT_LOGO_PNG}`);
  console.log(`[desktop:prepare-icons] icon.ico <- ${ROOT_LOGO_ICO}`);
}

main().catch((err) => {
  console.error("[desktop:prepare-icons] Failed:", err);
  process.exitCode = 1;
});
