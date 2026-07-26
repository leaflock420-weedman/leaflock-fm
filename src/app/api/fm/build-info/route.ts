import { NextResponse } from "next/server";
import { LEAFLOCK_STREAM_URL, LEAFLOCK_RADIO_STATION } from "@/lib/leaflock-radio-stream";

export const dynamic = "force-dynamic";

/** Verify which build is live (deploy fingerprint). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    build: "xhs-stream-v1",
    liveEngine: "native-continuous-audio",
    streamUrl: LEAFLOCK_STREAM_URL,
    station: LEAFLOCK_RADIO_STATION,
    notYouTube: true,
    gitHint: "42cb8ad+"
  });
}
