CREATE TABLE IF NOT EXISTS filaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT NOT NULL,
  price_per_kg REAL NOT NULL CHECK (price_per_kg > 0),
  preset_key TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  machine_hour_price REAL NOT NULL CHECK (machine_hour_price > 0)
);

CREATE TABLE IF NOT EXISTS tasks (
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

CREATE TABLE IF NOT EXISTS artifacts (
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

CREATE TABLE IF NOT EXISTS slice_jobs (
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
