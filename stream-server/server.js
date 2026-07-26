/**
 * Continuous MP3 radio for permanent native <audio>.
 * Mount: GET /live.mp3  (never-ending body)
 */

const http = require("http");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 8000);
const FM_API_BASE = (process.env.FM_API_BASE || "https://fm.leaflock.com.au").replace(
  /\/$/,
  ""
);
const BITRATE = process.env.MP3_BITRATE || "128k";

const clients = new Set();
let encoder = null;
let loopRunning = false;
let lastVideoId = null;
let lastError = null;
let lastEvent = "boot";

function log(...a) {
  console.log(new Date().toISOString(), "[stream]", ...a);
}

function broadcast(buf) {
  for (const res of [...clients]) {
    try {
      if (!res.writableEnded) res.write(buf);
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
    title: data.current.title,
    offset: Number(data.currentOffsetSeconds ?? data.offsetSeconds ?? 0),
    duration: Number(data.durationSec || 240)
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

async function resolveUrl(videoId) {
  // Lazy-require so /health works even if ytdl has issues at load time
  const ytdl = require("@distube/ytdl-core");
  const info = await ytdl.getInfo("https://www.youtube.com/watch?v=" + videoId, {
    playerClients: ["ANDROID", "IOS", "TV"]
  });
  const formats = ytdl.filterFormats(info.formats, "audioonly");
  if (!formats.length) throw new Error("no formats");
  formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  const f =
    formats.find((x) => String(x.mimeType || "").includes("mp4")) || formats[0];
  if (!f?.url) throw new Error("no url");
  return f.url;
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
      else reject(new Error(err.slice(-400) || "ffmpeg " + code));
    });
  });
}

async function playHold(sec) {
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

async function playHttp(url, start) {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  if (start > 2) args.push("-ss", String(Math.floor(start)));
  args.push(
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
  );
  await ffmpegToClients(args);
}

async function loop() {
  if (loopRunning) return;
  loopRunning = true;
  lastEvent = "loop-start";
  log("loop start");

  while (true) {
    if (clients.size === 0) {
      killEncoder();
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    try {
      const track = await getTrack();
      lastEvent = "got-track:" + track.videoId;
      if (lastVideoId === track.videoId) {
        await advance();
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      const url = await resolveUrl(track.videoId);
      lastEvent = "resolved";
      const start =
        track.offset > 5 && track.offset < track.duration - 20 ? track.offset : 0;
      lastVideoId = track.videoId;
      lastError = null;
      log("play", track.videoId, track.title);
      await playHttp(url, start);
      await advance();
    } catch (e) {
      lastError = e.message || String(e);
      lastEvent = "err";
      log("err", lastError);
      try {
        await playHold(5);
      } catch (e2) {
        log("hold fail", e2.message);
        await new Promise((r) => setTimeout(r, 2000));
      }
      await advance();
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
        lastError,
        lastEvent,
        mount: "/live.mp3"
      })
    );
    return;
  }

  if (path === "/live.mp3" || path === "/live") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-LeafLock-Audio-Source", "continuous-encoder");
    res.setHeader("icy-name", "LeafLock FM 104.2");

    clients.add(res);
    log("client+", clients.size, "total");

    const onClose = () => {
      clients.delete(res);
      log("client-", clients.size);
    };
    req.on("close", onClose);
    res.on("close", onClose);

    void loop();
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

// Disable timeouts for long-lived radio connections
server.timeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
if ("requestTimeout" in server) server.requestTimeout = 0;

server.listen(PORT, "0.0.0.0", () => {
  log("listening", PORT);
});

process.on("uncaughtException", (e) => log("uncaught", e.message));
process.on("unhandledRejection", (e) => log("unhandled", e && e.message));
