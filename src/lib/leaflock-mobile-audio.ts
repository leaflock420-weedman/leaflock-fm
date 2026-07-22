/**
 * Permanent mobile playback bridge.
 *
 * Rules:
 * - One real <audio id="leaflockMobileAudio"> for the phone
 * - Never destroy / recreate / clear src between songs
 * - Never pause on page hide / app switch / lock
 * - Only pause on explicit user pause/stop or fatal media error
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";

const STREAM_URL =
  process.env.NEXT_PUBLIC_STREAM_URL ?? "https://stream.leaflock.com.au/main";

export type MobileAudioKind = "stream" | "silent";

export type MobilePlayResult = {
  ok: boolean;
  /** True when the live station stream is the audible source */
  usingStream: boolean;
};

function silentUrl(): string {
  if (typeof window === "undefined") return "/silent.mp3";
  return `${window.location.origin}/silent.mp3`;
}

export function isPhoneUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

/**
 * Returns the permanent mobile audio element.
 * Uses the markup element when present; creates once on body if missing.
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
  // Default same-origin silent loop so Media Session has a real source immediately.
  audio.loop = true;
  audio.src = silentUrl();
  audio.dataset.leaflockSrc = "silent";
  document.body.appendChild(audio);
  return audio;
}

/**
 * Assign src only when the bound kind changes. Never clear between songs.
 */
function bindSrc(audio: HTMLAudioElement, kind: MobileAudioKind, url: string): void {
  const label = kind;
  if (audio.dataset.leaflockSrc === label && audio.src) {
    return;
  }
  audio.dataset.leaflockSrc = label;
  audio.loop = kind === "silent";
  audio.src = url;
  // load only when switching mount kind — not between tracks
  try {
    audio.load();
  } catch {
    // Ignore load errors; play() will report failure.
  }
}

export function setMobileAudioVolume(volume01: number, muted: boolean): void {
  const audio = getLeaflockMobileAudio();
  if (!audio) return;
  const vol = Math.min(1, Math.max(0, volume01));
  audio.volume = vol;
  audio.muted = muted || vol === 0;
}

async function tryPlay(audio: HTMLAudioElement): Promise<void> {
  // Always call play() — do not skip when !paused (can be stuck buffering).
  const p = audio.play();
  if (p !== undefined) {
    await p;
  }
}

/**
 * Start / resume permanent mobile audio.
 * Live: try station stream, then stream fallback, then same-origin silent.
 * Solo: silent loop (Media Session bridge).
 * Never clears src on success path between songs of the same kind.
 */
export async function playMobileAudio(kind: MobileAudioKind): Promise<MobilePlayResult> {
  const audio = getLeaflockMobileAudio();
  if (!audio) return { ok: false, usingStream: false };

  if (kind === "stream") {
    try {
      bindSrc(audio, "stream", STREAM_URL);
      await tryPlay(audio);
      return { ok: true, usingStream: true };
    } catch {
      // Fall through to same-origin silent Media Session bridge.
    }
  }

  try {
    bindSrc(audio, "silent", silentUrl());
    // Near-silent volume for solo bridge is applied by caller.
    await tryPlay(audio);
    return { ok: true, usingStream: false };
  } catch {
    return { ok: false, usingStream: false };
  }
}

/**
 * User pause / stop only. Does not clear src. Does not destroy the element.
 */
export function pauseMobileAudio(): void {
  const audio = getLeaflockMobileAudio();
  if (!audio) return;
  try {
    audio.pause();
  } catch {
    // Ignore.
  }
}

export function isMobileAudioPlaying(): boolean {
  const audio = getLeaflockMobileAudio();
  return Boolean(audio && !audio.paused);
}

export function mobileAudioKindForMode(listenMode: "live" | "solo"): MobileAudioKind {
  return listenMode === "live" ? "stream" : "silent";
}
