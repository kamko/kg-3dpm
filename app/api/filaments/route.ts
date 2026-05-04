import { NextResponse } from "next/server";
import { createFilament } from "@/lib/store";
import { createFilamentSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = createFilamentSchema.parse(await request.json());
    const filament = createFilament(payload);
    return NextResponse.json({ filament });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create filament.",
      },
      { status: 400 },
    );
  }
}
