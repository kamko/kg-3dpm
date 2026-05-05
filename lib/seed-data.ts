import type Database from "better-sqlite3";
import { calculatePricing } from "@/lib/pricing";
import { getDefaultPrusaPresetKey } from "@/lib/prusa";
import type {
  EstimateSource,
  EstimateState,
  SubmissionState,
  TaskStatus,
} from "@/lib/types";

const FILAMENTS = [
  {
    brand: "Jayo",
    material: "PLA Matte",
    color: "Black",
    pricePerKg: 22.9,
    presetKey: getDefaultPrusaPresetKey("PLA Matte"),
    available: true,
  },
  {
    brand: "Jayo",
    material: "PLA 2.0",
    color: "Red",
    pricePerKg: 18.9,
    presetKey: getDefaultPrusaPresetKey("PLA 2.0"),
    available: true,
  },
  {
    brand: "Jayo",
    material: "PLA 2.0",
    color: "Blue",
    pricePerKg: 18.9,
    presetKey: getDefaultPrusaPresetKey("PLA 2.0"),
    available: true,
  },
  {
    brand: "Generic",
    material: "PETG",
    color: "White",
    pricePerKg: 24.5,
    presetKey: getDefaultPrusaPresetKey("PETG"),
    available: true,
  },
] as const;

const TASKS: Array<{
  nameOrLink: string;
  sourceUrl?: string;
  filamentIndex: number;
  quantity: number;
  weightGrams: number;
  durationMinutes: number;
  finalPrice: number | null;
  status: TaskStatus;
  submissionState: SubmissionState;
  estimateState: EstimateState;
  estimateSource: EstimateSource;
  note: string;
}> = [
  {
    nameOrLink: "Destroyed",
    filamentIndex: 0,
    quantity: 1,
    weightGrams: 124,
    durationMinutes: 185,
    finalPrice: null,
    status: "new",
    submissionState: "submitted",
    estimateState: "ready",
    estimateSource: "manual",
    note: "Customer requested matte finish.",
  },
  {
    nameOrLink: "Ruins Frame",
    filamentIndex: 1,
    quantity: 2,
    weightGrams: 96,
    durationMinutes: 140,
    finalPrice: null,
    status: "printing",
    submissionState: "submitted",
    estimateState: "ready",
    estimateSource: "manual",
    note: "Split into two plates.",
  },
  {
    nameOrLink: "Villages",
    filamentIndex: 2,
    quantity: 1,
    weightGrams: 210,
    durationMinutes: 255,
    finalPrice: 14.8,
    status: "done",
    submissionState: "submitted",
    estimateState: "ready",
    estimateSource: "prusa",
    note: "Delivered on pickup shelf.",
  },
  {
    nameOrLink: "Void",
    filamentIndex: 3,
    quantity: 1,
    weightGrams: 162,
    durationMinutes: 225,
    finalPrice: null,
    status: "failed",
    submissionState: "submitted",
    estimateState: "ready",
    estimateSource: "manual",
    note: "Layer shift at 70%.",
  },
  {
    nameOrLink: "Water",
    filamentIndex: 0,
    quantity: 1,
    weightGrams: 78,
    durationMinutes: 95,
    finalPrice: null,
    status: "cancelled",
    submissionState: "submitted",
    estimateState: "ready",
    estimateSource: "manual",
    note: "Customer changed scale before production.",
  },
] as const;

const DEFAULT_MACHINE_HOUR_PRICE = 7.5;

export function seedDatabase(
  db: Database.Database,
  options?: { reset?: boolean },
) {
  const reset = Boolean(options?.reset);

  if (reset) {
    db.exec(`
      DELETE FROM slice_jobs;
      DELETE FROM artifacts;
      DELETE FROM tasks;
      DELETE FROM filaments;
      DELETE FROM settings;
      DELETE FROM sqlite_sequence WHERE name IN ('filaments', 'tasks', 'artifacts', 'slice_jobs');
    `);
  }

  const settingsCount = (
    db.prepare("SELECT COUNT(*) AS count FROM settings").get() as { count: number }
  ).count;

  if (settingsCount === 0) {
    db.prepare(
      "INSERT INTO settings (id, machine_hour_price) VALUES (1, ?)",
    ).run(DEFAULT_MACHINE_HOUR_PRICE);
  }

  const filamentCount = (
    db.prepare("SELECT COUNT(*) AS count FROM filaments").get() as { count: number }
  ).count;

  if (filamentCount === 0) {
    const insertFilament = db.prepare(`
      INSERT INTO filaments (brand, material, color, price_per_kg, preset_key, available)
      VALUES (@brand, @material, @color, @pricePerKg, @presetKey, @available)
    `);

    for (const filament of FILAMENTS) {
      insertFilament.run({
        ...filament,
        available: filament.available ? 1 : 0,
      });
    }
  }

  const taskCount = (
    db.prepare("SELECT COUNT(*) AS count FROM tasks").get() as { count: number }
  ).count;

  if (taskCount === 0) {
    const machineHourPrice = (
      db.prepare("SELECT machine_hour_price AS machineHourPrice FROM settings WHERE id = 1")
        .get() as { machineHourPrice: number }
    ).machineHourPrice;

    const filamentRows = db
      .prepare(
        "SELECT id, price_per_kg AS pricePerKg FROM filaments ORDER BY id ASC",
      )
      .all() as Array<{ id: number; pricePerKg: number }>;

    const insertTask = db.prepare(`
      INSERT INTO tasks (
        name_or_link,
        source_url,
        filament_id,
        quantity,
        weight_grams,
        duration_minutes,
        estimated_price,
        final_price,
        status,
        submission_state,
        submitted_at,
        estimate_state,
        estimate_source,
        estimate_error,
        note,
        created_at
      )
      VALUES (
        @nameOrLink,
        @sourceUrl,
        @filamentId,
        @quantity,
        @weightGrams,
        @durationMinutes,
        @estimatedPrice,
        @finalPrice,
        @status,
        @submissionState,
        @submittedAt,
        @estimateState,
        @estimateSource,
        NULL,
        @note,
        @createdAt
      )
    `);

    TASKS.forEach((task, index) => {
      const filament = filamentRows[task.filamentIndex];
      const createdAt = new Date(Date.now() - index * 3_600_000).toISOString();
      const pricing = calculatePricing({
        weightGrams: task.weightGrams,
        durationMinutes: task.durationMinutes,
        quantity: task.quantity,
        pricePerKg: filament.pricePerKg,
        machineHourPrice,
      });

      insertTask.run({
        nameOrLink: task.nameOrLink,
        sourceUrl: task.sourceUrl ?? null,
        filamentId: filament.id,
        quantity: task.quantity,
        weightGrams: task.weightGrams,
        durationMinutes: task.durationMinutes,
        estimatedPrice: pricing.estimatedPrice,
        finalPrice: task.finalPrice,
        status: task.status,
        submissionState: task.submissionState,
        submittedAt: task.submissionState === "submitted" ? createdAt : null,
        estimateState: task.estimateState,
        estimateSource: task.estimateSource,
        note: task.note,
        createdAt,
      });
    });
  }
}
