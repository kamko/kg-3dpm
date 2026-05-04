import { z } from "zod";
import { PRUSA_PRESET_KEYS } from "@/lib/prusa";
import {
  SLICE_JOB_STATUSES,
  TASK_STATUSES,
} from "@/lib/types";

const baseTaskSchema = {
  nameOrLink: z.string().trim().min(1, "Name or link is required."),
  filamentId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  note: z.string().trim().max(2000).optional().default(""),
};

export const createTaskSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("manual"),
    ...baseTaskSchema,
    weightGrams: z.coerce.number().positive(),
    durationInput: z.string().trim().min(1, "Duration is required."),
  }),
  z.object({
    mode: z.literal("upload"),
    ...baseTaskSchema,
    sourceArtifactId: z.coerce.number().int().positive(),
  }),
]);

export const updateTaskSchema = z.object({
  nameOrLink: z.string().trim().min(1).optional(),
  filamentId: z.coerce.number().int().positive().optional(),
  quantity: z.coerce.number().int().positive().optional(),
  weightGrams: z
    .union([z.coerce.number().positive(), z.literal(null)])
    .optional(),
  durationInput: z.union([z.string().trim().min(1), z.literal(null)]).optional(),
  finalPrice: z
    .preprocess(
      (value) =>
        value === "" || value === null || value === undefined ? null : Number(value),
      z.number().min(0).nullable(),
    )
    .optional(),
  status: z.enum(TASK_STATUSES).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const updateFilamentSchema = z.object({
  brand: z.string().trim().min(1).optional(),
  material: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  pricePerKg: z.coerce.number().positive().optional(),
  presetKey: z.enum(PRUSA_PRESET_KEYS).optional(),
  available: z.boolean().optional(),
});

export const createFilamentSchema = z.object({
  brand: z.string().trim().min(1, "Brand is required."),
  material: z.string().trim().min(1, "Material is required."),
  color: z.string().trim().min(1, "Color is required."),
  pricePerKg: z.coerce.number().positive("Price per kilogram must be greater than zero."),
  presetKey: z.enum(PRUSA_PRESET_KEYS),
  available: z.boolean().default(true),
});

export const updateSettingsSchema = z.object({
  machineHourPrice: z.coerce.number().positive(),
});

export const sliceReportSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("running"),
  }),
  z.object({
    status: z.literal("failed"),
    error: z.string().trim().min(1).max(1000),
  }),
  z.object({
    status: z.literal("succeeded"),
    weightGrams: z.coerce.number().positive(),
    durationMinutes: z.coerce.number().int().positive(),
    artifacts: z
      .array(
        z.object({
          kind: z.enum(["sliced-gcode", "sliced-3mf", "slice-log"]),
          storageKey: z.string().trim().min(1),
          originalName: z.string().trim().min(1),
          contentType: z.string().trim().min(1),
          sizeBytes: z.coerce.number().int().min(0),
        }),
      )
      .default([]),
    logExcerpt: z.string().trim().max(4000).optional(),
  }),
]);

export const retrySliceJobSchema = z.object({
  status: z.enum(SLICE_JOB_STATUSES).optional(),
});

export const uploadSchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  sizeBytes: z.number().int().min(1).max(100 * 1024 * 1024),
});
