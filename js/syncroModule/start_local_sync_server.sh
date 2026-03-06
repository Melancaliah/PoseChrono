#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_SCRIPT="$SCRIPT_DIR/../../scripts/sync-relay-server.js"

printf '====================================================\n'
printf '     PoseChrono - Local Sync Server\n'
printf '====================================================\n\n'

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not in your PATH."
  echo "Please install Node.js from https://nodejs.org to use the local server."
  echo
  read -r -p "Press Enter to close..." _
  exit 1
fi

if [ ! -f "$SERVER_SCRIPT" ]; then
  echo "[ERROR] Could not find: $SERVER_SCRIPT"
  echo "Make sure the addon files are completely extracted."
  echo
  read -r -p "Press Enter to close..." _
  exit 1
fi

first_ip=""
ips=""
if command -v ip >/dev/null 2>&1; then
  ips="$(ip -4 addr show scope global | awk '/inet /{print $2}' | cut -d/ -f1)"
elif command -v ifconfig >/dev/null 2>&1; then
  ips="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" {print $2}')"
fi

echo "Your local IP addresses to connect:"
echo "----------------------------------------------------"
if [ -n "$ips" ]; then
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    echo "ws://$ip:8787"
    if [ -z "$first_ip" ]; then
      first_ip="$ip"
    fi
  done <<< "$ips"
else
  echo "ws://127.0.0.1:8787"
  first_ip="127.0.0.1"
fi
echo "----------------------------------------------------"

if [ -n "$first_ip" ]; then
  relay_url="ws://$first_ip:8787"
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$relay_url" | pbcopy
    echo "[OK] Copied to clipboard: $relay_url"
  elif command -v xclip >/dev/null 2>&1; then
    printf '%s' "$relay_url" | xclip -selection clipboard
    echo "[OK] Copied to clipboard: $relay_url"
  elif command -v wl-copy >/dev/null 2>&1; then
    printf '%s' "$relay_url" | wl-copy
    echo "[OK] Copied to clipboard: $relay_url"
  else
    echo "[INFO] Copy this address manually: $relay_url"
  fi
fi

echo
echo "Keep this window open during your session."
echo
echo "Starting server..."
echo

node "$SERVER_SCRIPT"

read -r -p "Press Enter to close..." _
