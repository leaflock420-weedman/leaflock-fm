import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STREAM_CANDIDATES = [
  process.env.PRIMARY_STREAM_URL,
  process.env.NEXT_PUBLIC_STREAM_URL,
  "https://stream.leaflock.com.au/main"
].filter((value): value is string => Boolean(value && value.trim()));

/**
 * Status of DJ420 continuous Live Radio mount used by /api/fm/listen.
 */
export async function GET() {
  for (const url of STREAM_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const upstream = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "LeafLockFM-DJ420/1.0",
          Range: "bytes=0-2047",
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
    source: "hold-loop",
    mount: "/api/fm/listen",
    dj420: "continuous",
    note: "Upstream station stream offline — continuous hold loop active. Set PRIMARY_STREAM_URL to AzuraCast for full music."
  });
}
