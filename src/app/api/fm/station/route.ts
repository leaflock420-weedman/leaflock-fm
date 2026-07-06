import { getNowPlaying, resetLiveStation } from "@/lib/fm-station";
import { verifyFmDeskAccess } from "@/lib/fm-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const station = await getNowPlaying();
    return Response.json(station, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Station unavailable" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { action?: string };
  if (body.action === "reset") {
    const station = await resetLiveStation();
    return Response.json(station);
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}