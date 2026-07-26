/**
 * Continuous Locked In Radio — fixed public stream URL only.
 * Default: https://stream.leaflock.com.au/live.mp3
 * Fallback when DNS missing: NEXT_PUBLIC_STREAM_URL (Render stream service).
 */

export const LEAFLOCK_RADIO_AUDIO_ID = "leaflockRadio";

/** Canonical public stream (set DNS when ready). */
export const LEAFLOCK_STREAM_CANONICAL = "https://stream.leaflock.com.au/live.mp3";

export const LEAFLOCK_RADIO_STATION = {
  title: "LeafLock FM 104.2",
  artist: "DJ420 — Locked In Radio",
  album: "LeafLock FM Live"
} as const;

/**
 * Permanent <audio src> — never append ?t= timestamps.
 * Prefer env (deployed continuous encoder), then canonical stream host.
 */
export function getLockedInRadioStreamUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_STREAM_URL?.trim();
  if (fromEnv) return fromEnv;
  return LEAFLOCK_STREAM_CANONICAL;
}

export function radioArtwork(): MediaImage[] {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://fm.leaflock.com.au";
  const icon512 = `${origin}/leaflock-radio-512.png`;
  const logo = `${origin}/leaflock-logo.png`;
  return [
    { src: icon512, sizes: "512x512", type: "image/png" },
    { src: logo, sizes: "512x512", type: "image/png" },
    { src: logo, sizes: "256x256", type: "image/png" },
    { src: logo, sizes: "96x96", type: "image/png" }
  ];
}
