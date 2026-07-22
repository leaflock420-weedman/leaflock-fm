"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Disc3,
  Loader2,
  MonitorPlay,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from "lucide-react";
import LoveButton from "@/components/LoveButton";
import LeafLockLogo from "@/components/LeafLockLogo";
import {
  BLEND_POLL_INTERVAL_MS,
  TOTAL_BLEND_MS,
  computeBlendLeadSeconds,
  resolveTrackDuration,
  runDjCrossfade,
  shouldStartBlend
} from "@/lib/dj-blend";
import { pickPlaylistId, type FmPlayerMode } from "@/lib/fm-player-config";
import {
  createShuffledRotation,
  pickVibeMatchFromPlaylist,
  savePlayHistory,
  type PlaylistVideo
} from "@/lib/youtube-playlist";

type PlayerInject = {
  source: "owner" | "jukebox";
  id: string;
  videoId: string;
  title: string;
  instagram?: string;
};

type RequestFlowContext = {
  anchorVideo: PlaylistVideo;
  vibeSongsRemaining: number;
};

type DeckId = "a" | "b";

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  getVideoData: () => { title: string; author: string; video_id: string };
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
  setSize: (width: number, height: number) => void;
};

type YTNamespace = {
  Player: new (
    element: string | HTMLElement,
    options: {
      height?: string;
      width?: string;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
        onError?: (event: { data: number; target: YTPlayer }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
  };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const BLEND_ENABLED_KEY = "leaflock-dj-blend-enabled";
const SHOW_VIDEO_KEY = "leaflock-show-video";
const LIVE_PLAYING_KEY = "leaflock-live-was-playing";

function persistLivePlaying(playing: boolean) {
  try {
    if (playing) {
      window.sessionStorage.setItem(LIVE_PLAYING_KEY, "1");
    } else {
      window.sessionStorage.removeItem(LIVE_PLAYING_KEY);
    }
  } catch {
    // Ignore storage errors.
  }
}

function readLiveWasPlaying() {
  try {
    return window.sessionStorage.getItem(LIVE_PLAYING_KEY) === "1";
  } catch {
    return false;
  }
}

function loadYouTubeApi(): Promise<YTNamespace> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const resolveIfReady = () => {
      if (window.YT?.Player) {
        finish(() => resolve(window.YT as YTNamespace));
        return true;
      }
      return false;
    };

    const existing = document.getElementById("youtube-iframe-api");
    if (!existing) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () =>
        finish(() => reject(new Error("Failed to load YouTube player API")));
      document.body.appendChild(script);
    } else if (resolveIfReady()) {
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolveIfReady();
    };

    const poll = window.setInterval(() => {
      if (resolveIfReady()) {
        window.clearInterval(poll);
      }
    }, 100);

    window.setTimeout(() => {
      window.clearInterval(poll);
      if (!settled) {
        if (!resolveIfReady()) {
          finish(() =>
            reject(new Error("Failed to load YouTube player API"))
          );
        }
      }
    }, 20000);
  });
}

async function fetchLiveStation(): Promise<PublicStationPayload> {
  const primary = await fetch("/api/fm/now-playing", { cache: "no-store" });
  if (primary.ok) {
    return (await primary.json()) as PublicStationPayload;
  }

  const fallback = await fetch("/api/fm/station", { cache: "no-store" });
  if (!fallback.ok) {
    throw new Error("Live station unavailable");
  }

  return (await fallback.json()) as PublicStationPayload;
}

/** YouTube requires a usable player size; 2x2 embeds often fail with onError. */
const YT_MIN_SIZE = 200;

function createPlayerVars(playlistId?: string | null): Record<string, string | number> {
  const playerVars: Record<string, string | number> = {
    autoplay: 0,
    controls: 0,
    disablekb: 1,
    enablejsapi: 1,
    fs: 0,
    modestbranding: 1,
    rel: 0,
    playsinline: 1,
    iv_load_policy: 3
  };

  if (playlistId) {
    playerVars.listType = "playlist";
    playerVars.list = playlistId;
  }

  // Do not set origin here — wrong/mismatched origin breaks postMessage control
  // on mobile and shows "target origin does not match" failures.

  return playerVars;
}

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function mediaOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function youtubeArtwork(videoId: string | null): MediaImage[] {
  const origin = mediaOrigin();
  const fallback = origin ? `${origin}/leaflock-logo.png` : "/leaflock-logo.png";
  if (!videoId) {
    return [
      { src: fallback, sizes: "96x96", type: "image/png" },
      { src: fallback, sizes: "128x128", type: "image/png" },
      { src: fallback, sizes: "192x192", type: "image/png" },
      { src: fallback, sizes: "512x512", type: "image/png" }
    ];
  }

  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return [
    { src: thumb, sizes: "96x96", type: "image/jpeg" },
    { src: thumb, sizes: "128x128", type: "image/jpeg" },
    { src: thumb, sizes: "192x192", type: "image/jpeg" },
    { src: thumb, sizes: "480x360", type: "image/jpeg" },
    { src: fallback, sizes: "512x512", type: "image/png" }
  ];
}

export type ListenMode = "live" | "solo";

type LeafLockPlayerProps = {
  /** simple = main song playlist only, no schedule switching */
  mode?: FmPlayerMode;
  listenMode?: ListenMode;
  subtitle?: string;
  hideLogo?: boolean;
};

type PublicStationPayload = {
  revision: number;
  current: {
    videoId: string;
    title: string;
    artist?: string;
    durationSec?: number;
    requestCredit?: string | null;
  };
  offsetSeconds: number;
  currentOffsetSeconds?: number;
  upNext: string | null;
  requestCredit: string | null;
  listenerCount?: number;
  nextVideoId?: string | null;
  nextTitle?: string | null;
  trackStartedAt?: string;
  serverTime?: string;
  durationSec?: number;
  hostName?: string;
  hostStatus?: "online" | "offline";
  thumbnail?: string | null;
  activePlaylist?: string;
};

export default function LeafLockPlayer({
  mode = "simple",
  listenMode = "solo",
  subtitle,
  hideLogo = false
}: LeafLockPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(85);
  const [nowPlaying, setNowPlaying] = useState({
    title: "LeafLock FM 104.2 ΓÇö Shuffle",
    artist: "Loading playlist..."
  });
  const [upNext, setUpNext] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isBlending, setIsBlending] = useState(false);
  const [playlistCount, setPlaylistCount] = useState(0);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [playlistReady, setPlaylistReady] = useState(false);
  const [canGoPrevious, setCanGoPrevious] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [djBlendEnabled, setDjBlendEnabled] = useState(true);
  const [playersReady, setPlayersReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [controlsOffscreen, setControlsOffscreen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [activeDeck, setActiveDeck] = useState<DeckId>("a");
  const [requestCredit, setRequestCredit] = useState<string | null>(null);
  const [liveRoomLabel, setLiveRoomLabel] = useState<string | null>(null);

  const controlsRef = useRef<HTMLDivElement | null>(null);
  const videoShellRef = useRef<HTMLDivElement | null>(null);
  const mediaBridgeRef = useRef<HTMLAudioElement | null>(null);
  const playersRef = useRef<Record<DeckId, YTPlayer | null>>({ a: null, b: null });
  const playersReadyRef = useRef<Record<DeckId, boolean>>({ a: false, b: false });
  const playerInitRef = useRef(false);
  const playlistRef = useRef<PlaylistVideo[]>([]);
  const sessionQueueRef = useRef<PlaylistVideo[]>([]);
  const sessionIndexRef = useRef(-1);
  const currentVideoIdRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  const activeDeckRef = useRef<DeckId>("a");
  const blendInProgressRef = useRef(false);
  const blendEnabledRef = useRef(true);
  const volumeRef = useRef(85);
  const cancelCrossfadeRef = useRef<(() => void) | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const blendFallbackTimerRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);
  const deckVideoIdRef = useRef<Record<DeckId, string | null>>({ a: null, b: null });
  const playerHostARef = useRef<HTMLDivElement | null>(null);
  const playerHostBRef = useRef<HTMLDivElement | null>(null);
  const playlistSetRef = useRef<Set<string>>(new Set());
  const playlistIdRef = useRef<string | null>(null);
  const rotationQueueRef = useRef<PlaylistVideo[]>([]);
  const rotationIndexRef = useRef(-1);
  const prefetchedNextRef = useRef<PlaylistVideo | null>(null);
  const pendingInjectRef = useRef<PlayerInject | null>(null);
  const requestFlowRef = useRef<RequestFlowContext | null>(null);
  const outsidePlaylistAllowedRef = useRef<string | null>(null);
  const stationRevisionRef = useRef(-1);
  const stationEndedAtRef = useRef(0);
  const listenModeRef = useRef(listenMode);
  const userPlaybackIntentRef = useRef<"playing" | "paused" | "stopped">("stopped");
  const liveStationJoinedRef = useRef(false);

  const syncPreviousState = useCallback(() => {
    setCanGoPrevious(sessionIndexRef.current > 0);
  }, []);

  const getDeckPlayer = useCallback((deck: DeckId) => playersRef.current[deck], []);

  const getActivePlayer = useCallback(
    () => playersRef.current[activeDeckRef.current],
    []
  );

  const getInactiveDeck = useCallback((): DeckId => {
    return activeDeckRef.current === "a" ? "b" : "a";
  }, []);

  const getCurrentSessionTrack = useCallback((): PlaylistVideo | null => {
    if (sessionIndexRef.current < 0) return null;
    return sessionQueueRef.current[sessionIndexRef.current] ?? null;
  }, []);

  const ensureRotationQueue = useCallback(() => {
    if (rotationQueueRef.current.length === 0) {
      rotationQueueRef.current = createShuffledRotation(playlistRef.current);
    }
  }, []);

  const extendRotationQueue = useCallback(() => {
    rotationQueueRef.current = rotationQueueRef.current.concat(
      createShuffledRotation(playlistRef.current)
    );
  }, []);

  const peekNextInRotation = useCallback((): PlaylistVideo | null => {
    ensureRotationQueue();
    const nextIndex = rotationIndexRef.current + 1;
    if (nextIndex >= rotationQueueRef.current.length) {
      extendRotationQueue();
    }
    return rotationQueueRef.current[nextIndex] ?? null;
  }, [ensureRotationQueue, extendRotationQueue]);

  const advanceRotation = useCallback((): PlaylistVideo | null => {
    const next = peekNextInRotation();
    if (next) {
      rotationIndexRef.current += 1;
    }
    return next;
  }, [peekNextInRotation]);

  const acknowledgeInject = useCallback((inject: PlayerInject) => {
    void fetch("/api/fm/player-inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack", inject })
    });
  }, []);

  const injectToVideo = useCallback((inject: PlayerInject): PlaylistVideo => {
    outsidePlaylistAllowedRef.current = inject.videoId;
    return {
      id: inject.videoId,
      title: inject.title,
      channelTitle: inject.source === "jukebox" ? "Jukebox" : "DJ queue"
    };
  }, []);

  const formatRequestCredit = useCallback((inject: PlayerInject) => {
    if (inject.source !== "jukebox") return null;
    if (inject.instagram?.trim()) {
      return `@${inject.instagram.trim().replace(/^@/, "")}`;
    }
    return "a listener";
  }, []);

  const peekNextScheduledTrack = useCallback((): PlaylistVideo | null => {
    const inject = pendingInjectRef.current;
    if (inject) {
      return injectToVideo(inject);
    }

    if (requestFlowRef.current?.vibeSongsRemaining) {
      return pickVibeMatchFromPlaylist(
        playlistRef.current,
        requestFlowRef.current.anchorVideo
      );
    }

    return peekNextInRotation();
  }, [injectToVideo, peekNextInRotation]);

  const resolveNextTrack = useCallback((): PlaylistVideo | null => {
    const inject = pendingInjectRef.current;
    if (inject) {
      pendingInjectRef.current = null;
      acknowledgeInject(inject);
      const video = injectToVideo(inject);
      setRequestCredit(formatRequestCredit(inject));
      requestFlowRef.current = {
        anchorVideo: video,
        vibeSongsRemaining: 1
      };
      return video;
    }

    if (requestFlowRef.current?.vibeSongsRemaining) {
      const anchor = requestFlowRef.current.anchorVideo;
      requestFlowRef.current = null;
      setRequestCredit(null);
      const vibeTrack = pickVibeMatchFromPlaylist(playlistRef.current, anchor);
      if (vibeTrack) return vibeTrack;
    } else {
      setRequestCredit(null);
    }

    return advanceRotation();
  }, [acknowledgeInject, advanceRotation, formatRequestCredit, injectToVideo]);

  const refreshUpNextLabel = useCallback(
    (next?: PlaylistVideo | null) => {
      const inject = pendingInjectRef.current;
      if (inject) {
        const credit = formatRequestCredit(inject);
        setUpNext(
          credit
            ? `${inject.title} ΓÇö requested by ${credit}`
            : `${inject.title} (request)`
        );
        return;
      }

      if (requestFlowRef.current?.vibeSongsRemaining) {
        const vibe = pickVibeMatchFromPlaylist(
          playlistRef.current,
          requestFlowRef.current.anchorVideo
        );
        setUpNext(vibe ? `${vibe.title} (keeping the vibe)` : null);
        return;
      }

      const upcoming = next ?? peekNextInRotation();
      setUpNext(upcoming?.title ?? null);
    },
    [formatRequestCredit, peekNextInRotation]
  );

  const resetPlaybackProgress = useCallback(() => {
    isSeekingRef.current = false;
    setIsSeeking(false);
    setCurrentTime(0);
    setDuration(0);
    setScrubTime(0);
  }, []);

  const setTrackUi = useCallback((video: PlaylistVideo, artist = "LeafLock FM") => {
    if (playlistSetRef.current.has(video.id)) {
      outsidePlaylistAllowedRef.current = null;
    }
    currentVideoIdRef.current = video.id;
    setCurrentTrackId(video.id);
    setNowPlaying({ title: video.title, artist });
    bindMediaSessionRef.current();
    updateMediaSessionRef.current(isPlayingRef.current);
  }, []);

  const syncMediaSessionPosition = useCallback((time: number, total: number) => {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) {
      return;
    }

    const safeTotal = Number.isFinite(total) && total > 0 ? total : 300;
    const safeTime = Number.isFinite(time) && time >= 0 ? Math.min(time, safeTotal) : 0;

    try {
      navigator.mediaSession.setPositionState({
        duration: safeTotal,
        playbackRate: 1,
        position: safeTime
      });
    } catch {
      // Optional on some browsers.
    }
  }, []);

  const syncMediaBridge = useCallback(async (playing: boolean) => {
    const bridge = mediaBridgeRef.current;
    if (!bridge) return;

    bridge.volume = 0.001;
    bridge.muted = false;

    if (playing) {
      try {
        await bridge.play();
      } catch {
        // Bridge play can fail before a user gesture; retry on next play tap.
      }
    } else {
      bridge.pause();
    }
  }, []);

  const syncPlaybackProgress = useCallback(() => {
    const player = getActivePlayer();
    if (!player || !currentVideoIdRef.current || blendInProgressRef.current || isSeekingRef.current) {
      return;
    }

    try {
      const time = player.getCurrentTime();
      const total = resolveTrackDuration(
        player.getDuration(),
        getCurrentSessionTrack()?.durationSec
      );

      if (Number.isFinite(time) && time >= 0) {
        setCurrentTime(time);
      }

      if (Number.isFinite(total) && total > 0) {
        setDuration(total);
      }

      if (Number.isFinite(time) && Number.isFinite(total) && total > 0) {
        syncMediaSessionPosition(time, total);
      }
    } catch {
      // Player may not expose timing yet.
    }
  }, [getActivePlayer, getCurrentSessionTrack, syncMediaSessionPosition]);

  const updateNowPlayingFromActiveDeck = useCallback(() => {
    const player = getActivePlayer();
    if (!player) return;

    try {
      const data = player.getVideoData();
      if (!data.video_id) return;
      setTrackUi(
        { id: data.video_id, title: data.title || "Now playing" },
        data.author || "LeafLock FM"
      );
    } catch {
      // Player not ready yet.
    }
  }, [getActivePlayer, setTrackUi]);

  const stopTimePolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const clearBlendFallbackTimer = useCallback(() => {
    if (blendFallbackTimerRef.current !== null) {
      window.clearTimeout(blendFallbackTimerRef.current);
      blendFallbackTimerRef.current = null;
    }
  }, []);

  const cancelActiveCrossfade = useCallback(() => {
    cancelCrossfadeRef.current?.();
    cancelCrossfadeRef.current = null;
    clearBlendFallbackTimer();
    blendInProgressRef.current = false;
    setIsBlending(false);
  }, [clearBlendFallbackTimer]);

  const startIncomingPlayback = useCallback(
    (incoming: YTPlayer, incomingDeck: DeckId, video: PlaylistVideo) => {
      const cuedId = deckVideoIdRef.current[incomingDeck];
      const shouldPlay = userPlaybackIntentRef.current === "playing";

      try {
        if (cuedId === video.id) {
          if (shouldPlay) {
            incoming.seekTo(0, true);
          }
        } else if (shouldPlay) {
          incoming.loadVideoById(video.id);
          deckVideoIdRef.current[incomingDeck] = video.id;
        } else {
          incoming.cueVideoById(video.id);
          deckVideoIdRef.current[incomingDeck] = video.id;
        }
      } catch {
        if (shouldPlay) {
          incoming.loadVideoById(video.id);
        } else {
          incoming.cueVideoById(video.id);
        }
        deckVideoIdRef.current[incomingDeck] = video.id;
      }

      incoming.unMute();
      incoming.setVolume(0);
      if (shouldPlay) {
        incoming.playVideo();
      }
    },
    []
  );

  const applyDeckVolume = useCallback((deck: DeckId, gain: number) => {
    const player = getDeckPlayer(deck);
    if (!player || !playersReadyRef.current[deck]) return;
    const scaled = Math.round(volumeRef.current * Math.min(1, Math.max(0, gain)));
    player.setVolume(scaled);
    if (scaled > 0 && volumeRef.current > 0) {
      player.unMute();
    }
  }, [getDeckPlayer]);

  const queueNextTrack = useCallback(
    (video: PlaylistVideo) => {
      if (sessionIndexRef.current < sessionQueueRef.current.length - 1) {
        sessionQueueRef.current = sessionQueueRef.current.slice(0, sessionIndexRef.current + 1);
      }
      sessionQueueRef.current.push(video);
      sessionIndexRef.current = sessionQueueRef.current.length - 1;
      syncPreviousState();
    },
    [syncPreviousState]
  );

  const prefetchOnInactiveDeck = useCallback(
    (video: PlaylistVideo) => {
      const deck = getInactiveDeck();
      const player = getDeckPlayer(deck);
      if (!player || !playersReadyRef.current[deck]) return;
      player.cueVideoById(video.id);
      deckVideoIdRef.current[deck] = video.id;
      prefetchedNextRef.current = video;
      refreshUpNextLabel(video);
    },
    [getDeckPlayer, getInactiveDeck, refreshUpNextLabel]
  );

  const finishBlendRef = useRef<
    (outgoing: YTPlayer, outgoingDeck: DeckId, incomingDeck: DeckId, video: PlaylistVideo) => void
  >(() => {});

  const finishBlend = useCallback(
    (outgoing: YTPlayer, outgoingDeck: DeckId, incomingDeck: DeckId, video: PlaylistVideo) => {
      if (!blendInProgressRef.current) return;

      clearBlendFallbackTimer();
      cancelCrossfadeRef.current?.();
      cancelCrossfadeRef.current = null;
      outgoing.pauseVideo();
      outgoing.setVolume(0);
      applyDeckVolume(incomingDeck, 1);

      activeDeckRef.current = incomingDeck;
      setActiveDeck(incomingDeck);
      blendInProgressRef.current = false;
      setIsBlending(false);
      setIsBuffering(false);
      const shouldPlay = userPlaybackIntentRef.current === "playing";
      isPlayingRef.current = shouldPlay;
      setIsPlaying(shouldPlay);
      setIsConnected(shouldPlay);
      if (!shouldPlay) {
        getDeckPlayer(incomingDeck)?.pauseVideo();
        stopTimePollingRef.current();
      }
      resetPlaybackProgress();
      setTrackUi(video);
      updateNowPlayingFromActiveDeck();
      if (shouldPlay) {
        startTimePollingRef.current();
      }
      updateMediaSessionRef.current(shouldPlay);

      const upcoming = peekNextScheduledTrack();
      if (upcoming) {
        prefetchOnInactiveDeck(upcoming);
      } else {
        refreshUpNextLabel(null);
      }
    },
    [
      applyDeckVolume,
      clearBlendFallbackTimer,
      getDeckPlayer,
      peekNextScheduledTrack,
      prefetchOnInactiveDeck,
      refreshUpNextLabel,
      resetPlaybackProgress,
      setTrackUi,
      updateNowPlayingFromActiveDeck
    ]
  );

  useEffect(() => {
    finishBlendRef.current = finishBlend;
  }, [finishBlend]);

  const beginBlendToVideo = useCallback(
    (video: PlaylistVideo, options?: { recordHistory?: boolean }) => {
      if (blendInProgressRef.current) return false;

      const outgoingDeck = activeDeckRef.current;
      const incomingDeck = getInactiveDeck();
      const outgoing = getDeckPlayer(outgoingDeck);
      const incoming = getDeckPlayer(incomingDeck);

      if (!outgoing || !incoming || !playersReadyRef.current[outgoingDeck] || !playersReadyRef.current[incomingDeck]) {
        return false;
      }

      const { recordHistory = true } = options ?? {};

      blendInProgressRef.current = true;
      setIsBlending(true);
      setIsBuffering(true);
      setPlaybackError(null);
      queueNextTrack(video);
      setTrackUi(video, "Blending in...");
      setUpNext(null);

      if (recordHistory) {
        savePlayHistory(video.id);
      }

      startIncomingPlayback(incoming, incomingDeck, video);

      clearBlendFallbackTimer();
      blendFallbackTimerRef.current = window.setTimeout(() => {
        if (!blendInProgressRef.current) return;

        const YT = window.YT;
        const state = incoming.getPlayerState?.();
        const isIncomingLive =
          state === YT?.PlayerState.PLAYING || state === YT?.PlayerState.BUFFERING;

        if (!isIncomingLive) {
          cancelCrossfadeRef.current?.();
          cancelCrossfadeRef.current = null;
          startIncomingPlayback(incoming, incomingDeck, video);
          finishBlendRef.current(outgoing, outgoingDeck, incomingDeck, video);
        }
      }, 2800);

      cancelCrossfadeRef.current?.();
      cancelCrossfadeRef.current = runDjCrossfade({
        durationMs: TOTAL_BLEND_MS,
        masterVolume: volumeRef.current,
        onStep: (outgoingGain, incomingGain) => {
          applyDeckVolume(outgoingDeck, outgoingGain);
          applyDeckVolume(incomingDeck, incomingGain);
        },
        onComplete: () => {
          finishBlendRef.current(outgoing, outgoingDeck, incomingDeck, video);
        }
      });

      return true;
    },
    [
      applyDeckVolume,
      clearBlendFallbackTimer,
      getDeckPlayer,
      getInactiveDeck,
      queueNextTrack,
      setTrackUi,
      startIncomingPlayback
    ]
  );

  const playInstantOnActiveDeck = useCallback(
    (
      video: PlaylistVideo,
      options?: { recordHistory?: boolean; forcePlay?: boolean }
    ) => {
      cancelActiveCrossfade();
      const deck = activeDeckRef.current;
      const player = getDeckPlayer(deck);
      if (!player || !playersReadyRef.current[deck]) return false;

      const { recordHistory = true, forcePlay = false } = options ?? {};
      const shouldPlay = forcePlay || userPlaybackIntentRef.current === "playing";

      setPlaybackError(null);
      setIsBuffering(shouldPlay);
      resetPlaybackProgress();
      setTrackUi(video);
      if (shouldPlay) {
        player.loadVideoById(video.id);
        deckVideoIdRef.current[deck] = video.id;
        player.playVideo();
        applyDeckVolume(deck, 1);
        isPlayingRef.current = true;
        setIsPlaying(true);
        setIsConnected(true);
      } else {
        player.cueVideoById(video.id);
        deckVideoIdRef.current[deck] = video.id;
        isPlayingRef.current = false;
        setIsPlaying(false);
      }

      if (recordHistory) {
        savePlayHistory(video.id);
      }

      const upcoming = peekNextScheduledTrack();
      if (upcoming) {
        prefetchOnInactiveDeck(upcoming);
      } else {
        refreshUpNextLabel(null);
      }

      return true;
    },
    [
      applyDeckVolume,
      cancelActiveCrossfade,
      getDeckPlayer,
      peekNextScheduledTrack,
      prefetchOnInactiveDeck,
      refreshUpNextLabel,
      resetPlaybackProgress,
      setTrackUi
    ]
  );

  const playNextTrackFromGesture = useCallback(() => {
    const next = resolveNextTrack();
    if (!next) {
      setPlaybackError("Playlist is empty.");
      setIsPlaying(false);
      setIsConnected(false);
      return false;
    }

    const shouldPlay = userPlaybackIntentRef.current === "playing";

    if (blendEnabledRef.current && shouldPlay && isPlayingRef.current) {
      return beginBlendToVideo(next);
    }

    queueNextTrack(next);
    return playInstantOnActiveDeck(next, { forcePlay: shouldPlay });
  }, [beginBlendToVideo, playInstantOnActiveDeck, queueNextTrack, resolveNextTrack]);

  const playNextTrackAuto = useCallback(() => {
    if (userPlaybackIntentRef.current !== "playing") {
      return;
    }

    const next = resolveNextTrack();
    if (!next) {
      setPlaybackError("Playlist is empty.");
      setIsPlaying(false);
      setIsConnected(false);
      return;
    }

    if (blendEnabledRef.current) {
      beginBlendToVideo(next);
      return;
    }

    queueNextTrack(next);
    playInstantOnActiveDeck(next);

    if (isMobile) {
      window.setTimeout(() => {
        if (!getActivePlayer() || isPlayingRef.current) return;
        setPlaybackError("Tap play to continue on phone.");
      }, 1200);
    }
  }, [beginBlendToVideo, getActivePlayer, isMobile, playInstantOnActiveDeck, queueNextTrack, resolveNextTrack]);

  const playPreviousTrackFromGesture = useCallback(() => {
    if (sessionIndexRef.current <= 0) return false;

    cancelActiveCrossfade();
    sessionIndexRef.current -= 1;
    const previous = sessionQueueRef.current[sessionIndexRef.current];
    syncPreviousState();
    return playInstantOnActiveDeck(previous, { recordHistory: false });
  }, [cancelActiveCrossfade, playInstantOnActiveDeck, syncPreviousState]);

  const checkForUpcomingBlend = useCallback(() => {
    if (listenModeRef.current === "live") return;
    if (userPlaybackIntentRef.current !== "playing") return;
    if (!blendEnabledRef.current || blendInProgressRef.current || !isPlayingRef.current) return;

    const player = getActivePlayer();
    const deck = activeDeckRef.current;
    if (!player || !playersReadyRef.current[deck]) return;

    try {
      const currentTime = player.getCurrentTime();
      const currentTrack = getCurrentSessionTrack();
      const duration = resolveTrackDuration(player.getDuration(), currentTrack?.durationSec);
      const leadSeconds = computeBlendLeadSeconds(duration);

      if (!shouldStartBlend(currentTime, duration, leadSeconds, blendInProgressRef.current)) {
        return;
      }

      const next = resolveNextTrack();
      if (!next) return;

      beginBlendToVideo(next);
    } catch {
      // Player may not expose timing yet.
    }
  }, [beginBlendToVideo, getActivePlayer, getCurrentSessionTrack, resolveNextTrack]);

  const startTimePolling = useCallback(() => {
    stopTimePolling();
    pollIntervalRef.current = window.setInterval(() => {
      syncPlaybackProgress();
      checkForUpcomingBlend();
    }, BLEND_POLL_INTERVAL_MS);
  }, [checkForUpcomingBlend, stopTimePolling, syncPlaybackProgress]);

  const playNextTrackAutoRef = useRef(playNextTrackAuto);
  const updateNowPlayingRef = useRef(updateNowPlayingFromActiveDeck);
  const syncPlaybackProgressRef = useRef(syncPlaybackProgress);
  const prefetchOnInactiveDeckRef = useRef(prefetchOnInactiveDeck);
  const peekNextScheduledTrackRef = useRef(peekNextScheduledTrack);
  const applyLiveStationTrackRef = useRef<
    (
      station: PublicStationPayload,
      options?: { forceReload?: boolean; resumePlayback?: boolean; initialCue?: boolean }
    ) => void
  >(() => {});
  const startTimePollingRef = useRef(startTimePolling);
  const stopTimePollingRef = useRef(stopTimePolling);

  useEffect(() => {
    playNextTrackAutoRef.current = playNextTrackAuto;
    updateNowPlayingRef.current = updateNowPlayingFromActiveDeck;
    syncPlaybackProgressRef.current = syncPlaybackProgress;
    prefetchOnInactiveDeckRef.current = prefetchOnInactiveDeck;
    peekNextScheduledTrackRef.current = peekNextScheduledTrack;
    startTimePollingRef.current = startTimePolling;
    stopTimePollingRef.current = stopTimePolling;
  }, [
    playNextTrackAuto,
    peekNextScheduledTrack,
    prefetchOnInactiveDeck,
    startTimePolling,
    stopTimePolling,
    syncPlaybackProgress,
    updateNowPlayingFromActiveDeck
  ]);

  useEffect(() => {
    blendEnabledRef.current = djBlendEnabled;
  }, [djBlendEnabled]);

  useEffect(() => {
    listenModeRef.current = listenMode;
    if (listenMode === "live") {
      setLiveRoomLabel("DJ420 is hosting");
      stationRevisionRef.current = -1;
      liveStationJoinedRef.current = false;
    } else {
      setLiveRoomLabel(null);
      liveStationJoinedRef.current = false;
    }
  }, [listenMode]);

  useEffect(() => {
    volumeRef.current = volume;
    if (!blendInProgressRef.current) {
      applyDeckVolume(activeDeckRef.current, 1);
    }
  }, [applyDeckVolume, volume]);

  const resizePlayerHosts = useCallback(() => {
    const shell = videoShellRef.current;
    const fullWidth =
      showVideo && shell && shell.clientWidth > 0 ? shell.clientWidth : YT_MIN_SIZE;
    const fullHeight =
      showVideo && shell && shell.clientHeight > 0 ? shell.clientHeight : YT_MIN_SIZE;

    (["a", "b"] as DeckId[]).forEach((deck) => {
      const player = playersRef.current[deck];
      if (!player) return;

      const isActive = deck === activeDeckRef.current;
      // Keep non-visible decks at minimum legal size so embeds stay valid.
      const width = showVideo && isActive ? fullWidth : YT_MIN_SIZE;
      const height = showVideo && isActive ? fullHeight : YT_MIN_SIZE;
      try {
        player.setSize(width, height);
      } catch {
        // Player may not support setSize yet.
      }
    });
  }, [showVideo]);

  useEffect(() => {
    if (!playersReady) return;
    resizePlayerHosts();
    if (!showVideo) return;
    const timerId = window.setTimeout(() => {
      resizePlayerHosts();
    }, 120);
    return () => window.clearTimeout(timerId);
  }, [playersReady, resizePlayerHosts, showVideo, activeDeck, isBlending]);

  useEffect(() => {
    if (!showVideo) return;

    const shell = videoShellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      resizePlayerHosts();
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [showVideo, resizePlayerHosts]);

  const applyLiveStationTrack = useCallback(
    (
      station: PublicStationPayload,
      options?: { forceReload?: boolean; resumePlayback?: boolean; initialCue?: boolean }
    ) => {
      const player = getActivePlayer();
      if (!player || !playersReadyRef.current[activeDeckRef.current]) return;

      const track = station.current;
      const deck = activeDeckRef.current;
      const videoChanged = currentVideoIdRef.current !== track.videoId;
      const revisionChanged = station.revision !== stationRevisionRef.current;
      const shouldReload =
        Boolean(options?.forceReload) ||
        revisionChanged ||
        videoChanged ||
        deckVideoIdRef.current[deck] !== track.videoId;

      setRequestCredit(station.requestCredit);
      setUpNext(station.upNext ?? station.nextTitle ?? null);
      setLiveRoomLabel(
        station.hostStatus === "online"
          ? station.listenerCount && station.listenerCount > 0
            ? `DJ420 is hosting ΓÇö ${station.listenerCount} listening`
            : "DJ420 is hosting"
          : "Station host reconnecting"
      );

      if (!revisionChanged && !videoChanged && !options?.resumePlayback && !options?.initialCue) {
        return;
      }

      stationRevisionRef.current = station.revision;
      outsidePlaylistAllowedRef.current = track.videoId;
      liveStationJoinedRef.current = true;

      const video: PlaylistVideo = {
        id: track.videoId,
        title: track.title,
        channelTitle: track.artist,
        durationSec: track.durationSec ?? station.durationSec
      };

      setTrackUi(video, track.artist ?? "LeafLock FM");

      const resumeAt = Math.max(0, station.currentOffsetSeconds ?? station.offsetSeconds);
      const shouldPlay =
        Boolean(options?.resumePlayback) ||
        userPlaybackIntentRef.current === "playing";

      const startPlayback = () => {
        try {
          if (!shouldPlay || options?.initialCue) {
            isPlayingRef.current = false;
            setIsPlaying(false);
            setIsConnected(true);
            setIsBuffering(false);
            updateMediaSessionRef.current(false);
            return;
          }
          if (resumeAt > 0.5) {
            try {
              player.seekTo(resumeAt, true);
            } catch {
              // ignore
            }
          }
          player.playVideo();
          isPlayingRef.current = true;
          setIsPlaying(true);
          setIsConnected(true);
          setIsBuffering(false);
          applyDeckVolume(deck, 1);
          startTimePollingRef.current();
          updateMediaSessionRef.current(true);
        } catch {
          // Player may not be ready yet.
        }
      };

      if (station.nextVideoId) {
        prefetchOnInactiveDeck({
          id: station.nextVideoId,
          title: station.nextTitle ?? "Up next",
          channelTitle: "LeafLock FM"
        });
      }

      if (shouldReload) {
        deckVideoIdRef.current[deck] = track.videoId;
        // Only load+play when the user wants audio. Otherwise cue only —
        // loadVideoById while idle causes perpetual BUFFERING and disables Play.
        if (shouldPlay && !options?.initialCue) {
          try {
            (
              player as YTPlayer & {
                loadVideoById: (opts: string | { videoId: string; startSeconds?: number }) => void;
              }
            ).loadVideoById({
              videoId: track.videoId,
              startSeconds: resumeAt
            });
          } catch {
            player.loadVideoById(track.videoId);
          }
          window.setTimeout(startPlayback, 400);
        } else {
          try {
            (
              player as YTPlayer & {
                cueVideoById: (opts: string | { videoId: string; startSeconds?: number }) => void;
              }
            ).cueVideoById({
              videoId: track.videoId,
              startSeconds: resumeAt
            });
          } catch {
            player.cueVideoById(track.videoId);
          }
          window.setTimeout(startPlayback, 120);
        }
      } else {
        startPlayback();
      }

      window.setTimeout(() => resizePlayerHosts(), 50);
    },
    [applyDeckVolume, getActivePlayer, prefetchOnInactiveDeck, resizePlayerHosts, setTrackUi]
  );

  useEffect(() => {
    applyLiveStationTrackRef.current = applyLiveStationTrack;
  }, [applyLiveStationTrack]);

  // Mobile hide / app switch / lock: do nothing.
  // Do not pause, stop, destroy, or reset the original YouTube player.

  useEffect(() => {
    if (listenMode !== "live" || !playlistReady || !playersReady) return;

    const syncStation = async () => {
      try {
        const station = await fetchLiveStation();
        if (!station.current?.videoId) return;

        const player = getActivePlayer();
        if (!player) return;

        const videoChanged = station.current.videoId !== currentVideoIdRef.current;
        const revisionChanged = station.revision !== stationRevisionRef.current;

        if (revisionChanged || videoChanged) {
          applyLiveStationTrack(station, {
            forceReload: true,
            resumePlayback: userPlaybackIntentRef.current === "playing"
          });
          return;
        }

        setUpNext(station.upNext);
        setRequestCredit(station.requestCredit);
        setLiveRoomLabel(
          station.hostStatus === "online"
            ? station.listenerCount && station.listenerCount > 0
              ? `DJ420 is hosting ΓÇö ${station.listenerCount} listening`
              : "DJ420 is hosting"
            : "Station host reconnecting"
        );

        if (isSeekingRef.current || blendInProgressRef.current) return;

        let localTime = 0;
        try {
          localTime = player.getCurrentTime?.() ?? 0;
        } catch {
          localTime = 0;
        }

        const serverOffset = station.currentOffsetSeconds ?? station.offsetSeconds;
        const drift = Math.abs(localTime - serverOffset);
        if (drift > 6) {
          try {
            player.seekTo(serverOffset, true);
          } catch {
            // Player may not be ready to seek yet.
          }
        }
      } catch {
        // Ignore station sync errors.
      }
    };

    void syncStation();
    const intervalId = window.setInterval(() => {
      void syncStation();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [applyLiveStationTrack, getActivePlayer, listenMode, playlistReady, playersReady]);

  useEffect(() => {
    if (listenMode !== "live" || !playersReady) return;

    const source = new EventSource("/api/fm/conductor/events");
    source.addEventListener("station", (event) => {
      try {
        const station = JSON.parse(event.data) as PublicStationPayload;
        if (!station.current?.videoId) return;
        applyLiveStationTrackRef.current(station, {
          forceReload: true,
          resumePlayback: userPlaybackIntentRef.current === "playing"
        });
      } catch {
        // Ignore malformed SSE payloads.
      }
    });

    return () => source.close();
  }, [listenMode, playersReady]);

  useEffect(() => {
    if (listenMode !== "solo" || !playlistReady) return;

    const pollInject = async () => {
      try {
        const response = await fetch("/api/fm/player-inject", { cache: "no-store" });
        const payload = (await response.json()) as { inject?: PlayerInject | null };
        pendingInjectRef.current = payload.inject ?? null;
        refreshUpNextLabel();
      } catch {
        // Ignore polling errors.
      }
    };

    void pollInject();
    const intervalId = window.setInterval(() => {
      void pollInject();
    }, 45_000);

    return () => window.clearInterval(intervalId);
  }, [listenMode, playlistReady, refreshUpNextLabel]);

  useEffect(() => {
    const mobile =
      /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
      window.matchMedia("(pointer: coarse)").matches;
    setIsMobile(mobile);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        if (listenModeRef.current === "live") {
          const nowPlaying = await fetchLiveStation();
          if (cancelled) return;

          const videos: PlaylistVideo[] = [];
          if (nowPlaying.current?.videoId) {
            videos.push({
              id: nowPlaying.current.videoId,
              title: nowPlaying.current.title,
              channelTitle: nowPlaying.current.artist,
              durationSec: nowPlaying.current.durationSec ?? nowPlaying.durationSec
            });
          }
          if (nowPlaying.nextVideoId) {
            videos.push({
              id: nowPlaying.nextVideoId,
              title: nowPlaying.nextTitle ?? "Up next",
              channelTitle: "LeafLock FM"
            });
          }

          const configResponse = await fetch("/api/fm/config", { cache: "no-store" });
          const config = (await configResponse.json()) as {
            playlistId?: string;
          };
          const activePlaylistId = nowPlaying.activePlaylist ?? config.playlistId ?? "";

          setPlaylistId(activePlaylistId);
          playlistIdRef.current = activePlaylistId;
          playlistRef.current = videos;
          playlistSetRef.current = new Set(videos.map((video) => video.id));
          rotationQueueRef.current = videos;
          rotationIndexRef.current = 0;
          setPlaylistCount(videos.length);
          setPlaylistReady(true);

          if (nowPlaying.current?.videoId) {
            setNowPlaying({
              title: nowPlaying.current.title,
              artist: nowPlaying.current.artist ?? "LeafLock FM ΓÇö Live"
            });
            setUpNext(nowPlaying.upNext ?? nowPlaying.nextTitle ?? null);
          }
          return;
        }

        const configResponse = await fetch("/api/fm/config", { cache: "no-store" });
        const config = (await configResponse.json()) as {
          playlistId?: string;
          simplePlaylistId?: string;
          playlists?: Partial<Record<FmPlayerMode, string>>;
        };
        const activePlaylistId = pickPlaylistId(
          {
            playlistId: config.playlistId ?? "",
            simplePlaylistId: config.simplePlaylistId ?? config.playlistId ?? "",
            playlists: config.playlists ?? {}
          },
          mode
        );

        if (!activePlaylistId) {
          throw new Error("Playlist is not configured");
        }

        if (cancelled) return;
        setPlaylistId(activePlaylistId);

        const response = await fetch(`/api/youtube/playlist?id=${activePlaylistId}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          videos?: PlaylistVideo[];
          count?: number;
          error?: string;
        };

        if (!response.ok || !payload.videos?.length) {
          throw new Error(payload.error || "Playlist could not be loaded from YouTube API");
        }

        if (cancelled) return;

        playlistRef.current = payload.videos;
        playlistSetRef.current = new Set(payload.videos.map((video) => video.id));
        playlistIdRef.current = activePlaylistId;
        rotationQueueRef.current = createShuffledRotation(payload.videos);
        rotationIndexRef.current = 0;
        prefetchedNextRef.current = null;
        setPlaylistCount(payload.count ?? payload.videos.length);
        setPlaylistReady(true);
        setNowPlaying({
          title: "Ready to shuffle",
          artist: `${payload.videos.length} tracks in rotation`
        });
      } catch (error) {
        if (!cancelled) {
          setPlaybackError(
            error instanceof Error ? error.message : "Could not load YouTube playlist"
          );
        }
      } finally {
        if (!cancelled) setIsLoadingPlaylist(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [mode, listenMode]);

  const togglePlayRef = useRef<() => void>(() => {});
  const playPreviousRef = useRef<() => boolean>(() => false);
  const playNextRef = useRef<() => boolean>(() => false);
  const bindMediaSessionRef = useRef<() => void>(() => {});
  const updateMediaSessionRef = useRef<(playing: boolean) => void>(() => {});
  useEffect(() => {
    if (!playlistReady || playerInitRef.current) return;

    let cancelled = false;
    let readyCount = 0;

    async function initDeck(deck: DeckId, host: HTMLDivElement, YT: YTNamespace) {
      return new Promise<YTPlayer>((resolve, reject) => {
        const player = new YT.Player(host, {
          height: String(YT_MIN_SIZE),
          width: String(YT_MIN_SIZE),
          playerVars: createPlayerVars(
            listenModeRef.current === "live" ? null : playlistIdRef.current
          ),
          events: {
            onReady: (event) => {
              playersReadyRef.current[deck] = true;
              event.target.setVolume(volumeRef.current);
              readyCount += 1;
              if (readyCount === 2) {
                setPlayersReady(true);
              }
              resolve(event.target);
            },
            onStateChange: (event) => {
              if (deck !== activeDeckRef.current && !blendInProgressRef.current) {
                return;
              }

              if (event.data === YT.PlayerState.PLAYING) {
                try {
                  const data = event.target.getVideoData();
                  const playingId = data.video_id;
                  const allowed =
                    !playingId ||
                    outsidePlaylistAllowedRef.current === playingId ||
                    playlistSetRef.current.has(playingId);

                  if (playingId && deck === activeDeckRef.current && !allowed) {
                    if (listenModeRef.current === "live") {
                      void fetchLiveStation()
                        .then((station) => {
                          applyLiveStationTrackRef.current(station, {
                            forceReload: true,
                            resumePlayback: userPlaybackIntentRef.current === "playing"
                          });
                        })
                        .catch(() => undefined);
                      return;
                    }
                    const current = sessionQueueRef.current[sessionIndexRef.current];
                    if (current) {
                      event.target.loadVideoById(current.id);
                      event.target.playVideo();
                    } else {
                      playNextTrackAutoRef.current();
                    }
                    return;
                  }
                } catch {
                  // Player may not expose metadata yet.
                }

                if (
                  deck === activeDeckRef.current &&
                  userPlaybackIntentRef.current !== "playing"
                ) {
                  event.target.pauseVideo();
                  isPlayingRef.current = false;
                  setIsPlaying(false);
                  updateMediaSessionRef.current(false);
                  return;
                }

                isPlayingRef.current = true;
                setIsPlaying(true);
                setIsConnected(true);
                setIsBuffering(false);
                setPlaybackError(null);
                void syncMediaBridge(true);
                bindMediaSessionRef.current();
                updateMediaSessionRef.current(true);
                if (deck === activeDeckRef.current) {
                  updateNowPlayingRef.current();
                  syncPlaybackProgressRef.current();
                  startTimePollingRef.current();

                  if (listenModeRef.current !== "live") {
                    const upcoming = peekNextScheduledTrackRef.current();
                    if (upcoming) {
                      prefetchOnInactiveDeckRef.current(upcoming);
                    }
                  }
                }
              }

              if (event.data === YT.PlayerState.PAUSED) {
                if (deck === activeDeckRef.current && !blendInProgressRef.current) {
                  // Android pauses YouTube in background while user intent is still "playing".
                  if (userPlaybackIntentRef.current === "playing") {
                    return;
                  }
                  isPlayingRef.current = false;
                  setIsPlaying(false);
                  syncPlaybackProgressRef.current();
                  stopTimePollingRef.current();
                }
              }

              if (event.data === YT.PlayerState.BUFFERING) {
                if (deck === activeDeckRef.current) {
                  setIsBuffering(true);
                  syncPlaybackProgressRef.current();
                }
              }

              if (event.data === YT.PlayerState.ENDED) {
                if (deck === activeDeckRef.current && !blendInProgressRef.current) {
                  if (listenModeRef.current === "live") {
                    const now = Date.now();
                    if (now - stationEndedAtRef.current < 2_000) {
                      return;
                    }
                    stationEndedAtRef.current = now;

                    void fetchLiveStation()
                      .then((station) => {
                        applyLiveStationTrackRef.current(station, {
                          forceReload: true,
                          resumePlayback: userPlaybackIntentRef.current === "playing"
                        });
                      })
                      .catch(() => {
                        // Station poll will recover on next interval.
                      });
                  } else if (userPlaybackIntentRef.current === "playing") {
                    playNextTrackAutoRef.current();
                  } else {
                    isPlayingRef.current = false;
                    setIsPlaying(false);
                    updateMediaSessionRef.current(false);
                  }
                }
              }
            },
            onError: () => {
              if (deck !== activeDeckRef.current) return;
              setIsBuffering(false);
              // Keep connection UI usable — do not lock the Play button.
              if (listenModeRef.current === "live") {
                setPlaybackError("This track could not be played. Re-syncing live room...");
                void fetchLiveStation()
                  .then((station) => {
                    applyLiveStationTrackRef.current(station, {
                      forceReload: true,
                      resumePlayback: userPlaybackIntentRef.current === "playing"
                    });
                  })
                  .catch(() => undefined);
                window.setTimeout(() => {
                  setPlaybackError(null);
                }, 4000);
                return;
              }
              setPlaybackError("This track could not be played. Skipping to another.");
              if (userPlaybackIntentRef.current === "playing") {
                playNextTrackAutoRef.current();
              } else {
                window.setTimeout(() => setPlaybackError(null), 4000);
              }
            }
          }
        });

        if (!player) {
          reject(new Error(`Failed to initialize deck ${deck}`));
        }
      });
    }

    async function initPlayers() {
      try {
        const YT = await loadYouTubeApi();

        // Wait for deck host nodes (can miss first paint / strict-mode remount).
        let hostA = playerHostARef.current;
        let hostB = playerHostBRef.current;
        for (let i = 0; i < 40 && (!hostA || !hostB); i += 1) {
          await new Promise((r) => window.setTimeout(r, 50));
          hostA = playerHostARef.current;
          hostB = playerHostBRef.current;
          if (cancelled) return;
        }

        if (cancelled || playerInitRef.current || !hostA || !hostB) {
          if (!cancelled && !playerInitRef.current && (!hostA || !hostB)) {
            setPlaybackError("Player failed to mount. Refresh the page.");
          }
          return;
        }

        playerInitRef.current = true;

        const [playerA, playerB] = await Promise.all([
          initDeck("a", hostA, YT),
          initDeck("b", hostB, YT)
        ]);

        if (cancelled) {
          playerA.destroy();
          playerB.destroy();
          return;
        }

        playersRef.current.a = playerA;
        playersRef.current.b = playerB;

        if (rotationQueueRef.current.length === 0) {
          rotationQueueRef.current = createShuffledRotation(playlistRef.current);
        }

        if (listenModeRef.current === "live") {
          const resumeAfterRefresh = readLiveWasPlaying();
          if (resumeAfterRefresh) {
            userPlaybackIntentRef.current = "playing";
          }
          void fetchLiveStation()
            .then((station) => {
              applyLiveStationTrackRef.current(station, {
                initialCue: !resumeAfterRefresh,
                resumePlayback: resumeAfterRefresh
              });
            })
            .catch(() => {
              // Station poll will recover.
            });
        } else {
          const first = rotationQueueRef.current[0] ?? null;
          const second = rotationQueueRef.current[1] ?? null;
          rotationIndexRef.current = 0;

          if (first) {
            sessionQueueRef.current = [first];
            sessionIndexRef.current = 0;
            syncPreviousState();
            setTrackUi(first, "LeafLock FM ΓÇó tap play");
            playerA.cueVideoById(first.id);
            deckVideoIdRef.current.a = first.id;
          }

          if (second) {
            playerB.cueVideoById(second.id);
            deckVideoIdRef.current.b = second.id;
            prefetchedNextRef.current = second;
            setUpNext(second.title);
          }
        }
      } catch (error) {
        playerInitRef.current = false;
        if (!cancelled) {
          setPlaybackError(
            error instanceof Error ? error.message : "YouTube player failed to initialize"
          );
        }
      }
    }

    void initPlayers();

    return () => {
      cancelled = true;
      stopTimePolling();
      cancelActiveCrossfade();
      playerInitRef.current = false;
      playersReadyRef.current = { a: false, b: false };
      setPlayersReady(false);

      for (const deck of ["a", "b"] as DeckId[]) {
        const player = playersRef.current[deck];
        playersRef.current[deck] = null;
        if (player) {
          try {
            player.destroy();
          } catch {
            // Player may already be destroyed during React strict-mode remounts.
          }
        }
      }
    };
  }, [cancelActiveCrossfade, playlistReady, setTrackUi, syncPreviousState]);

  const togglePlay = () => {
    const player = getActivePlayer();
    if (!player || !playersReady) {
      setPlaybackError("Player is still loading. Try again in a moment.");
      return;
    }

    if (isPlaying) {
      userPlaybackIntentRef.current = "paused";
      if (listenModeRef.current === "live") {
        persistLivePlaying(false);
      }
      cancelActiveCrossfade();
      try {
        playersRef.current.a?.pauseVideo();
        playersRef.current.b?.pauseVideo();
      } catch {
        // ignore
      }
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      syncPlaybackProgress();
      stopTimePolling();
      void syncMediaBridge(false);
      updateMediaSessionRef.current(false);
      return;
    }

    userPlaybackIntentRef.current = "playing";
    if (listenModeRef.current === "live") {
      persistLivePlaying(true);
    }
    setPlaybackError(null);
    setIsBuffering(true);

    // Original YouTube player is authoritative. Silent bridge is best-effort only.
    void syncMediaBridge(true);
    bindMediaSessionRef.current();

    if (listenModeRef.current === "live") {
      void fetchLiveStation()
        .then((station) => {
          applyLiveStationTrackRef.current(station, {
            forceReload: true,
            resumePlayback: true
          });
          // Immediate play attempt in case station apply is delayed.
          try {
            player.playVideo();
            applyDeckVolume(activeDeckRef.current, 1);
          } catch {
            // ignore
          }
          isPlayingRef.current = true;
          setIsPlaying(true);
          setIsConnected(true);
          updateMediaSessionRef.current(true);
        })
        .catch(() => {
          setIsBuffering(false);
          setPlaybackError("Could not join the live room. Try again.");
          updateMediaSessionRef.current(false);
        });
      return;
    }

    if (currentVideoIdRef.current) {
      try {
        player.playVideo();
      } catch {
        // ignore
      }
      applyDeckVolume(activeDeckRef.current, 1);
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsConnected(true);
      setIsBuffering(true);
      startTimePolling();
      updateMediaSessionRef.current(true);
      return;
    }

    playNextTrackFromGesture();
    updateMediaSessionRef.current(true);
  };

  const handlePrevious = () => {
    if (listenMode === "live" || !playersReady || !canGoPrevious) return;
    playPreviousTrackFromGesture();
  };

  const handleNext = () => {
    if (listenMode === "live" || !playersReady) return;
    playNextTrackFromGesture();
  };

  const resyncLiveFromServer = useCallback(() => {
    void fetchLiveStation()
      .then((station) => {
        applyLiveStationTrackRef.current(station, {
          resumePlayback: userPlaybackIntentRef.current === "playing"
        });
      })
      .catch(() => undefined);
  }, []);

  const bindMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      // Media Session only wraps the original player — never replaces it.
      navigator.mediaSession.setActionHandler("play", () => {
        if (!isPlayingRef.current) {
          togglePlayRef.current();
        } else {
          userPlaybackIntentRef.current = "playing";
          if (listenModeRef.current === "live") {
            persistLivePlaying(true);
          }
          try {
            getActivePlayer()?.playVideo();
          } catch {
            // Player may not be ready.
          }
          void syncMediaBridge(true);
          updateMediaSessionRef.current(true);
        }
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (isPlayingRef.current) {
          togglePlayRef.current();
        } else {
          userPlaybackIntentRef.current = "paused";
          if (listenModeRef.current === "live") {
            persistLivePlaying(false);
          }
          try {
            getActivePlayer()?.pauseVideo();
          } catch {
            // Player may not be ready.
          }
          void syncMediaBridge(false);
          updateMediaSessionRef.current(false);
        }
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        userPlaybackIntentRef.current = "stopped";
        persistLivePlaying(false);
        try {
          playersRef.current.a?.pauseVideo();
          playersRef.current.b?.pauseVideo();
        } catch {
          // Ignore.
        }
        isPlayingRef.current = false;
        setIsPlaying(false);
        stopTimePolling();
        void syncMediaBridge(false);
        updateMediaSessionRef.current(false);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (listenModeRef.current === "live") {
          resyncLiveFromServer();
          return;
        }
        playPreviousRef.current();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (listenModeRef.current === "live") {
          resyncLiveFromServer();
          return;
        }
        playNextRef.current();
      });
      navigator.mediaSession.setActionHandler("seekto", () => {
        if (listenModeRef.current === "live") {
          resyncLiveFromServer();
        }
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        if (listenModeRef.current === "live") {
          resyncLiveFromServer();
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        if (listenModeRef.current === "live") {
          resyncLiveFromServer();
        }
      });
    } catch {
      // Some browsers reject handler registration until playback starts.
    }
  }, [getActivePlayer, resyncLiveFromServer, stopTimePolling, syncMediaBridge]);

  const updateMediaSession = useCallback(
    (playing: boolean) => {
      if (!("mediaSession" in navigator)) return;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: nowPlaying.title,
        artist: nowPlaying.artist,
        album: djBlendEnabled ? "LeafLock FM DJ Blend" : "LeafLock FM Shuffle",
        artwork: youtubeArtwork(currentVideoIdRef.current)
      });
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";

      if (playing) {
        syncMediaSessionPosition(currentTime, duration);
      }
    },
    [
      currentTime,
      djBlendEnabled,
      duration,
      nowPlaying.artist,
      nowPlaying.title,
      syncMediaSessionPosition
    ]
  );

  useEffect(() => {
    togglePlayRef.current = togglePlay;
    playPreviousRef.current = playPreviousTrackFromGesture;
    playNextRef.current = playNextTrackFromGesture;
  });

  useEffect(() => {
    bindMediaSessionRef.current = bindMediaSession;
    updateMediaSessionRef.current = updateMediaSession;
  }, [bindMediaSession, updateMediaSession]);

  useEffect(() => {
    bindMediaSession();
    updateMediaSession(isPlaying);
  }, [bindMediaSession, isPlaying, nowPlaying, updateMediaSession]);

  useEffect(() => {
    void syncMediaBridge(isPlaying);
  }, [isPlaying, syncMediaBridge]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const node = controlsRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setControlsOffscreen(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const toggleDjBlend = () => {
    setDjBlendEnabled((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(BLEND_ENABLED_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  };

  const toggleVideo = () => {
    setShowVideo((current) => !current);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resizePlayerHosts();
      });
    });
  };

  const toggleMute = () => {
    const player = getActivePlayer();
    if (!player || !playersReady) return;

    if (player.isMuted()) {
      playersRef.current.a?.unMute();
      playersRef.current.b?.unMute();
      setIsMuted(false);
    } else {
      playersRef.current.a?.mute();
      playersRef.current.b?.mute();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Math.round(parseFloat(e.target.value) * 100);
    setVolume(newVolume);
    if (!blendInProgressRef.current) {
      applyDeckVolume(activeDeckRef.current, 1);
    }
    if (newVolume > 0) {
      playersRef.current.a?.unMute();
      playersRef.current.b?.unMute();
      setIsMuted(false);
    }
  };

  const displayedTime = isSeeking ? scrubTime : currentTime;
  const canSeek =
    listenMode !== "live" &&
    Boolean(currentTrackId && playersReady && !isBlending && duration > 0);

  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (listenMode === "live") return;
    const next = parseFloat(e.target.value);
    isSeekingRef.current = true;
    setIsSeeking(true);
    setScrubTime(next);
  };

  const commitSeek = (value: number) => {
    if (listenMode === "live") {
      isSeekingRef.current = false;
      setIsSeeking(false);
      return;
    }
    const player = getActivePlayer();
    if (!player || !canSeek) {
      isSeekingRef.current = false;
      setIsSeeking(false);
      return;
    }

    player.seekTo(value, true);
    setCurrentTime(value);
    setScrubTime(value);
    isSeekingRef.current = false;
    setIsSeeking(false);
  };

  const showMiniDock =
    !isLoadingPlaylist &&
    (isPlaying || isConnected) &&
    (listenMode === "live" && isMobile ? true : controlsOffscreen);

  const miniDock =
    portalReady && showMiniDock
      ? createPortal(
          <div
            className="fixed inset-x-0 bottom-0 z-[100] hidden border-t border-emerald-500/30 bg-zinc-950 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_48px_rgba(0,0,0,0.6)] backdrop-blur-lg max-md:block"
            role="region"
            aria-label="Mini playback controls"
          >
            <div className="mx-auto flex max-w-2xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{nowPlaying.title}</p>
                <p className="truncate text-xs text-zinc-400">{nowPlaying.artist}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={listenMode === "live" || !playersReady || !canGoPrevious}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-35 touch-manipulation"
                  aria-label="Previous track"
                >
                  <SkipBack className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!playersReady}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-lg transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60 touch-manipulation"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {!playersReady ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6 ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={listenMode === "live" || isBlending}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-35 touch-manipulation"
                  aria-label="Next track"
                >
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
    <div className="relative mx-auto w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-8 md:p-10">
      <div className="mb-5 flex flex-col gap-4 sm:mb-6">
        {hideLogo ? null : (
          <LeafLockLogo
            className="mx-auto sm:mx-0"
            onSecretTap={() => window.dispatchEvent(new Event("leaflock:open-desk"))}
          />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start sm:gap-3">
              <div
                className={`h-2.5 w-2.5 shrink-0 rounded-full sm:h-3 sm:w-3 ${
                  isBlending
                    ? "animate-pulse bg-amber-400"
                    : isConnected && isPlaying
                      ? "animate-pulse bg-emerald-500"
                      : "bg-zinc-600"
                }`}
              />
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-500 sm:text-sm sm:tracking-[3px]">
                <Shuffle className="h-3.5 w-3.5" />
                {djBlendEnabled ? "DJ Blend" : "Shuffle"}
              </span>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-3xl">FM 104.2</h1>
            <p className="mt-0.5 text-sm text-zinc-400">
              {listenMode === "live" ? (liveRoomLabel ?? "Live room ΓÇö synced") : (subtitle ?? "Stay Locked")}
            </p>
          </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={toggleDjBlend}
            className={`w-full rounded-full border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors sm:w-auto sm:py-2 ${
              djBlendEnabled
                ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
            }`}
            aria-pressed={djBlendEnabled}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Disc3 className="h-3.5 w-3.5" />
              DJ Blend {djBlendEnabled ? "On" : "Off"}
            </span>
          </button>
          <button
            type="button"
            onClick={toggleVideo}
            className={`w-full rounded-full border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors sm:w-auto sm:py-2 ${
              showVideo
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
            }`}
            aria-pressed={showVideo}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <MonitorPlay className="h-3.5 w-3.5" />
              Video {showVideo ? "On" : "Off (suggested)"}
            </span>
          </button>
        </div>
        </div>
      </div>

      <div className="mb-5 min-h-[56px] sm:mb-6 sm:min-h-[60px]">
        <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:text-xs sm:tracking-[2px]">
          NOW PLAYING
        </div>
        <div className="text-lg font-medium leading-snug text-white sm:text-2xl md:text-3xl">
          <span className="line-clamp-2">{nowPlaying.title}</span>
          <span className="mt-1 block line-clamp-1 text-base text-zinc-400 sm:text-xl">{nowPlaying.artist}</span>
        </div>
        {requestCredit ? (
          <p className="mt-2 text-sm font-medium text-emerald-400">
            Requested by {requestCredit}
          </p>
        ) : null}
        {upNext ? (
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-amber-400/80">
            Up next: {upNext}
          </p>
        ) : null}
        <div className="mt-4">
          <LoveButton
            trackId={currentTrackId}
            title={nowPlaying.title}
            artist={nowPlaying.artist}
            source="playlist"
          />
        </div>
      </div>

      <div
        ref={videoShellRef}
        className={
          showVideo
            ? "relative mb-5 aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black sm:mb-6"
            : // Off-screen but large enough for YouTube (min ~200px) so embeds do not error.
              "pointer-events-none fixed left-[-10000px] top-0 h-[220px] w-[220px] overflow-hidden opacity-0"
        }
        aria-hidden={!showVideo}
      >
        <div
          ref={playerHostARef}
          className={
            showVideo
              ? `absolute inset-0 h-full w-full ${
                  activeDeck === "a" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                }`
              : "h-full w-full"
          }
        />
        <div
          ref={playerHostBRef}
          className={
            showVideo
              ? `absolute inset-0 h-full w-full ${
                  activeDeck === "b" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                }`
              : "h-full w-full"
          }
        />
      </div>

      <div className="mb-6">
        {listenMode === "live" ? (
          <div
            className="w-full"
            role="progressbar"
            aria-label="Live broadcast progress"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={displayedTime}
            aria-valuetext={`${formatPlaybackTime(displayedTime)} of ${formatPlaybackTime(duration)}`}
          >
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                style={{
                  width: `${duration > 0 ? Math.min(100, (displayedTime / duration) * 100) : 0}%`
                }}
              />
            </div>
          </div>
        ) : (
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.1}
            value={Math.min(displayedTime, duration > 0 ? duration : 0)}
            onChange={handleSeekInput}
            onMouseUp={(e) => commitSeek(parseFloat(e.currentTarget.value))}
            onTouchEnd={(e) => commitSeek(parseFloat(e.currentTarget.value))}
            onKeyUp={(e) => {
              if (e.currentTarget instanceof HTMLInputElement) {
                commitSeek(parseFloat(e.currentTarget.value));
              }
            }}
            disabled={!canSeek}
            className="w-full accent-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Seek track position"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={displayedTime}
            aria-valuetext={`${formatPlaybackTime(displayedTime)} of ${formatPlaybackTime(duration)}`}
          />
        )}
        <div className="mt-1.5 flex justify-between text-xs tabular-nums text-zinc-500">
          <span>{formatPlaybackTime(displayedTime)}</span>
          <span>{formatPlaybackTime(duration)}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 sm:gap-6 md:flex-row">
        <div
          ref={controlsRef}
          className="flex w-full max-w-xs items-center justify-center gap-3 sm:gap-4"
        >
          <button
            type="button"
            onClick={handlePrevious}
            disabled={listenMode === "live" || isLoadingPlaylist || !playersReady || !canGoPrevious}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-14 sm:w-14 touch-manipulation"
            aria-label="Previous track"
          >
            <SkipBack className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoadingPlaylist || !playersReady}
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl transition-all hover:bg-emerald-400 active:scale-[0.985] disabled:cursor-wait disabled:opacity-60 sm:h-20 sm:w-20 md:h-24 md:w-24 touch-manipulation"
            aria-label={isPlaying ? "Pause playlist" : "Play playlist"}
          >
            {isLoadingPlaylist || !playersReady ? (
              <Loader2 className="w-9 h-9 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-9 h-9" />
            ) : (
              <Play className="w-9 h-9 ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={isLoadingPlaylist || !playersReady || isBlending || listenMode === "live"}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-14 sm:w-14 touch-manipulation"
            aria-label="Next track"
          >
            <SkipForward className="w-6 h-6" />
          </button>
        </div>

        <div className="flex w-full items-center gap-3 sm:gap-4 md:flex-1 md:w-auto">
          <button
            onClick={toggleMute}
            className="shrink-0 p-2 text-zinc-400 transition-colors hover:text-white touch-manipulation"
            aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume / 100}
            onChange={handleVolumeChange}
            className="h-10 w-full accent-emerald-500 sm:h-auto"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col justify-between gap-y-4 text-sm sm:mt-8 md:flex-row md:items-center">
        <div className="text-zinc-500">
          {playbackError ? (
            <span className="text-amber-400">{playbackError}</span>
          ) : isBlending ? (
            "Smooth DJ mix ΓÇö 5 second crossfade in progress"
          ) : isConnected && isPlaying ? (
            listenMode === "live"
              ? "Live room ΓÇö locked to the station timeline"
              : djBlendEnabled
                ? "DJ blend ΓÇö starts in the last 15 seconds with a 5 second crossfade"
                : "Shuffling your playlist ΓÇö no repeat within 60 minutes"
          ) : isLoadingPlaylist ? (
            "Loading YouTube playlist..."
          ) : listenMode === "live" ? (
            "Tap play to join the live room"
          ) : (
            "Tap play to start shuffled playlist"
          )}
          {isMobile ? (
            <span className="mt-2 block text-xs text-zinc-500">
              Background listening: use the bottom bar or lock-screen play/pause while you browse.
            </span>
          ) : null}
          {(isPlaying || isConnected) && !isLoadingPlaylist ? (
            <details className="mt-3 rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-left">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
                Background listening
              </summary>
              <p className="mt-2 text-xs text-zinc-500">
                Minimize the browser or switch apps ΓÇö playback continues where your device allows.
                Use the bottom mini player or lock-screen controls for play/pause. Close the tab to
                stop completely.
              </p>
              <button
                type="button"
                onClick={togglePlay}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 px-4 py-2 text-xs font-semibold text-emerald-300"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isPlaying ? "Pause" : "Play"}
              </button>
            </details>
          ) : null}
        </div>
      </div>

      <audio
        ref={mediaBridgeRef}
        src="/silent.mp3"
        loop
        playsInline
        preload="auto"
        className="pointer-events-none absolute h-px w-px opacity-0"
        aria-hidden
        onPlay={() => {
          bindMediaSessionRef.current();
          updateMediaSessionRef.current(isPlayingRef.current);
        }}
      />
    </div>
    {miniDock}
    </>
  );
}
