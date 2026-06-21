"use client";

import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";

type TrackLike = {
  trackId: string;
  title: string;
  artist?: string;
  count: number;
};

type DeskPayload = {
  settings: { playlistId: string; updatedAt: string };
  topLikes: TrackLike[];
};

const STORAGE_KEY = "leaflock-fm-desk-key";

export default function FmDeskPanel() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [deskKey, setDeskKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [data, setData] = useState<DeskPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSavedKey(stored);
      void loadDesk(stored, true);
    }
  }, []);

  useEffect(() => {
    const openDesk = () => setOpen(true);
    window.addEventListener("leaflock:open-desk", openDesk);
    return () => window.removeEventListener("leaflock:open-desk", openDesk);
  }, []);

  async function loadDesk(key: string, silent = false) {
    if (!silent) setError(null);

    const response = await fetch("/api/fm/desk", {
      headers: { "x-fm-desk-key": key },
      cache: "no-store"
    });

    if (!response.ok) {
      setData(null);
      setUnlocked(false);
      if (!silent) setError("Invalid desk key.");
      sessionStorage.removeItem(STORAGE_KEY);
      setSavedKey("");
      return;
    }

    const payload = (await response.json()) as DeskPayload;
    setData(payload);
    setPlaylistId(payload.settings.playlistId);
    setUnlocked(true);
    setOpen(true);
  }

  async function unlockDesk(event: React.FormEvent) {
    event.preventDefault();
    const key = deskKey.trim();
    sessionStorage.setItem(STORAGE_KEY, key);
    setSavedKey(key);
    await loadDesk(key);
  }

  async function savePlaylist(event: React.FormEvent) {
    event.preventDefault();
    if (!savedKey) return;

    setMessage(null);
    setError(null);

    const response = await fetch("/api/fm/desk", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-fm-desk-key": savedKey
      },
      body: JSON.stringify({ playlistId })
    });

    if (!response.ok) {
      setError("Could not save playlist.");
      return;
    }

    const payload = (await response.json()) as { settings: DeskPayload["settings"] };
    setMessage("Playlist saved. New tracks load on next play.");
    setData((current) => (current ? { ...current, settings: payload.settings } : current));
  }

  function lockDesk() {
    sessionStorage.removeItem(STORAGE_KEY);
    setSavedKey("");
    setUnlocked(false);
    setOpen(false);
    setData(null);
    setDeskKey("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800/80 bg-zinc-950/70 text-zinc-600 opacity-30 transition hover:opacity-100"
        aria-label="Open private desk"
        title="Private desk"
      >
        <Lock className="h-4 w-4" />
      </button>
    );
  }

  if (!unlocked || !data) {
    return (
      <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Private playlist desk</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-zinc-400">Only you can change the YouTube playlist rotation.</p>
          <form className="mt-5 space-y-4" onSubmit={unlockDesk}>
            <label className="block text-sm text-zinc-300">
              Desk key
              <input
                type="password"
                value={deskKey}
                onChange={(event) => setDeskKey(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-base"
                placeholder="Your private key"
                autoComplete="current-password"
              />
            </label>
            {error ? <p className="text-sm text-amber-400">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-full bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Your private desk</h2>
            <p className="text-xs text-zinc-500">Playlist changes are hidden from listeners.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={lockDesk}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
            >
              Lock
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={savePlaylist} className="space-y-4">
          <label className="block text-sm text-zinc-300">
            YouTube playlist ID
            <input
              value={playlistId}
              onChange={(event) => setPlaylistId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-base"
              placeholder="PLxxxxxxxx"
            />
          </label>
          <p className="text-xs text-zinc-500">
            From a URL like <code className="text-zinc-300">youtube.com/playlist?list=PL...</code>
          </p>
          {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
          {error ? <p className="text-sm text-amber-400">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-full bg-emerald-500 px-5 py-3 font-semibold text-black hover:bg-emerald-400"
          >
            Save playlist
          </button>
        </form>

        <section className="mt-6 border-t border-zinc-800 pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">Most loved</h3>
          <ol className="mt-3 space-y-2 text-sm">
            {data.topLikes.length === 0 ? (
              <li className="text-zinc-500">No loves yet.</li>
            ) : (
              data.topLikes.slice(0, 5).map((track, index) => (
                <li key={track.trackId} className="flex justify-between gap-3">
                  <span className="truncate">
                    <span className="text-zinc-500">{index + 1}. </span>
                    {track.title}
                  </span>
                  <span className="shrink-0 text-pink-300">{track.count}</span>
                </li>
              ))
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}