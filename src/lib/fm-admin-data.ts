import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STATION_CONTROL_PATH = path.join(DATA_DIR, "station-control.json");
const PLAYLIST_REGISTRY_PATH = path.join(DATA_DIR, "playlist-registry.json");
const PLAYBACK_HISTORY_PATH = path.join(DATA_DIR, "playback-history.json");
const REQUEST_QUEUE_PATH = path.join(DATA_DIR, "request-queue.json");
const SHOWS_PATH = path.join(DATA_DIR, "shows.json");
const CLIPS_PATH = path.join(DATA_DIR, "clips.json");
const CONDUCTOR_STATE_PATH = path.join(DATA_DIR, "conductor-state.json");

export type StationMode =
  | "auto_radio"
  | "scheduled_show"
  | "live_stream"
  | "maintenance";

export type PlaylistCategory =
  | "Main"
  | "R&B"
  | "Country"
  | "Late Night"
  | "4:20"
  | "Podcast"
  | "Product Drops";

export type StationControl = {
  mode: StationMode;
  activePlaylistId: string;
  activePlaylistRegistryId: string | null;
  defaultPlaylistId: string;
  maintenanceMessage: string;
  youtubeLiveVideoId: string;
  youtubeLiveUrl: string;
  allowRequests: boolean;
  updatedAt: string;
};

export type PlaylistRegistryEntry = {
  id: string;
  name: string;
  youtubePlaylistId: string;
  category: PlaylistCategory;
  notes: string;
  active: boolean;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlaybackHistoryEntry = {
  videoId: string;
  title: string;
  playedAt: string;
  source: "playlist" | "jukebox" | "owner" | "vibe" | "request";
  requesterId?: string;
};

export type RequestQueueItem = {
  id: string;
  videoId: string;
  title: string;
  requestedBy: string;
  instagram?: string;
  youtubeUrl: string;
  durationSec?: number;
  status: "pending" | "approved" | "rejected" | "played" | "skipped" | "pinned" | "banned";
  boosts: number;
  createdAt: string;
  playedAt?: string;
  rejectReason?: string;
};

export type ScheduledShow = {
  id: string;
  name: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  playlistRegistryId: string;
  allowRequests: boolean;
  allowPodcastClips: boolean;
  returnToDefaultAfter: boolean;
  active: boolean;
};

export type PodcastClip = {
  id: string;
  name: string;
  youtubeUrl: string;
  videoId: string;
  startSec: number;
  endSec: number;
  active: boolean;
};

export type ConductorState = {
  lastTickAt: string;
  tickCount: number;
  lastRecordedRevision: number;
  nextTracksCache: Array<{ videoId: string; title: string }>;
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(filePath: string, value: T) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

const DEFAULT_MAIN =
  process.env.FM_PLAYLIST_ID ??
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID ??
  "PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va";

function defaultStationControl(): StationControl {
  return {
    mode: "auto_radio",
    activePlaylistId: DEFAULT_MAIN,
    activePlaylistRegistryId: null,
    defaultPlaylistId: DEFAULT_MAIN,
    maintenanceMessage: "LeafLock FM is briefly off air. Stay locked — we'll be back soon.",
    youtubeLiveVideoId: process.env.NEXT_PUBLIC_YOUTUBE_LIVE_VIDEO_ID?.trim() ?? "",
    youtubeLiveUrl: "",
    allowRequests: true,
    updatedAt: new Date().toISOString()
  };
}

function defaultRegistry(): PlaylistRegistryEntry[] {
  const now = new Date().toISOString();
  return [
    {
      id: "pl_main",
      name: "Main Rotation",
      youtubePlaylistId: DEFAULT_MAIN,
      category: "Main",
      notes: "Default 24/7 LeafLock shuffle",
      active: true,
      isDefault: true,
      archived: false,
      createdAt: now,
      updatedAt: now
    }
  ];
}

export async function getStationControl(): Promise<StationControl> {
  const raw = await readJson<Partial<StationControl> | null>(STATION_CONTROL_PATH, null);
  if (!raw) return defaultStationControl();
  return { ...defaultStationControl(), ...raw, updatedAt: raw.updatedAt ?? new Date().toISOString() };
}

export async function saveStationControl(
  input: Partial<StationControl>
): Promise<StationControl> {
  const current = await getStationControl();
  const next: StationControl = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString()
  };
  await writeJson(STATION_CONTROL_PATH, next);
  return next;
}

export async function getPlaylistRegistry(): Promise<PlaylistRegistryEntry[]> {
  const entries = await readJson<PlaylistRegistryEntry[]>(PLAYLIST_REGISTRY_PATH, []);
  return entries.length > 0 ? entries : defaultRegistry();
}

export async function savePlaylistRegistry(
  entries: PlaylistRegistryEntry[]
): Promise<PlaylistRegistryEntry[]> {
  await writeJson(PLAYLIST_REGISTRY_PATH, entries);
  return entries;
}

export async function upsertPlaylistRegistry(
  input: Omit<PlaylistRegistryEntry, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<PlaylistRegistryEntry> {
  const entries = await getPlaylistRegistry();
  const now = new Date().toISOString();

  if (input.isDefault) {
    for (const entry of entries) entry.isDefault = false;
  }

  const existingIndex = input.id ? entries.findIndex((e) => e.id === input.id) : -1;
  const entry: PlaylistRegistryEntry = {
    id: input.id ?? `pl_${Date.now()}`,
    name: input.name,
    youtubePlaylistId: input.youtubePlaylistId,
    category: input.category,
    notes: input.notes,
    active: input.active,
    isDefault: input.isDefault,
    archived: input.archived,
    createdAt: existingIndex >= 0 ? entries[existingIndex].createdAt : now,
    updatedAt: now
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.unshift(entry);
  }

  await savePlaylistRegistry(entries);
  return entry;
}

export async function getPlaybackHistory(limit = 200): Promise<PlaybackHistoryEntry[]> {
  const entries = await readJson<PlaybackHistoryEntry[]>(PLAYBACK_HISTORY_PATH, []);
  return entries.slice(0, limit);
}

export async function recordPlaybackHistory(
  input: Omit<PlaybackHistoryEntry, "playedAt">
): Promise<void> {
  const entries = await readJson<PlaybackHistoryEntry[]>(PLAYBACK_HISTORY_PATH, []);
  entries.unshift({ ...input, playedAt: new Date().toISOString() });
  await writeJson(PLAYBACK_HISTORY_PATH, entries.slice(0, 500));
}

export async function getRequestQueue(): Promise<RequestQueueItem[]> {
  return readJson<RequestQueueItem[]>(REQUEST_QUEUE_PATH, []);
}

export async function saveRequestQueue(items: RequestQueueItem[]): Promise<RequestQueueItem[]> {
  await writeJson(REQUEST_QUEUE_PATH, items.slice(0, 300));
  return items;
}

export async function addRequestQueueItem(
  input: Omit<RequestQueueItem, "id" | "status" | "boosts" | "createdAt">
): Promise<RequestQueueItem> {
  const items = await getRequestQueue();
  const entry: RequestQueueItem = {
    ...input,
    id: `reqq_${Date.now()}`,
    status: "pending",
    boosts: 0,
    createdAt: new Date().toISOString()
  };
  items.unshift(entry);
  await saveRequestQueue(items);
  return entry;
}

export async function updateRequestQueueItem(
  id: string,
  patch: Partial<RequestQueueItem>
): Promise<RequestQueueItem | null> {
  const items = await getRequestQueue();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  items[index] = { ...items[index], ...patch };
  await saveRequestQueue(items);
  return items[index];
}

export async function boostRequestQueueItem(id: string): Promise<RequestQueueItem | null> {
  const items = await getRequestQueue();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  items[index] = { ...items[index], boosts: items[index].boosts + 1 };
  await saveRequestQueue(items);
  return items[index];
}

export async function getScheduledShows(): Promise<ScheduledShow[]> {
  return readJson<ScheduledShow[]>(SHOWS_PATH, []);
}

export async function saveScheduledShows(shows: ScheduledShow[]): Promise<ScheduledShow[]> {
  await writeJson(SHOWS_PATH, shows);
  return shows;
}

export async function getPodcastClips(): Promise<PodcastClip[]> {
  return readJson<PodcastClip[]>(CLIPS_PATH, []);
}

export async function savePodcastClips(clips: PodcastClip[]): Promise<PodcastClip[]> {
  await writeJson(CLIPS_PATH, clips);
  return clips;
}

export async function getConductorState(): Promise<ConductorState> {
  return readJson<ConductorState>(CONDUCTOR_STATE_PATH, {
    lastTickAt: new Date(0).toISOString(),
    tickCount: 0,
    lastRecordedRevision: -1,
    nextTracksCache: []
  });
}

export async function saveConductorState(state: ConductorState): Promise<ConductorState> {
  await writeJson(CONDUCTOR_STATE_PATH, state);
  return state;
}

export function extractYouTubePlaylistId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (/^PL[\w-]+$/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/[?&]list=([^&]+)/i);
  return match?.[1] ?? null;
}