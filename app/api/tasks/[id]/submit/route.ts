import { NextResponse } from "next/server";
import { submitTask } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const taskId = Number(id);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
    }

    const task = submitTask(taskId);
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to send request.",
      },
      { status: 400 },
    );
  }
}
