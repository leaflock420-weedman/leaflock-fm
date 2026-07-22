/**
 * Permanent Live Radio audio element.
 *
 * Live Radio sound MUST come from this element only — not YouTube, not Web Audio.
 * DJ420 / station stream is mixed server-side; the client never changes src per song.
 *
 * Rules:
 * - One element: #leaflockMobileAudio
 * - Live src is always /api/fm/listen (set once)
 * - Never destroy / recreate / clear src between songs
 * - Never pause on visibilitychange / pagehide / blur / freeze
 * - Only pause on explicit user pause/stop
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";

/** Fixed Live Radio mount — do not change between tracks. */
export const LIVE_RADIO_STREAM_PATH = "/api/fm/listen";

function liveStreamUrl(): string {
  if (typeof window === "undefined") return LIVE_RADIO_STREAM_PATH;
  return `${window.location.origin}${LIVE_RADIO_STREAM_PATH}`;
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

/**
 * Bind the permanent Live Radio source once. Never reassign between songs.
 */
export function ensureLiveRadioSource(): HTMLAudioElement | null {
  const audio = getLeaflockMobileAudio();
  if (!audio) return null;

  if (audio.dataset.leaflockMode !== "live-radio") {
    audio.dataset.leaflockMode = "live-radio";
    // loop helps when server falls back to a finite hold file; Icecast ignores it.
    audio.loop = true;
    audio.src = liveStreamUrl();
  }
  return audio;
}

/**
 * Start Live Radio inside the user gesture. Synchronous play() kick.
 * Does not use Web Audio (suspended in background on mobile).
 */
export function startLiveRadioAudio(volume01 = 0.85): void {
  try {
    const audio = ensureLiveRadioSource();
    if (!audio) return;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.05, volume01));
    void audio.play().catch(() => undefined);
  } catch {
    // Best-effort — never throw into UI play path.
  }
}

export async function resumeLiveRadioAudio(volume01 = 0.85): Promise<boolean> {
  try {
    const audio = ensureLiveRadioSource();
    if (!audio) return false;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.05, volume01));
    if (audio.paused) {
      await audio.play();
    }
    return !audio.paused;
  } catch {
    return false;
  }
}

/** User pause/stop only. */
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

// --- Private jukebox helpers (Media Session hold only; YouTube is audible) ---

function holdUrl(): string {
  if (typeof window === "undefined") return "/bg-hold.wav";
  return `${window.location.origin}/bg-hold.wav`;
}

/** Soft hold for private jukebox Media Session — not used for Live Radio songs. */
export function kickPrivateJukeboxHold(volume01 = 0.08): void {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;
    // Do not steal live-radio source if already in live mode on this element.
    if (audio.dataset.leaflockMode === "live-radio" && !audio.paused) {
      return;
    }
    audio.dataset.leaflockMode = "jukebox-hold";
    audio.loop = true;
    if (!audio.getAttribute("src") || audio.dataset.leaflockSrc !== "hold") {
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

/** @deprecated use startLiveRadioAudio / kickPrivateJukeboxHold */
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

export function ensureMobileAudioContext(): void {
  // Intentionally empty — Web Audio is suspended in mobile background and caused silent "playing" sessions.
}

export function stopMobileAudioContext(): void {
  // no-op
}
