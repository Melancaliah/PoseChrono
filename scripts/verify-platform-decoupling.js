#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const JS_DIR = path.join(ROOT, "js");

const ALLOWED_FILES = new Set([
  path.normalize("js/platform/eagle-adapter.js"),
]);

const FORBIDDEN_PATTERNS = [
  /\bwindow\.eagle\b/g,
  /\beagle\.[a-zA-Z_]\w*/g,
];

async function listJsFiles(dir) {
  const out = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listJsFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(JS_DIR)) {
    console.error(`[verify:platform-decoupling] Missing folder: ${JS_DIR}`);
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const files = await listJsFiles(JS_DIR);

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath);
    const relNorm = path.normalize(rel);
    if (ALLOWED_FILES.has(relNorm)) continue;
    const content = await fsp.readFile(filePath, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        errors.push(
          `${rel}: found forbidden direct Eagle reference (${matches[0]})`,
        );
        break;
      }
    }
  }

  if (errors.length > 0) {
    console.error("[verify:platform-decoupling] FAILED");
    errors.forEach((msg) => console.error(`  - ${msg}`));
    process.exitCode = 1;
    return;
  }

  console.log("[verify:platform-decoupling] OK");
  console.log(
    `[verify:platform-decoupling] Checked ${files.length} JS files under js/`,
  );
}

main().catch((err) => {
  console.error("[verify:platform-decoupling] Failed:", err);
  process.exitCode = 1;
});

