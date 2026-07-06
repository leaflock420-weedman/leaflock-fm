import {
  extractYouTubePlaylistId,
  getPlaylistRegistry,
  getRequestQueue,
  getScheduledShows,
  getStationControl,
  saveScheduledShows,
  saveStationControl,
  upsertPlaylistRegistry,
  updateRequestQueueItem,
  type PlaylistCategory,
  type StationMode
} from "@/lib/fm-admin-data";
import { resetLiveStation } from "@/lib/fm-station";
import { verifyFmDeskAccess } from "@/lib/fm-store";

export async function GET(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [control, playlists, requests, shows] = await Promise.all([
    getStationControl(),
    getPlaylistRegistry(),
    getRequestQueue(),
    getScheduledShows()
  ]);

  return Response.json({ control, playlists, requests, shows });
}

export async function PUT(request: Request) {
  if (!verifyFmDeskAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: string;
    mode?: StationMode;
    activePlaylistId?: string;
    maintenanceMessage?: string;
    youtubeLiveVideoId?: string;
    youtubeLiveUrl?: string;
    allowRequests?: boolean;
    playlist?: {
      id?: string;
      name: string;
      youtubePlaylistUrl: string;
      category: PlaylistCategory;
      notes?: string;
      active?: boolean;
      isDefault?: boolean;
      archived?: boolean;
    };
    show?: {
      id?: string;
      name: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      playlistRegistryId: string;
      allowRequests?: boolean;
      allowPodcastClips?: boolean;
      returnToDefaultAfter?: boolean;
      active?: boolean;
    };
    requestId?: string;
    requestStatus?: "approved" | "rejected" | "skipped" | "pinned" | "banned" | "played";
  };

  if (body.action === "return-default") {
    const control = await getStationControl();
    const next = await saveStationControl({
      mode: "auto_radio",
      activePlaylistId: control.defaultPlaylistId
    });
    await resetLiveStation();
    return Response.json({ control: next });
  }

  if (body.action === "maintenance") {
    const next = await saveStationControl({
      mode: "maintenance",
      maintenanceMessage:
        body.maintenanceMessage ?? "LeafLock FM is briefly off air. Stay locked."
    });
    return Response.json({ control: next });
  }

  if (body.action === "live-start") {
    const next = await saveStationControl({
      mode: "live_stream",
      youtubeLiveVideoId: body.youtubeLiveVideoId ?? "",
      youtubeLiveUrl: body.youtubeLiveUrl ?? ""
    });
    return Response.json({ control: next });
  }

  if (body.action === "live-end") {
    const control = await getStationControl();
    const next = await saveStationControl({
      mode: "auto_radio",
      activePlaylistId: control.defaultPlaylistId
    });
    await resetLiveStation();
    return Response.json({ control: next });
  }

  if (body.action === "use-playlist" && body.activePlaylistId) {
    const next = await saveStationControl({
      mode: "auto_radio",
      activePlaylistId: body.activePlaylistId
    });
    await resetLiveStation();
    return Response.json({ control: next });
  }

  if (body.action === "save-playlist" && body.playlist) {
    const playlistId = extractYouTubePlaylistId(body.playlist.youtubePlaylistUrl);
    if (!playlistId) {
      return Response.json({ error: "Invalid YouTube playlist URL" }, { status: 400 });
    }
    const entry = await upsertPlaylistRegistry({
      id: body.playlist.id,
      name: body.playlist.name,
      youtubePlaylistId: playlistId,
      category: body.playlist.category,
      notes: body.playlist.notes ?? "",
      active: body.playlist.active ?? true,
      isDefault: body.playlist.isDefault ?? false,
      archived: body.playlist.archived ?? false
    });
    if (entry.isDefault) {
      await saveStationControl({
        defaultPlaylistId: entry.youtubePlaylistId,
        activePlaylistId: entry.youtubePlaylistId
      });
    }
    return Response.json({ playlist: entry });
  }

  if (body.action === "save-show" && body.show) {
    const shows = await getScheduledShows();
    const show = {
      id: body.show.id ?? `show_${Date.now()}`,
      name: body.show.name,
      dayOfWeek: body.show.dayOfWeek,
      startTime: body.show.startTime,
      endTime: body.show.endTime,
      playlistRegistryId: body.show.playlistRegistryId,
      allowRequests: body.show.allowRequests ?? true,
      allowPodcastClips: body.show.allowPodcastClips ?? false,
      returnToDefaultAfter: body.show.returnToDefaultAfter ?? true,
      active: body.show.active ?? true
    };
    const index = shows.findIndex((s) => s.id === show.id);
    if (index >= 0) shows[index] = show;
    else shows.unshift(show);
    await saveScheduledShows(shows);
    return Response.json({ show });
  }

  if (body.action === "request-status" && body.requestId && body.requestStatus) {
    const item = await updateRequestQueueItem(body.requestId, {
      status: body.requestStatus
    });
    if (!item) return Response.json({ error: "Request not found" }, { status: 404 });
    return Response.json({ item });
  }

  if (body.mode || body.activePlaylistId || body.allowRequests !== undefined) {
    const next = await saveStationControl({
      mode: body.mode,
      activePlaylistId: body.activePlaylistId,
      allowRequests: body.allowRequests
    });
    if (body.activePlaylistId) await resetLiveStation();
    return Response.json({ control: next });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}