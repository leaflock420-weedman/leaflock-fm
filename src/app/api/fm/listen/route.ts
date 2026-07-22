import { proxyCurrentTrackResponse } from "@/lib/dj420-audio-source";
import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * https://fm.leaflock.com.au/live.mp3
 *
 * 1) Optional Icecast/Liquidsoap upstream (DJ420_UPSTREAM_URL)
 * 2) DJ420 current-track audio via yt-dlp (real songs → works in background)
 * 3) Hold MP3 so the mount never hard-fails
 */

async function tryExternal(): Promise<Response | null> {
  const urls = [process.env.DJ420_UPSTREAM_URL, process.env.PRIMARY_STREAM_URL].filter(
    (v): v is string => Boolean(v && v.trim() && !v.includes("fm.leaflock.com.au"))
  );

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "LeafLockFM/1.0",
          Accept: "audio/mpeg,audio/*,*/*",
          "Icy-MetaData": "1"
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!upstream.ok || !upstream.body) continue;
      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html") || type.includes("json")) continue;

      const headers = new Headers();
      headers.set("Content-Type", type.includes("audio") ? type : "audio/mpeg");
      headers.set("Cache-Control", "no-store");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-LeafLock-Audio-Source", "stream");
      headers.set("X-LeafLock-Mount", "https://fm.leaflock.com.au/live.mp3");
      return new Response(upstream.body, { status: 200, headers });
    } catch {
      // next
    }
  }
  return null;
}

async function serveHold(): Promise<Response> {
  for (const name of ["live-hold.mp3", "silent.mp3"]) {
    try {
      const file = await readFile(path.join(process.cwd(), "public", name));
      return new NextResponse(file, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(file.length),
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "X-LeafLock-Audio-Source": "hold",
          "X-LeafLock-Mount": "https://fm.leaflock.com.au/live.mp3"
        }
      });
    } catch {
      // next file
    }
  }
  return NextResponse.json({ error: "live.mp3 unavailable" }, { status: 503 });
}

export async function GET(request: Request) {
  const external = await tryExternal();
  if (external) return external;

  try {
    const proxied = await proxyCurrentTrackResponse(request);
    // Important: 503/502 must fall through to hold, not return as audio.
    if (proxied.status === 200 || proxied.status === 206) {
      return proxied;
    }
    console.error("[live.mp3] track proxy status", proxied.status);
  } catch (error) {
    console.error("[live.mp3] track proxy failed", error);
  }

  return serveHold();
}
