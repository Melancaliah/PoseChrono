# PoseChrono Sync Relay — Deployment Guide

## Overview

The sync relay is a lightweight Node.js WebSocket server (`scripts/sync-relay-server.js`) that brokers real-time communication between PoseChrono hosts and participants. It handles room creation, session state synchronization, session pack/media transfer, and participant management.

## Quick Start

```bash
# Install dependencies (ws is the only runtime dependency)
npm install

# Start the relay on default port 8787
npm run sync:relay

# Or with custom host/port
node scripts/sync-relay-server.js --host 0.0.0.0 --port 9000
```

## Health Check

The relay exposes an HTTP health endpoint:

```
GET http://<host>:<port>/health
```

Response:
```json
{
  "ok": true,
  "service": "posechrono-sync-relay",
  "rooms": 0,
  "ts": 1700000000000
}
```

Use this for load balancer health checks and monitoring.

## Environment Variables

All configuration is done via environment variables. Every variable has a sensible default.

### Network

| Variable | Default | Description |
|----------|---------|-------------|
| `POSECHRONO_SYNC_RELAY_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` for external access behind a reverse proxy. |
| `POSECHRONO_SYNC_RELAY_PORT` | `8787` | Listening port. |
| `POSECHRONO_SYNC_MAX_PAYLOAD` | `4194304` (4 MB) | Maximum WebSocket message size in bytes. |

### Room Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `POSECHRONO_SYNC_MAX_PARTICIPANTS` | `32` | Max participants per room (including host). |
| `POSECHRONO_SYNC_ROOM_IDLE_TTL_MS` | `7200000` (2h) | Idle timeout before a room is auto-closed. Min: 60s. |
| `POSECHRONO_SYNC_ROOM_CLEANUP_INTERVAL_MS` | `30000` (30s) | How often the server checks for expired rooms. Min: 5s. |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `POSECHRONO_SYNC_RATE_WINDOW_MS` | `1000` | Global rate limit window (ms). |
| `POSECHRONO_SYNC_RATE_MAX_MESSAGES` | `45` | Max messages per client per window. |
| `POSECHRONO_SYNC_STATE_RATE_WINDOW_MS` | `1000` | State update rate limit window (ms). |
| `POSECHRONO_SYNC_STATE_RATE_MAX_MESSAGES` | `20` | Max state updates per host per window. |

### Session Data Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `POSECHRONO_SYNC_MAX_STATE_BYTES` | `900000` | Max serialized session state size. |
| `POSECHRONO_SYNC_MAX_SESSION_PACK_BYTES` | `2097152` (2 MB) | Max session pack size. |
| `POSECHRONO_SYNC_MAX_SESSION_MEDIA_FILES` | `300` | Max media files per session. |
| `POSECHRONO_SYNC_MAX_SESSION_MEDIA_FILE_BYTES` | `2097152` (2 MB) | Max single media file size. |
| `POSECHRONO_SYNC_MAX_SESSION_MEDIA_TOTAL_BYTES` | `268435456` (256 MB) | Max total media per session. |

### Validation Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `POSECHRONO_SYNC_MAX_SESSION_NAME` | `80` | Max session name length. |
| `POSECHRONO_SYNC_MAX_PASSWORD` | `128` | Max password length. |
| `POSECHRONO_SYNC_MAX_CLIENT_ID` | `64` | Max client ID length. |
| `POSECHRONO_SYNC_MAX_REASON` | `96` | Max reason string length. |
| `POSECHRONO_SYNC_MAX_CUSTOM_STEPS` | `600` | Max custom queue steps. |
| `POSECHRONO_SYNC_MAX_MEDIA_ORDER_KEYS` | `12000` | Max media order keys. |
| `POSECHRONO_SYNC_MAX_SESSION_SECONDS` | `31536000` (1 year) | Max session duration in seconds. |
| `POSECHRONO_SYNC_MAX_INDEX` | `200000` | Max media ref index value. |

## TLS / Secure WebSocket (wss://)

The relay itself runs plain `ws://`. For production, terminate TLS at a reverse proxy (nginx, Caddy, etc.) to provide `wss://`.

### nginx Example

```nginx
server {
    listen 443 ssl;
    server_name sync.example.com;

    ssl_certificate     /etc/letsencrypt/live/sync.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sync.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Health check endpoint (optional, for monitoring)
    location = /health {
        proxy_pass http://127.0.0.1:8787/health;
    }
}
```

### Client-Side TLS Enforcement

The PoseChrono client transport supports `requireTls: true` (configured in `js/config.js` under `SYNC.requireTls`). When enabled, the client refuses to connect to `ws://` URLs and requires `wss://`.

## Security

- **Password-protected rooms**: Each room can have an optional password. Participants must provide it to join.
- **Host identity verification**: Only the host's WebSocket connection can perform host-only actions (state updates, pack/media uploads).
- **Client ID tracking**: The relay tracks which WebSocket connection owns which client ID, preventing impersonation.
- **Rate limiting**: Both global message rate and state update rate are enforced per-client.
- **Payload validation**: All session state, packs, and media are validated server-side (structure, size, allowed fields, allowed file types).
- **Allowed media types**: Only `jpg`, `jpeg`, `png`, `webp`, `mp4`, `webm` are accepted.
- **Room TTL**: Idle rooms are automatically cleaned up after the configured TTL.

## Production Recommendations

1. **Bind to `0.0.0.0` behind a reverse proxy** — never expose `ws://` directly to the internet.
2. **Use `wss://`** via TLS termination at the reverse proxy.
3. **Enable `requireTls` in client config** for production deployments.
4. **Monitor `/health`** with your existing monitoring stack (Prometheus, UptimeRobot, etc.).
5. **Set appropriate limits** — reduce `MAX_PARTICIPANTS`, `MAX_SESSION_MEDIA_TOTAL_BYTES` etc. based on your expected usage.
6. **Log rotation** — the relay logs to stdout/stderr. Use your process manager (systemd, PM2, Docker) to handle log rotation.
7. **Process manager** — run with PM2, systemd, or Docker for automatic restart on crash.

### Example with PM2

```bash
POSECHRONO_SYNC_RELAY_HOST=0.0.0.0 \
POSECHRONO_SYNC_RELAY_PORT=8787 \
pm2 start scripts/sync-relay-server.js --name posechrono-sync-relay
```

### Example with Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY scripts/sync-relay-server.js scripts/
EXPOSE 8787
ENV POSECHRONO_SYNC_RELAY_HOST=0.0.0.0
CMD ["node", "scripts/sync-relay-server.js"]
```

## Verification Scripts

```bash
# Run security tests (validates auth, rate limits, payload validation)
npm run verify:sync-security

# Run integration tests (validates full session lifecycle)
npm run verify:sync-integration
```

Both scripts start a temporary relay, run all tests, then clean up.
