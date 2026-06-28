import fs from "fs/promises";
import path from "path";
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

function trackDurationSec(track: StationTrack): number {
  if (track.durationSec && track.durationSec > 0) return track.durationSec;
  return 240;
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

async function bootstrapStation(): Promise<StationState> {
  const config = await getFmPublicConfig();
  const playlistId = config.simplePlaylistId || config.playlistId;
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

async function resolveNextStationTrack(state: StationState): Promise<{
  track: StationTrack;
  rotationIndex: number;
  requestFlow: StationState["requestFlow"];
}> {
  const inject = await peekPlayerInject();
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
          : null
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
        requestFlow: null
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
      requestFlow: null
    };
  }

  return {
    track: toStationTrack(next),
    rotationIndex: nextIndex,
    requestFlow: null
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
    current: next.track,
    trackStartedAt: new Date().toISOString(),
    isPlaying: true
  };
}

export async function getPublicStation(): Promise<PublicStation> {
  let state = await loadStationState();
  const config = await getFmPublicConfig();
  const activePlaylistId = config.simplePlaylistId || config.playlistId;

  if (!state) {
    state = await bootstrapStation();
    await saveStationState(state);
  }

  if (state.playlistId !== activePlaylistId) {
    state = await bootstrapStation();
    await saveStationState(state);
  }

  let guard = 0;
  while (guard < 4) {
    const elapsed =
      (Date.now() - new Date(state.trackStartedAt).getTime()) / 1000;
    const duration = trackDurationSec(state.current);

    if (elapsed < duration - 0.35) break;

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
}

export async function resetLiveStation(): Promise<PublicStation> {
  const state = await bootstrapStation();
  await saveStationState(state);
  return getPublicStation();
}