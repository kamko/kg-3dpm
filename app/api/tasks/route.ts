import { NextResponse } from "next/server";
import { enqueueSliceJob } from "@/lib/queue";
import { createTask, reportSliceJobFailed } from "@/lib/store";
import { createTaskSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = createTaskSchema.parse(await request.json());

      const result = createTask({
        mode: "upload",
        name: payload.name,
        sourceUrl: payload.sourceUrl,
        filamentId: payload.filamentId,
        quantity: payload.quantity,
        sourceArtifactIds: payload.sourceArtifactIds,
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
