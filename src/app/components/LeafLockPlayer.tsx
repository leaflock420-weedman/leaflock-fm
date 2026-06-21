"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Disc3,
  Loader2,
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
import {
  pickUpcomingTrack,
  savePlayHistory,
  type PlaylistVideo
} from "@/lib/youtube-playlist";

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

function createPlayerVars(): Record<string, string | number> {
  const playerVars: Record<string, string | number> = {
    autoplay: 0,
    controls: 0,
    disablekb: 1,
    enablejsapi: 1,
    fs: 0,
    modestbranding: 1,
    rel: 0,
    playsinline: 1
  };

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

function youtubeArtwork(videoId: string | null): MediaImage[] {
  const fallback = "/leaflock-logo.png";
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

export default function LeafLockPlayer() {
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
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);

  const playerCardRef = useRef<HTMLDivElement | null>(null);
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

  const pickNextForPlayback = useCallback((): PlaylistVideo | null => {
    return pickUpcomingTrack(playlistRef.current, {
      blendEnabled: blendEnabledRef.current,
      current: getCurrentSessionTrack()
    });
  }, [getCurrentSessionTrack]);

  const resetPlaybackProgress = useCallback(() => {
    isSeekingRef.current = false;
    setIsSeeking(false);
    setCurrentTime(0);
    setDuration(0);
    setScrubTime(0);
  }, []);

  const setTrackUi = useCallback((video: PlaylistVideo, artist = "LeafLock FM") => {
    currentVideoIdRef.current = video.id;
    setCurrentTrackId(video.id);
    setNowPlaying({ title: video.title, artist });
  }, []);

  const syncMediaSessionPosition = useCallback((time: number, total: number) => {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) {
      return;
    }

    if (!Number.isFinite(total) || total <= 0) {
      return;
    }

    try {
      navigator.mediaSession.setPositionState({
        duration: total,
        playbackRate: 1,
        position: Math.min(Math.max(0, time), total)
      });
    } catch {
      // Position state is optional on some browsers.
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
      setUpNext(video.title);
    },
    [getDeckPlayer, getInactiveDeck]
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

      const upcoming = pickNextForPlayback();
      if (upcoming) {
        prefetchOnInactiveDeck(upcoming);
      }
    },
    [
      applyDeckVolume,
      clearBlendFallbackTimer,
      pickNextForPlayback,
      prefetchOnInactiveDeck,
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

      const upcoming = pickNextForPlayback();
      if (upcoming) {
        prefetchOnInactiveDeck(upcoming);
      }

      return true;
    },
    [
      applyDeckVolume,
      cancelActiveCrossfade,
      getDeckPlayer,
      pickNextForPlayback,
      prefetchOnInactiveDeck,
      resetPlaybackProgress,
      setTrackUi
    ]
  );

  const playNextTrackFromGesture = useCallback(() => {
    const next = pickNextForPlayback();
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
  }, [beginBlendToVideo, pickNextForPlayback, playInstantOnActiveDeck, queueNextTrack]);

  const playNextTrackAuto = useCallback(() => {
    const next = pickNextForPlayback();
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
  }, [beginBlendToVideo, getActivePlayer, isMobile, pickNextForPlayback, playInstantOnActiveDeck, queueNextTrack]);

  const playPreviousTrackFromGesture = useCallback(() => {
    if (sessionIndexRef.current <= 0) return false;

    cancelActiveCrossfade();
    sessionIndexRef.current -= 1;
    const previous = sessionQueueRef.current[sessionIndexRef.current];
    syncPreviousState();
    return playInstantOnActiveDeck(previous, { recordHistory: false });
  }, [cancelActiveCrossfade, playInstantOnActiveDeck, syncPreviousState]);

  const checkForUpcomingBlend = useCallback(() => {
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

      const next = pickNextForPlayback();
      if (!next) return;

      beginBlendToVideo(next);
    } catch {
      // Player may not expose timing yet.
    }
  }, [beginBlendToVideo, getActivePlayer, getCurrentSessionTrack, pickNextForPlayback]);

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
  const pickNextForPlaybackRef = useRef(pickNextForPlayback);
  const prefetchOnInactiveDeckRef = useRef(prefetchOnInactiveDeck);
  const startTimePollingRef = useRef(startTimePolling);
  const stopTimePollingRef = useRef(stopTimePolling);

  useEffect(() => {
    playNextTrackAutoRef.current = playNextTrackAuto;
    updateNowPlayingRef.current = updateNowPlayingFromActiveDeck;
    syncPlaybackProgressRef.current = syncPlaybackProgress;
    pickNextForPlaybackRef.current = pickNextForPlayback;
    prefetchOnInactiveDeckRef.current = prefetchOnInactiveDeck;
    startTimePollingRef.current = startTimePolling;
    stopTimePollingRef.current = stopTimePolling;
  }, [
    pickNextForPlayback,
    playNextTrackAuto,
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
    volumeRef.current = volume;
    if (!blendInProgressRef.current) {
      applyDeckVolume(activeDeckRef.current, 1);
    }
  }, [applyDeckVolume, volume]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BLEND_ENABLED_KEY);
      if (stored === "0") setDjBlendEnabled(false);
    } catch {
      // Ignore storage errors.
    }
  }, []);

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
        const config = (await configResponse.json()) as { playlistId?: string };
        const activePlaylistId = config.playlistId;

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
  }, []);

  const togglePlayRef = useRef<() => void>(() => {});
  const handlePreviousRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const bindMediaSessionRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!playlistReady || playerInitRef.current) return;

    let cancelled = false;
    let readyCount = 0;

    async function initDeck(deck: DeckId, host: HTMLDivElement, YT: YTNamespace) {
      return new Promise<YTPlayer>((resolve, reject) => {
        const player = new YT.Player(host, {
          height: "2",
          width: "2",
          playerVars: createPlayerVars(),
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
                isPlayingRef.current = true;
                setIsPlaying(true);
                setIsConnected(true);
                setIsBuffering(false);
                setPlaybackError(null);
                bindMediaSessionRef.current();
                if (deck === activeDeckRef.current) {
                  updateNowPlayingRef.current();
                  syncPlaybackProgressRef.current();
                  startTimePollingRef.current();

                  const upcoming = pickNextForPlaybackRef.current();
                  if (upcoming) {
                    prefetchOnInactiveDeckRef.current(upcoming);
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
                  playNextTrackAutoRef.current();
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

        const first = pickUpcomingTrack(playlistRef.current, { blendEnabled: true });
        const second = first
          ? pickUpcomingTrack(
              playlistRef.current.filter((video) => video.id !== first.id),
              { blendEnabled: true, current: first }
            )
          : null;

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
      return;
    }

    setPlaybackError(null);

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
    if (!playersReady || !canGoPrevious) return;
    playPreviousTrackFromGesture();
  };

  const handleNext = () => {
    if (!playersReady) return;
    playNextTrackFromGesture();
  };

  const bindMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      togglePlayRef.current();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      getActivePlayer()?.pauseVideo();
      isPlayingRef.current = false;
      setIsPlaying(false);
      stopTimePolling();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      handlePreviousRef.current();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      handleNextRef.current();
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      handlePreviousRef.current();
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      handleNextRef.current();
    });
  }, [getActivePlayer, stopTimePolling]);

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

      if (playing && duration > 0) {
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
    handlePreviousRef.current = handlePrevious;
    handleNextRef.current = handleNext;
  });

  useEffect(() => {
    bindMediaSessionRef.current = bindMediaSession;
  }, [bindMediaSession]);

  useEffect(() => {
    bindMediaSession();
    updateMediaSession(isPlaying);
  }, [bindMediaSession, isPlaying, nowPlaying, updateMediaSession]);

  useEffect(() => {
    const node = playerCardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowMiniPlayer(!entry.isIntersecting);
      },
      { threshold: 0.15, rootMargin: "-8px 0px 0px 0px" }
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

  const miniPlayerVisible = showMiniPlayer && (isPlaying || isConnected) && !isLoadingPlaylist;

  return (
    <>
    <div
      ref={playerCardRef}
      className="relative mx-auto w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-8 md:p-10"
    >
      <div className="mb-5 flex flex-col gap-4 sm:mb-6">
        <LeafLockLogo
          className="mx-auto sm:mx-0"
          onSecretTap={() => window.dispatchEvent(new Event("leaflock:open-desk"))}
        />

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
            <p className="mt-0.5 text-sm text-zinc-400">Stay Locked</p>
          </div>

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
        <div className="flex w-full max-w-xs items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={isLoadingPlaylist || isBuffering || !canGoPrevious}
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
            disabled={isLoadingPlaylist || isBlending}
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
              ? "Smart DJ blend — 5 second crossfades between tracks"
              : "Shuffling playlist — no repeat within 60 minutes"
          ) : isLoadingPlaylist ? (
            "Loading YouTube playlist..."
          ) : (
            "Tap play to start shuffled playlist"
          )}
          {isMobile ? (
            <span className="mt-2 block text-xs text-zinc-500">
              Phone tip: keep this tab open while listening. YouTube shuffle cannot play in the
              background on iPhone.
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

      <div
        className="pointer-events-none absolute left-0 top-0 h-[2px] w-[2px] overflow-hidden opacity-[0.01]"
        aria-hidden
      >
        <div ref={playerHostARef} className="h-[2px] w-[2px]" />
        <div ref={playerHostBRef} className="h-[2px] w-[2px]" />
      </div>
    </div>

    {miniPlayerVisible ? (
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/90 bg-zinc-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md sm:hidden"
        role="region"
        aria-label="Now playing controls"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{nowPlaying.title}</p>
            <p className="truncate text-xs text-zinc-400">{nowPlaying.artist}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={isBuffering || !canGoPrevious}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 touch-manipulation"
              aria-label="Previous track"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={isBuffering && !isBlending}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60 touch-manipulation"
              aria-label={isPlaying ? "Pause playlist" : "Play playlist"}
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
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 touch-manipulation"
              aria-label="Next track"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}