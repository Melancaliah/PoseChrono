#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LEGACY_DIR = path.join(ROOT, "js", "shared");

async function main() {
  if (!fs.existsSync(LEGACY_DIR)) {
    console.log("[shared:clean-legacy] Nothing to clean (js/shared missing).");
    return;
  }

  try {
    await fsp.rm(LEGACY_DIR, { recursive: true, force: true });
    console.log("[shared:clean-legacy] Removed legacy folder: js/shared");
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "EPERM" || code === "EACCES" || code === "EBUSY") {
      console.error(
        "[shared:clean-legacy] Failed: js/shared is locked by another process (editor/devtools).",
      );
      console.error(
        "[shared:clean-legacy] Close files using js/shared then run this command again.",
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("[shared:clean-legacy] Failed:", error);
  process.exitCode = 1;
});
