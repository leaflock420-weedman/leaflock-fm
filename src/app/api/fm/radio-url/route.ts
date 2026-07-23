import { getCurrentLiveTrackAudio } from "@/lib/dj420-audio-source";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * JSON feed for LeafLock Locked In Radio.
 * Client sets <audio src={url}> to a direct CDN link so playback continues
 * after leaving Chrome (no Render proxy timeout mid-song).
 */
export async function GET() {
  try {
    const track = await getCurrentLiveTrackAudio();
    if (!track) {
      return NextResponse.json(
        {
          ok: false,
          source: "unavailable",
          station: "LeafLock Locked In Radio",
          error: "Could not resolve current track audio"
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      source: "radio",
      station: "LeafLock Locked In Radio",
      mount: "https://fm.leaflock.com.au/live.mp3",
      videoId: track.videoId,
      title: track.title,
      artist: track.artist ?? "LeafLock Locked In Radio",
      offsetSeconds: track.offsetSeconds,
      durationSec: track.durationSec,
      revision: track.revision,
      contentType: track.contentType,
      url: track.audioUrl,
      thumbnail: track.thumbnail ?? null
    });
  } catch (error) {
    console.error("[radio-url]", error);
    return NextResponse.json(
      { ok: false, error: "radio-url failed", station: "LeafLock Locked In Radio" },
      { status: 503 }
    );
  }
}
