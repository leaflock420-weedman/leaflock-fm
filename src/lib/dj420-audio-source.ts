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
/** googlevideo URLs die; refresh before expiry. */
const CACHE_MS = 90 * 60 * 1000;
let ensureBinPromise: Promise<string | null> | null = null;
let resolveChain: Promise<unknown> = Promise.resolve();
const inflightResolves = new Map<string, Promise<CachedUrl | null>>();

const PIPED_INSTANCES = [
  process.env.PIPED_API_URL,
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.nosebs.ru"
].filter((v): v is string => Boolean(v && v.trim()));

const INVIDIOUS_INSTANCES = [
  process.env.INVIDIOUS_API_URL,
  "https://yewtu.be",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de"
].filter((v): v is string => Boolean(v && v.trim()));

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
  if (process.env.DJ420_ENABLE_YTDLP !== "1") return null;
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

function runProcess(command: string, args: string[], timeoutMs = 35000): Promise<string> {
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

function contentTypeFromUrl(url: string): string {
  if (url.includes("mime=audio%2Fmp4") || url.includes("itag=140") || url.includes(".m4a")) {
    return "audio/mp4";
  }
  if (url.includes("webm") || url.includes("mime=audio%2Fwebm")) return "audio/webm";
  if (url.includes("mpeg") || url.includes("mp3")) return "audio/mpeg";
  return "audio/mp4";
}

/** Lightweight — no binary, low memory. Public Piped APIs. */
async function resolveViaPiped(videoId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(`${base.replace(/\/$/, "")}/streams/${videoId}`, {
        headers: { "User-Agent": "LeafLockFM/1.0 LockedInRadio", Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        audioStreams?: Array<{ url?: string; bitrate?: number; mimeType?: string }>;
      };
      const streams = [...(data.audioStreams ?? [])].filter((s) => s.url?.startsWith("http"));
      if (!streams.length) continue;
      streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      // Prefer m4a/mp4 for broad mobile support
      const preferred =
        streams.find((s) => (s.mimeType || "").includes("mp4") || (s.mimeType || "").includes("m4a")) ||
        streams[0];
      if (preferred?.url) return preferred.url;
    } catch {
      // try next instance
    }
  }
  return null;
}

async function resolveViaInvidious(videoId: string): Promise<string | null> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(
        `${base.replace(/\/$/, "")}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`,
        {
          headers: { "User-Agent": "LeafLockFM/1.0 LockedInRadio", Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal
        }
      );
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        adaptiveFormats?: Array<{ url?: string; type?: string; bitrate?: string | number }>;
      };
      const audio = (data.adaptiveFormats ?? [])
        .filter((f) => f.url && (f.type || "").startsWith("audio/"))
        .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      if (audio[0]?.url) return audio[0].url;
    } catch {
      // next
    }
  }
  return null;
}

async function resolveWithYtDlp(videoId: string): Promise<string> {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const bin = await ensureYtDlpBinary();
  if (!bin) throw new Error("yt-dlp disabled");

  const clients = [
    "youtube:player_client=tv_embedded",
    "youtube:player_client=android"
  ];
  let lastError: unknown;
  for (const clientArg of clients) {
    try {
      const out = await runProcess(
        bin,
        [
          "-f",
          "bestaudio[ext=m4a]/bestaudio/best",
          "-g",
          "--no-playlist",
          "--no-warnings",
          "--extractor-args",
          clientArg,
          pageUrl
        ],
        30_000
      );
      const url = out.split(/\r?\n/).filter(Boolean).pop();
      if (url?.startsWith("http")) return url;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("yt-dlp failed");
}

/** Pure JS — no child process. Uses package already in package.json. */
async function resolveViaYtdlCore(videoId: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ytdl = require("@distube/ytdl-core") as {
      getInfo: (
        url: string,
        opts?: { playerClients?: string[] }
      ) => Promise<{ formats: Array<Record<string, unknown>> }>;
      filterFormats: (
        formats: Array<Record<string, unknown>>,
        filter: string
      ) => Array<Record<string, unknown>>;
    };
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
      playerClients: ["ANDROID", "IOS", "TV"]
    });
    const audio = ytdl.filterFormats(info.formats, "audioonly");
    if (!audio.length) return null;
    audio.sort(
      (a, b) => Number(b.audioBitrate || b.bitrate || 0) - Number(a.audioBitrate || a.bitrate || 0)
    );
    // Prefer mp4/m4a for Safari / iOS
    const preferred =
      audio.find((f) => String(f.mimeType || f.container || "").includes("mp4")) ||
      audio.find((f) => String(f.mimeType || "").includes("m4a")) ||
      audio[0];
    const url = preferred?.url;
    return typeof url === "string" && url.startsWith("http") ? url : null;
  } catch (error) {
    console.error("[dj420-audio] ytdl-core failed", videoId, error);
    return null;
  }
}

async function resolveAudioUrlOnce(videoId: string): Promise<string | null> {
  // 1) ytdl-core in-process (no spawn → no OOM from yt-dlp processes)
  const core = await resolveViaYtdlCore(videoId);
  if (core) return core;

  // 2) Piped public APIs
  const piped = await resolveViaPiped(videoId);
  if (piped) return piped;

  // 3) Invidious
  const inv = await resolveViaInvidious(videoId);
  if (inv) return inv;

  // 4) yt-dlp binary only if explicitly enabled
  if (process.env.DJ420_ENABLE_YTDLP === "1") {
    try {
      return await resolveWithYtDlp(videoId);
    } catch (error) {
      console.error("[dj420-audio] yt-dlp failed", videoId, error);
    }
  }

  return null;
}

export async function resolveYoutubeAudioUrl(videoId: string): Promise<CachedUrl | null> {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached;
  }

  const existing = inflightResolves.get(videoId);
  if (existing) return existing;

  const job = (async () => {
    const prev = resolveChain;
    let release!: () => void;
    resolveChain = new Promise<void>((r) => {
      release = r;
    });
    await prev.catch(() => undefined);

    try {
      const url = await resolveAudioUrlOnce(videoId);
      if (!url) return null;
      const entry: CachedUrl = {
        url,
        contentType: contentTypeFromUrl(url),
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
  thumbnail?: string | null;
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
    revision: nowPlaying.revision,
    thumbnail: nowPlaying.thumbnail
  };
}

/**
 * Prefer 302 redirect so Render never proxies multi‑MB audio (timeouts = stream stops).
 * Proxy only when DJ420_FORCE_PROXY=1.
 */
export async function serveCurrentTrackForMount(request?: Request): Promise<Response> {
  const track = await getCurrentLiveTrackAudio();
  if (!track) {
    return new Response("DJ420 track unavailable", { status: 503 });
  }

  const forceProxy = process.env.DJ420_FORCE_PROXY === "1";
  const wantsJson = request?.headers.get("accept")?.includes("application/json");

  if (wantsJson) {
    return Response.json({
      ok: true,
      source: "radio",
      station: "LeafLock Locked In Radio",
      mount: "https://fm.leaflock.com.au/live.mp3",
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      offsetSeconds: track.offsetSeconds,
      durationSec: track.durationSec,
      revision: track.revision,
      contentType: track.contentType,
      url: track.audioUrl,
      thumbnail: track.thumbnail
    });
  }

  // Default: redirect client browser straight to the CDN audio URL.
  // HTML <audio> follows this and keeps playing after you leave Chrome.
  if (!forceProxy) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: track.audioUrl,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-LeafLock-Audio-Source": "radio-redirect",
        "X-LeafLock-Station": "LeafLock Locked In Radio",
        "X-LeafLock-Mount": "https://fm.leaflock.com.au/live.mp3",
        "X-LeafLock-Video-Id": track.videoId,
        "X-LeafLock-Title": encodeURIComponent(track.title),
        "X-LeafLock-Offset": String(Math.floor(track.offsetSeconds)),
        "X-LeafLock-Duration": String(Math.floor(track.durationSec)),
        "X-LeafLock-Revision": String(track.revision)
      }
    });
  }

  return proxyCurrentTrackResponse(request, track);
}

export async function proxyCurrentTrackResponse(
  request?: Request,
  preloaded?: LiveTrackAudio
): Promise<Response> {
  const track = preloaded ?? (await getCurrentLiveTrackAudio());
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
