# Eagle Manual Smoke Checklist

Use this checklist to validate "no visible regression" before checking Phase 1/2 manual criteria.

## Preconditions

- Build/verify passes:
  - `npm run verify:smoke`
- Plugin imported in Eagle from current dist output.

## 1) Startup & image loading

- Open plugin from Eagle.
- Confirm no infinite "Loading images..." when selection exists.
- Confirm image/video/GIF sources load correctly.

## 2) Session modes

- Start/stop a session in each mode:
  - Classic
  - Custom
  - Relax
  - Memory
- Confirm timer, progression, and mode-specific controls.

## 3) Draw module

- Open draw mode, draw shapes/lines, use clear/undo.
- Confirm shape editing toggles and context menus still work.
- Confirm hotkeys modal opens and still traps focus correctly.

## 4) Review & zoom

- Open review grid after session.
- Open zoom overlay and navigate items.
- Confirm badges and controls still render.

## 5) Timeline/history

- Open timeline.
- Open day detail modal.
- Replay at least one session from timeline.
- Confirm delete actions still show warning/undo behavior.

## 6) Platform actions

- Test reveal/open behavior from sidebar/context menus.
- Confirm Eagle-specific actions still work in Eagle runtime.

## 7) Global settings

- Open Global settings and toggle:
  - background grid
  - titlebar always visible
  - default session mode
- Close/reopen plugin and confirm persistence.

## Result

- If all checks pass, mark manual criteria in `tasks/todo.md`:
  - Phase 1: "Eagle fonctionne pareil qu’avant..."
  - Phase 2: "Pas de régression visible sur la version Eagle."
