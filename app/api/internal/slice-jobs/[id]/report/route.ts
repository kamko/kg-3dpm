import { NextResponse } from "next/server";
import { getSliceWorkerSecret } from "@/lib/env";
import {
  reportSliceJobFailed,
  reportSliceJobRunning,
  reportSliceJobSucceeded,
} from "@/lib/store";
import { sliceReportSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  return request.headers.get("x-slice-worker-secret") === getSliceWorkerSecret();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = sliceReportSchema.parse(await request.json());
    const { id } = await context.params;
    const sliceJobId = Number(id);

    if (!Number.isInteger(sliceJobId) || sliceJobId <= 0) {
      return NextResponse.json({ error: "Invalid slice job id." }, { status: 400 });
    }

    if (payload.status === "running") {
      const sliceJob = reportSliceJobRunning(sliceJobId);
      return NextResponse.json({ sliceJob });
    }

    if (payload.status === "failed") {
      const task = reportSliceJobFailed(sliceJobId, payload.error);
      return NextResponse.json({ task });
    }

    const task = reportSliceJobSucceeded({
      id: sliceJobId,
      weightGrams: payload.weightGrams,
      durationMinutes: payload.durationMinutes,
      artifacts: payload.artifacts,
      logExcerpt: payload.logExcerpt,
    });

    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to process slice report.",
      },
      { status: 400 },
    );
  }
}
