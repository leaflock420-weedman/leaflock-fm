/**
 * Permanent Live Radio <audio> element.
 *
 * Keeps playing after the user leaves Chrome (YouTube iframes cannot).
 * Source is always same-origin /live.mp3 — set once, never swapped per song.
 * Public URL: https://fm.leaflock.com.au/live.mp3
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";
/** Same-origin mount (works without stream.leaflock.com.au DNS). */
export const LIVE_RADIO_STREAM_PATH = "/live.mp3";
export const DJ420_PUBLIC_STREAM_URL =
  process.env.NEXT_PUBLIC_STREAM_URL ?? "https://fm.leaflock.com.au/live.mp3";

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

/**
 * Bind Live Radio mount. Path is always /live.mp3 (never changes).
 * Cache-bust query only reloads the current station track payload.
 */
export function ensureLiveRadioSource(forceReload = false): HTMLAudioElement | null {
  const audio = getLeaflockMobileAudio();
  if (!audio) return null;

  audio.dataset.leaflockMode = "live-radio";
  // Do not loop a single track forever — on ended we reload /live.mp3 for the next song.
  audio.loop = false;

  const base = liveStreamUrl();
  if (forceReload || !audio.getAttribute("src")?.includes("/live.mp3")) {
    audio.src = `${base}?t=${Date.now()}`;
  }
  return audio;
}

function applyLiveOffset(audio: HTMLAudioElement) {
  // Server may send start offset via header; client also reads data attribute after fetch.
  const offset = Number(audio.dataset.leaflockOffset || "0");
  if (!Number.isFinite(offset) || offset < 1) return;
  try {
    if (audio.seekable.length > 0 || audio.duration > offset) {
      audio.currentTime = offset;
    }
  } catch {
    // ignore seek errors
  }
}

/**
 * Start permanent Live Radio audio in the user-gesture stack.
 * Full volume — this is the real music path for live room.
 */
export function startLiveRadioAudio(volume01 = 0.85): void {
  try {
    const audio = ensureLiveRadioSource(true);
    if (!audio) return;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.35, volume01));

    // Sync start position to DJ420 timeline when metadata is ready.
    void fetch("/api/fm/now-playing", { cache: "no-store" })
      .then((r) => r.json())
      .then((np: { currentOffsetSeconds?: number }) => {
        audio.dataset.leaflockOffset = String(
          Math.max(0, Math.floor(np.currentOffsetSeconds ?? 0))
        );
        applyLiveOffset(audio);
      })
      .catch(() => undefined);

    const onMeta = () => {
      applyLiveOffset(audio);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener(
      "canplay",
      () => {
        applyLiveOffset(audio);
      },
      { once: true }
    );

    void audio.play().catch(() => undefined);
  } catch {
    // never throw into UI
  }
}

export async function resumeLiveRadioAudio(volume01 = 0.85): Promise<boolean> {
  try {
    const audio = ensureLiveRadioSource(false);
    if (!audio) return false;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.35, volume01));
    if (audio.paused) await audio.play();
    return !audio.paused;
  } catch {
    return false;
  }
}

/**
 * When a track ends, reload the same mount path for the next DJ420 track.
 * Safe to call while backgrounded once a media session is active.
 */
export function advanceLiveRadioToNextTrack(volume01 = 0.85): void {
  try {
    const audio = ensureLiveRadioSource(true);
    if (!audio) return;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.35, volume01));
    void audio.play().catch(() => undefined);
  } catch {
    // ignore
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

/** Probe whether /live.mp3 is a real station stream or hold. */
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
