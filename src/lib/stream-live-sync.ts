import fs from "fs/promises";
import path from "path";
import { ensureWritableDataDir, resolveWritableDataDir } from "@/lib/data-dir";

/**
 * Authoritative Live Room metadata written by leaflock-stream.
 * All listeners should show this current / up-next (not wall-clock peeks).
 */

export type StreamLiveSync = {
  videoId: string;
  title: string;
  artist?: string | null;
  nextVideoId?: string | null;
  nextTitle?: string | null;
  durationSec?: number;
  startedAt: string;
  source?: string | null;
  updatedAt: string;
};

const DATA_DIR = resolveWritableDataDir();
const SYNC_PATH = path.join(DATA_DIR, "stream-live-sync.json");

/** Consider stream metadata live for this long without a heartbeat. */
export const STREAM_SYNC_FRESH_MS = 45 * 60 * 1000;

export async function saveStreamLiveSync(
  input: Omit<StreamLiveSync, "updatedAt"> & { updatedAt?: string }
): Promise<StreamLiveSync> {
  const payload: StreamLiveSync = {
    videoId: String(input.videoId || "").trim(),
    title: String(input.title || "LeafLock Radio").trim() || "LeafLock Radio",
    artist: input.artist ?? null,
    nextVideoId: input.nextVideoId ?? null,
    nextTitle: input.nextTitle ?? null,
    durationSec: Number(input.durationSec || 0) || undefined,
    startedAt: input.startedAt || new Date().toISOString(),
    source: input.source ?? null,
    updatedAt: input.updatedAt || new Date().toISOString()
  };

  if (!payload.videoId) {
    throw new Error("videoId required");
  }

  await ensureWritableDataDir();
  await fs.mkdir(path.dirname(SYNC_PATH), { recursive: true }).catch(() => undefined);
  await fs.writeFile(SYNC_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function loadStreamLiveSync(): Promise<StreamLiveSync | null> {
  try {
    const raw = await fs.readFile(SYNC_PATH, "utf8");
    const data = JSON.parse(raw) as StreamLiveSync;
    if (!data?.videoId || !data?.startedAt) return null;
    return data;
  } catch {
    return null;
  }
}

export function isStreamSyncFresh(sync: StreamLiveSync | null, now = Date.now()): boolean {
  if (!sync?.updatedAt) return false;
  const t = new Date(sync.updatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < STREAM_SYNC_FRESH_MS;
}

export function streamSyncOffsetSec(sync: StreamLiveSync, now = Date.now()): number {
  const start = new Date(sync.startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const elapsed = (now - start) / 1000;
  const cap = Number(sync.durationSec || 0);
  if (cap > 15) return Math.max(0, Math.min(elapsed, cap));
  return Math.max(0, elapsed);
}
