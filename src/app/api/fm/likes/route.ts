import { emailTrackLove } from "@/lib/fm-email";
import { appendActivityLog, getTopLikes, recordTrackLike } from "@/lib/fm-store";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "10");
  const top = await getTopLikes(Number.isFinite(limit) ? Math.min(limit, 50) : 10);
  return Response.json({ top });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    trackId?: string;
    title?: string;
    artist?: string;
    source?: "playlist" | "stream";
  };

  if (!body.trackId?.trim() || !body.title?.trim()) {
    return Response.json({ error: "trackId and title are required" }, { status: 400 });
  }

  void appendActivityLog({
    type: "like",
    summary: `Loved: ${body.title?.trim()}`,
    details: {
      trackId: body.trackId?.trim() ?? null,
      artist: body.artist?.trim() ?? null
    }
  });

  const like = await recordTrackLike({
    trackId: body.trackId.trim(),
    title: body.title.trim(),
    artist: body.artist?.trim(),
    source: body.source === "stream" ? "stream" : "playlist"
  });

  const emailOnLike = process.env.FM_EMAIL_ON_LIKE !== "false";
  if (emailOnLike) {
    void emailTrackLove(like);
  }

  return Response.json({ like });
}