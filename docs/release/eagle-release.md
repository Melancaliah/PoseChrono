# Eagle Release Procedure

This document is the Phase 0 baseline/release reference for the Eagle plugin build.

## Official Eagle references

- Plugin anatomy (root files and structure):  
  https://developer.eagle.cool/plugin-api/get-started/anatomy-of-an-extension
- Dialog API (`showMessageBox`, `showOpenDialog`):  
  https://developer.eagle.cool/plugin-api/api/dialog
- Runtime events (`onPluginCreate`, `onPluginRun`, `onPluginHide`):  
  https://developer.eagle.cool/plugin-api/api/event
- Item API:  
  https://developer.eagle.cool/plugin-api/api/item
- Folder API:  
  https://developer.eagle.cool/plugin-api/api/folder
- Shell API (`showItemInFolder`, `openExternal`):  
  https://developer.eagle.cool/plugin-api/api/shell
- Window API:  
  https://developer.eagle.cool/plugin-api/api/window

## Baseline tag (Phase 0)

Create/update baseline tag:

```bash
npm run baseline:tag
```

Current baseline tag name:

`v-eagle-baseline`

## One-command rollback (Phase 0 criterion)

Rollback to baseline commit in detached mode:

```bash
npm run baseline:rollback
```

Equivalent single Git command:

```bash
git switch --detach v-eagle-baseline
```

## Eagle release build

Build clean Eagle plugin output:

```bash
npm run release:eagle
npm run verify:eagle-dist
```

Full smoke gate:

```bash
npm run verify:smoke
```

## Import in Eagle

1. Eagle > `Plugins` > `Developer Options` > `Import Local Project`
2. Select generated folder:
   - latest `dist/eagle-plugin-YYYY-MM-DD_THH-mm_NN/`
3. Run Eagle `Package Plugin` from that imported project.

## Notes

- `manifest.json` and `index.html` must stay at repository root for Eagle compatibility.
- Release output is always timestamped/incremented (`dist/eagle-plugin-YYYY-MM-DD_THH-mm_NN/`).
