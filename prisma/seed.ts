import bcrypt from "bcryptjs";
import { PrismaClient, PublishingState, ScheduleLabel, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const password = process.env.ADMIN_PASSWORD || "change-me-before-launch";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@leaflock.local";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "LeafLock Admin",
      role: UserRole.SUPER_ADMIN,
      passwordHash: await bcrypt.hash(password, 12)
    }
  });

  const nia = await prisma.host.upsert({
    where: { slug: "nia-vale" },
    update: {},
    create: {
      name: "Nia Vale",
      slug: "nia-vale",
      bio: "Host of Morning Canopy and station voice for daily live programming.",
      socials: { instagram: "niavale", youtube: "LeafLockRadio" }
    }
  });

  const marlo = await prisma.host.upsert({
    where: { slug: "marlo-finch" },
    update: {},
    create: {
      name: "Marlo Finch",
      slug: "marlo-finch",
      bio: "Longform interviewer, producer, and Green Room host.",
      socials: { instagram: "marlofinch" }
    }
  });

  const morningCanopy = await prisma.show.upsert({
    where: { slug: "morning-canopy" },
    update: {},
    create: {
      title: "Morning Canopy",
      slug: "morning-canopy",
      description: "News, interviews, new music, station IDs, and listener rituals.",
      coverArtUrl: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80",
      tags: ["news", "interviews", "new music"],
      preferredPlatforms: ["Radio", "RSS", "YouTube"],
      hosts: { connect: [{ id: nia.id }] }
    }
  });

  const greenRoom = await prisma.show.upsert({
    where: { slug: "green-room" },
    update: {},
    create: {
      title: "Green Room",
      slug: "green-room",
      description: "Longform artist conversations and behind-the-scenes scene building.",
      coverArtUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80",
      tags: ["longform", "artists", "behind the scenes"],
      preferredPlatforms: ["Podcast", "YouTube"],
      hosts: { connect: [{ id: marlo.id }] }
    }
  });

  const fieldNotes = await prisma.episode.upsert({
    where: { slug: "field-notes-018-building-a-scene-that-lasts" },
    update: {},
    create: {
      title: "Field Notes 018: Building a scene that lasts",
      slug: "field-notes-018-building-a-scene-that-lasts",
      summary: "A practical conversation about venues, community submissions, sponsor trust, and local discovery.",
      publishDate: new Date("2026-04-18T08:00:00+10:00"),
      duration: "54:12",
      state: PublishingState.SCHEDULED,
      audioUrl: "https://leaflock.example/media/field-notes-018.m4a",
      chapters: [
        { start: "00:00", title: "Open" },
        { start: "08:24", title: "Scene maps" },
        { start: "21:16", title: "Sponsor reads" },
        { start: "42:30", title: "Replay radio" }
      ],
      show: { connect: { id: greenRoom.id } },
      hosts: { connect: [{ id: marlo.id }] }
    }
  });

  await prisma.episode.upsert({
    where: { slug: "morning-canopy-label-ids-and-listener-rituals" },
    update: {},
    create: {
      title: "Morning Canopy: Label IDs and listener rituals",
      slug: "morning-canopy-label-ids-and-listener-rituals",
      summary: "How hourly IDs, clips, and live chat keep a 24/7 station feeling hosted.",
      publishDate: new Date("2026-04-12T08:00:00+10:00"),
      duration: "38:44",
      state: PublishingState.PUBLISHED,
      audioUrl: "https://leaflock.example/media/morning-canopy-label-ids.m4a",
      chapters: [
        { start: "00:00", title: "Open" },
        { start: "05:10", title: "Legal IDs" },
        { start: "16:50", title: "Live chat" },
        { start: "31:02", title: "Clip queue" }
      ],
      show: { connect: { id: morningCanopy.id } },
      hosts: { connect: [{ id: nia.id }] }
    }
  });

  await prisma.clip.upsert({
    where: { slug: "why-station-ids-still-matter" },
    update: {},
    create: {
      title: "Why station IDs still matter",
      slug: "why-station-ids-still-matter",
      caption: "A short explainers cutdown from Morning Canopy.",
      state: PublishingState.APPROVED,
      episode: { connect: { id: fieldNotes.id } },
      show: { connect: { id: greenRoom.id } }
    }
  });

  await prisma.blogPost.upsert({
    where: { slug: "april-station-clock-refresh" },
    update: {},
    create: {
      title: "April station clock refresh",
      slug: "april-station-clock-refresh",
      excerpt: "A quick note on the new LeafLock Radio schedule, replay blocks, and clip cadence.",
      body: "LeafLock Radio is moving to a cleaner station clock with live mornings, Wednesday longform, late-night replays, and daily AutoDJ fallback.",
      state: PublishingState.PUBLISHED,
      authorName: "LeafLock Desk"
    }
  });

  await prisma.sponsor.upsert({
    where: { slug: "green-room-sponsor-slot" },
    update: {},
    create: {
      name: "Green Room sponsor slot",
      slug: "green-room-sponsor-slot",
      notes: "Thirty-second read available for Wednesday longform episodes.",
      state: PublishingState.READY_FOR_REVIEW
    }
  });

  await prisma.playlist.upsert({
    where: { slug: "late-night-chill" },
    update: {},
    create: {
      name: "Late Night Chill",
      slug: "late-night-chill",
      description: "Overnight beds, evergreen interviews, IDs, and low-interruption replays.",
      category: "late-night",
      priority: 5,
      state: PublishingState.APPROVED
    }
  });

  await prisma.scheduleBlock.createMany({
    data: [
      {
        title: "Morning Canopy",
        startsAt: new Date("2026-04-20T08:00:00+10:00"),
        endsAt: new Date("2026-04-20T10:00:00+10:00"),
        timezone: "Australia/Brisbane",
        recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        label: ScheduleLabel.LIVE,
        showId: morningCanopy.id
      },
      {
        title: "Green Room",
        startsAt: new Date("2026-04-22T14:00:00+10:00"),
        endsAt: new Date("2026-04-22T15:00:00+10:00"),
        timezone: "Australia/Brisbane",
        recurrence: "FREQ=WEEKLY;BYDAY=WE",
        label: ScheduleLabel.LIVE,
        showId: greenRoom.id
      },
      {
        title: "Late Night Chill",
        startsAt: new Date("2026-04-20T23:00:00+10:00"),
        endsAt: new Date("2026-04-21T02:00:00+10:00"),
        timezone: "Australia/Brisbane",
        recurrence: "FREQ=DAILY",
        label: ScheduleLabel.REPLAY,
        playlist: "late-night-chill"
      }
    ],
    skipDuplicates: true
  });

  await prisma.analyticsSnapshot.create({
    data: {
      liveListeners: 128,
      concurrentPeak: 214,
      avgSessionSec: 2160,
      episodePlays: 1840,
      podcastDownloads: 920,
      videoWatchSec: 64200,
      topClips: ["Why station IDs still matter"],
      referrals: { youtube: 42, spotify: 28, apple: 16, web: 14 }
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
