import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live Radio continuous audio for:
 *   https://fm.leaflock.com.au/live.mp3
 *   https://fm.leaflock.com.au/api/fm/listen
 *
 * Prefer external DJ420 Liquidsoap/Icecast if configured and reachable.
 * Never proxy ourselves (would loop). Fallback = finite hold file (client loops).
 */

const EXTERNAL_STREAM_CANDIDATES = [
  process.env.PRIMARY_STREAM_URL,
  process.env.DJ420_UPSTREAM_URL,
  // Only use NEXT_PUBLIC_STREAM_URL if it is NOT this app's own mount
  process.env.NEXT_PUBLIC_STREAM_URL,
  "https://stream.leaflock.com.au/live.mp3",
  "https://stream.leaflock.com.au/main"
].filter((value): value is string => Boolean(value && value.trim()));

function isSelfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "fm.leaflock.com.au" || host === "localhost" || host === "127.0.0.1") {
      return (
        u.pathname === "/live.mp3" ||
        u.pathname === "/live.pm3" ||
        u.pathname === "/api/fm/listen" ||
        u.pathname.startsWith("/api/fm/listen")
      );
    }
  } catch {
    // relative paths
    return (
      url.startsWith("/live.mp3") ||
      url.startsWith("/live.pm3") ||
      url.startsWith("/api/fm/listen")
    );
  }
  return false;
}

async function serveHoldFile(): Promise<Response> {
  const filePath = path.join(process.cwd(), "public", "bg-hold.wav");
  const file = await readFile(filePath);
  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(file.length),
      "Cache-Control": "public, max-age=60",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "X-LeafLock-Audio-Source": "hold",
      "X-LeafLock-DJ420": "continuous"
    }
  });
}

export async function GET() {
  for (const url of EXTERNAL_STREAM_CANDIDATES) {
    if (isSelfUrl(url)) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "LeafLockFM-DJ420/1.0",
          Accept: "audio/*,application/octet-stream,*/*",
          "Icy-MetaData": "1"
        },
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!upstream.ok || !upstream.body) continue;

      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      const lengthHeader = upstream.headers.get("content-length");
      const length = lengthHeader ? Number(lengthHeader) : null;

      if (type.includes("text/html") || type.includes("application/json")) continue;
      if (length !== null && Number.isFinite(length) && length > 0 && length < 8192) {
        if (!type.includes("mpeg") && !type.includes("ogg") && !type.includes("aac")) {
          continue;
        }
      }

      const headers = new Headers();
      headers.set(
        "Content-Type",
        type.includes("audio") || type.includes("mpeg") || type.includes("ogg") || type.includes("aac")
          ? type
          : "audio/mpeg"
      );
      headers.set("Cache-Control", "no-store, no-cache");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-LeafLock-Audio-Source", "stream");
      headers.set("X-LeafLock-DJ420", "continuous");
      headers.set("Connection", "keep-alive");
      const icy = upstream.headers.get("icy-metaint");
      if (icy) headers.set("icy-metaint", icy);

      return new Response(upstream.body, { status: 200, headers });
    } catch {
      // try next
    }
  }

  try {
    return await serveHoldFile();
  } catch {
    return NextResponse.json(
      {
        error: "Live mount unavailable",
        mount: "https://fm.leaflock.com.au/live.mp3",
        hint: "Set DJ420_UPSTREAM_URL or PRIMARY_STREAM_URL to a real Icecast/Liquidsoap MP3 URL"
      },
      { status: 503 }
    );
  }
}
