import path from "node:path";
import { randomUUID } from "node:crypto";

export function buildUploadStorageKey(fileName: string) {
  return buildStorageKey("uploads", fileName);
}

export function buildSliceStorageKey(fileName: string) {
  return buildStorageKey("slices", fileName);
}

export function buildLogStorageKey(fileName: string) {
  return buildStorageKey("logs", fileName);
}

function buildStorageKey(prefix: string, fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, extension).replace(/[^a-zA-Z0-9-_]+/g, "-");
  return `${prefix}/${baseName || "file"}-${randomUUID()}${extension}`;
}
