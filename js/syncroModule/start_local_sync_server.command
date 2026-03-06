#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$SCRIPT_DIR/start_local_sync_server.sh" 2>/dev/null || true
exec "$SCRIPT_DIR/start_local_sync_server.sh"
