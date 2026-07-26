import { runDj420Warmup } from "@/lib/dj420-host";
import { LEAFLOCK_STREAM_URL } from "@/lib/leaflock-radio-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Warm DJ metadata/playlist state AND the continuous encoder.
 * Stream service is always-on; hitting /health keeps the dyno awake and
 * confirms the paced mount is alive.
 */
export async function GET() {
  try {
    const streamBase =
      process.env.DJ420_UPSTREAM_URL?.replace(/\/live\.mp3.*$/i, "") ||
      process.env.NEXT_PUBLIC_STREAM_URL?.replace(/\/live\.mp3.*$/i, "") ||
      LEAFLOCK_STREAM_URL.replace(/\/live\.mp3.*$/i, "");

    const [payload, streamHealth] = await Promise.all([
      runDj420Warmup(),
      fetch(`${streamBase}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000)
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => null)) as {
            ok?: boolean;
            build?: string;
            clients?: number;
            lastTitle?: string | null;
            readrate?: number;
          } | null;
          return {
            ok: res.ok && body?.ok !== false,
            status: res.status,
            build: body?.build ?? null,
            clients: body?.clients ?? null,
            lastTitle: body?.lastTitle ?? null,
            readrate: body?.readrate ?? null
          };
        })
        .catch((error: unknown) => ({
          ok: false,
          status: 0,
          build: null,
          clients: null,
          lastTitle: null,
          readrate: null,
          error: error instanceof Error ? error.message : "stream health failed"
        }))
    ]);

    const ok = Boolean(payload.ok) && Boolean(streamHealth.ok);
    return Response.json(
      {
        ...payload,
        ok,
        stream: streamHealth
      },
      {
        status: ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
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