import { describe, expect, it } from "vitest";
import { getQuickEstimate } from "../lib/quick-estimate";

describe("getQuickEstimate", () => {
  it("returns a suggestion for a standard medium print", () => {
    expect(getQuickEstimate("medium", "standard")).toEqual({
      weightGrams: 120,
      durationMinutes: 240,
    });
  });

  it("adjusts weight and duration by complexity", () => {
    expect(getQuickEstimate("small", "simple")).toEqual({
      weightGrams: 47,
      durationMinutes: 96,
    });

    expect(getQuickEstimate("large", "detailed")).toEqual({
      weightGrams: 276,
      durationMinutes: 600,
    });
  });
});
