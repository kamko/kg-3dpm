import JSZip from "jszip";
import type { ComplexityOptionId, SizeOptionId } from "./quick-estimate";
import { formatDuration } from "./utils";

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

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
  const zip = await JSZip.loadAsync(buffer);
  const modelEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /(^|\/).+\.model$/i.test(entry.name),
  );

  if (modelEntries.length === 0) {
    throw new Error("The 3MF file did not contain a core .model payload.");
  }

  let combined = createEmptyGeometry();

  for (const entry of modelEntries) {
    const xml = await entry.async("string");
    const geometry = parse3mfModel(xml);
    combined = mergeGeometry(combined, geometry);
  }

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

function parse3mfModel(xml: string): GeometryStats {
  const objectMatches = [...xml.matchAll(/<object\b[\s\S]*?<\/object>/g)];
  const geometries = new Map<string, GeometryStats>();

  for (const objectMatch of objectMatches) {
    const objectXml = objectMatch[0];
    const idMatch = objectXml.match(/\bid="([^"]+)"/);

    if (!idMatch || !objectXml.includes("<mesh")) {
      continue;
    }

    const geometry = parse3mfMesh(objectXml);
    if (geometry.triangleCount > 0) {
      geometries.set(idMatch[1], geometry);
    }
  }

  const buildItems = [...xml.matchAll(/<item\b([^>]*)\/>/g)];

  if (buildItems.length === 0) {
    return [...geometries.values()].reduce(mergeGeometry, createEmptyGeometry());
  }

  let combined = createEmptyGeometry();

  for (const buildItem of buildItems) {
    const attrs = buildItem[1];
    const objectId = attrs.match(/\bobjectid="([^"]+)"/)?.[1];
    const geometry = objectId ? geometries.get(objectId) : null;

    if (!geometry) {
      continue;
    }

    const transform = parse3mfTransform(attrs.match(/\btransform="([^"]+)"/)?.[1]);
    combined = mergeGeometry(combined, applyTransform(geometry, transform));
  }

  return combined.triangleCount > 0
    ? combined
    : [...geometries.values()].reduce(mergeGeometry, createEmptyGeometry());
}

function parse3mfMesh(objectXml: string): GeometryStats {
  const verticesSection = objectXml.match(/<vertices>([\s\S]*?)<\/vertices>/)?.[1] ?? "";
  const trianglesSection = objectXml.match(/<triangles>([\s\S]*?)<\/triangles>/)?.[1] ?? "";
  const vertexMatches = [...verticesSection.matchAll(/<vertex\b([^>]*)\/>/g)];
  const triangleMatches = [...trianglesSection.matchAll(/<triangle\b([^>]*)\/>/g)];
  const vertices = vertexMatches.map((match) => parse3mfVertex(match[1]));
  const min = makeInfinityVector(1);
  const max = makeInfinityVector(-1);
  let volumeMm3 = 0;

  for (const vertex of vertices) {
    includeVertex(vertex, min, max);
  }

  for (const triangle of triangleMatches) {
    const aIndex = Number(triangle[1].match(/\bv1="([^"]+)"/)?.[1]);
    const bIndex = Number(triangle[1].match(/\bv2="([^"]+)"/)?.[1]);
    const cIndex = Number(triangle[1].match(/\bv3="([^"]+)"/)?.[1]);
    const a = vertices[aIndex];
    const b = vertices[bIndex];
    const c = vertices[cIndex];

    if (!a || !b || !c) {
      continue;
    }

    volumeMm3 += signedTetrahedronVolume(a, b, c);
  }

  return {
    min,
    max,
    triangleCount: triangleMatches.length,
    volumeMm3: Math.abs(volumeMm3),
  };
}

function parse3mfVertex(attributes: string): Vector3 {
  return {
    x: Number(attributes.match(/\bx="([^"]+)"/)?.[1] ?? 0),
    y: Number(attributes.match(/\by="([^"]+)"/)?.[1] ?? 0),
    z: Number(attributes.match(/\bz="([^"]+)"/)?.[1] ?? 0),
  };
}

function parse3mfTransform(value?: string) {
  if (!value) {
    return null;
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((entry) => Number.isFinite(entry));

  return parts.length === 12 ? parts : null;
}

function applyTransform(
  geometry: GeometryStats,
  transform: number[] | null,
): GeometryStats {
  if (!transform) {
    return geometry;
  }

  const corners = getBoundingBoxCorners(geometry.min, geometry.max).map((corner) =>
    transformVertex(corner, transform),
  );
  const min = makeInfinityVector(1);
  const max = makeInfinityVector(-1);

  for (const corner of corners) {
    includeVertex(corner, min, max);
  }

  return {
    min,
    max,
    triangleCount: geometry.triangleCount,
    volumeMm3: Math.abs(determinant3x3(transform)) * geometry.volumeMm3,
  };
}

function transformVertex(vertex: Vector3, transform: number[]) {
  return {
    x:
      transform[0] * vertex.x +
      transform[3] * vertex.y +
      transform[6] * vertex.z +
      transform[9],
    y:
      transform[1] * vertex.x +
      transform[4] * vertex.y +
      transform[7] * vertex.z +
      transform[10],
    z:
      transform[2] * vertex.x +
      transform[5] * vertex.y +
      transform[8] * vertex.z +
      transform[11],
  };
}

function determinant3x3(matrix: number[]) {
  return (
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[3] * (matrix[1] * matrix[8] - matrix[2] * matrix[7]) +
    matrix[6] * (matrix[1] * matrix[5] - matrix[2] * matrix[4])
  );
}

function getBoundingBoxCorners(min: Vector3, max: Vector3) {
  return [
    { x: min.x, y: min.y, z: min.z },
    { x: min.x, y: min.y, z: max.z },
    { x: min.x, y: max.y, z: min.z },
    { x: min.x, y: max.y, z: max.z },
    { x: max.x, y: min.y, z: min.z },
    { x: max.x, y: min.y, z: max.z },
    { x: max.x, y: max.y, z: min.z },
    { x: max.x, y: max.y, z: max.z },
  ];
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

function createEmptyGeometry(): GeometryStats {
  return {
    min: makeInfinityVector(1),
    max: makeInfinityVector(-1),
    triangleCount: 0,
    volumeMm3: 0,
  };
}

function mergeGeometry(left: GeometryStats, right: GeometryStats): GeometryStats {
  if (left.triangleCount === 0) {
    return right;
  }

  if (right.triangleCount === 0) {
    return left;
  }

  return {
    min: {
      x: Math.min(left.min.x, right.min.x),
      y: Math.min(left.min.y, right.min.y),
      z: Math.min(left.min.z, right.min.z),
    },
    max: {
      x: Math.max(left.max.x, right.max.x),
      y: Math.max(left.max.y, right.max.y),
      z: Math.max(left.max.z, right.max.z),
    },
    triangleCount: left.triangleCount + right.triangleCount,
    volumeMm3: left.volumeMm3 + right.volumeMm3,
  };
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
