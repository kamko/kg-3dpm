export const TASK_STATUSES = [
  "new",
  "printing",
  "done",
  "failed",
  "cancelled",
] as const;

export const ESTIMATE_STATES = ["pending", "ready", "failed"] as const;
export const ESTIMATE_SOURCES = ["manual", "prusa", "geometry"] as const;
export const SUBMISSION_STATES = ["draft", "submitted"] as const;
export const SLICE_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export const ARTIFACT_KINDS = [
  "source-model",
  "sliced-gcode",
  "sliced-3mf",
  "slice-log",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type EstimateState = (typeof ESTIMATE_STATES)[number];
export type EstimateSource = (typeof ESTIMATE_SOURCES)[number];
export type SubmissionState = (typeof SUBMISSION_STATES)[number];
export type SliceJobStatus = (typeof SLICE_JOB_STATUSES)[number];
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export type Filament = {
  id: number;
  brand: string;
  material: string;
  color: string;
  pricePerKg: number;
  available: boolean;
  presetKey: string;
};

export type Settings = {
  machineHourPrice: number;
};

export type Artifact = {
  id: number;
  taskId: number | null;
  kind: ArtifactKind;
  storageKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export type SliceJob = {
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

export type Task = {
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
  estimateState: EstimateState;
  estimateSource: EstimateSource;
  submissionState: SubmissionState;
  estimateError: string | null;
  note: string;
  createdAt: string;
  submittedAt: string | null;
  filamentLabel: string;
  sourceArtifactId: number | null;
  sliceJobId: number | null;
  sliceJobStatus: SliceJobStatus | null;
  sliceJobLastError: string | null;
};

export type PricingInput = {
  weightGrams: number;
  durationMinutes: number;
  quantity: number;
  pricePerKg: number;
  machineHourPrice: number;
};

export type CreateTaskPayload =
  | {
      mode: "manual";
      nameOrLink: string;
      filamentId: number;
      quantity: number;
      weightGrams: number;
      durationInput: string;
      note?: string;
    }
  | {
      mode: "upload";
      nameOrLink: string;
      filamentId: number;
      quantity: number;
      sourceArtifactId: number;
      note?: string;
    };

export type SliceQueuePayload = {
  sliceJobId: number;
  taskId: number;
  sourceArtifact: Pick<
    Artifact,
    "id" | "storageKey" | "originalName" | "contentType" | "sizeBytes"
  >;
  filamentMaterial: string;
  presetKey: string;
};

export type SliceReportArtifact = Omit<Artifact, "id" | "taskId" | "createdAt">;
