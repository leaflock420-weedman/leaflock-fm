import fs from "fs/promises";
import path from "path";
import {
  defaultPlaylists,
  normalizePlaylists,
  resolveActivePlaylist,
  type FmPlaylists,
  type FmPlaylistKey,
  type FmScheduleItem
} from "@/lib/fm-playlists";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(DATA_DIR, "fm-settings.json");
const LIKES_PATH = path.join(DATA_DIR, "track-likes.json");
const REQUESTS_PATH = path.join(DATA_DIR, "track-requests.json");

export type FmDeskSettings = {
  playlists: FmPlaylists;
  youtubeLiveVideoId: string;
  youtubeChannelId: string;
  ownerEmail: string;
  schedule: FmScheduleItem[];
  updatedAt: string;
};

/** @deprecated Use FmDeskSettings */
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

export type TrackRequest = {
  id: string;
  message: string;
  trackTitle?: string;
  createdAt: string;
  emailed: boolean;
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function emptyDeskSettings(): FmDeskSettings {
  return {
    playlists: defaultPlaylists(),
    youtubeLiveVideoId: process.env.NEXT_PUBLIC_YOUTUBE_LIVE_VIDEO_ID?.trim() ?? "",
    youtubeChannelId: process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID?.trim() ?? "",
    ownerEmail: process.env.FM_OWNER_EMAIL?.trim() ?? "",
    schedule: defaultSchedule(),
    updatedAt: new Date().toISOString()
  };
}

function defaultSchedule(): FmScheduleItem[] {
  return [
    {
      id: "night-chill",
      title: "Night / Chill",
      dayOfWeek: -1,
      startTime: "22:00",
      endTime: "06:00",
      playlistKey: "nightChill",
      note: "Auto after 10pm when Night / Chill playlist is set"
    },
    {
      id: "main-day",
      title: "Main Rotation",
      dayOfWeek: -1,
      startTime: "06:00",
      endTime: "22:00",
      playlistKey: "mainRotation",
      note: "Default daytime shuffle"
    }
  ];
}

function migrateLegacySettings(raw: Record<string, unknown>): FmDeskSettings {
  const base = emptyDeskSettings();

  if (raw.playlists && typeof raw.playlists === "object") {
    base.playlists = normalizePlaylists(raw.playlists as Partial<FmPlaylists>);
  } else if (typeof raw.playlistId === "string" && raw.playlistId.trim()) {
    base.playlists.mainRotation = raw.playlistId.trim();
  }

  if (typeof raw.youtubeLiveVideoId === "string") {
    base.youtubeLiveVideoId = raw.youtubeLiveVideoId.trim();
  }
  if (typeof raw.youtubeChannelId === "string") {
    base.youtubeChannelId = raw.youtubeChannelId.trim();
  }
  if (typeof raw.ownerEmail === "string") {
    base.ownerEmail = raw.ownerEmail.trim();
  }
  if (Array.isArray(raw.schedule)) {
    base.schedule = raw.schedule as FmScheduleItem[];
  }
  if (typeof raw.updatedAt === "string") {
    base.updatedAt = raw.updatedAt;
  }

  return base;
}

export async function getFmDeskSettings(): Promise<FmDeskSettings> {
  try {
    const raw = JSON.parse(await fs.readFile(SETTINGS_PATH, "utf8")) as Record<string, unknown>;
    return migrateLegacySettings(raw);
  } catch {
    return emptyDeskSettings();
  }
}

/** Listener-safe active rotation */
export async function getFmPublicConfig() {
  const settings = await getFmDeskSettings();
  const active = resolveActivePlaylist({
    playlists: settings.playlists,
    schedule: settings.schedule
  });

  const playlistId = active.playlistId || settings.playlists.mainRotation;

  return {
    playlistId,
    simplePlaylistId: settings.playlists.mainRotation,
    playlists: settings.playlists,
    playlistLabel: active.label,
    playlistReason: active.reason,
    updatedAt: settings.updatedAt,
    youtubeLiveVideoId: settings.youtubeLiveVideoId,
    youtubeChannelId: settings.youtubeChannelId,
    schedule: settings.schedule.map((item) => ({
      id: item.id,
      title: item.title,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      playlistKey: item.playlistKey,
      note: item.note
    }))
  };
}

export async function getFmSettings(): Promise<FmSettings> {
  const config = await getFmPublicConfig();
  return {
    playlistId: config.playlistId,
    updatedAt: config.updatedAt
  };
}

export async function saveFmDeskSettings(
  input: Partial<Omit<FmDeskSettings, "playlists">> & { playlists?: Partial<FmPlaylists> }
): Promise<FmDeskSettings> {
  await ensureDataDir();
  const current = await getFmDeskSettings();

  const settings: FmDeskSettings = {
    playlists: normalizePlaylists({ ...current.playlists, ...input.playlists }),
    youtubeLiveVideoId: input.youtubeLiveVideoId?.trim() ?? current.youtubeLiveVideoId,
    youtubeChannelId: input.youtubeChannelId?.trim() ?? current.youtubeChannelId,
    ownerEmail: input.ownerEmail?.trim() ?? current.ownerEmail,
    schedule: input.schedule ?? current.schedule,
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

export async function saveFmSettings(playlistId: string): Promise<FmSettings> {
  const settings = await saveFmDeskSettings({
    playlists: { mainRotation: playlistId.trim() }
  });
  return { playlistId: settings.playlists.mainRotation, updatedAt: settings.updatedAt };
}

export async function saveFmPlaylist(
  key: FmPlaylistKey,
  playlistId: string
): Promise<FmDeskSettings> {
  const current = await getFmDeskSettings();
  return saveFmDeskSettings({
    playlists: { ...current.playlists, [key]: playlistId.trim() }
  });
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

export async function recordTrackRequest(message: string, trackTitle?: string): Promise<TrackRequest> {
  await ensureDataDir();

  let requests: TrackRequest[] = [];
  try {
    requests = JSON.parse(await fs.readFile(REQUESTS_PATH, "utf8")) as TrackRequest[];
  } catch {
    requests = [];
  }

  const entry: TrackRequest = {
    id: `req_${Date.now()}`,
    message: message.trim(),
    trackTitle: trackTitle?.trim(),
    createdAt: new Date().toISOString(),
    emailed: false
  };

  requests.unshift(entry);
  requests = requests.slice(0, 200);
  await fs.writeFile(REQUESTS_PATH, JSON.stringify(requests, null, 2), "utf8");
  return entry;
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