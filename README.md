# kg-3dpm

MVP web app for a 3D printing self-checkout flow. Users can create print requests with live pricing, and admins can manage filament pricing, machine cost, and job status from a single dense table.

## Stack

- Next.js 16 + React 19
- Full-stack TypeScript
- SQLite via `better-sqlite3`
- Tailwind CSS 4
- Vitest for pricing unit tests

## Features

- User page at `/`
  - model link or name
  - filament picker with `Brand Material Color` labels
  - weight, duration, quantity, note
  - duration accepts minutes or `HH:MM`
  - live material, machine, and total pricing
  - confirmation after request creation
- Admin page at `/admin`
  - inline filament editing and availability toggles
  - machine hour price editing
  - dense task table with inline editing
  - status filter and sorting
  - visual status cues for `done`, `printing`, `failed`, and `cancelled`
- Seed data for filaments and example tasks
- Shared pricing logic with unit tests

## Pricing

```text
materialCost = (weightGrams / 1000) * pricePerKg
machineCost = (durationMinutes / 60) * machineHourPrice
estimatedPrice = (materialCost + machineCost) * quantity
finalPrice overrides estimatedPrice if set
```

## Setup

```bash
npm install
npm run seed
npm run dev
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/admin`

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run seed
```

## Database

- Schema: [db/schema.sql](/C:/Users/kamko/Documents/New%20project%202/db/schema.sql)
- SQLite file: `db/kg-3dpm.sqlite`
- Seed script: [scripts/seed.ts](/C:/Users/kamko/Documents/New%20project%202/scripts/seed.ts)

The app auto-initializes the schema on first run and seeds empty databases. `npm run seed` resets the local SQLite file contents back to the included sample data.

## Project structure

```text
app/
  admin/page.tsx
  api/
components/
lib/
  db.ts
  pricing.ts
  seed-data.ts
  store.ts
  types.ts
  validators.ts
db/
  schema.sql
scripts/
  seed.ts
tests/
  pricing.test.ts
```

## Notes

- No authentication, payments, integrations, STL parsing, or inventory tracking are included in this MVP.
- Currency formatting is currently set to EUR and can be adjusted in `lib/utils.ts`.
