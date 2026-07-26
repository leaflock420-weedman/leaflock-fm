/**
 * Exact continuous-radio client:
 * - one permanent native <audio id="leaflockRadio">
 * - fixed stream URL (never changes, no cache-bust)
 * - Media Session station branding only
 * - audioSession.type = "playback" when available
 * - visibilitychange does nothing (no pause / reload / src swap)
 */

import {
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_AUDIO_ID,
  LEAFLOCK_RADIO_STATION,
  radioArtwork
} from "@/lib/leaflock-radio-stream";

let userWantsPlay = false;
let volume01 = 0.85;
let visibilityBound = false;

function setAudioSessionPlayback() {
  try {
    // Safari / supporting browsers: long-form music playback
    const nav = navigator as Navigator & {
      audioSession?: { type: string };
    };
    if (nav.audioSession) {
      nav.audioSession.type = "playback";
    }
  } catch {
    // ignore
  }
}

function bindVisibilityNoop() {
  if (typeof document === "undefined" || visibilityBound) return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Do not pause.
      // Do not reload.
      // Do not replace src.
      // Do not destroy the player.
      return;
    }
  });
}

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

  // Fixed continuous stream URL — set once, never timestamp-bust
  const url = getLockedInRadioStreamUrl();
  if (el.getAttribute("src") !== url) {
    el.setAttribute("src", url);
    el.src = url;
  }

  bindVisibilityNoop();
  return el;
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
      void playRadio();
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
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
  } catch {
    // ignore
  }
}

/** Core play — user gesture or Media Session play. */
export async function playRadio(): Promise<boolean> {
  userWantsPlay = true;
  setAudioSessionPlayback();

  const radio = getRadioEl();
  if (!radio) return false;

  radio.muted = false;
  radio.volume = Math.min(1, Math.max(0.2, volume01));

  applyStationMediaSession(true);

  try {
    await radio.play();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    return !radio.paused;
  } catch {
    return false;
  }
}

export function pauseRadio(): void {
  userWantsPlay = false;
  const radio = getRadioEl();
  try {
    radio?.pause();
  } catch {
    // ignore
  }
  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
    try {
      navigator.mediaSession.playbackState = "paused";
    } catch {
      // ignore
    }
  }
  applyStationMediaSession(false);
}

/** @deprecated use playRadio */
export async function startLockedInRadio(vol = 0.85): Promise<boolean> {
  volume01 = vol;
  return playRadio();
}

/** @deprecated use pauseRadio */
export function pauseLockedInRadio(): void {
  pauseRadio();
}

export function isLockedInRadioPlaying(): boolean {
  const radio = getRadioEl();
  return Boolean(userWantsPlay && radio && !radio.paused);
}

export function setLockedInRadioVolume(vol: number, muted = false): void {
  volume01 = vol;
  const radio = getRadioEl();
  if (!radio) return;
  radio.volume = Math.min(1, Math.max(0, vol));
  radio.muted = muted || vol === 0;
}

export function ensureLockedInRadioElement(): HTMLAudioElement | null {
  return getRadioEl();
}

export function getLockedInRadioWantsPlay(): boolean {
  return userWantsPlay;
}

export function getLockedInRadioMode(): "stream" {
  return "stream";
}

export { applyStationMediaSession as applyStationMediaSessionExport };
