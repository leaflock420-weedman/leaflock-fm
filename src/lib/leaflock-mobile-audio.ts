/**
 * Permanent mobile playback bridge.
 * One real <audio id="leaflockMobileAudio"> — never destroy, never clear src between songs.
 * Only pause on explicit user pause/stop or fatal error.
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";

const STREAM_URL =
  process.env.NEXT_PUBLIC_STREAM_URL ?? "https://stream.leaflock.com.au/main";
const STREAM_FALLBACK_URL =
  process.env.NEXT_PUBLIC_STREAM_FALLBACK_URL ??
  "https://stream.live.vc.bbcmedia.co.uk/bbc_6music";
const SILENT_URL = "/silent.mp3";

export type MobileAudioKind = "stream" | "silent";

function resolveTargetUrl(kind: MobileAudioKind): string {
  return kind === "stream" ? STREAM_URL : SILENT_URL;
}

/**
 * Returns the permanent mobile audio element.
 * Creates it once on document.body if missing (survives React remounts).
 */
export function getLeaflockMobileAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;

  let audio = document.getElementById(
    LEAFLOCK_MOBILE_AUDIO_ID
  ) as HTMLAudioElement | null;

  if (audio) return audio;

  audio = document.createElement("audio");
  audio.id = LEAFLOCK_MOBILE_AUDIO_ID;
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.preload = "auto";
  audio.setAttribute("aria-hidden", "true");
  audio.className = "pointer-events-none absolute h-px w-px opacity-0";
  document.body.appendChild(audio);
  return audio;
}

/**
 * Set src only when kind changes. Never clear between songs.
 */
export function ensureMobileAudioSrc(kind: MobileAudioKind): HTMLAudioElement | null {
  const audio = getLeaflockMobileAudio();
  if (!audio) return null;

  const target = resolveTargetUrl(kind);
  const bound = audio.dataset.leaflockSrc ?? "";

  if (bound === target && audio.src) {
    return audio;
  }

  audio.dataset.leaflockSrc = target;
  audio.loop = kind === "silent";
  audio.src = target;
  // load once when assigning a new mount — not between tracks of same kind
  audio.load();
  return audio;
}

export function setMobileAudioVolume(volume01: number, muted: boolean): void {
  const audio = getLeaflockMobileAudio();
  if (!audio) return;
  const vol = Math.min(1, Math.max(0, volume01));
  audio.volume = vol;
  audio.muted = muted || vol === 0;
}

/**
 * Start / resume permanent mobile audio. Safe to call repeatedly — does not clear src.
 */
export async function playMobileAudio(kind: MobileAudioKind): Promise<boolean> {
  const audio = ensureMobileAudioSrc(kind);
  if (!audio) return false;

  try {
    if (audio.paused) {
      await audio.play();
    }
    return true;
  } catch {
    if (kind === "stream") {
      try {
        const bound = audio.dataset.leaflockSrc ?? "";
        if (bound !== STREAM_FALLBACK_URL) {
          audio.dataset.leaflockSrc = STREAM_FALLBACK_URL;
          audio.loop = false;
          audio.src = STREAM_FALLBACK_URL;
          audio.load();
          await audio.play();
          return true;
        }
      } catch {
        // fall through
      }
    }
    return false;
  }
}

/**
 * User pause / stop only. Does not clear src. Does not destroy the element.
 */
export function pauseMobileAudio(): void {
  const audio = getLeaflockMobileAudio();
  if (!audio) return;
  audio.pause();
}

export function isMobileAudioPlaying(): boolean {
  const audio = getLeaflockMobileAudio();
  return Boolean(audio && !audio.paused);
}

export function mobileAudioKindForMode(listenMode: "live" | "solo"): MobileAudioKind {
  return listenMode === "live" ? "stream" : "silent";
}
