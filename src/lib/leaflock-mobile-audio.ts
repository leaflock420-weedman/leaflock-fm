/**
 * Permanent Live Radio <audio> element.
 *
 * Keeps playing after the user leaves Chrome (YouTube iframes cannot).
 * Source is always /api/fm/listen — set once, never swapped per song.
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";
export const LIVE_RADIO_STREAM_PATH = "/api/fm/listen";

export type LiveAudioMode = "stream" | "hold-loop" | "unknown";

function liveStreamUrl(): string {
  if (typeof window === "undefined") return LIVE_RADIO_STREAM_PATH;
  return `${window.location.origin}${LIVE_RADIO_STREAM_PATH}`;
}

function holdUrl(): string {
  if (typeof window === "undefined") return "/bg-hold.wav";
  return `${window.location.origin}/bg-hold.wav`;
}

export function isPhoneUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

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

/** Bind Live Radio mount once. Never change src between songs. */
export function ensureLiveRadioSource(): HTMLAudioElement | null {
  const audio = getLeaflockMobileAudio();
  if (!audio) return null;

  if (audio.dataset.leaflockMode !== "live-radio") {
    audio.dataset.leaflockMode = "live-radio";
    audio.loop = true;
    audio.src = liveStreamUrl();
  }
  return audio;
}

/**
 * Start permanent Live Radio audio in the user-gesture stack.
 * Always succeeds with /api/fm/listen (stream or hold-loop on server).
 */
export function startLiveRadioAudio(volume01 = 0.85): void {
  try {
    const audio = ensureLiveRadioSource();
    if (!audio) return;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.15, volume01));
    void audio.play().catch(() => undefined);
  } catch {
    // never throw into UI
  }
}

export async function resumeLiveRadioAudio(volume01 = 0.85): Promise<boolean> {
  try {
    const audio = ensureLiveRadioSource();
    if (!audio) return false;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.15, volume01));
    if (audio.paused) await audio.play();
    return !audio.paused;
  } catch {
    return false;
  }
}

export function pauseLiveRadioAudio(): void {
  try {
    getLeaflockMobileAudio()?.pause();
  } catch {
    // ignore
  }
}

export function setLiveRadioVolume(volume01: number, muted: boolean): void {
  const audio = getLeaflockMobileAudio();
  if (!audio) return;
  audio.volume = Math.min(1, Math.max(0, volume01));
  audio.muted = muted || volume01 === 0;
}

export function isLiveRadioPlaying(): boolean {
  const audio = getLeaflockMobileAudio();
  return Boolean(audio && !audio.paused);
}

/** Probe whether /api/fm/listen is a real station stream or hold-loop. */
export async function probeLiveAudioMode(): Promise<LiveAudioMode> {
  try {
    const response = await fetch("/api/fm/listen-status", { cache: "no-store" });
    if (!response.ok) return "unknown";
    const payload = (await response.json()) as { source?: string };
    if (payload.source === "stream") return "stream";
    if (payload.source === "hold-loop" || payload.source === "hold") return "hold-loop";
    return "unknown";
  } catch {
    return "unknown";
  }
}

// --- Private jukebox soft hold ---

export function kickPrivateJukeboxHold(volume01 = 0.08): void {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;
    if (audio.dataset.leaflockMode === "live-radio" && !audio.paused) return;

    audio.dataset.leaflockMode = "jukebox-hold";
    audio.loop = true;
    if (audio.dataset.leaflockSrc !== "hold") {
      audio.dataset.leaflockSrc = "hold";
      audio.src = holdUrl();
    }
    audio.muted = false;
    audio.volume = Math.min(0.15, Math.max(0.05, volume01));
    void audio.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

export function pauseMobileBackgroundAudio(): void {
  pauseLiveRadioAudio();
}

export function setMobileAudioVolume(volume01: number, muted: boolean): void {
  setLiveRadioVolume(volume01, muted);
}

export function kickMobileBackgroundAudio(volume01 = 0.12): void {
  kickPrivateJukeboxHold(volume01);
}

export async function ensureMobileBackgroundAudio(): Promise<boolean> {
  return resumeLiveRadioAudio();
}

export async function upgradeMobileLiveStream(volume01 = 0.85): Promise<boolean> {
  return resumeLiveRadioAudio(volume01);
}

export function getMobileAudioSource(): "stream" | "hold" {
  const audio = getLeaflockMobileAudio();
  if (audio?.dataset.leaflockMode === "live-radio") return "stream";
  return "hold";
}

export function ensureMobileAudioContext(): void {}
export function stopMobileAudioContext(): void {}
