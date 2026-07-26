"use client";

/**
 * LeafLock Locked In Radio UI — always tries to play real native audio.
 * No encoder wall. No YouTube. Tune-in works on first tap.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pause, Play, Radio, Volume2, VolumeX } from "lucide-react";
import {
  ensureLockedInRadioElement,
  getLockedInRadioMode,
  isLockedInRadioPlaying,
  pauseLockedInRadio,
  setLockedInRadioVolume,
  startLockedInRadio
} from "@/lib/leaflock-locked-in-radio";
import {
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_AUDIO_ID,
  LEAFLOCK_RADIO_STATION
} from "@/lib/leaflock-radio-stream";

type Props = {
  joinNonce?: number;
};

export default function LeafLockLiveRadio({ joinNonce = 0 }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [modeLabel, setModeLabel] = useState("Radio");
  const [uiNowPlaying, setUiNowPlaying] = useState<string | null>(null);

  const syncUi = useCallback(() => {
    setIsPlaying(isLockedInRadioPlaying());
    const m = getLockedInRadioMode();
    setModeLabel(
      m === "stream" ? "Continuous stream" : m === "track" ? "Live room audio" : "Radio"
    );
  }, []);

  const tuneIn = useCallback(async () => {
    setError(null);
    setIsBuffering(true);
    ensureLockedInRadioElement();

    const ok = await startLockedInRadio(muted ? 0 : volume);
    setIsBuffering(false);
    setIsPlaying(ok);
    syncUi();

    if (!ok) {
      setError("Could not start radio. Tap Tune in again (phone needs one tap for sound).");
    } else {
      setError(null);
    }
  }, [muted, syncUi, volume]);

  const stop = useCallback(() => {
    pauseLockedInRadio();
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  useEffect(() => {
    // Auto-start on first paint when already on live (after join gesture or remount)
    if (joinNonce > 0) {
      void tuneIn();
      return;
    }
    // Default live page: still try once decks/metadata ready path via gesture event
  }, [joinNonce, tuneIn]);

  useEffect(() => {
    const onJoin = () => {
      void tuneIn();
    };
    window.addEventListener("leaflock-live-join", onJoin);
    return () => window.removeEventListener("leaflock-live-join", onJoin);
  }, [tuneIn]);

  // First visit with live default: start on first user pointer anywhere is handled by Join;
  // also try auto-start after short delay if browser allows (usually blocked → overlay play).
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!isLockedInRadioPlaying()) {
        void tuneIn();
      }
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount attempt
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/fm/now-playing", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          current?: { title?: string; artist?: string };
        };
        if (data.current?.title) {
          setUiNowPlaying(
            data.current.artist
              ? `${data.current.title} — ${data.current.artist}`
              : data.current.title
          );
        }
      } catch {
        // ignore
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    ensureLockedInRadioElement();
    const el = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;
    if (!el) return;
    const onPlay = () => syncUi();
    const onPause = () => syncUi();
    el.addEventListener("playing", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("playing", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [syncUi]);

  useEffect(() => {
    setLockedInRadioVolume(volume, muted);
  }, [muted, volume]);

  return (
    <div className="relative mx-auto w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-8">
      {!isPlaying && !isBuffering ? (
        <button
          type="button"
          onClick={() => void tuneIn()}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-black/75 px-6 text-center backdrop-blur-sm"
        >
          <span className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-400">
            Locked In Radio
          </span>
          <span className="mt-3 text-2xl font-semibold text-white">Tap to tune in</span>
          <span className="mt-2 max-w-sm text-sm text-zinc-400">
            Native radio audio — keeps the pull-down bar after you leave Chrome.
          </span>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-black">
            <Play className="h-4 w-4" fill="currentColor" />
            Tune in now
          </span>
        </button>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-400">
            Locked In Radio
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            {LEAFLOCK_RADIO_STATION.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">{LEAFLOCK_RADIO_STATION.artist}</p>
        </div>
        <div
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
            isPlaying ? "animate-pulse bg-emerald-500" : "bg-zinc-600"
          }`}
          aria-hidden
        />
      </div>

      <p className="mt-4 text-sm text-zinc-500">
        {modeLabel} · leave the app and use pull-down play/pause. Sound is native HTML audio, not
        YouTube.
      </p>

      {uiNowPlaying ? (
        <p className="mt-3 text-xs text-zinc-500">
          <span className="uppercase tracking-wider text-zinc-600">On air · </span>
          {uiNowPlaying}
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-amber-400">{error}</p> : null}

      <div className="mt-8 flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => {
            if (isPlaying) stop();
            else void tuneIn();
          }}
          disabled={isBuffering}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-black transition hover:bg-emerald-400 disabled:opacity-50 touch-manipulation"
          aria-label={isPlaying ? "Pause radio" : "Tune in"}
        >
          {isBuffering ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-7 w-7" fill="currentColor" />
          ) : (
            <Play className="ml-1 h-7 w-7" fill="currentColor" />
          )}
        </button>

        <div className="flex w-full max-w-xs items-center gap-3">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="p-2 text-zinc-400 hover:text-white"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              setMuted(v === 0);
            }}
            className="h-10 w-full accent-emerald-500"
            aria-label="Volume"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-zinc-600">
        <Radio className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono">{getLockedInRadioStreamUrl()}</span>
      </div>
    </div>
  );
}
