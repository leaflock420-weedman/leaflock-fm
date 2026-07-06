import { getNowPlaying } from "@/lib/fm-station";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getNowPlaying();
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