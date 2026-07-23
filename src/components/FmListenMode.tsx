"use client";

import { useEffect, useState } from "react";
import LeafLockPlayer from "@/app/components/LeafLockPlayer";
import JukeboxForm from "@/components/JukeboxForm";
import { LEAFLOCK_MOBILE_AUDIO_ID } from "@/lib/leaflock-mobile-audio";

export type ListenMode = "live" | "solo";

const MODE_KEY = "leaflock-listen-mode";

type LiveListener = {
  id: string;
  instagram?: string;
};

const LIVE_PLAYING_KEY = "leaflock-live-was-playing";

export default function FmListenMode() {
  const [mode, setMode] = useState<ListenMode>("live");
  const [listenerCount, setListenerCount] = useState(0);
  const [listeners, setListeners] = useState<LiveListener[]>([]);
  const [hostStatus, setHostStatus] = useState<"online" | "offline">("online");
  /** Bumped when user taps Join live room so the player auto-starts (gesture + re-join). */
  const [liveJoinNonce, setLiveJoinNonce] = useState(0);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODE_KEY);
      if (stored === "solo" || stored === "live") {
        setMode(stored);
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    if (mode !== "live") return;

    const poll = async () => {
      try {
        const response = await fetch("/api/fm/station", { cache: "no-store" });
        const payload = (await response.json()) as {
          listenerCount?: number;
          listeners?: LiveListener[];
          hostName?: string;
          hostStatus?: "online" | "offline";
        };
        setListenerCount(payload.listenerCount ?? 0);
        setListeners(payload.listeners ?? []);
        setHostStatus(payload.hostStatus === "offline" ? "offline" : "online");
      } catch {
        // Ignore polling errors.
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, 12_000);

    return () => window.clearInterval(intervalId);
  }, [mode]);

  function selectMode(next: ListenMode) {
    setMode(next);
    if (next === "live") {
      try {
        window.sessionStorage.setItem(LIVE_PLAYING_KEY, "1");
      } catch {
        // ignore
      }
      setLiveJoinNonce((n) => n + 1);
    }
    try {
      window.localStorage.setItem(MODE_KEY, next);
      void fetch("/api/fm/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listenerId:
            window.localStorage.getItem("leaflock-listener-id") ??
            `listener_${Date.now()}`,
          displayName: next === "live" ? "Live room" : "Private jukebox"
        })
      });
    } catch {
      // Ignore storage errors.
    }
  }

  return (
    <div className="space-y-6">
      {/* Permanent phone media host — outside LeafLockPlayer key={mode} so it never remounts.
          Holds Media Session / lock-screen while YouTube is the music engine. */}
      {/* Permanent Live Radio element — src set once to /live.mp3 by the player. */}
      <audio
        id={LEAFLOCK_MOBILE_AUDIO_ID}
        playsInline
        preload="auto"
        loop
        className="pointer-events-none absolute h-px w-px opacity-0"
        aria-hidden
      />
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
          How do you want to listen?
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => selectMode("live")}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              mode === "live"
                ? "border-emerald-500/50 bg-emerald-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <span className="block text-sm font-semibold">Join live room</span>
            <span className="mt-1 block text-xs text-zinc-500">
              Auto-plays in sync with everyone — DJ blend between songs.
            </span>
          </button>
          <button
            type="button"
            onClick={() => selectMode("solo")}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              mode === "solo"
                ? "border-emerald-500/50 bg-emerald-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            <span className="block text-sm font-semibold">Private jukebox</span>
            <span className="mt-1 block text-xs text-zinc-500">
              Your own shuffle — separate from the live audience.
            </span>
          </button>
        </div>

        {mode === "live" ? (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3 text-sm">
            <p className="font-medium text-white">
              {hostStatus === "online" ? "DJ420 is hosting" : "Station host reconnecting"}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {listenerCount > 0
                ? `${listenerCount} listener${listenerCount === 1 ? "" : "s"} tuned in`
                : "You are the first listener — joining the live broadcast in progress"}
            </p>
            {listeners.length > 0 ? (
              <p className="mt-1 text-xs text-zinc-500">
                {listeners
                  .slice(0, 6)
                  .map((listener) =>
                    listener.instagram
                      ? `@${listener.instagram.replace(/^@/, "")}`
                      : "Anonymous"
                  )
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <LeafLockPlayer
        key={mode}
        mode="simple"
        listenMode={mode}
        autoStartLive={mode === "live"}
        autoStartNonce={liveJoinNonce}
      />

      {mode === "live" ? <JukeboxForm sharedRoom /> : <JukeboxForm />}
    </div>
  );
}
