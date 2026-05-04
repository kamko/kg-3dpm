import { z } from "zod";
import { TASK_STATUSES } from "@/lib/types";

export const createTaskSchema = z.object({
  nameOrLink: z.string().trim().min(1, "Name or link is required."),
  filamentId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  weightGrams: z.coerce.number().positive(),
  durationInput: z.string().trim().min(1, "Duration is required."),
  note: z.string().trim().max(2000).optional().default(""),
});

export const updateTaskSchema = z.object({
  nameOrLink: z.string().trim().min(1).optional(),
  filamentId: z.coerce.number().int().positive().optional(),
  quantity: z.coerce.number().int().positive().optional(),
  weightGrams: z.coerce.number().positive().optional(),
  durationInput: z.string().trim().min(1).optional(),
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
  available: z.boolean().optional(),
});

export const updateSettingsSchema = z.object({
  machineHourPrice: z.coerce.number().positive(),
});
