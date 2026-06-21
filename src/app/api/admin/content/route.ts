import { ContentType, JobType, PublishingState } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { enqueuePublishingJob } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

const contentSchema = z.object({
  contentType: z.nativeEnum(ContentType),
  title: z.string().min(2),
  owner: z.string().optional(),
  state: z.nativeEnum(PublishingState).default(PublishingState.DRAFT),
  mediaKey: z.string().optional(),
  notes: z.string().optional()
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function queueStandardJobs(input: { episodeId?: string; clipId?: string; mediaKey?: string }) {
  const basePayload = { ...input };
  const jobTypes = input.clipId
    ? [JobType.GENERATE_THUMBNAIL, JobType.PUBLISH_YOUTUBE, JobType.PULL_ANALYTICS]
    : [
        JobType.NORMALIZE_AUDIO,
        JobType.GENERATE_WAVEFORM,
        JobType.GENERATE_TRANSCRIPT,
        JobType.EXTRACT_CLIPS,
        JobType.REGENERATE_RSS,
        JobType.PUBLISH_YOUTUBE,
        JobType.SYNC_AZURACAST,
        JobType.PULL_ANALYTICS
      ];

  await Promise.all(
    jobTypes.map(async (type) => {
      const dbJob = await prisma.publishingJob.create({
        data: {
          type,
          episodeId: input.episodeId,
          clipId: input.clipId,
          payload: basePayload
        }
      });
      await enqueuePublishingJob(type, { jobId: dbJob.id, ...basePayload });
    })
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const wantsJson = request.headers.get("accept")?.includes("application/json") || false;
  if (!user) {
    if (wantsJson) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const parsed = contentSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const slug = `${slugify(input.title)}-${Date.now()}`;

  if (input.contentType === ContentType.CLIP) {
    const clip = await prisma.clip.create({
      data: {
        title: input.title,
        slug,
        caption: input.notes || "Social draft pending.",
        state: input.state
      }
    });
    await queueStandardJobs({ clipId: clip.id, mediaKey: input.mediaKey });
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "create", entity: `Clip:${clip.id}`, after: input }
    });
    if (wantsJson) return NextResponse.json({ clip });
    return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  }

  if (input.contentType === ContentType.SHOW) {
    const show = await prisma.show.create({
      data: {
        title: input.title,
        slug,
        description: input.notes || "Show description pending.",
        coverArtUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80",
        tags: [],
        preferredPlatforms: ["Radio"],
        state: input.state
      }
    });
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "create", entity: `Show:${show.id}`, after: input }
    });
    if (wantsJson) return NextResponse.json({ show });
    return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  }

  if (input.contentType === ContentType.BLOG_POST) {
    const post = await prisma.blogPost.create({
      data: {
        title: input.title,
        slug,
        excerpt: input.notes?.slice(0, 180) || "News brief pending.",
        body: input.notes || "Draft body pending.",
        state: input.state,
        authorName: input.owner || user.name
      }
    });
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "create", entity: `BlogPost:${post.id}`, after: input }
    });
    if (wantsJson) return NextResponse.json({ post });
    return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  }

  if (input.contentType === ContentType.SPONSOR_SPOT) {
    const sponsor = await prisma.sponsor.create({
      data: {
        name: input.title,
        slug,
        notes: input.notes || "Sponsor notes pending.",
        state: input.state,
        spotUrl: input.mediaKey
      }
    });
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "create", entity: `Sponsor:${sponsor.id}`, after: input }
    });
    if (wantsJson) return NextResponse.json({ sponsor });
    return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  }

  if (input.contentType === ContentType.PLAYLIST_BLOCK) {
    const playlist = await prisma.playlist.create({
      data: {
        name: input.title,
        slug,
        description: input.notes || "Playlist block pending.",
        category: "AutoDJ",
        state: input.state
      }
    });
    const dbJob = await prisma.publishingJob.create({
      data: {
        type: JobType.SYNC_AZURACAST,
        payload: { playlistId: playlist.id, mediaKey: input.mediaKey }
      }
    });
    await enqueuePublishingJob(JobType.SYNC_AZURACAST, { jobId: dbJob.id, playlistId: playlist.id, mediaKey: input.mediaKey });
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "create", entity: `Playlist:${playlist.id}`, after: input }
    });
    if (wantsJson) return NextResponse.json({ playlist });
    return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  }

  const show = await prisma.show.findFirst({ orderBy: { createdAt: "asc" } });
  if (!show) {
    return NextResponse.json({ error: "Create or seed a show before creating episodes." }, { status: 409 });
  }

  const episode = await prisma.episode.create({
    data: {
      title: input.title,
      slug,
      summary: input.notes || "Episode summary pending editorial review.",
      publishDate: new Date(),
      duration: "00:00",
      state: input.state,
      audioUrl: input.mediaKey ? `${process.env.APP_URL || ""}/media/${input.mediaKey}` : null,
      showId: show.id
    }
  });

  await queueStandardJobs({ episodeId: episode.id, mediaKey: input.mediaKey });
  await prisma.auditLog.create({
    data: { actorId: user.id, action: "create", entity: `Episode:${episode.id}`, after: input }
  });

  if (wantsJson) return NextResponse.json({ episode });
  return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
}
