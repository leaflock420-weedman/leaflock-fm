import type { Episode, Show } from "@prisma/client";

type EpisodeWithShow = Episode & { show: Show };

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderPodcastRss(episodes: EpisodeWithShow[]) {
  const siteUrl = process.env.APP_URL || "https://leaflock.example";
  const items = episodes
    .map((episode) => {
      const audioUrl = episode.audioUrl || `${siteUrl}/media/${episode.slug}.m4a`;
      return `
    <item>
      <title>${escapeXml(episode.title)}</title>
      <description>${escapeXml(episode.summary)}</description>
      <pubDate>${episode.publishDate.toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(episode.slug)}</guid>
      <itunes:duration>${escapeXml(episode.duration)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <enclosure url="${escapeXml(audioUrl)}" length="0" type="audio/mp4" />
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>LeafLock Radio</title>
    <link>${escapeXml(siteUrl)}</link>
    <language>en-au</language>
    <description>Live radio replays, flagship episodes, interviews, and community dispatches from LeafLock Radio.</description>
    <itunes:author>LeafLock Radio</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${escapeXml(siteUrl)}/artwork/podcast-cover.jpg" />
    <itunes:category text="Music" />${items}
  </channel>
</rss>`;
}
