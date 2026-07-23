import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Disabled — yt-dlp was OOM-killing the Render web service. */
export async function GET() {
  return NextResponse.json({
    disabled: true,
    reason:
      "yt-dlp was removed from the web process after it exceeded Render memory limits. Use DJ420_UPSTREAM_URL (Liquidsoap/Icecast) for continuous live audio.",
    mount: "https://fm.leaflock.com.au/live.mp3"
  });
}
