#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const SYNTAX_FILES = [
  "js/platform/platform-api.js",
  "js/platform/eagle-adapter.js",
  "js/timeline.js",
  "js/plugin.js",
];

function collectSharedSyntaxFiles() {
  const sharedDir = path.join(ROOT, "packages", "shared");
  if (!fs.existsSync(sharedDir)) return [];

  const out = [];
  const stack = [sharedDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".js")) continue;
      out.push(path.relative(ROOT, full).replace(/\\/g, "/"));
    }
  }

  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function runStep(label, command, args = []) {
  console.log(`[verify:smoke] ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  return result.status === 0;
}

function runNodeCheck(filePath) {
  return runStep(
    `node --check ${filePath}`,
    process.execPath,
    ["--check", filePath],
  );
}

function runNodeScript(relScriptPath, args = []) {
  return runStep(
    `node ${relScriptPath}${args.length ? ` ${args.join(" ")}` : ""}`,
    process.execPath,
    [relScriptPath, ...args],
  );
}

function main() {
  let ok = true;

  if (ok) {
    console.log("[verify:smoke] Step 1/7: sync shared package metadata");
    ok = runNodeScript("scripts/sync-shared-packages.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 1b/7: build shared bundle");
    ok = runNodeScript("scripts/build-shared-bundle.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 2/7: verify shared source + legacy guard");
    ok = runNodeScript("scripts/verify-shared-sync.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 3/7: JS syntax checks");
    const sharedSyntaxFiles = collectSharedSyntaxFiles();
    const syntaxFiles = [...SYNTAX_FILES.slice(0, 2), ...sharedSyntaxFiles, ...SYNTAX_FILES.slice(2)];
    for (const relPath of syntaxFiles) {
      const stepOk = runNodeCheck(relPath);
      ok = stepOk && ok;
      if (!stepOk) break;
    }
  }

  if (ok) {
    console.log("[verify:smoke] Step 4/7: platform decoupling verification");
    ok = runNodeScript("scripts/verify-platform-decoupling.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 5/7: locale verification");
    ok = runNodeScript("scripts/verify-locales.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 6/7: Eagle release build");
    ok = runNodeScript("scripts/release-eagle.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 7/7: Eagle dist verification");
    ok = runNodeScript("scripts/verify-eagle-dist.js") && ok;
  }

  if (!ok) {
    console.error("[verify:smoke] FAILED");
    process.exitCode = 1;
    return;
  }

  console.log("[verify:smoke] OK");
}

main();
