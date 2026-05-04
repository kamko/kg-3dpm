# kg-3dpm

`kg-3dpm` is an MVP 3D printing self-checkout app with a public request flow and a separate backoffice. The public side can now submit real slicer-backed estimates asynchronously: uploaded STL/3MF files are stored in RustFS, queued in Redis, sliced by a sandboxed worker, and written back into the app when PrusaSlicer finishes.

## Stack

- Next.js 16 + React 19
- Full-stack TypeScript
- SQLite via `better-sqlite3`
- Redis queue
- RustFS object storage
- PrusaSlicer worker service
- Vitest for pricing and slicer lifecycle tests

## What changed in this version

- Public `/` flow supports:
  - `Model file` mode for STL/3MF uploads
  - `Slicer values` mode for exact manual numbers
  - pending estimate confirmation with polling until the slicer result is ready
- Admin `/admin` shows:
  - estimate state (`queued`, `slicing`, `ready`, `needs review`)
  - slicer errors
  - retry action for failed slice jobs
- New backend pieces:
  - `POST /api/uploads`
  - async slice job queue in Redis
  - internal worker callback endpoint
  - artifact tracking for uploads, G-code, and logs
- New deployment stack:
  - `web`
  - `worker`
  - `redis`
- `rustfs`
- `rustfs-perms`

## Pricing

```text
materialCost = (weightGrams / 1000) * pricePerKg
machineCost = (durationMinutes / 60) * machineHourPrice
estimatedPrice = (materialCost + machineCost) * quantity
finalPrice overrides estimatedPrice if set
```

## Local app setup

```bash
npm install
npm run seed
npm run dev
```

Open:

- [Public page](http://localhost:3000/)
- [Admin page](http://localhost:3000/admin)

Manual slicer values work immediately in local dev. File uploads need Redis + RustFS + worker running, so the easiest full setup is Docker Compose.

## Docker Compose deployment

The repository now includes a self-contained MVP deployment stack:

```bash
docker compose up --build
```

Services:

- `web` on [http://localhost:3000](http://localhost:3000)
- `rustfs` S3 API on [http://localhost:9000](http://localhost:9000)
- `rustfs` console on [http://localhost:9001](http://localhost:9001)
- `redis` internal only
- `worker` internal only

Default local RustFS credentials:

- RustFS user: `rustfsadmin`
- RustFS password: `rustfsadmin`
- bucket: `kg-3dpm`

Important compose defaults:

- SQLite persists in the `app_data` named volume
- RustFS persists in the `rustfs_data` named volume
- worker runs with `read_only`, dropped capabilities, `no-new-privileges`, `tmpfs /tmp`, CPU/memory/PID limits, and no published ports

## Environment

See [.env.example](/C:/Users/kamko/Documents/New%20project%202/.env.example) for overridable values.

The key ones are:

- `DATABASE_DIR`
- `REDIS_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `STORAGE_BUCKET`
- `SLICE_WORKER_SECRET`
- `PRUSA_SLICER_BIN`
- `PRUSA_CONFIG_DEFAULT`
- `PRUSA_CONFIG_PLA_DEFAULT`
- `PRUSA_CONFIG_PETG_DEFAULT`

## Slicer worker

The worker lives in [worker/index.ts](/C:/Users/kamko/Documents/New%20project%202/worker/index.ts) and currently uses PrusaSlicer through [worker/prusa-engine.ts](/C:/Users/kamko/Documents/New%20project%202/worker/prusa-engine.ts).

Flow:

1. Public upload stores the source file in RustFS and creates an `artifacts` row.
2. Task creation creates a `slice_jobs` row with `estimate_state = pending`.
3. The queue pushes a payload into Redis.
4. The worker downloads the model into an ephemeral temp dir.
5. PrusaSlicer generates G-code and the worker parses Prusa metadata comments for:
   - filament grams
   - estimated print time
6. The worker uploads G-code and logs back to RustFS.
7. The worker reports success or failure through the internal callback endpoint.
8. The task becomes `ready` or `failed`.

## Presets

The repo includes baseline preset files:

- [worker/presets/pla-default.ini](/C:/Users/kamko/Documents/New%20project%202/worker/presets/pla-default.ini)
- [worker/presets/petg-default.ini](/C:/Users/kamko/Documents/New%20project%202/worker/presets/petg-default.ini)

These are MVP defaults for CLI slicing. In a production setup you should replace them with exported presets that match your actual printer, nozzle, and process configuration.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run seed
npm run worker
```

## Database and schema

- Schema: [db/schema.sql](/C:/Users/kamko/Documents/New%20project%202/db/schema.sql)
- Seed script: [scripts/seed.ts](/C:/Users/kamko/Documents/New%20project%202/scripts/seed.ts)

Main tables:

- `filaments`
- `settings`
- `tasks`
- `artifacts`
- `slice_jobs`

## Tests

Current automated coverage includes:

- pricing and duration parsing
- STL/3MF geometry analysis
- Prusa metadata parsing and preset mapping
- slice-backed task lifecycle in SQLite

Run:

```bash
npm run test
```
