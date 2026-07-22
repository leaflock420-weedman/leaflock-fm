import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live Radio mount:
 *   https://fm.leaflock.com.au/live.mp3
 *
 * Proxies DJ420_UPSTREAM_URL / PRIMARY_STREAM_URL when available.
 * Otherwise serves a same-origin MP3 hold file (client loops).
 * Never proxies this app's own /live.mp3 (loop protection).
 */

const EXTERNAL_STREAM_CANDIDATES = [
  process.env.DJ420_UPSTREAM_URL,
  process.env.PRIMARY_STREAM_URL,
  process.env.NEXT_PUBLIC_STREAM_URL,
  "https://stream.leaflock.com.au/live.mp3"
].filter((value): value is string => Boolean(value && value.trim()));

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

async function serveHoldMp3(): Promise<Response> {
  const candidates = [
    path.join(process.cwd(), "public", "live-hold.mp3"),
    path.join(process.cwd(), "public", "silent.mp3")
  ];

  for (const filePath of candidates) {
    try {
      const file = await readFile(filePath);
      return new NextResponse(file, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(file.length),
          "Cache-Control": "public, max-age=60",
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
          "X-LeafLock-Audio-Source": "hold",
          "X-LeafLock-Mount": "https://fm.leaflock.com.au/live.mp3"
        }
      });
    } catch {
      // try next
    }
  }

  return NextResponse.json(
    { error: "live.mp3 hold file missing" },
    { status: 503 }
  );
}

export async function GET() {
  for (const url of EXTERNAL_STREAM_CANDIDATES) {
    if (isSelfUrl(url)) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "LeafLockFM/1.0",
          Accept: "audio/mpeg,audio/*,*/*",
          "Icy-MetaData": "1"
        },
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!upstream.ok || !upstream.body) continue;

      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html") || type.includes("application/json")) continue;

      const headers = new Headers();
      headers.set(
        "Content-Type",
        type.includes("audio") || type.includes("mpeg") || type.includes("ogg")
          ? type
          : "audio/mpeg"
      );
      headers.set("Cache-Control", "no-store, no-cache");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-LeafLock-Audio-Source", "stream");
      headers.set("X-LeafLock-Mount", "https://fm.leaflock.com.au/live.mp3");
      headers.set("Connection", "keep-alive");
      const icy = upstream.headers.get("icy-metaint");
      if (icy) headers.set("icy-metaint", icy);

      return new Response(upstream.body, { status: 200, headers });
    } catch {
      // next candidate
    }
  }

  return serveHoldMp3();
}
