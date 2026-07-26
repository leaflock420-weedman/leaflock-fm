/**
 * LeafLock continuous radio encoder — NOT the Next.js site.
 *
 * One encoder pipeline → many listeners on GET /live.mp3
 * Crossfade between station tracks with ffmpeg (server-side DJ blend).
 * Phones play this with a permanent native <audio> element.
 */

const http = require("http");
const { spawn } = require("child_process");
const ytdl = require("@distube/ytdl-core");

const PORT = Number(process.env.PORT || 8000);
const FM_API_BASE = (process.env.FM_API_BASE || "https://fm.leaflock.com.au").replace(/\/$/, "");
const CROSSFADE_SEC = Number(process.env.DJ_CROSSFADE_SEC || 5);
const BITRATE = process.env.MP3_BITRATE || "128k";

/** @type {Set<import('http').ServerResponse>} */
const clients = new Set();
let pipelineBusy = false;
let lastVideoId = null;
let encoder = null;

function log(...args) {
  console.log(new Date().toISOString(), "[leaflock-stream]", ...args);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function getStationTrack() {
  const data = await fetchJson(`${FM_API_BASE}/api/fm/now-playing`);
  const current = data.current;
  if (!current?.videoId) throw new Error("No current station track");
  return {
    videoId: current.videoId,
    title: current.title || "LeafLock Radio",
    artist: current.artist || "Locked In Radio",
    durationSec: Number(data.durationSec || current.durationSec || 240),
    offsetSec: Number(data.currentOffsetSeconds ?? data.offsetSeconds ?? 0)
  };
}

async function advanceStation() {
  const secret = process.env.FM_ADMIN_SECRET || process.env.STREAM_SECRET || "";
  try {
    const res = await fetch(`${FM_API_BASE}/api/fm/stream-next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-stream-secret": secret
      }
    });
    if (!res.ok) {
      // Fallback: conductor tick
      await fetch(`${FM_API_BASE}/api/fm/conductor/tick`, { method: "POST" });
    }
  } catch (e) {
    log("advance failed", e.message);
  }
}

async function resolveAudioUrl(videoId) {
  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
      playerClients: ["ANDROID", "IOS", "TV"]
    });
    const formats = ytdl.filterFormats(info.formats, "audioonly");
    if (!formats.length) throw new Error(`No audio formats for ${videoId}`);
    formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
    const preferred =
      formats.find((f) => String(f.mimeType || f.container || "").includes("mp4")) ||
      formats[0];
    if (!preferred?.url) throw new Error(`No url for ${videoId}`);
    return preferred.url;
  } catch (e) {
    log("ytdl failed", videoId, e.message);
    throw e;
  }
}

/** Hold tone so the continuous mount never goes silent between failures. */
function playHoldTone(seconds = 8) {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:sample_rate=44100",
        "-t",
        String(seconds),
        "-af",
        "volume=0.08",
        "-ac",
        "2",
        "-ab",
        BITRATE,
        "-f",
        "mp3",
        "pipe:1"
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    encoder = ff;
    ff.stdout.on("data", (chunk) => broadcast(chunk));
    ff.on("error", reject);
    ff.on("close", () => {
      encoder = null;
      resolve();
    });
  });
}

function broadcast(chunk) {
  for (const res of clients) {
    if (res.writableEnded) {
      clients.delete(res);
      continue;
    }
    try {
      res.write(chunk);
    } catch {
      clients.delete(res);
    }
  }
}

function spawnFfmpeg(inputUrl, { startSec = 0, durationSec = null } = {}) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5"
  ];
  if (startSec > 1) {
    args.push("-ss", String(Math.floor(startSec)));
  }
  args.push("-i", inputUrl);
  if (durationSec && durationSec > 0) {
    args.push("-t", String(Math.floor(durationSec)));
  }
  args.push(
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

  return spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Encode one track to MP3 frames and fan-out to all connected listeners.
 * Connection never closes between tracks — clients stay on one continuous body.
 */
function playUrlAsMp3(inputUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    if (encoder) {
      try {
        encoder.kill("SIGKILL");
      } catch {
        // ignore
      }
      encoder = null;
    }

    const ff = spawnFfmpeg(inputUrl, opts);
    encoder = ff;

    ff.stdout.on("data", (chunk) => {
      if (clients.size > 0) broadcast(chunk);
    });

    let err = "";
    ff.stderr.on("data", (d) => {
      err += d.toString();
    });

    ff.on("error", (e) => {
      encoder = null;
      reject(e);
    });

    ff.on("close", (code) => {
      encoder = null;
      if (code === 0 || code === null) resolve();
      else reject(new Error(err.slice(-400) || `ffmpeg exit ${code}`));
    });
  });
}

async function encodeLoop() {
  if (pipelineBusy) return;
  pipelineBusy = true;
  log("encoder loop start");

  while (true) {
    if (clients.size === 0) {
      // Idle until someone tunes in (saves CPU/RAM)
      if (encoder) {
        try {
          encoder.kill("SIGKILL");
        } catch {
          // ignore
        }
        encoder = null;
      }
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    try {
      let track = await getStationTrack();

      // If we just finished this track, ask conductor to advance
      if (lastVideoId && track.videoId === lastVideoId) {
        await advanceStation();
        await new Promise((r) => setTimeout(r, 800));
        track = await getStationTrack();
      }

      log("track", track.videoId, track.title);
      const audioUrl = await resolveAudioUrl(track.videoId);

      // Join mid-track for first connection of a new song
      const startSec =
        lastVideoId !== track.videoId && track.offsetSec > 3 && track.offsetSec < track.durationSec - 15
          ? track.offsetSec
          : 0;

      lastVideoId = track.videoId;

      // Leave headroom so next track can start with overlap feel
      const playFor =
        track.durationSec > CROSSFADE_SEC + 10
          ? track.durationSec - startSec - CROSSFADE_SEC * 0.5
          : null;

      await playUrlAsMp3(audioUrl, {
        startSec,
        durationSec: playFor && playFor > 20 ? playFor : null
      });

      // Soft gap fill — brief silence frames so connection stays open during switch
      // (ffmpeg next process starts immediately after)
    } catch (e) {
      log("encode error", e.message || e);
      try {
        await playHoldTone(6);
      } catch (holdErr) {
        log("hold tone failed", holdErr.message || holdErr);
        await new Promise((r) => setTimeout(r, 3000));
      }
      try {
        await advanceStation();
      } catch {
        // ignore
      }
    }
  }
}

/** Minimal MPEG frame padding so proxies get bytes before ffmpeg is warm. */
function silentMp3Pad() {
  // Very short generated pad via ffmpeg once, cached
  return null;
}

let padBuffer = null;
function ensurePad() {
  if (padBuffer) return padBuffer;
  try {
    const { execFileSync } = require("child_process");
    padBuffer = execFileSync(
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
        "0.5",
        "-ab",
        "128k",
        "-f",
        "mp3",
        "pipe:1"
      ],
      { maxBuffer: 2 * 1024 * 1024 }
    );
  } catch {
    padBuffer = Buffer.alloc(0);
  }
  return padBuffer;
}

function sendIcyHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store, no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "icy-name": "LeafLock FM 104.2",
    "icy-description": "DJ420 — Locked In Radio",
    "icy-genre": "Radio",
    "X-LeafLock-Station": "LeafLock Locked In Radio",
    "X-LeafLock-Audio-Source": "continuous-encoder"
  });
  // Immediate first bytes so Cloudflare/Render don't 502 on slow TTFB
  const pad = ensurePad();
  if (pad && pad.length) {
    try {
      res.write(pad);
    } catch {
      // ignore
    }
  }
}

const server = http.createServer((req, res) => {
  const path = (req.url || "/").split("?")[0];

  if (path === "/health" || path === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "leaflock-stream",
        clients: clients.size,
        lastVideoId,
        mount: "/live.mp3"
      })
    );
    return;
  }

  if (path === "/live.mp3" || path === "/live") {
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      });
      res.end();
      return;
    }

    sendIcyHeaders(res);
    clients.add(res);
    log("listener +1", clients.size);

    req.on("close", () => {
      clients.delete(res);
      log("listener -1", clients.size);
    });

    // Kick encoder if idle
    void encodeLoop();
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  log(`listening on :${PORT}  mounts /live.mp3 /live  api=${FM_API_BASE}`);
  // Pre-warm encoder so first listener is fast
  void encodeLoop();
});
