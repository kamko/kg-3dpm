export const TASK_STATUSES = [
  "new",
  "printing",
  "done",
  "failed",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Filament = {
  id: number;
  brand: string;
  material: string;
  color: string;
  pricePerKg: number;
  available: boolean;
};

export type Settings = {
  machineHourPrice: number;
};

export type Task = {
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
  filamentLabel: string;
};

export type PricingInput = {
  weightGrams: number;
  durationMinutes: number;
  quantity: number;
  pricePerKg: number;
  machineHourPrice: number;
};

export type CreateTaskPayload = {
  nameOrLink: string;
  filamentId: number;
  quantity: number;
  weightGrams: number;
  durationInput: string;
  note?: string;
};
