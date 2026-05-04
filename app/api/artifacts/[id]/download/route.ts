import { NextResponse } from "next/server";
import { getObjectBytes } from "@/lib/object-storage";
import { getArtifactById } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const artifactId = Number(id);

    if (!Number.isInteger(artifactId) || artifactId <= 0) {
      return NextResponse.json({ error: "Invalid artifact id." }, { status: 400 });
    }

    const artifact = getArtifactById(artifactId);
    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
    }

    const object = await getObjectBytes({ key: artifact.storageKey });

    return new NextResponse(Buffer.from(object.body), {
      headers: {
        "Content-Type": object.contentType,
        "Content-Disposition": `attachment; filename="${artifact.originalName.replace(/"/g, "")}"`,
        ...(object.contentLength ? { "Content-Length": String(object.contentLength) } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to download artifact.",
      },
      { status: 400 },
    );
  }
}
