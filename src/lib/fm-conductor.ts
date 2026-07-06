import {
  getConductorState,
  getStationControl,
  recordPlaybackHistory,
  saveConductorState,
  type StationMode
} from "@/lib/fm-admin-data";
import { getFmPublicConfig } from "@/lib/fm-store";
import { getPublicStation, type PublicStation } from "@/lib/fm-station";
import { parseYouTubeVideoId } from "@/lib/youtube-url";

export type StationStatePayload = PublicStation & {
  mode: StationMode;
  maintenanceMessage: string | null;
  youtubeLiveVideoId: string | null;
  playlistLabel: string;
  playlistReason: string;
  nextCommunityPickInSec: number | null;
  djBlendRecommended: boolean;
  conductor: {
    lastTickAt: string;
    tickCount: number;
    nextTracks: Array<{ videoId: string; title: string }>;
  };
};

const JUKEBOX_INTERVAL_MS = 15 * 60 * 1000;

export async function tickConductor(): Promise<StationStatePayload> {
  const control = await getStationControl();
  const conductorBefore = await getConductorState();

  const [station, config] = await Promise.all([getPublicStation(), getFmPublicConfig()]);

  const lastJukeboxAt = conductorBefore.lastTickAt;
  const nextPickMs = JUKEBOX_INTERVAL_MS - (Date.now() - new Date(lastJukeboxAt).getTime());
  const nextCommunityPickInSec =
    control.mode === "auto_radio" && control.allowRequests
      ? Math.max(0, Math.floor(nextPickMs / 1000))
      : null;

  const nextTracks = station.upNext
    ? [{ videoId: station.current.videoId, title: station.upNext }]
    : [];

  if (station.revision !== conductorBefore.lastRecordedRevision) {
    void recordPlaybackHistory({
      videoId: station.current.videoId,
      title: station.current.title,
      source: station.current.source === "jukebox" ? "jukebox" : "playlist"
    });
  }

  const conductorAfter = await saveConductorState({
    lastTickAt: new Date().toISOString(),
    tickCount: conductorBefore.tickCount + 1,
    lastRecordedRevision: station.revision,
    nextTracksCache: nextTracks
  });

  return {
    ...station,
    mode: control.mode,
    maintenanceMessage: control.mode === "maintenance" ? control.maintenanceMessage : null,
    youtubeLiveVideoId:
      control.mode === "live_stream"
        ? (parseYouTubeVideoId(control.youtubeLiveVideoId) ??
          parseYouTubeVideoId(control.youtubeLiveUrl) ??
          control.youtubeLiveVideoId ??
          control.youtubeLiveUrl ??
          null)
        : null,
    playlistLabel: config.playlistLabel ?? "Main Rotation",
    playlistReason: config.playlistReason ?? "LeafLock FM Conductor",
    nextCommunityPickInSec,
    djBlendRecommended: true,
    conductor: {
      lastTickAt: conductorAfter.lastTickAt,
      tickCount: conductorAfter.tickCount,
      nextTracks: conductorAfter.nextTracksCache
    }
  };
}