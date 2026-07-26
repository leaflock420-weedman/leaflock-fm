/**
 * Exact public Live Room engine (Xiaohongshu-style):
 *
 *   <audio id="leaflockRadio" src="https://leaflock-stream…/live.mp3" preload="none" playsinline>
 *   MediaSession: LeafLock Radio / Locked In Radio / LeafLock FM 104.2
 *   play / pause only
 *   visibilitychange: no pause, no reload, no src swap (except live-edge resync)
 *
 * Multi-listener sync: all phones join the same continuous mount. When the
 * shared encoder advances to a new song, we rejoin the live edge so buffered
 * clients do not stay on the previous song for 20–40s.
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
let lastSyncedVideoId: string | null = null;
let resyncInFlight = false;
let lastResyncAt = 0;

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
      // Do not pause. Do not reload. Do not replace src. Do not destroy.
      return;
    }
  });
}

export function ensureLockedInRadioElement(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  bindGlobalHooks();

  const url = getLockedInRadioStreamUrl();
  let radio = document.getElementById(LEAFLOCK_RADIO_AUDIO_ID) as HTMLAudioElement | null;

  if (!radio) {
    radio = document.createElement("audio");
    radio.id = LEAFLOCK_RADIO_AUDIO_ID;
    radio.setAttribute("playsinline", "true");
    radio.setAttribute("webkit-playsinline", "true");
    radio.preload = "none";
    // Live stream hints (not all browsers honor these)
    radio.setAttribute("data-live", "true");
    radio.src = url;
    radio.setAttribute("src", url);
    radio.className = "pointer-events-none absolute h-px w-px opacity-0";
    radio.setAttribute("aria-hidden", "true");
    document.body.appendChild(radio);
  } else {
    const current = radio.getAttribute("src") || "";
    if (!current.includes("leaflock-stream") && !current.includes("stream.leaflock")) {
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
 * Force rejoin the continuous mount at the live edge (same URL, no YouTube).
 * Used when the shared encoder moves to a new track so every phone snaps together.
 */
export async function resyncRadioToLiveEdge(reason = "track-change"): Promise<boolean> {
  if (!userWantsPlay) return false;
  if (resyncInFlight) return false;
  const now = Date.now();
  // Avoid thrashing
  if (now - lastResyncAt < 4_000) return false;
  resyncInFlight = true;
  lastResyncAt = now;

  const url = getLockedInRadioStreamUrl();
  const radio = ensureLockedInRadioElement();
  if (!radio) {
    resyncInFlight = false;
    return false;
  }

  try {
    setAudioSessionPlayback();
    try {
      radio.pause();
    } catch {
      /* ignore */
    }
    // Tear down buffered progressive body, then re-open the live mount
    radio.removeAttribute("src");
    radio.load();
    radio.src = url;
    radio.setAttribute("src", url);
    radio.muted = false;
    radio.volume = Math.min(1, Math.max(0.25, volume01));
    applyStationMediaSession(true);
    await radio.play();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    console.info("[leaflock-radio] live-edge resync", reason);
    return !radio.paused;
  } catch {
    return false;
  } finally {
    resyncInFlight = false;
  }
}

/**
 * Call when stream-authoritative videoId is known.
 * If the shared song changed while we are tuned in, rejoin live edge.
 */
export async function noteSharedTrackVideoId(videoId: string | null | undefined): Promise<void> {
  if (!videoId) return;
  const id = String(videoId).replace(/-fb$/, "");
  if (!lastSyncedVideoId) {
    lastSyncedVideoId = id;
    return;
  }
  if (id === lastSyncedVideoId) return;
  lastSyncedVideoId = id;
  if (userWantsPlay) {
    await resyncRadioToLiveEdge("song-change:" + id);
  }
}

export async function playRadio(): Promise<boolean> {
  userWantsPlay = true;
  setAudioSessionPlayback();
  const radio = ensureLockedInRadioElement();
  if (!radio) return false;

  radio.muted = false;
  radio.volume = Math.min(1, Math.max(0.25, volume01));
  applyStationMediaSession(true);

  try {
    // Fresh open to live edge on each explicit Tune in
    if (radio.paused || radio.ended || radio.readyState === 0) {
      const url = getLockedInRadioStreamUrl();
      if ((radio.getAttribute("src") || "") !== url) {
        radio.src = url;
        radio.setAttribute("src", url);
      }
    }
    await radio.play();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    return !radio.paused;
  } catch {
    // Hard rejoin once
    try {
      return await resyncRadioToLiveEdge("play-retry");
    } catch {
      return false;
    }
  }
}

export function pauseRadio(): void {
  userWantsPlay = false;
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
