/**
 * Permanent phone media element for background audio after leaving Chrome.
 *
 * Chrome kills YouTube iframe audio when the browser is backgrounded.
 * A real same-origin <audio> element keeps playing until the user pauses
 * or closes the tab.
 *
 * Live mode prefers /api/fm/listen (station stream proxy).
 * Falls back to /bg-hold.wav so the media session never disappears.
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";

export type MobileAudioSource = "stream" | "hold";

function holdUrl(): string {
  if (typeof window === "undefined") return "/bg-hold.wav";
  return `${window.location.origin}/bg-hold.wav`;
}

function listenUrl(): string {
  if (typeof window === "undefined") return "/api/fm/listen";
  return `${window.location.origin}/api/fm/listen`;
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
  audio.loop = true;
  audio.src = holdUrl();
  audio.dataset.leaflockSrc = "hold";
  audio.setAttribute("aria-hidden", "true");
  audio.className = "pointer-events-none absolute h-px w-px opacity-0";
  document.body.appendChild(audio);
  return audio;
}

export function getMobileAudioSource(): MobileAudioSource {
  const audio = getLeaflockMobileAudio();
  return audio?.dataset.leaflockSrc === "stream" ? "stream" : "hold";
}

function bindSource(audio: HTMLAudioElement, kind: MobileAudioSource): void {
  const target = kind === "stream" ? listenUrl() : holdUrl();
  if (audio.dataset.leaflockSrc === kind && audio.getAttribute("src")) {
    return;
  }
  audio.dataset.leaflockSrc = kind;
  audio.loop = true;
  audio.src = target;
}

/**
 * Start permanent audio in the same user-gesture stack as Play.
 * Always starts hold immediately (reliable). Never throws.
 */
export function kickMobileBackgroundAudio(volume01 = 0.12): void {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;

    // Start with hold so play() always succeeds under user gesture.
    bindSource(audio, "hold");
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.05, volume01));
    void audio.play().catch(() => undefined);
    ensureMobileAudioContext();
  } catch {
    // Best-effort.
  }
}

/**
 * Upgrade to live stream proxy when available (audible radio after leaving Chrome).
 * Returns true when stream source is active.
 */
export async function upgradeMobileLiveStream(volume01 = 0.85): Promise<boolean> {
  const audio = getLeaflockMobileAudio();
  if (!audio) return false;

  try {
    const status = await fetch("/api/fm/listen-status", { cache: "no-store" });
    const payload = (await status.json()) as { source?: string };
    if (payload.source !== "stream") {
      // Keep hold running so session never disappears.
      bindSource(audio, "hold");
      audio.volume = Math.min(1, Math.max(0.08, volume01 * 0.15));
      if (audio.paused) void audio.play().catch(() => undefined);
      return false;
    }

    bindSource(audio, "stream");
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0.2, volume01));
    await audio.play();
    return !audio.paused && audio.dataset.leaflockSrc === "stream";
  } catch {
    try {
      bindSource(audio, "hold");
      audio.volume = 0.12;
      if (audio.paused) void audio.play().catch(() => undefined);
    } catch {
      // ignore
    }
    return false;
  }
}

export async function ensureMobileBackgroundAudio(): Promise<boolean> {
  try {
    kickMobileBackgroundAudio();
    const audio = getLeaflockMobileAudio();
    if (!audio) return false;
    if (audio.paused) await audio.play();
    return !audio.paused;
  } catch {
    return false;
  }
}

/** User pause/stop only. Never clear src. Never destroy. */
export function pauseMobileBackgroundAudio(): void {
  try {
    getLeaflockMobileAudio()?.pause();
  } catch {
    // ignore
  }
}

export function setMobileAudioVolume(volume01: number, muted: boolean): void {
  const audio = getLeaflockMobileAudio();
  if (!audio) return;
  audio.volume = Math.min(1, Math.max(0, volume01));
  audio.muted = muted || volume01 === 0;
}

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;

export function ensureMobileAudioContext(): void {
  try {
    type WebKitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WebKitWindow).webkitAudioContext;
    if (!Ctor) return;

    if (!audioContext) {
      audioContext = new Ctor();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      oscillator = osc;
    }
    void audioContext.resume();
  } catch {
    // Optional.
  }
}

export function stopMobileAudioContext(): void {
  try {
    oscillator?.stop();
    oscillator?.disconnect();
    oscillator = null;
    void audioContext?.close();
    audioContext = null;
  } catch {
    // ignore
  }
}
