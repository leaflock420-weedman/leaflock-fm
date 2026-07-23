import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * https://fm.leaflock.com.au/live.mp3
 *
 * LIGHTWEIGHT only — never spawn yt-dlp (that OOM-killed Render starter).
 *
 * - If DJ420_UPSTREAM_URL points at a real Icecast/Liquidsoap mount, proxy it.
 * - Otherwise serve tiny silent.mp3 (Media Session host only).
 *
 * Live room music comes from YouTube unless a real upstream stream is configured.
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

async function serveSilent(): Promise<Response> {
  const file = await readFile(path.join(process.cwd(), "public", "silent.mp3"));
  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(file.length),
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      "X-LeafLock-Audio-Source": "silent",
      "X-LeafLock-Mount": "https://fm.leaflock.com.au/live.mp3"
    }
  });
}

export async function GET() {
  // Only proxy a real external encoder — never self, never yt-dlp.
  const upstreamUrl = process.env.DJ420_UPSTREAM_URL?.trim();
  if (upstreamUrl && !isSelfUrl(upstreamUrl)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const upstream = await fetch(upstreamUrl, {
        headers: {
          "User-Agent": "LeafLockFM/1.0",
          Accept: "audio/mpeg,audio/*,*/*",
          "Icy-MetaData": "1"
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);

      if (upstream.ok && upstream.body) {
        const type = (upstream.headers.get("content-type") || "").toLowerCase();
        if (!type.includes("text/html") && !type.includes("json")) {
          const headers = new Headers();
          headers.set("Content-Type", type.includes("audio") ? type : "audio/mpeg");
          headers.set("Cache-Control", "no-store");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("X-LeafLock-Audio-Source", "stream");
          headers.set("X-LeafLock-Mount", "https://fm.leaflock.com.au/live.mp3");
          return new Response(upstream.body, { status: 200, headers });
        }
      }
    } catch {
      // fall through to silent
    }
  }

  try {
    return await serveSilent();
  } catch {
    return NextResponse.json({ error: "live.mp3 unavailable" }, { status: 503 });
  }
}
