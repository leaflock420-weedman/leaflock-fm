"use client";

import { useEffect, useState } from "react";

type TrackLike = {
  trackId: string;
  title: string;
  artist?: string;
  count: number;
  source: string;
  lastLikedAt: string;
};

type DeskPayload = {
  settings: { playlistId: string; updatedAt: string };
  topLikes: TrackLike[];
};

const STORAGE_KEY = "leaflock-fm-desk-key";

export default function FmDeskPage() {
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
      void loadDesk(stored);
    }
  }, []);

  async function loadDesk(key: string) {
    setError(null);
    const response = await fetch("/api/fm/desk", {
      headers: { "x-fm-desk-key": key },
      cache: "no-store"
    });

    if (!response.ok) {
      setData(null);
      setError("Invalid desk key.");
      sessionStorage.removeItem(STORAGE_KEY);
      setSavedKey("");
      return;
    }

    const payload = (await response.json()) as DeskPayload;
    setData(payload);
    setPlaylistId(payload.settings.playlistId);
  }

  async function unlockDesk(event: React.FormEvent) {
    event.preventDefault();
    sessionStorage.setItem(STORAGE_KEY, deskKey.trim());
    setSavedKey(deskKey.trim());
    await loadDesk(deskKey.trim());
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
    setMessage("Playlist updated. Refresh /playlist to load the new rotation.");
    setData((current) =>
      current ? { ...current, settings: payload.settings } : current
    );
  }

  if (!savedKey || !data) {
    return (
      <main className="min-h-screen bg-black px-6 py-16 text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
          <h1 className="text-2xl font-semibold">FM Desk</h1>
          <p className="mt-2 text-sm text-zinc-400">Private playlist and love-stats control.</p>
          <form className="mt-6 space-y-4" onSubmit={unlockDesk}>
            <label className="block text-sm text-zinc-300">
              Desk key
              <input
                type="password"
                value={deskKey}
                onChange={(event) => setDeskKey(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3"
                placeholder="Enter FM_ADMIN_SECRET"
              />
            </label>
            {error ? <p className="text-sm text-amber-400">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-full bg-emerald-500 px-4 py-3 font-semibold text-black hover:bg-emerald-400"
            >
              Unlock desk
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-semibold">FM Desk</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Change the YouTube playlist privately. Public users only see the player.
          </p>
        </div>

        <form
          onSubmit={savePlaylist}
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 space-y-4"
        >
          <label className="block text-sm text-zinc-300">
            YouTube playlist ID
            <input
              value={playlistId}
              onChange={(event) => setPlaylistId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3"
              placeholder="PLxxxxxxxx or LL"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Paste the ID from a playlist URL like{" "}
            <code className="text-zinc-300">youtube.com/playlist?list=PL...</code>
          </p>
          {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
          {error ? <p className="text-sm text-amber-400">{error}</p> : null}
          <button
            type="submit"
            className="rounded-full bg-emerald-500 px-5 py-3 font-semibold text-black hover:bg-emerald-400"
          >
            Save playlist
          </button>
        </form>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-lg font-semibold">Most loved tracks</h2>
          <ol className="mt-4 space-y-3 text-sm">
            {data.topLikes.length === 0 ? (
              <li className="text-zinc-500">No loves recorded yet.</li>
            ) : (
              data.topLikes.map((track, index) => (
                <li key={track.trackId} className="flex justify-between gap-4">
                  <div>
                    <span className="text-zinc-500">{index + 1}. </span>
                    <span className="font-medium">{track.title}</span>
                    {track.artist ? (
                      <span className="block text-zinc-400">{track.artist}</span>
                    ) : null}
                  </div>
                  <span className="text-pink-300">{track.count}</span>
                </li>
              ))
            )}
          </ol>
        </section>
      </div>
    </main>
  );
}