# Time-Off Service

A NestJS REST API that manages employee time-off requests with HCM (Human Capital Management) integration. The service handles the full approval lifecycle: balance validation → persisting a PENDING request → calling HCM for a decision → updating status and deducting balance on approval.

A **built-in mock HCM server** is included so the system works end-to-end with zero external dependencies.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Typical Usage Walkthrough](#typical-usage-walkthrough)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)

---

## Architecture Overview

```
Client
  │
  ├─ POST /time-off          → TimeOffController → TimeOffService
  │                                                    ├─ Balance check (SQLite)
  │                                                    ├─ Save PENDING (SQLite)
  │                                                    └─ HcmService → POST /mock-hcm/approve
  │                                                                          ↓
  │                                                    Update APPROVED/REJECTED + deduct balance
  │
  ├─ POST /sync/batch        → SyncController → SyncService (upsert balances)
  └─ GET  /sync/balances     → SyncController → SyncService (read balances)
```

- **Database:** SQLite (file-based, zero config — `time_off.sqlite` is auto-created on first run)
- **Mock HCM:** Runs inside the same process on `/mock-hcm/approve`, simulating latency, errors, and rejections via env vars

---

## Prerequisites

| Tool    | Version  |
|---------|----------|
| Node.js | >= 18.x  |
| npm     | >= 9.x   |

No database installation is required — SQLite is embedded via TypeORM.

---

## Getting Started

**1. Clone the repository**

```bash
git clone https://github.com/your-org/time-off-service.git
cd time-off-service
```

**2. Install dependencies**

```bash
npm install
```

**3. (Optional) Configure environment variables**

The app runs with sensible defaults — no `.env` file is required to get started. To customise behaviour, create a `.env` file in the project root:

```bash
cp .env.example .env
```

See [Environment Variables](#environment-variables) for all available options.

---

## Environment Variables

All variables are optional. Defaults work for local development out of the box.

| Variable          | Description                                                              | Default                          |
|-------------------|--------------------------------------------------------------------------|----------------------------------|
| `PORT`            | Port the service listens on                                              | `3000`                           |
| `HCM_BASE_URL`    | Base URL of the HCM approval endpoint                                    | `http://localhost:3000/mock-hcm` |
| `NODE_ENV`        | Enables TypeORM SQL logging when set to `development`                    | _(unset)_                        |
| `HCM_ERROR_RATE`  | Probability (0–1) that the mock HCM returns HTTP 503                     | `0.15`                           |
| `HCM_REJECT_RATE` | Probability (0–1) that the mock HCM rejects an otherwise valid request   | `0.20`                           |
| `HCM_MIN_LATENCY` | Minimum simulated HCM response latency in milliseconds                   | `100`                            |
| `HCM_MAX_LATENCY` | Maximum simulated HCM response latency in milliseconds                   | `400`                            |

> **Tip:** Set `HCM_ERROR_RATE=0` and `HCM_REJECT_RATE=0` for a fully deterministic happy-path during manual testing.

---

## Running the Application

**Development mode** (hot reload via `ts-node-dev`):

```bash
npm run start:dev
```

**Production mode:**

```bash
npm run build
npm run start:prod
```

On startup you will see:

```
🚀 Time-Off Service running on http://localhost:3000
🔧 Mock HCM Service available at http://localhost:3000/mock-hcm
```

The SQLite database file `time_off.sqlite` is created automatically in the project root — no migrations needed.

---

## API Reference

### Time-Off Requests

#### `POST /time-off`
Submit a new time-off request. The service validates balance, saves the request, calls HCM for approval, and returns the final status.

**Request body:**
```json
{
  "employeeId": "emp-001",
  "locationId": "loc-nyc",
  "duration": 3
}
```

| Field        | Type   | Description                                       |
|--------------|--------|---------------------------------------------------|
| `employeeId` | string | Employee identifier                               |
| `locationId` | string | Location identifier (must match a synced balance) |
| `duration`   | number | Requested days (positive number, e.g. `0.5` for half day) |

**Response `201`:**
```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "employeeId": "emp-001",
    "locationId": "loc-nyc",
    "duration": 3,
    "status": "APPROVED",
    "hcmReason": "Approved by line manager via HCM workflow.",
    "createdAt": "2026-04-24T10:00:00.000Z",
    "updatedAt": "2026-04-24T10:00:01.000Z"
  },
  "message": "Time-off request is APPROVED."
}
```

Possible `status` values: `PENDING` (HCM unreachable), `APPROVED`, `REJECTED`.

---

#### `GET /time-off`
List all time-off requests, ordered by most recent first.

**Response `200`:**
```json
{
  "data": [ ...requests ],
  "total": 5
}
```

---

#### `GET /time-off/:id`
Get a single request by UUID.

**Response `200`:**
```json
{
  "data": { ...request }
}
```

---

### Balance Sync

#### `POST /sync/batch`
Seed or overwrite local balances from HCM data. **Must be called at least once before submitting any time-off requests.**

**Request body:**
```json
{
  "balances": [
    { "employeeId": "emp-001", "locationId": "loc-nyc", "remainingDays": 15 },
    { "employeeId": "emp-002", "locationId": "loc-lon", "remainingDays": 10 }
  ]
}
```

**Response `200`:**
```json
{
  "message": "Sync complete. 2 balance(s) updated in 12ms.",
  "data": { "upserted": 2, "durationMs": 12 }
}
```

---

#### `GET /sync/balances`
Inspect all current local balances.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "employeeId": "emp-001",
      "locationId": "loc-nyc",
      "remainingDays": 12,
      "lastSyncedAt": "2026-04-24T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### Mock HCM

#### `POST /mock-hcm/approve`
Internal endpoint used by `HcmService`. Called automatically — you do not need to invoke this directly. Simulates a real HCM system with configurable latency, error rate, and rejection rate (see [Environment Variables](#environment-variables)).

---

## Typical Usage Walkthrough

Here is a complete end-to-end flow using `curl`:

**Step 1 — Seed a balance**
```bash
curl -s -X POST http://localhost:3000/sync/batch \
  -H "Content-Type: application/json" \
  -d '{"balances":[{"employeeId":"emp-001","locationId":"loc-nyc","remainingDays":15}]}' \
  | jq
```

**Step 2 — Submit a time-off request**
```bash
curl -s -X POST http://localhost:3000/time-off \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"emp-001","locationId":"loc-nyc","duration":3}' \
  | jq
```

**Step 3 — Check updated balance**
```bash
curl -s http://localhost:3000/sync/balances | jq
```
*(If approved, `remainingDays` will have decreased by 3.)*

**Step 4 — List all requests**
```bash
curl -s http://localhost:3000/time-off | jq
```

---

## Running Tests

**Run all tests:**
```bash
npm test
```

**Run tests with coverage report:**
```bash
npm run test:cov
```

**Run a single test file:**
```bash
npx jest src/time-off/hcm.service.spec.ts
```

### Coverage Summary

| File                   | Statements | Branches | Functions | Lines      |
|------------------------|------------|----------|-----------|------------|
| `sync.service.ts`      | 100%       | 100%     | 100%      | 100%       |
| `hcm.service.ts`       | 100%       | 100%     | 100%      | 100%       |
| `time-off.service.ts`  | 95.45%     | 100%     | 71.42%    | 95.12%     |
| **All files**          | **98.18%** | **100%** | **85.71%**| **97.97%** |

> **Note:** The `ERROR` log lines printed during test runs (e.g. `HCM responded with HTTP 500`, `Network error`) are **intentional** — they are produced by test cases that deliberately exercise the error-handling paths in `HcmService`. All 19 tests pass.

---

## Project Structure

```
src/
├── app.module.ts                        # Root module — wires TypeORM (SQLite) + feature modules
├── main.ts                              # Bootstrap — global pipes, exception filter, port
│
├── common/
│   └── filters/
│       └── http-exception.filter.ts     # Consistent JSON error shape for all HTTP exceptions
│
├── hcm-mock/
│   ├── hcm-mock.controller.ts           # Mock HCM server (POST /mock-hcm/approve)
│   └── hcm-mock.module.ts
│
├── sync/
│   ├── dto/
│   │   └── batch-sync.dto.ts            # Validated DTO for POST /sync/batch
│   ├── sync.controller.ts               # POST /sync/batch, GET /sync/balances
│   ├── sync.module.ts
│   ├── sync.service.ts                  # Transactional upsert of balance records
│   └── sync.service.spec.ts
│
└── time-off/
    ├── dto/
    │   └── create-time-off.dto.ts       # Validated DTO for POST /time-off
    ├── entities/
    │   ├── balance.entity.ts            # Balance table (employeeId + locationId unique index)
    │   └── time-off-request.entity.ts   # TimeOffRequest table (PENDING/APPROVED/REJECTED)
    ├── Hcm.service.ts                   # Adapter — calls external HCM via fetch() with 5s timeout
    ├── hcm.service.spec.ts
    ├── time-off.controller.ts           # POST /time-off, GET /time-off, GET /time-off/:id
    ├── time-off.module.ts
    ├── time-off.service.ts              # Core business logic — full request lifecycle
    └── time-off.service.spec.ts
```

---

## Design Decisions

- **SQLite over PostgreSQL** — zero-config embedded database makes the service trivially runnable with no infrastructure setup. The TypeORM abstraction means swapping to PostgreSQL or MySQL requires only a config change in `app.module.ts`.
- **Built-in mock HCM** — the mock runs in-process so the service is fully self-contained. It simulates realistic behaviour (latency, 503s, policy rejections) and is fully tuneable via env vars.
- **Transactional writes** — all DB mutations use `DataSource.transaction()` for atomicity. Balance deduction uses a raw `UPDATE ... SET remaining_days - N` to be safe against concurrent requests.
- **Graceful HCM failure** — if HCM is unreachable the request is left as `PENDING` rather than failing, so a retry job can pick it up later without data loss.
- **5-second HCM timeout** — `AbortSignal.timeout(5_000)` is applied to all HCM fetch calls to prevent indefinite hangs.
