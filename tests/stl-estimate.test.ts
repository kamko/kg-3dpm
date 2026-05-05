import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildAsciiStl,
  extractBambu3mfSliceMetadata,
  extractTrianglesFrom3mfBuffer,
  isBambuProject3mfBuffer,
} from "../lib/model-geometry";
import { analyze3mfBuffer, analyzeStlBuffer } from "../lib/stl-estimate";

const asciiCube = `solid cube
facet normal 0 0 1
outer loop
vertex 0 0 10
vertex 10 0 10
vertex 10 10 10
endloop
endfacet
facet normal 0 0 1
outer loop
vertex 0 0 10
vertex 10 10 10
vertex 0 10 10
endloop
endfacet
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 10 10 0
vertex 10 0 0
endloop
endfacet
facet normal 0 0 -1
outer loop
vertex 0 0 0
vertex 0 10 0
vertex 10 10 0
endloop
endfacet
facet normal 0 1 0
outer loop
vertex 0 10 0
vertex 0 10 10
vertex 10 10 10
endloop
endfacet
facet normal 0 1 0
outer loop
vertex 0 10 0
vertex 10 10 10
vertex 10 10 0
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex 10 0 10
vertex 0 0 10
endloop
endfacet
facet normal 0 -1 0
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 10 0 10
endloop
endfacet
facet normal 1 0 0
outer loop
vertex 10 0 0
vertex 10 10 10
vertex 10 0 10
endloop
endfacet
facet normal 1 0 0
outer loop
vertex 10 0 0
vertex 10 10 0
vertex 10 10 10
endloop
endfacet
facet normal -1 0 0
outer loop
vertex 0 0 0
vertex 0 0 10
vertex 0 10 10
endloop
endfacet
facet normal -1 0 0
outer loop
vertex 0 0 0
vertex 0 10 10
vertex 0 10 0
endloop
endfacet
endsolid cube`;

describe("analyzeStlBuffer", () => {
  it("extracts dimensions and volume from an ASCII STL", () => {
    const analysis = analyzeStlBuffer(
      new TextEncoder().encode(asciiCube).buffer,
      "PLA",
    );

    expect(analysis.dimensionsMm).toEqual({
      x: 10,
      y: 10,
      z: 10,
      max: 10,
    });
    expect(analysis.triangleCount).toBe(12);
    expect(analysis.volumeCm3).toBe(1);
    expect(analysis.inferredSize).toBe("tiny");
    expect(analysis.inferredComplexity).toBe("simple");
    expect(analysis.estimatedWeightGrams).toBeGreaterThanOrEqual(3);
    expect(analysis.estimatedDurationMinutes).toBeGreaterThanOrEqual(15);
  });
});

describe("analyze3mfBuffer", () => {
  it("extracts geometry from a simple 3MF package", async () => {
    const zip = new JSZip();
    zip.file(
      "3D/3dmodel.model",
      `<?xml version="1.0" encoding="UTF-8"?>
      <model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
        <resources>
          <object id="1" type="model">
            <mesh>
              <vertices>
                <vertex x="0" y="0" z="0"/>
                <vertex x="10" y="0" z="0"/>
                <vertex x="10" y="10" z="0"/>
                <vertex x="0" y="10" z="0"/>
                <vertex x="0" y="0" z="10"/>
                <vertex x="10" y="0" z="10"/>
                <vertex x="10" y="10" z="10"/>
                <vertex x="0" y="10" z="10"/>
              </vertices>
              <triangles>
                <triangle v1="0" v2="2" v3="1"/>
                <triangle v1="0" v2="3" v3="2"/>
                <triangle v1="4" v2="5" v3="6"/>
                <triangle v1="4" v2="6" v3="7"/>
                <triangle v1="0" v2="1" v3="5"/>
                <triangle v1="0" v2="5" v3="4"/>
                <triangle v1="1" v2="2" v3="6"/>
                <triangle v1="1" v2="6" v3="5"/>
                <triangle v1="2" v2="3" v3="7"/>
                <triangle v1="2" v2="7" v3="6"/>
                <triangle v1="3" v2="0" v3="4"/>
                <triangle v1="3" v2="4" v3="7"/>
              </triangles>
            </mesh>
          </object>
        </resources>
        <build>
          <item objectid="1"/>
        </build>
      </model>`,
    );

    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const analysis = await analyze3mfBuffer(buffer, "PETG");

    expect(analysis.dimensionsMm).toEqual({
      x: 10,
      y: 10,
      z: 10,
      max: 10,
    });
    expect(analysis.triangleCount).toBe(12);
    expect(analysis.volumeCm3).toBe(1);
    expect(analysis.inferredSize).toBe("tiny");
    expect(analysis.estimatedWeightGrams).toBeGreaterThanOrEqual(3);
    expect(analysis.estimatedDurationMinutes).toBeGreaterThanOrEqual(15);
  });

  it("flattens component-based 3MF geometry for cross-slicer compatibility", async () => {
    const zip = new JSZip();
    zip.file(
      "3D/3dmodel.model",
      `<?xml version="1.0" encoding="UTF-8"?>
      <model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
        <resources>
          <object id="1" type="model">
            <mesh>
              <vertices>
                <vertex x="0" y="0" z="0"/>
                <vertex x="10" y="0" z="0"/>
                <vertex x="0" y="10" z="0"/>
              </vertices>
              <triangles>
                <triangle v1="0" v2="1" v3="2"/>
              </triangles>
            </mesh>
          </object>
          <object id="2" type="model">
            <components>
              <component objectid="1" transform="1 0 0 0 1 0 0 0 1 20 0 0"/>
              <component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 20 0"/>
            </components>
          </object>
        </resources>
        <build>
          <item objectid="2"/>
        </build>
      </model>`,
    );

    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const triangles = await extractTrianglesFrom3mfBuffer(buffer);
    const stl = buildAsciiStl(triangles, "components");
    const analysis = analyzeStlBuffer(new TextEncoder().encode(stl).buffer, "PLA");

    expect(triangles).toHaveLength(2);
    expect(analysis.triangleCount).toBe(2);
    expect(analysis.dimensionsMm).toEqual({
      x: 30,
      y: 30,
      z: 0,
      max: 30,
    });
  });

  it("reads embedded Bambu slice metadata when present", async () => {
    const zip = new JSZip();
    zip.file(
      "Metadata/slice_info.config",
      `<?xml version="1.0" encoding="UTF-8"?>
      <config>
        <plate>
          <metadata key="prediction" value="8282"/>
          <metadata key="weight" value="109.45"/>
        </plate>
      </config>`,
    );

    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    await expect(extractBambu3mfSliceMetadata(buffer)).resolves.toEqual({
      durationMinutes: 138,
      weightGrams: 109.45,
    });
  });

  it("detects unsliced Bambu project 3MF files", async () => {
    const zip = new JSZip();
    zip.file(
      "Metadata/slice_info.config",
      `<?xml version="1.0" encoding="UTF-8"?>
      <config>
        <header>
          <header_item key="X-BBL-Client-Type" value="slicer"/>
        </header>
      </config>`,
    );
    zip.file("Metadata/project_settings.config", "<config />");

    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    await expect(extractBambu3mfSliceMetadata(buffer)).resolves.toBeNull();
    await expect(isBambuProject3mfBuffer(buffer)).resolves.toBe(true);
  });
});
