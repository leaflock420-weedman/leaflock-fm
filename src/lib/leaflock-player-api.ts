export type LeafLockPlayerMode = "live" | "private";

export type PlaybackIntent = "playing" | "paused" | "stopped";

export type LeafLockCurrentTrack = {
  title: string;
  artist: string;
  videoId: string | null;
  artwork: string | null;
};

export type LeafLockPlayerController = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  resyncLive: () => void;
  getMode: () => LeafLockPlayerMode;
  getCurrentTrack: () => LeafLockCurrentTrack;
  getIntent: () => PlaybackIntent;
};

declare global {
  interface Window {
    LeafLockPlayer?: LeafLockPlayerController;
  }
}

let activeController: LeafLockPlayerController | null = null;

export function registerLeafLockPlayer(controller: LeafLockPlayerController): () => void {
  activeController = controller;
  window.LeafLockPlayer = controller;
  return () => {
    if (activeController === controller) {
      activeController = null;
      delete window.LeafLockPlayer;
    }
  };
}

export function getLeafLockPlayer(): LeafLockPlayerController | null {
  return activeController ?? window.LeafLockPlayer ?? null;
}

export function mapListenModeToPlayerMode(mode: "live" | "solo"): LeafLockPlayerMode {
  return mode === "live" ? "live" : "private";
}