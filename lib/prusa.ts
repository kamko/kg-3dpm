type ParsedPrusaMetadata = {
  weightGrams: number;
  durationMinutes: number;
};

export const PRUSA_PRESET_KEYS = [
  "pla-default",
  "pla-matte-default",
  "petg-default",
] as const;

export const PRUSA_PRESET_OPTIONS = [
  {
    key: PRUSA_PRESET_KEYS[0],
    label: "PLA default",
    materials: ["PLA", "PLA 2.0"],
  },
  {
    key: PRUSA_PRESET_KEYS[1],
    label: "PLA Matte default",
    materials: ["PLA MATTE"],
  },
  {
    key: PRUSA_PRESET_KEYS[2],
    label: "PETG default",
    materials: ["PETG"],
  },
] as const;

export type PrusaPresetKey = (typeof PRUSA_PRESET_OPTIONS)[number]["key"];

export function getDefaultPrusaPresetKey(material: string): PrusaPresetKey {
  const normalizedMaterial = material.trim().toUpperCase();
  const matchedPreset = PRUSA_PRESET_OPTIONS.find((preset) =>
    (preset.materials as readonly string[]).includes(normalizedMaterial),
  );

  return matchedPreset?.key ?? "pla-default";
}

export const getPrusaPresetKey = getDefaultPrusaPresetKey;

export function getPrusaConfigPath(presetKey: string) {
  return process.env[`PRUSA_CONFIG_${presetKey.toUpperCase().replace(/-/g, "_")}`]
    ?? process.env.PRUSA_CONFIG_DEFAULT
    ?? `/app/worker/presets/${presetKey}.ini`;
}

export function parsePrusaGcodeMetadata(source: string): ParsedPrusaMetadata {
  const weightMatch =
    source.match(/;\s*filament used \[g\]\s*=\s*([\d.]+)/i) ??
    source.match(/;\s*total filament used \[g\]\s*=\s*([\d.]+)/i);
  const timeMatch = source.match(
    /;\s*estimated printing time(?: \(normal mode\))?\s*=\s*([^\r\n]+)/i,
  );

  if (!weightMatch?.[1]) {
    throw new Error("Unable to parse filament grams from Prusa G-code.");
  }

  if (!timeMatch?.[1]) {
    throw new Error("Unable to parse print time from Prusa G-code.");
  }

  return {
    weightGrams: Math.round(Number(weightMatch[1]) * 100) / 100,
    durationMinutes: parsePrusaTimeToMinutes(timeMatch[1]),
  };
}

export function parsePrusaTimeToMinutes(rawValue: string) {
  const normalized = rawValue.trim().toLowerCase();
  const matches = normalized.matchAll(/(\d+)\s*([dhms])/g);

  let totalSeconds = 0;
  for (const match of matches) {
    const value = Number(match[1]);
    const unit = match[2];

    if (unit === "d") {
      totalSeconds += value * 24 * 60 * 60;
    } else if (unit === "h") {
      totalSeconds += value * 60 * 60;
    } else if (unit === "m") {
      totalSeconds += value * 60;
    } else if (unit === "s") {
      totalSeconds += value;
    }
  }

  if (totalSeconds <= 0) {
    throw new Error("Unable to parse Prusa print time.");
  }

  return Math.max(1, Math.round(totalSeconds / 60));
}
