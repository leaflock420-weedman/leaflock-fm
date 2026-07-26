/**
 * LeafLock Locked In Radio — Xiaohongshu-style architecture
 *
 * One permanent native <audio> (or <video>) element plays ONE continuous
 * MP3/AAC stream from a real encoder (Liquidsoap → Icecast). Chrome owns
 * that media session; pull-down / lock-screen controls keep working after
 * you leave the browser.
 *
 * DJ crossfade happens ON THE SERVER (Liquidsoap), not on the phone.
 * Private jukebox keeps YouTube + client DJ blend separately.
 */

export const LEAFLOCK_RADIO_AUDIO_ID = "leaflockRadio";

/** Stable mount on the main site (proxies Icecast when DJ420_UPSTREAM_URL is set). */
export const LEAFLOCK_RADIO_MOUNT_PATH = "/live.mp3";

export const LEAFLOCK_RADIO_STATION = {
  title: "LeafLock Radio",
  artist: "Locked In Radio",
  album: "LeafLock FM 104.2"
} as const;

/**
 * Public stream URL for the permanent <audio src>.
 * NEVER append ?t= timestamps — that breaks continuous radio and forces reloads.
 */
export function getLockedInRadioStreamUrl(): string {
  if (typeof window !== "undefined") {
    const fromEnv = process.env.NEXT_PUBLIC_STREAM_URL?.trim();
    if (fromEnv && !fromEnv.includes("youtube") && !fromEnv.includes("youtu.be")) {
      return fromEnv;
    }
    return `${window.location.origin}${LEAFLOCK_RADIO_MOUNT_PATH}`;
  }

  return (
    process.env.NEXT_PUBLIC_STREAM_URL?.trim() ||
    process.env.PRIMARY_STREAM_URL?.trim() ||
    `https://fm.leaflock.com.au${LEAFLOCK_RADIO_MOUNT_PATH}`
  );
}

export function radioArtwork(): MediaImage[] {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://fm.leaflock.com.au";
  const logo = `${origin}/leaflock-logo.png`;
  return [
    { src: logo, sizes: "96x96", type: "image/png" },
    { src: logo, sizes: "256x256", type: "image/png" },
    { src: logo, sizes: "512x512", type: "image/png" }
  ];
}
