"use client";

import { useEffect, useState } from "react";
import { Music2, Send } from "lucide-react";

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

export default function JukeboxForm() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(INSTAGRAM_KEY);
      if (stored) setInstagram(stored);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    const listenerId = getListenerId();

    const heartbeat = async () => {
      try {
        await fetch("/api/fm/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listenerId,
            instagram: instagram.trim() || undefined
          })
        });
      } catch {
        // Ignore heartbeat errors.
      }
    };

    void heartbeat();
    const intervalId = window.setInterval(() => {
      void heartbeat();
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [instagram]);

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
          instagram: instagram.trim() || undefined
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not add jukebox suggestion");
      }

      try {
        if (instagram.trim()) {
          window.localStorage.setItem(INSTAGRAM_KEY, instagram.trim());
        }
      } catch {
        // Ignore storage errors.
      }

      setYoutubeUrl("");
      setStatus("Added to the jukebox — one may play every 15 minutes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add jukebox suggestion");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
        <Music2 className="h-4 w-4" />
        Jukebox
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Suggest a YouTube track. When the DJ is away, one random suggestion may play every 15
        minutes.
      </p>
      <div className="mt-4 space-y-3">
        <input
          value={youtubeUrl}
          onChange={(event) => setYoutubeUrl(event.target.value)}
          placeholder="YouTube link or video ID"
          required
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        <input
          value={instagram}
          onChange={(event) => setInstagram(event.target.value)}
          placeholder="Instagram @handle (optional — shows you as listening live)"
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        {status ? <p className="text-sm text-emerald-400">{status}</p> : null}
        {error ? <p className="text-sm text-amber-400">{error}</p> : null}
        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending..." : "Suggest track"}
        </button>
      </div>
    </form>
  );
}