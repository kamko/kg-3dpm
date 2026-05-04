export const SIZE_OPTIONS = [
  {
    id: "tiny",
    label: "Keychain / token",
    hint: "very small item",
    weightGrams: 18,
    durationMinutes: 45,
  },
  {
    id: "small",
    label: "Desk toy / mini",
    hint: "fits in your palm",
    weightGrams: 55,
    durationMinutes: 120,
  },
  {
    id: "medium",
    label: "Figurine / part",
    hint: "hand-sized print",
    weightGrams: 120,
    durationMinutes: 240,
  },
  {
    id: "large",
    label: "Helmet / terrain",
    hint: "large display piece",
    weightGrams: 240,
    durationMinutes: 480,
  },
] as const;

export const COMPLEXITY_OPTIONS = [
  {
    id: "simple",
    label: "Fast draft",
    hint: "quick and basic",
    weightMultiplier: 0.85,
    durationMultiplier: 0.8,
  },
  {
    id: "standard",
    label: "Standard",
    hint: "most common choice",
    weightMultiplier: 1,
    durationMultiplier: 1,
  },
  {
    id: "detailed",
    label: "Display detail",
    hint: "slower, nicer finish",
    weightMultiplier: 1.15,
    durationMultiplier: 1.25,
  },
] as const;

export type SizeOptionId = (typeof SIZE_OPTIONS)[number]["id"];
export type ComplexityOptionId = (typeof COMPLEXITY_OPTIONS)[number]["id"];

export function getQuickEstimate(
  sizeId: SizeOptionId,
  complexityId: ComplexityOptionId,
) {
  const size = SIZE_OPTIONS.find((option) => option.id === sizeId);
  const complexity = COMPLEXITY_OPTIONS.find(
    (option) => option.id === complexityId,
  );

  if (!size || !complexity) {
    return null;
  }

  return {
    weightGrams: Math.round(size.weightGrams * complexity.weightMultiplier),
    durationMinutes: Math.round(
      size.durationMinutes * complexity.durationMultiplier,
    ),
  };
}
