import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getInternalAppBaseUrl, getSliceWorkerSecret } from "@/lib/env";
import { downloadObjectToFile, putFileObject } from "@/lib/object-storage";
import { dequeueSliceJob } from "@/lib/queue";
import { buildLogStorageKey, buildSliceStorageKey } from "@/lib/storage-keys";
import type { SliceQueuePayload, SliceReportArtifact } from "@/lib/types";
import { PrusaSlicerEngine } from "@/worker/prusa-engine";

const engine = new PrusaSlicerEngine();

async function report(
  sliceJobId: number,
  body:
    | { status: "running" }
    | { status: "failed"; error: string }
    | {
        status: "succeeded";
        weightGrams: number;
        durationMinutes: number;
        artifacts: SliceReportArtifact[];
        logExcerpt?: string;
      },
) {
  const response = await fetch(
    `${getInternalAppBaseUrl()}/api/internal/slice-jobs/${sliceJobId}/report`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-slice-worker-secret": getSliceWorkerSecret(),
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to report slice job state: ${text}`);
  }
}

async function processJob(job: SliceQueuePayload) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "kg-3dpm-slice-"));
  const sourcePath = path.join(workDir, job.sourceArtifact.originalName);

  try {
    await report(job.sliceJobId, { status: "running" });
    await downloadObjectToFile({
      key: job.sourceArtifact.storageKey,
      targetPath: sourcePath,
    });

    const result = await engine.slice({
      sourcePath,
      originalName: job.sourceArtifact.originalName,
      presetKey: job.presetKey,
      workDir,
    });

    const uploadedArtifacts: SliceReportArtifact[] = [];

    for (const file of result.generatedFiles) {
      const storageKey = buildSliceStorageKey(file.fileName);
      await putFileObject({
        key: storageKey,
        filePath: file.path,
        contentType: file.contentType,
      });

      uploadedArtifacts.push({
        kind: "sliced-gcode",
        storageKey,
        originalName: file.fileName,
        contentType: file.contentType,
        sizeBytes: (await stat(file.path)).size,
      });
    }

    if (result.logText) {
      const logPath = path.join(workDir, "prusa.log");
      await writeFile(logPath, result.logText, "utf8");
      const logStorageKey = buildLogStorageKey(
        `${path.basename(job.sourceArtifact.originalName)}.log`,
      );
      await putFileObject({
        key: logStorageKey,
        filePath: logPath,
        contentType: "text/plain",
      });

      uploadedArtifacts.push({
        kind: "slice-log",
        storageKey: logStorageKey,
        originalName: path.basename(logPath),
        contentType: "text/plain",
        sizeBytes: (await stat(logPath)).size,
      });
    }

    await report(job.sliceJobId, {
      status: "succeeded",
      weightGrams: result.weightGrams,
      durationMinutes: result.durationMinutes,
      artifacts: uploadedArtifacts,
      logExcerpt: result.logText ? result.logText.slice(0, 4000) : undefined,
    });
  } catch (error) {
    console.error(`Slice job ${job.sliceJobId} failed`, error);
    try {
      await report(job.sliceJobId, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Slicer worker failed unexpectedly.",
      });
    } catch (reportError) {
      console.error(`Unable to report failure for slice job ${job.sliceJobId}`, reportError);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log("kg-3dpm slicer worker started");

  while (true) {
    const job = await dequeueSliceJob();
    if (!job) {
      continue;
    }

    await processJob(job);
  }
}

void main().catch((error) => {
  console.error("Slicer worker crashed", error);
  process.exit(1);
});
