# kg-3dpm

`kg-3dpm` is a lightweight 3D print request and estimation tool with two surfaces:

- a public upload flow for end users
- a backoffice for operators who price, review, accept, and manage jobs

Instead of asking users to guess weight or print time, the app can take STL/3MF uploads, run a real slicer estimate in a sandboxed worker, and return filament usage, duration, and price before the request is sent.

## What this tool does

### Public side

- upload one `3MF`, or one or more `STL` files
- choose filament and quantity
- run a real slicer-backed estimate
- review filament usage, machine time, and price
- send the request only after the estimate looks right

### Backoffice

- manage filament pricing and slicer preset mapping
- adjust machine hour pricing
- review incoming estimates and request notes
- accept requests so pricing is locked for that row
- download uploaded source models
- retry failed slicer jobs

### Under the hood

- source files are stored in RustFS
- slice jobs are queued in Redis
- a separate worker slices models with PrusaSlicer
- results are written back to SQLite through the app API
- the worker runs in a locked-down container with no public ingress

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
  - STL/3MF uploads with real slicer-backed estimation
  - multi-file STL estimation in one request
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

File uploads need Redis + RustFS + worker running, so the easiest full setup is Docker Compose.

## Docker Compose deployment

The repository now includes a self-contained MVP deployment stack:

```bash
docker compose up --build
```

For pull-based deployment using the published GitHub Container Registry images:

```bash
docker compose -f docker-compose.images.yml up -d
```

Services:

- `web` on [http://localhost:3000](http://localhost:3000)
- `rustfs` S3 API on [http://localhost:9000](http://localhost:9000)
- `rustfs` console on [http://localhost:9001](http://localhost:9001)
- `redis` internal only
- `worker` internal only

You can also build the runtime images directly without Compose:

```bash
docker build -t kg-3dpm-web -f Dockerfile .
docker build -t kg-3dpm-worker -f worker/Dockerfile .
```

The published-image Compose file is [docker-compose.images.yml](/C:/Users/kamko/Documents/New%20project%202/docker-compose.images.yml). By default it pulls:

- `ghcr.io/kamko/kg-3dpm-web:latest`
- `ghcr.io/kamko/kg-3dpm-worker:latest`

You can override those tags with:

- `KG3DPM_WEB_IMAGE`
- `KG3DPM_WORKER_IMAGE`

## Container publishing

GitHub Actions now builds and publishes both runtime images to GitHub Container Registry on every push to `main`:

- `ghcr.io/<owner>/kg-3dpm-web`
- `ghcr.io/<owner>/kg-3dpm-worker`

The workflow file is [`.github/workflows/docker-publish.yml`](/C:/Users/kamko/Documents/New%20project%202/.github/workflows/docker-publish.yml). Pull requests still build both images for validation, but do not push them.

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
