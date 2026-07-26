/**
 * LeafLock continuous radio encoder (NOT the Next.js site).
 *
 * GET /live.mp3 → never-ending audio/mpeg for:
 *   <audio id="leaflockRadio" src="https://leaflock-stream…/live.mp3">
 *
 * Track audio resolved with yt-dlp (preferred) then ytdl-core / Piped.
 * One shared encoder for all listeners. Optional 5s acrossfade.
 */

const http = require("http");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 10000);
const FM_API_BASE = (process.env.FM_API_BASE || "https://fm.leaflock.com.au").replace(
  /\/$/,
  ""
);
const BITRATE = process.env.MP3_BITRATE || "128k";
const CROSSFADE_SEC = Math.max(2, Number(process.env.DJ_CROSSFADE_SEC || 5));

const clients = new Set();
const urlCache = new Map();
let encoder = null;
let loopRunning = false;
let lastVideoId = null;
let lastError = null;
let lastEvent = "boot";
let lastTitle = null;
let resolveMethod = null;

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

async function peekNext() {
  try {
    const res = await fetch(`${FM_API_BASE}/api/fm/now-playing`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.nextVideoId) return null;
    return {
      videoId: data.nextVideoId,
      title: data.nextTitle || "Up next",
      offset: 0,
      duration: 240
    };
  } catch {
    return null;
  }
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

async function resolveViaYtDlp(videoId) {
  const page = `https://www.youtube.com/watch?v=${videoId}`;
  const clients = [
    "youtube:player_client=android",
    "youtube:player_client=ios",
    "youtube:player_client=tv",
    "youtube:player_client=web_embedded"
  ];
  let lastErr = null;
  for (const client of clients) {
    try {
      const { stdout } = await execFileAsync(
        "yt-dlp",
        [
          "-f",
          "bestaudio[ext=m4a]/bestaudio/best",
          "-g",
          "--no-playlist",
          "--no-warnings",
          "--extractor-args",
          client,
          page
        ],
        { timeout: 45000, maxBuffer: 2 * 1024 * 1024 }
      );
      const url = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
      if (url && url.startsWith("http")) {
        resolveMethod = "yt-dlp:" + client;
        return url;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("yt-dlp failed");
}

async function resolveViaYtdlCore(videoId) {
  const ytdl = require("@distube/ytdl-core");
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
    playerClients: ["ANDROID", "IOS", "TV", "WEB"]
  });
  const formats = ytdl.filterFormats(info.formats, "audioonly");
  if (!formats.length) throw new Error("no formats");
  formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  const f =
    formats.find((x) => String(x.mimeType || "").includes("mp4")) || formats[0];
  if (!f?.url) throw new Error("no url");
  resolveMethod = "ytdl-core";
  return f.url;
}

async function resolveViaPiped(videoId) {
  const bases = [
    process.env.PIPED_API_URL,
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.private.coffee",
    "https://pipedapi.nosebs.ru"
  ].filter(Boolean);

  for (const base of bases) {
    try {
      const res = await fetch(`${String(base).replace(/\/$/, "")}/streams/${videoId}`, {
        headers: { Accept: "application/json", "User-Agent": "LeafLockStream/1.0" },
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const streams = [...(data.audioStreams || [])].filter((s) => s.url?.startsWith("http"));
      if (!streams.length) continue;
      streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      resolveMethod = "piped:" + base;
      return streams[0].url;
    } catch {
      /* next */
    }
  }
  return null;
}

async function resolveViaInvidious(videoId) {
  const bases = [
    process.env.INVIDIOUS_API_URL,
    "https://yewtu.be",
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de"
  ].filter(Boolean);

  for (const base of bases) {
    try {
      const res = await fetch(
        `${String(base).replace(/\/$/, "")}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
        {
          headers: { Accept: "application/json", "User-Agent": "LeafLockStream/1.0" },
          signal: AbortSignal.timeout(12000)
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const audio = (data.adaptiveFormats || [])
        .filter((f) => f.url && String(f.type || "").startsWith("audio/"))
        .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      if (audio[0]?.url) {
        resolveMethod = "invidious:" + base;
        return audio[0].url;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

async function resolveUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.exp > Date.now()) {
    resolveMethod = "cache";
    return cached.url;
  }

  const errors = [];
  for (const fn of [resolveViaYtDlp, resolveViaYtdlCore, resolveViaPiped, resolveViaInvidious]) {
    try {
      const url = await fn(videoId);
      if (url) {
        urlCache.set(videoId, { url, exp: Date.now() + 40 * 60 * 1000 });
        log("resolved", videoId, "via", resolveMethod);
        return url;
      }
    } catch (e) {
      errors.push((e && e.message) || String(e));
    }
  }
  throw new Error(errors.slice(-2).join(" | ") || "resolve failed");
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

async function playHttp(url, { start = 0, duration = null } = {}) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-user_agent",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"
  ];
  if (start > 2) args.push("-ss", String(Math.floor(start)));
  args.push("-i", url);
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

async function playCrossfade(urlA, urlB, startA, remainA) {
  const bodyDur = Math.max(12, remainA - CROSSFADE_SEC);
  if (bodyDur > 15) {
    await playHttp(urlA, { start: startA, duration: bodyDur });
  }
  const ssA = Math.max(0, startA + bodyDur);
  await ffmpegToClients([
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-user_agent",
    "Mozilla/5.0",
    "-ss",
    String(ssA),
    "-t",
    String(CROSSFADE_SEC + 1),
    "-i",
    urlA,
    "-ss",
    "0",
    "-i",
    urlB,
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

async function playHold(sec = 4) {
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
  log("encoder loop on");

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
        if (track.videoId === lastVideoId) {
          await playHold(2);
          continue;
        }
      }

      const urlA = await resolveUrl(track.videoId);
      const start =
        track.offset > 5 && track.offset < track.duration - 25 ? track.offset : 0;
      const remain = Math.max(25, track.duration - start);

      lastVideoId = track.videoId;
      lastTitle = track.title;
      lastError = null;
      log("play", track.videoId, track.title, "via", resolveMethod);

      await advance();
      let next = await getTrack();
      if (next.videoId === track.videoId) {
        const peeked = await peekNext();
        if (peeked) next = peeked;
      }

      if (next.videoId && next.videoId !== track.videoId) {
        try {
          const urlB = await resolveUrl(next.videoId);
          await playCrossfade(urlA, urlB, start, remain);
          lastVideoId = next.videoId;
          lastTitle = next.title;
          await playHttp(urlB, { start: CROSSFADE_SEC });
          continue;
        } catch (e) {
          log("crossfade fail", e.message);
          await playHttp(urlA, { start, duration: remain });
        }
      } else {
        await playHttp(urlA, { start, duration: remain });
      }
    } catch (e) {
      lastError = e.message || String(e);
      lastEvent = "err";
      log("err", lastError);
      try {
        await playHold(4);
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
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
  const path = String(req.url || "/").split("?")[0];
  lastEvent = "req:" + path;

  if (path === "/health" || path === "/") {
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
        resolveMethod,
        crossfadeSec: CROSSFADE_SEC,
        mount: "/live.mp3"
      })
    );
    return;
  }

  if (path === "/live.mp3" || path === "/live") {
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
