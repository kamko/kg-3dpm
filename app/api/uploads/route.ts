import { NextResponse } from "next/server";
import { putObject } from "@/lib/object-storage";
import { createUploadedArtifact } from "@/lib/store";
import { buildUploadStorageKey } from "@/lib/storage-keys";
import { uploadSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

const allowedExtensions = new Set([".stl", ".3mf"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return NextResponse.json(
        { error: "Only STL and 3MF files are supported." },
        { status: 400 },
      );
    }

    uploadSchema.parse({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = buildUploadStorageKey(file.name);

    await putObject({
      key: storageKey,
      body: buffer,
      contentType: file.type || "application/octet-stream",
    });

    const artifact = createUploadedArtifact({
      storageKey,
      originalName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });

    return NextResponse.json({ artifact });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed.",
      },
      { status: 400 },
    );
  }
}
