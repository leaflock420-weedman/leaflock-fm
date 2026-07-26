/**
 * Xiaohongshu-model radio engine for LeafLock Locked In Radio.
 *
 * - One native HTMLAudioElement with a FIXED continuous stream URL
 * - No YouTube iframes
 * - No silent bridge
 * - No per-track reload / ?t= cache bust
 * - Media Session = station branding (not song titles)
 * - Chrome keeps pull-down / lock controls while this element is playing
 */

import {
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_AUDIO_ID,
  LEAFLOCK_RADIO_STATION,
  radioArtwork
} from "@/lib/leaflock-radio-stream";

let userWantsPlay = false;
let reconnectTimer: number | null = null;

function getRadioEl(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;
  if (el) return el;

  el = document.createElement("audio");
  el.id = LEAFLOCK_RADIO_AUDIO_ID;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.preload = "none";
  el.crossOrigin = "anonymous";
  el.className = "pointer-events-none absolute h-px w-px opacity-0";
  el.setAttribute("aria-hidden", "true");
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
    // OS suspended us — reconnect continuous stream (same URL, no cache-bust).
    scheduleReconnect(400);
  });

  el.addEventListener("ended", () => {
    // Continuous Icecast should not end; if it does, reconnect same mount.
    if (userWantsPlay) scheduleReconnect(300);
  });

  el.addEventListener("error", () => {
    if (userWantsPlay) scheduleReconnect(1500);
  });

  el.addEventListener("stalled", () => {
    if (userWantsPlay) scheduleReconnect(2000);
  });
}

function scheduleReconnect(ms: number) {
  if (typeof window === "undefined") return;
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (!userWantsPlay) return;
    void reconnectSameMount();
  }, ms);
}

/**
 * Soft reconnect: keep the same stream URL (no ?t=).
 * Icecast clients often need load()+play() after a drop.
 */
async function reconnectSameMount(): Promise<boolean> {
  const el = getRadioEl();
  if (!el || !userWantsPlay) return false;

  const url = getLockedInRadioStreamUrl();
  // Only set src if missing or wrong mount — never timestamp-bust.
  if (!el.src || (!el.src.includes("/live.mp3") && el.src !== url)) {
    el.src = url;
  }

  try {
    el.load();
  } catch {
    // ignore
  }

  try {
    await el.play();
    applyStationMediaSession(true);
    return !el.paused;
  } catch {
    return false;
  }
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
      void startLockedInRadio();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      pauseLockedInRadio();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      pauseLockedInRadio();
    });
    // Radio: no seek / next / previous
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
    navigator.mediaSession.setActionHandler("seekto", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
  } catch {
    // ignore
  }
}

/**
 * Call from a user gesture (Join / Play). Starts continuous Locked In Radio.
 */
export async function startLockedInRadio(volume01 = 0.85): Promise<boolean> {
  userWantsPlay = true;
  const el = getRadioEl();
  if (!el) return false;

  const url = getLockedInRadioStreamUrl();
  el.loop = false; // Icecast is infinite; looping a failed short file is wrong
  el.muted = false;
  el.volume = Math.min(1, Math.max(0.2, volume01));

  // Permanent mount — set once, never cache-bust with Date.now()
  if (el.getAttribute("src") !== url && el.src !== url) {
    el.src = url;
  }

  applyStationMediaSession(true);

  try {
    await el.play();
    return !el.paused;
  } catch {
    // Retry once after load
    try {
      el.load();
      await el.play();
      return !el.paused;
    } catch {
      return false;
    }
  }
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

export function setLockedInRadioVolume(volume01: number, muted = false): void {
  const el = getRadioEl();
  if (!el) return;
  el.volume = Math.min(1, Math.max(0, volume01));
  el.muted = muted || volume01 === 0;
}

export function ensureLockedInRadioElement(): HTMLAudioElement | null {
  return getRadioEl();
}

export function getLockedInRadioWantsPlay(): boolean {
  return userWantsPlay;
}
