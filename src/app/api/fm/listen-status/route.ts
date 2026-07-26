import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const candidates = [
    process.env.DJ420_UPSTREAM_URL,
    process.env.PRIMARY_STREAM_URL,
    process.env.NEXT_PUBLIC_STREAM_URL
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
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
      const source = (res.headers.get("x-leaflock-audio-source") || "").toLowerCase();
      if (
        (res.ok || res.status === 206) &&
        (type.includes("audio") ||
          type.includes("mpeg") ||
          source.includes("continuous") ||
          source === "stream")
      ) {
        return NextResponse.json({
          ok: true,
          source: "stream",
          station: "LeafLock FM 104.2",
          artist: "DJ420 — Locked In Radio",
          mount: candidate,
          model: "native-continuous-audio"
        });
      }
    } catch {
      // next
    }
  }

  return NextResponse.json({
    ok: false,
    source: "offline",
    station: "LeafLock FM 104.2",
    artist: "DJ420 — Locked In Radio",
    note: "Continuous encoder (leaflock-stream) not reachable yet."
  });
}
