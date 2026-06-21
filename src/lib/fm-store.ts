import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(DATA_DIR, "fm-settings.json");
const LIKES_PATH = path.join(DATA_DIR, "track-likes.json");

export type FmSettings = {
  playlistId: string;
  updatedAt: string;
};

export type TrackLike = {
  trackId: string;
  title: string;
  artist?: string;
  source: "playlist" | "stream";
  count: number;
  lastLikedAt: string;
};

function defaultPlaylistId() {
  return (
    process.env.FM_PLAYLIST_ID ??
    process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID ??
    "PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va"
  );
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getFmSettings(): Promise<FmSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as FmSettings;
    if (parsed.playlistId) return parsed;
  } catch {
    // Fall through to default.
  }

  return {
    playlistId: defaultPlaylistId(),
    updatedAt: new Date().toISOString()
  };
}

export async function saveFmSettings(playlistId: string): Promise<FmSettings> {
  await ensureDataDir();
  const settings: FmSettings = {
    playlistId: playlistId.trim(),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

export async function recordTrackLike(input: {
  trackId: string;
  title: string;
  artist?: string;
  source: "playlist" | "stream";
}): Promise<TrackLike> {
  await ensureDataDir();

  let likes: Record<string, TrackLike> = {};
  try {
    likes = JSON.parse(await fs.readFile(LIKES_PATH, "utf8")) as Record<string, TrackLike>;
  } catch {
    likes = {};
  }

  const existing = likes[input.trackId];
  const next: TrackLike = {
    trackId: input.trackId,
    title: input.title,
    artist: input.artist,
    source: input.source,
    count: (existing?.count ?? 0) + 1,
    lastLikedAt: new Date().toISOString()
  };

  likes[input.trackId] = next;
  await fs.writeFile(LIKES_PATH, JSON.stringify(likes, null, 2), "utf8");
  return next;
}

export async function getTopLikes(limit = 10): Promise<TrackLike[]> {
  try {
    const likes = JSON.parse(await fs.readFile(LIKES_PATH, "utf8")) as Record<string, TrackLike>;
    return Object.values(likes)
      .sort((a, b) => b.count - a.count || b.lastLikedAt.localeCompare(a.lastLikedAt))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function verifyFmDeskAccess(request: Request) {
  const secret = process.env.FM_ADMIN_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const headerKey = request.headers.get("x-fm-desk-key");

  return bearer === secret || headerKey === secret;
}