import { serveCurrentTrackForMount } from "@/lib/dj420-audio-source";
import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * LeafLock Locked In Radio mount: https://fm.leaflock.com.au/live.mp3
 *
 * WHY STREAMS USED TO STOP:
 * Proxying multi‑MB audio through Render/Cloudflare times out mid-track.
 *
 * FIX: resolve a direct audio URL (Piped/Invidious) and 302 redirect the
 * browser there. HTML <audio> keeps playing after you leave Chrome.
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
  return [process.env.DJ420_UPSTREAM_URL, process.env.PRIMARY_STREAM_URL]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v && !isSelfUrl(v)));
}

async function tryExternalStream(): Promise<Response | null> {
  for (const url of externalCandidates()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "LeafLockFM/1.0 LockedInRadio",
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
      headers.set("X-LeafLock-Station", "LeafLock Locked In Radio");
      headers.set("X-LeafLock-Mount", "https://fm.leaflock.com.au/live.mp3");
      return new Response(upstream.body, { status: 200, headers });
    } catch {
      // try next
    }
  }
  return null;
}

async function serveSilent(): Promise<Response> {
  const file = await readFile(path.join(process.cwd(), "public", "silent.mp3"));
  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-LeafLock-Audio-Source": "silent",
      "X-LeafLock-Station": "LeafLock Locked In Radio",
      "X-LeafLock-Mount": "https://fm.leaflock.com.au/live.mp3"
    }
  });
}

export async function GET(request: Request) {
  // 1) Real Icecast/Liquidsoap if configured
  const external = await tryExternalStream();
  if (external) return external;

  // 2) Current station track → 302 to direct audio CDN (does not die mid-track on Render)
  if (process.env.DJ420_DISABLE_TRACK_AUDIO !== "1") {
    try {
      const trackResponse = await serveCurrentTrackForMount(request);
      if (trackResponse.status === 302 || trackResponse.ok || trackResponse.status === 206) {
        return trackResponse;
      }
    } catch (error) {
      console.error("[live.mp3] track resolve failed", error);
    }
  }

  // 3) Last resort — client must treat as failure and keep retrying
  try {
    return await serveSilent();
  } catch {
    return NextResponse.json({ error: "live.mp3 unavailable" }, { status: 503 });
  }
}

export async function HEAD(request: Request) {
  const get = await GET(request);
  return new NextResponse(null, {
    status: get.status,
    headers: get.headers
  });
}
