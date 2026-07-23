/**
 * Lightweight Media Session host for phones.
 * Live room music = YouTube (unless DJ420_UPSTREAM_URL is a real Icecast stream).
 * Permanent element plays silent.mp3 at near-zero volume so the OS keeps
 * Media Session / lock-screen controls while the page is backgrounded.
 *
 * NOTE: YouTube iframe audio is killed by Android Chrome when the app is fully
 * backgrounded. True audible background music requires a real Icecast stream
 * via DJ420_UPSTREAM_URL — never reintroduce yt-dlp on the web dyno (OOM).
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";
export const LIVE_RADIO_STREAM_PATH = "/live.mp3";
export const DJ420_PUBLIC_STREAM_URL = "https://fm.leaflock.com.au/live.mp3";

/** Volume low enough to be inaudible as music but high enough Android often keeps the session. */
const HOST_VOLUME = 0.02;

export type LiveAudioMode = "stream" | "hold-loop" | "silent" | "unknown";

function liveStreamUrl(): string {
  if (typeof window === "undefined") return LIVE_RADIO_STREAM_PATH;
  return `${window.location.origin}${LIVE_RADIO_STREAM_PATH}`;
}

function silentUrl(): string {
  if (typeof window === "undefined") return "/silent.mp3";
  return `${window.location.origin}/silent.mp3`;
}

export function isPhoneUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function hardenAudioEl(audio: HTMLAudioElement): void {
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.setAttribute("x-webkit-airplay", "allow");
  audio.preload = "auto";
  audio.loop = true;
  // Help some Android builds treat this as ongoing media.
  try {
    (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback =
      false;
  } catch {
    // ignore
  }
}

export function getLeaflockMobileAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;

  let audio = document.getElementById(
    LEAFLOCK_MOBILE_AUDIO_ID
  ) as HTMLAudioElement | null;

  if (audio) {
    hardenAudioEl(audio);
    return audio;
  }

  audio = document.createElement("audio");
  audio.id = LEAFLOCK_MOBILE_AUDIO_ID;
  hardenAudioEl(audio);
  audio.src = silentUrl();
  audio.setAttribute("aria-hidden", "true");
  audio.className = "pointer-events-none absolute h-px w-px opacity-0";
  document.body.appendChild(audio);
  return audio;
}

/** Near-silent OS host (never the song). Keeps pull-down media controls alive. */
export function startSilentMediaHost(): void {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;
    hardenAudioEl(audio);
    audio.dataset.leaflockMode = "silent-host";
    if (!audio.src.includes("silent.mp3")) {
      audio.src = silentUrl();
    }
    audio.muted = false;
    audio.volume = HOST_VOLUME;
    if (audio.paused || audio.ended) {
      void audio.play().catch(() => undefined);
    }
  } catch {
    // ignore
  }
}

/** Full-volume continuous stream (only when status says real stream). */
export function startLiveRadioAudio(volume01 = 0.85): void {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;
    hardenAudioEl(audio);
    audio.dataset.leaflockMode = "live-radio";
    if (!audio.src.includes("/live.mp3") && !audio.src.includes("/api/fm/listen")) {
      audio.src = `${liveStreamUrl()}?t=${Date.now()}`;
    }
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.35, volume01));
    void audio.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

export async function resumeLiveRadioAudio(volume01 = 0.85): Promise<boolean> {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return false;
    hardenAudioEl(audio);
    audio.muted = false;
    // Host / silent path uses a tiny volume; real stream uses full volume.
    const isStream = audio.dataset.leaflockMode === "live-radio";
    if (isStream) {
      audio.volume = Math.min(1, Math.max(0.4, volume01));
    } else {
      audio.volume = Math.min(HOST_VOLUME, Math.max(0.001, volume01));
    }
    if (audio.paused || audio.ended) {
      try {
        await audio.play();
      } catch {
        // Autoplay / background policy — caller may retry on gesture.
      }
    }
    return !audio.paused;
  } catch {
    return false;
  }
}

export function pauseLiveRadioAudio(): void {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;
    audio.dataset.leaflockMode = "paused";
    audio.pause();
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

export async function probeLiveAudioMode(): Promise<LiveAudioMode> {
  try {
    const response = await fetch("/api/fm/listen-status", { cache: "no-store" });
    if (!response.ok) return "unknown";
    const payload = (await response.json()) as { source?: string };
    if (payload.source === "stream") return "stream";
    if (payload.source === "silent" || payload.source === "hold") return "silent";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function kickPrivateJukeboxHold(): void {
  startSilentMediaHost();
}

export function pauseMobileBackgroundAudio(): void {
  pauseLiveRadioAudio();
}

export function setMobileAudioVolume(volume01: number, muted: boolean): void {
  setLiveRadioVolume(volume01, muted);
}

export function kickMobileBackgroundAudio(): void {
  startSilentMediaHost();
}

export async function ensureMobileBackgroundAudio(): Promise<boolean> {
  startSilentMediaHost();
  return true;
}

export async function upgradeMobileLiveStream(volume01 = 0.85): Promise<boolean> {
  return resumeLiveRadioAudio(volume01);
}

export function getMobileAudioSource(): "stream" | "hold" {
  return "hold";
}

export function ensureLiveRadioSource(): HTMLAudioElement | null {
  return getLeaflockMobileAudio();
}

export function advanceLiveRadioToNextTrack(): void {
  // No-op without continuous track streamer (removed to stop OOM).
}

export function ensureMobileAudioContext(): void {}
export function stopMobileAudioContext(): void {}
