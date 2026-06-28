export type PlaylistVideo = {
  id: string;
  title: string;
  durationSec?: number;
  channelTitle?: string;
};

// Temp default: YouTube "Liked videos" playlist. Override in .env.local when ready.
export const LEAFLOCK_FM_PLAYLIST_ID =
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID ?? "LL";

export const PLAY_HISTORY_KEY = "leaflock-fm-play-history";
export const NO_REPEAT_WINDOW_MS = 60 * 60 * 1000;

const SYSTEM_PLAYLIST_IDS = new Set(["LL", "WL", "HL", "FL", "LM", "RD"]);
const LIVE_PATTERN =
  /\b(live at|live from|live session|interview|podcast|speech|freestyle session|vlog|trailer|teaser|highlights)\b/i;
const MIX_PATTERN = /\b(remix|rework|edit|mashup|blend|mix|version|extended)\b/i;

type PlayHistoryEntry = {
  videoId: string;
  playedAt: number;
};

function tokenizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

function titleSimilarity(a: string, b: string): number {
  const left = tokenizeTitle(a);
  const right = tokenizeTitle(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }

  return shared / Math.max(left.size, right.size);
}

function getEligibleVideos(videos: PlaylistVideo[]): PlaylistVideo[] {
  const history = loadPlayHistory();
  const cutoff = Date.now() - NO_REPEAT_WINDOW_MS;
  const recentIds = new Set(
    history.filter((entry) => entry.playedAt > cutoff).map((entry) => entry.videoId)
  );

  const eligible = videos.filter((video) => !recentIds.has(video.id));
  if (eligible.length > 0) return eligible;

  const lastPlayed = new Map(history.map((entry) => [entry.videoId, entry.playedAt]));
  return [...videos].sort(
    (a, b) => (lastPlayed.get(a.id) ?? 0) - (lastPlayed.get(b.id) ?? 0)
  );
}

function scoreBlendCandidate(current: PlaylistVideo, candidate: PlaylistVideo): number {
  let score = Math.random() * 10;

  if (current.id === candidate.id) return -999;

  if (current.channelTitle && candidate.channelTitle === current.channelTitle) {
    score += 30;
  }

  if (current.durationSec && candidate.durationSec) {
    const shorter = Math.min(current.durationSec, candidate.durationSec);
    const longer = Math.max(current.durationSec, candidate.durationSec);
    const ratio = shorter / longer;

    if (ratio >= 0.8) score += 24;
    else if (ratio >= 0.6) score += 14;
    else if (ratio < 0.35) score -= 10;
  }

  if (candidate.durationSec) {
    if (candidate.durationSec >= 210) score += 20;
    else if (candidate.durationSec >= 150) score += 10;
    else if (candidate.durationSec < 90) score -= 45;
    else if (candidate.durationSec < 60) score -= 90;
  }

  score += titleSimilarity(current.title, candidate.title) * 18;

  if (MIX_PATTERN.test(candidate.title)) score += 14;
  if (LIVE_PATTERN.test(candidate.title)) score -= 28;
  if (LIVE_PATTERN.test(current.title) && !MIX_PATTERN.test(candidate.title)) score -= 8;

  return score;
}

export function isSystemPlaylist(playlistId: string) {
  return SYSTEM_PLAYLIST_IDS.has(playlistId);
}

export function loadPlayHistory(): PlayHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PLAY_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlayHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlayHistory(videoId: string) {
  if (typeof window === "undefined") return;

  const cutoff = Date.now() - NO_REPEAT_WINDOW_MS * 24;
  const history = loadPlayHistory()
    .filter((entry) => entry.playedAt > cutoff)
    .concat({ videoId, playedAt: Date.now() });

  window.localStorage.setItem(PLAY_HISTORY_KEY, JSON.stringify(history));
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

export function createShuffledRotation(videos: PlaylistVideo[]): PlaylistVideo[] {
  if (videos.length === 0) return [];
  const eligible = getEligibleVideos(videos);
  const pool = eligible.length > 0 ? eligible : [...videos];
  return shuffleInPlace([...pool]);
}

export function pickNextVideo(videos: PlaylistVideo[]): PlaylistVideo | null {
  const eligible = getEligibleVideos(videos);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

export function pickBlendFriendlyVideo(
  videos: PlaylistVideo[],
  current?: PlaylistVideo | null
): PlaylistVideo | null {
  const eligible = getEligibleVideos(videos).filter((video) => video.id !== current?.id);
  if (eligible.length === 0) return null;

  if (!current) {
    const longForm = eligible.filter((video) => (video.durationSec ?? 0) >= 150);
    const pool = longForm.length > 0 ? longForm : eligible;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const ranked = eligible
    .map((video) => ({ video, score: scoreBlendCandidate(current, video) }))
    .filter((entry) => entry.score > -100)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return pickNextVideo(videos);
  }

  const shortlist = ranked.slice(0, Math.min(6, ranked.length));
  return shortlist[Math.floor(Math.random() * shortlist.length)].video;
}

/** @deprecated Use rotation queue in LeafLockPlayer instead. */
export function pickUpcomingTrack(
  videos: PlaylistVideo[],
  options?: { blendEnabled?: boolean; current?: PlaylistVideo | null }
): PlaylistVideo | null {
  void options;
  return pickNextVideo(videos);
}