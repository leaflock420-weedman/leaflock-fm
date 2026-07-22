import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STREAM_CANDIDATES = [
  process.env.NEXT_PUBLIC_STREAM_URL,
  process.env.PRIMARY_STREAM_URL,
  "https://stream.leaflock.com.au/main"
].filter((value): value is string => Boolean(value && value.trim()));

/**
 * Quick probe so the client knows whether /api/fm/listen is live stream or hold.
 */
export async function GET() {
  for (const url of STREAM_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const upstream = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "LeafLockFM/1.0",
          Range: "bytes=0-1023",
          Accept: "audio/*,*/*"
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!upstream.ok) continue;
      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html") || type.includes("json")) continue;
      if (type.includes("audio") || type.includes("mpeg") || type.includes("ogg") || type.includes("octet-stream")) {
        // Drain a little so the connection closes cleanly.
        try {
          await upstream.arrayBuffer();
        } catch {
          // ignore
        }
        return NextResponse.json({
          ok: true,
          source: "stream",
          url
        });
      }
    } catch {
      // next
    }
  }

  return NextResponse.json({
    ok: true,
    source: "hold",
    url: "/bg-hold.wav"
  });
}
