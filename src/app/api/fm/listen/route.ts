import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Continuous Icecast proxy when DJ420_UPSTREAM_URL is set.
 * Track audio for phones uses /api/fm/radio-url (direct CDN) — not this route.
 */

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
      return (
        u.pathname === "/live.mp3" ||
        u.pathname === "/api/fm/listen" ||
        u.pathname.startsWith("/api/fm/listen")
      );
    }
  } catch {
    return url.startsWith("/live.mp3") || url.startsWith("/api/fm/listen");
  }
  return false;
}

function externalCandidates(): string[] {
  return [
    process.env.DJ420_UPSTREAM_URL,
    process.env.PRIMARY_STREAM_URL,
    process.env.ICECAST_URL
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v && !isSelfUrl(v)));
}

export async function GET(request: Request) {
  const range = request.headers.get("range");

  for (const url of externalCandidates()) {
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
      out.set("X-LeafLock-Mount", "https://fm.leaflock.com.au/live.mp3");

      return new Response(upstream.body, {
        status: upstream.status === 206 ? 206 : 200,
        headers: out
      });
    } catch (error) {
      console.error("[live.mp3] upstream failed", url, error);
    }
  }

  // No continuous encoder — clients use /api/fm/radio-url instead.
  return NextResponse.json(
    {
      error: "use_radio_url",
      station: "LeafLock Locked In Radio",
      message:
        "No continuous Icecast configured. Client plays /api/fm/radio-url (direct CDN tracks on native audio).",
      radioUrl: "/api/fm/radio-url"
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "X-LeafLock-Audio-Source": "use-radio-url"
      }
    }
  );
}

export async function HEAD(request: Request) {
  const get = await GET(request);
  return new NextResponse(null, { status: get.status, headers: get.headers });
}
