import { Queue } from "bullmq";
import IORedis from "ioredis";

export const publishingQueueName = "leaflock-publishing";

export function getPublishingQueue() {
  const connectionUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const connection = new IORedis(connectionUrl, { maxRetriesPerRequest: null });
  return new Queue(publishingQueueName, {
    connection: connection as never
  });
}

export async function enqueuePublishingJob(type: string, payload: Record<string, unknown>) {
  const queue = getPublishingQueue();
  const job = await queue.add(type, payload, {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 500
  });
  await queue.close();
  return job.id;
}
