# PoseChrono Desktop (Scaffold)

This folder is the standalone desktop shell (Electron), isolated from Eagle packaging.

## Current status
- Electron bootstrap only.
- No shared business logic wired yet.
- No Eagle dependency inside this app.

## Run locally
```bash
cd apps/desktop
npm install
npm run start
```

## Next integration steps
1. Introduce shared modules (`packages/shared`).
2. Add desktop platform adapter (`platform.media`, `platform.storage`, `platform.dialogs`).
3. Reuse existing UI progressively.

