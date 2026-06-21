import { PublishingState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { renderPodcastRss } from "@/lib/rss";

export async function GET() {
  const episodes = await prisma.episode.findMany({
    where: { state: { in: [PublishingState.PUBLISHED, PublishingState.SCHEDULED] } },
    include: { show: true },
    orderBy: { publishDate: "desc" },
    take: 100
  });

  return new Response(renderPodcastRss(episodes), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
    }
  });
}
