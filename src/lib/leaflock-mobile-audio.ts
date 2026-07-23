/**
 * LeafLock Locked In Radio — permanent HTML <audio> engine.
 *
 * Live room music plays here (NOT YouTube). This is what continues after you
 * leave Chrome / soft-switch / lock the screen — browser Media Session +
 * progressive /live.mp3 (or Icecast if DJ420_UPSTREAM_URL is set).
 *
 * Private jukebox still uses YouTube + a near-silent host for session chrome.
 */

export const LEAFLOCK_MOBILE_AUDIO_ID = "leaflockMobileAudio";
export const LEAFLOCK_MOBILE_AUDIO_B_ID = "leaflockMobileAudioB";
export const LIVE_RADIO_STREAM_PATH = "/live.mp3";
export const DJ420_PUBLIC_STREAM_URL = "https://fm.leaflock.com.au/live.mp3";
export const LOCKED_IN_RADIO_STATION = "LeafLock Locked In Radio";

const HOST_VOLUME = 0.02;
const BLEND_MS = 8000;

export type LiveAudioMode = "stream" | "radio" | "hold-loop" | "silent" | "unknown";

function liveStreamUrl(cacheBust = true): string {
  const base =
    typeof window === "undefined"
      ? LIVE_RADIO_STREAM_PATH
      : `${window.location.origin}${LIVE_RADIO_STREAM_PATH}`;
  return cacheBust ? `${base}?t=${Date.now()}` : base;
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

/** Near-silent OS host for private jukebox only. */
export function startSilentMediaHost(): void {
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

export type StartLockedInOptions = {
  volume01?: number;
  /** Seek into the current station track (seconds). */
  offsetSeconds?: number;
  forceReload?: boolean;
};

/**
 * Start / rejoin LeafLock Locked In Radio on the permanent mount.
 * Call this from a user gesture so mobile autoplay is allowed.
 */
export async function startLockedInRadio(
  options: StartLockedInOptions = {}
): Promise<boolean> {
  const volume01 = options.volume01 ?? 0.85;
  const audio = getLeaflockMobileAudio();
  if (!audio) return false;

  hardenAudioEl(audio);
  audio.dataset.leaflockMode = "live-radio";
  audio.loop = false; // each track ends → client loads next
  audio.muted = false;
  audio.volume = Math.min(1, Math.max(0.35, volume01));

  const needNewSrc =
    options.forceReload ||
    !audio.src.includes("/live.mp3") ||
    audio.ended ||
    audio.error;

  if (needNewSrc) {
    audio.src = liveStreamUrl(true);
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

  if (options.offsetSeconds && options.offsetSeconds > 1) {
    const seek = () => {
      try {
        if (Number.isFinite(audio.duration) && audio.duration > options.offsetSeconds!) {
          audio.currentTime = Math.min(options.offsetSeconds!, Math.max(0, audio.duration - 1));
        } else if (options.offsetSeconds! > 0) {
          audio.currentTime = options.offsetSeconds!;
        }
      } catch {
        // Some streams reject seek until more data arrives.
      }
    };
    seek();
    audio.addEventListener("loadedmetadata", seek, { once: true });
    audio.addEventListener("canplay", seek, { once: true });
  }

  return !audio.paused;
}

/** Alias used by older call sites. */
export function startLiveRadioAudio(volume01 = 0.85): void {
  void startLockedInRadio({ volume01, forceReload: true });
}

export async function resumeLiveRadioAudio(volume01 = 0.85): Promise<boolean> {
  try {
    const audio = getLeaflockMobileAudio();
    if (!audio) return false;
    hardenAudioEl(audio);
    audio.muted = false;
    if (audio.dataset.leaflockMode === "live-radio") {
      audio.volume = Math.min(1, Math.max(0.35, volume01));
    } else {
      audio.volume = Math.min(HOST_VOLUME, Math.max(0.001, volume01));
    }
    if (audio.paused || audio.ended) {
      if (audio.ended || audio.error) {
        return startLockedInRadio({ volume01, forceReload: true });
      }
      try {
        await audio.play();
      } catch {
        return false;
      }
    }
    return !audio.paused;
  } catch {
    return false;
  }
}

/**
 * DJ-style crossfade into the next Locked In Radio load (new /live.mp3).
 * Uses dual permanent audio elements so background continues.
 */
export async function crossfadeLockedInRadio(
  volume01 = 0.85,
  offsetSeconds = 0
): Promise<boolean> {
  const outgoing = getLeaflockMobileAudio();
  const incoming = getBlendAudio();
  if (!outgoing || !incoming) {
    return startLockedInRadio({ volume01, forceReload: true, offsetSeconds });
  }

  hardenAudioEl(incoming);
  incoming.dataset.leaflockMode = "live-radio";
  incoming.loop = false;
  incoming.muted = false;
  incoming.volume = 0;
  incoming.src = liveStreamUrl(true);
  try {
    incoming.load();
    await incoming.play();
  } catch {
    return startLockedInRadio({ volume01, forceReload: true, offsetSeconds });
  }

  if (offsetSeconds > 1) {
    try {
      incoming.currentTime = offsetSeconds;
    } catch {
      // ignore
    }
  }

  const start = performance.now();
  const master = Math.min(1, Math.max(0.35, volume01));

  return new Promise((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / BLEND_MS);
      // Equal-power-ish curve
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
        outgoing.removeAttribute("src");
        outgoing.load();
      } catch {
        // ignore
      }
      // Promote B → A by swapping src into primary element for Media Session identity.
      try {
        outgoing.dataset.leaflockMode = "live-radio";
        outgoing.loop = false;
        outgoing.src = incoming.src;
        outgoing.currentTime = incoming.currentTime;
        outgoing.volume = master;
        void outgoing.play().catch(() => undefined);
        incoming.pause();
        incoming.volume = 0;
      } catch {
        // keep B playing if swap fails
        incoming.volume = master;
      }
      resolve(true);
    };
    requestAnimationFrame(step);
  });
}

/** When current track ends, load the next station song on the same mount path. */
export function advanceLiveRadioToNextTrack(volume01 = 0.85): void {
  void startLockedInRadio({ volume01, forceReload: true, offsetSeconds: 0 });
}

export function pauseLiveRadioAudio(): void {
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
    (audio && !audio.paused && audio.dataset.leaflockMode === "live-radio") ||
      (b && !b.paused && b.dataset.leaflockMode === "live-radio")
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

/** HEAD /live.mp3 to see if the mount has real music (not silent). */
export async function probeLiveMountHasMusic(): Promise<boolean> {
  try {
    const response = await fetch(`${LIVE_RADIO_STREAM_PATH}?probe=${Date.now()}`, {
      method: "GET",
      headers: { Range: "bytes=0-2047" },
      cache: "no-store"
    });
    const source = (response.headers.get("X-LeafLock-Audio-Source") || "").toLowerCase();
    if (source === "silent" || source === "hold") return false;
    if (source === "stream" || source === "radio" || source === "dj420-track") return true;
    // If we got audio bytes and not a tiny silent file, treat as music.
    const len = Number(response.headers.get("content-length") || 0);
    return response.ok && (len === 0 || len > 50_000 || response.status === 206);
  } catch {
    return false;
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

/** Bind Media Session for Locked In Radio (lock screen / pull-down). */
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
