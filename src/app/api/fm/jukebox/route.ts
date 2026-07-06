import { addRequestQueueItem } from "@/lib/fm-admin-data";
import { sendOwnerEmail } from "@/lib/fm-email";
import { validateTrackRequest } from "@/lib/fm-request-rules";
import {
  appendActivityLog,
  boostJukeboxSuggestion,
  getJukeboxSuggestions,
  recordJukeboxSuggestion
} from "@/lib/fm-store";
import { parseYouTubeVideoId } from "@/lib/youtube-url";

export async function GET() {
  const pending = await getJukeboxSuggestions("pending");
  return Response.json({
    pending: pending.map((item) => ({
      id: item.id,
      title: item.title,
      videoId: item.videoId,
      instagram: item.instagram,
      boosts: item.boosts ?? 0
    }))
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    youtubeUrl?: string;
    videoId?: string;
    title?: string;
    suggestedBy?: string;
    instagram?: string;
  };

  const videoId =
    parseYouTubeVideoId(body.videoId ?? "") ?? parseYouTubeVideoId(body.youtubeUrl ?? "");

  const requesterId = body.suggestedBy?.trim() || "anonymous";

  const validation = await validateTrackRequest({
    youtubeUrl: body.youtubeUrl ?? "",
    videoId: videoId ?? "",
    title: body.title,
    requesterId,
    requestedBy: requesterId
  });

  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  void appendActivityLog({
    type: "jukebox",
    instagram: body.instagram,
    summary: `Jukebox: ${validation.title}`,
    details: { videoId: validation.videoId, suggestedBy: requesterId }
  });

  const entry = await recordJukeboxSuggestion({
    videoId: validation.videoId,
    title: validation.title,
    suggestedBy: requesterId,
    instagram: body.instagram
  });

  await addRequestQueueItem({
    videoId: validation.videoId,
    title: validation.title,
    requestedBy: requesterId,
    instagram: body.instagram,
    youtubeUrl: body.youtubeUrl ?? `https://www.youtube.com/watch?v=${validation.videoId}`,
    durationSec: validation.durationSec
  });

  const email = await sendOwnerEmail(
    `LeafLock FM jukebox: ${entry.title}`,
    [
      "New community jukebox suggestion:",
      "",
      `Title: ${entry.title}`,
      `Video: https://www.youtube.com/watch?v=${entry.videoId}`,
      body.instagram ? `Instagram: @${body.instagram.replace(/^@/, "")}` : null
    ]
      .filter(Boolean)
      .join("\n")
  );

  return Response.json({ suggestion: entry, email });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return Response.json({ error: "Missing suggestion id" }, { status: 400 });
  }

  const suggestions = await getJukeboxSuggestions("pending");
  const item = suggestions.find((s) => s.id === body.id);
  if (!item) {
    return Response.json({ error: "Suggestion not found" }, { status: 404 });
  }

  const updated = await boostJukeboxSuggestion(body.id);
  if (!updated) {
    return Response.json({ error: "Suggestion not found" }, { status: 404 });
  }

  return Response.json({ ok: true, boosts: updated.boosts ?? 0 });
}