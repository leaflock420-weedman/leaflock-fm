"use client";

/**
 * Public Live Room UI.
 * Phone controller: LeafLock FM 104.2 / DJ420 — Locked In Radio only.
 * Website now-playing + up-next come from stream-authoritative /api/fm/now-playing.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pause, Play, Radio, Volume2, VolumeX } from "lucide-react";
import {
  ensureLockedInRadioElement,
  isLockedInRadioPlaying,
  noteSharedTrackVideoId,
  pauseRadio,
  playRadio,
  setLockedInRadioVolume
} from "@/lib/leaflock-locked-in-radio";
import {
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_STATION
} from "@/lib/leaflock-radio-stream";

type Props = { joinNonce?: number };

type NowPlayingView = {
  title: string;
  artist: string | null;
  upNext: string | null;
  thumbnail: string | null;
};

export default function LeafLockLiveRadio({ joinNonce = 0 }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingView | null>(null);
  const streamUrl = getLockedInRadioStreamUrl();

  const tuneIn = useCallback(async () => {
    setError(null);
    setIsBuffering(true);
    ensureLockedInRadioElement();
    setLockedInRadioVolume(muted ? 0 : volume, muted);
    const ok = await playRadio();
    setIsBuffering(false);
    setIsPlaying(ok);
    if (!ok) {
      setError("Tap Tune in again — browsers need a tap before radio can play.");
    }
  }, [muted, volume]);

  useEffect(() => {
    if (joinNonce > 0) void tuneIn();
  }, [joinNonce, tuneIn]);

  useEffect(() => {
    const onJoin = () => void tuneIn();
    window.addEventListener("leaflock-live-join", onJoin);
    return () => window.removeEventListener("leaflock-live-join", onJoin);
  }, [tuneIn]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/fm/now-playing", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          current?: { title?: string; artist?: string; videoId?: string };
          nextTitle?: string | null;
          upNext?: string | null;
          thumbnail?: string | null;
        };
        if (data.current?.title) {
          setNowPlaying({
            title: data.current.title,
            artist: data.current.artist ?? null,
            upNext: data.nextTitle ?? data.upNext ?? null,
            thumbnail: data.thumbnail ?? null
          });
        }
        // Snap every tuned-in phone to the live edge when the shared song changes
        if (data.current?.videoId) {
          void noteSharedTrackVideoId(data.current.videoId);
        }
      } catch {
        // ignore
      }
    };
    void load();
    // Fast poll: shared metadata + live-edge resync trigger
    const id = window.setInterval(() => void load(), 3_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setLockedInRadioVolume(volume, muted);
  }, [muted, volume]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIsPlaying(isLockedInRadioPlaying());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-8">
      {!isPlaying && !isBuffering ? (
        <button
          type="button"
          onClick={() => void tuneIn()}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-black/80 px-6 text-center backdrop-blur-sm"
        >
          <span className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-400">
            Locked In Radio
          </span>
          <span className="mt-3 text-2xl font-semibold text-white">
            {LEAFLOCK_RADIO_STATION.title}
          </span>
          <span className="mt-2 max-w-sm text-sm text-zinc-400">
            Continuous native stream. Leave Chrome — pull-down keeps play/pause.
          </span>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-black">
            <Play className="h-4 w-4" fill="currentColor" />
            Tune in
          </span>
        </button>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-400">
            Live Room
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            {LEAFLOCK_RADIO_STATION.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">{LEAFLOCK_RADIO_STATION.artist}</p>
          <p className="mt-0.5 text-xs text-zinc-600">{LEAFLOCK_RADIO_STATION.album}</p>
        </div>
        <div
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
            isPlaying ? "animate-pulse bg-emerald-500" : "bg-zinc-600"
          }`}
        />
      </div>

      <div className="mt-5 flex gap-4 rounded-2xl border border-white/5 bg-black/50 p-4">
        {nowPlaying?.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nowPlaying.thumbnail}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-600">
            <Radio className="h-8 w-8" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-500/90">
            Now playing
          </p>
          <p className="mt-1 truncate text-lg font-semibold text-white">
            {nowPlaying?.title || "Tuning in…"}
          </p>
          {nowPlaying?.artist ? (
            <p className="mt-0.5 truncate text-sm text-zinc-400">{nowPlaying.artist}</p>
          ) : null}
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Up next
          </p>
          <p className="mt-0.5 truncate text-sm text-zinc-300">
            {nowPlaying?.upNext || "—"}
          </p>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-amber-400">{error}</p> : null}

      <div className="mt-8 flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => {
            if (isPlaying) {
              pauseRadio();
              setIsPlaying(false);
            } else {
              void tuneIn();
            }
          }}
          disabled={isBuffering}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-black touch-manipulation disabled:opacity-50"
          aria-label={isPlaying ? "Pause" : "Play"}
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
            className="p-2 text-zinc-400"
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
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-zinc-600">
        <Radio className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono">{streamUrl}</span>
      </div>
    </div>
  );
}
