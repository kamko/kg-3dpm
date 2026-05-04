import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getStorageBucket, getStorageConfig } from "@/lib/env";

let storageClient: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

function getClient() {
  if (storageClient) {
    return storageClient;
  }

  const config = getStorageConfig();
  storageClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return storageClient;
}

export async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const client = getClient();
      const bucket = getStorageBucket();

      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })();
  }

  return bucketReady;
}

export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}) {
  await ensureBucket();
  const client = getClient();
  const bucket = getStorageBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

export async function putFileObject(params: {
  key: string;
  filePath: string;
  contentType: string;
}) {
  const file = await import("node:fs");
  await putObject({
    key: params.key,
    body: file.readFileSync(params.filePath),
    contentType: params.contentType,
  });
}

export async function downloadObjectToFile(params: {
  key: string;
  targetPath: string;
}) {
  await ensureBucket();
  const client = getClient();
  const bucket = getStorageBucket();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: params.key,
    }),
  );

  await mkdir(path.dirname(params.targetPath), { recursive: true });

  const body = response.Body;
  if (!(body instanceof Readable)) {
    throw new Error("Unable to stream object from storage.");
  }

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(params.targetPath);
    body.pipe(output);
    body.on("error", reject);
    output.on("error", reject);
    output.on("finish", () => resolve());
  });
}

export async function getObjectBytes(params: { key: string }) {
  await ensureBucket();
  const client = getClient();
  const bucket = getStorageBucket();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: params.key,
    }),
  );

  const body = response.Body as
    | { transformToByteArray?: () => Promise<Uint8Array> }
    | undefined;

  if (!body?.transformToByteArray) {
    throw new Error("Unable to read object from storage.");
  }

  return {
    body: await body.transformToByteArray(),
    contentType: response.ContentType ?? "application/octet-stream",
    contentLength: response.ContentLength ?? undefined,
  };
}
