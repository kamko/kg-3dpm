import { extractTrianglesFrom3mfBuffer, type Triangle, type Vector3 } from "./model-geometry";
import type { ComplexityOptionId, SizeOptionId } from "./quick-estimate";
import { formatDuration } from "./utils";

type GeometryStats = {
  min: Vector3;
  max: Vector3;
  triangleCount: number;
  volumeMm3: number;
};

export type StlAnalysis = {
  dimensionsMm: {
    x: number;
    y: number;
    z: number;
    max: number;
  };
  triangleCount: number;
  volumeCm3: number | null;
  estimatedWeightGrams: number;
  estimatedDurationMinutes: number;
  inferredSize: SizeOptionId;
  inferredComplexity: ComplexityOptionId;
  summary: string;
};

const MATERIAL_DENSITY: Record<string, number> = {
  pla: 1.24,
  petg: 1.27,
  abs: 1.04,
  asa: 1.07,
  tpu: 1.21,
};

const EFFECTIVE_MATERIAL_FACTOR: Record<ComplexityOptionId, number> = {
  simple: 0.31,
  standard: 0.35,
  detailed: 0.39,
};

const TIME_MULTIPLIER: Record<ComplexityOptionId, number> = {
  simple: 2.0,
  standard: 2.3,
  detailed: 2.7,
};

export function analyzeStlBuffer(
  buffer: ArrayBuffer,
  materialName: string,
): StlAnalysis {
  const geometry = looksLikeBinaryStl(buffer)
    ? parseBinaryStl(buffer)
    : parseAsciiStl(buffer);

  return finalizeAnalysis(geometry, materialName, "STL");
}

export async function analyze3mfBuffer(
  buffer: ArrayBuffer,
  materialName: string,
): Promise<StlAnalysis> {
  const triangles = await extractTrianglesFrom3mfBuffer(buffer);
  const combined = geometryFromTriangles(triangles);

  return finalizeAnalysis(combined, materialName, "3MF");
}

function finalizeAnalysis(
  geometry: GeometryStats,
  materialName: string,
  sourceLabel: "STL" | "3MF",
): StlAnalysis {
  if (geometry.triangleCount === 0) {
    throw new Error(`The ${sourceLabel} file did not contain any triangles.`);
  }

  const dimensionsMm = {
    x: round1(geometry.max.x - geometry.min.x),
    y: round1(geometry.max.y - geometry.min.y),
    z: round1(geometry.max.z - geometry.min.z),
    max: round1(
      Math.max(
        geometry.max.x - geometry.min.x,
        geometry.max.y - geometry.min.y,
        geometry.max.z - geometry.min.z,
      ),
    ),
  };

  const inferredSize = inferSize(dimensionsMm.max);
  const inferredComplexity = inferComplexity(geometry.triangleCount);
  const density = inferDensity(materialName);
  const volumeCm3 =
    geometry.volumeMm3 > 0 ? round2(geometry.volumeMm3 / 1000) : null;

  const estimatedWeightGrams = round1(
    Math.max(
      3,
      (volumeCm3 ?? estimateVolumeFromBounds(dimensionsMm.max)) *
        density *
        EFFECTIVE_MATERIAL_FACTOR[inferredComplexity],
    ),
  );

  const estimatedDurationMinutes = Math.max(
    15,
    Math.round(estimatedWeightGrams * TIME_MULTIPLIER[inferredComplexity]),
  );

  return {
    dimensionsMm,
    triangleCount: geometry.triangleCount,
    volumeCm3,
    estimatedWeightGrams,
    estimatedDurationMinutes,
    inferredSize,
    inferredComplexity,
    summary: `${dimensionsMm.x} x ${dimensionsMm.y} x ${dimensionsMm.z} mm, ${geometry.triangleCount.toLocaleString()} triangles, ~${estimatedWeightGrams} g, ${formatDuration(estimatedDurationMinutes)}`,
  };
}

function looksLikeBinaryStl(buffer: ArrayBuffer) {
  if (buffer.byteLength < 84) {
    return false;
  }

  const view = new DataView(buffer);
  const faceCount = view.getUint32(80, true);
  return 84 + faceCount * 50 === buffer.byteLength;
}

function parseBinaryStl(buffer: ArrayBuffer): GeometryStats {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const min = makeInfinityVector(1);
  const max = makeInfinityVector(-1);
  let volumeMm3 = 0;

  for (let i = 0; i < triangleCount; i += 1) {
    const offset = 84 + i * 50 + 12;
    const a = readBinaryVertex(view, offset);
    const b = readBinaryVertex(view, offset + 12);
    const c = readBinaryVertex(view, offset + 24);

    includeVertex(a, min, max);
    includeVertex(b, min, max);
    includeVertex(c, min, max);
    volumeMm3 += signedTetrahedronVolume(a, b, c);
  }

  return {
    triangleCount,
    min,
    max,
    volumeMm3: Math.abs(volumeMm3),
  };
}

function parseAsciiStl(buffer: ArrayBuffer): GeometryStats {
  const text = new TextDecoder().decode(buffer);
  const matches = [...text.matchAll(/vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g)];
  const min = makeInfinityVector(1);
  const max = makeInfinityVector(-1);
  let triangleCount = 0;
  let volumeMm3 = 0;

  for (let i = 0; i + 2 < matches.length; i += 3) {
    const a = matchToVertex(matches[i]);
    const b = matchToVertex(matches[i + 1]);
    const c = matchToVertex(matches[i + 2]);

    includeVertex(a, min, max);
    includeVertex(b, min, max);
    includeVertex(c, min, max);
    volumeMm3 += signedTetrahedronVolume(a, b, c);
    triangleCount += 1;
  }

  return {
    triangleCount,
    min,
    max,
    volumeMm3: Math.abs(volumeMm3),
  };
}

function geometryFromTriangles(triangles: Triangle[]): GeometryStats {
  const min = makeInfinityVector(1);
  const max = makeInfinityVector(-1);
  let volumeMm3 = 0;

  for (const triangle of triangles) {
    includeVertex(triangle.a, min, max);
    includeVertex(triangle.b, min, max);
    includeVertex(triangle.c, min, max);
    volumeMm3 += signedTetrahedronVolume(triangle.a, triangle.b, triangle.c);
  }

  return {
    min,
    max,
    triangleCount: triangles.length,
    volumeMm3: Math.abs(volumeMm3),
  };
}

function readBinaryVertex(view: DataView, offset: number): Vector3 {
  return {
    x: view.getFloat32(offset, true),
    y: view.getFloat32(offset + 4, true),
    z: view.getFloat32(offset + 8, true),
  };
}

function matchToVertex(match: RegExpMatchArray): Vector3 {
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

function includeVertex(vertex: Vector3, min: Vector3, max: Vector3) {
  min.x = Math.min(min.x, vertex.x);
  min.y = Math.min(min.y, vertex.y);
  min.z = Math.min(min.z, vertex.z);
  max.x = Math.max(max.x, vertex.x);
  max.y = Math.max(max.y, vertex.y);
  max.z = Math.max(max.z, vertex.z);
}

function signedTetrahedronVolume(a: Vector3, b: Vector3, c: Vector3) {
  return (
    (a.x * (b.y * c.z - b.z * c.y) -
      a.y * (b.x * c.z - b.z * c.x) +
      a.z * (b.x * c.y - b.y * c.x)) /
    6
  );
}

function inferDensity(materialName: string) {
  const key = materialName.trim().toLowerCase();
  const entry = Object.entries(MATERIAL_DENSITY).find(([name]) =>
    key.includes(name),
  );

  return entry?.[1] ?? MATERIAL_DENSITY.pla;
}

function inferSize(maxDimensionMm: number): SizeOptionId {
  if (maxDimensionMm <= 40) {
    return "tiny";
  }

  if (maxDimensionMm <= 80) {
    return "small";
  }

  if (maxDimensionMm <= 140) {
    return "medium";
  }

  return "large";
}

function inferComplexity(triangleCount: number): ComplexityOptionId {
  if (triangleCount <= 8_000) {
    return "simple";
  }

  if (triangleCount <= 80_000) {
    return "standard";
  }

  return "detailed";
}

function estimateVolumeFromBounds(maxDimensionMm: number) {
  const normalized = Math.max(12, maxDimensionMm);
  return (normalized * normalized * normalized * 0.08) / 1000;
}

function makeInfinityVector(direction: 1 | -1): Vector3 {
  return {
    x: direction > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
    y: direction > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
    z: direction > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
