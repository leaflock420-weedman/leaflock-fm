/**
 * Continuous LeafLock radio encoder (separate from Next.js).
 *
 * Phones play: <audio id="leaflockRadio" src="…/live.mp3" preload="none" playsinline>
 *
 * Pipeline: station track → yt-dlp download to cache → ffmpeg MP3 → all clients
 * Optional 5s acrossfade. Fallback direct MP3 URLs if YouTube blocks the server IP.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 10000);
const FM_API_BASE = (process.env.FM_API_BASE || "https://fm.leaflock.com.au").replace(/\/$/, "");
const BITRATE = process.env.MP3_BITRATE || "128k";
const CROSSFADE_SEC = Math.max(2, Number(process.env.DJ_CROSSFADE_SEC || 5));
const MEDIA_DIR = process.env.MEDIA_DIR || path.join("/tmp", "leaflock-media");

/** Royalty-free direct MP3s so the mount never goes silent if YT is blocked. */
const FALLBACK_MP3S = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3"
];

const clients = new Set();
let encoder = null;
let loopRunning = false;
let lastVideoId = null;
let lastError = null;
let lastEvent = "boot";
let lastTitle = null;
let lastSource = null;
let fallbackIndex = 0;

try {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
} catch {
  /* ignore */
}

function log(...a) {
  console.log(new Date().toISOString(), "[stream]", ...a);
}

function broadcast(buf) {
  for (const res of [...clients]) {
    try {
      if (!res.writableEnded && !res.destroyed) res.write(buf);
    } catch {
      clients.delete(res);
    }
  }
}

function killEncoder() {
  if (!encoder) return;
  try {
    encoder.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  encoder = null;
}

function writeCookiesFile() {
  const raw = process.env.YTDLP_COOKIES || process.env.YOUTUBE_COOKIES || "";
  if (!raw.trim()) return null;
  const file = path.join(MEDIA_DIR, "youtube.cookies.txt");
  try {
    const body =
      raw.includes("\t") || raw.includes("# Netscape")
        ? raw
        : Buffer.from(raw, "base64").toString("utf8");
    fs.writeFileSync(file, body, "utf8");
    return file;
  } catch (e) {
    log("cookies write failed", e.message);
    return null;
  }
}

async function getTrack() {
  const res = await fetch(`${FM_API_BASE}/api/fm/now-playing`, { cache: "no-store" });
  if (!res.ok) throw new Error("now-playing " + res.status);
  const data = await res.json();
  if (!data.current?.videoId) throw new Error("no track");
  return {
    videoId: data.current.videoId,
    title: data.current.title || "LeafLock",
    offset: Number(data.currentOffsetSeconds ?? data.offsetSeconds ?? 0),
    duration: Number(data.durationSec || data.current.durationSec || 240)
  };
}

async function advance() {
  try {
    await fetch(`${FM_API_BASE}/api/fm/stream-next`, {
      method: "POST",
      headers: { "x-stream-secret": process.env.FM_ADMIN_SECRET || "" }
    });
  } catch (e) {
    log("advance", e.message);
  }
}

/**
 * Download audio to local cache with yt-dlp (more reliable than -g on some networks).
 */
async function downloadTrack(videoId) {
  const outTemplate = path.join(MEDIA_DIR, `${videoId}.%(ext)s`);
  const existing = ["m4a", "webm", "mp3", "opus"]
    .map((ext) => path.join(MEDIA_DIR, `${videoId}.${ext}`))
    .find((p) => {
      try {
        return fs.statSync(p).size > 50_000;
      } catch {
        return false;
      }
    });
  if (existing) {
    lastSource = "cache";
    return existing;
  }

  const args = [
    "-f",
    "bestaudio[ext=m4a]/bestaudio/best",
    "-o",
    outTemplate,
    "--no-playlist",
    "--no-warnings",
    "--retries",
    "3",
    "--extractor-args",
    "youtube:player_client=android,ios,tv,web_embedded"
  ];

  const cookies = writeCookiesFile();
  if (cookies) args.push("--cookies", cookies);

  args.push(`https://www.youtube.com/watch?v=${videoId}`);

  try {
    await execFileAsync("yt-dlp", args, {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024
    });
  } catch (e) {
    // try android-only
    try {
      await execFileAsync(
        "yt-dlp",
        [
          "-f",
          "ba",
          "-o",
          outTemplate,
          "--no-playlist",
          "--no-warnings",
          "--extractor-args",
          "youtube:player_client=android",
          ...(cookies ? ["--cookies", cookies] : []),
          `https://www.youtube.com/watch?v=${videoId}`
        ],
        { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }
      );
    } catch (e2) {
      throw new Error(
        (e2.stderr || e2.message || e.message || "yt-dlp download failed").toString().slice(-400)
      );
    }
  }

  const found = ["m4a", "webm", "mp3", "opus"]
    .map((ext) => path.join(MEDIA_DIR, `${videoId}.${ext}`))
    .find((p) => {
      try {
        return fs.statSync(p).size > 50_000;
      } catch {
        return false;
      }
    });
  if (!found) throw new Error("download missing file");
  lastSource = "yt-dlp-file";
  return found;
}

function ffmpegToClients(args) {
  return new Promise((resolve, reject) => {
    killEncoder();
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    encoder = ff;
    let err = "";
    ff.stderr.on("data", (d) => {
      err += d.toString();
    });
    ff.stdout.on("data", (c) => broadcast(c));
    ff.on("error", (e) => {
      encoder = null;
      reject(e);
    });
    ff.on("close", (code) => {
      encoder = null;
      if (code === 0 || code === null) resolve();
      else reject(new Error(err.slice(-500) || "ffmpeg " + code));
    });
  });
}

async function playLocalFile(file, { start = 0, duration = null } = {}) {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  if (start > 2) args.push("-ss", String(Math.floor(start)));
  args.push("-i", file);
  if (duration && duration > 5) args.push("-t", String(Math.floor(duration)));
  args.push(
    "-vn",
    "-c:a",
    "libmp3lame",
    "-b:a",
    BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "mp3",
    "pipe:1"
  );
  await ffmpegToClients(args);
}

async function playRemoteMp3(url) {
  lastSource = "fallback-mp3";
  await ffmpegToClients([
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    url,
    "-vn",
    "-c:a",
    "libmp3lame",
    "-b:a",
    BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "mp3",
    "pipe:1"
  ]);
}

async function playCrossfadeFiles(fileA, fileB, startA, remainA) {
  const bodyDur = Math.max(12, remainA - CROSSFADE_SEC);
  if (bodyDur > 15) {
    await playLocalFile(fileA, { start: startA, duration: bodyDur });
  }
  const ssA = Math.max(0, startA + bodyDur);
  await ffmpegToClients([
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-ss",
    String(ssA),
    "-t",
    String(CROSSFADE_SEC + 1),
    "-i",
    fileA,
    "-ss",
    "0",
    "-i",
    fileB,
    "-filter_complex",
    `[0:a][1:a]acrossfade=d=${CROSSFADE_SEC}:c1=tri:c2=tri[a]`,
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "mp3",
    "pipe:1"
  ]);
}

async function playHold(sec = 3) {
  lastSource = "hold";
  await ffmpegToClients([
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(sec),
    "-c:a",
    "libmp3lame",
    "-b:a",
    BITRATE,
    "-f",
    "mp3",
    "pipe:1"
  ]);
}

async function loop() {
  if (loopRunning) return;
  loopRunning = true;
  lastEvent = "loop-start";
  log("encoder loop on, mediaDir=", MEDIA_DIR);

  while (true) {
    if (clients.size === 0) {
      killEncoder();
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    try {
      let track = await getTrack();
      lastEvent = "track:" + track.videoId;

      if (lastVideoId && track.videoId === lastVideoId) {
        await advance();
        await new Promise((r) => setTimeout(r, 800));
        track = await getTrack();
      }

      let fileA = null;
      try {
        fileA = await downloadTrack(track.videoId);
      } catch (e) {
        lastError = e.message || String(e);
        log("download fail", track.videoId, lastError.slice(0, 200));
        // Fallback so the mount never dies
        const fb = FALLBACK_MP3S[fallbackIndex % FALLBACK_MP3S.length];
        fallbackIndex += 1;
        lastTitle = track.title + " (backup bed)";
        lastVideoId = track.videoId + "-fb";
        await playRemoteMp3(fb);
        await advance();
        continue;
      }

      const start =
        track.offset > 5 && track.offset < track.duration - 25 ? track.offset : 0;
      const remain = Math.max(25, track.duration - start);

      lastVideoId = track.videoId;
      lastTitle = track.title;
      lastError = null;
      log("play", track.videoId, track.title, "src", lastSource);

      // Play current track fully (minus crossfade tail if next is ready)
      await advance();
      let nextTrack = null;
      try {
        nextTrack = await getTrack();
        if (nextTrack.videoId === track.videoId) nextTrack = null;
      } catch {
        nextTrack = null;
      }

      if (nextTrack) {
        try {
          const fileB = await downloadTrack(nextTrack.videoId);
          await playCrossfadeFiles(fileA, fileB, start, remain);
          lastVideoId = nextTrack.videoId;
          lastTitle = nextTrack.title;
          await playLocalFile(fileB, { start: CROSSFADE_SEC });
          continue;
        } catch (e) {
          log("crossfade fail", e.message);
          await playLocalFile(fileA, { start, duration: remain });
        }
      } else {
        await playLocalFile(fileA, { start, duration: remain });
      }
    } catch (e) {
      lastError = e.message || String(e);
      lastEvent = "err";
      log("err", lastError.slice(0, 300));
      try {
        const fb = FALLBACK_MP3S[fallbackIndex % FALLBACK_MP3S.length];
        fallbackIndex += 1;
        await playRemoteMp3(fb);
      } catch {
        try {
          await playHold(4);
        } catch {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      try {
        await advance();
      } catch {
        /* ignore */
      }
    }
  }
}

const server = http.createServer((req, res) => {
  const urlPath = String(req.url || "/").split("?")[0];
  lastEvent = "req:" + urlPath;

  if (urlPath === "/health" || urlPath === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        service: "leaflock-stream",
        clients: clients.size,
        lastVideoId,
        lastTitle,
        lastError,
        lastEvent,
        lastSource,
        crossfadeSec: CROSSFADE_SEC,
        mount: "/live.mp3"
      })
    );
    return;
  }

  if (urlPath === "/live.mp3" || urlPath === "/live") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-LeafLock-Audio-Source", "continuous-encoder");
    res.setHeader("X-LeafLock-Station", "LeafLock Locked In Radio");
    res.setHeader("icy-name", "LeafLock FM 104.2");
    res.setHeader("icy-description", "DJ420 - Locked In Radio");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    clients.add(res);
    log("client+", clients.size);

    const onClose = () => {
      clients.delete(res);
      log("client-", clients.size);
    };
    req.on("close", onClose);
    res.on("close", onClose);

    void playHold(1).catch(() => undefined);
    void loop();
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

server.timeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
if ("requestTimeout" in server) server.requestTimeout = 0;

server.listen(PORT, "0.0.0.0", () => {
  log("listening", PORT, "api", FM_API_BASE);
});

process.on("uncaughtException", (e) => log("uncaught", e.message));
process.on("unhandledRejection", (e) =>
  log("unhandled", e && e.message ? e.message : e)
);
