CREATE TABLE IF NOT EXISTS filaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT NOT NULL,
  price_per_kg REAL NOT NULL CHECK (price_per_kg > 0),
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
  weight_grams REAL NOT NULL CHECK (weight_grams > 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  estimated_price REAL NOT NULL CHECK (estimated_price >= 0),
  final_price REAL CHECK (final_price IS NULL OR final_price >= 0),
  status TEXT NOT NULL CHECK (
    status IN ('new', 'printing', 'done', 'failed', 'cancelled')
  ),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
