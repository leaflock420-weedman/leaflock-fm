"use client";

import { useEffect, useState } from "react";
import FmEqualizer from "@/components/fm/FmEqualizer";

type PanelState = {
  listenerCount: number;
  nextCommunityPickInSec: number | null;
  lastRequestTitle: string | null;
  djBlendOn: boolean;
};

export default function FmLiveRoomPanel({ listenMode }: { listenMode: "live" | "solo" }) {
  const [state, setState] = useState<PanelState>({
    listenerCount: 0,
    nextCommunityPickInSec: null,
    lastRequestTitle: null,
    djBlendOn: true
  });

  useEffect(() => {
    try {
      const blend = window.localStorage.getItem("leaflock-dj-blend-enabled");
      if (blend === "false") {
        setState((s) => ({ ...s, djBlendOn: false }));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/station-state", { cache: "no-store" });
        const payload = (await response.json()) as {
          listenerCount?: number;
          nextCommunityPickInSec?: number | null;
          current?: { title?: string; requestCredit?: string | null };
        };
        setState((s) => ({
          ...s,
          listenerCount: payload.listenerCount ?? 0,
          nextCommunityPickInSec: payload.nextCommunityPickInSec ?? null,
          lastRequestTitle: payload.current?.requestCredit
            ? payload.current.title ?? null
            : s.lastRequestTitle
        }));
      } catch {
        // ignore
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const pickLabel =
    state.nextCommunityPickInSec != null
      ? `${Math.floor(state.nextCommunityPickInSec / 60)}:${String(state.nextCommunityPickInSec % 60).padStart(2, "0")}`
      : "15:00";

  return (
    <section className="fm-glass p-4 sm:p-5" aria-label="Live room status">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">
          Live Room
        </p>
        <FmEqualizer active={listenMode === "live"} />
      </div>
      <p className="mt-3 text-lg font-semibold text-white">
        {state.listenerCount > 0
          ? `${state.listenerCount} listeners locked in`
          : "Listeners locked in — tune in now"}
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        Current mode: {listenMode === "live" ? "Live Room" : "Private jukebox"}
      </p>
      <dl className="mt-4 grid gap-2 text-sm text-zinc-300">
        <div className="flex justify-between gap-4 border-t border-white/5 pt-2">
          <dt className="text-zinc-500">Next community pick in</dt>
          <dd className="font-mono text-amber-300">{pickLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Last requested track</dt>
          <dd className="truncate text-right">{state.lastRequestTitle ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">DJ Blend</dt>
          <dd>{state.djBlendOn ? "On (recommended)" : "Off"}</dd>
        </div>
      </dl>
    </section>
  );
}