import { tickConductor } from "@/lib/fm-conductor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await tickConductor();
    return Response.json(state, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Station state unavailable"
      },
      { status: 500 }
    );
  }
}