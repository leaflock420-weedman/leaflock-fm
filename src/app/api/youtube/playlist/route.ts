import { fetchPlaylistVideosFromYouTubeApi } from "@/lib/youtube-api";
import { getFmSettings } from "@/lib/fm-store";

export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get("id");
  const playlistId = requestedId ?? (await getFmSettings()).playlistId;

  try {
    const videos = await fetchPlaylistVideosFromYouTubeApi(playlistId);
    return Response.json({
      playlistId,
      source: "youtube-data-api-v3",
      count: videos.length,
      videos
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to load playlist from YouTube API"
      },
      { status: 500 }
    );
  }
}