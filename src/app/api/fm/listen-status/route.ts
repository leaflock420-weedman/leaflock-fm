import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Status for LeafLock Locked In Radio mount (/live.mp3).
 * source=stream → continuous Icecast/Liquidsoap
 * source=radio  → current station track audio via /live.mp3 (background-capable)
 * source=silent → no music on the mount yet
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
  const upstreamUrl = process.env.DJ420_UPSTREAM_URL?.trim();
  const primary = process.env.PRIMARY_STREAM_URL?.trim();

  for (const candidate of [upstreamUrl, primary]) {
    if (!candidate || isSelfUrl(candidate)) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(candidate, {
        headers: {
          Range: "bytes=0-1023",
          "User-Agent": "LeafLockFM/1.0",
          Accept: "audio/*"
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (
        res.ok &&
        (type.includes("audio") || type.includes("mpeg") || type.includes("octet-stream"))
      ) {
        return NextResponse.json({
          ok: true,
          source: "stream",
          station: "LeafLock Locked In Radio",
          mount: "https://fm.leaflock.com.au/live.mp3",
          upstream: candidate
        });
      }
    } catch {
      // try next
    }
  }

  if (process.env.DJ420_DISABLE_TRACK_AUDIO === "1") {
    return NextResponse.json({
      ok: true,
      source: "silent",
      station: "LeafLock Locked In Radio",
      mount: "https://fm.leaflock.com.au/live.mp3",
      note: "Track audio disabled. Set DJ420_UPSTREAM_URL for continuous encoder."
    });
  }

  // Track proxy is the default Locked In Radio path (HTML audio survives exit).
  return NextResponse.json({
    ok: true,
    source: "radio",
    station: "LeafLock Locked In Radio",
    mount: "https://fm.leaflock.com.au/live.mp3",
    note: "Live room plays /live.mp3 (current station track). Continues after you leave the app."
  });
}
