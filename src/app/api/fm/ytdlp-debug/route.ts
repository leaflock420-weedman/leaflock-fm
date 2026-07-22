import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCurrentLiveTrackAudio } from "@/lib/dj420-audio-source";
import { getNowPlaying } from "@/lib/fm-station";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Temporary diagnostics for DJ420 /live.mp3 audio resolver.
 * Safe to keep — does not expose secrets.
 */
export async function GET() {
  const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const binPaths = [
    process.env.YT_DLP_PATH,
    path.join(process.cwd(), "bin", name),
    path.join(process.cwd(), name)
  ].filter(Boolean) as string[];

  const bins = binPaths.map((p) => {
    try {
      const st = fs.statSync(p);
      return { path: p, exists: true, size: st.size };
    } catch {
      return { path: p, exists: false, size: 0 };
    }
  });

  let nowPlaying: unknown = null;
  let track: unknown = null;
  let error: string | null = null;

  try {
    nowPlaying = await getNowPlaying();
  } catch (e) {
    error = `nowPlaying: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const t = await getCurrentLiveTrackAudio();
    track = t
      ? {
          videoId: t.videoId,
          title: t.title,
          contentType: t.contentType,
          offsetSeconds: t.offsetSeconds,
          hasUrl: Boolean(t.audioUrl)
        }
      : null;
  } catch (e) {
    error = `${error ? error + " | " : ""}track: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    cwd: process.cwd(),
    platform: process.platform,
    bins,
    nowPlaying: nowPlaying
      ? {
          // @ts-expect-error loose
          videoId: nowPlaying.current?.videoId,
          // @ts-expect-error loose
          title: nowPlaying.current?.title
        }
      : null,
    track,
    error,
    mount: "https://fm.leaflock.com.au/live.mp3"
  });
}
