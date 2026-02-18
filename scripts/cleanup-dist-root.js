#!/usr/bin/env node
/* eslint-disable no-console */
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const ALLOWED = new Set(["_SYNC", "_SYNC_LOCAL-ONLY", "_NO_SYNC"]);

function isRetryableFsError(error) {
  const code = String(error && error.code ? error.code : "");
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeWithRetry(targetPath, retries = 120, delayMs = 500) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await fsp.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (error && error.code === "ENOENT") return;
      if (!isRetryableFsError(error) || attempt === retries) {
        throw error;
      }
      await sleep(delayMs);
    }
  }
  throw lastError || new Error(`Failed to remove '${targetPath}'`);
}

async function main() {
  let entries = [];
  try {
    entries = await fsp.readdir(DIST_DIR, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    if (ALLOWED.has(entry.name)) continue;
    const fullPath = path.join(DIST_DIR, entry.name);
    await removeWithRetry(fullPath);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
