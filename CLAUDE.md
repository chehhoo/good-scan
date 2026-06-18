# CLAUDE.md

## Project Overview

**good-scan** is the volunteer scan app for the Good Camp conference platform. It is a **Quarkus + Quinoa monorepo** — a React PWA frontend bundled inside the Quarkus JAR, deployed as a single container.

Volunteers use this app on their personal phones (added to Home Screen as a PWA) to:
- Scan attendee badge QR codes to record **meal pickups**
- Look up attendee **meal status** (how many meals ordered / taken)
- View real-time **meal inventory counts** per venue

This repo contains **both** the backend API and the React frontend. The backend reads from the same shared `cccc` MariaDB/MySQL database as `good-camp`.

---

## Ecosystem Context

```
good-camp/          ← Backend API + Admin UI  (platform core)
good-conference/    ← Attendee portal
good-register/      ← Public registration page  (planned)
good-scan/          ← THIS REPO  (volunteer scan app)
```

---

## Common Commands

```powershell
# Install frontend dependencies
cd src/main/webui && npm install && cd ../../..

# Start dev (Quarkus backend + Vite proxy on :5173)
mvn quarkus:dev        # → API at http://localhost:8088/api
                       # → UI at http://localhost:5173 (Quinoa proxies Vite)

# Run tests (H2 in-memory, no Docker needed)
mvn test

# Production build (Quinoa builds React into target/quarkus-app/)
mvn clean package

# Native build
mvn clean package -Pnative -Dquarkus.native.container-build=true

# Local dev DB (MariaDB 10.11)
docker compose up -d
```

---

## Design Constraints

The app is used by volunteers in a noisy, crowded conference venue on their personal phones. Every design decision flows from these constraints:

| Constraint | Solution |
|---|---|
| Camera access for QR codes | `@zxing/library` via browser camera API |
| Works on personal phones — no app store | PWA "Add to Home Screen" via `vite-plugin-pwa` |
| Spotty hotel WiFi | Quarkus local queue; React hits `localhost` (its own backend), so offline handling is invisible to the UI |
| Simple UI — large buttons, instant feedback, noisy venue | Three screens only; full-screen camera; color-coded result banner |

---

## Architecture

### Why Quinoa (not a separate React repo)

The React frontend is bundled **inside** the Quarkus JAR using [Quinoa](https://quarkiverse.github.io/quarkiverse-docs/quarkus-quinoa/dev/). One JAR, one container, one deployment.

| | Quinoa (this repo) | Separate React repo |
|---|---|---|
| Deployment | Single Docker container | S3 + CloudFront + separate CI |
| Offline queue | Quarkus manages it | Complex — frontend must call good-api directly |
| Stack consistency | React + Tailwind (same team skill) | Same |
| Complexity | Lower | Higher |

### Request Flow

```
Phone browser
  → open scan.goodvessel.org (served as PWA)
  → Quarkus HTTP :8088
      ├── /api/*        → REST endpoints (MealResource)
      ├── /q/swagger-ui → OpenAPI docs
      └── /*            → Quinoa serves React PWA static assets

Quarkus ← MariaDB/MySQL (shared cccc database, same as good-camp)
```

In dev mode, Quinoa proxies to the Vite dev server on `:5173`. In prod, the built React assets are served directly by Quarkus from the JAR.

### PWA Distribution

Volunteers open the app URL in Chrome on their phone and tap **"Add to Home Screen"** — it installs like a native app with no App Store required. The manifest uses `display: fullscreen` to hide browser chrome.

```ts
// vite.config.ts — key PWA settings
manifest: {
  display: 'fullscreen',      // hides browser chrome on phone
  background_color: '#1e3a8a',
}
```

### QR Scanning

`@zxing/library` decodes QR codes from the phone's camera via the browser API. No native SDK or app store needed.

```ts
const reader = new BrowserMultiFormatReader()
reader.decodeFromVideoDevice(null, videoRef.current, (result) => {
  if (result) handleScan(result.getText())
})
```

---

## UI Design

Three screens, accessible via a top tab bar:

```
┌─────────────────────┐
│  🍽 餐食 Meal        │ ← full-screen camera
│                     │
│  [live viewfinder]  │
│                     │
│  ✓ 朱大明           │ ← instant result overlay
│  领取成功 MEAL SERVED│
│  1 / 1 份已取 served │
└─────────────────────┘
```

```
┌─────────────────────┐
│  ✓ 报到 Check-In    │ ← look up meal status by UID
│                     │
│  [camera]           │
│                     │
│  ✓ ID: ABC001       │
│  家庭编号 Household 1│
│  早餐 ✓  午餐 ✓     │
│  晚餐 ✗ (0/1 剩余)  │
└─────────────────────┘
```

```
┌─────────────────────┐
│  📋 统计 Info        │ ← real-time pickup counts per venue
│                     │
│  Westin ▼  [刷新]   │
│                     │
│  早餐 Day 1    42   │
│  午餐 Day 1    38   │
│  晚餐 Day 1    51   │
└─────────────────────┘
```

**ResultBanner** is color-coded:
- Green (`bg-green-600`) — meal served successfully
- Yellow (`bg-yellow-600`) — quota exceeded (already picked up all meals)
- Red (`bg-red-700`) — error (UID not found, no meal order, etc.)

Tap anywhere on the banner to dismiss and return to the camera.

---

## Project Structure

```
src/
├── main/
│   ├── java/com/cccmbiz/
│   │   ├── domain/         JPA entities (Church, Meal, Register, Profile, MealTracker, …)
│   │   ├── repository/     Panache repositories
│   │   ├── service/        MealService / MealServiceImpl
│   │   ├── resource/       MealResource (REST endpoints)
│   │   ├── dto/            Request/response DTOs
│   │   └── exception/      MealException + ExceptionMapper
│   ├── resources/
│   │   └── application.properties
│   └── webui/              React PWA (managed by Quinoa)
│       ├── src/
│       │   ├── api/client.ts     Axios instance + TypeScript types
│       │   ├── pages/
│       │   │   ├── MealScan.tsx  QR scan → meal pickup
│       │   │   ├── CheckIn.tsx   QR scan → meal status lookup
│       │   │   └── MealInfo.tsx  Venue pickup counts
│       │   ├── components/
│       │   │   ├── QrScanner.tsx @zxing/library camera reader
│       │   │   └── ResultBanner.tsx scan result feedback (green/yellow/red)
│       │   ├── App.tsx           Tab layout (Meal / Check-In / Info)
│       │   └── main.tsx
│       ├── vite.config.ts        PWA manifest + workbox offline cache + /api proxy
│       └── package.json
├── test/
│   ├── java/com/cccmbiz/
│   │   ├── MealResourceTest.java
│   │   └── MealServiceTest.java
│   └── resources/import-test.sql
└── docker/init/schema.sql        Local dev DB init
```

### Key Conventions

- **Backend:** Panache repositories, RESTEasy Reactive, Lombok — same conventions as `meal-api-quarkus`.
- **Frontend:** React + Vite + Tailwind CSS. API calls via `src/api/client.ts` only — never call axios directly from pages.
- **UI language:** Chinese first, English second (e.g., `餐食 Meal`).
- **Styling:** Dark blue theme (`bg-blue-950`) designed for outdoor/venue readability.

### API Endpoints (all under `/api/meal`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scan` | Record meal pickup (main action) |
| GET | `/status/{uid}` | Get all meal plans for a badge UID |
| GET | `/info/{location}` | Meal list for a venue |
| GET | `/count/{mealId}` | Pickup count for a specific meal |
| GET | `/venues` | List available venues |
| GET | `/churches` | List all churches |
| GET | `/mealplan` | Household meal plan summary |

---

## Annual Update Checklist

Before each conference year:
1. Update meal IDs (48-56) and event_id (75) in `MealPlanRepository.java`
2. Update `meal.event.id` in `application.properties`
3. Update test seed dates in `import-test.sql`

---

## Environment Variables (prod)

```
DB_USERNAME=...
DB_PASSWORD=...
DB_URL=jdbc:mysql://rds-host:3306/cccc
```
