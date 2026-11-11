#!/usr/bin/env bash
# dev-phone.sh -- start local dev server + Cloudflare tunnel for phone testing
#
# Usage: bash dev-phone.sh
#
# Requires: cloudflared (npx cloudflared), good-api running via docker compose

GOOD_API_DIR="$(dirname "$0")/../good-api"
SCAN_DIR="$(dirname "$0")"
VITE_PORT=5173

kill_vite_ports() {
  # Kill anything listening on Vite ports, then kill orphaned background node processes
  for port in 5173 5174 5175 5176; do
    pid=$(lsof -ti tcp:$port 2>/dev/null) && kill -9 $pid 2>/dev/null || true
  done
  # Kill background node processes started by this session (by ppid or pgrp)
  pkill -P $$ node 2>/dev/null || true
  sleep 1
}

cleanup() {
  echo "Stopping..."
  kill $VITE_PID $TUNNEL_PID 2>/dev/null
  kill_vite_ports
  rm -f "$TUNNEL_LOG"
  echo "All processes stopped."
}

# -- 0. Free Vite ports if anything is using them -----------------------------
echo "Freeing Vite ports..."
kill_vite_ports

# -- 1. Start Vite in background -----------------------------------------------
echo "Starting Vite dev server on port $VITE_PORT..."
cd "$SCAN_DIR"
npm run dev -- --host --port $VITE_PORT &
VITE_PID=$!

# Wait for Vite to be ready
sleep 3

# -- 2. Start Cloudflare tunnel, capture URL -----------------------------------
echo "Starting Cloudflare tunnel..."
TUNNEL_LOG=$(mktemp)
npx cloudflared tunnel --url http://localhost:$VITE_PORT > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

echo "Waiting for tunnel URL..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Could not get tunnel URL. Check cloudflared output:"
  cat "$TUNNEL_LOG"
  cleanup
  exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"

# -- 3. Restart good-api with tunnel origin allowed ---------------------------
echo "Allowing tunnel origin in good-api CORS..."
cd "$GOOD_API_DIR"
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:3000,${TUNNEL_URL}" \
  docker compose up -d --force-recreate api

# -- 4. Wait for good-api to be ready -----------------------------------------
echo "Waiting for good-api to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8090/api/register/event-info > /dev/null 2>&1; then
    echo "good-api is ready."
    break
  fi
  sleep 1
done

echo ""
echo "------------------------------------------------------"
echo "  Open on your phone: $TUNNEL_URL"
echo "------------------------------------------------------"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

# -- 5. Wait and clean up on exit ----------------------------------------------
trap cleanup EXIT
wait $VITE_PID
