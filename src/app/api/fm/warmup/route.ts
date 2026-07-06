import { runDj420Warmup } from "@/lib/dj420-host";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await runDj420Warmup();
    return Response.json(payload, {
      status: payload.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Warmup failed"
      },
      { status: 500 }
    );
  }
}