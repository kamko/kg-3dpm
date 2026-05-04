import { NextResponse } from "next/server";
import { parseDurationInput } from "@/lib/pricing";
import { getTaskById, updateTask } from "@/lib/store";
import { updateTaskSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const taskId = Number(id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
  }

  const task = getTaskById(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const payload = updateTaskSchema.parse(await request.json());
    const { id } = await context.params;
    const taskId = Number(id);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
    }

    const parsedDuration =
      payload.durationInput === undefined
        ? undefined
        : payload.durationInput === null
          ? null
          : parseDurationInput(payload.durationInput);

    if (payload.durationInput !== undefined && payload.durationInput !== null && !parsedDuration) {
      return NextResponse.json(
        { error: "Duration must be valid minutes or HH:MM." },
        { status: 400 },
      );
    }

    const task = updateTask(taskId, {
      nameOrLink: payload.nameOrLink,
      filamentId: payload.filamentId,
      quantity: payload.quantity,
      weightGrams: payload.weightGrams,
      durationMinutes: parsedDuration,
      finalPrice: payload.finalPrice,
      status: payload.status,
      note: payload.note,
    });

    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update task.",
      },
      { status: 400 },
    );
  }
}
