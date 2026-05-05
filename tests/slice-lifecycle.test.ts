import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "../lib/db";
import { seedDatabase } from "../lib/seed-data";
import {
  acceptTask,
  createTask,
  createUploadedArtifact,
  getTaskById,
  updateSettings,
  reportSliceJobFailed,
  reportSliceJobSucceeded,
  retrySliceJob,
  submitTask,
  getAllTasks,
} from "../lib/store";

let tempRoot: string;

describe("slice-backed task lifecycle", () => {
  beforeAll(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kg-3dpm-test-"));
    process.env.DATABASE_DIR = tempRoot;
    resetDbForTests();
    seedDatabase(getDb(), { reset: true });
  });

  afterAll(() => {
    resetDbForTests();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("creates a pending upload task and marks it ready after worker results", () => {
    const artifact = createUploadedArtifact({
      storageKey: "uploads/test-part.stl",
      originalName: "test-part.stl",
      contentType: "model/stl",
      sizeBytes: 2048,
    });

    const created = createTask({
      mode: "upload",
      nameOrLink: "Test part",
      filamentId: 1,
      quantity: 2,
      sourceArtifactIds: [artifact.id],
      note: "Queued through worker",
    });

    expect(created.task?.estimateState).toBe("pending");
    expect(created.queuePayload?.sliceJobId).toBeTypeOf("number");
    expect(created.queuePayload?.presetKey).toBe("pla-matte-default");

    const readyTask = reportSliceJobSucceeded({
      id: created.queuePayload!.sliceJobId,
      weightGrams: 42.5,
      durationMinutes: 120,
      artifacts: [
        {
          kind: "sliced-gcode",
          storageKey: "slices/test-part.gcode",
          originalName: "test-part.gcode",
          contentType: "text/plain",
          sizeBytes: 4096,
        },
      ],
    });

    expect(readyTask?.estimateState).toBe("ready");
    expect(readyTask?.estimateSource).toBe("prusa");
    expect(readyTask?.submissionState).toBe("draft");
    expect(readyTask?.weightGrams).toBe(42.5);
    expect(readyTask?.durationMinutes).toBe(120);
    expect(readyTask?.estimatedPrice).toBeGreaterThan(0);
  });

  it("shows draft estimates in the admin task list and keeps them after submit", () => {
    const artifact = createUploadedArtifact({
      storageKey: "uploads/review-part.stl",
      originalName: "review-part.stl",
      contentType: "model/stl",
      sizeBytes: 2048,
    });

    const created = createTask({
      mode: "upload",
      nameOrLink: "Review part",
      filamentId: 1,
      quantity: 1,
      sourceArtifactIds: [artifact.id],
      note: "Send after estimate",
    });

    expect(getAllTasks().some((task) => task.id === created.task!.id)).toBe(true);

    reportSliceJobSucceeded({
      id: created.queuePayload!.sliceJobId,
      weightGrams: 55,
      durationMinutes: 95,
      artifacts: [],
    });

    const submitted = submitTask(created.task!.id);
    expect(submitted?.submissionState).toBe("submitted");
    expect(submitted?.submittedAt).not.toBeNull();
    expect(getAllTasks().some((task) => task.id === created.task!.id)).toBe(true);
  });

  it("accepts a submitted request and freezes its quote against later price changes", () => {
    const artifact = createUploadedArtifact({
      storageKey: "uploads/locked-quote.stl",
      originalName: "locked-quote.stl",
      contentType: "model/stl",
      sizeBytes: 2048,
    });

    const created = createTask({
      mode: "upload",
      nameOrLink: "Locked quote part",
      filamentId: 1,
      quantity: 1,
      sourceArtifactIds: [artifact.id],
      note: "",
    });

    reportSliceJobSucceeded({
      id: created.queuePayload!.sliceJobId,
      weightGrams: 80,
      durationMinutes: 60,
      artifacts: [],
    });

    const submitted = submitTask(created.task!.id)!;
    const beforeAccept = submitted;
    const accepted = acceptTask(beforeAccept.id);

    expect(accepted?.acceptedAt).not.toBeNull();
    expect(accepted?.finalPrice).toBe(beforeAccept.estimatedPrice);

    updateSettings(12.5);

    const afterPriceChange = getTaskById(beforeAccept.id);
    expect(afterPriceChange?.estimatedPrice).toBe(beforeAccept.estimatedPrice);
    expect(afterPriceChange?.finalPrice).toBe(beforeAccept.estimatedPrice);
  });

  it("allows retrying a failed slice job", () => {
    const artifact = createUploadedArtifact({
      storageKey: "uploads/failure.stl",
      originalName: "failure.stl",
      contentType: "model/stl",
      sizeBytes: 2048,
    });

    const created = createTask({
      mode: "upload",
      nameOrLink: "Failure part",
      filamentId: 1,
      quantity: 1,
      sourceArtifactIds: [artifact.id],
      note: "",
    });

    const failedTask = reportSliceJobFailed(
      created.queuePayload!.sliceJobId,
      "CLI timed out",
    );
    expect(failedTask?.estimateState).toBe("failed");

    const retried = retrySliceJob(created.queuePayload!.sliceJobId);
    expect(retried.task?.estimateState).toBe("pending");
    expect(retried.queuePayload.sliceJobId).toBe(created.queuePayload!.sliceJobId);
  });

  it("queues multiple STL files together as one estimate", () => {
    const artifactA = createUploadedArtifact({
      storageKey: "uploads/multi-a.stl",
      originalName: "multi-a.stl",
      contentType: "model/stl",
      sizeBytes: 1024,
    });
    const artifactB = createUploadedArtifact({
      storageKey: "uploads/multi-b.stl",
      originalName: "multi-b.stl",
      contentType: "model/stl",
      sizeBytes: 1024,
    });

    const created = createTask({
      mode: "upload",
      nameOrLink: "Multi STL part",
      filamentId: 1,
      quantity: 1,
      sourceArtifactIds: [artifactA.id, artifactB.id],
      note: "",
    });

    expect(created.queuePayload.sourceArtifacts).toHaveLength(2);
    expect(created.queuePayload.sourceArtifacts.map((artifact) => artifact.id)).toEqual([
      artifactA.id,
      artifactB.id,
    ]);
  });
});
