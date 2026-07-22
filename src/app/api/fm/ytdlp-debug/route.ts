import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getNowPlaying } from "@/lib/fm-station";
import { getCurrentLiveTrackAudio } from "@/lib/dj420-audio-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function run(cmd: string, args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, env: process.env });
    let out = "";
    let err = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: -1, out, err: err + "\nTIMEOUT" });
    }, 40000);
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: -2, out, err: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, out, err });
    });
  });
}

export async function GET() {
  const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const bin = path.join(process.cwd(), "bin", name);
  const binInfo = {
    path: bin,
    exists: fs.existsSync(bin),
    size: fs.existsSync(bin) ? fs.statSync(bin).size : 0,
    cwd: process.cwd()
  };

  let nowPlaying: { videoId?: string; title?: string } | null = null;
  try {
    const np = await getNowPlaying();
    nowPlaying = { videoId: np.current?.videoId, title: np.current?.title };
  } catch (e) {
    nowPlaying = { title: e instanceof Error ? e.message : String(e) };
  }

  const videoId = nowPlaying?.videoId || "dQw4w9WgXcQ";
  const probe = binInfo.exists
    ? await run(bin, [
        "-f",
        "bestaudio[ext=m4a]/bestaudio",
        "-g",
        "--no-playlist",
        "--no-warnings",
        `https://www.youtube.com/watch?v=${videoId}`
      ])
    : { code: -3, out: "", err: "binary missing" };

  let track: unknown = null;
  try {
    const t = await getCurrentLiveTrackAudio();
    track = t
      ? {
          videoId: t.videoId,
          title: t.title,
          contentType: t.contentType,
          hasUrl: Boolean(t.audioUrl),
          offsetSeconds: t.offsetSeconds
        }
      : null;
  } catch (e) {
    track = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({
    mount: "https://fm.leaflock.com.au/live.mp3",
    binInfo,
    nowPlaying,
    ytdlp: {
      code: probe.code,
      urlPreview: probe.out.trim().split(/\r?\n/).pop()?.slice(0, 160) || null,
      errTail: probe.err.slice(-600)
    },
    track
  });
}
