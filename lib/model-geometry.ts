import JSZip from "jszip";

export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type Triangle = {
  a: Vector3;
  b: Vector3;
  c: Vector3;
};

type Matrix3x4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type MeshObject = {
  kind: "mesh";
  triangles: Triangle[];
};

type ComponentRef = {
  objectId: string;
  transform: Matrix3x4;
};

type ComponentObject = {
  kind: "components";
  components: ComponentRef[];
};

type ObjectDefinition = MeshObject | ComponentObject;

const identityMatrix: Matrix3x4 = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

const unitScaleMap: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

export async function extractTrianglesFrom3mfBuffer(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const modelEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /(^|\/).+\.model$/i.test(entry.name),
  );

  if (modelEntries.length === 0) {
    throw new Error("The 3MF file did not contain a core .model payload.");
  }

  const triangles: Triangle[] = [];

  for (const entry of modelEntries) {
    const xml = await entry.async("string");
    triangles.push(...parse3mfModelTriangles(xml));
  }

  if (triangles.length === 0) {
    throw new Error("The 3MF file did not contain any supported mesh geometry.");
  }

  return triangles;
}

export function buildAsciiStl(triangles: Triangle[], solidName = "model") {
  const lines = [`solid ${solidName}`];

  for (const triangle of triangles) {
    const normal = computeNormal(triangle);
    lines.push(
      `facet normal ${normal.x} ${normal.y} ${normal.z}`,
      "outer loop",
      `vertex ${triangle.a.x} ${triangle.a.y} ${triangle.a.z}`,
      `vertex ${triangle.b.x} ${triangle.b.y} ${triangle.b.z}`,
      `vertex ${triangle.c.x} ${triangle.c.y} ${triangle.c.z}`,
      "endloop",
      "endfacet",
    );
  }

  lines.push(`endsolid ${solidName}`);
  return lines.join("\n");
}

function parse3mfModelTriangles(xml: string) {
  const unit = xml.match(/<model\b[^>]*\bunit="([^"]+)"/i)?.[1]?.toLowerCase();
  const scale = unit ? (unitScaleMap[unit] ?? 1) : 1;
  const objectMatches = [...xml.matchAll(/<object\b[\s\S]*?<\/object>/g)];
  const objectMap = new Map<string, ObjectDefinition>();

  for (const objectMatch of objectMatches) {
    const objectXml = objectMatch[0];
    const idMatch = objectXml.match(/\bid="([^"]+)"/);

    if (!idMatch) {
      continue;
    }

    const meshTriangles = parse3mfMeshTriangles(objectXml, scale);
    if (meshTriangles.length > 0) {
      objectMap.set(idMatch[1], {
        kind: "mesh",
        triangles: meshTriangles,
      });
      continue;
    }

    const components = parse3mfComponents(objectXml);
    if (components.length > 0) {
      objectMap.set(idMatch[1], {
        kind: "components",
        components,
      });
    }
  }

  const buildItems = [...xml.matchAll(/<item\b([^>]*)\/>/g)];
  const triangles: Triangle[] = [];
  const activeIds = new Set<string>();

  if (buildItems.length > 0) {
    for (const buildItem of buildItems) {
      const attrs = buildItem[1];
      const objectId = attrs.match(/\bobjectid="([^"]+)"/)?.[1];
      if (!objectId) {
        continue;
      }

      triangles.push(
        ...resolveObjectTriangles(
          objectId,
          objectMap,
          parse3mfTransform(attrs.match(/\btransform="([^"]+)"/)?.[1]),
          activeIds,
        ),
      );
    }
  } else {
    for (const objectId of objectMap.keys()) {
      triangles.push(
        ...resolveObjectTriangles(objectId, objectMap, identityMatrix, activeIds),
      );
    }
  }

  return triangles;
}

function parse3mfMeshTriangles(objectXml: string, scale: number) {
  const verticesSection =
    objectXml.match(/<vertices>([\s\S]*?)<\/vertices>/)?.[1] ?? "";
  const trianglesSection =
    objectXml.match(/<triangles>([\s\S]*?)<\/triangles>/)?.[1] ?? "";
  const vertexMatches = [...verticesSection.matchAll(/<vertex\b([^>]*)\/>/g)];
  const triangleMatches = [...trianglesSection.matchAll(/<triangle\b([^>]*)\/>/g)];
  const vertices = vertexMatches.map((match) => parse3mfVertex(match[1], scale));

  return triangleMatches.flatMap((triangleMatch) => {
    const aIndex = Number(triangleMatch[1].match(/\bv1="([^"]+)"/)?.[1]);
    const bIndex = Number(triangleMatch[1].match(/\bv2="([^"]+)"/)?.[1]);
    const cIndex = Number(triangleMatch[1].match(/\bv3="([^"]+)"/)?.[1]);
    const a = vertices[aIndex];
    const b = vertices[bIndex];
    const c = vertices[cIndex];

    if (!a || !b || !c) {
      return [];
    }

    return [{ a, b, c }];
  });
}

function parse3mfComponents(objectXml: string) {
  const componentsSection =
    objectXml.match(/<components>([\s\S]*?)<\/components>/)?.[1] ?? "";

  return [...componentsSection.matchAll(/<component\b([^>]*)\/>/g)].flatMap(
    (componentMatch) => {
      const objectId = componentMatch[1].match(/\bobjectid="([^"]+)"/)?.[1];
      if (!objectId) {
        return [];
      }

      return [
        {
          objectId,
          transform: parse3mfTransform(
            componentMatch[1].match(/\btransform="([^"]+)"/)?.[1],
          ),
        },
      ];
    },
  );
}

function resolveObjectTriangles(
  objectId: string,
  objectMap: Map<string, ObjectDefinition>,
  transform: Matrix3x4,
  activeIds: Set<string>,
): Triangle[] {
  if (activeIds.has(objectId)) {
    return [];
  }

  const definition = objectMap.get(objectId);
  if (!definition) {
    return [];
  }

  activeIds.add(objectId);

  try {
    if (definition.kind === "mesh") {
      return definition.triangles.map((triangle) =>
        applyTransformToTriangle(triangle, transform),
      );
    }

    return definition.components.flatMap((component) =>
      resolveObjectTriangles(
        component.objectId,
        objectMap,
        multiplyTransforms(transform, component.transform),
        activeIds,
      ),
    );
  } finally {
    activeIds.delete(objectId);
  }
}

function parse3mfVertex(attributes: string, scale: number): Vector3 {
  return {
    x: Number(attributes.match(/\bx="([^"]+)"/)?.[1] ?? 0) * scale,
    y: Number(attributes.match(/\by="([^"]+)"/)?.[1] ?? 0) * scale,
    z: Number(attributes.match(/\bz="([^"]+)"/)?.[1] ?? 0) * scale,
  };
}

function parse3mfTransform(value?: string): Matrix3x4 {
  if (!value) {
    return identityMatrix;
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((entry) => Number.isFinite(entry));

  if (parts.length !== 12) {
    return identityMatrix;
  }

  return parts as Matrix3x4;
}

function multiplyTransforms(left: Matrix3x4, right: Matrix3x4): Matrix3x4 {
  const a00 = left[0];
  const a01 = left[3];
  const a02 = left[6];
  const a03 = left[9];
  const a10 = left[1];
  const a11 = left[4];
  const a12 = left[7];
  const a13 = left[10];
  const a20 = left[2];
  const a21 = left[5];
  const a22 = left[8];
  const a23 = left[11];

  const b00 = right[0];
  const b01 = right[3];
  const b02 = right[6];
  const b03 = right[9];
  const b10 = right[1];
  const b11 = right[4];
  const b12 = right[7];
  const b13 = right[10];
  const b20 = right[2];
  const b21 = right[5];
  const b22 = right[8];
  const b23 = right[11];

  return [
    a00 * b00 + a01 * b10 + a02 * b20,
    a10 * b00 + a11 * b10 + a12 * b20,
    a20 * b00 + a21 * b10 + a22 * b20,
    a00 * b01 + a01 * b11 + a02 * b21,
    a10 * b01 + a11 * b11 + a12 * b21,
    a20 * b01 + a21 * b11 + a22 * b21,
    a00 * b02 + a01 * b12 + a02 * b22,
    a10 * b02 + a11 * b12 + a12 * b22,
    a20 * b02 + a21 * b12 + a22 * b22,
    a00 * b03 + a01 * b13 + a02 * b23 + a03,
    a10 * b03 + a11 * b13 + a12 * b23 + a13,
    a20 * b03 + a21 * b13 + a22 * b23 + a23,
  ];
}

function applyTransformToTriangle(
  triangle: Triangle,
  transform: Matrix3x4,
): Triangle {
  return {
    a: transformVertex(triangle.a, transform),
    b: transformVertex(triangle.b, transform),
    c: transformVertex(triangle.c, transform),
  };
}

function transformVertex(vertex: Vector3, transform: Matrix3x4): Vector3 {
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

function computeNormal(triangle: Triangle): Vector3 {
  const ux = triangle.b.x - triangle.a.x;
  const uy = triangle.b.y - triangle.a.y;
  const uz = triangle.b.z - triangle.a.z;
  const vx = triangle.c.x - triangle.a.x;
  const vy = triangle.c.y - triangle.a.y;
  const vz = triangle.c.z - triangle.a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

  return {
    x: round6(nx / length),
    y: round6(ny / length),
    z: round6(nz / length),
  };
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
