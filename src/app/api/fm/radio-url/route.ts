import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public info for Locked In Radio — continuous mount only (not per-track CDN).
 */
export async function GET() {
  const upstream =
    process.env.DJ420_UPSTREAM_URL?.trim() ||
    process.env.PRIMARY_STREAM_URL?.trim() ||
    process.env.ICECAST_URL?.trim() ||
    null;

  const mount = "https://fm.leaflock.com.au/live.mp3";

  if (!upstream || upstream.includes("fm.leaflock.com.au")) {
    return NextResponse.json({
      ok: false,
      source: "offline",
      station: "LeafLock Locked In Radio",
      title: "LeafLock Radio",
      artist: "Locked In Radio",
      mount,
      url: mount,
      note: "Configure DJ420_UPSTREAM_URL to a continuous Icecast stream."
    });
  }

  return NextResponse.json({
    ok: true,
    source: "stream",
    station: "LeafLock Locked In Radio",
    title: "LeafLock Radio",
    artist: "Locked In Radio",
    album: "LeafLock FM 104.2",
    mount,
    url: mount,
    upstream
  });
}
