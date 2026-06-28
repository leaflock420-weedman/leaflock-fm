import { recordListenerHeartbeat } from "@/lib/fm-store";

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

  return Response.json({ listener });
}