/**
 * Keep the page "forced open" while Live Room is playing:
 * - Screen Wake Lock (stops the phone sleeping the tab)
 * - Visibility re-assert hooks for the player
 *
 * Note: Android still kills YouTube iframes when Chrome is fully force-closed.
 * Soft switch / lock with Wake Lock + in-viewport iframe is the best web path.
 */

let wakeLock: WakeLockSentinel | null = null;
let reacquireBound = false;

async function requestWakeLock(): Promise<void> {
  try {
    if (!("wakeLock" in navigator)) return;
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    // Permission / unsupported — ignore.
  }
}

function onVisibilityForWakeLock() {
  if (document.visibilityState === "visible") {
    void requestWakeLock();
  }
}

export async function acquireLeaflockWakeLock(): Promise<void> {
  await requestWakeLock();
  if (!reacquireBound && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityForWakeLock);
    reacquireBound = true;
  }
}

export async function releaseLeaflockWakeLock(): Promise<void> {
  try {
    if (wakeLock && !wakeLock.released) {
      await wakeLock.release();
    }
  } catch {
    // ignore
  }
  wakeLock = null;
}

/** True when the YouTube iframe is likely still audible. */
export function isYtDeckAudible(
  player: { getPlayerState?: () => number } | null | undefined,
  YT?: { PlayerState?: { PLAYING: number; BUFFERING: number } }
): boolean {
  if (!player || !YT?.PlayerState) return false;
  try {
    const state = player.getPlayerState?.();
    return state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING;
  } catch {
    return false;
  }
}
