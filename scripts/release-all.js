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
  console.log("[release:all] Step 1/4: verify locales");
  await runNodeScript(path.join(ROOT, "scripts", "verify-locales.js"));

  console.log("[release:all] Step 2/4: build Eagle dist");
  await runNodeScript(path.join(ROOT, "scripts", "release-eagle.js"));

  console.log("[release:all] Step 3/4: verify Eagle dist");
  await runNodeScript(path.join(ROOT, "scripts", "verify-eagle-dist.js"));

  console.log("[release:all] Step 4/4: build Windows dist");
  await runNodeScript(path.join(ROOT, "scripts", "release-windows.js"));

  console.log("[release:all] OK");
}

main().catch((err) => {
  console.error("[release:all] Failed:", err);
  process.exitCode = 1;
});

