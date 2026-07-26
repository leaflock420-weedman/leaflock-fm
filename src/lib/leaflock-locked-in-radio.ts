/**
 * Exact public Live Room engine (Xiaohongshu-style):
 *
 *   <audio id="leaflockRadio" src="…/live.mp3?edge=…" preload="none" playsinline>
 *   MediaSession: LeafLock Radio / Locked In Radio / LeafLock FM 104.2
 *
 * Sync rules:
 * - Continuous stream stays open across track changes (no song-change reload).
 * - Explicit Tune In / resume after Pause always reopens live edge via ?edge=.
 * - Reconnect only on explicit resume, play error, or sustained stall.
 */

import {
  getLiveEdgeStreamUrl,
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_AUDIO_ID,
  LEAFLOCK_RADIO_STATION,
  radioArtwork
} from "@/lib/leaflock-radio-stream";

let userWantsPlay = false;
let volume01 = 0.85;
let hooksBound = false;
let stallHooksBound = false;
let resyncInFlight = false;
let lastResyncAt = 0;
let stallSince: number | null = null;

const STALL_RESYNC_MS = 8_000;

function setAudioSessionPlayback() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* ignore */
  }
}

function bindGlobalHooks() {
  if (typeof document === "undefined" || hooksBound) return;
  hooksBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Do not pause. Do not reload. Do not replace src on hide.
      return;
    }
  });
}

function bindStallHooks(radio: HTMLAudioElement) {
  if (stallHooksBound) return;
  stallHooksBound = true;

  const onWaiting = () => {
    if (!userWantsPlay || radio.paused) return;
    if (stallSince == null) stallSince = Date.now();
  };
  const onPlaying = () => {
    stallSince = null;
  };
  const onStalled = () => {
    if (!userWantsPlay || radio.paused) return;
    if (stallSince == null) stallSince = Date.now();
  };
  const onError = () => {
    if (userWantsPlay) {
      void resyncRadioToLiveEdge("error");
    }
  };

  radio.addEventListener("waiting", onWaiting);
  radio.addEventListener("stalled", onStalled);
  radio.addEventListener("playing", onPlaying);
  radio.addEventListener("error", onError);

  // Watchdog: sustained stall while user wants play → rejoin live edge only
  window.setInterval(() => {
    if (!userWantsPlay) {
      stallSince = null;
      return;
    }
    const el = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;
    if (!el || el.paused) return;
    if (stallSince != null && Date.now() - stallSince >= STALL_RESYNC_MS) {
      stallSince = null;
      void resyncRadioToLiveEdge("sustained-stall");
    }
  }, 2_000);
}

export function ensureLockedInRadioElement(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  bindGlobalHooks();

  const baseUrl = getLockedInRadioStreamUrl();
  let radio = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;

  if (!radio) {
    radio = document.createElement("audio");
    radio.id = LEAFLOCK_RADIO_AUDIO_ID;
    radio.setAttribute("playsinline", "true");
    radio.setAttribute("webkit-playsinline", "true");
    radio.preload = "none";
    radio.setAttribute("data-live", "true");
    // Placeholder base URL; play/resume always opens a fresh ?edge= live URL
    radio.src = baseUrl;
    radio.setAttribute("src", baseUrl);
    radio.className = "pointer-events-none absolute h-px w-px opacity-0";
    radio.setAttribute("aria-hidden", "true");
    document.body.appendChild(radio);
  }

  bindStallHooks(radio);
  return radio;
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

    navigator.mediaSession.setActionHandler("play", async () => {
      await playRadio();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      pauseRadio();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      pauseRadio();
    });
    navigator.mediaSession.setActionHandler("nexttrack", null);
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("seekto", null);
  } catch {
    /* ignore */
  }
}

/**
 * Open the continuous mount at the live edge.
 * Always uses a unique ?edge= so browsers cannot resume a stale progressive body.
 */
export async function resyncRadioToLiveEdge(reason = "live-edge"): Promise<boolean> {
  if (resyncInFlight) return false;
  const now = Date.now();
  if (now - lastResyncAt < 1_500) return false;
  resyncInFlight = true;
  lastResyncAt = now;

  const radio = ensureLockedInRadioElement();
  if (!radio) {
    resyncInFlight = false;
    return false;
  }

  const edgeUrl = getLiveEdgeStreamUrl();

  try {
    setAudioSessionPlayback();
    try {
      radio.pause();
    } catch {
      /* ignore */
    }
    radio.removeAttribute("src");
    radio.load();
    radio.src = edgeUrl;
    radio.setAttribute("src", edgeUrl);
    radio.muted = false;
    radio.volume = Math.min(1, Math.max(0.25, volume01));
    applyStationMediaSession(true);
    await radio.play();
    stallSince = null;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    console.info("[leaflock-radio] live-edge", reason);
    return !radio.paused;
  } catch {
    return false;
  } finally {
    resyncInFlight = false;
  }
}

/**
 * Metadata helpers may call this — MUST NOT reconnect audio on song change.
 * Continuous stream stays open through track transitions.
 */
export async function noteSharedTrackVideoId(
  _videoId: string | null | undefined
): Promise<void> {
  // Intentionally no-op for playback. Song changes must not reload <audio>.
}

/**
 * Explicit Tune In / resume after Pause — always rejoin live edge.
 */
export async function playRadio(): Promise<boolean> {
  userWantsPlay = true;
  setAudioSessionPlayback();
  ensureLockedInRadioElement();
  return resyncRadioToLiveEdge("tune-in-or-resume");
}

export function pauseRadio(): void {
  userWantsPlay = false;
  stallSince = null;
  try {
    ensureLockedInRadioElement()?.pause();
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
    try {
      navigator.mediaSession.playbackState = "paused";
    } catch {
      /* ignore */
    }
  }
  applyStationMediaSession(false);
}

export async function startLockedInRadio(vol = 0.85): Promise<boolean> {
  volume01 = vol;
  return playRadio();
}

export function pauseLockedInRadio(): void {
  pauseRadio();
}

export function isLockedInRadioPlaying(): boolean {
  const radio = ensureLockedInRadioElement();
  return Boolean(userWantsPlay && radio && !radio.paused);
}

export function setLockedInRadioVolume(vol: number, muted = false): void {
  volume01 = vol;
  const radio = ensureLockedInRadioElement();
  if (!radio) return;
  radio.volume = Math.min(1, Math.max(0, vol));
  radio.muted = muted || vol === 0;
}

export function getLockedInRadioWantsPlay(): boolean {
  return userWantsPlay;
}

export function getLockedInRadioMode(): "stream" {
  return "stream";
}
