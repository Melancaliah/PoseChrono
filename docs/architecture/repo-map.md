# PoseChrono Repository Map

This document defines the source-of-truth layout so Eagle and Desktop stay aligned without polluting each release artifact.

## 1) Product Boundaries

- Eagle plugin runtime entrypoints stay at repository root:
  - `manifest.json`
  - `index.html`
- Shared browser/runtime logic lives in:
  - `packages/shared/`
- Desktop shell (Electron) lives in:
  - `apps/desktop/`

Rule: shared logic goes to `packages/shared` first. Platform-specific behavior stays in adapters/bridges.

## 2) Folder Responsibilities

- `_locales/`: translation files used by runtime and release packaging.
- `assets/`: icons and static assets used by Eagle/Desktop.
- `css/`: UI styles.
- `js/`: runtime composition and platform glue (`plugin.js`, `timeline.js`, `js/platform/*`).
- `packages/shared/`: reusable cross-platform modules (single source of truth).
- `apps/desktop/`: Electron app (`src/main.js`, preload bridge, builder config).
- `scripts/`: build/release/verification automation.
- `generation/`: Windows `.bat` wrappers for common generation and verification actions.
- `docs/`: release, architecture, and manual QA documentation.
- `tasks/`: migration/restructuration planning and execution tracking.
- `dist/`: generated artifacts only (never source).

## 3) Runtime Data Flow

- Eagle:
  - Eagle loads root `index.html`.
  - Runtime uses shared modules from `packages/shared`.
  - Platform calls go through `js/platform/eagle-adapter.js`.
- Desktop:
  - Electron starts `apps/desktop/src/main.js`.
  - `scripts/sync-desktop-web.js` mirrors runtime web files into `apps/desktop/web`.
  - Runtime keeps same shared modules and platform contract.

## 4) Release Outputs

- Eagle release:
  - command: `npm run release:eagle`
  - output: `dist/eagle-plugin/` (or timestamp fallback) and `dist/eagle/*.zip`
- Windows release:
  - command: `npm run release:windows`
  - output: `dist/windows/`
- Both:
  - command: `npm run release:all`

## 5) Update Workflow (Recommended)

1. Implement or modify cross-platform logic in `packages/shared`.
2. Update adapters/glue (`js/platform/*`, `plugin.js`, `timeline.js`) only for integration points.
3. Run gates:
   - `npm run verify:smoke`
   - `npm run verify:builds`
4. Build target artifacts (`release:eagle`, `release:windows`, or `release:all`).
5. Validate manually in Eagle and Desktop for UI-sensitive changes.

## 6) Guardrails

- Do not add Desktop-only files to Eagle release inputs.
- Do not add direct `eagle.*` calls outside platform adapter boundaries.
- Do not duplicate shared logic in both `js/` and `packages/shared`.
- Keep release commands and docs synchronized whenever scripts change.
