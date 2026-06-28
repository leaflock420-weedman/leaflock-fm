import { sendOwnerEmail } from "@/lib/fm-email";
import { appendActivityLog, recordJukeboxSuggestion } from "@/lib/fm-store";
import { parseYouTubeVideoId } from "@/lib/youtube-url";

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

  if (!videoId) {
    return Response.json({ error: "Paste a valid YouTube link or video ID" }, { status: 400 });
  }

  void appendActivityLog({
    type: "jukebox",
    instagram: body.instagram,
    summary: `Jukebox: ${body.title?.trim() || videoId}`,
    details: { videoId, suggestedBy: body.suggestedBy ?? null }
  });

  const entry = await recordJukeboxSuggestion({
    videoId,
    title: body.title?.trim() || `YouTube track ${videoId}`,
    suggestedBy: body.suggestedBy,
    instagram: body.instagram
  });

  const email = await sendOwnerEmail(
    `LeafLock FM jukebox: ${entry.title}`,
    [
      "New jukebox suggestion:",
      "",
      `Title: ${entry.title}`,
      `Video: https://www.youtube.com/watch?v=${entry.videoId}`,
      entry.suggestedBy ? `From: ${entry.suggestedBy}` : null,
      entry.instagram ? `Instagram: @${entry.instagram.replace(/^@/, "")}` : null
    ]
      .filter(Boolean)
      .join("\n")
  );

  return Response.json({ suggestion: entry, email });
}