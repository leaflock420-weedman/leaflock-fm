import {
  getLeafLockPlayer,
  type LeafLockCurrentTrack
} from "@/lib/leaflock-player-api";

const FM_ARTIST = "LeafLock FM 104.2";
const FM_ALBUM = "Locked In Radio";

function mediaOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function buildArtwork(videoId: string | null): MediaImage[] {
  const origin = mediaOrigin();
  const fallback = origin ? `${origin}/leaflock-logo.png` : "/leaflock-logo.png";

  if (!videoId) {
    return [
      { src: fallback, sizes: "96x96", type: "image/png" },
      { src: fallback, sizes: "128x128", type: "image/png" },
      { src: fallback, sizes: "192x192", type: "image/png" },
      { src: fallback, sizes: "512x512", type: "image/png" }
    ];
  }

  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return [
    { src: thumb, sizes: "96x96", type: "image/jpeg" },
    { src: thumb, sizes: "128x128", type: "image/jpeg" },
    { src: thumb, sizes: "192x192", type: "image/jpeg" },
    { src: thumb, sizes: "480x360", type: "image/jpeg" },
    { src: fallback, sizes: "512x512", type: "image/png" }
  ];
}

function safeSetAction(action: MediaSessionAction, handler: (() => void) | null) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Some browsers reject unsupported actions.
  }
}

export function updateLeafLockMediaSessionMetadata(
  track?: LeafLockCurrentTrack | null,
  playing?: boolean
) {
  if (!("mediaSession" in navigator)) return;

  const player = getLeafLockPlayer();
  const current = track ?? player?.getCurrentTrack() ?? null;
  const intent = player?.getIntent();
  const isPlaying = playing ?? intent === "playing";

  navigator.mediaSession.metadata = new MediaMetadata({
    title: current?.title?.trim() || FM_ARTIST,
    artist: FM_ARTIST,
    album: FM_ALBUM,
    artwork: buildArtwork(current?.videoId ?? null)
  });

  navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
}

export function updateLeafLockMediaSessionPosition(time: number, total: number) {
  if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) {
    return;
  }

  const safeTotal = Number.isFinite(total) && total > 0 ? total : 300;
  const safeTime = Number.isFinite(time) && time >= 0 ? Math.min(time, safeTotal) : 0;

  try {
    navigator.mediaSession.setPositionState({
      duration: safeTotal,
      playbackRate: 1,
      position: safeTime
    });
  } catch {
    // Optional on some browsers.
  }
}

export function bindLeafLockMediaSession() {
  if (!("mediaSession" in navigator)) return;

  safeSetAction("play", () => {
    getLeafLockPlayer()?.play();
  });

  safeSetAction("pause", () => {
    getLeafLockPlayer()?.pause();
  });

  safeSetAction("stop", () => {
    getLeafLockPlayer()?.stop();
  });

  safeSetAction("nexttrack", () => {
    const player = getLeafLockPlayer();
    if (!player) return;
    if (player.getMode() === "live") {
      player.resyncLive();
      return;
    }
    player.next();
  });

  safeSetAction("previoustrack", () => {
    const player = getLeafLockPlayer();
    if (!player) return;
    if (player.getMode() === "live") {
      player.resyncLive();
      return;
    }
    player.previous();
  });

  safeSetAction("seekforward", () => {
    const player = getLeafLockPlayer();
    if (!player) return;
    if (player.getMode() === "live") {
      player.resyncLive();
    }
  });

  safeSetAction("seekbackward", () => {
    const player = getLeafLockPlayer();
    if (!player) return;
    if (player.getMode() === "live") {
      player.resyncLive();
    }
  });

  safeSetAction("seekto", () => {
    const player = getLeafLockPlayer();
    if (!player) return;
    if (player.getMode() === "live") {
      player.resyncLive();
    }
  });
}