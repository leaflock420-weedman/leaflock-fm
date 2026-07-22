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
 * DJ420 continuous track audio:
 * 1) Prefer external Icecast/Liquidsoap if DJ420_UPSTREAM_URL is set
 * 2) Else stream the current station track audio via yt-dlp (real music)
 * 3) Client reloads /live.mp3 on ended → next station track (no src change of mount path)
 */

const EXTERNAL = [
  process.env.DJ420_UPSTREAM_URL,
  process.env.PRIMARY_STREAM_URL
].filter((v): v is string => Boolean(v && v.trim() && !v.includes("fm.leaflock.com.au")));

async function tryExternalStream(): Promise<Response | null> {
  for (const url of EXTERNAL) {
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
  const filePath = path.join(process.cwd(), "public", "live-hold.mp3");
  try {
    const file = await readFile(filePath);
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
    return NextResponse.json({ error: "live.mp3 unavailable" }, { status: 503 });
  }
}

export async function GET(request: Request) {
  // 1) Real encoder if configured
  const external = await tryExternalStream();
  if (external) return external;

  // 2) DJ420 current track audio (YouTube → googlevideo proxy)
  try {
    return await proxyCurrentTrackResponse(request);
  } catch (error) {
    console.error("[live.mp3] track proxy failed", error);
  }

  // 3) Last resort hold
  return serveHold();
}
