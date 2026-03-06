#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "js", "config.js");

function normalizeBool(value, label) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "true" || v === "1") return "true";
  if (v === "false" || v === "0") return "false";
  throw new Error(`[set-sync-flags] Invalid ${label}: '${value}' (expected true/false)`);
}

function main() {
  const enabled = normalizeBool(process.argv[2], "enabled");
  const allowPublicSync = normalizeBool(process.argv[3], "allowPublicSync");

  const source = fs.readFileSync(CONFIG_PATH, "utf8");
  const syncMatch = source.match(/SYNC\s*:\s*\{[\s\S]*?\n\s*\},/);
  if (!syncMatch) {
    throw new Error("[set-sync-flags] Could not locate SYNC block in js/config.js");
  }

  const syncBlock = syncMatch[0];
  const nextSyncBlock = syncBlock
    .replace(
      /^(\s*enabled\s*:\s*)(true|false)(\s*,.*)$/m,
      `$1${enabled}$3`,
    )
    .replace(
      /^(\s*allowPublicSync\s*:\s*)(true|false)(\s*,.*)$/m,
      `$1${allowPublicSync}$3`,
    );

  if (nextSyncBlock === syncBlock) {
    console.log(
      `[set-sync-flags] No change needed: enabled=${enabled}, allowPublicSync=${allowPublicSync}`,
    );
    return;
  }

  const output = source.replace(syncBlock, nextSyncBlock);
  fs.writeFileSync(CONFIG_PATH, output, "utf8");
  console.log(
    `[set-sync-flags] Updated js/config.js: enabled=${enabled}, allowPublicSync=${allowPublicSync}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
