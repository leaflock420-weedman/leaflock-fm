"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LoveButton from "@/components/LoveButton";
import { Loader2, Pause, Play, Radio, Volume2, VolumeX } from "lucide-react";

const streamUrl =
  process.env.NEXT_PUBLIC_STREAM_URL ?? "https://stream.leaflock.com.au/main";
const fallbackStreamUrl =
  process.env.NEXT_PUBLIC_STREAM_FALLBACK_URL ??
  "https://stream.live.vc.bbcmedia.co.uk/bbc_6music";
const nowPlayingUrl =
  process.env.NEXT_PUBLIC_NOW_PLAYING_URL ?? "/api/radio/now-playing";

type NowPlayingState = {
  title: string;
  artist: string;
  art?: string;
};

const defaultArt =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=512&q=80";

export default function LeafLockStreamPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [activeStreamUrl, setActiveStreamUrl] = useState(streamUrl);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState>({
    title: "LeafLock FM 104.2",
    artist: "Stay Locked — tap play to connect"
  });
  const [streamTrackId, setStreamTrackId] = useState<string | null>(null);

  const updateMediaSession = useCallback((track: NowPlayingState, playing: boolean) => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "LeafLock FM 104.2",
      artwork: [
        { src: track.art || defaultArt, sizes: "512x512", type: "image/jpeg" },
        { src: track.art || defaultArt, sizes: "256x256", type: "image/jpeg" }
      ]
    });

    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, []);

  const bindMediaSessionHandlers = useCallback(() => {
    if (!("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    if (!audio) return;

    navigator.mediaSession.setActionHandler("play", async () => {
      try {
        await audio.play();
        setIsPlaying(true);
        setIsConnected(true);
      } catch {
        setPlaybackError("Could not resume playback.");
      }
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      audio.pause();
      setIsPlaying(false);
    });

    navigator.mediaSession.setActionHandler("stop", () => {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
      setIsConnected(false);
    });
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const response = await fetch(nowPlayingUrl, { cache: "no-store" });
      if (!response.ok) return;

      const data = await response.json();
      const station = Array.isArray(data) ? data[0] : data.nowPlaying ?? data;

      const title =
        station?.now_playing?.song?.title ??
        station?.nowPlaying?.title ??
        "LeafLock FM 104.2";
      const artist =
        station?.now_playing?.song?.artist ??
        station?.nowPlaying?.artist ??
        "Live on LeafLock FM";
      const art = station?.now_playing?.song?.art ?? station?.nowPlaying?.art;

      const nextTrack = { title, artist, art };
      setNowPlaying(nextTrack);
      setStreamTrackId(`stream:${title}:${artist ?? "leaflock"}`);
      updateMediaSession(nextTrack, isPlaying);
    } catch {
      // Keep the last metadata when the endpoint is unavailable.
    }
  }, [isPlaying, updateMediaSession]);

  useEffect(() => {
    void fetchNowPlaying();
  }, [fetchNowPlaying]);

  useEffect(() => {
    if (!isPlaying) return;

    void fetchNowPlaying();
    const interval = window.setInterval(() => {
      void fetchNowPlaying();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [fetchNowPlaying, isPlaying]);

  useEffect(() => {
    bindMediaSessionHandlers();
    updateMediaSession(nowPlaying, isPlaying);
  }, [bindMediaSessionHandlers, isPlaying, nowPlaying, updateMediaSession]);

  const loadAndPlay = useCallback(
    async (url: string, isFallback = false) => {
      const audio = audioRef.current;
      if (!audio) return;

      setPlaybackError(null);
      setIsBuffering(true);
      audio.pause();
      audio.src = url;
      audio.load();

      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("Stream unavailable"));
        };
        const cleanup = () => {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("error", onError);
        };
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("error", onError);
      });

      audio.volume = volume;
      audio.muted = isMuted;
      await audio.play();

      setActiveStreamUrl(url);
      setUsingFallback(isFallback);
      setIsPlaying(true);
      setIsConnected(true);
      setIsBuffering(false);
      updateMediaSession(nowPlaying, true);
    },
    [isMuted, nowPlaying, updateMediaSession, volume]
  );

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      updateMediaSession(nowPlaying, false);
      return;
    }

    try {
      await loadAndPlay(streamUrl, false);
    } catch {
      if (streamUrl === fallbackStreamUrl) {
        setIsBuffering(false);
        setPlaybackError("Stream unavailable. Check your AzuraCast URL.");
        return;
      }

      try {
        await loadAndPlay(fallbackStreamUrl, true);
        setPlaybackError("AzuraCast offline — playing test stream so background audio works.");
      } catch {
        setIsBuffering(false);
        setPlaybackError("Could not connect to any stream.");
      }
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !isMuted;
    audio.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseFloat(event.target.value);
    setVolume(nextVolume);
    if (audioRef.current) {
      audioRef.current.volume = nextVolume;
      if (nextVolume > 0) {
        audioRef.current.muted = false;
        setIsMuted(false);
      }
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-zinc-950 border border-zinc-800 rounded-3xl p-8 md:p-10 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${isConnected && isPlaying ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`}
            />
            <span className="text-emerald-500 text-sm font-medium tracking-[3px] uppercase flex items-center gap-2">
              <Radio className="w-3.5 h-3.5" />
              {usingFallback ? "TEST STREAM" : "LIVE"}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter text-white mt-1">
            LeafLock FM 104.2
          </h1>
          <p className="text-zinc-400 text-lg mt-1">— Stay Locked</p>
        </div>
      </div>

      <div className="mb-8 min-h-[60px]">
        <div className="text-xs uppercase tracking-[2px] text-zinc-500 mb-1">NOW PLAYING</div>
        <div className="text-2xl md:text-3xl font-medium text-white leading-tight">
          {nowPlaying.title}
          <span className="block text-xl text-zinc-400 mt-1">{nowPlaying.artist}</span>
        </div>
        <div className="mt-4">
          <LoveButton
            trackId={streamTrackId}
            title={nowPlaying.title}
            artist={nowPlaying.artist}
            source="stream"
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={isBuffering}
          className="flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-white text-zinc-950 hover:bg-emerald-400 active:scale-[0.985] transition-all shadow-xl disabled:opacity-60 disabled:cursor-wait"
          aria-label={isPlaying ? "Pause live stream" : "Play live stream"}
        >
          {isBuffering ? (
            <Loader2 className="w-9 h-9 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-9 h-9" />
          ) : (
            <Play className="w-9 h-9 ml-1" />
          )}
        </button>

        <div className="flex-1 w-full md:w-auto flex items-center gap-4">
          <button
            type="button"
            onClick={toggleMute}
            className="text-zinc-400 hover:text-white transition-colors"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full accent-emerald-500"
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="mt-8 space-y-3 text-sm text-zinc-500">
        {playbackError ? (
          <p className="text-amber-400">{playbackError}</p>
        ) : isConnected && isPlaying ? (
          <p>Live stream active — works in background on phone and lock screen.</p>
        ) : (
          <p>Tap play, then switch apps or lock your phone. Install the app for the best experience.</p>
        )}
        <p className="truncate text-xs text-zinc-600">{activeStreamUrl}</p>
        <p className="text-xs text-zinc-600">
          Shuffle playlist available at{" "}
          <a href="/playlist" className="text-emerald-400 hover:underline">
            /playlist
          </a>
        </p>
      </div>

      <audio
        ref={audioRef}
        preload="none"
        playsInline
        onPlaying={() => {
          setIsPlaying(true);
          setIsConnected(true);
          setIsBuffering(false);
          updateMediaSession(nowPlaying, true);
        }}
        onPause={() => {
          setIsPlaying(false);
          updateMediaSession(nowPlaying, false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => {
          setIsBuffering(false);
          setIsPlaying(false);
          setIsConnected(false);
          setPlaybackError("Stream error. Confirm your AzuraCast mount URL is reachable.");
          updateMediaSession(nowPlaying, false);
        }}
      />
    </div>
  );
}