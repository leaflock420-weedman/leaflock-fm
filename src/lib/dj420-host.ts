import { tickConductor } from "@/lib/fm-conductor";
import {
  ensurePlaylistCache,
  getActivePlaylistCacheSummary,
  refreshPlaylistCache
} from "@/lib/playlist-cache";
import { forceAdvanceStation, getNowPlaying, resetLiveStation } from "@/lib/fm-station";
import { ensureDj420Presence, getPublicLiveListeners } from "@/lib/fm-store";
import { getStationControl } from "@/lib/fm-admin-data";
import {
  DJ420_HOST_NAME,
  getDj420State,
  resolveDj420Status,
  saveDj420State,
  type Dj420HostState
} from "@/lib/dj420-state";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let bootPromise: Promise<Dj420HostState> | null = null;

export { DJ420_HOST_NAME, getDj420State, resolveDj420Status, type Dj420HostState };

export async function bootDj420Host(): Promise<Dj420HostState> {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const now = new Date().toISOString();
    const existing = await getDj420State();
    const control = await getStationControl();
    const playlistId = control.activePlaylistId || control.defaultPlaylistId;

    await ensurePlaylistCache(playlistId);
    await getNowPlaying();
    await ensureDj420Presence();

    const state: Dj420HostState = {
      hostName: DJ420_HOST_NAME,
      role: "station_host",
      type: "internal_host",
      status: "online",
      lastHeartbeatAt: now,
      bootedAt: existing?.bootedAt ?? now,
      tickCount: existing?.tickCount ?? 0
    };

    await saveDj420State(state);
    return state;
  })();

  try {
    return await bootPromise;
  } finally {
    bootPromise = null;
  }
}

export async function tickDj420Host(): Promise<Dj420HostState> {
  await ensureDj420Presence();
  await tickConductor();

  const existing = await getDj420State();
  const now = new Date().toISOString();
  const state: Dj420HostState = {
    hostName: DJ420_HOST_NAME,
    role: "station_host",
    type: "internal_host",
    status: "online",
    lastHeartbeatAt: now,
    bootedAt: existing?.bootedAt ?? now,
    tickCount: (existing?.tickCount ?? 0) + 1
  };

  await saveDj420State(state);
  return state;
}

export function startDj420Heartbeat(intervalMs = 20_000) {
  if (heartbeatTimer) return;

  void tickDj420Host().catch(() => undefined);
  heartbeatTimer = setInterval(() => {
    void tickDj420Host().catch(() => undefined);
  }, intervalMs);
}

export async function restartDj420Host(): Promise<Dj420HostState> {
  const control = await getStationControl();
  const playlistId = control.activePlaylistId || control.defaultPlaylistId;
  await refreshPlaylistCache(playlistId);
  await resetLiveStation();
  return bootDj420Host();
}

export async function forceDj420NextTrack() {
  await forceAdvanceStation();
  return tickDj420Host();
}

export async function runDj420Warmup() {
  const [state, nowPlaying, cache, listeners, control] = await Promise.all([
    tickDj420Host(),
    getNowPlaying(),
    getActivePlaylistCacheSummary(),
    getPublicLiveListeners(),
    getStationControl()
  ]);

  const dj420Status = resolveDj420Status(state);
  const currentTrackReady = Boolean(nowPlaying.current?.videoId);
  const nextTrackReady = Boolean(nowPlaying.nextVideoId || nowPlaying.upNext);

  return {
    ok: dj420Status === "online" && currentTrackReady,
    dj420Status,
    lastHeartbeat: state.lastHeartbeatAt,
    activePlaylist: cache.activePlaylist,
    cachedTrackCount: cache.cachedTrackCount,
    currentTrackReady,
    nextTrackReady,
    serverTime: new Date().toISOString(),
    mode: control.mode,
    currentTrack: nowPlaying.current.title,
    currentOffsetSeconds: nowPlaying.currentOffsetSeconds,
    nextTrack: nowPlaying.nextTitle ?? nowPlaying.upNext,
    listenerCount: listeners.length
  };
}

export async function getDj420AdminSnapshot() {
  const [state, warmup, nowPlaying] = await Promise.all([
    getDj420State(),
    runDj420Warmup(),
    getNowPlaying()
  ]);

  return {
    dj420: {
      status: resolveDj420Status(state),
      lastHeartbeat: state?.lastHeartbeatAt ?? null,
      bootedAt: state?.bootedAt ?? null,
      tickCount: state?.tickCount ?? 0
    },
    warmup,
    nowPlaying: {
      title: nowPlaying.current.title,
      videoId: nowPlaying.current.videoId,
      offsetSeconds: nowPlaying.currentOffsetSeconds,
      nextTitle: nowPlaying.nextTitle ?? nowPlaying.upNext,
      activePlaylist: nowPlaying.activePlaylist,
      thumbnail: nowPlaying.thumbnail
    }
  };
}