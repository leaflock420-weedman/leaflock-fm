/**
 * LeafLock continuous radio — separate from Next.js website.
 * GET /live.mp3  → never-ending audio/mpeg body for native <audio>
 */

const http = require("http");
const { spawn, execFileSync } = require("child_process");
const ytdl = require("@distube/ytdl-core");

const PORT = Number(process.env.PORT || 8000);
const FM_API_BASE = (process.env.FM_API_BASE || "https://fm.leaflock.com.au").replace(/\/$/, "");
const BITRATE = process.env.MP3_BITRATE || "128k";

/** @type {Set<import('http').ServerResponse>} */
const clients = new Set();
let encoder = null;
let loopRunning = false;
let lastVideoId = null;
let lastError = null;

function log(...a) {
  console.log(new Date().toISOString(), "[stream]", ...a);
}

function broadcast(buf) {
  for (const res of clients) {
    if (res.writableEnded || res.destroyed) {
      clients.delete(res);
      continue;
    }
    try {
      res.write(buf);
    } catch {
      clients.delete(res);
    }
  }
}

async function fetchStation() {
  const res = await fetch(`${FM_API_BASE}/api/fm/now-playing`, { cache: "no-store" });
  if (!res.ok) throw new Error(`now-playing ${res.status}`);
  const data = await res.json();
  if (!data.current?.videoId) throw new Error("empty station");
  return {
    videoId: data.current.videoId,
    title: data.current.title || "LeafLock",
    offset: Number(data.currentOffsetSeconds ?? data.offsetSeconds ?? 0),
    duration: Number(data.durationSec || data.current.durationSec || 240)
  };
}

async function advance() {
  const secret = process.env.FM_ADMIN_SECRET || "";
  try {
    await fetch(`${FM_API_BASE}/api/fm/stream-next`, {
      method: "POST",
      headers: { "x-stream-secret": secret }
    });
  } catch (e) {
    log("advance err", e.message);
  }
}

async function audioUrl(videoId) {
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
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

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (encoder) {
      try {
        encoder.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    encoder = ff;
    let err = "";
    ff.stderr.on("data", (d) => {
      err += d.toString();
    });
    ff.stdout.on("data", (chunk) => broadcast(chunk));
    ff.on("error", (e) => {
      encoder = null;
      reject(e);
    });
    ff.on("close", (code) => {
      encoder = null;
      if (code === 0 || code === null) resolve();
      else reject(new Error(err.slice(-500) || `ffmpeg ${code}`));
    });
  });
}

async function playSource(url, startSec = 0) {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  if (startSec > 2) args.push("-ss", String(Math.floor(startSec)));
  args.push(
    "-i",
    url,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-ab",
    BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-f",
    "mp3",
    "pipe:1"
  );
  await runFfmpeg(args);
}

async function playHold(sec = 5) {
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    String(sec),
    "-ab",
    BITRATE,
    "-f",
    "mp3",
    "pipe:1"
  ]);
}

async function loop() {
  if (loopRunning) return;
  loopRunning = true;
  log("encoder loop on");

  while (true) {
    try {
      if (clients.size === 0) {
        if (encoder) {
          try {
            encoder.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          encoder = null;
        }
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      const track = await fetchStation();
      if (lastVideoId && track.videoId === lastVideoId) {
        await advance();
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      log("playing", track.videoId, track.title);
      const url = await audioUrl(track.videoId);
      const start =
        track.offset > 5 && track.offset < track.duration - 20 ? track.offset : 0;
      lastVideoId = track.videoId;
      lastError = null;
      await playSource(url, start);
      await advance();
    } catch (e) {
      lastError = e.message || String(e);
      log("err", lastError);
      try {
        await playHold(4);
      } catch (e2) {
        log("hold err", e2.message);
        await new Promise((r) => setTimeout(r, 2500));
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
  try {
    const path = (req.url || "/").split("?")[0];

    if (path === "/health" || path === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "leaflock-stream",
          clients: clients.size,
          lastVideoId,
          lastError,
          mount: "/live.mp3"
        })
      );
      return;
    }

    if (path === "/live.mp3" || path === "/live") {
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store, no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "icy-name": "LeafLock FM 104.2",
        "icy-description": "DJ420 — Locked In Radio",
        "X-LeafLock-Audio-Source": "continuous-encoder",
        "X-LeafLock-Station": "LeafLock Locked In Radio"
      });

      // Immediate tiny silence so gateways see body bytes
      try {
        const pad = execFileSync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=stereo",
            "-t",
            "0.25",
            "-ab",
            "128k",
            "-f",
            "mp3",
            "pipe:1"
          ],
          { maxBuffer: 1024 * 1024, timeout: 8000 }
        );
        res.write(pad);
      } catch (e) {
        log("pad failed", e.message);
      }

      clients.add(res);
      log("client+", clients.size);
      req.on("close", () => {
        clients.delete(res);
        log("client-", clients.size);
      });
      void loop();
      return;
    }

    res.writeHead(404);
    res.end("not found");
  } catch (e) {
    log("request crash", e.message);
    try {
      if (!res.headersSent) res.writeHead(500);
      res.end("error");
    } catch {
      /* ignore */
    }
  }
});

server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
server.keepAliveTimeout = 120000;

server.listen(PORT, "0.0.0.0", () => {
  log(`up :${PORT} api=${FM_API_BASE}`);
});
