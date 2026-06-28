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

function loadYouTubeApi(): Promise<YTNamespace> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    const resolveIfReady = () => {
      if (window.YT?.Player) {
        resolve(window.YT);
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
      script.onerror = () => reject(new Error("Failed to load YouTube player API"));
      document.body.appendChild(script);
    } else if (resolveIfReady()) {
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (!resolveIfReady()) {
        reject(new Error("YouTube player API unavailable"));
      }
    };

    const poll = window.setInterval(() => {
      if (resolveIfReady()) {
        window.clearInterval(poll);
      }
    }, 100);

    window.setTimeout(() => window.clearInterval(poll), 10000);
  });
}

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

  if (typeof window !== "undefined") {
    playerVars.origin = window.location.origin;
  }

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
      { src: fallback, sizes: "512x512", type: "image/png" },
      { src: fallback, sizes: "256x256", type: "image/png" }
    ];
  }

  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return [
    { src: thumb, sizes: "480x360", type: "image/jpeg" },
    { src: thumb, sizes: "320x180", type: "image/jpeg" },
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
  upNext: string | null;
  requestCredit: string | null;
  listenerCount?: number;
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
    title: "LeafLock FM 104.2 — Shuffle",
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
  const [videoDisplayReady, setVideoDisplayReady] = useState(false);
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
  const showVideoRef = useRef(false);
  const stationRevisionRef = useRef(-1);
  const listenModeRef = useRef(listenMode);

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
            ? `${inject.title} — requested by ${credit}`
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
    if (showVideoRef.current) {
      setVideoDisplayReady(true);
    }
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
      // Position state is optional on some browsers.
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

      try {
        if (cuedId === video.id) {
          incoming.seekTo(0, true);
        } else {
          incoming.loadVideoById(video.id);
          deckVideoIdRef.current[incomingDeck] = video.id;
        }
      } catch {
        incoming.loadVideoById(video.id);
        deckVideoIdRef.current[incomingDeck] = video.id;
      }

      incoming.unMute();
      incoming.setVolume(0);
      incoming.playVideo();
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
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsConnected(true);
      resetPlaybackProgress();
      setTrackUi(video);
      updateNowPlayingFromActiveDeck();
      startTimePollingRef.current();

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
    (video: PlaylistVideo, options?: { recordHistory?: boolean }) => {
      cancelActiveCrossfade();
      const deck = activeDeckRef.current;
      const player = getDeckPlayer(deck);
      if (!player || !playersReadyRef.current[deck]) return false;

      const { recordHistory = true } = options ?? {};

      setPlaybackError(null);
      setIsBuffering(true);
      resetPlaybackProgress();
      setTrackUi(video);
      player.loadVideoById(video.id);
      deckVideoIdRef.current[deck] = video.id;
      player.playVideo();
      applyDeckVolume(deck, 1);

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

    if (blendEnabledRef.current && isPlayingRef.current) {
      return beginBlendToVideo(next);
    }

    queueNextTrack(next);
    return playInstantOnActiveDeck(next);
  }, [beginBlendToVideo, playInstantOnActiveDeck, queueNextTrack, resolveNextTrack]);

  const playNextTrackAuto = useCallback(() => {
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
  const applyLiveStationTrackRef =
    useRef<(station: PublicStationPayload, options?: { forceReload?: boolean }) => void>(() => {});
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
    showVideoRef.current = showVideo;
  }, [showVideo]);

  useEffect(() => {
    listenModeRef.current = listenMode;
    if (listenMode === "live") {
      setLiveRoomLabel("Live room — synced with everyone");
      stationRevisionRef.current = -1;
    } else {
      setLiveRoomLabel(null);
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
    const width = showVideo && videoDisplayReady && shell ? shell.clientWidth : 2;
    const height = showVideo && videoDisplayReady && shell ? shell.clientHeight : 2;

    (["a", "b"] as DeckId[]).forEach((deck) => {
      playersRef.current[deck]?.setSize(width, height);
    });
  }, [showVideo, videoDisplayReady]);

  useEffect(() => {
    if (!playersReady) return;
    resizePlayerHosts();
  }, [playersReady, resizePlayerHosts, showVideo, videoDisplayReady, activeDeck, isBlending]);

  useEffect(() => {
    if (!showVideo || !videoDisplayReady) return;

    const shell = videoShellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      resizePlayerHosts();
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [showVideo, videoDisplayReady, resizePlayerHosts]);

  const applyLiveStationTrack = useCallback(
    (station: PublicStationPayload, options?: { forceReload?: boolean }) => {
      const player = getActivePlayer();
      if (!player || !playersReadyRef.current[activeDeckRef.current]) return;

      const track = station.current;
      const changed =
        options?.forceReload ||
        station.revision !== stationRevisionRef.current ||
        currentVideoIdRef.current !== track.videoId;

      stationRevisionRef.current = station.revision;
      outsidePlaylistAllowedRef.current = track.videoId;
      setRequestCredit(station.requestCredit);
      setUpNext(station.upNext);
      setLiveRoomLabel(
        station.listenerCount && station.listenerCount > 0
          ? `Live room — ${station.listenerCount} listening`
          : "Live room — synced with everyone"
      );

      const video: PlaylistVideo = {
        id: track.videoId,
        title: track.title,
        channelTitle: track.artist,
        durationSec: track.durationSec
      };

      if (changed) {
        setTrackUi(video, track.artist ?? "LeafLock FM");
        player.loadVideoById(track.videoId);
        deckVideoIdRef.current[activeDeckRef.current] = track.videoId;
      }

      if (station.offsetSeconds > 0.5) {
        try {
          player.seekTo(station.offsetSeconds, true);
        } catch {
          // Player may not be ready to seek yet.
        }
      }

      if (isPlayingRef.current || changed) {
        player.playVideo();
        isPlayingRef.current = true;
        setIsPlaying(true);
        setIsConnected(true);
        applyDeckVolume(activeDeckRef.current, 1);
        startTimePollingRef.current();
      }

      window.setTimeout(() => resizePlayerHosts(), 50);
    },
    [applyDeckVolume, getActivePlayer, resizePlayerHosts, setTrackUi]
  );

  useEffect(() => {
    applyLiveStationTrackRef.current = applyLiveStationTrack;
  }, [applyLiveStationTrack]);

  const resumeBackgroundPlayback = useCallback(() => {
    if (!isPlayingRef.current) return;

    void syncMediaBridge(true);
    const active = getActivePlayer();
    if (active) {
      try {
        active.playVideo();
        applyDeckVolume(activeDeckRef.current, 1);
      } catch {
        // Player may not be ready yet.
      }
    }
  }, [applyDeckVolume, getActivePlayer, syncMediaBridge]);

  useEffect(() => {
    const onVisibility = () => {
      resumeBackgroundPlayback();
    };

    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    window.addEventListener("focus", onVisibility);

    const keepAliveId = window.setInterval(() => {
      if (document.visibilityState === "hidden" && isPlayingRef.current) {
        resumeBackgroundPlayback();
      }
    }, 4000);

    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.clearInterval(keepAliveId);
    };
  }, [resumeBackgroundPlayback]);

  useEffect(() => {
    if (listenMode !== "live" || !playlistReady || !playersReady) return;

    const syncStation = async () => {
      try {
        const response = await fetch("/api/fm/station", { cache: "no-store" });
        const station = (await response.json()) as PublicStationPayload;
        if (!station.current?.videoId) return;

        const player = getActivePlayer();
        if (!player) return;

        const drift =
          station.revision === stationRevisionRef.current
            ? Math.abs((player.getCurrentTime?.() ?? 0) - station.offsetSeconds)
            : 999;

        if (station.revision !== stationRevisionRef.current || drift > 5) {
          applyLiveStationTrack(station, {
            forceReload: station.revision !== stationRevisionRef.current
          });
        }
      } catch {
        // Ignore station sync errors.
      }
    };

    void syncStation();
    const intervalId = window.setInterval(() => {
      void syncStation();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [applyLiveStationTrack, getActivePlayer, listenMode, playlistReady, playersReady]);

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
  }, [mode]);

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
          height: "2",
          width: "2",
          playerVars: createPlayerVars(playlistIdRef.current),
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
                    void fetch("/api/fm/station", { cache: "no-store" })
                      .then((response) => response.json())
                      .then((station: PublicStationPayload) => {
                        applyLiveStationTrackRef.current(station, { forceReload: true });
                      })
                      .catch(() => {
                        // Station poll will recover on next interval.
                      });
                  } else {
                    playNextTrackAutoRef.current();
                  }
                }
              }
            },
            onError: (event) => {
              if (deck !== activeDeckRef.current) return;
              setIsBuffering(false);
              setIsPlaying(false);
              setIsConnected(false);
              setPlaybackError("This track could not be played. Skipping to another.");
              playNextTrackAutoRef.current();
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
        const hostA = playerHostARef.current;
        const hostB = playerHostBRef.current;

        if (cancelled || playerInitRef.current || !hostA || !hostB) {
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

        const first = rotationQueueRef.current[0] ?? null;
        const second = rotationQueueRef.current[1] ?? null;
        rotationIndexRef.current = 0;

        if (first) {
          sessionQueueRef.current = [first];
          sessionIndexRef.current = 0;
          syncPreviousState();
          setTrackUi(first, "LeafLock FM • tap play");
          playerA.cueVideoById(first.id);
          deckVideoIdRef.current.a = first.id;
        }

        if (second) {
          playerB.cueVideoById(second.id);
          deckVideoIdRef.current.b = second.id;
          prefetchedNextRef.current = second;
          setUpNext(second.title);
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
      cancelActiveCrossfade();
      playersRef.current.a?.pauseVideo();
      playersRef.current.b?.pauseVideo();
      isPlayingRef.current = false;
      setIsPlaying(false);
      syncPlaybackProgress();
      stopTimePolling();
      void syncMediaBridge(false);
      return;
    }

    setPlaybackError(null);
    void syncMediaBridge(true);
    bindMediaSession();

    if (listenModeRef.current === "live") {
      void fetch("/api/fm/station", { cache: "no-store" })
        .then((response) => response.json())
        .then((station: PublicStationPayload) => {
          applyLiveStationTrackRef.current(station, { forceReload: true });
        })
        .catch(() => {
          setPlaybackError("Could not join the live room. Try again.");
        });
      return;
    }

    if (currentVideoIdRef.current) {
      player.playVideo();
      applyDeckVolume(activeDeckRef.current, 1);
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsConnected(true);
      setIsBuffering(true);
      startTimePolling();
      return;
    }

    playNextTrackFromGesture();
  };

  const handlePrevious = () => {
    if (listenMode === "live" || !playersReady || !canGoPrevious) return;
    playPreviousTrackFromGesture();
  };

  const handleNext = () => {
    if (listenMode === "live" || !playersReady) return;
    playNextTrackFromGesture();
  };

  const bindMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        void syncMediaBridge(true);
        togglePlayRef.current();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        getActivePlayer()?.pauseVideo();
        isPlayingRef.current = false;
        setIsPlaying(false);
        stopTimePolling();
        void syncMediaBridge(false);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        playPreviousRef.current();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        playNextRef.current();
      });
    } catch {
      // Some browsers reject handler registration until playback starts.
    }
  }, [getActivePlayer, stopTimePolling, syncMediaBridge]);

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
    setShowVideo((current) => {
      const next = !current;
      if (!next) {
        setVideoDisplayReady(false);
      } else {
        const deck = activeDeckRef.current;
        const canShowNow =
          Boolean(currentVideoIdRef.current) &&
          deckVideoIdRef.current[deck] === currentVideoIdRef.current;
        setVideoDisplayReady(canShowNow);
        window.setTimeout(() => resizePlayerHosts(), 80);
      }
      return next;
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
  const canSeek = Boolean(currentTrackId && playersReady && !isBlending && duration > 0);

  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(e.target.value);
    isSeekingRef.current = true;
    setIsSeeking(true);
    setScrubTime(next);
  };

  const commitSeek = (value: number) => {
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
    controlsOffscreen && (isPlaying || isConnected) && !isLoadingPlaylist;

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
                  disabled={isBuffering || !canGoPrevious}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-35 touch-manipulation"
                  aria-label="Previous track"
                >
                  <SkipBack className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={isBuffering && !isBlending}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-lg transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60 touch-manipulation"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isBuffering && !isBlending ? (
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
                  disabled={isBlending}
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
              {listenMode === "live" ? (liveRoomLabel ?? "Live room — synced") : (subtitle ?? "Stay Locked")}
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
        {showVideo && !videoDisplayReady ? (
          <p className="mt-2 text-xs text-zinc-500">Video starts on the next track</p>
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
          showVideo && videoDisplayReady
            ? "relative mb-5 aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black sm:mb-6"
            : "pointer-events-none absolute left-0 top-0 h-[2px] w-[2px] overflow-hidden opacity-[0.01]"
        }
        aria-hidden={!showVideo || !videoDisplayReady}
      >
        <div
          ref={playerHostARef}
          className={
            showVideo && videoDisplayReady
              ? `absolute inset-0 h-full w-full ${
                  activeDeck === "a" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                }`
              : "h-[2px] w-[2px]"
          }
        />
        <div
          ref={playerHostBRef}
          className={
            showVideo && videoDisplayReady
              ? `absolute inset-0 h-full w-full ${
                  activeDeck === "b" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                }`
              : "h-[2px] w-[2px]"
          }
        />
      </div>

      <div className="mb-6">
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
            disabled={listenMode === "live" || isLoadingPlaylist || isBuffering || !canGoPrevious}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-14 sm:w-14 touch-manipulation"
            aria-label="Previous track"
          >
            <SkipBack className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoadingPlaylist || (isBuffering && !isBlending)}
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl transition-all hover:bg-emerald-400 active:scale-[0.985] disabled:cursor-wait disabled:opacity-60 sm:h-20 sm:w-20 md:h-24 md:w-24 touch-manipulation"
            aria-label={isPlaying ? "Pause playlist" : "Play playlist"}
          >
            {isLoadingPlaylist || (isBuffering && !isBlending) ? (
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
            disabled={isLoadingPlaylist || isBlending || listenMode === "live"}
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
            "Smooth DJ mix — 5 second crossfade in progress"
          ) : isConnected && isPlaying ? (
            djBlendEnabled
              ? "DJ blend — starts in the last 15 seconds with a 5 second crossfade"
              : "Shuffling your playlist — no repeat within 60 minutes"
          ) : isLoadingPlaylist ? (
            "Loading YouTube playlist..."
          ) : (
            "Tap play to start shuffled playlist"
          )}
          {isMobile ? (
            <span className="mt-2 block text-xs text-zinc-500">
              Phone tip: use the bottom bar or lock-screen controls for skip forward/back while you
              browse.
            </span>
          ) : null}
          <span className="mt-1 block text-xs text-zinc-600">
            {playlistCount > 0 && playlistId ? (
              <>
                <span className="sm:hidden">{playlistCount} tracks loaded</span>
                <span className="hidden truncate sm:block">
                  {playlistCount} tracks • https://www.youtube.com/playlist?list={playlistId}
                </span>
              </>
            ) : (
              "Loading playlist..."
            )}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-emerald-400">
          <a href="/fm" className="hover:underline">
            Live FM
          </a>
          <span className="text-zinc-700">•</span>
          {playlistId ? (
            <a
              href={`https://www.youtube.com/playlist?list=${playlistId}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              YouTube
            </a>
          ) : null}
          <span className="text-zinc-700">•</span>
          <a href="https://youtube.com/@leaflockofficial" target="_blank" rel="noreferrer" className="hover:underline">
            YouTube
          </a>
          <span className="text-zinc-700">•</span>
          <a href="https://instagram.com/leaflockofficial" target="_blank" rel="noreferrer" className="hover:underline">
            Instagram
          </a>
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