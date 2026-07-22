import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DJ420 continuous Live Radio mount (same-origin).
 *
 * Public Live Radio clients MUST use this single URL forever.
 * Do not change the client audio src between songs — crossfade/mix is
 * expected to be baked into the continuous stream upstream (AzuraCast / encoder).
 *
 * Priority:
 * 1) PRIMARY_STREAM_URL / NEXT_PUBLIC_STREAM_URL / stream.leaflock.com.au
 * 2) Continuous loop of bg-hold.wav so the element never ends (keeps session alive)
 */

/** DJ420 Liquidsoap → Icecast public mount (server-side crossfade). */
const DEFAULT_LIVE_MOUNT = "https://stream.leaflock.com.au/live.mp3";

const STREAM_CANDIDATES = [
  process.env.PRIMARY_STREAM_URL,
  process.env.NEXT_PUBLIC_STREAM_URL,
  DEFAULT_LIVE_MOUNT,
  // Legacy mounts (fallback only)
  "https://stream.leaflock.com.au/main"
].filter((value): value is string => Boolean(value && value.trim()));

async function serveContinuousHoldLoop(): Promise<Response> {
  const filePath = path.join(process.cwd(), "public", "bg-hold.wav");
  const file = await readFile(filePath);

  // Endless chunked body so <audio> never hits "ended" when stream is offline.
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const chunk = new Uint8Array(file);
      while (!closed) {
        try {
          controller.enqueue(chunk);
        } catch {
          break;
        }
        // ~12s of audio at a time; small delay keeps event loop healthy.
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    cancel() {
      closed = true;
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store, no-cache",
      "X-LeafLock-Audio-Source": "hold-loop",
      "X-LeafLock-DJ420": "continuous",
      Connection: "keep-alive"
    }
  });
}

export async function GET() {
  for (const url of STREAM_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
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
      if (
        length !== null &&
        length > 0 &&
        length < 4096 &&
        !type.includes("mpeg") &&
        !type.includes("ogg") &&
        !type.includes("aac")
      ) {
        continue;
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

      // Pass through icy metadata interval when present (for future clients).
      const icy = upstream.headers.get("icy-metaint");
      if (icy) headers.set("icy-metaint", icy);

      return new Response(upstream.body, { status: 200, headers });
    } catch {
      // try next
    }
  }

  try {
    return await serveContinuousHoldLoop();
  } catch {
    return NextResponse.json(
      { error: "DJ420 continuous stream unavailable" },
      { status: 503 }
    );
  }
}
