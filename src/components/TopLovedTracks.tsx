"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart } from "lucide-react";

type TrackLike = {
  trackId: string;
  title: string;
  artist?: string;
  count: number;
};

export default function TopLovedTracks() {
  const [tracks, setTracks] = useState<TrackLike[]>([]);

  const loadTop = useCallback(async () => {
    try {
      const response = await fetch("/api/fm/likes?limit=5", { cache: "no-store" });
      const payload = (await response.json()) as { top?: TrackLike[] };
      setTracks(payload.top ?? []);
    } catch {
      setTracks([]);
    }
  }, []);

  useEffect(() => {
    void loadTop();
    const intervalId = window.setInterval(() => {
      void loadTop();
    }, 20_000);

    const onLoved = () => {
      void loadTop();
    };
    window.addEventListener("leaflock:loved", onLoved);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("leaflock:loved", onLoved);
    };
  }, [loadTop]);

  if (tracks.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-300">
        <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
        Top 5 — Popular Demand
      </div>
      <ol className="space-y-3">
        {tracks.map((track, index) => (
          <li key={track.trackId} className="flex items-start justify-between gap-4 text-sm">
            <div>
              <span className="text-zinc-500">{index + 1}. </span>
              <span className="font-medium text-white">{track.title}</span>
              {track.artist ? <span className="block text-zinc-400">{track.artist}</span> : null}
            </div>
            <span className="rounded-full bg-pink-500/10 px-2 py-1 text-xs font-semibold text-pink-300">
              {track.count}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}