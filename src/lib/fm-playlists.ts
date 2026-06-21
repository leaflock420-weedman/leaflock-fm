export type FmPlaylistKey =
  | "mainRotation"
  | "nightChill"
  | "interviewDrops"
  | "liveSessions";

export type FmPlaylists = Record<FmPlaylistKey, string>;

export type FmScheduleItem = {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  playlistKey: FmPlaylistKey;
  note?: string;
};

export const FM_PLAYLIST_LABELS: Record<FmPlaylistKey, string> = {
  mainRotation: "Main Rotation",
  nightChill: "Night / Chill",
  interviewDrops: "Interview Drops",
  liveSessions: "Live Sessions"
};

export const FM_PLAYLIST_HINTS: Record<FmPlaylistKey, string> = {
  mainRotation: "Default 24/7 shuffle (create this playlist in YouTube)",
  nightChill: "After 10pm — slower / late-night picks",
  interviewDrops: "Special clips, promos, interview segments",
  liveSessions: "Studio live recordings & session replays"
};

const DEFAULT_MAIN =
  process.env.FM_PLAYLIST_ID ??
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID ??
  "PLJFdPoHnfyMNIbriwNRh06u2z1Z5vZ7va";

export function defaultPlaylists(): FmPlaylists {
  return {
    mainRotation: DEFAULT_MAIN,
    nightChill: "",
    interviewDrops: "",
    liveSessions: ""
  };
}

export function normalizePlaylists(input?: Partial<FmPlaylists> | null): FmPlaylists {
  const base = defaultPlaylists();
  if (!input) return base;

  return {
    mainRotation: input.mainRotation?.trim() || base.mainRotation,
    nightChill: input.nightChill?.trim() ?? "",
    interviewDrops: input.interviewDrops?.trim() ?? "",
    liveSessions: input.liveSessions?.trim() ?? ""
  };
}

function parseTimeMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function brisbaneNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    dayOfWeek: dayMap[weekday] ?? 0,
    minutes: hour * 60 + minute
  };
}

function isWithinSlot(
  nowMinutes: number,
  startTime: string,
  endTime: string
): boolean {
  const start = parseTimeMinutes(startTime);
  const end = parseTimeMinutes(endTime);
  if (start === null || end === null) return false;

  if (start <= end) {
    return nowMinutes >= start && nowMinutes < end;
  }

  return nowMinutes >= start || nowMinutes < end;
}

export function resolveActivePlaylist(input: {
  playlists: FmPlaylists;
  schedule?: FmScheduleItem[];
  now?: Date;
}): { key: FmPlaylistKey; playlistId: string; label: string; reason: string } {
  const playlists = normalizePlaylists(input.playlists);
  const { dayOfWeek, minutes } = brisbaneNow(input.now);

  for (const item of input.schedule ?? []) {
    if (item.dayOfWeek >= 0 && item.dayOfWeek !== dayOfWeek) continue;
    if (!isWithinSlot(minutes, item.startTime, item.endTime)) continue;

    const id = playlists[item.playlistKey];
    if (id) {
      return {
        key: item.playlistKey,
        playlistId: id,
        label: FM_PLAYLIST_LABELS[item.playlistKey],
        reason: item.title
      };
    }
  }

  const hour = Math.floor(minutes / 60);
  if (hour >= 22 && playlists.nightChill) {
    return {
      key: "nightChill",
      playlistId: playlists.nightChill,
      label: FM_PLAYLIST_LABELS.nightChill,
      reason: "After 10pm AEST"
    };
  }

  return {
    key: "mainRotation",
    playlistId: playlists.mainRotation,
    label: FM_PLAYLIST_LABELS.mainRotation,
    reason: "Main rotation"
  };
}