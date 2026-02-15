# PoseChrono Desktop (Scaffold)

This folder is the standalone desktop shell (Electron), isolated from Eagle packaging.

## Current status
- Electron shell wired to load root `index.html` (real PoseChrono UI) in development.
- Desktop bridge exposes an `eagle` compatibility shim (dialogs/window/preferences/items).
- First launch prompts for a local media folder (desktop source).

## Run locally
```bash
cd apps/desktop
npm install
npm run start
```

## Build Windows installer
```bash
cd apps/desktop
npm install
npm run build:win
```

Artifacts are generated in:

`apps/desktop/dist/`

## Next integration steps
1. Introduce shared modules (`packages/shared`).
2. Add desktop platform adapter (`platform.media`, `platform.storage`, `platform.dialogs`).
3. Reuse existing UI progressively.
