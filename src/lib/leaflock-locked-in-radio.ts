/**
 * Xiaohongshu-style LeafLock radio client.
 *
 * Direct continuous MP3 (CDN/encoder) → permanent native <audio>
 * → Chrome owns the session → pull-down / lock screen keep working.
 *
 * NO YouTube iframes. NO ?t= cache-bust. NO src swap on background.
 * NO per-track reload in the browser.
 */

import {
  getLockedInRadioStreamUrl,
  LEAFLOCK_RADIO_AUDIO_ID,
  LEAFLOCK_RADIO_STATION,
  radioArtwork
} from "@/lib/leaflock-radio-stream";

let userWantsPlay = false;
let volume01 = 0.85;
let hooksBound = false;

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

  // Backgrounding must do nothing destructive
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Do not pause. Do not reload. Do not replace src. Do not destroy.
      return;
    }
  });
}

/**
 * Permanent element — create once with fixed stream URL.
 */
export function ensureLockedInRadioElement(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  bindGlobalHooks();

  let radio = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;
  const url = getLockedInRadioStreamUrl();

  if (!radio) {
    radio = document.createElement("audio");
    radio.id = LEAFLOCK_RADIO_AUDIO_ID;
    radio.setAttribute("playsinline", "true");
    radio.setAttribute("webkit-playsinline", "true");
    radio.preload = "none";
    radio.src = url;
    radio.setAttribute("src", url);
    radio.className = "pointer-events-none absolute h-px w-px opacity-0";
    radio.setAttribute("aria-hidden", "true");
    document.body.appendChild(radio);
  } else if (radio.getAttribute("src") !== url && !radio.src.includes(url.replace(/^https?:/, ""))) {
    // Only set if empty/wrong — never thrash src while playing
    if (!userWantsPlay || radio.paused) {
      radio.src = url;
      radio.setAttribute("src", url);
    }
  }

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
    /* ignore */
  }
}

/** User gesture or Media Session play */
export async function playRadio(): Promise<boolean> {
  userWantsPlay = true;
  setAudioSessionPlayback();

  const radio = ensureLockedInRadioElement();
  if (!radio) return false;

  radio.muted = false;
  radio.volume = Math.min(1, Math.max(0.25, volume01));

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
  const radio = ensureLockedInRadioElement();
  try {
    radio?.pause();
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
