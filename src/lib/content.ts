import { PublishingState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNowPlaying } from "@/lib/azuracast";

export async function getHomeData() {
  const [shows, episodes, clips, scheduleBlocks, analytics, nowPlaying] = await Promise.all([
    prisma.show.findMany({ include: { hosts: true }, orderBy: { title: "asc" }, take: 6 }),
    prisma.episode.findMany({ include: { show: true, hosts: true }, orderBy: { publishDate: "desc" }, take: 6 }),
    prisma.clip.findMany({ include: { episode: true, show: true }, orderBy: { updatedAt: "desc" }, take: 6 }),
    prisma.scheduleBlock.findMany({ include: { show: true }, orderBy: { startsAt: "asc" }, take: 12 }),
    prisma.analyticsSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
    getNowPlaying()
  ]);

  return {
    shows,
    episodes,
    clips,
    scheduleBlocks,
    analytics,
    nowPlaying,
    station: {
      name: "LeafLock Radio",
      primaryStreamUrl: process.env.PRIMARY_STREAM_URL || "https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one",
      fallbackStreamUrl: process.env.FALLBACK_STREAM_URL || "https://stream.live.vc.bbcmedia.co.uk/bbc_6music",
      timezone: "Australia/Brisbane",
      featuredEpisode: episodes.find((episode) => episode.state === PublishingState.SCHEDULED) || episodes[0] || null
    }
  };
}
