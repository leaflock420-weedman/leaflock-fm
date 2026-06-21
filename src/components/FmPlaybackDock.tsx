"use client";

import { useEffect, useState } from "react";
import { Loader2, Pause, Play, SkipBack, SkipForward } from "lucide-react";

type DockState = {
  visible: boolean;
  title: string;
  artist: string;
  isPlaying: boolean;
  isBuffering: boolean;
  canGoPrevious: boolean;
  isBlending: boolean;
};

const initial: DockState = {
  visible: false,
  title: "",
  artist: "",
  isPlaying: false,
  isBuffering: false,
  canGoPrevious: false,
  isBlending: false
};

export default function FmPlaybackDock() {
  const [dock, setDock] = useState<DockState>(initial);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<Partial<DockState>>).detail;
      setDock((current) => ({ ...current, ...detail }));
    };

    window.addEventListener("leaflock:playback-state", onState);
    return () => window.removeEventListener("leaflock:playback-state", onState);
  }, []);

  if (!dock.visible) return null;

  const dispatch = (name: string) => {
    window.dispatchEvent(new Event(name));
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-emerald-500/20 bg-zinc-950/98 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_48px_rgba(0,0,0,0.55)] backdrop-blur-lg md:hidden"
      role="region"
      aria-label="Playback controls"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{dock.title}</p>
          <p className="truncate text-xs text-zinc-400">{dock.artist}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => dispatch("leaflock:playback-prev")}
            disabled={dock.isBuffering || !dock.canGoPrevious}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-35 touch-manipulation"
            aria-label="Previous track"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => dispatch("leaflock:playback-toggle")}
            disabled={dock.isBuffering && !dock.isBlending}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-lg transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60 touch-manipulation"
            aria-label={dock.isPlaying ? "Pause" : "Play"}
          >
            {dock.isBuffering && !dock.isBlending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : dock.isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => dispatch("leaflock:playback-next")}
            disabled={dock.isBlending}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 text-zinc-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-35 touch-manipulation"
            aria-label="Next track"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}