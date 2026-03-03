# KTZ Railway Node MVP 🚂

A **dynamic railway node rescheduling system** — event-driven, greedy solver, versioned schedules, end-to-end demo.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | NestJS + TypeScript |
| ORM | Prisma |
| DB | PostgreSQL 15 |
| Cache/Bus | Redis 7 |
| Frontend | Next.js 14 + Tailwind CSS |
| Deploy | Docker Compose |

---

## Quick Start

### 1. Clone & Start

```bash
cd /path/to/ktz
docker compose up --build
```

> First build takes ~3-5 minutes. On subsequent runs it's fast.

Services:
- **Frontend** → http://localhost:3000
- **Backend API** → http://localhost:3001
- **Swagger Docs** → http://localhost:3001/api/docs

---

### 2. Seed Demo Data

```bash
curl -X POST http://localhost:3001/admin/seed \
  -H "x-admin-token: super-secret-admin-token-change-me"
```

This creates:
- 1 Station (Almaty-1, code: ALA1)
- 6 Tracks
- 1 Depot + 10 Locomotives + 20 Crews
- 30 TrainRuns (next 6h, mixed PASSENGER/FREIGHT/OTHER)
- Initial ScheduleVersion with Allocations (via greedy solver)

The response includes `stationId` — save this for subsequent calls.

---

### 3. Demo Flow (End-to-End)

#### Step 1: Open Dashboard
Go to http://localhost:3000. Click **🌱 Seed Demo Data** in the UI.

#### Step 2: Inject a LOCOMOTIVE_FAILURE Event

```bash
curl -X POST http://localhost:3001/events \
  -H "Content-Type: application/json" \
  -d '{
    "stationId": "<stationId-from-seed>",
    "type": "LOCOMOTIVE_FAILURE",
    "payload": {
      "locomotiveId": "<locomotiveId>"
    }
  }'
```

Response:
```json
{
  "eventId": "...",
  "newVersionId": "...",
  "baseVersionId": "...",
  "summary": ["Train 700: shifted +15min", "Train 703: new loco assigned", ...]
}
```

#### Step 3: Compare Schedule Versions

```bash
curl "http://localhost:3001/schedule/compare?fromVersionId=<base>&toVersionId=<new>"
```

#### Step 4: Use the Simulation UI
Go to http://localhost:3000/simulation — select event type, fill JSON payload, click **⚡ Inject Event** to see live before/after diff.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/seed` | Seed demo data (requires `x-admin-token` header) |
| `GET` | `/node/overview?stationId=` | Latest schedule with all train runs |
| `GET` | `/schedule/versions?stationId=` | List all schedule versions |
| `GET` | `/schedule/version/:id` | Get version detail with allocations |
| `GET` | `/schedule/compare?fromVersionId=&toVersionId=` | Diff two versions |
| `POST` | `/events` | Inject event → triggers rescheduler |
| `GET` | `/events?stationId=` | List events |
| `GET` | `/analytics/node-overview?stationId=` | Metrics + utilization |

Full interactive docs: **http://localhost:3001/api/docs**

---

## Event Types & Payloads

| Type | Payload |
|------|---------|
| `LOCOMOTIVE_FAILURE` | `{ "locomotiveId": "uuid" }` |
| `CREW_UNAVAILABLE` | `{ "crewId": "uuid" }` |
| `TRAIN_DELAY` | `{ "trainRunId": "uuid", "delayMinutes": 30 }` |
| `TRACK_BLOCKED` | `{ "trackId": "uuid" }` |
| `MAINTENANCE_STARTED` | `{ "locomotiveId": "uuid" }` |
| `MAINTENANCE_ENDED` | `{ "locomotiveId": "uuid" }` |

---

## Greedy Solver

The rescheduler (`src/modules/scheduling/greedy-solver.ts`) runs automatically on every event:

1. **Sort** train runs by priority (PASSENGER=3 > FREIGHT=2 > OTHER=1), then by scheduledDeparture
2. For each train run, attempt to find: free track + available loco + available crew
3. **Constraints**:
   - Crew: `availableFrom <= departure - 120min`
   - Loco: `availableFrom <= departure - 60min`, status=AVAILABLE, at this station
   - Track: no overlapping occupancy `[dep - 10min, dep + 20min]`
   - Headway: ≥ 5 min between departures on the same track
4. If conflict → shift departure by +5min increments, up to 180min
5. If still unresolved → mark `conflictFlags` + note "UNRESOLVED"

**To swap solver**: implement `ISolver` interface in `solver.interface.ts`, inject in `SchedulingModule`.

---

## Project Structure

```
ktz/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── admin/          # Seed endpoint
│   │   │   ├── node/           # Node overview
│   │   │   ├── schedule/       # Versions + compare
│   │   │   ├── events/         # Event ingestion + trigger
│   │   │   ├── analytics/      # Metrics
│   │   │   └── scheduling/     # Greedy solver + service
│   │   ├── prisma/             # PrismaService
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── prisma/
│   │   └── schema.prisma       # 11 models + indexes
│   ├── Dockerfile
│   └── .env
├── frontend/
│   ├── app/
│   │   ├── dashboard/page.tsx  # Metrics + seed
│   │   ├── node/page.tsx       # Train run table
│   │   ├── simulation/page.tsx # Event injection + diff
│   │   └── versions/page.tsx   # Version list + compare
│   ├── lib/api.ts              # Typed API client
│   ├── Dockerfile
│   └── .env
└── docker-compose.yml
```

---

## Running Unit Tests

```bash
cd backend
npm install
npx prisma generate
npm test
```

Tests cover the GreedySolver:
- Simple happy path (1 train, enough resources)
- Crew notice constraint violation
- Priority ordering (PASSENGER before FREIGHT before OTHER)
- Departure shifting for track conflicts (headway enforcement)

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | Postgres connection |
| `REDIS_URL` | `redis://redis:6379` | Redis connection |
| `ADMIN_TOKEN` | `super-secret-admin-token-change-me` | Admin API token |
| `PORT` | `3001` | Backend port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Frontend → backend URL |

---

## Local Development (without Docker)

```bash
# Start Postgres + Redis
docker compose up postgres redis -d

# Backend
cd backend
npm install
npx prisma migrate deploy
npm run start:dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```
