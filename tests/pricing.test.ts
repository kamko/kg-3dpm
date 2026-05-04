import { describe, expect, it } from "vitest";
import { calculatePricing, parseDurationInput } from "../lib/pricing";

describe("calculatePricing", () => {
  it("computes material, machine, and total costs", () => {
    expect(
      calculatePricing({
        weightGrams: 125,
        durationMinutes: 150,
        quantity: 2,
        pricePerKg: 20,
        machineHourPrice: 6,
      }),
    ).toEqual({
      materialCost: 2.5,
      machineCost: 15,
      estimatedPrice: 35,
    });
  });

  it("rounds currency values to cents", () => {
    expect(
      calculatePricing({
        weightGrams: 333,
        durationMinutes: 67,
        quantity: 1,
        pricePerKg: 21.95,
        machineHourPrice: 7.35,
      }),
    ).toEqual({
      materialCost: 7.31,
      machineCost: 8.21,
      estimatedPrice: 15.52,
    });
  });
});

describe("parseDurationInput", () => {
  it("parses minute-only input", () => {
    expect(parseDurationInput("95")).toBe(95);
  });

  it("parses HH:MM input", () => {
    expect(parseDurationInput("01:35")).toBe(95);
  });

  it("rejects invalid durations", () => {
    expect(parseDurationInput("00:00")).toBeNull();
    expect(parseDurationInput("2:75")).toBeNull();
    expect(parseDurationInput("nope")).toBeNull();
  });
});
