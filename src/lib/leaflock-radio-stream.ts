/**
 * Public Live Room stream config — Xiaohongshu / real radio model.
 *
 * One permanent native <audio src={FIXED_URL}>.
 * DJ mix is already inside the continuous stream (Liquidsoap/Icecast).
 * Phone controller shows station branding only — not song titles.
 */

export const LEAFLOCK_RADIO_AUDIO_ID = "leaflockRadio";

/** Preferred public continuous mount (encoder). */
export const LEAFLOCK_STREAM_HOST_URL = "https://stream.leaflock.com.au/live.mp3";

/** Same-origin mount (proxies encoder when DJ420_UPSTREAM_URL is set). */
export const LEAFLOCK_RADIO_MOUNT_PATH = "/live.mp3";

export const LEAFLOCK_RADIO_STATION = {
  title: "LeafLock Radio",
  artist: "Locked In Radio",
  album: "FM 104.2"
} as const;

/**
 * Fixed stream URL for the permanent <audio>.
 * Never append ?t= timestamps — continuous radio must keep one stable src.
 */
export function getLockedInRadioStreamUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_STREAM_URL?.trim();
  if (fromEnv) return fromEnv;

  // Prefer dedicated stream host when configured at build time.
  const host = process.env.NEXT_PUBLIC_STREAM_HOST_URL?.trim();
  if (host) return host;

  if (typeof window !== "undefined") {
    // Same-origin continuous mount (works with cookies / no CORS issues).
    return `${window.location.origin}${LEAFLOCK_RADIO_MOUNT_PATH}`;
  }

  return `https://fm.leaflock.com.au${LEAFLOCK_RADIO_MOUNT_PATH}`;
}

export function radioArtwork(): MediaImage[] {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://fm.leaflock.com.au";
  // Prefer dedicated radio art when present; fall back to logo.
  const primary = `${origin}/leaflock-radio-512.png`;
  const logo = `${origin}/leaflock-logo.png`;
  return [
    { src: primary, sizes: "512x512", type: "image/png" },
    { src: logo, sizes: "512x512", type: "image/png" },
    { src: logo, sizes: "256x256", type: "image/png" },
    { src: logo, sizes: "96x96", type: "image/png" }
  ];
}
