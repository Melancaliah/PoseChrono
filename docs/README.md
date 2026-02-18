# PoseChrono Docs Index

Use this index as the entry point for repository architecture, release flow, and validation checklists.

Legacy root-level doc files are kept as compatibility pointers and redirect to these canonical paths.

## Architecture

- `docs/architecture/repo-map.md`: source-of-truth map, folder responsibilities, update workflow.
- `docs/architecture/online-sync-rfc.md`: MVP design for synchronized host/participant sessions.

## Development

- `docs/development/developer-guide.md`: build/release commands, verification gates, and local workflows.
- `docs/development/online-sync-functional-contract.md`: functional contract for host/participant sync behavior.
- `docs/development/relay-deployment.md`: compatibility path to relay deployment notes.

## Deployment

- `docs/deployment/relay-deployment.md`: production relay deployment (env vars, nginx `wss://`, limits, health checks).

## Release

- `docs/release/eagle-release.md`: Eagle plugin release procedure and rollback baseline.

## Manual Validation

- `docs/checklists/eagle-smoke-checklist.md`: manual Eagle smoke checklist before marking work done.
