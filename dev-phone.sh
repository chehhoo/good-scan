#!/usr/bin/env bash
# dev-phone.sh — start local dev server + Cloudflare tunnel for phone testing
#
# Usage: bash dev-phone.sh
#
# Requires: cloudflared (npx cloudflared), good-api running via docker compose

set -e

GOOD_API_DIR="$(dirname "$0")/../good-api"
SCAN_DIR="$(dirname "$0")"

# ── 1. Start Vite in background ───────────────────────────────────────────────
echo "Starting Vite dev server..."
cd "$SCAN_DIR"
npm run dev -- --host &
VITE_PID=$!

# Wait for Vite to be ready
sleep 3

# ── 2. Start Cloudflare tunnel, capture URL ───────────────────────────────────
echo "Starting Cloudflare tunnel..."
TUNNEL_LOG=$(mktemp)
npx cloudflared tunnel --url http://localhost:5173 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL to appear
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
  kill $VITE_PID $TUNNEL_PID 2>/dev/null
  exit 1
fi

echo ""
echo "✓ Tunnel URL: $TUNNEL_URL"

# ── 3. Restart good-api with tunnel origin allowed ───────────────────────────
echo "Allowing tunnel origin in good-api CORS..."
cd "$GOOD_API_DIR"
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:3000,${TUNNEL_URL}" \
  docker compose up -d --force-recreate api

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Open on your phone: $TUNNEL_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

# ── 4. Wait and clean up on exit ─────────────────────────────────────────────
trap "echo 'Stopping...'; kill $VITE_PID $TUNNEL_PID 2>/dev/null; rm -f $TUNNEL_LOG" EXIT
wait $VITE_PID
