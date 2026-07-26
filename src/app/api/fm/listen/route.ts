import { NextResponse } from "next/server";
import { LEAFLOCK_STREAM_URL } from "@/lib/leaflock-radio-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Website /live.mp3 — redirect to continuous encoder.
 * Phones should prefer NEXT_PUBLIC / hardcoded stream URL directly.
 * No yt-dlp. No silent.mp3 as music.
 */
export async function GET() {
  const upstream =
    process.env.DJ420_UPSTREAM_URL?.trim() ||
    process.env.PRIMARY_STREAM_URL?.trim() ||
    LEAFLOCK_STREAM_URL;

  // Prefer 302 so audio is not double-proxied through this dyno (timeouts).
  return NextResponse.redirect(upstream, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      "X-LeafLock-Audio-Source": "redirect-continuous",
      "X-LeafLock-Station": "LeafLock Locked In Radio"
    }
  });
}

export async function HEAD() {
  return GET();
}
