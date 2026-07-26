/**
 * Public Live Room engine — permanent native <audio> + station Media Session.
 *
 * Matches the working pattern:
 *   <audio id="leaflockRadio" src="…/live.mp3" preload="none" playsinline>
 *   MediaSession title/artist/album = LeafLock Radio / Locked In Radio / FM 104.2
 *   play/pause only — no next/previous/seek
 *
 * Song titles are never pushed to the phone controller (website UI can still show them).
 */

import {
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_AUDIO_ID,
  LEAFLOCK_RADIO_STATION,
  radioArtwork
} from "@/lib/leaflock-radio-stream";

let userWantsPlay = false;
let reconnectTimer: number | null = null;
let volume01 = 0.85;

function getRadioEl(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;

  let el = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;
  if (!el) {
    el = document.createElement("audio");
    el.id = LEAFLOCK_RADIO_AUDIO_ID;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.preload = "none";
    el.className = "pointer-events-none absolute h-px w-px opacity-0";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }

  bindOnce(el);
  ensureFixedSrc(el);
  return el;
}

function ensureFixedSrc(el: HTMLAudioElement) {
  const url = getLockedInRadioStreamUrl();
  // Stable src only — never cache-bust with Date.now()
  if (!el.getAttribute("src") || el.getAttribute("src") !== url) {
    // Compare without resolving absolute vs relative quirks
    try {
      if (el.src && new URL(el.src).href === new URL(url, window.location.origin).href) {
        return;
      }
    } catch {
      // fall through
    }
    el.setAttribute("src", url);
    el.src = url;
  }
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
    // OS may pause when backgrounded — re-open continuous stream (same URL).
    scheduleReconnect(300);
  });

  el.addEventListener("ended", () => {
    // Continuous Icecast should not end; reconnect same mount if it does.
    if (userWantsPlay) scheduleReconnect(200);
  });

  el.addEventListener("error", () => {
    if (userWantsPlay) scheduleReconnect(1200);
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
    void resumeFixedMount();
  }, ms);
}

async function resumeFixedMount(): Promise<boolean> {
  const el = getRadioEl();
  if (!el || !userWantsPlay) return false;

  ensureFixedSrc(el);
  el.muted = false;
  el.volume = Math.min(1, Math.max(0.2, volume01));

  try {
    // Soft reconnect for Icecast without changing the logical stream URL
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

/** Permanent station branding for Android/iOS pull-down + lock screen. */
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
      await startLockedInRadio(volume01);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      pauseLockedInRadio();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      pauseLockedInRadio();
    });
    // Radio station: no track skip / seek
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);
    navigator.mediaSession.setActionHandler("seekto", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
  } catch {
    // ignore
  }
}

/** Call from user gesture (Tune in / Join). */
export async function startLockedInRadio(vol = 0.85): Promise<boolean> {
  userWantsPlay = true;
  volume01 = vol;

  const el = getRadioEl();
  if (!el) return false;

  ensureFixedSrc(el);
  el.loop = false;
  el.muted = false;
  el.volume = Math.min(1, Math.max(0.2, vol));
  el.preload = "none";

  applyStationMediaSession(true);

  try {
    await el.play();
    return !el.paused;
  } catch {
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
  try {
    getRadioEl()?.pause();
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

/** Always continuous stream mode for public live room. */
export function getLockedInRadioMode(): "stream" {
  return "stream";
}
