import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { calculatePricing } from "@/lib/pricing";
import type {
  Artifact,
  EstimateSource,
  EstimateState,
  Filament,
  Settings,
  SliceJob,
  SliceJobStatus,
  SliceQueuePayload,
  SliceReportArtifact,
  Task,
  TaskStatus,
} from "@/lib/types";
import { filamentLabel } from "@/lib/utils";

type FilamentRow = {
  id: number;
  brand: string;
  material: string;
  color: string;
  pricePerKg: number;
  presetKey: string;
  available: number;
};

type TaskRow = {
  id: number;
  nameOrLink: string;
  filamentId: number;
  quantity: number;
  weightGrams: number | null;
  durationMinutes: number | null;
  estimatedPrice: number | null;
  finalPrice: number | null;
  status: TaskStatus;
  acceptedAt: string | null;
  submissionState: "draft" | "submitted";
  submittedAt: string | null;
  estimateState: EstimateState;
  estimateSource: EstimateSource;
  estimateError: string | null;
  note: string;
  createdAt: string;
  filamentBrand: string;
  filamentMaterial: string;
  filamentColor: string;
  sourceArtifactId: number | null;
  sliceJobId: number | null;
  sliceJobStatus: SliceJobStatus | null;
  sliceJobLastError: string | null;
};

type ArtifactRow = {
  id: number;
  taskId: number | null;
  kind: Artifact["kind"];
  storageKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

type SliceJobRow = {
  id: number;
  taskId: number;
  sourceArtifactId: number;
  status: SliceJobStatus;
  engine: string;
  presetKey: string;
  attemptCount: number;
  lastError: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

const allFilamentsQuery = `
  SELECT
    id,
    brand,
    material,
    color,
    price_per_kg AS pricePerKg,
    preset_key AS presetKey,
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
    tasks.accepted_at AS acceptedAt,
    tasks.submission_state AS submissionState,
    tasks.submitted_at AS submittedAt,
    tasks.estimate_state AS estimateState,
    tasks.estimate_source AS estimateSource,
    tasks.estimate_error AS estimateError,
    tasks.note,
    tasks.created_at AS createdAt,
    filaments.brand AS filamentBrand,
    filaments.material AS filamentMaterial,
    filaments.color AS filamentColor,
    slice_jobs.source_artifact_id AS sourceArtifactId,
    slice_jobs.id AS sliceJobId,
    slice_jobs.status AS sliceJobStatus,
    slice_jobs.last_error AS sliceJobLastError
  FROM tasks
  INNER JOIN filaments ON filaments.id = tasks.filament_id
  LEFT JOIN slice_jobs ON slice_jobs.task_id = tasks.id
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
    .prepare(
      `${taskSelectQuery} WHERE tasks.submission_state = 'submitted' ORDER BY datetime(COALESCE(tasks.submitted_at, tasks.created_at)) DESC, tasks.id DESC`,
    )
    .all() as TaskRow[];
  return rows.map(mapTask);
}

export function createUploadedArtifact(input: {
  storageKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}) {
  const db = getDb();
  const result = db
    .prepare(
      `
        INSERT INTO artifacts (
          task_id,
          kind,
          storage_key,
          original_name,
          content_type,
          size_bytes
        )
        VALUES (NULL, 'source-model', ?, ?, ?, ?)
      `,
    )
    .run(
      input.storageKey,
      input.originalName,
      input.contentType,
      input.sizeBytes,
    );

  return getArtifactById(Number(result.lastInsertRowid));
}

export function createTask(
  input:
    | {
        mode: "manual";
        nameOrLink: string;
        filamentId: number;
        quantity: number;
        weightGrams: number;
        durationMinutes: number;
        note: string;
      }
    | {
        mode: "upload";
        nameOrLink: string;
        filamentId: number;
        quantity: number;
        sourceArtifactId: number;
        note: string;
      },
) {
  const db = getDb();
  const filament = getFilamentById(db, input.filamentId);

  if (!filament) {
    throw new Error("Filament not found.");
  }

  if (input.mode === "manual") {
    const now = new Date().toISOString();
    const settings = getSettings();
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
            submission_state,
            submitted_at,
            estimate_state,
            estimate_source,
            estimate_error,
            note
          )
          VALUES (?, ?, ?, ?, ?, ?, NULL, 'new', 'submitted', ?, 'ready', 'manual', NULL, ?)
        `,
      )
      .run(
        input.nameOrLink,
        input.filamentId,
        input.quantity,
        input.weightGrams,
        input.durationMinutes,
        pricing.estimatedPrice,
        now,
        input.note,
      );

    return {
      task: getTaskById(Number(result.lastInsertRowid)),
      queuePayload: null,
    };
  }

  const sourceArtifact = getArtifactById(input.sourceArtifactId);
  if (!sourceArtifact || sourceArtifact.kind !== "source-model") {
    throw new Error("Uploaded model file not found.");
  }

  if (sourceArtifact.taskId !== null) {
    throw new Error("Uploaded model file has already been assigned.");
  }

  const presetKey = filament.presetKey;

  const transaction = db.transaction(() => {
    const taskResult = db
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
            submission_state,
            submitted_at,
            estimate_state,
            estimate_source,
            estimate_error,
            note
          )
          VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'new', 'draft', NULL, 'pending', 'prusa', NULL, ?)
        `,
      )
      .run(input.nameOrLink, input.filamentId, input.quantity, input.note);

    const taskId = Number(taskResult.lastInsertRowid);

    db.prepare("UPDATE artifacts SET task_id = ? WHERE id = ?").run(
      taskId,
      input.sourceArtifactId,
    );

    const sliceJobResult = db
      .prepare(
        `
          INSERT INTO slice_jobs (
            task_id,
            source_artifact_id,
            status,
            engine,
            preset_key,
            attempt_count,
            last_error
          )
          VALUES (?, ?, 'queued', 'prusa', ?, 1, NULL)
        `,
      )
      .run(taskId, input.sourceArtifactId, presetKey);

    return {
      taskId,
      sliceJobId: Number(sliceJobResult.lastInsertRowid),
    };
  })();

  return {
    task: getTaskById(transaction.taskId),
    queuePayload: {
      sliceJobId: transaction.sliceJobId,
      taskId: transaction.taskId,
      sourceArtifact: {
        id: sourceArtifact.id,
        storageKey: sourceArtifact.storageKey,
        originalName: sourceArtifact.originalName,
        contentType: sourceArtifact.contentType,
        sizeBytes: sourceArtifact.sizeBytes,
      },
      filamentMaterial: filament.material,
      presetKey,
    } satisfies SliceQueuePayload,
  };
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
          preset_key = @presetKey,
          available = @available
      WHERE id = @id
    `,
  ).run({
    ...next,
    id,
    available: next.available ? 1 : 0,
  });

  if (
    patch.pricePerKg !== undefined &&
    patch.pricePerKg !== current.pricePerKg
  ) {
    refreshTaskEstimates(db, "WHERE tasks.filament_id = ?", [id]);
  }

  return getFilamentById(db, id);
}

export function createFilament(input: Omit<Filament, "id">) {
  const db = getDb();
  const result = db
    .prepare(
      `
        INSERT INTO filaments (brand, material, color, price_per_kg, preset_key, available)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.brand.trim(),
      input.material.trim(),
      input.color.trim(),
      input.pricePerKg,
      input.presetKey,
      input.available ? 1 : 0,
    );

  return getFilamentById(db, Number(result.lastInsertRowid));
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
    weightGrams?: number | null;
    durationMinutes?: number | null;
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
    weightGrams:
      patch.weightGrams !== undefined ? patch.weightGrams : current.weightGrams,
    durationMinutes:
      patch.durationMinutes !== undefined
        ? patch.durationMinutes
        : current.durationMinutes,
    finalPrice:
      patch.finalPrice !== undefined ? patch.finalPrice : current.finalPrice,
    status: patch.status ?? current.status,
    note: patch.note ?? current.note,
  };

  const filament = getFilamentById(db, next.filamentId);
  const settings = getSettings();

  if (!filament) {
    throw new Error("Filament not found.");
  }

  let estimatedPrice: number | null = null;
  let estimateState = current.estimateState;
  let estimateSource = current.estimateSource;
  let estimateError = current.estimateError;

  if (next.weightGrams !== null && next.durationMinutes !== null) {
    estimatedPrice = calculatePricing({
      weightGrams: next.weightGrams,
      durationMinutes: next.durationMinutes,
      quantity: next.quantity,
      pricePerKg: filament.pricePerKg,
      machineHourPrice: settings.machineHourPrice,
    }).estimatedPrice;
  }

  if (patch.weightGrams !== undefined || patch.durationMinutes !== undefined) {
    if (
      patch.weightGrams === null ||
      patch.durationMinutes === null ||
      next.weightGrams === null ||
      next.durationMinutes === null
    ) {
      estimatedPrice = null;
      estimateState = "pending";
      estimateSource = current.estimateSource;
    } else {
      estimateState = "ready";
      estimateSource = "manual";
      estimateError = null;
    }
  }

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
          estimate_state = @estimateState,
          estimate_source = @estimateSource,
          estimate_error = @estimateError,
          note = @note
      WHERE id = @id
    `,
  ).run({
    ...next,
    id,
    estimatedPrice,
    estimateState,
    estimateSource,
    estimateError,
  });

  return getTaskById(id);
}

export function submitTask(id: number) {
  const db = getDb();
  const task = getTaskById(id);

  if (!task) {
    throw new Error("Task not found.");
  }

  if (task.submissionState === "submitted") {
    throw new Error("Task has already been submitted.");
  }

  if (task.estimateState !== "ready" || task.estimatedPrice === null) {
    throw new Error("Estimate must be ready before sending the request.");
  }

  const submittedAt = new Date().toISOString();
  db.prepare(
    `
      UPDATE tasks
      SET submission_state = 'submitted',
          submitted_at = ?
      WHERE id = ?
    `,
  ).run(submittedAt, id);

  return getTaskById(id);
}

export function acceptTask(id: number) {
  const db = getDb();
  const task = getTaskById(id);

  if (!task) {
    throw new Error("Task not found.");
  }

  if (task.submissionState !== "submitted") {
    throw new Error("Only submitted requests can be accepted.");
  }

  if (task.acceptedAt) {
    throw new Error("Task has already been accepted.");
  }

  if (task.estimateState !== "ready" || task.estimatedPrice === null) {
    throw new Error("Only ready estimates can be accepted.");
  }

  db.prepare(
    `
      UPDATE tasks
      SET accepted_at = ?,
          final_price = COALESCE(final_price, estimated_price)
      WHERE id = ?
    `,
  ).run(new Date().toISOString(), id);

  return getTaskById(id);
}

export function getTaskById(id: number) {
  const db = getDb();
  const row = db
    .prepare(`${taskSelectQuery} WHERE tasks.id = ?`)
    .get(id) as TaskRow | undefined;

  return row ? mapTask(row) : null;
}

export function getArtifactById(id: number) {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          id,
          task_id AS taskId,
          kind,
          storage_key AS storageKey,
          original_name AS originalName,
          content_type AS contentType,
          size_bytes AS sizeBytes,
          created_at AS createdAt
        FROM artifacts
        WHERE id = ?
      `,
    )
    .get(id) as ArtifactRow | undefined;

  return row ? mapArtifact(row) : null;
}

export function getSliceJobById(id: number) {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          id,
          task_id AS taskId,
          source_artifact_id AS sourceArtifactId,
          status,
          engine,
          preset_key AS presetKey,
          attempt_count AS attemptCount,
          last_error AS lastError,
          queued_at AS queuedAt,
          started_at AS startedAt,
          finished_at AS finishedAt
        FROM slice_jobs
        WHERE id = ?
      `,
    )
    .get(id) as SliceJobRow | undefined;

  return row ? mapSliceJob(row) : null;
}

export function reportSliceJobRunning(id: number) {
  const db = getDb();
  const job = getSliceJobById(id);

  if (!job) {
    throw new Error("Slice job not found.");
  }

  db.prepare(
    `
      UPDATE slice_jobs
      SET status = 'running',
          started_at = COALESCE(started_at, ?),
          finished_at = NULL,
          last_error = NULL
      WHERE id = ?
    `,
  ).run(new Date().toISOString(), id);

  return getSliceJobById(id);
}

export function reportSliceJobFailed(id: number, error: string) {
  const db = getDb();
  const job = getSliceJobById(id);

  if (!job) {
    throw new Error("Slice job not found.");
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare(
      `
        UPDATE slice_jobs
        SET status = 'failed',
            last_error = ?,
            finished_at = ?,
            started_at = COALESCE(started_at, ?)
        WHERE id = ?
      `,
    ).run(error, now, now, id);

    db.prepare(
      `
        UPDATE tasks
        SET estimate_state = 'failed',
            estimate_source = 'prusa',
            estimate_error = ?
        WHERE id = ?
      `,
    ).run(error, job.taskId);
  });

  transaction();

  return getTaskById(job.taskId);
}

export function reportSliceJobSucceeded(input: {
  id: number;
  weightGrams: number;
  durationMinutes: number;
  logExcerpt?: string;
  artifacts: SliceReportArtifact[];
}) {
  const db = getDb();
  const job = getSliceJobById(input.id);

  if (!job) {
    throw new Error("Slice job not found.");
  }

  const task = getTaskById(job.taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  const filament = getFilamentById(db, task.filamentId);
  if (!filament) {
    throw new Error("Filament not found.");
  }

  const settings = getSettings();
  const pricing = calculatePricing({
    weightGrams: input.weightGrams,
    durationMinutes: input.durationMinutes,
    quantity: task.quantity,
    pricePerKg: filament.pricePerKg,
    machineHourPrice: settings.machineHourPrice,
  });

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare(
      `
        UPDATE slice_jobs
        SET status = 'succeeded',
            last_error = NULL,
            finished_at = ?,
            started_at = COALESCE(started_at, ?)
        WHERE id = ?
      `,
    ).run(now, now, input.id);

    db.prepare(
      `
        UPDATE tasks
        SET weight_grams = ?,
            duration_minutes = ?,
            estimated_price = ?,
            estimate_state = 'ready',
            estimate_source = 'prusa',
            estimate_error = NULL
        WHERE id = ?
      `,
    ).run(
      input.weightGrams,
      input.durationMinutes,
      pricing.estimatedPrice,
      job.taskId,
    );

    const insertArtifact = db.prepare(
      `
        INSERT OR IGNORE INTO artifacts (
          task_id,
          kind,
          storage_key,
          original_name,
          content_type,
          size_bytes
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    );

    for (const artifact of input.artifacts) {
      insertArtifact.run(
        job.taskId,
        artifact.kind,
        artifact.storageKey,
        artifact.originalName,
        artifact.contentType,
        artifact.sizeBytes,
      );
    }
  });

  transaction();

  return getTaskById(job.taskId);
}

export function retrySliceJob(id: number) {
  const db = getDb();
  const job = getSliceJobById(id);

  if (!job) {
    throw new Error("Slice job not found.");
  }

  if (job.status !== "failed") {
    throw new Error("Only failed slice jobs can be retried.");
  }

  const task = getTaskById(job.taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  const artifact = getArtifactById(job.sourceArtifactId);
  if (!artifact) {
    throw new Error("Source artifact not found.");
  }

  const filament = getFilamentById(db, task.filamentId);
  if (!filament) {
    throw new Error("Filament not found.");
  }

  const now = new Date().toISOString();
  db.prepare(
    `
      UPDATE slice_jobs
      SET status = 'queued',
          attempt_count = attempt_count + 1,
          last_error = NULL,
          queued_at = ?,
          started_at = NULL,
          finished_at = NULL
      WHERE id = ?
    `,
  ).run(now, id);

  db.prepare(
    `
      UPDATE tasks
      SET estimate_state = 'pending',
          estimate_source = 'prusa',
          estimate_error = NULL,
          weight_grams = NULL,
          duration_minutes = NULL,
          estimated_price = NULL
      WHERE id = ?
    `,
  ).run(task.id);

  return {
    task: getTaskById(task.id),
    queuePayload: {
      sliceJobId: id,
      taskId: task.id,
      sourceArtifact: {
        id: artifact.id,
        storageKey: artifact.storageKey,
        originalName: artifact.originalName,
        contentType: artifact.contentType,
        sizeBytes: artifact.sizeBytes,
      },
      filamentMaterial: filament.material,
      presetKey: job.presetKey,
    } satisfies SliceQueuePayload,
  };
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
          preset_key AS presetKey,
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
        WHERE tasks.estimate_state = 'ready'
          AND tasks.accepted_at IS NULL
          AND tasks.weight_grams IS NOT NULL
          AND tasks.duration_minutes IS NOT NULL
          ${whereClause ? `AND ${whereClause.replace(/^WHERE\s+/i, "")}` : ""}
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
    presetKey: row.presetKey,
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
    acceptedAt: row.acceptedAt,
    submissionState: row.submissionState,
    submittedAt: row.submittedAt,
    estimateState: row.estimateState,
    estimateSource: row.estimateSource,
    estimateError: row.estimateError,
    note: row.note,
    createdAt: row.createdAt,
    filamentLabel: filamentLabel({
      brand: row.filamentBrand,
      material: row.filamentMaterial,
      color: row.filamentColor,
    }),
    sourceArtifactId: row.sourceArtifactId,
    sliceJobId: row.sliceJobId,
    sliceJobStatus: row.sliceJobStatus,
    sliceJobLastError: row.sliceJobLastError,
  };
}

function mapArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    taskId: row.taskId,
    kind: row.kind,
    storageKey: row.storageKey,
    originalName: row.originalName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  };
}

function mapSliceJob(row: SliceJobRow): SliceJob {
  return {
    id: row.id,
    taskId: row.taskId,
    sourceArtifactId: row.sourceArtifactId,
    status: row.status,
    engine: row.engine,
    presetKey: row.presetKey,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    queuedAt: row.queuedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}
