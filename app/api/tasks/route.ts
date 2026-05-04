import { NextResponse } from "next/server";
import { enqueueSliceJob } from "@/lib/queue";
import { parseDurationInput } from "@/lib/pricing";
import { createTask, reportSliceJobFailed } from "@/lib/store";
import { createTaskSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = createTaskSchema.parse(await request.json());

    if (payload.mode === "manual") {
      const durationMinutes = parseDurationInput(payload.durationInput);

      if (!durationMinutes) {
        return NextResponse.json(
          { error: "Duration must be valid minutes or HH:MM." },
          { status: 400 },
        );
      }

      const result = createTask({
        mode: "manual",
        nameOrLink: payload.nameOrLink,
        filamentId: payload.filamentId,
        quantity: payload.quantity,
        weightGrams: payload.weightGrams,
        durationMinutes,
        note: payload.note,
      });

      return NextResponse.json({ task: result.task });
    }

    const result = createTask({
      mode: "upload",
      nameOrLink: payload.nameOrLink,
      filamentId: payload.filamentId,
      quantity: payload.quantity,
      sourceArtifactId: payload.sourceArtifactId,
      note: payload.note,
    });

    if (result.queuePayload) {
      try {
        await enqueueSliceJob(result.queuePayload);
      } catch (error) {
        if (result.queuePayload.sliceJobId) {
          reportSliceJobFailed(
            result.queuePayload.sliceJobId,
            "Slicer queue is unavailable. Manual review required.",
          );
        }

        throw error;
      }
    }

    return NextResponse.json({ task: result.task });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create task.",
      },
      { status: 400 },
    );
  }
}
