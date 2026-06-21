import { isSystemPlaylist, type PlaylistVideo } from "@/lib/youtube-playlist";

type YouTubePlaylistItemsResponse = {
  items?: {
    snippet?: {
      title?: string;
      channelTitle?: string;
      resourceId?: { videoId?: string };
    };
  }[];
  nextPageToken?: string;
  error?: { message?: string };
};

type YouTubeVideosResponse = {
  items?: {
    id?: string;
    contentDetails?: { duration?: string };
    snippet?: { channelTitle?: string };
  }[];
  error?: { message?: string };
};

function parseIso8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

async function enrichVideosWithMetadata(
  videos: PlaylistVideo[],
  apiKey?: string,
  accessToken?: string | null
): Promise<PlaylistVideo[]> {
  if (videos.length === 0) return videos;

  const headers: HeadersInit = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const enriched = new Map<string, PlaylistVideo>();

  for (let index = 0; index < videos.length; index += 50) {
    const chunk = videos.slice(index, index + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "contentDetails,snippet");
    url.searchParams.set("id", chunk.map((video) => video.id).join(","));

    if (!accessToken && apiKey) {
      url.searchParams.set("key", apiKey);
    }

    const response = await fetch(url, { headers, cache: "no-store" });
    const data = (await response.json()) as YouTubeVideosResponse;

    if (!response.ok) {
      throw new Error(data.error?.message || `YouTube metadata request failed (${response.status})`);
    }

    for (const item of data.items ?? []) {
      if (!item.id) continue;

      const base = chunk.find((video) => video.id === item.id);
      if (!base) continue;

      enriched.set(item.id, {
        ...base,
        durationSec: item.contentDetails?.duration
          ? parseIso8601Duration(item.contentDetails.duration)
          : base.durationSec,
        channelTitle: item.snippet?.channelTitle ?? base.channelTitle
      });
    }
  }

  return videos.map((video) => enriched.get(video.id) ?? video);
}

async function getOAuthAccessToken(): Promise<string | null> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function fetchPlaylistVideosFromYouTubeApi(
  playlistId: string
): Promise<PlaylistVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const accessToken = await getOAuthAccessToken();
  const requiresOAuth = isSystemPlaylist(playlistId);

  if (requiresOAuth && !accessToken) {
    throw new Error(
      `Playlist "${playlistId}" requires YouTube OAuth. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN.`
    );
  }

  if (!requiresOAuth && !apiKey && !accessToken) {
    throw new Error(
      "Set YOUTUBE_API_KEY for public playlists, or YouTube OAuth credentials for account playlists like LL."
    );
  }

  const videos: PlaylistVideo[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    if (!requiresOAuth && apiKey && !accessToken) {
      url.searchParams.set("key", apiKey);
    }

    const headers: HeadersInit = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, { headers, cache: "no-store" });
    const data = (await response.json()) as YouTubePlaylistItemsResponse;

    if (!response.ok) {
      throw new Error(data.error?.message || `YouTube API request failed (${response.status})`);
    }

    for (const item of data.items ?? []) {
      const id = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;

      if (!id || !title || title === "Private video" || title === "Deleted video") {
        continue;
      }

      videos.push({
        id,
        title,
        channelTitle: item.snippet?.channelTitle
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  if (videos.length === 0) {
    throw new Error("YouTube API returned no playable videos for this playlist");
  }

  try {
    return await enrichVideosWithMetadata(videos, apiKey, accessToken);
  } catch {
    return videos;
  }
}