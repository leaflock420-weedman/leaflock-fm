import { getDj420State, resolveDj420Status } from "@/lib/dj420-state";
import { getNowPlaying } from "@/lib/fm-station";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATION_PATH = path.join(process.cwd(), "data", "station-state.json");

export async function GET() {
  const checks: Record<string, boolean> = {
    server: true,
    database: false,
    stationState: false,
    dj420Heartbeat: false,
    currentTrack: false
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  try {
    await fs.access(STATION_PATH);
    checks.stationState = true;
  } catch {
    checks.stationState = false;
  }

  const dj420 = await getDj420State();
  checks.dj420Heartbeat = resolveDj420Status(dj420) === "online";

  try {
    const nowPlaying = await getNowPlaying();
    checks.currentTrack = Boolean(nowPlaying.current?.videoId);
  } catch {
    checks.currentTrack = false;
  }

  const fmReady =
    checks.server &&
    checks.stationState &&
    checks.dj420Heartbeat &&
    checks.currentTrack;

  return Response.json(
    {
      ok: fmReady,
      checks,
      databaseConnected: checks.database,
      hostName: "DJ420",
      hostStatus: resolveDj420Status(dj420),
      serverTime: new Date().toISOString()
    },
    { status: fmReady ? 200 : 503 }
  );
}