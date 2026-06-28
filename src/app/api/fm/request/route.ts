import { sendOwnerEmail } from "@/lib/fm-email";
import { appendActivityLog, recordTrackRequest } from "@/lib/fm-store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    trackTitle?: string;
  };

  const message = body.message?.trim();
  if (!message || message.length < 3) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  void appendActivityLog({
    type: "request",
    summary: `Request: ${body.trackTitle?.trim() || message.slice(0, 80)}`,
    details: { message }
  });

  const entry = await recordTrackRequest(message, body.trackTitle);

  const email = await sendOwnerEmail(
    `LeafLock FM request: ${body.trackTitle?.trim() || "Listener request"}`,
    [
      "New listener request:",
      "",
      body.trackTitle?.trim() ? `Track: ${body.trackTitle.trim()}` : null,
      message
    ]
      .filter(Boolean)
      .join("\n")
  );

  return Response.json({ request: entry, email });
}