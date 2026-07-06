import { getPlaybackHistory, getRequestQueue } from "@/lib/fm-admin-data";
import { getJukeboxSuggestions } from "@/lib/fm-store";
import { fetchVideoDetails } from "@/lib/youtube-api";

export const REQUEST_MIN_DURATION_SEC = 30;
export const REQUEST_MAX_DURATION_SEC = 8 * 60;
export const REQUEST_COOLDOWN_MS = 15 * 60 * 1000;
export const REQUEST_DUPLICATE_WINDOW_MS = 2 * 60 * 60 * 1000;

export type RequestValidationResult =
  | { ok: true; videoId: string; title: string; durationSec: number }
  | { ok: false; error: string };

export async function validateTrackRequest(input: {
  youtubeUrl: string;
  videoId: string;
  title?: string;
  requesterId: string;
  requestedBy?: string;
}): Promise<RequestValidationResult> {
  if (!input.videoId) {
    return { ok: false, error: "Paste a valid YouTube link or video ID." };
  }

  let details: { title: string; durationSec: number };
  try {
    details = await fetchVideoDetails(input.videoId);
  } catch {
    return { ok: false, error: "Could not verify that YouTube video. Check the link and try again." };
  }

  if (details.durationSec < REQUEST_MIN_DURATION_SEC) {
    return { ok: false, error: "Tracks under 30 seconds cannot be requested." };
  }

  if (details.durationSec > REQUEST_MAX_DURATION_SEC) {
    return { ok: false, error: "Tracks over 8 minutes cannot be requested by default." };
  }

  const since = Date.now() - REQUEST_DUPLICATE_WINDOW_MS;
  const history = await getPlaybackHistory(100);
  const playedRecently = history.some(
    (entry) => entry.videoId === input.videoId && new Date(entry.playedAt).getTime() >= since
  );
  if (playedRecently) {
    return { ok: false, error: "That track played in the last 2 hours. Try another pick." };
  }

  const queue = await getRequestQueue();
  const jukebox = await getJukeboxSuggestions("pending");
  const duplicatePending = [...queue, ...jukebox].some(
    (item) => "videoId" in item && item.videoId === input.videoId
  );
  if (duplicatePending) {
    return { ok: false, error: "That track is already in the suggestion queue." };
  }

  const cooldownSince = Date.now() - REQUEST_COOLDOWN_MS;
  const recentByRequester = [...queue, ...jukebox].find((item) => {
    const createdAt = "createdAt" in item ? item.createdAt : "";
    const requester =
      "requestedBy" in item
        ? item.requestedBy
        : "suggestedBy" in item
          ? item.suggestedBy
          : undefined;
    return (
      requester === input.requesterId &&
      createdAt &&
      new Date(createdAt).getTime() >= cooldownSince
    );
  });
  if (recentByRequester) {
    return { ok: false, error: "You can submit one request every 15 minutes." };
  }

  return {
    ok: true,
    videoId: input.videoId,
    title: input.title?.trim() || details.title,
    durationSec: details.durationSec
  };
}