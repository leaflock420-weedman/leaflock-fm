"use client";

import { useEffect, useState } from "react";

type WarmupPayload = {
  ok?: boolean;
  dj420Status?: string;
  currentTrack?: string;
  currentOffsetSeconds?: number;
};

export default function FmMonitorPage() {
  const [status, setStatus] = useState<WarmupPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const response = await fetch("/api/fm/warmup", { cache: "no-store" });
        const payload = (await response.json()) as WarmupPayload;
        setStatus(payload);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Monitor failed");
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="min-h-[100dvh] bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h1 className="text-xl font-bold">DJ420 Headless Monitor</h1>
        <p className="text-sm text-zinc-400">
          Internal monitor only. DJ420 server host remains the timing engine.
        </p>
        {error ? <p className="text-sm text-amber-400">{error}</p> : null}
        {status ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Warmup OK</dt>
              <dd>{status.ok ? "yes" : "no"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">DJ420</dt>
              <dd>{status.dj420Status ?? "unknown"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Current track</dt>
              <dd>{status.currentTrack ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Offset</dt>
              <dd>{status.currentOffsetSeconds ?? 0}s</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-zinc-500">Checking station…</p>
        )}
      </div>
    </main>
  );
}