import { getCurrentLiveTrackAudio } from "@/lib/dj420-audio-source";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Diagnose Locked In Radio audio resolve (Piped/Invidious — not heavy yt-dlp by default). */
export async function GET() {
  try {
    const track = await getCurrentLiveTrackAudio();
    if (!track) {
      return NextResponse.json({
        ok: false,
        station: "LeafLock Locked In Radio",
        error: "No track audio URL resolved",
        ytDlpEnabled: process.env.DJ420_ENABLE_YTDLP === "1"
      });
    }
    return NextResponse.json({
      ok: true,
      station: "LeafLock Locked In Radio",
      videoId: track.videoId,
      title: track.title,
      offsetSeconds: track.offsetSeconds,
      durationSec: track.durationSec,
      contentType: track.contentType,
      urlHost: (() => {
        try {
          return new URL(track.audioUrl).hostname;
        } catch {
          return "unknown";
        }
      })(),
      urlPreview: `${track.audioUrl.slice(0, 80)}…`,
      ytDlpEnabled: process.env.DJ420_ENABLE_YTDLP === "1"
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "failed"
    });
  }
}
