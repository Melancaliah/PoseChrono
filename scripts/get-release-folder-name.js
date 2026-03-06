#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");

function pad(value) {
  return String(value).padStart(2, "0");
}

function toSafeVersion(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[^0-9A-Za-z._-]/g, "-");
  return raw || "0.0.0";
}

function main() {
  let version = "0.0.0";
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    if (manifest && manifest.version) {
      version = String(manifest.version);
    }
  } catch (_) {
    // keep fallback
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  console.log(`${toSafeVersion(version)}_${stamp}`);
}

main();
