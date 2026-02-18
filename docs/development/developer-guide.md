# PoseChrono Developer Guide

This guide contains technical instructions for development, verification, and release workflows.

## Repository map

- Read first: `docs/architecture/repo-map.md`

## Eagle release (clean plugin folder)

```bash
npm run release:eagle
npm run verify:eagle-dist
```

Outputs:

- `dist/eagle-plugin-YYYY-MM-DD_THH-mm_NN/`
- `dist/eagle/posechrono-eagle-<version>.zip`

Import in Eagle:

1. `Plugins` > `Developer Options` > `Import Local Project`
2. Select generated folder
3. Use `Package Plugin` from Eagle

## Desktop standalone (Windows)

Install and run local desktop shell:

```bash
npm run desktop:install
npm run desktop:start
```

Build Windows installer:

```bash
npm run desktop:build:win
# fallback without signing/editing executable
npm run desktop:build:win:unsigned
```

Output:

- `apps/desktop/dist/`

Release-friendly Windows copy in root dist:

```bash
npm run release:windows
```

Outputs:

- `dist/windows-YYYY-MM-DD_THH-mm_NN/posechrono-desktop-<version>-setup.exe`
- `dist/windows-YYYY-MM-DD_THH-mm_NN/release.json`

## Combined release

```bash
npm run release:all
```

## Batch helpers (Windows)

- `generation/build-windows.bat`
- `generation/build-eagle.bat`
- `generation/build-all.bat`
- `generation/verify.bat`
- `generation/start-sync-relay.bat`

## Shared package workflow

Shared cross-platform logic source of truth:

- `packages/shared/`

Commands:

```bash
npm run shared:sync
npm run shared:clean:legacy
npm run verify:shared-sync
```

## Project verification gates

```bash
npm run verify:locales
npm run verify:platform-decoupling
npm run verify:smoke
npm run verify:builds
npm run verify:windows-dist
```

## Version bump

Updates `manifest.json`, `apps/desktop/package.json`, and root `package.json`:

```bash
npm run version:bump -- patch
# or
npm run version:bump -- 1.0.3
```

## BootTrace debug switch

BootTrace is disabled by default.

- Eagle: add `?bootTrace=1` in plugin URL context.
- Desktop (PowerShell):

```powershell
$env:POSECHRONO_BOOT_TRACE="1"; npm run desktop:start
```

Clear env var:

```powershell
Remove-Item Env:POSECHRONO_BOOT_TRACE
```

## Online Sync transport switch (Phase 7)

Default mode uses local mock transport (no network).

Start shared relay server (required for Eagle <-> Desktop):

```bash
npm install
npm run sync:relay
# or generation\start-sync-relay.bat
```

Desktop WebSocket mode:

```powershell
$env:POSECHRONO_SYNC_TRANSPORT="ws"
$env:POSECHRONO_SYNC_WS_URL="ws://127.0.0.1:8787"
npm run desktop:start
```

Eagle WebSocket mode:

- Query params: `?syncTransport=ws&syncWsUrl=ws://127.0.0.1:8787`
- or in Eagle devtools console (persistent):

```js
localStorage.setItem("posechrono-sync-transport", "ws");
localStorage.setItem("posechrono-sync-ws-url", "ws://127.0.0.1:8787");
location.reload();
```

Force back to local mock mode:

```js
localStorage.setItem("posechrono-sync-transport", "mock");
localStorage.removeItem("posechrono-sync-ws-url");
location.reload();
```

## Reset cache to test translation (console in inspector mode f12)

```js
Object.keys(localStorage)
  .filter((k) => k.startsWith("posechrono-i18n-cache"))
  .forEach((k) => localStorage.removeItem(k));
location.reload();
```
