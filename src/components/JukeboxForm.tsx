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

function normalizeInstagramHandle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

type JukeboxFormProps = {
  sharedRoom?: boolean;
};

export default function JukeboxForm({ sharedRoom = false }: JukeboxFormProps) {
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
    if (!sharedRoom) return;

    const listenerId = getListenerId();

    const heartbeat = async () => {
      try {
        await fetch("/api/fm/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listenerId,
            instagram: instagram.trim() ? normalizeInstagramHandle(instagram) : undefined
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
  }, [instagram, sharedRoom]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setStatus(null);
    setError(null);

    const normalizedInstagram = normalizeInstagramHandle(instagram);

    try {
      const response = await fetch("/api/fm/jukebox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl,
          instagram: normalizedInstagram || undefined,
          suggestedBy: getListenerId()
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not add jukebox suggestion");
      }

      if (normalizedInstagram) {
        window.localStorage.setItem(INSTAGRAM_KEY, normalizedInstagram);
      }

      setYoutubeUrl("");
      setStatus("Track submitted — stay locked in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add jukebox suggestion");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      id="community-jukebox"
      onSubmit={submit}
      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
        <Music2 className="h-4 w-4" />
        Request a track
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        {sharedRoom
          ? "Paste a YouTube link — everyone in the live room hears it together."
          : "Paste a YouTube link for your private jukebox."}
      </p>
      <div className="mt-4 space-y-3">
        <input
          value={youtubeUrl}
          onChange={(event) => setYoutubeUrl(event.target.value)}
          placeholder="YouTube link"
          required
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        <input
          value={instagram}
          onChange={(event) => setInstagram(event.target.value)}
          placeholder="@yourhandle"
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        <p className="text-xs text-zinc-500">Instagram handle is optional but helps us credit your request.</p>
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