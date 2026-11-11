# good-scan Load Test

Simulates the full **good-scan client lifecycle** — what N volunteer phones actually
do when they run the app — against the good-api backend.

## What it tests

| Scenario | What it models |
|---|---|
| `volunteer_devices` | N phones: login → cache warm-up → scan every ~20s → flush every ~10s → re-sync every ~5 min |
| `reconnect_spike` | All phones hitting warm-up simultaneously (hotel WiFi drops then restores during a meal) |

### Endpoints exercised

| Call | good-scan trigger |
|---|---|
| `POST /auth/volunteer` | Login (once per device, in setup) |
| `GET /scan/sync/profiles` | warmUpCache() on startup and every 5 min |
| `GET /scan/sync/meals` | same |
| `GET /scan/sync/register-meals` | same |
| `GET /scan/sync/scans` | same |
| `GET /scan/sync/voided-scans` | same |
| `POST /meal/scan` | Every QR scan (real-time, fire-and-forget) |
| `POST /scan/sync/flush` | Background flush every ~10s |

## Prerequisites

```powershell
# Install k6 (Windows)
winget install k6

# Verify
k6 version
```

## Quick start — local

Ensure good-api is running locally (`docker compose up -d` in good-api/).

```powershell
# From good-scan root
k6 run `
  --env BASE_URL=http://localhost:8090 `
  --env VOLUNTEER_CODE=GOSPEL2026 `
  --env MEAL_ID=193 `
  --env DEVICES=8 `
  load-test/good-scan-flow.js
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:8090` | good-api base URL (no trailing slash) |
| `VOLUNTEER_CODE` | `GOOD2026` | Event volunteer access code |
| `MEAL_ID` | `1` | Meal ID to scan against |
| `DEVICES` | `8` | Number of simulated volunteer phones (VUs) |
| `SCAN_INTERVAL` | `20` | Seconds between scans per device |
| `DURATION` | `5m` | Steady-state duration |
| `RECONNECT_VUS` | `= DEVICES` | VUs for the reconnect-spike scenario |

## Common recipes

```powershell
# Stress test: 20 devices, faster scanning
k6 run --env DEVICES=20 --env SCAN_INTERVAL=10 --env DURATION=3m `
  --env BASE_URL=http://localhost:8090 --env VOLUNTEER_CODE=GOSPEL2026 --env MEAL_ID=193 `
  load-test/good-scan-flow.js

# Reconnect spike only
k6 run --env RECONNECT_VUS=20 --env DURATION=10s `
  --env BASE_URL=http://localhost:8090 --env VOLUNTEER_CODE=GOSPEL2026 --env MEAL_ID=193 `
  load-test/good-scan-flow.js
```

## Key metrics

| Metric | Threshold | What it means |
|---|---|---|
| `warmup_duration_ms` | p95 < 3000ms | 5 parallel sync GETs complete under load |
| `scan_duration_ms` | p95 < 1000ms | Real-time meal scan |
| `flush_duration_ms` | p95 < 1000ms | Background batch flush |
| `scans_accepted` | — | Count of new meal records written |
| `scans_quota_full` | — | Count of 409s (expected — household quota hit) |
| `scans_errored` | < 10 | Hard 5xx / network failures |
| `warmup_errors` | < 5 | Sync endpoint failures |
| `scan_success_rate` | > 98% | 201 + 409 both count as success |
