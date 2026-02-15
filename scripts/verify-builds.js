#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function runNodeScript(relScriptPath, args = []) {
  const scriptPath = path.join(ROOT, relScriptPath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  return result.status === 0;
}

function existsDesktopScaffold() {
  const fs = require("fs");
  const required = [
    "apps/desktop/package.json",
    "apps/desktop/src/main.js",
    "apps/desktop/src/preload.js",
    "apps/desktop/src/renderer/index.html",
    "apps/desktop/src/renderer/renderer.js",
  ];
  return required.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
}

function main() {
  let ok = true;

  console.log("[verify:builds] Step 1/8: sync shared mirror");
  ok = runNodeScript("scripts/sync-shared-packages.js") && ok;

  console.log("[verify:builds] Step 2/8: verify shared mirror integrity");
  ok = runNodeScript("scripts/verify-shared-sync.js") && ok;

  console.log("[verify:builds] Step 3/8: verify locales");
  ok = runNodeScript("scripts/verify-locales.js") && ok;

  console.log("[verify:builds] Step 4/8: verify platform decoupling");
  ok = runNodeScript("scripts/verify-platform-decoupling.js") && ok;

  console.log("[verify:builds] Step 5/8: release eagle dist");
  ok = runNodeScript("scripts/release-eagle.js") && ok;

  console.log("[verify:builds] Step 6/8: verify eagle dist");
  ok = runNodeScript("scripts/verify-eagle-dist.js") && ok;

  console.log("[verify:builds] Step 7/8: release desktop dist");
  ok = runNodeScript("scripts/release-desktop.js") && ok;

  console.log("[verify:builds] Step 8/8: verify desktop dist");
  ok = runNodeScript("scripts/verify-desktop-dist.js") && ok;

  const missingDesktop = existsDesktopScaffold();
  if (missingDesktop.length > 0) {
    ok = false;
    console.error("[verify:builds] Desktop scaffold missing file(s):");
    missingDesktop.forEach((rel) => console.error(`  - ${rel}`));
  } else {
    console.log("[verify:builds] Desktop scaffold: OK");
  }

  if (!ok) {
    console.error("[verify:builds] FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("[verify:builds] OK");
}

main();
