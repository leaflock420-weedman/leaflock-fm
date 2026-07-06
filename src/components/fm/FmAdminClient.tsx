"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "leaflock-fm-admin-key";

type AdminPayload = {
  control: {
    mode: string;
    activePlaylistId: string;
    defaultPlaylistId: string;
    maintenanceMessage: string;
    youtubeLiveVideoId: string;
    allowRequests: boolean;
  };
  playlists: Array<{
    id: string;
    name: string;
    youtubePlaylistId: string;
    category: string;
    isDefault: boolean;
    active: boolean;
  }>;
  requests: Array<{
    id: string;
    title: string;
    videoId: string;
    requestedBy: string;
    status: string;
    boosts: number;
  }>;
  shows: Array<{ id: string; name: string; startTime: string; endTime: string }>;
};

export default function FmAdminClient() {
  const [key, setKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [liveUrl, setLiveUrl] = useState("");

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      "x-fm-desk-key": savedKey
    }),
    [savedKey]
  );

  const load = useCallback(async (adminKey: string) => {
    const response = await fetch("/api/fm-admin", {
      headers: { "x-fm-desk-key": adminKey }
    });
    if (!response.ok) throw new Error("Invalid admin password");
    setData((await response.json()) as AdminPayload);
  }, []);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedKey(stored);
        void load(stored);
      }
    } catch {
      // ignore
    }
  }, [load]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await load(key.trim());
      setSavedKey(key.trim());
      sessionStorage.setItem(STORAGE_KEY, key.trim());
    } catch {
      setError("Could not sign in. Check FM_ADMIN_PASSWORD / FM_ADMIN_SECRET.");
    }
  }

  async function action(body: Record<string, unknown>) {
    const response = await fetch("/api/fm-admin", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Action failed");
    await load(savedKey);
  }

  if (!savedKey && !data) {
    return (
      <main className="fm-page min-h-[100dvh] px-4 py-10">
        <form onSubmit={login} className="fm-glass mx-auto max-w-md p-6">
          <h1 className="text-xl font-bold text-white">LeafLock FM Admin</h1>
          <p className="mt-2 text-sm text-zinc-400">Protected station control desk</p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin password"
            className="mt-4 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
          />
          {error ? <p className="mt-2 text-sm text-amber-400">{error}</p> : null}
          <button
            type="submit"
            className="mt-4 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black"
          >
            Sign in
          </button>
        </form>
      </main>
    );
  }

  if (!data) {
    return <main className="fm-page p-8 text-white">Loading admin…</main>;
  }

  return (
    <main className="fm-page min-h-[100dvh] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="fm-glass p-5">
          <h1 className="text-2xl font-bold text-white">LeafLock FM Admin</h1>
          <p className="mt-1 text-sm text-zinc-400">Mode: {data.control.mode}</p>
        </header>

        <section className="fm-glass p-5">
          <h2 className="font-semibold text-white">Station Control</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Active playlist: {data.control.activePlaylistId}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void action({ action: "return-default" })}
              className="fm-btn-nav"
            >
              Return to Default Playlist
            </button>
            <button
              type="button"
              onClick={() => void action({ action: "maintenance" })}
              className="fm-btn-nav"
            >
              Emergency Stop / Maintenance
            </button>
            <button
              type="button"
              onClick={() => void action({ action: "live-end" })}
              className="fm-btn-nav"
            >
              End Live Mode
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="YouTube live URL"
              className="min-w-[240px] flex-1 rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() =>
                void action({ action: "live-start", youtubeLiveUrl: liveUrl })
              }
              className="fm-btn-nav fm-btn-nav--gold"
            >
              Start Live Mode
            </button>
          </div>
        </section>

        <section className="fm-glass p-5">
          <h2 className="font-semibold text-white">Playlist Manager</h2>
          <div className="mt-3 space-y-2">
            {data.playlists.map((pl) => (
              <div
                key={pl.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2 text-sm"
              >
                <span className="text-zinc-200">
                  {pl.name} · {pl.category}
                  {pl.isDefault ? " · default" : ""}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void action({
                      action: "use-playlist",
                      activePlaylistId: pl.youtubePlaylistId
                    })
                  }
                  className="fm-btn-nav"
                >
                  Use Now
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              placeholder="Playlist name"
              className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
            />
            <input
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="YouTube playlist URL"
              className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              void action({
                action: "save-playlist",
                playlist: {
                  name: playlistName || "New Rotation",
                  youtubePlaylistUrl: playlistUrl,
                  category: "Main"
                }
              })
            }
            className="fm-btn-nav mt-3"
          >
            Add Playlist
          </button>
        </section>

        <section className="fm-glass p-5">
          <h2 className="font-semibold text-white">Request Queue</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.requests.slice(0, 20).map((req) => (
              <li
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2"
              >
                <span className="text-zinc-200">
                  {req.title} · {req.status} · 🔥 {req.boosts}
                </span>
                <div className="flex gap-1">
                  {(["approved", "rejected", "skipped", "pinned", "banned"] as const).map(
                    (status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() =>
                          void action({
                            action: "request-status",
                            requestId: req.id,
                            requestStatus: status
                          })
                        }
                        className="fm-btn-nav text-[10px]"
                      >
                        {status}
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}