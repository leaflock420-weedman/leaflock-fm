import {
  isStreamSyncFresh,
  loadStreamLiveSync,
  saveStreamLiveSync,
  streamSyncOffsetSec
} from "@/lib/stream-live-sync";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * leaflock-stream posts what is actually on the continuous mount.
 * Browsers read via GET (or via now-playing which merges this).
 */
export async function POST(request: Request) {
  const secret =
    request.headers.get("x-stream-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || secret !== process.env.FM_ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      videoId?: string;
      title?: string;
      artist?: string | null;
      nextVideoId?: string | null;
      nextTitle?: string | null;
      durationSec?: number;
      startedAt?: string;
      source?: string | null;
    };

    const saved = await saveStreamLiveSync({
      videoId: body.videoId || "",
      title: body.title || "LeafLock Radio",
      artist: body.artist,
      nextVideoId: body.nextVideoId,
      nextTitle: body.nextTitle,
      durationSec: body.durationSec,
      startedAt: body.startedAt || new Date().toISOString(),
      source: body.source
    });

    return NextResponse.json({ ok: true, sync: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "sync failed" },
      { status: 400 }
    );
  }
}

export async function GET() {
  const sync = await loadStreamLiveSync();
  if (!sync || !isStreamSyncFresh(sync)) {
    return NextResponse.json({ ok: false, fresh: false, sync: null });
  }
  return NextResponse.json({
    ok: true,
    fresh: true,
    sync,
    offsetSeconds: streamSyncOffsetSec(sync)
  });
}
