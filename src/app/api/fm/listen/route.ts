import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Optional same-origin proxy to the continuous encoder service.
 * Preferred: phones play NEXT_PUBLIC_STREAM_URL (leaflock-stream) directly.
 */

function isSelfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === "fm.leaflock.com.au" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      (host.endsWith(".onrender.com") && u.pathname.includes("fm"))
    );
  } catch {
    return true;
  }
}

function externalCandidates(): string[] {
  return [
    process.env.DJ420_UPSTREAM_URL,
    process.env.PRIMARY_STREAM_URL,
    process.env.ICECAST_URL,
    process.env.STREAM_HOST_URL
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v && v.length > 8));
}

export async function GET(request: Request) {
  const range = request.headers.get("range");

  for (const url of externalCandidates()) {
    if (isSelfUrl(url) && !url.includes("leaflock-stream")) continue;
    try {
      const headers: Record<string, string> = {
        "User-Agent": "LeafLockFM/1.0 LockedInRadio",
        Accept: "audio/mpeg,audio/*,*/*",
        "Icy-MetaData": "1"
      };
      if (range) headers.Range = range;

      const upstream = await fetch(url, { headers, cache: "no-store" });
      if (!upstream.ok && upstream.status !== 206) continue;
      if (!upstream.body) continue;

      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html") || type.includes("json")) continue;

      const out = new Headers();
      out.set("Content-Type", type.includes("audio") ? type : "audio/mpeg");
      out.set("Cache-Control", "no-store, no-cache");
      out.set("Access-Control-Allow-Origin", "*");
      out.set("X-LeafLock-Audio-Source", "stream");
      out.set("X-LeafLock-Station", "LeafLock Locked In Radio");

      return new Response(upstream.body, {
        status: upstream.status === 206 ? 206 : 200,
        headers: out
      });
    } catch (error) {
      console.error("[live.mp3] upstream failed", url, error);
    }
  }

  return NextResponse.json(
    {
      error: "continuous_stream_offline",
      message:
        "Continuous encoder offline. Expected leaflock-stream service at DJ420_UPSTREAM_URL."
    },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function HEAD(request: Request) {
  const get = await GET(request);
  return new NextResponse(null, { status: get.status, headers: get.headers });
}
