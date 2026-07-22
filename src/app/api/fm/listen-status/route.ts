import { NextResponse } from "next/server";
import { getCurrentLiveTrackAudio } from "@/lib/dj420-audio-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // Prefer external encoder
  const external = process.env.DJ420_UPSTREAM_URL || process.env.PRIMARY_STREAM_URL;
  if (external && !external.includes("fm.leaflock.com.au")) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(external, {
        headers: { Range: "bytes=0-1023", "User-Agent": "LeafLockFM/1.0" },
        signal: controller.signal,
        cache: "no-store"
      });
      clearTimeout(timer);
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (res.ok && (type.includes("audio") || type.includes("mpeg") || type.includes("octet"))) {
        return NextResponse.json({
          ok: true,
          source: "stream",
          mount: "https://fm.leaflock.com.au/live.mp3",
          upstream: external
        });
      }
    } catch {
      // fall through
    }
  }

  // DJ420 yt-dlp track audio
  try {
    const track = await getCurrentLiveTrackAudio();
    if (track) {
      return NextResponse.json({
        ok: true,
        source: "stream",
        mount: "https://fm.leaflock.com.au/live.mp3",
        mode: "dj420-track",
        videoId: track.videoId,
        title: track.title,
        offsetSeconds: track.offsetSeconds
      });
    }
  } catch (error) {
    console.error("[listen-status]", error);
  }

  return NextResponse.json({
    ok: true,
    source: "hold",
    mount: "https://fm.leaflock.com.au/live.mp3",
    note: "Track audio resolver offline — install yt-dlp (scripts/install-ytdlp.mjs)"
  });
}
