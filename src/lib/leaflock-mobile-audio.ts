/**
 * LeafLock Locked In Radio — permanent HTML <audio> engine.
 *
 * Plays a DIRECT CDN audio URL from /api/fm/radio-url (not a Render-proxied
 * multi‑MB stream that times out mid-song). That is what keeps going after
 * you leave Chrome / lock the phone.
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";
export const LEAFLOCK_MOBILE_AUDIO_B_ID = "leaflockMobileAudioB";
export const LIVE_RADIO_STREAM_PATH = "/live.mp3";
export const DJ420_PUBLIC_STREAM_URL = "https://fm.leaflock.com.au/live.mp3";
export const LOCKED_IN_RADIO_STATION = "LeafLock Locked In Radio";

const HOST_VOLUME = 0.02;
const BLEND_MS = 7000;

export type LiveAudioMode = "stream" | "radio" | "hold-loop" | "silent" | "unknown";

export type RadioTrackPayload = {
  ok: boolean;
  url?: string;
  title?: string;
  artist?: string;
  offsetSeconds?: number;
  durationSec?: number;
  videoId?: string;
  revision?: number;
  thumbnail?: string | null;
  source?: string;
  error?: string;
};

let watchdogTimer: number | null = null;
let lastWatchdogTime = 0;
let lastWatchdogPos = 0;
let radioIntentPlaying = false;
let lastRadioMeta: RadioTrackPayload | null = null;
let chainBusy = false;

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
  try {
    (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback =
      false;
  } catch {
    // ignore
  }
}

function ensureAudio(id: string): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  let audio = document.getElementById(id) as HTMLAudioElement | null;
  if (audio) {
    hardenAudioEl(audio);
    return audio;
  }
  audio = document.createElement("audio");
  audio.id = id;
  hardenAudioEl(audio);
  audio.setAttribute("aria-hidden", "true");
  audio.className = "pointer-events-none absolute h-px w-px opacity-0";
  document.body.appendChild(audio);
  return audio;
}

export function getLeaflockMobileAudio(): HTMLAudioElement | null {
  return ensureAudio(LEAFLOCK_MOBILE_AUDIO_ID);
}

function getBlendAudio(): HTMLAudioElement | null {
  return ensureAudio(LEAFLOCK_MOBILE_AUDIO_B_ID);
}

export function isLockedInRadioMode(): boolean {
  const audio = getLeaflockMobileAudio();
  return audio?.dataset.leaflockMode === "live-radio";
}

export function getLastRadioMeta(): RadioTrackPayload | null {
  return lastRadioMeta;
}

/** Near-silent OS host for private jukebox only — never for live radio. */
export function startSilentMediaHost(): void {
  if (radioIntentPlaying) return;
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return;
    hardenAudioEl(audio);
    audio.dataset.leaflockMode = "silent-host";
    audio.loop = true;
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

export async function fetchRadioTrack(): Promise<RadioTrackPayload | null> {
  try {
    const res = await fetch(`/api/fm/radio-url?t=${Date.now()}`, { cache: "no-store" });
    const data = (await res.json()) as RadioTrackPayload;
    if (!res.ok || !data.ok || !data.url) return null;
    lastRadioMeta = data;
    return data;
  } catch {
    return null;
  }
}

function bindRadioElementGuards(audio: HTMLAudioElement, volume01: number): void {
  if (audio.dataset.leaflockGuards === "1") return;
  audio.dataset.leaflockGuards = "1";

  const kick = () => {
    if (!radioIntentPlaying) return;
    if (audio.dataset.leaflockMode !== "live-radio") return;
    void keepLockedInRadioAlive(volume01);
  };

  audio.addEventListener("ended", () => {
    if (!radioIntentPlaying) return;
    void chainNextRadioTrack(volume01);
  });
  audio.addEventListener("error", () => {
    if (!radioIntentPlaying) return;
    window.setTimeout(kick, 400);
  });
  audio.addEventListener("stalled", () => {
    if (!radioIntentPlaying) return;
    window.setTimeout(kick, 800);
  });
  audio.addEventListener("suspend", () => {
    // Some Android builds fire suspend in background — do not stop; resume if paused.
    if (!radioIntentPlaying) return;
    if (audio.paused) {
      void audio.play().catch(() => {
        window.setTimeout(kick, 500);
      });
    }
  });
  audio.addEventListener("pause", () => {
    if (!radioIntentPlaying) return;
    // OS paused us — force back open (user pause sets radioIntentPlaying=false first).
    window.setTimeout(() => {
      if (!radioIntentPlaying) return;
      if (audio.ended) {
        void chainNextRadioTrack(volume01);
        return;
      }
      void audio.play().catch(() => {
        void keepLockedInRadioAlive(volume01);
      });
    }, 120);
  });
}

function startWatchdog(volume01: number): void {
  if (typeof window === "undefined") return;
  if (watchdogTimer !== null) window.clearInterval(watchdogTimer);
  lastWatchdogTime = Date.now();
  lastWatchdogPos = 0;

  watchdogTimer = window.setInterval(() => {
    if (!radioIntentPlaying) return;
    const audio = getLeaflockMobileAudio();
    if (!audio || audio.dataset.leaflockMode !== "live-radio") {
      void keepLockedInRadioAlive(volume01);
      return;
    }

    if (audio.ended || audio.error) {
      void chainNextRadioTrack(volume01);
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        void keepLockedInRadioAlive(volume01);
      });
      return;
    }

    // Stall: currentTime not advancing while "playing"
    const pos = audio.currentTime || 0;
    const now = Date.now();
    if (Math.abs(pos - lastWatchdogPos) < 0.05) {
      if (now - lastWatchdogTime > 6000) {
        lastWatchdogTime = now;
        void keepLockedInRadioAlive(volume01);
      }
    } else {
      lastWatchdogPos = pos;
      lastWatchdogTime = now;
    }

    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch {
        // ignore
      }
    }
  }, 3000);
}

export type StartLockedInOptions = {
  volume01?: number;
  offsetSeconds?: number;
  forceReload?: boolean;
};

/**
 * Start Locked In Radio from a user gesture.
 * Uses direct CDN URL so the stream does not die on Render proxy timeouts.
 */
export async function startLockedInRadio(
  options: StartLockedInOptions = {}
): Promise<boolean> {
  const volume01 = options.volume01 ?? 0.85;
  radioIntentPlaying = true;

  const audio = getLeaflockMobileAudio();
  if (!audio) return false;

  hardenAudioEl(audio);
  bindRadioElementGuards(audio, volume01);
  audio.dataset.leaflockMode = "live-radio";
  audio.loop = false;
  audio.muted = false;
  audio.volume = Math.min(1, Math.max(0.4, volume01));

  const track = await fetchRadioTrack();
  if (!track?.url) {
    // Fallback: try /live.mp3 redirect mount
    audio.src = `${typeof window !== "undefined" ? window.location.origin : ""}${LIVE_RADIO_STREAM_PATH}?t=${Date.now()}`;
    try {
      await audio.play();
      startWatchdog(volume01);
      return !audio.paused;
    } catch {
      return false;
    }
  }

  // Avoid needless reloads mid-song unless forced or track changed.
  const sameTrack =
    !options.forceReload &&
    audio.src &&
    track.videoId &&
    audio.dataset.videoId === track.videoId &&
    !audio.ended &&
    !audio.error;

  if (!sameTrack) {
    audio.dataset.videoId = track.videoId || "";
    audio.src = track.url;
    try {
      audio.load();
    } catch {
      // ignore
    }
  }

  try {
    await audio.play();
  } catch {
    return false;
  }

  const offset =
    options.offsetSeconds != null
      ? options.offsetSeconds
      : track.offsetSeconds != null
        ? track.offsetSeconds
        : 0;

  if (offset > 1.5) {
    const seek = () => {
      try {
        if (Number.isFinite(audio.duration) && audio.duration > offset) {
          audio.currentTime = Math.min(offset, Math.max(0, audio.duration - 1.5));
        } else {
          audio.currentTime = offset;
        }
      } catch {
        // ignore
      }
    };
    seek();
    audio.addEventListener("loadedmetadata", seek, { once: true });
    audio.addEventListener("canplay", seek, { once: true });
  }

  if (track.title) {
    updateLockedInRadioMetadata({
      title: track.title,
      artist: track.artist || LOCKED_IN_RADIO_STATION,
      artworkUrl: track.thumbnail,
      playing: true
    });
  }

  startWatchdog(volume01);
  return !audio.paused;
}

export async function keepLockedInRadioAlive(volume01 = 0.85): Promise<boolean> {
  if (!radioIntentPlaying) return false;
  const audio = getLeaflockMobileAudio();
  if (audio && !audio.paused && !audio.ended && !audio.error && audio.dataset.leaflockMode === "live-radio") {
    return true;
  }
  return startLockedInRadio({ volume01, forceReload: true });
}

export async function chainNextRadioTrack(volume01 = 0.85): Promise<boolean> {
  if (!radioIntentPlaying) return false;
  if (chainBusy) return false;
  chainBusy = true;
  try {
    // Small delay so station API can advance past the finished track
    await new Promise((r) => window.setTimeout(r, 350));
    return await startLockedInRadio({
      volume01,
      forceReload: true,
      offsetSeconds: 0
    });
  } finally {
    chainBusy = false;
  }
}

/** Alias */
export function startLiveRadioAudio(volume01 = 0.85): void {
  void startLockedInRadio({ volume01, forceReload: true });
}

export async function resumeLiveRadioAudio(volume01 = 0.85): Promise<boolean> {
  if (!radioIntentPlaying && getLeaflockMobileAudio()?.dataset.leaflockMode !== "live-radio") {
    // private jukebox host path
    try {
      const audio = getLeaflockMobileAudio();
      if (!audio) return false;
      audio.volume = Math.min(HOST_VOLUME, Math.max(0.001, volume01));
      if (audio.paused) await audio.play();
      return !audio.paused;
    } catch {
      return false;
    }
  }
  radioIntentPlaying = true;
  const audio = getLeaflockMobileAudio();
  if (audio && audio.dataset.leaflockMode === "live-radio" && !audio.ended && !audio.error) {
    audio.volume = Math.min(1, Math.max(0.4, volume01));
    try {
      if (audio.paused) await audio.play();
      if (!audio.paused) {
        startWatchdog(volume01);
        return true;
      }
    } catch {
      // fall through
    }
  }
  return startLockedInRadio({ volume01, forceReload: true });
}

/**
 * Crossfade into the next radio track (dual HTML audio).
 */
export async function crossfadeLockedInRadio(
  volume01 = 0.85,
  offsetSeconds = 0
): Promise<boolean> {
  if (!radioIntentPlaying) radioIntentPlaying = true;
  const outgoing = getLeaflockMobileAudio();
  const incoming = getBlendAudio();
  if (!outgoing || !incoming) {
    return startLockedInRadio({ volume01, forceReload: true, offsetSeconds });
  }

  const track = await fetchRadioTrack();
  if (!track?.url) {
    return startLockedInRadio({ volume01, forceReload: true, offsetSeconds });
  }

  hardenAudioEl(incoming);
  bindRadioElementGuards(outgoing, volume01);
  incoming.dataset.leaflockMode = "live-radio";
  incoming.loop = false;
  incoming.muted = false;
  incoming.volume = 0;
  incoming.dataset.videoId = track.videoId || "";
  incoming.src = track.url;
  try {
    incoming.load();
    await incoming.play();
  } catch {
    return startLockedInRadio({ volume01, forceReload: true, offsetSeconds });
  }

  const seekTo = offsetSeconds > 1 ? offsetSeconds : 0;
  if (seekTo > 1) {
    try {
      incoming.currentTime = seekTo;
    } catch {
      // ignore
    }
  }

  const start = performance.now();
  const master = Math.min(1, Math.max(0.4, volume01));

  return new Promise((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / BLEND_MS);
      const outGain = Math.cos(t * Math.PI * 0.5);
      const inGain = Math.sin(t * Math.PI * 0.5);
      try {
        outgoing.volume = master * outGain;
        incoming.volume = master * inGain;
      } catch {
        // ignore
      }
      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      try {
        outgoing.pause();
      } catch {
        // ignore
      }
      // Promote B → A without tearing down the playing buffer when possible
      try {
        outgoing.dataset.leaflockMode = "live-radio";
        outgoing.dataset.videoId = incoming.dataset.videoId || "";
        outgoing.loop = false;
        outgoing.src = incoming.src;
        try {
          outgoing.currentTime = incoming.currentTime;
        } catch {
          // ignore
        }
        outgoing.volume = master;
        void outgoing.play().catch(() => undefined);
        incoming.pause();
        incoming.volume = 0;
      } catch {
        incoming.volume = master;
      }
      if (track.title) {
        updateLockedInRadioMetadata({
          title: track.title,
          artist: track.artist || LOCKED_IN_RADIO_STATION,
          artworkUrl: track.thumbnail,
          playing: true
        });
      }
      startWatchdog(volume01);
      resolve(true);
    };
    requestAnimationFrame(step);
  });
}

export function advanceLiveRadioToNextTrack(volume01 = 0.85): void {
  void chainNextRadioTrack(volume01);
}

export function pauseLiveRadioAudio(): void {
  radioIntentPlaying = false;
  if (watchdogTimer !== null) {
    window.clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  try {
    getLeaflockMobileAudio()?.pause();
    getBlendAudio()?.pause();
    const audio = getLeaflockMobileAudio();
    if (audio) audio.dataset.leaflockMode = "paused";
  } catch {
    // ignore
  }
}

export function setLiveRadioVolume(volume01: number, muted: boolean): void {
  const a = getLeaflockMobileAudio();
  const b = getBlendAudio();
  if (a) {
    a.volume = Math.min(1, Math.max(0, volume01));
    a.muted = muted || volume01 === 0;
  }
  if (b && b.dataset.leaflockMode === "live-radio" && !b.paused) {
    b.volume = Math.min(1, Math.max(0, volume01));
    b.muted = muted || volume01 === 0;
  }
}

export function isLiveRadioPlaying(): boolean {
  const audio = getLeaflockMobileAudio();
  const b = getBlendAudio();
  return Boolean(
    radioIntentPlaying &&
      ((audio && !audio.paused && audio.dataset.leaflockMode === "live-radio") ||
        (b && !b.paused && b.dataset.leaflockMode === "live-radio"))
  );
}

export async function probeLiveAudioMode(): Promise<LiveAudioMode> {
  try {
    const response = await fetch("/api/fm/listen-status", { cache: "no-store" });
    if (!response.ok) return "unknown";
    const payload = (await response.json()) as { source?: string };
    if (payload.source === "stream") return "stream";
    if (payload.source === "radio") return "radio";
    if (payload.source === "silent" || payload.source === "hold") return "silent";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function probeLiveMountHasMusic(): Promise<boolean> {
  const track = await fetchRadioTrack();
  return Boolean(track?.url);
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
  return startLockedInRadio({ volume01, forceReload: true });
}

export function getMobileAudioSource(): "stream" | "hold" {
  return isLockedInRadioMode() ? "stream" : "hold";
}

export function ensureLiveRadioSource(): HTMLAudioElement | null {
  return getLeaflockMobileAudio();
}

export function ensureMobileAudioContext(): void {}
export function stopMobileAudioContext(): void {}

export function bindLockedInRadioMediaSession(handlers: {
  play: () => void;
  pause: () => void;
  stop?: () => void;
}): void {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler("play", () => handlers.play());
    navigator.mediaSession.setActionHandler("pause", () => handlers.pause());
    navigator.mediaSession.setActionHandler("stop", () =>
      handlers.stop ? handlers.stop() : handlers.pause()
    );
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
  } catch {
    // ignore
  }
}

export function updateLockedInRadioMetadata(opts: {
  title: string;
  artist: string;
  artworkUrl?: string | null;
  playing: boolean;
}): void {
  if (!("mediaSession" in navigator)) return;
  const art = opts.artworkUrl || "/leaflock-logo.png";
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: opts.title,
      artist: opts.artist,
      album: LOCKED_IN_RADIO_STATION,
      artwork: [
        { src: art, sizes: "96x96", type: "image/png" },
        { src: art, sizes: "256x256", type: "image/png" },
        { src: art, sizes: "512x512", type: "image/png" }
      ]
    });
    navigator.mediaSession.playbackState = opts.playing ? "playing" : "paused";
  } catch {
    // ignore
  }
}
