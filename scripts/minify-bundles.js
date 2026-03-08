#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Minifie les bundles JS pour la production.
 *
 * Usage :
 *   node scripts/minify-bundles.js [--dry-run]
 *
 * Crée des fichiers .min.js à côté des originaux.
 * En mode release, les scripts de release peuvent copier les .min.js
 * par-dessus les originaux dans le dossier dist/.
 */

const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const BUNDLES = [
  {
    label: "shared.bundle",
    src: path.join(ROOT, "packages", "shared", "shared.bundle.js"),
    out: path.join(ROOT, "packages", "shared", "shared.bundle.min.js"),
  },
  {
    label: "syncro.module",
    src: path.join(ROOT, "js", "syncroModule", "syncro.module.js"),
    out: path.join(ROOT, "js", "syncroModule", "syncro.module.min.js"),
  },
  {
    label: "plugin",
    src: path.join(ROOT, "js", "plugin.js"),
    out: path.join(ROOT, "js", "plugin.min.js"),
  },
];

async function minifyFile(bundle, dryRun) {
  let terser;
  try {
    terser = require("terser");
  } catch {
    // Fallback to dynamic import for npx
    const mod = await import("terser");
    terser = mod.default || mod;
  }

  const raw = await fsp.readFile(bundle.src, "utf8");
  const sizeBefore = Buffer.byteLength(raw, "utf8");

  const result = await terser.minify(raw, {
    compress: {
      passes: 2,
      drop_console: false,
      ecma: 2020,
    },
    mangle: {
      toplevel: false,
    },
    format: {
      comments: false,
      ecma: 2020,
    },
  });

  if (result.error) throw result.error;

  const sizeAfter = Buffer.byteLength(result.code, "utf8");
  const reduction = ((1 - sizeAfter / sizeBefore) * 100).toFixed(1);
  const savedKB = ((sizeBefore - sizeAfter) / 1024).toFixed(1);

  console.log(
    `  ${bundle.label}: ${(sizeBefore / 1024).toFixed(1)}KB → ${(sizeAfter / 1024).toFixed(1)}KB (−${savedKB}KB, −${reduction}%)`,
  );

  if (!dryRun) {
    await fsp.writeFile(bundle.out, result.code, "utf8");
    console.log(`    → ${path.relative(ROOT, bundle.out)}`);
  }

  return { label: bundle.label, sizeBefore, sizeAfter };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[minify-bundles] ${dryRun ? "DRY RUN" : "Minifying"}...\n`);

  const results = [];
  for (const bundle of BUNDLES) {
    try {
      const r = await minifyFile(bundle, dryRun);
      results.push(r);
    } catch (error) {
      console.error(`  ${bundle.label}: FAILED — ${error.message}`);
    }
  }

  if (results.length > 0) {
    const totalBefore = results.reduce((s, r) => s + r.sizeBefore, 0);
    const totalAfter = results.reduce((s, r) => s + r.sizeAfter, 0);
    console.log(
      `\n[minify-bundles] Total: ${(totalBefore / 1024).toFixed(1)}KB → ${(totalAfter / 1024).toFixed(1)}KB (−${((totalBefore - totalAfter) / 1024).toFixed(1)}KB)`,
    );
  }
}

main().catch((error) => {
  console.error("[minify-bundles] Fatal:", error);
  process.exitCode = 1;
});
