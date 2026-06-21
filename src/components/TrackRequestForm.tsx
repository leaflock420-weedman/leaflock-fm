"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export default function TrackRequestForm() {
  const [trackTitle, setTrackTitle] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch("/api/fm/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackTitle, message })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not send request");
      }

      setTrackTitle("");
      setMessage("");
      setStatus("Request sent — thanks for tuning in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
        Request a track
      </p>
      <div className="mt-3 space-y-3">
        <input
          value={trackTitle}
          onChange={(event) => setTrackTitle(event.target.value)}
          placeholder="Song or artist (optional)"
          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm text-white"
        />
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Your shout-out or request..."
          rows={3}
          required
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
          {sending ? "Sending..." : "Send request"}
        </button>
      </div>
    </form>
  );
}