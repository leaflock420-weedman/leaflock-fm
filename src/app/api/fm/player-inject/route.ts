import { acknowledgePlayerInject, peekPlayerInject, type PlayerInject } from "@/lib/fm-store";

export async function GET() {
  const inject = await peekPlayerInject();
  return Response.json({ inject });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    inject?: PlayerInject;
  };

  if (body.action !== "ack" || !body.inject?.id || !body.inject.videoId || !body.inject.source) {
    return Response.json({ error: "inject ack required" }, { status: 400 });
  }

  await acknowledgePlayerInject(body.inject);
  return Response.json({ ok: true });
}