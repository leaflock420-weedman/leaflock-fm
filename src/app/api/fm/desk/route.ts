import { emailTopLovedDigest } from "@/lib/fm-email";
import {
  getFmDeskSettings,
  getTopLikes,
  saveFmDeskSettings,
  verifyFmDeskAccess,
  type FmDeskSettings
} from "@/lib/fm-store";
import { normalizePlaylists, type FmPlaylistKey } from "@/lib/fm-playlists";

export async function GET(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, topLikes] = await Promise.all([getFmDeskSettings(), getTopLikes(25)]);
  return Response.json({ settings, topLikes });
}

export async function PUT(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<FmDeskSettings> & {
    playlistId?: string;
    playlists?: Partial<Record<FmPlaylistKey, string>>;
  };

  if (body.playlistId?.trim() && !body.playlists) {
    const settings = await saveFmDeskSettings({
      playlists: { mainRotation: body.playlistId.trim() }
    });
    return Response.json({ settings });
  }

  const settings = await saveFmDeskSettings({
    playlists: body.playlists ? normalizePlaylists(body.playlists) : undefined,
    youtubeLiveVideoId: body.youtubeLiveVideoId,
    youtubeChannelId: body.youtubeChannelId,
    ownerEmail: body.ownerEmail,
    schedule: body.schedule
  });

  return Response.json({ settings });
}

export async function POST(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { action?: string };
  if (body.action === "email-loved") {
    const result = await emailTopLovedDigest(20);
    return Response.json(result);
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}