import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * source=stream → continuous Icecast (best)
 * source=radio  → native track CDN chain (works without encoder)
 * source=offline → nothing available
 */

function isSelfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === "fm.leaflock.com.au" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".onrender.com")
    );
  } catch {
    return true;
  }
}

export async function GET() {
  const candidates = [
    process.env.DJ420_UPSTREAM_URL,
    process.env.PRIMARY_STREAM_URL,
    process.env.ICECAST_URL
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v && !isSelfUrl(v)));

  for (const candidate of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(candidate, {
        headers: {
          Range: "bytes=0-2047",
          "User-Agent": "LeafLockFM/1.0",
          Accept: "audio/*"
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (
        (res.ok || res.status === 206) &&
        (type.includes("audio") ||
          type.includes("mpeg") ||
          type.includes("ogg") ||
          type.includes("octet-stream") ||
          type === "")
      ) {
        return NextResponse.json({
          ok: true,
          source: "stream",
          station: "LeafLock Locked In Radio",
          mount: "https://fm.leaflock.com.au/live.mp3",
          upstream: candidate,
          model: "continuous-native-audio"
        });
      }
    } catch {
      // next
    }
  }

  // No Icecast — client uses /api/fm/radio-url (direct CDN track audio).
  // This is still native <audio> and supports background pull-down controls.
  return NextResponse.json({
    ok: true,
    source: "radio",
    station: "LeafLock Locked In Radio",
    mount: "https://fm.leaflock.com.au/live.mp3",
    radioUrl: "/api/fm/radio-url",
    model: "native-track-chain",
    note: "Playing station tracks via native audio CDN URLs (Xiaohongshu-style). Optional: set DJ420_UPSTREAM_URL for continuous Icecast."
  });
}
