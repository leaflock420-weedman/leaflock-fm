import { getCurrentLiveTrackAudio } from "@/lib/dj420-audio-source";
import { forceAdvanceStation } from "@/lib/fm-station";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Locked In Radio track URL for native <audio>.
 * Returns a DIRECT CDN audio URL (not proxied through Render) so Chrome can
 * keep playing after the user leaves the app (Xiaohongshu model).
 *
 * ?next=1 — advance station timeline then return the new track (end-of-song chain).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const advance = searchParams.get("next") === "1";

  const upstream =
    process.env.DJ420_UPSTREAM_URL?.trim() ||
    process.env.PRIMARY_STREAM_URL?.trim() ||
    process.env.ICECAST_URL?.trim() ||
    null;

  const hasExternal =
    Boolean(upstream) &&
    !upstream!.includes("fm.leaflock.com.au") &&
    !upstream!.includes("localhost");

  try {
    if (advance) {
      try {
        await forceAdvanceStation();
      } catch (error) {
        console.error("[radio-url] advance failed", error);
      }
    }

    const track = await getCurrentLiveTrackAudio();
    if (!track) {
      return NextResponse.json(
        {
          ok: false,
          source: hasExternal ? "stream" : "unavailable",
          station: "LeafLock Locked In Radio",
          title: "LeafLock Radio",
          artist: "Locked In Radio",
          mount: "https://fm.leaflock.com.au/live.mp3",
          url: hasExternal ? "https://fm.leaflock.com.au/live.mp3" : undefined,
          error: "Could not resolve current track audio URL"
        },
        { status: hasExternal ? 200 : 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      source: "radio",
      station: "LeafLock Locked In Radio",
      title: track.title,
      artist: track.artist ?? "Locked In Radio",
      album: "LeafLock FM 104.2",
      mount: "https://fm.leaflock.com.au/live.mp3",
      videoId: track.videoId,
      offsetSeconds: track.offsetSeconds,
      durationSec: track.durationSec,
      revision: track.revision,
      contentType: track.contentType,
      url: track.audioUrl,
      thumbnail: track.thumbnail ?? null,
      continuousPreferred: hasExternal
    });
  } catch (error) {
    console.error("[radio-url]", error);
    return NextResponse.json(
      {
        ok: false,
        source: "error",
        station: "LeafLock Locked In Radio",
        error: error instanceof Error ? error.message : "radio-url failed"
      },
      { status: 503 }
    );
  }
}
