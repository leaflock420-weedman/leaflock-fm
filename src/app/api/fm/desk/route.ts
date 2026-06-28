import { emailTopLovedDigest } from "@/lib/fm-email";
import {
  addOwnerQueueItem,
  appendActivityLog,
  getActivityLog,
  getFmDeskSettings,
  getJukeboxSuggestions,
  getLiveListeners,
  getOwnerQueue,
  getTopLikes,
  getTrackRequests,
  saveFmDeskSettings,
  updateJukeboxSuggestion,
  verifyFmDeskAccess,
  type FmDeskSettings
} from "@/lib/fm-store";
import { normalizePlaylists, type FmPlaylistKey } from "@/lib/fm-playlists";
import { parseYouTubeVideoId } from "@/lib/youtube-url";

export async function GET(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, topLikes, jukebox, listeners, requests, ownerQueue, activityLog] =
    await Promise.all([
      getFmDeskSettings(),
      getTopLikes(25),
      getJukeboxSuggestions("pending"),
      getLiveListeners(),
      getTrackRequests(15),
      getOwnerQueue(),
      getActivityLog(80)
    ]);

  return Response.json({
    settings,
    topLikes,
    jukebox,
    listeners,
    requests,
    ownerQueue,
    activityLog
  });
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

  void appendActivityLog({
    type: "desk_save",
    summary: "Desk settings saved",
    details: { mainRotation: settings.playlists.mainRotation }
  });

  return Response.json({ settings });
}

export async function POST(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: string;
    videoId?: string;
    youtubeUrl?: string;
    title?: string;
    jukeboxId?: string;
    jukeboxStatus?: "played" | "skipped";
  };

  if (body.action === "email-loved") {
    const result = await emailTopLovedDigest(20);
    return Response.json(result);
  }

  if (body.action === "queue-track") {
    const videoId =
      parseYouTubeVideoId(body.videoId ?? "") ?? parseYouTubeVideoId(body.youtubeUrl ?? "");
    if (!videoId) {
      return Response.json({ error: "Valid YouTube link or video ID required" }, { status: 400 });
    }

    const item = await addOwnerQueueItem({
      videoId,
      title: body.title?.trim() || `Queued track ${videoId}`
    });
    void appendActivityLog({
      type: "desk_queue",
      summary: `Queued: ${item.title}`,
      details: { videoId: item.videoId }
    });
    return Response.json({ item });
  }

  if (body.action === "jukebox-status" && body.jukeboxId && body.jukeboxStatus) {
    const item = await updateJukeboxSuggestion(body.jukeboxId, body.jukeboxStatus);
    if (!item) {
      return Response.json({ error: "Jukebox item not found" }, { status: 404 });
    }
    return Response.json({ item });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}