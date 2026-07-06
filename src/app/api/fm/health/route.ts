import { getDj420State, resolveDj420Status } from "@/lib/dj420-state";
import { getActivePlaylistCacheSummary } from "@/lib/playlist-cache";
import { getNowPlaying } from "@/lib/fm-station";
import { getPublicLiveListeners } from "@/lib/fm-store";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATION_PATH = path.join(process.cwd(), "data", "station-state.json");

export async function GET() {
  let database = false;
  let stationState = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  try {
    await fs.access(STATION_PATH);
    stationState = true;
  } catch {
    stationState = false;
  }

  const [dj420, nowPlaying, cache, listeners] = await Promise.all([
    getDj420State(),
    getNowPlaying().catch(() => null),
    getActivePlaylistCacheSummary(),
    getPublicLiveListeners()
  ]);

  const dj420Status = resolveDj420Status(dj420);
  const ok =
    database &&
    stationState &&
    dj420Status === "online" &&
    Boolean(nowPlaying?.current?.videoId);

  return Response.json(
    {
      ok,
      database,
      stationState,
      dj420Status,
      lastHeartbeat: dj420?.lastHeartbeatAt ?? null,
      activePlaylist: cache.activePlaylist,
      cachedTrackCount: cache.cachedTrackCount,
      currentTrack: nowPlaying?.current.title ?? null,
      currentOffsetSeconds: nowPlaying?.currentOffsetSeconds ?? 0,
      nextTrack: nowPlaying?.nextTitle ?? nowPlaying?.upNext ?? null,
      listenerCount: listeners.length,
      serverTime: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}