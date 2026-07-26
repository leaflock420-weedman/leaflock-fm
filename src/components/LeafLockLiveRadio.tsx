"use client";

/**
 * LeafLock Locked In Radio — Xiaohongshu-style live player.
 *
 * Sound comes ONLY from a permanent native <audio> continuous stream.
 * No YouTube iframes. No silent bridge. No per-track reloads.
 * DJ crossfade is server-side (Liquidsoap); the phone hears one never-ending stream.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pause, Play, Radio, Volume2, VolumeX } from "lucide-react";
import {
  ensureLockedInRadioElement,
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
  /** Bump when user re-taps Join so we start in the same gesture stack. */
  joinNonce?: number;
};

export default function LeafLockLiveRadio({ joinNonce = 0 }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [streamOnline, setStreamOnline] = useState<boolean | null>(null);
  const [uiNowPlaying, setUiNowPlaying] = useState<string | null>(null);

  const syncUi = useCallback(() => {
    setIsPlaying(isLockedInRadioPlaying());
  }, []);

  const probeStream = useCallback(async () => {
    try {
      const res = await fetch("/api/fm/listen-status", { cache: "no-store" });
      const data = (await res.json()) as { source?: string; ok?: boolean };
      const online = data.source === "stream";
      setStreamOnline(online);
      return online;
    } catch {
      setStreamOnline(false);
      return false;
    }
  }, []);

  const tuneIn = useCallback(async () => {
    setError(null);
    setIsBuffering(true);
    ensureLockedInRadioElement();

    const online = await probeStream();
    if (!online) {
      setIsBuffering(false);
      setIsPlaying(false);
      setError(
        "Continuous radio encoder is offline. Locked In Radio needs Liquidsoap/Icecast on DJ420_UPSTREAM_URL — not YouTube."
      );
      return;
    }

    const ok = await startLockedInRadio(muted ? 0 : volume);
    setIsBuffering(false);
    setIsPlaying(ok);
    if (!ok) {
      setError("Could not start radio. Tap Tune in again (browser needs a tap for sound).");
    }
  }, [muted, probeStream, volume]);

  const stop = useCallback(() => {
    pauseLockedInRadio();
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  // Join button / nonce: start in gesture path when possible
  useEffect(() => {
    if (joinNonce <= 0) return;
    void tuneIn();
  }, [joinNonce, tuneIn]);

  // Custom event from FmListenMode Join tap (same user-gesture stack)
  useEffect(() => {
    const onJoin = () => {
      void tuneIn();
    };
    window.addEventListener("leaflock-live-join", onJoin);
    return () => window.removeEventListener("leaflock-live-join", onJoin);
  }, [tuneIn]);

  // Optional: show current track in UI only (not Media Session — station branding stays)
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
    const id = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void probeStream();
    const id = window.setInterval(() => void probeStream(), 30_000);
    return () => window.clearInterval(id);
  }, [probeStream]);

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
        Continuous station stream — same model as native browser radio. Leave Chrome; pull-down
        play/pause keeps working. DJ mix is on the server, not on your phone.
      </p>

      {uiNowPlaying ? (
        <p className="mt-3 text-xs text-zinc-500">
          <span className="uppercase tracking-wider text-zinc-600">On air (info only) · </span>
          {uiNowPlaying}
        </p>
      ) : null}

      {streamOnline === false ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Encoder offline. Set <code className="text-amber-200">DJ420_UPSTREAM_URL</code> to your
          Liquidsoap/Icecast mount (e.g.{" "}
          <code className="text-amber-200">https://stream.leaflock.com.au/live.mp3</code>). Without
          that continuous stream, background radio cannot work like Xiaohongshu.
        </div>
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
        <Radio className="h-3.5 w-3.5" />
        <span className="truncate font-mono">{getLockedInRadioStreamUrl()}</span>
      </div>
    </div>
  );
}
