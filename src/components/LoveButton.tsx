"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

type LoveButtonProps = {
  trackId: string | null;
  title: string;
  artist?: string;
  source: "playlist" | "stream";
};

export default function LoveButton({ trackId, title, artist, source }: LoveButtonProps) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!trackId || title === "Ready to shuffle" || title.startsWith("LeafLock FM 104.2")) {
    return null;
  }

  async function sendLove() {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const response = await fetch("/api/fm/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, title, artist, source })
      });

      if (!response.ok) return;

      const payload = (await response.json()) as { like?: { count?: number } };
      setLiked(true);
      setCount(payload.like?.count ?? null);
      window.dispatchEvent(new Event("leaflock:loved"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void sendLove()}
      disabled={isSaving}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        liked
          ? "border-pink-500/50 bg-pink-500/10 text-pink-300"
          : "border-zinc-700 text-zinc-300 hover:border-pink-500/50 hover:text-pink-300"
      }`}
      aria-label="Love this track"
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-pink-400 text-pink-400" : ""}`} />
      {liked ? "Loved" : "Love"}
      {count ? <span className="text-xs opacity-80">({count})</span> : null}
    </button>
  );
}