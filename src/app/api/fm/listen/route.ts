import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * LeafLock Locked In Radio mount: https://fm.leaflock.com.au/live.mp3
 *
 * Xiaohongshu model: ONE continuous Icecast/Liquidsoap MP3 stream.
 * DJ crossfade on the encoder. Phone = permanent native <audio>. No YouTube.
 *
 * Set DJ420_UPSTREAM_URL=https://stream.leaflock.com.au/live.mp3
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

      // No short timeout — this is a long-lived radio connection.
      const upstream = await fetch(url, {
        headers,
        cache: "no-store"
      });

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
      const icy = upstream.headers.get("icy-name");
      if (icy) out.set("icy-name", icy);

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
      station: "LeafLock Locked In Radio",
      message:
        "No continuous Icecast/Liquidsoap stream configured. Set DJ420_UPSTREAM_URL (e.g. https://stream.leaflock.com.au/live.mp3). Per-track YouTube proxy was removed.",
      docs: "liquidsoap/README.md"
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "X-LeafLock-Audio-Source": "offline"
      }
    }
  );
}

export async function HEAD(request: Request) {
  const get = await GET(request);
  return new NextResponse(null, { status: get.status, headers: get.headers });
}
