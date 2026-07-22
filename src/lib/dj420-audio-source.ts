import { spawn } from "child_process";
import path from "path";
import { getNowPlaying } from "@/lib/fm-station";

type CachedUrl = {
  url: string;
  expiresAt: number;
  contentType: string;
};

const urlCache = new Map<string, CachedUrl>();
const CACHE_MS = 2.5 * 60 * 60 * 1000;

function ytdlpBin(): string {
  if (process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;
  // Prefer local vendored binary from postinstall
  const local = path.join(process.cwd(), "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  return local;
}

function runYtdlp(args: string[], timeoutMs = 45000): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = ytdlpBin();
    const child = spawn(bin, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: "1" }
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("yt-dlp timeout"));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
        return;
      }
      // Fallback: try python -m yt_dlp
      if (bin !== "yt-dlp" && !process.env.YT_DLP_PATH) {
        // already failed primary
      }
      reject(new Error(stderr.slice(-500) || `yt-dlp exit ${code}`));
    });
  });
}

async function runYtdlpWithPythonFallback(args: string[]): Promise<string> {
  try {
    return await runYtdlp(args);
  } catch (primaryError) {
    try {
      return await new Promise((resolve, reject) => {
        const child = spawn(
          process.platform === "win32" ? "python" : "python3",
          ["-m", "yt_dlp", ...args],
          { windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" } }
        );
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("python yt_dlp timeout"));
        }, 45000);
        child.stdout.on("data", (c: Buffer) => {
          stdout += c.toString("utf8");
        });
        child.stderr.on("data", (c: Buffer) => {
          stderr += c.toString("utf8");
        });
        child.on("error", reject);
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0 && stdout.trim()) resolve(stdout.trim());
          else reject(new Error(stderr.slice(-500) || `yt_dlp exit ${code}`));
        });
      });
    } catch {
      throw primaryError;
    }
  }
}

export async function resolveYoutubeAudioUrl(videoId: string): Promise<CachedUrl | null> {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached;
  }

  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const out = await runYtdlpWithPythonFallback([
      "-f",
      "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
      "-g",
      "--no-playlist",
      "--no-warnings",
      pageUrl
    ]);
    const url = out.split(/\r?\n/).filter(Boolean).pop();
    if (!url || !url.startsWith("http")) return null;

    const contentType = url.includes("mime=audio%2Fmp4") || url.includes("itag=140")
      ? "audio/mp4"
      : url.includes("webm")
        ? "audio/webm"
        : "audio/mp4";

    const entry: CachedUrl = {
      url,
      contentType,
      expiresAt: Date.now() + CACHE_MS
    };
    urlCache.set(videoId, entry);
    return entry;
  } catch (error) {
    console.error("[dj420-audio] resolve failed", videoId, error);
    return null;
  }
}

export type LiveTrackAudio = {
  videoId: string;
  title: string;
  artist?: string;
  offsetSeconds: number;
  durationSec: number;
  audioUrl: string;
  contentType: string;
  revision: number;
};

/**
 * Resolve the current DJ420 track to a direct googlevideo audio URL,
 * starting from the station timeline offset.
 */
export async function getCurrentLiveTrackAudio(): Promise<LiveTrackAudio | null> {
  const nowPlaying = await getNowPlaying();
  const videoId = nowPlaying.current?.videoId;
  if (!videoId) return null;

  const resolved = await resolveYoutubeAudioUrl(videoId);
  if (!resolved) return null;

  return {
    videoId,
    title: nowPlaying.current.title,
    artist: nowPlaying.current.artist,
    offsetSeconds: Math.max(0, nowPlaying.currentOffsetSeconds || 0),
    durationSec: nowPlaying.durationSec || 240,
    audioUrl: resolved.url,
    contentType: resolved.contentType,
    revision: nowPlaying.revision
  };
}

/**
 * Proxy the current track audio from googlevideo (Range-aware).
 * Client should reload /live.mp3 on 'ended' to pick up the next station track.
 */
export async function proxyCurrentTrackResponse(request?: Request): Promise<Response> {
  const track = await getCurrentLiveTrackAudio();
  if (!track) {
    return new Response("DJ420 track unavailable", { status: 503 });
  }

  const range = request?.headers.get("range") || undefined;
  const upstream = await fetch(track.audioUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...(range ? { Range: range } : {})
    },
    cache: "no-store",
    redirect: "follow"
  });

  if (!upstream.ok && upstream.status !== 206) {
    // Drop cache and retry once (URL may have expired).
    urlCache.delete(track.videoId);
    const retry = await getCurrentLiveTrackAudio();
    if (!retry) {
      return new Response("Upstream audio failed", { status: 502 });
    }
    const again = await fetch(retry.audioUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...(range ? { Range: range } : {})
      },
      cache: "no-store"
    });
    if (!again.ok && again.status !== 206) {
      return new Response("Upstream audio failed", { status: 502 });
    }
    return buildProxyResponse(again, retry);
  }

  return buildProxyResponse(upstream, track);
}

function buildProxyResponse(upstream: Response, track: LiveTrackAudio): Response {
  const headers = new Headers();
  headers.set("Content-Type", track.contentType || upstream.headers.get("content-type") || "audio/mp4");
  headers.set("Cache-Control", "no-store, no-cache");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Accept-Ranges", "bytes");
  headers.set("X-LeafLock-Audio-Source", "dj420-track");
  headers.set("X-LeafLock-Mount", "https://fm.leaflock.com.au/live.mp3");
  headers.set("X-LeafLock-Video-Id", track.videoId);
  headers.set("X-LeafLock-Title", encodeURIComponent(track.title));
  headers.set("X-LeafLock-Offset", String(Math.floor(track.offsetSeconds)));
  headers.set("X-LeafLock-Duration", String(Math.floor(track.durationSec)));
  headers.set("X-LeafLock-Revision", String(track.revision));

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers
  });
}
