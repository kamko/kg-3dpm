import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/store";
import { updateSettingsSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const payload = updateSettingsSchema.parse(await request.json());
    const settings = updateSettings(payload.machineHourPrice);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update settings.",
      },
      { status: 400 },
    );
  }
}
