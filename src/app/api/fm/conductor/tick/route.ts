import { tickConductor } from "@/lib/fm-conductor";

export const dynamic = "force-dynamic";

/** LeafLock FM Conductor heartbeat — keeps station clock alive without playing audio. */
export async function POST() {
  try {
    const state = await tickConductor();
    return Response.json({
      ok: true,
      revision: state.revision,
      tickCount: state.conductor.tickCount,
      lastTickAt: state.conductor.lastTickAt
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Conductor tick failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}