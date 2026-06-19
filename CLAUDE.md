# CLAUDE.md

## Project Overview

**good-scan** is the volunteer scan app for the Good Camp conference platform. It is a **pure React PWA** — a static site that volunteers install on their phones via "Add to Home Screen". There is no backend in this repo. All data comes from the Spring Boot API in the `good-api` repo.

Volunteers use this app on their personal phones to:
- Scan attendee badge QR codes to record **meal pickups**
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

### Offline-First Data Flow

```
── On app startup (or back online) ──────────────────────────────────
  App.tsx warmUpCache()
    GET /api/scan/sync/profiles      → db.profiles.bulkPut()
    GET /api/scan/sync/meals         → db.meals.bulkPut()
    GET /api/scan/sync/register-meals→ db.registerMeals.bulkPut()

── On QR scan (online or offline) ───────────────────────────────────
  lookupByUid(uid)     → IndexedDB only — instant, no network
  queueScan(uid, mealId) → written to scanQueue in IndexedDB
  (if online) POST /api/meal/scan   → background, non-blocking
  display result immediately from IndexedDB data

── Background flush (every 10s, only when online) ────────────────────
  getPendingScans()
    → syncApi.flushScans(pending) → POST /api/scan/sync/flush
    → markSynced(id) for each accepted scan

── Workbox BackgroundSync (Service Worker) ───────────────────────────
  POST /api/meal/scan queued in "scan-queue"
  auto-retried up to 24 hours when connectivity returns
```

### IndexedDB Schema (Dexie.js — `src/db/localDb.ts`)

| Table | Primary key | Indexes | Data |
|---|---|---|---|
| `profiles` | `id` | `uid`, `householdId` | Attendee name + household link |
| `meals` | `id` | `uid`, `date`, `location` | Meal date/time/type/venue |
| `registerMeals` | `id` | `householdId`, `mealId`, `registerId` | Household meal orders + qty |
| `scanQueue` | `++id` (auto) | `uid`, `mealId`, `[uid+mealId]`, `synced`, `scannedAt` | Pending/completed scans |

The compound index `[uid+mealId]` on `scanQueue` is required for per-person-per-meal pickup history queries used in the MealScan result table.

### Sync State: StatusDot (`src/components/StatusDot.tsx`)

Shown in the app header at all times.

| Color | Condition |
|---|---|
| Green | Online + cache fresh (last sync < 30 min ago) |
| Yellow | Offline — shows count of unsynced scans in queue |
| Red | Cache stale (last sync > 30 min ago — data may be outdated) |

### PWA Distribution

Volunteers open `scan.goodvessel.org` in Chrome on their phone and tap **"Add to Home Screen"**. No App Store required. `display: fullscreen` hides the browser chrome.

---

## Project Structure

```
src/
├── api/
│   └── client.ts          Axios instance + JWT interceptor + all TypeScript types
│                          scanApi  — direct scan/lookup calls (online only)
│                          syncApi  — bulk profile/meal/flush calls for IndexedDB warm-up
├── components/
│   ├── QrScanner.tsx      @zxing/library camera reader; fires onScan(uid) callback
│   ├── ResultBanner.tsx   Color-coded banner (used in CheckIn only — not MealScan)
│   └── StatusDot.tsx      Online/offline/stale indicator in app header
├── db/
│   └── localDb.ts         Dexie IndexedDB class + helpers:
│                          lookupByUid()   — profile + meals + taken counts
│                          queueScan()     — write scan record locally
│                          markSynced()    — mark flushed record
│                          getPendingScans() — get unsynced queue items
│                          getLastSyncTime() — last successful sync timestamp
├── pages/
│   ├── MealScan.tsx       Tab 1: QR scan → meal pickup result (offline-first)
│   ├── CheckIn.tsx        Tab 2: QR scan → meal status lookup (offline-first)
│   └── MealInfo.tsx       Tab 3: Venue pickup counts (requires network)
├── App.tsx                Root: header + tab bar + warmUpCache on mount + flush every 10s
└── main.tsx
index.html
vite.config.ts             PWA manifest + Workbox runtimeCaching + BackgroundSync + /api proxy
package.json               key deps: react 18, dexie 4, @zxing/library, vite-plugin-pwa, axios
```

### Key Conventions

- **API calls:** All in `src/api/client.ts` — never import axios directly in pages or components.
- **Offline reads:** `lookupByUid()` only — zero network calls for the scan result display.
- **Offline writes:** `queueScan()` first, then attempt `scanApi.scan()` in background; never block the UI on the network.
- **UI language:** Chinese first, English second (e.g., `餐食 Meal`, `订了 Order`).
- **Styling:** Dark blue theme (`bg-blue-950`). Large touch targets for noisy venue use.
- **Auth:** JWT stored in `localStorage`. Axios interceptor in `client.ts` attaches `Authorization: Bearer` to every request. No volunteer login page yet.
- **ResultBanner** is used only in `CheckIn.tsx`. `MealScan.tsx` renders its own inline result UI (see MealScan Result UI section).

### good-api Endpoints Used (all under `/api`)

The `/scan/sync/*` endpoints **do not yet exist in good-api** — they must be implemented there before good-scan can populate its cache.

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/scan/sync/profiles` | **TODO in good-api** | All attendee profiles for current event |
| GET | `/scan/sync/meals` | **TODO in good-api** | All meals for current event |
| GET | `/scan/sync/register-meals` | **TODO in good-api** | All household meal orders |
| POST | `/scan/sync/flush` | **TODO in good-api** | Bulk flush queued scan records; returns `{ accepted: number[] }` |
| POST | `/meal/scan` | Exists | Record single meal pickup |
| GET | `/meal/status/{uid}` | Exists | All meal plans for a badge UID |
| GET | `/meal/info/{location}` | Exists | Meal list for a venue (used by MealInfo tab) |
| GET | `/meal/count/{mealId}` | Exists | Pickup count for a specific meal |
| GET | `/meal/venues` | Exists | List available venues |

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

**Status banner** (top, full-width):
- Green `bg-green-600` — `成功! 请拿饭盒 MEAL SERVED`
- Yellow `bg-yellow-600` — `抱歉! 己领了全部的饭盒 QUOTA EXCEEDED`
- Red `bg-red-700` — error message (UID not found / no meal order / system error)

**Three giant count numbers** (left column, `font-size: 15vw`):
- `订了 X` — qty ordered for this meal (`CachedRegisterMeal.qty`)
- `领了 X` — taken count after this scan (from `scanQueue` count + 1)
- `剩下 X` — remaining; green (`text-green-400`) if > 0, gray if 0

**Pickup history** (right column, `font-size: 4vw`, dark gray):
- Each entry: `"{relative time} {name} 领了一盒"`
- Data source: local `scanQueue` entries for this `[uid+mealId]`
- Relative time: `刚刚 just now` / `N 分钟前` / `HH:MM` (> 1 hour)
- Mirrors the JSF `mealTrackers` list with `PrettyTimeConverter`

**Meal plans table** (below the counts):
- Location badge: Westin = `#FFD400` yellow / black text; Hilton = `#d2b48c` tan / black text
- One row per `CachedRegisterMeal` entry for the household
- Ordered/Taken in `X 盒` format; per-meal pickup records from `scanQueue`
- Mirrors JSF `p:dataTable id="mealplans"`

**"扫描下一位 Scan Next"** button at bottom — clears result and reopens camera.

---

## Environment Variables

No `.env` required for local dev — the Vite proxy handles the backend URL.

For production builds, set:

```
VITE_GOOD_API_URL=https://api.goodvessel.org
```

---

## Annual Update Checklist

Before each conference year, update event IDs and meal IDs in good-api (not in this repo). The IndexedDB cache is populated dynamically from good-api at runtime.
