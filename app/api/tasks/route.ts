import { NextResponse } from "next/server";
import { parseDurationInput } from "@/lib/pricing";
import { createTask } from "@/lib/store";
import { createTaskSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = createTaskSchema.parse(await request.json());
    const durationMinutes = parseDurationInput(payload.durationInput);

    if (!durationMinutes) {
      return NextResponse.json(
        { error: "Duration must be valid minutes or HH:MM." },
        { status: 400 },
      );
    }

    const task = createTask({
      nameOrLink: payload.nameOrLink,
      filamentId: payload.filamentId,
      quantity: payload.quantity,
      weightGrams: payload.weightGrams,
      durationMinutes,
      note: payload.note,
    });

    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create task.",
      },
      { status: 400 },
    );
  }
}
