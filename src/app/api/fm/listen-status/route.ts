import { NextResponse } from "next/server";
import { LEAFLOCK_STREAM_URL } from "@/lib/leaflock-radio-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Reports continuous encoder health (leaflock-stream), not YouTube.
 */
export async function GET() {
  const candidates = [
    process.env.DJ420_UPSTREAM_URL?.trim(),
    process.env.PRIMARY_STREAM_URL?.trim(),
    process.env.NEXT_PUBLIC_STREAM_URL?.trim(),
    LEAFLOCK_STREAM_URL
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    // Skip the website itself
    if (candidate.includes("fm.leaflock.com.au") && !candidate.includes("leaflock-stream")) {
      continue;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(candidate.replace(/\/live\.mp3.*/, "/health"), {
        cache: "no-store",
        signal: controller.signal
      }).catch(async () => {
        // Fallback: probe the stream mount itself
        return fetch(candidate, {
          method: "GET",
          headers: { Range: "bytes=0-1023", Accept: "audio/*" },
          cache: "no-store",
          signal: controller.signal
        });
      });
      clearTimeout(timer);

      if (!res.ok && res.status !== 206) continue;

      let okJson = false;
      try {
        const j = (await res.clone().json()) as { ok?: boolean; service?: string };
        okJson = Boolean(j.ok && (j.service === "leaflock-stream" || j.ok));
      } catch {
        /* binary stream */
      }

      const type = (res.headers.get("content-type") || "").toLowerCase();
      const sourceHdr = (res.headers.get("x-leaflock-audio-source") || "").toLowerCase();
      if (
        okJson ||
        type.includes("audio") ||
        type.includes("mpeg") ||
        sourceHdr.includes("continuous") ||
        sourceHdr === "stream"
      ) {
        return NextResponse.json({
          ok: true,
          source: "stream",
          station: "LeafLock Radio",
          artist: "Locked In Radio",
          album: "LeafLock FM 104.2",
          mount: candidate.includes("/live") ? candidate : LEAFLOCK_STREAM_URL,
          model: "native-continuous-audio",
          build: "xhs-stream-v1"
        });
      }
    } catch {
      /* next */
    }
  }

  return NextResponse.json({
    ok: false,
    source: "offline",
    station: "LeafLock Radio",
    artist: "Locked In Radio",
    album: "LeafLock FM 104.2",
    mount: LEAFLOCK_STREAM_URL,
    note: "Continuous encoder offline — check leaflock-stream service.",
    build: "xhs-stream-v1"
  });
}
