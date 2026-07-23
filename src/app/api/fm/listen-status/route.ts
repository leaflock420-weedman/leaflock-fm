import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight status — never runs yt-dlp.
 * source=stream only when DJ420_UPSTREAM_URL is a working external Icecast/Liquidsoap mount.
 */
export async function GET() {
  const upstreamUrl = process.env.DJ420_UPSTREAM_URL?.trim();

  if (
    upstreamUrl &&
    !upstreamUrl.includes("fm.leaflock.com.au") &&
    !upstreamUrl.includes("localhost")
  ) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(upstreamUrl, {
        headers: {
          Range: "bytes=0-1023",
          "User-Agent": "LeafLockFM/1.0",
          Accept: "audio/*"
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (
        res.ok &&
        (type.includes("audio") || type.includes("mpeg") || type.includes("octet-stream"))
      ) {
        return NextResponse.json({
          ok: true,
          source: "stream",
          mount: "https://fm.leaflock.com.au/live.mp3",
          upstream: upstreamUrl
        });
      }
    } catch {
      // fall through
    }
  }

  return NextResponse.json({
    ok: true,
    source: "silent",
    mount: "https://fm.leaflock.com.au/live.mp3",
    note:
      "No external radio encoder. Live room uses YouTube for music. Set DJ420_UPSTREAM_URL to a Liquidsoap/Icecast MP3 URL for true background audio."
  });
}
