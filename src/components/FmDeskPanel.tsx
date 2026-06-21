"use client";

import { useEffect, useState } from "react";
import { Lock, Mail, X } from "lucide-react";
import {
  FM_PLAYLIST_HINTS,
  FM_PLAYLIST_LABELS,
  type FmPlaylistKey
} from "@/lib/fm-playlists";
import type { FmDeskSettings } from "@/lib/fm-store";

type TrackLike = {
  trackId: string;
  title: string;
  artist?: string;
  count: number;
};

type DeskPayload = {
  settings: FmDeskSettings;
  topLikes: TrackLike[];
};

const STORAGE_KEY = "leaflock-fm-desk-key";

const PLAYLIST_KEYS: FmPlaylistKey[] = [
  "mainRotation",
  "nightChill",
  "interviewDrops",
  "liveSessions"
];

export default function FmDeskPanel() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [deskKey, setDeskKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [settings, setSettings] = useState<FmDeskSettings | null>(null);
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
    setSettings(payload.settings);
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

  function updatePlaylist(key: FmPlaylistKey, value: string) {
    setSettings((current) =>
      current
        ? {
            ...current,
            playlists: { ...current.playlists, [key]: value }
          }
        : current
    );
  }

  async function saveDesk(event: React.FormEvent) {
    event.preventDefault();
    if (!savedKey || !settings) return;

    setMessage(null);
    setError(null);

    const response = await fetch("/api/fm/desk", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-fm-desk-key": savedKey
      },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      setError("Could not save desk settings.");
      return;
    }

    const payload = (await response.json()) as { settings: FmDeskSettings };
    setSettings(payload.settings);
    setMessage("Saved. Shuffle tab uses Main Rotation. Listeners never see this desk.");
  }

  async function emailLoved() {
    if (!savedKey) return;
    setMessage(null);
    setError(null);

    const response = await fetch("/api/fm/desk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-desk-key": savedKey
      },
      body: JSON.stringify({ action: "email-loved" })
    });

    const payload = (await response.json()) as { sent?: boolean; reason?: string };
    if (payload.sent) {
      setMessage("Most loved tracks emailed to you.");
      return;
    }

    setError(payload.reason ?? "Could not send email. Set FM_OWNER_EMAIL + RESEND_API_KEY on Render.");
  }

  function lockDesk() {
    sessionStorage.removeItem(STORAGE_KEY);
    setSavedKey("");
    setUnlocked(false);
    setOpen(false);
    setData(null);
    setSettings(null);
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

  if (!unlocked || !data || !settings) {
    return (
      <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Private desk</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-zinc-400">Playlists & settings are hidden from listeners.</p>
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
            <h2 className="text-lg font-semibold">Private desk</h2>
            <p className="text-xs text-zinc-500">Shuffle tab = Main Rotation only.</p>
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

        <form onSubmit={saveDesk} className="space-y-5">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
              YouTube playlists
            </legend>
            {PLAYLIST_KEYS.map((key) => (
              <label key={key} className="block text-sm text-zinc-300">
                {FM_PLAYLIST_LABELS[key]}
                {key === "mainRotation" ? (
                  <span className="ml-2 text-xs text-emerald-400">← Shuffle tab</span>
                ) : null}
                <input
                  value={settings.playlists[key]}
                  onChange={(event) => updatePlaylist(key, event.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-base"
                  placeholder="PLxxxxxxxx"
                />
                <span className="mt-1 block text-xs text-zinc-500">{FM_PLAYLIST_HINTS[key]}</span>
              </label>
            ))}
          </fieldset>

          <label className="block text-sm text-zinc-300">
            YouTube live video ID (optional)
            <input
              value={settings.youtubeLiveVideoId}
              onChange={(event) =>
                setSettings({ ...settings, youtubeLiveVideoId: event.target.value })
              }
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-base"
              placeholder="abc123xyz"
            />
          </label>

          <label className="block text-sm text-zinc-300">
            YouTube channel ID for live (optional)
            <input
              value={settings.youtubeChannelId}
              onChange={(event) =>
                setSettings({ ...settings, youtubeChannelId: event.target.value })
              }
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-base"
              placeholder="UCxxxxxxxx"
            />
          </label>

          <label className="block text-sm text-zinc-300">
            Your email (loves & requests)
            <input
              type="email"
              value={settings.ownerEmail}
              onChange={(event) => setSettings({ ...settings, ownerEmail: event.target.value })}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-base"
              placeholder="you@email.com"
            />
          </label>

          {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
          {error ? <p className="text-sm text-amber-400">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-full bg-emerald-500 px-5 py-3 font-semibold text-black hover:bg-emerald-400"
          >
            Save all
          </button>
        </form>

        <button
          type="button"
          onClick={() => void emailLoved()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-200 hover:border-emerald-500 hover:text-emerald-400"
        >
          <Mail className="h-4 w-4" />
          Email me most loved tracks
        </button>

        <section className="mt-6 border-t border-zinc-800 pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">Most loved</h3>
          <ol className="mt-3 space-y-2 text-sm">
            {data.topLikes.length === 0 ? (
              <li className="text-zinc-500">No loves yet.</li>
            ) : (
              data.topLikes.slice(0, 8).map((track, index) => (
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