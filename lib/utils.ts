import clsx, { type ClassValue } from "clsx";
import type { Filament } from "@/lib/types";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function cn(...values: ClassValue[]) {
  return clsx(values);
}

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${remainingMinutes
    .toString()
    .padStart(2, "0")}`;
}

export function formatGrams(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} g`;
}

export function filamentLabel(filament: Pick<Filament, "brand" | "material" | "color">) {
  return [filament.brand, filament.material, filament.color].join(" ");
}

export function publicFilamentLabel(
  filament: Pick<Filament, "material" | "color">,
) {
  return [filament.material, filament.color].join(" ");
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
