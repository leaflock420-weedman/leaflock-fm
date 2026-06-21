export type AzuraCastNowPlaying = {
  isOnline: boolean;
  live: { isLive: boolean; streamerName?: string | null };
  nowPlaying: { title: string; artist?: string | null; art?: string | null };
  listeners: { current: number; unique?: number; total?: number };
  station: { name: string; listenUrl: string };
};

type RawNowPlaying = {
  station?: { name?: string; listen_url?: string };
  now_playing?: { song?: { title?: string; artist?: string; art?: string } };
  live?: { is_live?: boolean; streamer_name?: string | null };
  listeners?: { current?: number; unique?: number; total?: number };
  is_online?: boolean;
};

function azuracastUrl(path: string) {
  const baseUrl = process.env.AZURACAST_BASE_URL;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export async function getNowPlaying(): Promise<AzuraCastNowPlaying | null> {
  const station = process.env.AZURACAST_STATION_SHORTCODE;
  const url = station ? azuracastUrl(`/api/nowplaying/${station}`) : null;
  if (!url) return null;

  const headers: HeadersInit = {};
  if (process.env.AZURACAST_API_KEY) {
    headers.Authorization = `Bearer ${process.env.AZURACAST_API_KEY}`;
  }

  try {
    const response = await fetch(url, { headers, next: { revalidate: 15 } });
    if (!response.ok) return null;
    const data = (await response.json()) as RawNowPlaying;
    return {
      isOnline: Boolean(data.is_online),
      live: {
        isLive: Boolean(data.live?.is_live),
        streamerName: data.live?.streamer_name
      },
      nowPlaying: {
        title: data.now_playing?.song?.title || "LeafLock Radio",
        artist: data.now_playing?.song?.artist,
        art: data.now_playing?.song?.art
      },
      listeners: {
        current: data.listeners?.current || 0,
        unique: data.listeners?.unique,
        total: data.listeners?.total
      },
      station: {
        name: data.station?.name || "LeafLock Radio",
        listenUrl: data.station?.listen_url || process.env.PRIMARY_STREAM_URL || ""
      }
    };
  } catch {
    return null;
  }
}

export async function syncAzuraCastSchedule(payload: unknown) {
  const url = azuracastUrl("/api/admin/station/schedule/sync");
  if (!url || !process.env.AZURACAST_API_KEY) {
    return { skipped: true, reason: "AzuraCast credentials are not configured", payload };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AZURACAST_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`AzuraCast sync failed: ${response.status}`);
  }

  return response.json();
}
