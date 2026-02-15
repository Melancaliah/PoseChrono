# Online Sync Session RFC (MVP)

This RFC prepares a shared implementation for synchronized drawing sessions across Eagle and Desktop.

## Goal

Allow one **host** to run a PoseChrono session and one or more **participants** to follow the same:

- image/media progression
- timer state
- mode state (classic/custom/relax/memory)
- pause/resume/stop

## Non-goals (MVP)

- auth/accounts
- persistent cloud history
- voice/chat
- collaborative drawing merge

## Functional Roles

- Host:
  - creates session
  - controls playback/timer/navigation
  - can end session
- Participant:
  - joins with code/link
  - receives synchronized state/events
  - read-only control for MVP

## Shared Contract (platform-agnostic)

Implement in `packages/shared` first.

- `SyncSessionState`:
  - `sessionId`
  - `role` (`host` | `participant`)
  - `connection` (`idle` | `connecting` | `connected` | `reconnecting` | `error`)
  - `mode`
  - `currentMediaId`
  - `timer` (remaining, running, phase)
  - `sequence` (monotonic event id)
- `SyncEvent`:
  - `SESSION_STARTED`
  - `SESSION_STOPPED`
  - `TIMER_STARTED`
  - `TIMER_PAUSED`
  - `TIMER_TICK`
  - `MEDIA_CHANGED`
  - `MODE_CHANGED`
  - `CUSTOM_QUEUE_UPDATED`

## Technical Layers

1. Shared core (`packages/shared/sync-session-core.js`)
   - state machine + reducer
   - event apply/serialize/validate
2. Transport adapter (`js/platform/*`)
   - WebSocket-style API abstraction:
     - `connect`
     - `disconnect`
     - `send`
     - `onMessage`
     - `onStatus`
3. UI glue (`js/plugin.js`)
   - create/join controls
   - status badge
   - bind host controls to outgoing events
   - apply incoming events to runtime state

## Reliability Rules

- Every event carries a `sequence` number.
- Participant ignores stale/out-of-order events.
- Host sends periodic snapshot (`STATE_SNAPSHOT`) every N seconds.
- Reconnect flow requests latest snapshot before resuming.

## Security / Validation (MVP)

- Validate all incoming payloads before apply.
- Reject unknown event types.
- Clamp timer/media/mode values to safe ranges.

## Increment Plan

1. Shared core module + tests of reducer-like transitions.
2. Local mock transport (same window/session) to validate behavior fast.
3. Desktop WebSocket transport (dev endpoint).
4. Eagle transport integration.
5. Minimal UI controls and status indicators.
6. Manual smoke in both runtimes.
