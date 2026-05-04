import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { seedDatabase } from "./seed-data";

const schemaPath = path.join(process.cwd(), "db", "schema.sql");

let database: Database.Database | null = null;

export function getDb() {
  if (database) {
    return database;
  }

  fs.mkdirSync(getDatabaseDirectory(), { recursive: true });
  database = new Database(getDatabasePath());
  database.pragma("journal_mode = WAL");
  runMigrations(database);
  seedDatabase(database);

  return database;
}

function runMigrations(db: Database.Database) {
  db.pragma("foreign_keys = OFF");
  migrateFilamentsTable(db);
  migrateTasksTable(db);
  rebuildTablesWithLegacyTaskRefs(db);
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  db.pragma("foreign_keys = ON");
}

function migrateFilamentsTable(db: Database.Database) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'filaments'",
    )
    .all() as Array<{ name: string }>;

  if (tables.length === 0) {
    return;
  }

  const columns = db
    .prepare("PRAGMA table_info(filaments)")
    .all() as Array<{ name: string }>;

  const hasPresetKey = columns.some((column) => column.name === "preset_key");
  if (hasPresetKey) {
    return;
  }

  db.exec(`
    ALTER TABLE filaments RENAME TO filaments_legacy;

    CREATE TABLE filaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      material TEXT NOT NULL,
      color TEXT NOT NULL,
      price_per_kg REAL NOT NULL CHECK (price_per_kg > 0),
      preset_key TEXT NOT NULL,
      available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1))
    );

    INSERT INTO filaments (
      id,
      brand,
      material,
      color,
      price_per_kg,
      preset_key,
      available
    )
    SELECT
      id,
      brand,
      material,
      color,
      price_per_kg,
      CASE
        WHEN UPPER(material) = 'PETG' THEN 'petg-default'
        WHEN UPPER(material) LIKE '%MATTE%' THEN 'pla-matte-default'
        ELSE 'pla-default'
      END,
      available
    FROM filaments_legacy;

    DROP TABLE filaments_legacy;
  `);
}

function migrateTasksTable(db: Database.Database) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
    )
    .all() as Array<{ name: string }>;

  if (tables.length === 0) {
    return;
  }

  const columns = db
    .prepare("PRAGMA table_info(tasks)")
    .all() as Array<{ name: string }>;

  const hasEstimateState = columns.some((column) => column.name === "estimate_state");
  const hasSubmissionState = columns.some(
    (column) => column.name === "submission_state",
  );
  const hasAcceptedAt = columns.some((column) => column.name === "accepted_at");

  if (hasEstimateState && hasSubmissionState && hasAcceptedAt) {
    return;
  }

  db.exec(`
    ALTER TABLE tasks RENAME TO tasks_legacy;

    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_or_link TEXT NOT NULL,
      filament_id INTEGER NOT NULL REFERENCES filaments(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      weight_grams REAL CHECK (weight_grams IS NULL OR weight_grams > 0),
      duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
      estimated_price REAL CHECK (estimated_price IS NULL OR estimated_price >= 0),
      final_price REAL CHECK (final_price IS NULL OR final_price >= 0),
      status TEXT NOT NULL CHECK (
        status IN ('new', 'printing', 'done', 'failed', 'cancelled')
      ),
      accepted_at TEXT,
      submission_state TEXT NOT NULL DEFAULT 'submitted' CHECK (
        submission_state IN ('draft', 'submitted')
      ),
      submitted_at TEXT,
      estimate_state TEXT NOT NULL DEFAULT 'ready' CHECK (
        estimate_state IN ('pending', 'ready', 'failed')
      ),
      estimate_source TEXT NOT NULL DEFAULT 'manual' CHECK (
        estimate_source IN ('manual', 'prusa', 'geometry')
      ),
      estimate_error TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO tasks (
      id,
      name_or_link,
      filament_id,
      quantity,
      weight_grams,
      duration_minutes,
      estimated_price,
      final_price,
      status,
      accepted_at,
      submission_state,
      submitted_at,
      estimate_state,
      estimate_source,
      estimate_error,
      note,
      created_at
    )
    SELECT
      id,
      name_or_link,
      filament_id,
      quantity,
      weight_grams,
      duration_minutes,
      estimated_price,
      final_price,
      status,
      ${hasAcceptedAt ? "accepted_at" : "NULL"},
      ${hasSubmissionState ? "submission_state" : "'submitted'"},
      ${hasSubmissionState ? "submitted_at" : "created_at"},
      ${hasEstimateState ? "estimate_state" : "'ready'"},
      ${hasEstimateState ? "estimate_source" : "'manual'"},
      ${hasEstimateState ? "estimate_error" : "NULL"},
      note,
      created_at
    FROM tasks_legacy;

    DROP TABLE tasks_legacy;
  `);
}

function rebuildTablesWithLegacyTaskRefs(db: Database.Database) {
  const artifactsRefs = db
    .prepare("PRAGMA foreign_key_list(artifacts)")
    .all() as Array<{ table: string }>;
  const sliceJobRefs = db
    .prepare("PRAGMA foreign_key_list(slice_jobs)")
    .all() as Array<{ table: string }>;

  if (artifactsRefs.some((reference) => reference.table === "tasks_legacy")) {
    db.exec(`
      ALTER TABLE artifacts RENAME TO artifacts_legacy;

      CREATE TABLE artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER REFERENCES tasks(id),
        kind TEXT NOT NULL CHECK (
          kind IN ('source-model', 'sliced-gcode', 'sliced-3mf', 'slice-log')
        ),
        storage_key TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO artifacts (
        id,
        task_id,
        kind,
        storage_key,
        original_name,
        content_type,
        size_bytes,
        created_at
      )
      SELECT
        id,
        task_id,
        kind,
        storage_key,
        original_name,
        content_type,
        size_bytes,
        created_at
      FROM artifacts_legacy;

      DROP TABLE artifacts_legacy;
    `);
  }

  if (sliceJobRefs.some((reference) => reference.table === "tasks_legacy")) {
    db.exec(`
      ALTER TABLE slice_jobs RENAME TO slice_jobs_legacy;

      CREATE TABLE slice_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id),
        source_artifact_id INTEGER NOT NULL REFERENCES artifacts(id),
        status TEXT NOT NULL CHECK (
          status IN ('queued', 'running', 'succeeded', 'failed')
        ),
        engine TEXT NOT NULL,
        preset_key TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
        last_error TEXT,
        queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        finished_at TEXT
      );

      INSERT INTO slice_jobs (
        id,
        task_id,
        source_artifact_id,
        status,
        engine,
        preset_key,
        attempt_count,
        last_error,
        queued_at,
        started_at,
        finished_at
      )
      SELECT
        id,
        task_id,
        source_artifact_id,
        status,
        engine,
        preset_key,
        attempt_count,
        last_error,
        queued_at,
        started_at,
        finished_at
      FROM slice_jobs_legacy;

      DROP TABLE slice_jobs_legacy;
    `);
  }
}

export function resetDbForTests() {
  if (database) {
    database.close();
    database = null;
  }
}

export function getDatabaseDirectory() {
  return process.env.DATABASE_DIR
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_DIR)
    : path.join(process.cwd(), "db");
}

export function getDatabasePath() {
  return path.join(getDatabaseDirectory(), "kg-3dpm.sqlite");
}

export const databasePath = getDatabasePath();
