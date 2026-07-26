/**
 * Xiaohongshu model: permanent native <audio> → continuous MP3 encoder.
 * Encoder is SEPARATE from Next.js (leaflock-stream Docker service).
 *
 * stream.leaflock.com.au has no DNS yet — use the live Render encoder URL.
 * Hardcoded so a failed/missing NEXT_PUBLIC_* env cannot ship YouTube for Live Room.
 */

export const LEAFLOCK_RADIO_AUDIO_ID = "leaflockRadio";

/** Live continuous encoder (verified HTTP 200 audio/mpeg). */
export const LEAFLOCK_STREAM_URL = "https://leaflock-stream.onrender.com/live.mp3";

/** Future custom domain (CNAME → leaflock-stream). */
export const LEAFLOCK_STREAM_CANONICAL = "https://stream.leaflock.com.au/live.mp3";

export const LEAFLOCK_RADIO_STATION = {
  title: "LeafLock Radio",
  artist: "Locked In Radio",
  album: "LeafLock FM 104.2"
} as const;

/**
 * Base continuous mount URL (no cache-bust). Used for display / static markup.
 */
export function getLockedInRadioStreamUrl(): string {
  // Allow override only when pointing at a real continuous encoder host.
  const fromEnv = process.env.NEXT_PUBLIC_STREAM_URL?.trim();
  if (
    fromEnv &&
    (fromEnv.includes("leaflock-stream") ||
      fromEnv.includes("stream.leaflock.com.au") ||
      /:\d{2,5}\//.test(fromEnv) ||
      fromEnv.endsWith("/live.mp3") ||
      fromEnv.endsWith("/live"))
  ) {
    // Never use the website itself as the stream (silent / yt-dlp proxy)
    if (
      fromEnv.includes("fm.leaflock.com.au") &&
      !fromEnv.includes("leaflock-stream")
    ) {
      return LEAFLOCK_STREAM_URL;
    }
    return fromEnv.split("?")[0];
  }
  return LEAFLOCK_STREAM_URL;
}

/**
 * Live-edge URL for explicit Tune In / resume after Pause.
 * ?edge= forces a new progressive request so the browser cannot resume a
 * stale buffer from a previous connection. Song-change must NOT use this.
 */
export function getLiveEdgeStreamUrl(): string {
  const base = getLockedInRadioStreamUrl().split("?")[0];
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}edge=${Date.now()}`;
}

export function radioArtwork(): MediaImage[] {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://fm.leaflock.com.au";
  const art = `${origin}/leaflock-radio-512.png`;
  return [
    { src: art, sizes: "512x512", type: "image/png" },
    { src: art, sizes: "256x256", type: "image/png" },
    { src: art, sizes: "96x96", type: "image/png" }
  ];
}
