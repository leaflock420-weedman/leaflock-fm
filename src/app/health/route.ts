import { getDj420State, resolveDj420Status } from "@/lib/dj420-state";
import { getNowPlaying } from "@/lib/fm-station";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATION_PATH = path.join(process.cwd(), "data", "station-state.json");

/**
 * Render healthCheckPath — MUST return 200 once the process is listening.
 * Full FM readiness is reported as `ready`, not as HTTP status, so a slow
 * station bootstrap never rolls back a good deploy.
 */
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

  let hostStatus: "online" | "offline" = "offline";
  try {
    const dj420 = await getDj420State();
    hostStatus = resolveDj420Status(dj420);
    checks.dj420Heartbeat = hostStatus === "online";
  } catch {
    checks.dj420Heartbeat = false;
  }

  try {
    const nowPlaying = await getNowPlaying();
    checks.currentTrack = Boolean(nowPlaying.current?.videoId);
  } catch {
    checks.currentTrack = false;
  }

  const ready =
    checks.server &&
    (checks.stationState || checks.currentTrack || checks.dj420Heartbeat);

  return Response.json(
    {
      ok: true,
      ready,
      checks,
      databaseConnected: checks.database,
      hostName: "DJ420",
      hostStatus,
      serverTime: new Date().toISOString(),
      build: "xhs-stream-v1"
    },
    { status: 200 }
  );
}
