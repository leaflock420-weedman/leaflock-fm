import { forceAdvanceStation } from "@/lib/fm-station";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Called by the continuous encoder (leaflock-stream) when a track finishes.
 * Not for browsers — requires FM_ADMIN_SECRET.
 */
export async function POST(request: Request) {
  const secret =
    request.headers.get("x-stream-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || secret !== process.env.FM_ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const station = await forceAdvanceStation();
    return NextResponse.json({
      ok: true,
      videoId: station.current?.videoId,
      title: station.current?.title
    });
  } catch (error) {
    console.error("[stream-next]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "advance failed" },
      { status: 500 }
    );
  }
}
