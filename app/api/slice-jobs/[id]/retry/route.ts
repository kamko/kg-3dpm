import { NextResponse } from "next/server";
import { enqueueSliceJob } from "@/lib/queue";
import { reportSliceJobFailed, retrySliceJob } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const sliceJobId = Number(id);

    if (!Number.isInteger(sliceJobId) || sliceJobId <= 0) {
      return NextResponse.json({ error: "Invalid slice job id." }, { status: 400 });
    }

    const result = retrySliceJob(sliceJobId);

    try {
      await enqueueSliceJob(result.queuePayload);
    } catch (error) {
      reportSliceJobFailed(
        sliceJobId,
        "Slicer queue is unavailable. Manual review required.",
      );
      throw error;
    }

    return NextResponse.json({ task: result.task });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to retry slice job.",
      },
      { status: 400 },
    );
  }
}
