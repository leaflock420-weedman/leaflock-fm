import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STREAM_CANDIDATES = [
  process.env.NEXT_PUBLIC_STREAM_URL,
  process.env.PRIMARY_STREAM_URL,
  "https://stream.leaflock.com.au/main"
].filter((value): value is string => Boolean(value && value.trim()));

async function serveHoldAudio() {
  const filePath = path.join(process.cwd(), "public", "bg-hold.wav");
  try {
    const file = await readFile(filePath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(file.length),
        "Cache-Control": "public, max-age=600",
        "X-LeafLock-Audio-Source": "hold",
        "Accept-Ranges": "bytes"
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Background audio hold file missing" },
      { status: 503 }
    );
  }
}

/**
 * Same-origin audio for phones.
 * Proxies the live station stream when available so Chrome can keep playing
 * after the user leaves the browser app. Falls back to a real WAV hold file
 * (not empty silence) so Media Session does not disappear.
 */
export async function GET() {
  for (const url of STREAM_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "LeafLockFM/1.0",
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

      // Reject HTML error pages and tiny non-stream payloads.
      if (type.includes("text/html") || type.includes("application/json")) continue;
      if (length !== null && length > 0 && length < 2048 && !type.includes("mpeg") && !type.includes("ogg")) {
        continue;
      }

      const headers = new Headers();
      headers.set(
        "Content-Type",
        type.includes("audio") || type.includes("mpeg") || type.includes("ogg")
          ? type
          : "audio/mpeg"
      );
      headers.set("Cache-Control", "no-store, no-cache");
      headers.set("X-LeafLock-Audio-Source", "stream");
      headers.set("Connection", "keep-alive");

      return new NextResponse(upstream.body, {
        status: 200,
        headers
      });
    } catch {
      // Try next candidate.
    }
  }

  return serveHoldAudio();
}
