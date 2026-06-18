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

## Architecture

```
Browser (phone)
  → Quarkus HTTP :8088
      ├── /api/*        → REST endpoints (MealResource)
      ├── /q/swagger-ui → OpenAPI docs
      └── /*            → Quinoa serves React PWA (from dist/)

Quarkus ← MariaDB/MySQL (same cccc database as good-camp)
```

In dev mode Quinoa proxies the React Vite dev server on `:5173`. In prod the built React assets are served directly by Quarkus.

### Project Structure

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
│       │   │   └── ResultBanner.tsx scan result feedback
│       │   ├── App.tsx           Tab layout (Meal / Check-In / Info)
│       │   └── main.tsx
│       ├── vite.config.ts        PWA plugin + /api proxy
│       └── package.json
├── test/
│   ├── java/com/cccmbiz/
│   │   ├── MealResourceTest.java
│   │   └── MealServiceTest.java
│   └── resources/import-test.sql
└── docker/init/schema.sql        Local dev DB init
```

### Key Conventions

- **Backend:** Same conventions as `meal-api-quarkus` — Panache repositories, RESTEasy Reactive, Lombok.
- **Frontend:** React + Vite + Tailwind CSS. API calls via `src/api/client.ts` only — never call axios directly from pages.
- **UI language:** Chinese first, English second (e.g., `餐食 Meal`).
- **QR scanning:** `@zxing/library` via browser camera API — no native app needed.
- **PWA:** `vite-plugin-pwa` with `display: fullscreen` — volunteers tap "Add to Home Screen" to install.

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
