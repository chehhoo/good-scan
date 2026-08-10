# CLAUDE.md

## Project Overview

**good-scan** is the volunteer scan app for the Good Camp conference platform. It is a **pure React PWA** — a static site that volunteers install on their phones via "Add to Home Screen". There is no backend in this repo. All data comes from the Spring Boot API in the `good-api` repo.

Volunteers use this app on their personal phones to:
- Scan attendee badge QR codes to record **meal pickups** and **conference check-in**
- Look up attendee **meal status** (how many meals ordered / taken)
- View real-time **meal inventory counts** per venue

This repo was migrated from a Quarkus + Quinoa + H2 monorepo (`meal-api-quarkus`). The original JSF/PrimeFaces UI (`scanmeal.xhtml`) is the design reference for the MealScan result screen.

---

## Ecosystem Context

```
good-api/           ← Backend API + Admin UI  (platform core, Spring Boot)
good-conference/    ← Attendee portal  (React + Vite)
good-register/      ← Public registration page  (planned)
good-scan/          ← THIS REPO  (volunteer scan PWA)
```

**good-api is the single source of truth.** Never add a database or server to this repo — keep it a pure consumer of the API.

**good-conference** reads scan results from good-api so attendees can see real-time meal pickup status. good-scan writes to good-api; good-conference reads from good-api.

---

## Common Commands

```powershell
# Install dependencies
npm install

# Start dev server (proxies /api → localhost:8090)
npm run dev        # → http://localhost:5173

# Production build
npm run build      # tsc + vite build → dist/

# Preview production build locally
npm run preview
```

good-api must be running for sync to work:

```powershell
# In the good-api directory
docker compose up -d
```

**Volunteer login access code** is configured in good-api (event-level setting). In dev, use the code for the active event (e.g. `GOSPEL2026`).

---

## Design Constraints

The app is used by volunteers in a noisy, crowded conference venue on their personal phones.

| Constraint | Solution |
|---|---|
| Camera access for QR codes | `@zxing/library` via browser camera API — no native SDK needed |
| Works on personal phones — no app store | PWA "Add to Home Screen" via `vite-plugin-pwa`, `display: fullscreen` |
| Spotty hotel WiFi | Dexie.js IndexedDB caches profiles + meal plans on startup |
| Offline scan result display | All lookups hit IndexedDB only — never the network |
| Scan records never lost | Written to `scanQueue` in IndexedDB first; flushed to good-api when online |
| Large, readable UI | Giant count numbers (15vw); dark blue theme; color-coded status banner |
| Real-time data for attendees | good-scan flushes to good-api → good-conference polls good-api |
| Stale data from previous events | `warmUpCache` does full `clear()` + `bulkAdd()` — never `bulkPut` |

---

## Architecture

### Why Pure PWA (not a backend server)

The original design was a Quarkus + Quinoa monorepo with an H2 local database running on a server. That was rejected because:

- Volunteers' phones connect to good-scan-server, not good-api directly → extra hop, extra failure point
- If good-scan-server goes offline, phones lose both data display AND write capability
- Industry standard for offline-first scan apps (Square POS, Eventbrite check-in) is **browser IndexedDB**, not a local server

The chosen approach: static PWA + Dexie.js IndexedDB in the browser. The phone IS the local database.

### Request Flow

```
Phone browser
  → opens scan.goodvessel.org (static PWA, served from CDN or nginx)
  │
  ├── IndexedDB (Dexie.js)          ← read/write local cache, always available
  │     profiles, meals,
  │     registerMeals, scanQueue
  │
  └── /api  →  good-api :8090       ← only when online
                   → MariaDB :3306/good
```

In dev, Vite proxies `/api` to `http://localhost:8090`. In prod, nginx routes `/api` to good-api.

### Auth

Volunteers log in once with an **event access code** (`POST /api/auth/volunteer`). The response JWT is stored in `localStorage` and attached to every Axios request via an interceptor. A 401 from any sync call clears the token and forces re-login. No per-attendee login — one shared volunteer code per event.

**Manual entry mode:** In dev it is always on. In prod, tap the version badge 5× within 3 seconds to toggle it (shown in yellow when active). Allows typing a Person ID instead of scanning a QR code, plus voice input via the Web Speech API.

### Offline-First Data Flow

```
── On app startup / on reconnect ────────────────────────────────────
  App.tsx warmUpCache()    (guarded by warmingUp ref — no concurrent runs)
    GET /api/scan/sync/profiles       → db.profiles.clear() + bulkAdd()
    GET /api/scan/sync/meals          → db.meals.clear() + bulkAdd()
    GET /api/scan/sync/register-meals → db.registerMeals.clear() + bulkAdd()
    GET /api/scan/sync/voided-scans   → delete matching scanQueue entries
    GET /api/scan/sync/scans          → replace all synced scanQueue entries
  lastCacheSyncAt saved to localStorage for StatusDot stale-check across reloads

── On QR scan (online or offline) ───────────────────────────────────
  lookupByUid(uid)       → IndexedDB only — instant, no network
  queueScan(uid, mealId) → written to scanQueue in IndexedDB
  (if online) POST /api/meal/scan   → background, non-blocking
  display result immediately from IndexedDB data

── Background flush (every 10s, only when online) ────────────────────
  getPendingScans()
    → syncApi.flushScans(pending) → POST /api/scan/sync/flush
    → markSynced(id) for each accepted localId

── Cache re-sync (every 5 min, only when online) ─────────────────────
  warmUpCache() → full clear + replace of all read-only tables

── Workbox BackgroundSync (Service Worker) ───────────────────────────
  POST /api/meal/scan queued in "scan-queue"
  auto-retried up to 24 hours when connectivity returns
```

**Critical:** `warmUpCache` uses `clear()` + `bulkAdd()` (not `bulkPut`) for `profiles`, `meals`, and `registerMeals`. This ensures records from a previous event are always purged when a new event is active — verified in testing.

### IndexedDB Schema (Dexie.js — `src/db/localDb.ts`)

| Table | Primary key | Indexes | Data |
|---|---|---|---|
| `profiles` | `id` | `uid`, `householdId` | Attendee name + household link |
| `meals` | `id` | `uid`, `date`, `location` | Meal date/time/type/venue |
| `registerMeals` | `id` | `householdId`, `mealId`, `registerId` | Household meal orders + qty |
| `scanQueue` | `++id` (auto) | `uid`, `mealId`, `[uid+mealId]`, `synced`, `scannedAt` | Pending/completed scans |

The compound index `[uid+mealId]` on `scanQueue` is required for per-person-per-meal pickup history queries used in the MealScan result table.

### Sync State: StatusDot (`src/components/StatusDot.tsx`)

Shown in the app header at all times. Tapping it triggers a manual `warmUpCache()`.

| Color | Condition |
|---|---|
| Green | Online + cache fresh (last sync < 30 min ago) |
| Yellow | Offline — shows count of unsynced scans in queue |
| Red | Cache stale (last sync > 30 min ago — data may be outdated) |

`lastCacheSyncAt` is persisted to `localStorage` so the stale indicator survives page reloads.

### PWA Distribution

Volunteers open `scan.goodvessel.org` in Chrome on their phone and tap **"Add to Home Screen"**. No App Store required. `display: fullscreen` hides the browser chrome.

---

## Project Structure

```
src/
├── api/
│   └── client.ts          Axios instance + JWT interceptor + all TypeScript types
│                          eventApi — GET /register/event-info (active event name)
│                          syncApi  — bulk profile/meal/scan sync endpoints
│                          scanApi  — direct meal scan/lookup calls
├── components/
│   ├── QrScanner.tsx      @zxing/library camera reader; fires onScan(uid) callback
│   ├── ResultBanner.tsx   Color-coded banner (used in CheckIn only — not MealScan)
│   └── StatusDot.tsx      Online/offline/stale indicator; tap to trigger manual sync
├── db/
│   └── localDb.ts         Dexie IndexedDB class + helpers:
│                          lookupByUid()     — profile + meals + taken counts
│                          queueScan()       — write scan record locally
│                          markSynced()      — mark flushed record
│                          getPendingScans() — get unsynced queue items
│                          getLastSyncTime() — last successful sync timestamp
├── pages/
│   ├── LoginPage.tsx      Volunteer access-code login; sets JWT in localStorage
│   ├── MealScan.tsx       Tab 1: QR scan → meal pickup result (offline-first)
│   ├── CheckIn.tsx        Tab 2: QR scan → conference check-in (requires network)
│   └── MealInfo.tsx       Tab 3: Venue pickup counts (requires network)
├── App.tsx                Login gate → header + tab bar + warmUpCache + flush/re-sync intervals
└── main.tsx
index.html
vite.config.ts             PWA manifest + Workbox runtimeCaching + BackgroundSync + /api proxy
package.json               key deps: react 18, dexie 4, @zxing/library, vite-plugin-pwa, axios
```

### Key Conventions

- **API calls:** All in `src/api/client.ts` — never import axios directly in pages or components.
- **Offline reads:** `lookupByUid()` only — zero network calls for MealScan result display.
- **Offline writes:** `queueScan()` first, then attempt `scanApi.scan()` in background.
- **Cache warm-up:** Always `clear()` + `bulkAdd()` for read-only tables — never `bulkPut`. This prevents stale previous-event data from surviving into a new event.
- **UI language:** Chinese first, English second (e.g., `餐食 Meal`, `订了 Order`).
- **Styling:** Dark blue theme (`bg-blue-950`). Large touch targets for noisy venue use.
- **Auth:** JWT in `localStorage`. Axios interceptor attaches `Authorization: Bearer` to every request. 401 on any sync call → clear token → show LoginPage.
- **ResultBanner** is used only in `CheckIn.tsx`. `MealScan.tsx` renders its own inline result UI.
- **CheckIn** requires network (calls `syncApi.checkIn(uid)` — check-in is not offline-capable).
- **manualEntryEnabled** prop is passed from App to MealScan and CheckIn; always true in dev, toggled by 5-tap on version badge in prod.

### good-api Endpoints Used (all under `/api`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/volunteer` | Volunteer login; returns JWT |
| GET | `/register/event-info` | Active event name (shown in header) |
| GET | `/scan/sync/profiles` | All attendee profiles for current event |
| GET | `/scan/sync/meals` | All meals for current event |
| GET | `/scan/sync/register-meals` | All household meal orders |
| GET | `/scan/sync/voided-scans` | Scan records voided server-side |
| GET | `/scan/sync/scans` | All confirmed scan records (for local cache) |
| POST | `/scan/sync/flush` | Bulk flush queued scans; returns `{ accepted: number[] }` |
| POST | `/meal/scan` | Record single meal pickup (also called per-scan) |
| POST | `/scan/checkin` | Conference check-in for a UID |
| GET | `/meal/info/{location}` | Meal list for a venue (MealInfo tab) |
| GET | `/meal/count/{mealId}` | Pickup count for a specific meal |
| GET | `/meal/venues` | List available venues |

---

## MealScan Result UI

Modelled after the original JSF/PrimeFaces `scanmeal.xhtml` screen from `meal-pickup-frontend`. After a QR scan the camera is replaced by:

```
┌──────────────────────────────────────────────────────────┐
│  ✓ 成功! 请拿饭盒 MEAL SERVED     ← green / yellow / red  │
│               朱大明               ← attendee name        │
├──────────────────────────────┬───────────────────────────┤
│  订了 2   (15vw bold)        │  5分前 朱大明 领了一盒     │
│  领了 1   (15vw bold)        │  刚刚  朱大明 领了一盒     │
│  剩下 1   (15vw green)       │                           │
├──────────────────────────────┴───────────────────────────┤
│  Location │ Meal            │ 订了 │ 领了 │ Pickup Records │
│  Westin   │ 早餐 2026-12-27 │ 2盒  │ 1盒  │ 朱大明 5分前  │
│  Hilton   │ 午餐 2026-12-27 │ 1盒  │ 0盒  │               │
└──────────────────────────────────────────────────────────┘
  [ 扫描下一位 Scan Next ]
```

**Status banner colors:**
- Green `bg-green-600` — 成功! 请拿饭盒 MEAL SERVED
- Yellow `bg-yellow-600` — 抱歉! 己领了全部的饭盒 QUOTA EXCEEDED
- Red `bg-red-700` — error (UID not found / no meal order / system error)

**Three giant count numbers** (`15vw`) mirror the original JSF 160px labels: 订了/领了/剩下.

**Pickup history** (right column, `4vw`) from local `scanQueue` — mirrors JSF `mealTrackers`.

**Meal plans table** mirrors JSF `p:dataTable mealplans`:
- Location badge: Westin = `#FFD400` yellow / black; Hilton = `#d2b48c` tan / black

---

## Environment Variables

No `.env` required for local dev — the Vite proxy handles the backend URL.

For production builds, set:

```
VITE_GOOD_API_URL=https://api.goodvessel.org
```

---

## Annual Update Checklist

Before each conference year:
1. Update the event access code in good-api
2. Verify meal IDs and event ID in good-api
3. Clear any stale IndexedDB data by ensuring volunteers reload the app (warmUpCache will clear and replace automatically on first load after login)
