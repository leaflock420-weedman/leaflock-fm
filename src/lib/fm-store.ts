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
const JUKEBOX_PATH = path.join(DATA_DIR, "jukebox-suggestions.json");
const LISTENERS_PATH = path.join(DATA_DIR, "live-listeners.json");
const OWNER_QUEUE_PATH = path.join(DATA_DIR, "owner-queue.json");

export const JUKEBOX_AUTO_INTERVAL_MS = 15 * 60 * 1000;
export const LISTENER_TTL_MS = 2 * 60 * 1000;

export type FmDeskSettings = {
  playlists: FmPlaylists;
  youtubeLiveVideoId: string;
  youtubeChannelId: string;
  ownerEmail: string;
  schedule: FmScheduleItem[];
  runtime: FmRuntimeState;
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

export type JukeboxSuggestion = {
  id: string;
  videoId: string;
  title: string;
  suggestedBy?: string;
  instagram?: string;
  createdAt: string;
  status: "pending" | "played" | "skipped";
  playedAt?: string;
};

export type LiveListener = {
  id: string;
  displayName?: string;
  instagram?: string;
  lastSeenAt: string;
};

export type OwnerQueueItem = {
  id: string;
  videoId: string;
  title: string;
  createdAt: string;
  status: "pending" | "played";
  playedAt?: string;
};

export type FmRuntimeState = {
  lastAutoJukeboxAt: string | null;
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function emptyRuntimeState(): FmRuntimeState {
  return { lastAutoJukeboxAt: null };
}

function emptyDeskSettings(): FmDeskSettings {
  return {
    playlists: defaultPlaylists(),
    youtubeLiveVideoId: process.env.NEXT_PUBLIC_YOUTUBE_LIVE_VIDEO_ID?.trim() ?? "",
    youtubeChannelId: process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID?.trim() ?? "",
    ownerEmail: process.env.FM_OWNER_EMAIL?.trim() ?? "",
    schedule: defaultSchedule(),
    runtime: emptyRuntimeState(),
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
  if (raw.runtime && typeof raw.runtime === "object") {
    const runtime = raw.runtime as Partial<FmRuntimeState>;
    base.runtime = {
      lastAutoJukeboxAt:
        typeof runtime.lastAutoJukeboxAt === "string" ? runtime.lastAutoJukeboxAt : null
    };
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
    runtime: input.runtime ?? current.runtime ?? emptyRuntimeState(),
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

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile<T>(filePath: string, value: T) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function recordJukeboxSuggestion(input: {
  videoId: string;
  title: string;
  suggestedBy?: string;
  instagram?: string;
}): Promise<JukeboxSuggestion> {
  const suggestions = await readJsonFile<JukeboxSuggestion[]>(JUKEBOX_PATH, []);
  const entry: JukeboxSuggestion = {
    id: `juke_${Date.now()}`,
    videoId: input.videoId.trim(),
    title: input.title.trim() || "Jukebox suggestion",
    suggestedBy: input.suggestedBy?.trim(),
    instagram: input.instagram?.trim(),
    createdAt: new Date().toISOString(),
    status: "pending"
  };

  suggestions.unshift(entry);
  await writeJsonFile(JUKEBOX_PATH, suggestions.slice(0, 200));
  return entry;
}

export async function getJukeboxSuggestions(status?: JukeboxSuggestion["status"]) {
  const suggestions = await readJsonFile<JukeboxSuggestion[]>(JUKEBOX_PATH, []);
  return status ? suggestions.filter((item) => item.status === status) : suggestions;
}

export async function updateJukeboxSuggestion(
  id: string,
  status: JukeboxSuggestion["status"]
): Promise<JukeboxSuggestion | null> {
  const suggestions = await readJsonFile<JukeboxSuggestion[]>(JUKEBOX_PATH, []);
  const index = suggestions.findIndex((item) => item.id === id);
  if (index < 0) return null;

  suggestions[index] = {
    ...suggestions[index],
    status,
    playedAt: status === "played" ? new Date().toISOString() : suggestions[index].playedAt
  };
  await writeJsonFile(JUKEBOX_PATH, suggestions);
  return suggestions[index];
}

export async function recordListenerHeartbeat(input: {
  listenerId: string;
  displayName?: string;
  instagram?: string;
}): Promise<LiveListener> {
  const listeners = await readJsonFile<LiveListener[]>(LISTENERS_PATH, []);
  const now = new Date().toISOString();
  const existingIndex = listeners.findIndex((item) => item.id === input.listenerId);
  const entry: LiveListener = {
    id: input.listenerId,
    displayName: input.displayName?.trim(),
    instagram: input.instagram?.trim(),
    lastSeenAt: now
  };

  if (existingIndex >= 0) {
    listeners[existingIndex] = entry;
  } else {
    listeners.unshift(entry);
  }

  const fresh = listeners.filter(
    (item) => Date.now() - new Date(item.lastSeenAt).getTime() <= LISTENER_TTL_MS
  );
  await writeJsonFile(LISTENERS_PATH, fresh.slice(0, 100));
  return entry;
}

export async function getLiveListeners(): Promise<LiveListener[]> {
  const listeners = await readJsonFile<LiveListener[]>(LISTENERS_PATH, []);
  return listeners
    .filter((item) => Date.now() - new Date(item.lastSeenAt).getTime() <= LISTENER_TTL_MS)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function getTrackRequests(limit = 20): Promise<TrackRequest[]> {
  const requests = await readJsonFile<TrackRequest[]>(REQUESTS_PATH, []);
  return requests.slice(0, limit);
}

export async function addOwnerQueueItem(input: {
  videoId: string;
  title: string;
}): Promise<OwnerQueueItem> {
  const queue = await readJsonFile<OwnerQueueItem[]>(OWNER_QUEUE_PATH, []);
  const entry: OwnerQueueItem = {
    id: `own_${Date.now()}`,
    videoId: input.videoId.trim(),
    title: input.title.trim() || "Queued track",
    createdAt: new Date().toISOString(),
    status: "pending"
  };

  queue.unshift(entry);
  await writeJsonFile(OWNER_QUEUE_PATH, queue.slice(0, 100));
  return entry;
}

export async function getOwnerQueue(): Promise<OwnerQueueItem[]> {
  return readJsonFile<OwnerQueueItem[]>(OWNER_QUEUE_PATH, []);
}

export type PlayerInject = {
  source: "owner" | "jukebox";
  id: string;
  videoId: string;
  title: string;
  instagram?: string;
};

export async function peekPlayerInject(): Promise<PlayerInject | null> {
  const ownerQueue = await getOwnerQueue();
  const ownerItem = ownerQueue.find((item) => item.status === "pending");
  if (ownerItem) {
    return {
      source: "owner",
      id: ownerItem.id,
      videoId: ownerItem.videoId,
      title: ownerItem.title
    };
  }

  const settings = await getFmDeskSettings();
  const lastAt = settings.runtime.lastAutoJukeboxAt
    ? new Date(settings.runtime.lastAutoJukeboxAt).getTime()
    : 0;
  const due = Date.now() - lastAt >= JUKEBOX_AUTO_INTERVAL_MS;
  if (!due) return null;

  const pending = await getJukeboxSuggestions("pending");
  if (pending.length === 0) return null;

  const pick = pending[Math.floor(Math.random() * pending.length)];
  return {
    source: "jukebox",
    id: pick.id,
    videoId: pick.videoId,
    title: pick.title,
    instagram: pick.instagram
  };
}

export async function acknowledgePlayerInject(inject: PlayerInject) {
  if (inject.source === "owner") {
    const queue = await getOwnerQueue();
    const index = queue.findIndex((item) => item.id === inject.id);
    if (index >= 0) {
      queue[index] = {
        ...queue[index],
        status: "played",
        playedAt: new Date().toISOString()
      };
      await writeJsonFile(OWNER_QUEUE_PATH, queue);
    }
    return;
  }

  await updateJukeboxSuggestion(inject.id, "played");
  await saveFmDeskSettings({
    runtime: { lastAutoJukeboxAt: new Date().toISOString() }
  });
}

export function verifyFmDeskAccess(request: Request) {
  const secret = process.env.FM_ADMIN_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const headerKey = request.headers.get("x-fm-desk-key");

  return bearer === secret || headerKey === secret;
}