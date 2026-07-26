/**
 * LeafLock Locked In Radio — native HTML <audio> only (Xiaohongshu model).
 *
 * 1) Prefer continuous Icecast if /api/fm/listen-status says source=stream
 * 2) Else play direct CDN audio for the current station track (/api/fm/radio-url)
 *    and chain the next track on `ended` — same permanent element, Media Session
 *    stays alive so pull-down controls work after leaving Chrome.
 *
 * No YouTube iframes. No silent bridge. No Render body-proxy of multi‑MB audio.
 */

import {
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_AUDIO_ID,
  LEAFLOCK_RADIO_STATION,
  radioArtwork
} from "@/lib/leaflock-radio-stream";

export type RadioMode = "stream" | "track" | "offline";

type RadioUrlPayload = {
  ok?: boolean;
  source?: string;
  url?: string;
  offsetSeconds?: number;
  durationSec?: number;
  videoId?: string;
  title?: string;
  artist?: string;
  revision?: number;
  thumbnail?: string | null;
  error?: string;
};

let userWantsPlay = false;
let mode: RadioMode = "offline";
let reconnectTimer: number | null = null;
let chainBusy = false;
let lastVideoId: string | null = null;
let volume01 = 0.85;

function getRadioEl(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;
  if (el) {
    bindOnce(el);
    return el;
  }

  el = document.createElement("audio");
  el.id = LEAFLOCK_RADIO_AUDIO_ID;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.preload = "auto";
  el.className = "pointer-events-none absolute h-px w-px opacity-0";
  el.setAttribute("aria-hidden", "true");
  // Do NOT set crossOrigin — googlevideo often has no CORS; playback still works.
  document.body.appendChild(el);
  bindOnce(el);
  return el;
}

function bindOnce(el: HTMLAudioElement) {
  if (el.dataset.leaflockBound === "1") return;
  el.dataset.leaflockBound = "1";

  el.addEventListener("playing", () => {
    applyStationMediaSession(true);
  });

  el.addEventListener("pause", () => {
    if (!userWantsPlay) {
      applyStationMediaSession(false);
      return;
    }
    // OS background pause — force re-open native audio (not YouTube).
    scheduleResume(250);
  });

  el.addEventListener("ended", () => {
    if (!userWantsPlay) return;
    if (mode === "stream") {
      scheduleResume(200);
      return;
    }
    void playNextStationTrack();
  });

  el.addEventListener("error", () => {
    if (!userWantsPlay) return;
    scheduleResume(800);
  });

  el.addEventListener("stalled", () => {
    if (!userWantsPlay) return;
    scheduleResume(1500);
  });
}

function scheduleResume(ms: number) {
  if (typeof window === "undefined") return;
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (!userWantsPlay) return;
    void keepAlive();
  }, ms);
}

export function applyStationMediaSession(playing: boolean) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: LEAFLOCK_RADIO_STATION.title,
      artist: LEAFLOCK_RADIO_STATION.artist,
      album: LEAFLOCK_RADIO_STATION.album,
      artwork: radioArtwork()
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";

    navigator.mediaSession.setActionHandler("play", () => {
      void startLockedInRadio(volume01);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      pauseLockedInRadio();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      pauseLockedInRadio();
    });
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
    navigator.mediaSession.setActionHandler("seekto", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
  } catch {
    // ignore
  }
}

async function fetchListenSource(): Promise<"stream" | "radio" | "offline"> {
  try {
    const res = await fetch("/api/fm/listen-status", { cache: "no-store" });
    const data = (await res.json()) as { source?: string };
    if (data.source === "stream") return "stream";
    if (data.source === "radio") return "radio";
    return "offline";
  } catch {
    return "offline";
  }
}

async function fetchRadioTrack(advance = false): Promise<RadioUrlPayload | null> {
  try {
    const q = advance ? "next=1" : `sync=1`;
    const res = await fetch(`/api/fm/radio-url?${q}&_=${Date.now()}`, { cache: "no-store" });
    const data = (await res.json()) as RadioUrlPayload;
    if (!res.ok || !data.ok || !data.url) return null;
    return data;
  } catch {
    return null;
  }
}

async function playDirectUrl(
  url: string,
  options?: { offsetSeconds?: number; videoId?: string }
): Promise<boolean> {
  const el = getRadioEl();
  if (!el) return false;

  el.loop = false;
  el.muted = false;
  el.volume = Math.min(1, Math.max(0.25, volume01));
  el.dataset.videoId = options?.videoId || "";
  el.src = url;

  try {
    el.load();
  } catch {
    // ignore
  }

  try {
    await el.play();
  } catch {
    return false;
  }

  const offset = options?.offsetSeconds ?? 0;
  if (offset > 1.5) {
    const seek = () => {
      try {
        if (Number.isFinite(el.duration) && el.duration > offset) {
          el.currentTime = Math.min(offset, Math.max(0, el.duration - 1.5));
        } else {
          el.currentTime = offset;
        }
      } catch {
        // ignore
      }
    };
    seek();
    el.addEventListener("loadedmetadata", seek, { once: true });
    el.addEventListener("canplay", seek, { once: true });
  }

  applyStationMediaSession(true);
  return !el.paused;
}

async function playContinuousStream(): Promise<boolean> {
  mode = "stream";
  const el = getRadioEl();
  if (!el) return false;

  const url = getLockedInRadioStreamUrl();
  el.loop = false;
  el.muted = false;
  el.volume = Math.min(1, Math.max(0.25, volume01));

  // Fixed mount URL — never ?t= cache-bust on continuous Icecast
  if (!el.src || !el.src.includes("/live.mp3")) {
    el.src = url;
  }

  try {
    await el.play();
    applyStationMediaSession(true);
    return !el.paused;
  } catch {
    try {
      el.load();
      await el.play();
      applyStationMediaSession(true);
      return !el.paused;
    } catch {
      return false;
    }
  }
}

async function playStationTrack(forceNext = false): Promise<boolean> {
  mode = "track";
  const track = await fetchRadioTrack(forceNext);
  if (!track?.url) {
    mode = "offline";
    return false;
  }

  lastVideoId = track.videoId ?? lastVideoId;
  const ok = await playDirectUrl(track.url, {
    offsetSeconds: forceNext ? 0 : track.offsetSeconds ?? 0,
    videoId: track.videoId
  });
  return ok;
}

async function playNextStationTrack(): Promise<boolean> {
  if (chainBusy) return false;
  chainBusy = true;
  try {
    return await playStationTrack(true);
  } finally {
    chainBusy = false;
  }
}

async function keepAlive(): Promise<boolean> {
  if (!userWantsPlay) return false;
  const el = getRadioEl();

  if (el && !el.paused && !el.ended && !el.error) {
    applyStationMediaSession(true);
    return true;
  }

  if (mode === "stream") {
    const ok = await playContinuousStream();
    if (ok) return true;
  }

  // Fall through to track CDN
  return playStationTrack(Boolean(el?.ended || el?.error));
}

/**
 * Start Locked In Radio from a user gesture.
 */
export async function startLockedInRadio(vol = 0.85): Promise<boolean> {
  userWantsPlay = true;
  volume01 = vol;
  applyStationMediaSession(true);

  const source = await fetchListenSource();

  if (source === "stream") {
    const ok = await playContinuousStream();
    if (ok) return true;
  }

  // Working default: direct station-track CDN on native <audio> (background-capable)
  const ok = await playStationTrack(false);
  if (ok) return true;

  // Last attempt: continuous mount anyway (may 503)
  return playContinuousStream();
}

export function pauseLockedInRadio(): void {
  userWantsPlay = false;
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const el = getRadioEl();
  try {
    el?.pause();
  } catch {
    // ignore
  }
  applyStationMediaSession(false);
}

export function isLockedInRadioPlaying(): boolean {
  const el = getRadioEl();
  return Boolean(userWantsPlay && el && !el.paused);
}

export function setLockedInRadioVolume(vol: number, muted = false): void {
  volume01 = vol;
  const el = getRadioEl();
  if (!el) return;
  el.volume = Math.min(1, Math.max(0, vol));
  el.muted = muted || vol === 0;
}

export function ensureLockedInRadioElement(): HTMLAudioElement | null {
  return getRadioEl();
}

export function getLockedInRadioWantsPlay(): boolean {
  return userWantsPlay;
}

export function getLockedInRadioMode(): RadioMode {
  return mode;
}
