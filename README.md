# Time-Off Microservice

A production-grade NestJS microservice for managing employee time-off requests, backed by a local SQLite database and integrated with an external HCM system.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Time-Off Microservice                      │
│                                                              │
│  POST /time-off          POST /sync/batch                    │
│       │                        │                            │
│  ┌────▼────────┐        ┌──────▼──────────┐                 │
│  │ TimeOff     │        │  Sync           │                 │
│  │ Module      │        │  Module         │                 │
│  │             │        │                 │                 │
│  │ - Check     │        │ - Upsert all    │                 │
│  │   Balance   │        │   balances from │                 │
│  │ - Save      │        │   HCM payload   │                 │
│  │   PENDING   │        │   (overwrite)   │                 │
│  │ - Call HCM  │        └─────────────────┘                 │
│  │ - Update    │                                            │
│  │   APPROVED/ │        ┌──────────────────┐               │
│  │   REJECTED  │        │  Mock HCM        │               │
│  └──────┬──────┘        │  /mock-hcm/      │               │
│         │               │  approve         │               │
│         │  HTTP POST    │  (15% errors,    │               │
│         └──────────────►│   20% rejects)   │               │
│                         └──────────────────┘               │
│                                                              │
│  ┌───────────────────────────────────────────┐              │
│  │              SQLite (time_off.sqlite)     │              │
│  │  ┌─────────────────┐  ┌────────────────┐ │              │
│  │  │ time_off_       │  │   balances     │ │              │
│  │  │ requests        │  │                │ │              │
│  │  │ - id (uuid)     │  │ - id (uuid)    │ │              │
│  │  │ - employee_id   │  │ - employee_id  │ │              │
│  │  │ - location_id   │  │ - location_id  │ │              │
│  │  │ - status        │  │ - remaining_   │ │              │
│  │  │ - duration      │  │   days         │ │              │
│  │  │ - hcm_reason    │  │ - last_synced_ │ │              │
│  │  └─────────────────┘  │   at           │ │              │
│  │                        └────────────────┘ │              │
│  └───────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

---

## Setup

### Prerequisites
- Node.js ≥ 18
- pnpm (`npm install -g pnpm`)

### Install & Run

```bash
# Install dependencies
pnpm install

# Development (hot reload)
pnpm start:dev

# Production
pnpm build && pnpm start:prod
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HCM_BASE_URL` | `http://localhost:3000/mock-hcm` | External HCM base URL |
| `HCM_ERROR_RATE` | `0.15` | Probability mock HCM throws 503 |
| `HCM_REJECT_RATE` | `0.20` | Probability mock HCM rejects request |
| `HCM_MIN_LATENCY` | `100` | Simulated latency floor (ms) |
| `HCM_MAX_LATENCY` | `400` | Simulated latency ceiling (ms) |

---

## API Reference

### 1. Seed Balances — `POST /sync/batch`

Must be called before submitting time-off requests.

```bash
curl -s -X POST http://localhost:3000/sync/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "balances": [
      { "employeeId": "emp-001", "locationId": "loc-nyc", "remainingDays": 15 },
      { "employeeId": "emp-002", "locationId": "loc-lon", "remainingDays": 5 }
    ]
  }' | jq
```

**Response `200`**
```json
{
  "message": "Sync complete. 2 balance(s) updated in 12ms.",
  "data": { "upserted": 2, "durationMs": 12 }
}
```

---

### 2. Submit Time-Off Request — `POST /time-off`

```bash
curl -s -X POST http://localhost:3000/time-off \
  -H 'Content-Type: application/json' \
  -d '{
    "employeeId": "emp-001",
    "locationId": "loc-nyc",
    "duration": 3
  }' | jq
```

**Response `201` — Approved**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "employeeId": "emp-001",
    "locationId": "loc-nyc",
    "status": "APPROVED",
    "duration": 3,
    "hcmReason": "Approved by line manager via HCM workflow.",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.500Z"
  },
  "message": "Time-off request is APPROVED."
}
```

**Response `422` — Insufficient Balance**
```json
{
  "statusCode": 422,
  "error": ["Insufficient balance: requested 3 days but only 2 remaining."]
}
```

**Response `404` — No Balance Record**
```json
{
  "statusCode": 404,
  "error": ["No balance record found for employee=emp-999 location=loc-nyc."]
}
```

---

### 3. List All Requests — `GET /time-off`

```bash
curl -s http://localhost:3000/time-off | jq
```

---

### 4. Get Single Request — `GET /time-off/:id`

```bash
curl -s http://localhost:3000/time-off/550e8400-e29b-41d4-a716-446655440000 | jq
```

---

### 5. Inspect Local Balances — `GET /sync/balances`

```bash
curl -s http://localhost:3000/sync/balances | jq
```

---

## Testing

```bash
# Run all unit tests
pnpm test

# With coverage report
pnpm test:cov
```

### Testing Scenarios

```bash
# ── Scenario 1: Insufficient balance ───────────────────────────────────────
# Seed with 2 days, request 5 → expect 422
curl -s -X POST http://localhost:3000/sync/batch \
  -H 'Content-Type: application/json' \
  -d '{"balances":[{"employeeId":"emp-low","locationId":"loc-nyc","remainingDays":2}]}'

curl -s -X POST http://localhost:3000/time-off \
  -H 'Content-Type: application/json' \
  -d '{"employeeId":"emp-low","locationId":"loc-nyc","duration":5}'

# ── Scenario 2: Force HCM errors (set error rate to 100%) ──────────────────
HCM_ERROR_RATE=1.0 pnpm start:dev
# All requests will stay PENDING

# ── Scenario 3: Always reject ───────────────────────────────────────────────
HCM_ERROR_RATE=0 HCM_REJECT_RATE=1.0 pnpm start:dev
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| SQLite with TypeORM | Zero-dependency DB for local dev; swap `type: 'postgres'` for production |
| Upsert in batch sync | Idempotent — calling `/sync/batch` twice is safe |
| Atomic balance deduction | Raw `UPDATE remaining_days - N` prevents race conditions vs read-modify-write |
| PENDING on HCM timeout | Enables a retry job (e.g. BullMQ) to reprocess without data loss |
| Mock HCM in same process | No docker-compose needed for local dev; disabled in production via `HCM_BASE_URL` |
