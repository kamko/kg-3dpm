import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { calculatePricing } from "@/lib/pricing";
import type { Filament, Settings, Task, TaskStatus } from "@/lib/types";
import { filamentLabel } from "@/lib/utils";

type FilamentRow = {
  id: number;
  brand: string;
  material: string;
  color: string;
  pricePerKg: number;
  available: number;
};

type TaskRow = {
  id: number;
  nameOrLink: string;
  filamentId: number;
  quantity: number;
  weightGrams: number;
  durationMinutes: number;
  estimatedPrice: number;
  finalPrice: number | null;
  status: TaskStatus;
  note: string;
  createdAt: string;
  filamentBrand: string;
  filamentMaterial: string;
  filamentColor: string;
};

const allFilamentsQuery = `
  SELECT
    id,
    brand,
    material,
    color,
    price_per_kg AS pricePerKg,
    available
  FROM filaments
  ORDER BY available DESC, brand ASC, material ASC, color ASC
`;

const taskSelectQuery = `
  SELECT
    tasks.id,
    tasks.name_or_link AS nameOrLink,
    tasks.filament_id AS filamentId,
    tasks.quantity,
    tasks.weight_grams AS weightGrams,
    tasks.duration_minutes AS durationMinutes,
    tasks.estimated_price AS estimatedPrice,
    tasks.final_price AS finalPrice,
    tasks.status,
    tasks.note,
    tasks.created_at AS createdAt,
    filaments.brand AS filamentBrand,
    filaments.material AS filamentMaterial,
    filaments.color AS filamentColor
  FROM tasks
  INNER JOIN filaments ON filaments.id = tasks.filament_id
`;

export function getUserPageData() {
  return {
    filaments: getAvailableFilaments(),
    settings: getSettings(),
  };
}

export function getAdminPageData() {
  return {
    filaments: getAllFilaments(),
    settings: getSettings(),
    tasks: getAllTasks(),
  };
}

export function getAllFilaments() {
  const db = getDb();
  const rows = db.prepare(allFilamentsQuery).all() as FilamentRow[];
  return rows.map(mapFilament);
}

export function getAvailableFilaments() {
  return getAllFilaments().filter((filament) => filament.available);
}

export function getSettings(): Settings {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT machine_hour_price AS machineHourPrice FROM settings WHERE id = 1",
    )
    .get() as Settings;

  return row;
}

export function getAllTasks() {
  const db = getDb();
  const rows = db
    .prepare(`${taskSelectQuery} ORDER BY datetime(tasks.created_at) DESC, tasks.id DESC`)
    .all() as TaskRow[];
  return rows.map(mapTask);
}

export function createTask(input: {
  nameOrLink: string;
  filamentId: number;
  quantity: number;
  weightGrams: number;
  durationMinutes: number;
  note: string;
}) {
  const db = getDb();
  const filament = getFilamentById(db, input.filamentId);
  const settings = getSettings();

  if (!filament) {
    throw new Error("Filament not found.");
  }

  const pricing = calculatePricing({
    weightGrams: input.weightGrams,
    durationMinutes: input.durationMinutes,
    quantity: input.quantity,
    pricePerKg: filament.pricePerKg,
    machineHourPrice: settings.machineHourPrice,
  });

  const result = db
    .prepare(
      `
      INSERT INTO tasks (
        name_or_link,
        filament_id,
        quantity,
        weight_grams,
        duration_minutes,
        estimated_price,
        final_price,
        status,
        note
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, 'new', ?)
    `,
    )
    .run(
      input.nameOrLink,
      input.filamentId,
      input.quantity,
      input.weightGrams,
      input.durationMinutes,
      pricing.estimatedPrice,
      input.note,
    );

  return getTaskById(Number(result.lastInsertRowid));
}

export function updateFilament(
  id: number,
  patch: Partial<Omit<Filament, "id">>,
) {
  const db = getDb();
  const current = getFilamentById(db, id);

  if (!current) {
    throw new Error("Filament not found.");
  }

  const next: Filament = {
    ...current,
    ...patch,
  };

  db.prepare(
    `
      UPDATE filaments
      SET brand = @brand,
          material = @material,
          color = @color,
          price_per_kg = @pricePerKg,
          available = @available
      WHERE id = @id
    `,
  ).run({
    ...next,
    id,
    available: next.available ? 1 : 0,
  });

  if (patch.pricePerKg !== undefined && patch.pricePerKg !== current.pricePerKg) {
    refreshTaskEstimates(db, "WHERE filament_id = ?", [id]);
  }

  return getFilamentById(db, id);
}

export function updateSettings(machineHourPrice: number) {
  const db = getDb();

  db.prepare("UPDATE settings SET machine_hour_price = ? WHERE id = 1").run(
    machineHourPrice,
  );
  refreshTaskEstimates(db);

  return getSettings();
}

export function updateTask(
  id: number,
  patch: {
    nameOrLink?: string;
    filamentId?: number;
    quantity?: number;
    weightGrams?: number;
    durationMinutes?: number;
    finalPrice?: number | null;
    status?: TaskStatus;
    note?: string;
  },
) {
  const db = getDb();
  const current = getTaskById(id);

  if (!current) {
    throw new Error("Task not found.");
  }

  const next = {
    nameOrLink: patch.nameOrLink ?? current.nameOrLink,
    filamentId: patch.filamentId ?? current.filamentId,
    quantity: patch.quantity ?? current.quantity,
    weightGrams: patch.weightGrams ?? current.weightGrams,
    durationMinutes: patch.durationMinutes ?? current.durationMinutes,
    finalPrice: patch.finalPrice !== undefined ? patch.finalPrice : current.finalPrice,
    status: patch.status ?? current.status,
    note: patch.note ?? current.note,
  };

  const filament = getFilamentById(db, next.filamentId);
  const settings = getSettings();

  if (!filament) {
    throw new Error("Filament not found.");
  }

  const pricing = calculatePricing({
    weightGrams: next.weightGrams,
    durationMinutes: next.durationMinutes,
    quantity: next.quantity,
    pricePerKg: filament.pricePerKg,
    machineHourPrice: settings.machineHourPrice,
  });

  db.prepare(
    `
      UPDATE tasks
      SET name_or_link = @nameOrLink,
          filament_id = @filamentId,
          quantity = @quantity,
          weight_grams = @weightGrams,
          duration_minutes = @durationMinutes,
          estimated_price = @estimatedPrice,
          final_price = @finalPrice,
          status = @status,
          note = @note
      WHERE id = @id
    `,
  ).run({
    ...next,
    id,
    estimatedPrice: pricing.estimatedPrice,
  });

  return getTaskById(id);
}

export function getTaskById(id: number) {
  const db = getDb();
  const row = db
    .prepare(`${taskSelectQuery} WHERE tasks.id = ?`)
    .get(id) as TaskRow | undefined;

  return row ? mapTask(row) : null;
}

function getFilamentById(db: Database.Database, id: number) {
  const row = db
    .prepare(
      `
        SELECT
          id,
          brand,
          material,
          color,
          price_per_kg AS pricePerKg,
          available
        FROM filaments
        WHERE id = ?
      `,
    )
    .get(id) as FilamentRow | undefined;

  return row ? mapFilament(row) : null;
}

function refreshTaskEstimates(
  db: Database.Database,
  whereClause = "",
  params: unknown[] = [],
) {
  const settings = getSettings();
  const rows = db
    .prepare(
      `
      SELECT
        tasks.id,
        tasks.quantity,
        tasks.weight_grams AS weightGrams,
        tasks.duration_minutes AS durationMinutes,
        filaments.price_per_kg AS pricePerKg
      FROM tasks
      INNER JOIN filaments ON filaments.id = tasks.filament_id
      ${whereClause}
    `,
    )
    .all(...params) as Array<{
    id: number;
    quantity: number;
    weightGrams: number;
    durationMinutes: number;
    pricePerKg: number;
  }>;

  const updateEstimate = db.prepare(
    "UPDATE tasks SET estimated_price = ? WHERE id = ?",
  );

  for (const row of rows) {
    const pricing = calculatePricing({
      weightGrams: row.weightGrams,
      durationMinutes: row.durationMinutes,
      quantity: row.quantity,
      pricePerKg: row.pricePerKg,
      machineHourPrice: settings.machineHourPrice,
    });

    updateEstimate.run(pricing.estimatedPrice, row.id);
  }
}

function mapFilament(row: FilamentRow): Filament {
  return {
    id: row.id,
    brand: row.brand,
    material: row.material,
    color: row.color,
    pricePerKg: row.pricePerKg,
    available: Boolean(row.available),
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    nameOrLink: row.nameOrLink,
    filamentId: row.filamentId,
    quantity: row.quantity,
    weightGrams: row.weightGrams,
    durationMinutes: row.durationMinutes,
    estimatedPrice: row.estimatedPrice,
    finalPrice: row.finalPrice,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    filamentLabel: filamentLabel({
      brand: row.filamentBrand,
      material: row.filamentMaterial,
      color: row.filamentColor,
    }),
  };
}
