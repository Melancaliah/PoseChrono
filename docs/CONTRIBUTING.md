# Contributing to PoseChrono

This project ships two products from one repository:

- Eagle plugin runtime
- Windows standalone desktop runtime

Please follow these rules to keep both stable.

## 1) Branching

- Create one branch per feature/fix.
- Keep branch scope small and focused.
- Prefer names like:
  - `feat/<topic>`
  - `fix/<topic>`
  - `chore/<topic>`

## 2) Architecture rules

- Shared logic goes to `packages/shared/` first.
- Platform-specific calls must go through platform adapters/helpers.
- Do not introduce direct `eagle.*` calls outside platform adapter boundaries.
- Keep Eagle root entrypoints intact:
  - `manifest.json`
  - `index.html`

Repository map:

- `docs/architecture/repo-map.md`

## 3) Verify before PR

Run mandatory checks:

```bash
npm run verify:smoke
```

For release/pipeline changes, also run:

```bash
npm run verify:builds
```

If you touched shared packaging:

```bash
npm run shared:sync
npm run verify:shared-sync
```

## 4) Manual checks

- Eagle manual smoke checklist:
  - `docs/checklists/eagle-smoke-checklist.md`
- Desktop runtime smoke:
  - launch app and validate main session flow

## 5) Pull request

Use the PR template and fill:

- impact matrix (`impact:eagle`, `impact:standalone`, `impact:shared`)
- manual validation notes
- risks/follow-ups

Template path:

- `.github/pull_request_template.md`

## 6) Release docs

- Developer workflow:
  - `docs/development/developer-guide.md`
- Eagle release procedure:
  - `docs/release/eagle-release.md`
