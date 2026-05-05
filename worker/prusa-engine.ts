import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getSliceJobTimeoutMs } from "@/lib/env";
import {
  buildAsciiStl,
  extractBambu3mfProjectInfo,
  extractBambu3mfSliceMetadata,
  extractTrianglesFrom3mfBuffer,
  isBambuProject3mfBuffer,
} from "@/lib/model-geometry";
import {
  getPrusaConfigPath,
  parsePrusaGcodeMetadata,
} from "@/lib/prusa";

const execFileAsync = promisify(execFile);

export type SliceEngineResult = {
  weightGrams: number;
  durationMinutes: number;
  generatedFiles: Array<{
    path: string;
    fileName: string;
    contentType: string;
  }>;
  logText: string;
};

export interface SlicerEngine {
  slice(input: {
    sourceFiles: Array<{
      path: string;
      originalName: string;
    }>;
    presetKey: string;
    workDir: string;
  }): Promise<SliceEngineResult>;
}

export class PrusaSlicerEngine implements SlicerEngine {
  async slice(input: {
    sourceFiles: Array<{
      path: string;
      originalName: string;
    }>;
    presetKey: string;
    workDir: string;
  }) {
    if (input.sourceFiles.length === 0) {
      throw new Error("No source files were provided to the slicer.");
    }

    const outputPath = path.join(input.workDir, "result.gcode");
    const primarySource = input.sourceFiles[0];
    const fileExtension = path.extname(primarySource.originalName).toLowerCase();
    const binary = process.env.PRUSA_SLICER_BIN ?? "prusa-slicer";
    let stdout = "";
    let stderr = "";

    if (fileExtension === ".3mf") {
      if (input.sourceFiles.length > 1) {
        throw new Error("3MF files must be sliced one at a time.");
      }

      const sourceBuffer = await fs.readFile(primarySource.path);
      const arrayBuffer = sourceBuffer.buffer.slice(
        sourceBuffer.byteOffset,
        sourceBuffer.byteOffset + sourceBuffer.byteLength,
      ) as ArrayBuffer;
      const projectInfo = await extractBambu3mfProjectInfo(arrayBuffer);

      if (projectInfo && projectInfo.plateCount > 1) {
        const plateSummary = projectInfo.plateNames.join(", ");
        throw new Error(
          `This 3MF contains multiple plates (${plateSummary}). Export one plate or upload separate STL files instead.`,
        );
      }

      const embeddedMetadata = await extractBambu3mfSliceMetadata(arrayBuffer);

      if (embeddedMetadata) {
        return {
          weightGrams: embeddedMetadata.weightGrams,
          durationMinutes: embeddedMetadata.durationMinutes,
          generatedFiles: [],
          logText: "Using embedded 3MF slice metadata from the uploaded project.",
        } satisfies SliceEngineResult;
      }

      const shouldUseStlFallback = await isBambuProject3mfBuffer(arrayBuffer);

      try {
        if (shouldUseStlFallback) {
          throw new Error(
            "Bambu project 3MF does not include embedded slice values, converting to STL for fallback slicing.",
          );
        }

        const result = await execFileAsync(
          binary,
          [
            "--load",
            getPrusaConfigPath(input.presetKey),
            "--export-gcode",
            "--output",
            outputPath,
            primarySource.path,
          ],
          {
            timeout: getSliceJobTimeoutMs(),
            cwd: input.workDir,
            maxBuffer: 10 * 1024 * 1024,
          },
        );
        stdout = result.stdout;
        stderr = result.stderr;
        const metadata = parsePrusaGcodeMetadata(await fs.readFile(outputPath, "utf8"));
        ensureValidSliceMetrics(metadata);
      } catch (error) {
        const fallbackPath = await convert3mfToStl(primarySource.path, input.workDir);
        const result = await execFileAsync(
          binary,
          [
            "--load",
            getPrusaConfigPath(input.presetKey),
            "--export-gcode",
            "--output",
            outputPath,
            fallbackPath,
          ],
          {
            timeout: getSliceJobTimeoutMs(),
            cwd: input.workDir,
            maxBuffer: 10 * 1024 * 1024,
          },
        );
        stdout = [
          error instanceof Error ? error.message : "Direct 3MF load failed.",
          "Falling back to flattened STL conversion.",
          result.stdout,
        ]
          .filter(Boolean)
          .join("\n");
        stderr = result.stderr;
      }
    } else {
      const result = await execFileAsync(
        binary,
        [
          "--load",
          getPrusaConfigPath(input.presetKey),
          "--export-gcode",
          "--output",
          outputPath,
          ...input.sourceFiles.map((sourceFile) => sourceFile.path),
        ],
        {
          timeout: getSliceJobTimeoutMs(),
          cwd: input.workDir,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      stdout = result.stdout;
      stderr = result.stderr;
    }

    const gcode = await fs.readFile(outputPath, "utf8");
    const metadata = parsePrusaGcodeMetadata(gcode);
    ensureValidSliceMetrics(metadata);
    const logText = [stdout, stderr].filter(Boolean).join("\n").trim();

    return {
      weightGrams: metadata.weightGrams,
      durationMinutes: metadata.durationMinutes,
      generatedFiles: [
        {
          path: outputPath,
          fileName: `${path.basename(primarySource.originalName, fileExtension)}.gcode`,
          contentType: "text/plain",
        },
      ],
      logText,
    } satisfies SliceEngineResult;
  }
}

async function convert3mfToStl(sourcePath: string, workDir: string) {
  const buffer = await fs.readFile(sourcePath);
  const triangles = await extractTrianglesFrom3mfBuffer(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer,
  );
  const fallbackPath = path.join(workDir, "flattened-from-3mf.stl");
  await fs.writeFile(
    fallbackPath,
    buildAsciiStl(triangles, path.basename(sourcePath, ".3mf")),
    "utf8",
  );
  return fallbackPath;
}

function ensureValidSliceMetrics(metadata: {
  weightGrams: number;
  durationMinutes: number;
}) {
  if (!Number.isFinite(metadata.weightGrams) || metadata.weightGrams <= 0) {
    throw new Error("Slicer result did not include a valid filament usage value.");
  }

  if (!Number.isFinite(metadata.durationMinutes) || metadata.durationMinutes <= 0) {
    throw new Error("Slicer result did not include a valid print time value.");
  }
}
