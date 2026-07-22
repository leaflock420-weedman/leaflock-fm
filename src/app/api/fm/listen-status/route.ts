import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIVE_MOUNT = "https://stream.leaflock.com.au/live.mp3";

const STREAM_CANDIDATES = [
  process.env.PRIMARY_STREAM_URL,
  process.env.NEXT_PUBLIC_STREAM_URL,
  DEFAULT_LIVE_MOUNT,
  "https://stream.leaflock.com.au/main"
].filter((value): value is string => Boolean(value && value.trim()));

export async function GET() {
  const tried: string[] = [];

  for (const url of STREAM_CANDIDATES) {
    tried.push(url);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const upstream = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "LeafLockFM-DJ420/1.0",
          Range: "bytes=0-4095",
          Accept: "audio/*,*/*"
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!upstream.ok) continue;
      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html") || type.includes("json")) continue;
      if (
        type.includes("audio") ||
        type.includes("mpeg") ||
        type.includes("ogg") ||
        type.includes("aac") ||
        type.includes("octet-stream")
      ) {
        try {
          await upstream.arrayBuffer();
        } catch {
          // ignore
        }
        return NextResponse.json({
          ok: true,
          source: "stream",
          mount: "/api/fm/listen",
          upstream: url,
          dj420: "continuous"
        });
      }
    } catch {
      // next
    }
  }

  return NextResponse.json({
    ok: true,
    source: "hold",
    mount: "/api/fm/listen",
    dj420: "continuous",
    tried,
    note:
      "stream.leaflock.com.au/live.mp3 is unreachable. Live room uses YouTube for music until Liquidsoap/Icecast is online. DNS for stream.leaflock.com.au must point at your Icecast host."
  });
}
