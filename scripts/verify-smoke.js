#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const SYNTAX_FILES = [
  "js/platform/platform-api.js",
  "js/platform/eagle-adapter.js",
  "js/shared/preferences-core.js",
  "js/shared/ui-preferences.js",
  "js/shared/i18n-utils.js",
  "js/shared/dom-safety-utils.js",
  "js/shared/storage-adapter.js",
  "js/shared/runtime-mode-utils.js",
  "js/shared/preferences-transfer-utils.js",
  "js/shared/platform-access-utils.js",
  "js/shared/platform-capability-utils.js",
  "js/shared/platform-ops-utils.js",
  "js/shared/platform-window-utils.js",
  "js/shared/session-plan-utils.js",
  "js/shared/session-metrics.js",
  "js/shared/custom-session-utils.js",
  "js/shared/session-flow-utils.js",
  "js/shared/timer-tick-utils.js",
  "js/shared/review-session-utils.js",
  "js/shared/review-grid-utils.js",
  "js/shared/review-interactions-utils.js",
  "js/shared/session-replay-utils.js",
  "js/shared/session-media-utils.js",
  "js/shared/session-mode-ui-utils.js",
  "js/shared/session-time-format-utils.js",
  "js/shared/session-duration-buttons-utils.js",
  "js/shared/session-time-input-utils.js",
  "js/shared/hotkeys-utils.js",
  "js/shared/storage-diagnostics-utils.js",
  "js/shared/timeline-sanitizer-utils.js",
  "js/shared/timeline-date-utils.js",
  "js/shared/timeline-media-utils.js",
  "js/shared/timeline-display-utils.js",
  "js/shared/timeline-feedback-utils.js",
  "js/shared/timeline-format-utils.js",
  "js/timeline.js",
  "js/plugin.js",
];

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

  console.log("[verify:smoke] Step 1/4: JS syntax checks");
  for (const relPath of SYNTAX_FILES) {
    const stepOk = runNodeCheck(relPath);
    ok = stepOk && ok;
    if (!stepOk) break;
  }

  if (ok) {
    console.log("[verify:smoke] Step 2/4: locale verification");
    ok = runNodeScript("scripts/verify-locales.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 3/4: Eagle release build");
    ok = runNodeScript("scripts/release-eagle.js") && ok;
  }

  if (ok) {
    console.log("[verify:smoke] Step 4/4: Eagle dist verification");
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
