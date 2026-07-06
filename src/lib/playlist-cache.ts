import fs from "fs/promises";
import path from "path";
import { getFmPublicConfig } from "@/lib/fm-store";
import { fetchPlaylistVideosFromYouTubeApi } from "@/lib/youtube-api";
import type { PlaylistVideo } from "@/lib/youtube-playlist";

const CACHE_DIR = path.join(process.cwd(), "data", "playlist-cache");

export type CachedPlaylistVideo = PlaylistVideo & {
  thumbnail: string;
};

export type PlaylistCacheEntry = {
  playlistId: string;
  videos: CachedPlaylistVideo[];
  cachedAt: string;
  trackCount: number;
};

function cachePath(playlistId: string) {
  return path.join(CACHE_DIR, `${playlistId}.json`);
}

export function playlistThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function toCachedVideos(videos: PlaylistVideo[]): CachedPlaylistVideo[] {
  return videos.map((video) => ({
    ...video,
    thumbnail: playlistThumbnail(video.id)
  }));
}

export async function readPlaylistCache(playlistId: string): Promise<PlaylistCacheEntry | null> {
  try {
    return JSON.parse(await fs.readFile(cachePath(playlistId), "utf8")) as PlaylistCacheEntry;
  } catch {
    return null;
  }
}

export async function getCachedPlaylistVideos(playlistId: string): Promise<CachedPlaylistVideo[] | null> {
  const entry = await readPlaylistCache(playlistId);
  return entry?.videos?.length ? entry.videos : null;
}

export async function refreshPlaylistCache(playlistId: string): Promise<PlaylistCacheEntry> {
  const videos = await fetchPlaylistVideosFromYouTubeApi(playlistId);
  const entry: PlaylistCacheEntry = {
    playlistId,
    videos: toCachedVideos(videos),
    cachedAt: new Date().toISOString(),
    trackCount: videos.length
  };

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath(playlistId), JSON.stringify(entry, null, 2), "utf8");
  return entry;
}

export async function ensurePlaylistCache(playlistId?: string): Promise<PlaylistCacheEntry> {
  const id = playlistId ?? (await getFmPublicConfig()).playlistId;
  const existing = await readPlaylistCache(id);
  if (existing?.videos?.length) {
    return existing;
  }
  return refreshPlaylistCache(id);
}

export async function getActivePlaylistCacheSummary() {
  const { playlistId } = await getFmPublicConfig();
  const entry = await readPlaylistCache(playlistId);
  return {
    activePlaylist: playlistId,
    cachedTrackCount: entry?.trackCount ?? 0,
    cachedAt: entry?.cachedAt ?? null
  };
}