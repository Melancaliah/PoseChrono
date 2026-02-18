# Online Sync Functional Contract (Phase 7 - Lot 1)

This document defines the minimum functional behavior expected for online sync sessions.

## Roles

- Host:
  - creates a session
  - defines session name + timer control mode
  - updates shared session metadata
  - can end/leave the hosted session
- Participant:
  - joins an existing session with session code (+ optional password)
  - receives session state updates
  - can leave session

## States

`idle` -> `connecting` -> (`hosting` | `joined`) -> `idle`

Error branch:

`connecting` -> `idle` with `lastError` set

## Required Data

- `sessionCode` (normalized, uppercase)
- `sessionName`
- `controlMode` (`host-only` | `shared-pause`)
- `participantsCount`
- `role` (`none` | `host` | `participant`)
- `status` (`idle` | `connecting` | `hosting` | `joined`)
- `sessionPackMeta` (nullable): hash, size, updatedAt, uploadedBy, imagesCount, mediaRefsCount
- `sessionMediaMeta` (nullable): filesCount, totalBytes, updatedAt, uploadedBy

## Error Codes (MVP)

- `missing-session-code`
- `session-not-found`
- `invalid-password`
- `session-already-exists`
- `transport-unavailable`
- `forbidden-not-host`
- `invalid-session-pack`
- `session-pack-too-large`
- `session-pack-not-found`
- `invalid-session-media`
- `session-media-too-large`
- `session-media-not-found`
- `session-media-file-not-found`
- `session-media-unsupported-type`

## MVP Security Rules

- Session code is normalized and validated before transport calls.
- Password is only checked by transport (never executed/interpreted).
- No file payload is accepted in this lot.
- Unknown transport payloads are ignored.

## Session Pack Online (Lot 7.7a)

- Host can publish an online session pack (`manifest + media refs`) to the relay.
- Participants can download the currently published pack from the same session.
- Relay validates pack schema/version/size and enforces host-only upload.
- Pack metadata is exposed in room snapshot (`sessionPackMeta`).
- Client verifies SHA-256 integrity when a full hash is provided by relay.
- This lot does **not** upload binary media files yet (only manifest/refs).

## Session Media Online (Lot 7.7b)

- Host can reset the online media cache for a room.
- Host uploads media files one-by-one (`identity + name + ext + mime + size + sha256 + base64`).
- Participants can fetch media manifest, then download files one-by-one by identity.
- Relay enforces:
  - host-only upload/reset
  - strict format whitelist (`jpg/jpeg/png/webp/mp4/webm`)
  - per-file and per-session size limits
  - basic magic-bytes validation
  - SHA-256 integrity check when hash is provided

## Participant Download UX + Start Gate (Lot 7.7c)

- Participant sees download progression while online media files are fetched.
- `session-media-not-found` is treated as a valid "no online media" case.
- Participant session start is blocked when host has a published online pack but participant has not validated the current local copy yet.
- Validation fingerprint uses: `sessionCode + pack hash + pack updatedAt + media updatedAt`.

## Cross-platform Scope

- Logic lives in `packages/shared/`.
- Works the same for Eagle and Desktop runtime.
- Transport is swappable:
  - current lot: in-memory mock transport
  - next lot: websocket adapter with same service contract
