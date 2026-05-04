import { NextResponse } from "next/server";
import { updateFilament } from "@/lib/store";
import { updateFilamentSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const payload = updateFilamentSchema.parse(await request.json());
    const { id } = await context.params;
    const filamentId = Number(id);

    if (!Number.isInteger(filamentId) || filamentId <= 0) {
      return NextResponse.json({ error: "Invalid filament id." }, { status: 400 });
    }

    const filament = updateFilament(filamentId, payload);
    return NextResponse.json({ filament });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update filament.",
      },
      { status: 400 },
    );
  }
}
