#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script failed: ${scriptPath} (${code})`));
    });
  });
}

async function main() {
  console.log("[release:all] Step 1/8: sync shared mirror");
  await runNodeScript(path.join(ROOT, "scripts", "sync-shared-packages.js"));

  console.log("[release:all] Step 2/8: verify shared mirror integrity");
  await runNodeScript(path.join(ROOT, "scripts", "verify-shared-sync.js"));

  console.log("[release:all] Step 3/8: verify locales");
  await runNodeScript(path.join(ROOT, "scripts", "verify-locales.js"));

  console.log("[release:all] Step 4/8: verify platform decoupling");
  await runNodeScript(path.join(ROOT, "scripts", "verify-platform-decoupling.js"));

  console.log("[release:all] Step 5/8: build Eagle dist");
  await runNodeScript(path.join(ROOT, "scripts", "release-eagle.js"));

  console.log("[release:all] Step 6/8: verify Eagle dist");
  await runNodeScript(path.join(ROOT, "scripts", "verify-eagle-dist.js"));

  console.log("[release:all] Step 7/8: build Windows dist");
  await runNodeScript(path.join(ROOT, "scripts", "release-windows.js"));

  console.log("[release:all] Step 8/8: verify Windows dist");
  await runNodeScript(path.join(ROOT, "scripts", "verify-windows-dist.js"));

  console.log("[release:all] OK");
}

main().catch((err) => {
  console.error("[release:all] Failed:", err);
  process.exitCode = 1;
});
