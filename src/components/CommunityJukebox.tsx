"use client";

import { useEffect, useState } from "react";
import { Flame, Music2, Send } from "lucide-react";

const LISTENER_ID_KEY = "leaflock-listener-id";
const INSTAGRAM_KEY = "leaflock-instagram";

function getListenerId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(LISTENER_ID_KEY);
  if (existing) return existing;
  const created = `listener_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(LISTENER_ID_KEY, created);
  return created;
}

type QueueItem = {
  id: string;
  title: string;
  videoId: string;
  instagram?: string;
  boosts?: number;
};

type CommunityJukeboxProps = {
  sharedRoom?: boolean;
};

export default function CommunityJukebox({ sharedRoom = false }: CommunityJukeboxProps) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [trackName, setTrackName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(INSTAGRAM_KEY);
      if (stored) setInstagram(stored);
    } catch {
      // ignore
    }
  }, []);

  const loadQueue = async () => {
    try {
      const response = await fetch("/api/fm/jukebox", { cache: "no-store" });
      const payload = (await response.json()) as { pending?: QueueItem[] };
      setQueue(payload.pending ?? []);
    } catch {
      setQueue([]);
    }
  };

  useEffect(() => {
    void loadQueue();
    const id = window.setInterval(() => void loadQueue(), 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch("/api/fm/jukebox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl,
          title: trackName.trim() || undefined,
          instagram: instagram.trim() || undefined,
          suggestedBy: getListenerId()
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not submit track");
      }

      if (instagram.trim()) {
        window.localStorage.setItem(INSTAGRAM_KEY, instagram.trim());
      }

      setYoutubeUrl("");
      setTrackName("");
      setStatus("Track submitted — stay locked in.");
      void loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit track");
    } finally {
      setSending(false);
    }
  }

  async function boost(id: string) {
    try {
      await fetch("/api/fm/jukebox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      void loadQueue();
    } catch {
      // ignore
    }
  }

  return (
    <form
      id="community-jukebox"
      onSubmit={submit}
      className="fm-glass p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
        <Music2 className="h-4 w-4" />
        Community Jukebox
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Drop a track request for the live room. Every 15 minutes, one community pick can jump into
        the mix.
        {sharedRoom ? " Everyone tuned in hears it together." : ""}
      </p>
      <div className="mt-4 space-y-3">
        <input
          value={youtubeUrl}
          onChange={(event) => setYoutubeUrl(event.target.value)}
          placeholder="Track URL (YouTube link)"
          required
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        <input
          value={trackName}
          onChange={(event) => setTrackName(event.target.value)}
          placeholder="Track name (optional)"
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        <input
          value={instagram}
          onChange={(event) => setInstagram(event.target.value)}
          placeholder="Instagram @handle (optional)"
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        <p className="text-xs text-zinc-500">YouTube links recommended</p>
        {status ? <p className="text-sm text-emerald-400">{status}</p> : null}
        {error ? <p className="text-sm text-amber-400">{error}</p> : null}
        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending..." : "Suggest Track"}
        </button>
      </div>

      {queue.length > 0 ? (
        <div className="mt-5 border-t border-white/5 pt-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
            Coming up / Suggested tracks
          </p>
          <ul className="mt-3 space-y-2">
            {queue.slice(0, 6).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-zinc-200">{item.title}</span>
                <button
                  type="button"
                  onClick={() => void boost(item.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 px-2.5 py-1 text-xs text-amber-300"
                >
                  <Flame className="h-3.5 w-3.5" />
                  Boost{item.boosts ? ` ${item.boosts}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}