/**
 * Permanent phone media element for background / lock-screen.
 *
 * YouTube iframes cannot keep audio in a background Chrome tab.
 * This real <audio> element holds the Media Session so the OS keeps
 * the session alive. It never blocks the original YouTube player.
 *
 * Rules:
 * - One element: #leaflockMobileAudio
 * - Never destroy / recreate / clear src between songs
 * - Never pause on hide / app switch / lock
 * - Only pause on explicit user pause/stop
 * - Never throw into the UI play path — always best-effort
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";

function silentUrl(): string {
  if (typeof window === "undefined") return "/silent.mp3";
  return `${window.location.origin}/silent.mp3`;
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
  audio.src = silentUrl();
  audio.dataset.leaflockSrc = "silent";
  audio.setAttribute("aria-hidden", "true");
  audio.className = "pointer-events-none absolute h-px w-px opacity-0";
  document.body.appendChild(audio);
  return audio;
}

/**
 * Kick permanent media inside the same user-gesture stack as Play.
 * Must call audio.play() synchronously (do not await before YouTube playVideo).
 * Always uses same-origin silent.mp3. Never throws.
 */
export function kickMobileBackgroundAudio(): void {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;

    // Keep src stable — do not clear between songs.
    if (audio.dataset.leaflockSrc !== "silent" || !audio.getAttribute("src")) {
      audio.dataset.leaflockSrc = "silent";
      audio.loop = true;
      audio.src = silentUrl();
    }

    // Near-silent but non-zero: some Android builds drop fully-silent streams.
    audio.muted = false;
    audio.volume = 0.05;

    // Fire play() in this tick so it inherits the user gesture.
    void audio.play().catch(() => undefined);
    ensureMobileAudioContext();
  } catch {
    // Best-effort only.
  }
}

/** Async ensure (for pause-recovery). Never throws. */
export async function ensureMobileBackgroundAudio(): Promise<boolean> {
  try {
    kickMobileBackgroundAudio();
    const audio = getLeaflockMobileAudio();
    if (!audio) return false;
    if (audio.paused) {
      await audio.play();
    }
    return !audio.paused;
  } catch {
    return false;
  }
}

/** User pause/stop only. Never clear src. */
export function pauseMobileBackgroundAudio(): void {
  try {
    const audio = getLeaflockMobileAudio();
    audio?.pause();
  } catch {
    // ignore
  }
}

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;

/**
 * Optional Web Audio hold — some phones keep the media session longer
 * when a tiny oscillator is running alongside <audio>.
 */
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
