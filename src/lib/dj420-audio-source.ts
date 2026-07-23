import { spawn } from "child_process";
import fs from "fs";
import https from "https";
import path from "path";
import { getNowPlaying } from "@/lib/fm-station";

type CachedUrl = {
  url: string;
  expiresAt: number;
  contentType: string;
};

const urlCache = new Map<string, CachedUrl>();
const CACHE_MS = 2.5 * 60 * 60 * 1000;
let ensureBinPromise: Promise<string | null> | null = null;
/** Serialize yt-dlp so Render starter never runs many processes (OOM). */
let resolveChain: Promise<unknown> = Promise.resolve();
const inflightResolves = new Map<string, Promise<CachedUrl | null>>();

function candidateBins(): string[] {
  const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const cwd = process.cwd();
  return [
    process.env.YT_DLP_PATH,
    path.join(cwd, "bin", name),
    path.join(cwd, "..", "bin", name),
    path.join(cwd, name),
    name,
    "yt-dlp"
  ].filter((v): v is string => Boolean(v && String(v).trim()));
}

function downloadYtDlp(dest: string): Promise<void> {
  const url =
    process.platform === "win32"
      ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
      : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

  return new Promise((resolve, reject) => {
    const get = (u: string, redirects = 0) => {
      https
        .get(u, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects < 5
          ) {
            res.resume();
            get(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`download HTTP ${res.statusCode}`));
            res.resume();
            return;
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => {
            file.close(() => {
              try {
                if (process.platform !== "win32") fs.chmodSync(dest, 0o755);
              } catch {
                // ignore
              }
              resolve();
            });
          });
        })
        .on("error", reject);
    };
    get(url);
  });
}

async function ensureYtDlpBinary(): Promise<string | null> {
  if (ensureBinPromise) return ensureBinPromise;
  ensureBinPromise = (async () => {
    for (const bin of candidateBins()) {
      try {
        if (bin.includes("/") || bin.includes("\\")) {
          if (fs.existsSync(bin) && fs.statSync(bin).size > 500_000) return bin;
        }
      } catch {
        // continue
      }
    }

    const dest = path.join(
      process.cwd(),
      "bin",
      process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
    );
    try {
      await downloadYtDlp(dest);
      if (fs.existsSync(dest)) return dest;
    } catch (error) {
      console.error("[dj420-audio] yt-dlp download failed", error);
    }
    return null;
  })();
  return ensureBinPromise;
}

function runProcess(command: string, args: string[], timeoutMs = 50000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: "1" }
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timeout"));
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
      if (code === 0 && stdout.trim()) resolve(stdout.trim());
      else reject(new Error(stderr.slice(-800) || `exit ${code}`));
    });
  });
}

function cookiesArgs(): string[] {
  // Optional Netscape cookies file content in env (base64 or raw).
  // Set YTDLP_COOKIES or YTDLP_COOKIES_FILE on Render to bypass bot checks.
  const filePath = process.env.YTDLP_COOKIES_FILE;
  if (filePath && fs.existsSync(filePath)) {
    return ["--cookies", filePath];
  }

  const raw = process.env.YTDLP_COOKIES;
  if (!raw?.trim()) return [];

  try {
    const cookiesPath = path.join(process.cwd(), "bin", "youtube.cookies.txt");
    fs.mkdirSync(path.dirname(cookiesPath), { recursive: true });
    const body = raw.includes("\t") || raw.includes("# Netscape")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    fs.writeFileSync(cookiesPath, body, "utf8");
    return ["--cookies", cookiesPath];
  } catch {
    return [];
  }
}

async function resolveWithYtDlp(videoId: string): Promise<string> {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const cookieFlags = cookiesArgs();

  // Prefer light clients first; stop after first success (less CPU/RAM on Render).
  const clientVariants = [
    "youtube:player_client=tv_embedded",
    "youtube:player_client=android",
    "youtube:player_client=ios"
  ];

  const bin = await ensureYtDlpBinary();
  const runners: Array<(args: string[]) => Promise<string>> = [];
  if (bin) runners.push((args) => runProcess(bin, args, 35_000));
  runners.push((args) => runProcess("yt-dlp", args, 35_000));

  let lastError: unknown;
  for (const clientArg of clientVariants) {
    const args = [
      "-f",
      "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
      "-g",
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--extractor-args",
      clientArg,
      ...cookieFlags,
      pageUrl
    ];
    for (const run of runners) {
      try {
        const out = await run(args);
        const url = out.split(/\r?\n/).filter(Boolean).pop();
        if (url?.startsWith("http")) return url;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error("yt-dlp failed");
}

export async function resolveYoutubeAudioUrl(videoId: string): Promise<CachedUrl | null> {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached;
  }

  const existing = inflightResolves.get(videoId);
  if (existing) return existing;

  const job = (async () => {
    // Global queue: never run parallel yt-dlp on the web dyno.
    const prev = resolveChain;
    let release!: () => void;
    resolveChain = new Promise<void>((r) => {
      release = r;
    });
    await prev.catch(() => undefined);

    try {
      const url = await resolveWithYtDlp(videoId);
      const contentType =
        url.includes("mime=audio%2Fmp4") || url.includes("itag=140")
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
    } finally {
      release();
      inflightResolves.delete(videoId);
    }
  })();

  inflightResolves.set(videoId, job);
  return job;
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

export async function proxyCurrentTrackResponse(request?: Request): Promise<Response> {
  const track = await getCurrentLiveTrackAudio();
  if (!track) {
    return new Response("DJ420 track unavailable", { status: 503 });
  }

  const range = request?.headers.get("range") || undefined;
  const headersIn: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
  if (range) headersIn.Range = range;

  let upstream = await fetch(track.audioUrl, {
    headers: headersIn,
    cache: "no-store",
    redirect: "follow"
  });

  if (!upstream.ok && upstream.status !== 206) {
    urlCache.delete(track.videoId);
    const retry = await getCurrentLiveTrackAudio();
    if (!retry) return new Response("Upstream audio failed", { status: 502 });
    upstream = await fetch(retry.audioUrl, {
      headers: headersIn,
      cache: "no-store"
    });
    if (!upstream.ok && upstream.status !== 206) {
      return new Response("Upstream audio failed", { status: 502 });
    }
    return buildProxyResponse(upstream, retry);
  }

  return buildProxyResponse(upstream, track);
}

function buildProxyResponse(upstream: Response, track: LiveTrackAudio): Response {
  const headers = new Headers();
  headers.set(
    "Content-Type",
    track.contentType || upstream.headers.get("content-type") || "audio/mp4"
  );
  headers.set("Cache-Control", "no-store, no-cache");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Accept-Ranges", "bytes");
  headers.set("X-LeafLock-Audio-Source", "radio");
  headers.set("X-LeafLock-Station", "LeafLock Locked In Radio");
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
