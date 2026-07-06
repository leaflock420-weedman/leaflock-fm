import { tickConductor } from "@/lib/fm-conductor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** SSE broadcast for station revision updates (WebSocket alternative). */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let lastRevision = -1;

      const push = async () => {
        if (closed) return;
        try {
          const state = await tickConductor();
          if (state.revision !== lastRevision) {
            lastRevision = state.revision;
            controller.enqueue(
              encoder.encode(`event: station\ndata: ${JSON.stringify(state)}\n\n`)
            );
          } else {
            controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
          }
        } catch {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "tick failed" })}\n\n`)
          );
        }
      };

      await push();
      const interval = setInterval(() => {
        void push();
      }, 20_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}