import { getNowPlaying } from "@/lib/fm-station";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Encoder must not read its own stream-sync overlay (rotation feedback loop).
    const forEncoder =
      searchParams.get("for") === "encoder" || searchParams.get("raw") === "1";
    const state = await getNowPlaying({ preferStream: !forEncoder });
    return Response.json(state, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Now playing unavailable" },
      { status: 500 }
    );
  }
}