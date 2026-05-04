import { createClient } from "redis";
import { getRedisUrl, getSliceQueueName } from "@/lib/env";
import type { SliceQueuePayload } from "@/lib/types";

type AppRedisClient = ReturnType<typeof createClient>;

let clientPromise: Promise<AppRedisClient> | null = null;

async function getRedisClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = createClient({
        url: getRedisUrl(),
      });

      client.on("error", (error) => {
        console.error("Redis error", error);
      });

      await client.connect();
      return client;
    })();
  }

  return clientPromise;
}

export async function enqueueSliceJob(payload: SliceQueuePayload) {
  const client = await getRedisClient();
  await client.lPush(getSliceQueueName(), JSON.stringify(payload));
}

export async function dequeueSliceJob(timeoutSeconds = 5) {
  const client = await getRedisClient();
  const result = await client.brPop(getSliceQueueName(), timeoutSeconds);

  if (!result?.element) {
    return null;
  }

  return JSON.parse(result.element) as SliceQueuePayload;
}
