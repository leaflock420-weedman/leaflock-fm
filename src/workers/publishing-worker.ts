import { JobState, JobType } from "@prisma/client";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { publishingQueueName } from "@/lib/queue";
import { renderPodcastRss } from "@/lib/rss";
import { syncAzuraCastSchedule } from "@/lib/azuracast";

async function mark(jobId: string, state: JobState, lastError?: string) {
  await prisma.publishingJob.update({
    where: { id: jobId },
    data: {
      state,
      lastError,
      attempts: { increment: state === JobState.RUNNING ? 1 : 0 }
    }
  });
}

async function processJob(type: JobType, payload: Record<string, unknown>) {
  if (type === JobType.REGENERATE_RSS) {
    const episodes = await prisma.episode.findMany({
      include: { show: true },
      orderBy: { publishDate: "desc" },
      take: 100
    });
    return { rssLength: renderPodcastRss(episodes).length };
  }

  if (type === JobType.SYNC_AZURACAST) {
    return syncAzuraCastSchedule(payload);
  }

  if (type === JobType.PUBLISH_YOUTUBE) {
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_REFRESH_TOKEN) {
      return { skipped: true, reason: "YouTube credentials are not configured" };
    }
    return { queuedForYouTube: true };
  }

  return { accepted: true, type };
}

new Worker(
  publishingQueueName,
  async (job) => {
    const jobId = String(job.data.jobId);
    await mark(jobId, JobState.RUNNING);
    try {
      const dbJob = await prisma.publishingJob.findUniqueOrThrow({ where: { id: jobId } });
      const result = await processJob(dbJob.type, job.data);
      await prisma.publishingJob.update({
        where: { id: jobId },
        data: { state: JobState.SUCCEEDED, payload: { ...(dbJob.payload as object), result } }
      });
      return result;
    } catch (error) {
      await mark(jobId, JobState.FAILED, error instanceof Error ? error.message : "Unknown worker error");
      throw error;
    }
  },
  {
    connection: new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null
    }) as never
  }
);
