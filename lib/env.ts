export function getAppBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export function getInternalAppBaseUrl() {
  return process.env.APP_INTERNAL_BASE_URL ?? getAppBaseUrl();
}

export function getSliceWorkerSecret() {
  return process.env.SLICE_WORKER_SECRET ?? "kg-3dpm-dev-secret";
}

export function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
}

export function getSliceQueueName() {
  return process.env.SLICE_QUEUE_NAME ?? "slice-jobs";
}

export function getStorageBucket() {
  return process.env.STORAGE_BUCKET ?? "kg-3dpm";
}

export function getStorageConfig() {
  return {
    endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  };
}

export function getSliceJobTimeoutMs() {
  return Number(process.env.SLICE_JOB_TIMEOUT_MS ?? "600000");
}
