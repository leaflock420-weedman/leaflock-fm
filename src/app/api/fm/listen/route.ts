import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Same-origin Live Radio mount for phones.
 *
 * Prefer DJ420 Liquidsoap → Icecast:
 *   https://stream.leaflock.com.au/live.mp3
 *
 * If that mount is down, serve a single finite hold file (client loops it).
 * Never stream repeated WAV headers — that corrupts playback after the first cycle.
 */

const DEFAULT_LIVE_MOUNT = "https://stream.leaflock.com.au/live.mp3";

const STREAM_CANDIDATES = [
  process.env.PRIMARY_STREAM_URL,
  process.env.NEXT_PUBLIC_STREAM_URL,
  DEFAULT_LIVE_MOUNT,
  "https://stream.leaflock.com.au/main"
].filter((value): value is string => Boolean(value && value.trim()));

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
      "X-LeafLock-Audio-Source": "hold",
      "X-LeafLock-DJ420": "continuous"
    }
  });
}

export async function GET() {
  for (const url of STREAM_CANDIDATES) {
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
      // Reject tiny junk payloads that are not real streams.
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
      headers.set("X-LeafLock-Audio-Source", "stream");
      headers.set("X-LeafLock-DJ420", "continuous");
      headers.set("Connection", "keep-alive");
      const icy = upstream.headers.get("icy-metaint");
      if (icy) headers.set("icy-metaint", icy);

      return new Response(upstream.body, { status: 200, headers });
    } catch {
      // try next candidate
    }
  }

  try {
    return await serveHoldFile();
  } catch {
    return NextResponse.json(
      {
        error: "DJ420 stream offline",
        hint: "Point stream.leaflock.com.au DNS at Icecast and run liquidsoap/dj420.liq → /live.mp3"
      },
      { status: 503 }
    );
  }
}
