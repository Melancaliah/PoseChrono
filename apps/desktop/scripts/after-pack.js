/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

module.exports = async function afterPack(context) {
  if (process.platform !== "win32") return;

  const projectDir = context && context.packager && context.packager.projectDir;
  const appOutDir = context && context.appOutDir;
  const productFilename =
    context &&
    context.packager &&
    context.packager.appInfo &&
    context.packager.appInfo.productFilename;

  if (!projectDir || !appOutDir || !productFilename) return;

  const iconPath = path.join(projectDir, "build", "icon.ico");
  const exePath = path.join(appOutDir, `${productFilename}.exe`);

  if (!fs.existsSync(iconPath)) {
    console.warn(`[afterPack] icon not found: ${iconPath}`);
    return;
  }
  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] exe not found: ${exePath}`);
    return;
  }

  const rcedit = require("rcedit");
  await rcedit(exePath, {
    icon: iconPath,
  });
  console.log(`[afterPack] Updated executable icon: ${exePath}`);
};

