import fs from "fs/promises";
import path from "path";
import { getStationControl, type StationMode } from "@/lib/fm-admin-data";
import {
  acknowledgePlayerInject,
  getFmPublicConfig,
  getLiveListeners,
  peekPlayerInject,
  type PlayerInject
} from "@/lib/fm-store";
import { fetchPlaylistVideosFromYouTubeApi } from "@/lib/youtube-api";
import {
  createShuffledRotation,
  pickVibeMatchFromPlaylist,
  type PlaylistVideo
} from "@/lib/youtube-playlist";

const DATA_DIR = path.join(process.cwd(), "data");
const STATION_PATH = path.join(DATA_DIR, "station-state.json");

export type StationTrack = {
  videoId: string;
  title: string;
  artist?: string;
  durationSec?: number;
  requestCredit?: string | null;
  source: "playlist" | "jukebox" | "owner" | "vibe";
};

export type StationState = {
  revision: number;
  playlistId: string;
  rotation: PlaylistVideo[];
  rotationIndex: number;
  requestFlow: { anchorVideoId: string; vibeRemaining: number } | null;
  /** Tracks played since last request slot (target: 3 playlist, 1 request, repeat). */
  playlistTracksSinceRequest: number;
  current: StationTrack;
  trackStartedAt: string;
  isPlaying: boolean;
};

export type PublicStation = {
  revision: number;
  playlistId: string;
  current: StationTrack;
  offsetSeconds: number;
  upNext: string | null;
  requestCredit: string | null;
  isPlaying: boolean;
  listenerCount: number;
  listeners: Awaited<ReturnType<typeof getLiveListeners>>;
};

export type NowPlayingPayload = PublicStation & {
  serverTime: string;
  trackStartedAt: string;
  durationSec: number;
  nextVideoId: string | null;
  nextTitle: string | null;
  mode: StationMode;
};

const DEFAULT_TRACK_SECONDS = 240;
const REQUEST_TRACK_SECONDS = 180;
const MIN_VALID_DURATION_SECONDS = 15;

function trackDurationSec(track: StationTrack): number {
  const duration = track.durationSec;

  if (track.source === "jukebox" || track.source === "owner") {
    if (!duration || duration < MIN_VALID_DURATION_SECONDS) {
      return REQUEST_TRACK_SECONDS;
    }
    return duration;
  }

  if (!duration || duration <= 0) return DEFAULT_TRACK_SECONDS;
  if (duration < MIN_VALID_DURATION_SECONDS) return DEFAULT_TRACK_SECONDS;
  return duration;
}

let stationMutex: Promise<void> = Promise.resolve();

async function withStationMutex<T>(work: () => Promise<T>): Promise<T> {
  const next = stationMutex.then(work);
  stationMutex = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function toStationTrack(
  video: PlaylistVideo,
  source: StationTrack["source"] = "playlist",
  requestCredit?: string | null
): StationTrack {
  return {
    videoId: video.id,
    title: video.title,
    artist: video.channelTitle ?? "LeafLock FM",
    durationSec: video.durationSec,
    requestCredit: requestCredit ?? null,
    source
  };
}

function formatInjectCredit(inject: PlayerInject): string | null {
  if (inject.source !== "jukebox") return null;
  if (inject.instagram?.trim()) {
    return `@${inject.instagram.trim().replace(/^@/, "")}`;
  }
  return "a listener";
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadStationState(): Promise<StationState | null> {
  try {
    return JSON.parse(await fs.readFile(STATION_PATH, "utf8")) as StationState;
  } catch {
    return null;
  }
}

async function saveStationState(state: StationState) {
  await ensureDataDir();
  await fs.writeFile(STATION_PATH, JSON.stringify(state, null, 2), "utf8");
}

async function resolveActivePlaylistId(): Promise<string> {
  const control = await getStationControl();
  if (control.mode === "maintenance" || control.mode === "live_stream") {
    return control.defaultPlaylistId;
  }
  const config = await getFmPublicConfig();
  return control.activePlaylistId || config.playlistId || config.simplePlaylistId;
}

async function bootstrapStation(): Promise<StationState> {
  const playlistId = await resolveActivePlaylistId();
  const videos = await fetchPlaylistVideosFromYouTubeApi(playlistId);
  const rotation = createShuffledRotation(videos);
  const first = rotation[0] ?? videos[0];

  if (!first) {
    throw new Error("Playlist is empty — cannot start live room");
  }

  return {
    revision: 1,
    playlistId,
    rotation,
    rotationIndex: 0,
    requestFlow: null,
    playlistTracksSinceRequest: 0,
    current: toStationTrack(first),
    trackStartedAt: new Date().toISOString(),
    isPlaying: true
  };
}

function peekNextInRotation(state: StationState): PlaylistVideo | null {
  const nextIndex = state.rotationIndex + 1;
  if (nextIndex >= state.rotation.length) {
    state.rotation = state.rotation.concat(createShuffledRotation(state.rotation));
  }
  return state.rotation[nextIndex] ?? null;
}

const PLAYLIST_TRACKS_BEFORE_REQUEST = 3;

/** Preview the next track without advancing station or acknowledging jukebox injects. */
async function peekUpcomingTrack(state: StationState): Promise<StationTrack | null> {
  const control = await getStationControl();
  const requestDue =
    control.allowRequests && state.playlistTracksSinceRequest >= PLAYLIST_TRACKS_BEFORE_REQUEST;

  const inject = requestDue ? await peekPlayerInject() : null;
  if (inject) {
    return toStationTrack(
      {
        id: inject.videoId,
        title: inject.title,
        channelTitle: inject.source === "jukebox" ? "Jukebox" : "DJ queue"
      },
      inject.source === "jukebox" ? "jukebox" : "owner",
      formatInjectCredit(inject)
    );
  }

  if (state.requestFlow?.vibeRemaining) {
    const anchor =
      state.rotation.find((video) => video.id === state.requestFlow?.anchorVideoId) ??
      ({ id: state.requestFlow.anchorVideoId, title: "Requested track" } as PlaylistVideo);
    const vibe = pickVibeMatchFromPlaylist(state.rotation, anchor);
    if (vibe) {
      return toStationTrack(vibe, "vibe");
    }
  }

  const next = peekNextInRotation(state);
  return next ? toStationTrack(next) : null;
}

async function resolveNextStationTrack(state: StationState): Promise<{
  track: StationTrack;
  rotationIndex: number;
  requestFlow: StationState["requestFlow"];
  playlistTracksSinceRequest: number;
}> {
  const control = await getStationControl();
  const requestDue =
    control.allowRequests && state.playlistTracksSinceRequest >= PLAYLIST_TRACKS_BEFORE_REQUEST;

  const inject = requestDue ? await peekPlayerInject() : null;
  if (inject) {
    await acknowledgePlayerInject(inject);
    const track = toStationTrack(
      { id: inject.videoId, title: inject.title, channelTitle: inject.source === "jukebox" ? "Jukebox" : "DJ queue" },
      inject.source === "jukebox" ? "jukebox" : "owner",
      formatInjectCredit(inject)
    );
    return {
      track,
      rotationIndex: state.rotationIndex,
      requestFlow:
        inject.source === "jukebox"
          ? { anchorVideoId: inject.videoId, vibeRemaining: 1 }
          : null,
      playlistTracksSinceRequest: 0
    };
  }

  if (state.requestFlow?.vibeRemaining) {
    const anchor =
      state.rotation.find((video) => video.id === state.requestFlow?.anchorVideoId) ??
      ({ id: state.requestFlow.anchorVideoId, title: "Requested track" } as PlaylistVideo);
    const vibe = pickVibeMatchFromPlaylist(state.rotation, anchor);
    if (vibe) {
      return {
        track: toStationTrack(vibe, "vibe"),
        rotationIndex: state.rotationIndex,
        requestFlow: null,
        playlistTracksSinceRequest: state.playlistTracksSinceRequest
      };
    }
  }

  const nextIndex = state.rotationIndex + 1;
  if (nextIndex >= state.rotation.length) {
    state.rotation = state.rotation.concat(createShuffledRotation(state.rotation));
  }

  const next = state.rotation[nextIndex];
  if (!next) {
    return {
      track: state.current,
      rotationIndex: state.rotationIndex,
      requestFlow: null,
      playlistTracksSinceRequest: state.playlistTracksSinceRequest
    };
  }

  return {
    track: toStationTrack(next),
    rotationIndex: nextIndex,
    requestFlow: null,
    playlistTracksSinceRequest: state.playlistTracksSinceRequest + 1
  };
}

async function advanceStation(state: StationState): Promise<StationState> {
  const next = await resolveNextStationTrack(state);
  const upNext = peekNextInRotation({
    ...state,
    rotationIndex: next.rotationIndex,
    requestFlow: next.requestFlow
  });

  void upNext;

  return {
    ...state,
    revision: state.revision + 1,
    rotationIndex: next.rotationIndex,
    requestFlow: next.requestFlow,
    playlistTracksSinceRequest: next.playlistTracksSinceRequest,
    current: next.track,
    trackStartedAt: new Date().toISOString(),
    isPlaying: true
  };
}

export async function getPublicStation(): Promise<PublicStation> {
  return withStationMutex(async () => {
    let state = await loadStationState();
    const activePlaylistId = await resolveActivePlaylistId();

    if (!state) {
      state = await bootstrapStation();
      await saveStationState(state);
    }

    if (typeof state.playlistTracksSinceRequest !== "number") {
      state.playlistTracksSinceRequest = 0;
    }

    if (state.playlistId !== activePlaylistId) {
      state = await bootstrapStation();
      await saveStationState(state);
    }

    const control = await getStationControl();
    if (control.mode === "maintenance") {
      const listeners = await getLiveListeners();
      return {
        revision: state.revision,
        playlistId: state.playlistId,
        current: state.current,
        offsetSeconds: 0,
        upNext: null,
        requestCredit: null,
        isPlaying: false,
        listenerCount: listeners.length,
        listeners
      };
    }

    let guard = 0;
    while (guard < 2) {
      const elapsed =
        (Date.now() - new Date(state.trackStartedAt).getTime()) / 1000;
      const duration = trackDurationSec(state.current);

      if (elapsed < duration - 1) break;

      state = await advanceStation(state);
      await saveStationState(state);
      guard += 1;
    }

    const elapsed = (Date.now() - new Date(state.trackStartedAt).getTime()) / 1000;
    const duration = trackDurationSec(state.current);
    const peekState = { ...state };
    const upcoming = peekNextInRotation(peekState);

    const listeners = await getLiveListeners();

    return {
      revision: state.revision,
      playlistId: state.playlistId,
      current: state.current,
      offsetSeconds: Math.max(0, Math.min(elapsed, duration)),
      upNext: upcoming?.title ?? null,
      requestCredit: state.current.requestCredit ?? null,
      isPlaying: state.isPlaying,
      listenerCount: listeners.length,
      listeners
    };
  });
}

export async function resetLiveStation(): Promise<PublicStation> {
  const state = await bootstrapStation();
  await saveStationState(state);
  return getPublicStation();
}

/** Server-authoritative now playing — permanent station host timeline for all listeners. */
export async function getNowPlaying(): Promise<NowPlayingPayload> {
  const [station, control] = await Promise.all([getPublicStation(), getStationControl()]);
  const state = await loadStationState();
  const upcoming = state ? await peekUpcomingTrack(state) : null;

  return {
    ...station,
    serverTime: new Date().toISOString(),
    trackStartedAt: state?.trackStartedAt ?? new Date().toISOString(),
    durationSec: trackDurationSec(station.current),
    nextVideoId: upcoming?.videoId ?? null,
    nextTitle: upcoming?.title ?? station.upNext,
    mode: control.mode
  };
}