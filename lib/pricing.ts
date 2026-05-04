import type { PricingInput } from "@/lib/types";

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculatePricing(input: PricingInput) {
  const materialCost = roundCurrency((input.weightGrams / 1000) * input.pricePerKg);
  const machineCost = roundCurrency(
    (input.durationMinutes / 60) * input.machineHourPrice,
  );
  const estimatedPrice = roundCurrency(
    (materialCost + machineCost) * input.quantity,
  );

  return {
    materialCost,
    machineCost,
    estimatedPrice,
  };
}

export function parseDurationInput(value: string | number) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.round(value);
  }

  const input = value.trim();
  if (!input) {
    return null;
  }

  if (/^\d+:\d{1,2}$/.test(input)) {
    const [hours, minutes] = input.split(":").map(Number);

    if (minutes > 59) {
      return null;
    }

    const total = hours * 60 + minutes;
    return total > 0 ? total : null;
  }

  if (/^\d+(\.\d+)?$/.test(input)) {
    const total = Math.round(Number(input));
    return total > 0 ? total : null;
  }

  return null;
}
