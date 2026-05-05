import { NextResponse } from "next/server";
import { ZodError } from "zod";
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
    const message =
      error instanceof ZodError
        ? formatSliceReportValidationError(error)
        : error instanceof Error
          ? error.message
          : "Unable to process slice report.";

    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}

function formatSliceReportValidationError(error: ZodError) {
  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return "Invalid slice result from worker.";
  }

  if (firstIssue.path.includes("weightGrams")) {
    return "Slicer result did not include a valid filament usage value.";
  }

  if (firstIssue.path.includes("durationMinutes")) {
    return "Slicer result did not include a valid print time value.";
  }

  return "Invalid slice result from worker.";
}
