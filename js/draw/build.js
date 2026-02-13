const fs = require("fs");
const path = require("path");

// Ordre de concaténation (respecte les dépendances)
const modules = [
  "utils.js",
  "state.js",
  "zoom-manager.js",
  "canvas.js",
  "history.js",
  "measurements.js",
  "toolbar.js",
  "menus.js",
  "tool-handlers.js",
  "lightbox-export.js",
  "zoom-mode.js",
  "lifecycle.js",
];

const drawDir = path.join(__dirname);
const outFile = path.join(__dirname, "..", "draw.bundle.js");

let output = "// PoseChrono Drawing Module - Bundled from js/draw/\n";
output += "// Generated: " + new Date().toISOString() + "\n\n";

for (const mod of modules) {
  const filePath = path.join(drawDir, mod);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing module: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, "utf8");
  output += `// ================================================================\n`;
  output += `// MODULE: ${mod}\n`;
  output += `// ================================================================\n\n`;
  output += content;
  output += "\n\n";
}

fs.writeFileSync(outFile, output, "utf8");
console.log(`Build complete: js/draw.bundle.js (${modules.length} modules)`);

// Watch mode
if (process.argv.includes("--watch")) {
  console.log("Watching for changes...");
  for (const mod of modules) {
    fs.watchFile(path.join(drawDir, mod), { interval: 500 }, () => {
      console.log(`Changed: ${mod}, rebuilding...`);
      try {
        let rebuilt = "// PoseChrono Drawing Module - Bundled from js/draw/\n";
        rebuilt += "// Generated: " + new Date().toISOString() + "\n\n";
        for (const m of modules) {
          const c = fs.readFileSync(path.join(drawDir, m), "utf8");
          rebuilt += `// ================================================================\n`;
          rebuilt += `// MODULE: ${m}\n`;
          rebuilt += `// ================================================================\n\n`;
          rebuilt += c;
          rebuilt += "\n\n";
        }
        fs.writeFileSync(outFile, rebuilt, "utf8");
        console.log("Rebuild complete.");
      } catch (e) {
        console.error("Rebuild failed:", e.message);
      }
    });
  }
}
