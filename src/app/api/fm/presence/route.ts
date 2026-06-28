import { appendActivityLog, recordListenerHeartbeat } from "@/lib/fm-store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    listenerId?: string;
    displayName?: string;
    instagram?: string;
  };

  const listenerId = body.listenerId?.trim();
  if (!listenerId) {
    return Response.json({ error: "listenerId is required" }, { status: 400 });
  }

  const listener = await recordListenerHeartbeat({
    listenerId,
    displayName: body.displayName,
    instagram: body.instagram?.replace(/^@/, "")
  });

  void appendActivityLog({
    type: "presence",
    listenerId,
    instagram: listener.instagram,
    summary: listener.instagram
      ? `Listener @${listener.instagram.replace(/^@/, "")} is live`
      : "Anonymous listener heartbeat",
    details: { displayName: body.displayName ?? null }
  });

  return Response.json({ listener });
}