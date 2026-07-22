import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXTERNAL_STREAM_CANDIDATES = [
  process.env.DJ420_UPSTREAM_URL,
  process.env.PRIMARY_STREAM_URL,
  process.env.NEXT_PUBLIC_STREAM_URL,
  "https://stream.leaflock.com.au/live.mp3"
].filter((value): value is string => Boolean(value && value.trim()));

function isSelfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (
      host === "fm.leaflock.com.au" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".onrender.com")
    ) {
      return u.pathname === "/live.mp3" || u.pathname.startsWith("/api/fm/listen");
    }
  } catch {
    return url.startsWith("/live.mp3") || url.startsWith("/api/fm/listen");
  }
  return false;
}

export async function GET() {
  const tried: string[] = [];

  for (const url of EXTERNAL_STREAM_CANDIDATES) {
    if (isSelfUrl(url)) continue;
    tried.push(url);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const upstream = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "LeafLockFM/1.0",
          Range: "bytes=0-4095",
          Accept: "audio/mpeg,audio/*,*/*"
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
          mount: "https://fm.leaflock.com.au/live.mp3",
          upstream: url
        });
      }
    } catch {
      // next
    }
  }

  return NextResponse.json({
    ok: true,
    source: "hold",
    mount: "https://fm.leaflock.com.au/live.mp3",
    tried,
    note: "https://fm.leaflock.com.au/live.mp3 is live. Upstream encoder offline — hold MP3 until DJ420_UPSTREAM_URL is set."
  });
}
