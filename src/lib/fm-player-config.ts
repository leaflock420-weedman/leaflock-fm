import type { FmPlaylistKey } from "@/lib/fm-playlists";

export type FmPlayerMode = "simple" | FmPlaylistKey;

export type FmPublicConfig = {
  playlistId: string;
  simplePlaylistId: string;
  playlists: Partial<Record<FmPlaylistKey, string>>;
  playlistLabel?: string;
  playlistReason?: string;
};

export function pickPlaylistId(
  config: FmPublicConfig,
  mode: FmPlayerMode = "simple"
): string {
  if (mode === "simple") {
    return config.simplePlaylistId || config.playlistId;
  }

  const fromKey = config.playlists[mode];
  if (fromKey?.trim()) return fromKey.trim();

  return config.simplePlaylistId || config.playlistId;
}