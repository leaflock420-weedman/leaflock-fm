/**
 * Continuous LeafLock radio encoder (separate from Next.js).
 *
 * Phones play: <audio id="leaflockRadio" src="…/live.mp3" preload="none" playsinline>
 *
 * ONE always-on encoder for every listener (true radio mount):
 *   - Encoder runs from process boot and never stops when clients disconnect
 *   - New listeners only attach — never kill/restart ffmpeg on join
 *   - Same live MP3 bytes → same song on every device
 *
 * Pipeline: station track → cache/yt-dlp → ffmpeg MP3 → all clients
 * Optional ~5s acrossfade. Fallback free MP3s only if every extractor fails.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const { pipeline } = require("stream/promises");
const { createWriteStream } = require("fs");

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 10000);
const FM_API_BASE = (process.env.FM_API_BASE || "https://fm.leaflock.com.au").replace(/\/$/, "");
const BITRATE = process.env.MP3_BITRATE || "128k";
const CROSSFADE_SEC = Math.max(2, Number(process.env.DJ_CROSSFADE_SEC || 5));
const MEDIA_DIR = process.env.MEDIA_DIR || path.join("/tmp", "leaflock-media");
const NODE_BIN = process.execPath;

/** Royalty-free direct MP3s so the mount never goes silent if YT is blocked. */
const FALLBACK_MP3S = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3"
];

const PIPED_BASES = [
  process.env.PIPED_API_URL,
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi.leptons.xyz"
].filter(Boolean);

const INVIDIOUS_BASES = [
  process.env.INVIDIOUS_API_URL,
  "https://yewtu.be",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.flokinet.to",
  "https://iv.ggtyler.dev"
].filter(Boolean);

const clients = new Set();
/**
 * Tiny ring only for MP3 frame sync on join — NOT seconds of past audio.
 * A large buffer made late joiners play ~20s behind everyone else.
 */
const RECENT_BYTES = 6 * 1024;
const recentChunks = [];
let recentTotal = 0;
let encoder = null;
let loopRunning = false;
let lastVideoId = null;
let lastError = null;
let lastEvent = "boot";
let lastTitle = null;
let lastArtist = null;
let lastSource = null;
let nextVideoId = null;
let nextTitle = null;
let fallbackIndex = 0;
let cookiesPath = null;
/** After cold start, honor station offset once so we join the shared timeline mid-song. */
let honorStationOffsetOnce = true;
let trackStartedAtMs = 0;
let trackDurationSec = 0;

try {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
} catch {
  /* ignore */
}

function log(...a) {
  console.log(new Date().toISOString(), "[stream]", ...a);
}

function pushRecent(buf) {
  if (!buf || !buf.length) return;
  recentChunks.push(buf);
  recentTotal += buf.length;
  while (recentTotal > RECENT_BYTES && recentChunks.length > 1) {
    const drop = recentChunks.shift();
    recentTotal -= drop.length;
  }
}

function broadcast(buf) {
  pushRecent(buf);
  for (const res of [...clients]) {
    try {
      if (!res.writableEnded && !res.destroyed) res.write(buf);
    } catch {
      clients.delete(res);
    }
  }
}

/** Attach listener to the live edge — do not touch the shared encoder. */
function attachClient(res) {
  for (const chunk of recentChunks) {
    try {
      if (!res.writableEnded && !res.destroyed) res.write(chunk);
    } catch {
      return;
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

function cachedFile(videoId) {
  return ["m4a", "webm", "mp3", "opus", "mp4"]
    .map((ext) => path.join(MEDIA_DIR, `${videoId}.${ext}`))
    .find((p) => {
      try {
        return fs.statSync(p).size > 50_000;
      } catch {
        return false;
      }
    });
}

async function getTrack() {
  // Raw station rotation — never the stream-sync overlay (avoids feedback loop).
  const res = await fetch(`${FM_API_BASE}/api/fm/now-playing?for=encoder`, {
    cache: "no-store"
  });
  if (!res.ok) throw new Error("now-playing " + res.status);
  const data = await res.json();
  if (!data.current?.videoId) throw new Error("no track");
  return {
    videoId: data.current.videoId,
    title: data.current.title || "LeafLock",
    artist: data.current.artist || null,
    offset: Number(data.currentOffsetSeconds ?? data.offsetSeconds ?? 0),
    duration: Number(data.durationSec || data.current.durationSec || 240),
    nextVideoId: data.nextVideoId || null,
    nextTitle: data.nextTitle || data.upNext || null
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

/** Push what is actually on the mount so every website shows the same current/up-next. */
async function publishSync(meta) {
  try {
    await fetch(`${FM_API_BASE}/api/fm/stream-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-stream-secret": process.env.FM_ADMIN_SECRET || ""
      },
      body: JSON.stringify({
        videoId: meta.videoId,
        title: meta.title,
        artist: meta.artist || null,
        nextVideoId: meta.nextVideoId || null,
        nextTitle: meta.nextTitle || null,
        durationSec: meta.durationSec || null,
        startedAt: meta.startedAt || new Date().toISOString(),
        source: meta.source || lastSource
      })
    });
  } catch (e) {
    log("stream-sync", e.message);
  }
}

function baseYtDlpArgs(outTemplate) {
  const args = [
    "-f",
    "bestaudio[ext=m4a]/bestaudio/best",
    "-o",
    outTemplate,
    "--no-playlist",
    "--no-warnings",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--concurrent-fragments",
    "1",
    // Required for current YouTube (SABR / n-sig / player JS)
    "--js-runtimes",
    `node:${NODE_BIN}`,
    "--remote-components",
    "ejs:github"
  ];
  if (cookiesPath) args.push("--cookies", cookiesPath);
  return args;
}

async function downloadViaYtDlp(videoId) {
  const outTemplate = path.join(MEDIA_DIR, `${videoId}.%(ext)s`);
  const page = `https://www.youtube.com/watch?v=${videoId}`;
  const clientCombos = [
    "youtube:player_client=android_vr,web",
    "youtube:player_client=android_vr",
    "youtube:player_client=ios,web",
    "youtube:player_client=web,android",
    "youtube:player_client=tv_embedded,web_embedded",
    "youtube:player_client=mweb,web"
  ];

  let lastErr = "";
  for (const extractorArgs of clientCombos) {
    try {
      const args = [
        ...baseYtDlpArgs(outTemplate),
        "--extractor-args",
        extractorArgs,
        page
      ];
      await execFileAsync("yt-dlp", args, {
        timeout: 150_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, PATH: process.env.PATH }
      });
      const found = cachedFile(videoId);
      if (found) {
        lastSource = "yt-dlp:" + extractorArgs.split("=")[1];
        return found;
      }
    } catch (e) {
      lastErr = (e.stderr || e.message || String(e)).toString().slice(-500);
      log("yt-dlp try fail", extractorArgs, lastErr.slice(0, 160));
    }
  }
  throw new Error(lastErr || "yt-dlp download failed");
}

async function downloadViaYtdlCore(videoId) {
  let ytdl;
  try {
    ytdl = require("@distube/ytdl-core");
  } catch {
    throw new Error("ytdl-core missing");
  }
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
    playerClients: ["ANDROID", "IOS", "TV", "WEB"]
  });
  const formats = ytdl
    .filterFormats(info.formats, "audioonly")
    .filter((f) => f.url || f.cipher || f.signatureCipher);
  if (!formats.length) throw new Error("ytdl-core no formats");
  formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  const f =
    formats.find((x) => String(x.mimeType || "").includes("mp4")) || formats[0];
  const ext = (f.container || "m4a").replace(/[^a-z0-9]/gi, "") || "m4a";
  const dest = path.join(MEDIA_DIR, `${videoId}.${ext}`);
  await new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format: f });
    const out = createWriteStream(dest);
    let bytes = 0;
    stream.on("data", (c) => {
      bytes += c.length;
    });
    stream.pipe(out);
    stream.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => {
      if (bytes < 50_000) reject(new Error("ytdl-core short file " + bytes));
      else resolve();
    });
    setTimeout(() => reject(new Error("ytdl-core timeout")), 120_000);
  });
  lastSource = "ytdl-core";
  return dest;
}

async function fetchAudioUrlToFile(videoId, url, label) {
  const dest = path.join(MEDIA_DIR, `${videoId}.bin`);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
      Referer: "https://www.youtube.com/"
    },
    signal: AbortSignal.timeout(120_000)
  });
  if (!res.ok || !res.body) throw new Error(label + " http " + res.status);
  const ct = String(res.headers.get("content-type") || "");
  let ext = "m4a";
  if (ct.includes("webm") || ct.includes("opus")) ext = "webm";
  else if (ct.includes("mpeg") || ct.includes("mp3")) ext = "mp3";
  else if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac")) ext = "m4a";
  const finalPath = path.join(MEDIA_DIR, `${videoId}.${ext}`);
  const file = createWriteStream(finalPath);
  // Node 20: res.body is a web ReadableStream
  const nodeStream = require("stream").Readable.fromWeb(res.body);
  await pipeline(nodeStream, file);
  const size = fs.statSync(finalPath).size;
  if (size < 50_000) {
    try {
      fs.unlinkSync(finalPath);
    } catch {
      /* ignore */
    }
    throw new Error(label + " short file " + size);
  }
  try {
    if (dest !== finalPath && fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }
  lastSource = label;
  return finalPath;
}

async function resolveViaPiped(videoId) {
  for (const base of PIPED_BASES) {
    try {
      const res = await fetch(`${String(base).replace(/\/$/, "")}/streams/${videoId}`, {
        headers: { Accept: "application/json", "User-Agent": "LeafLockStream/1.0" },
        signal: AbortSignal.timeout(12_000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const streams = [...(data.audioStreams || [])].filter((s) => s.url?.startsWith("http"));
      if (!streams.length) continue;
      streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      return await fetchAudioUrlToFile(videoId, streams[0].url, "piped:" + base);
    } catch (e) {
      log("piped fail", base, e.message);
    }
  }
  return null;
}

async function resolveViaInvidious(videoId) {
  for (const base of INVIDIOUS_BASES) {
    try {
      const res = await fetch(
        `${String(base).replace(/\/$/, "")}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
        {
          headers: { Accept: "application/json", "User-Agent": "LeafLockStream/1.0" },
          signal: AbortSignal.timeout(12_000)
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const audio = (data.adaptiveFormats || [])
        .filter((f) => f.url && String(f.type || "").startsWith("audio/"))
        .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      if (!audio[0]?.url) continue;
      return await fetchAudioUrlToFile(videoId, audio[0].url, "invidious:" + base);
    } catch (e) {
      log("invidious fail", base, e.message);
    }
  }
  return null;
}

/**
 * Download audio to local cache. Prefer yt-dlp + Node JS runtime.
 */
async function downloadTrack(videoId) {
  const existing = cachedFile(videoId);
  if (existing) {
    lastSource = "cache";
    return existing;
  }

  const errors = [];

  try {
    return await downloadViaYtDlp(videoId);
  } catch (e) {
    errors.push("yt-dlp: " + (e.message || e));
  }

  try {
    return await downloadViaYtdlCore(videoId);
  } catch (e) {
    errors.push("ytdl-core: " + (e.message || e));
  }

  try {
    const p = await resolveViaPiped(videoId);
    if (p) return p;
  } catch (e) {
    errors.push("piped: " + (e.message || e));
  }

  try {
    const p = await resolveViaInvidious(videoId);
    if (p) return p;
  } catch (e) {
    errors.push("invidious: " + (e.message || e));
  }

  throw new Error(errors.slice(-3).join(" | ") || "download failed");
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

/**
 * Always-on radio loop. Keeps encoding even with zero listeners so every phone
 * that tunes in joins the SAME live edge (same song, same place).
 */
async function loop() {
  if (loopRunning) return;
  loopRunning = true;
  lastEvent = "loop-start";
  cookiesPath = writeCookiesFile();
  log(
    "always-on encoder, mediaDir=",
    MEDIA_DIR,
    "jsRuntime=node",
    "cookies=",
    Boolean(cookiesPath)
  );

  while (true) {
    try {
      let track = await getTrack();
      lastEvent = "track:" + track.videoId;

      // Avoid replaying the same id if station has not advanced yet
      if (
        lastVideoId &&
        track.videoId === lastVideoId &&
        !String(lastVideoId).endsWith("-fb")
      ) {
        await advance();
        await new Promise((r) => setTimeout(r, 500));
        track = await getTrack();
      }

      let fileA = null;
      for (let attempt = 0; attempt < 6 && !fileA; attempt++) {
        try {
          if (attempt > 0) {
            await advance();
            await new Promise((r) => setTimeout(r, 400));
            track = await getTrack();
            lastEvent = "skip:" + track.videoId;
          }
          fileA = await downloadTrack(track.videoId);
        } catch (e) {
          lastError = e.message || String(e);
          log("download fail", track.videoId, lastError.slice(0, 220));
          fileA = null;
        }
      }

      if (!fileA) {
        const fb = FALLBACK_MP3S[fallbackIndex % FALLBACK_MP3S.length];
        fallbackIndex += 1;
        lastTitle = (track.title || "LeafLock") + " (backup bed)";
        lastArtist = track.artist || null;
        lastVideoId = (track.videoId || "x") + "-fb";
        nextVideoId = track.nextVideoId || null;
        nextTitle = track.nextTitle || null;
        trackStartedAtMs = Date.now();
        trackDurationSec = 90;
        await publishSync({
          videoId: track.videoId,
          title: lastTitle,
          artist: lastArtist,
          nextVideoId,
          nextTitle,
          durationSec: 90,
          startedAt: new Date(trackStartedAtMs).toISOString(),
          source: "fallback-mp3"
        });
        await playRemoteMp3(fb);
        await advance();
        honorStationOffsetOnce = false;
        continue;
      }

      // Cold start only: join mid-track to match global station clock.
      // After that the encoder owns the timeline so all listeners stay aligned.
      let start = 0;
      if (
        honorStationOffsetOnce &&
        track.offset > 5 &&
        track.offset < track.duration - 25
      ) {
        start = track.offset;
      }
      honorStationOffsetOnce = false;
      const remain = Math.max(20, track.duration - start);

      lastVideoId = track.videoId;
      lastTitle = track.title;
      lastArtist = track.artist || null;
      nextVideoId = track.nextVideoId || null;
      nextTitle = track.nextTitle || null;
      lastError = null;
      trackStartedAtMs = Date.now();
      trackDurationSec = remain;
      log("play", track.videoId, track.title, "src", lastSource, "start", start);

      await publishSync({
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        nextVideoId,
        nextTitle,
        durationSec: remain,
        startedAt: new Date(trackStartedAtMs).toISOString(),
        source: lastSource
      });

      // Peek next for crossfade WITHOUT advancing station yet
      let nextMeta = null;
      if (track.nextVideoId && track.nextVideoId !== track.videoId) {
        nextMeta = {
          videoId: track.nextVideoId,
          title: track.nextTitle || "Up next",
          duration: 240
        };
      }

      if (nextMeta) {
        try {
          const fileB = await downloadTrack(nextMeta.videoId);
          await playCrossfadeFiles(fileA, fileB, start, remain);
          // Current finished into next — one advance, then finish next, then one advance.
          await advance();
          lastVideoId = nextMeta.videoId;
          lastTitle = nextMeta.title;
          lastArtist = null;
          trackStartedAtMs = Date.now();
          trackDurationSec = Math.max(30, (nextMeta.duration || 240) - CROSSFADE_SEC);
          // Refresh up-next after advance
          try {
            const t2 = await getTrack();
            nextVideoId = t2.nextVideoId || null;
            nextTitle = t2.nextTitle || null;
          } catch {
            nextVideoId = null;
            nextTitle = null;
          }
          await publishSync({
            videoId: nextMeta.videoId,
            title: nextMeta.title,
            nextVideoId,
            nextTitle,
            durationSec: trackDurationSec,
            startedAt: new Date(trackStartedAtMs).toISOString(),
            source: lastSource
          });
          await playLocalFile(fileB, { start: CROSSFADE_SEC });
          await advance();
          continue;
        } catch (e) {
          log("crossfade fail", e.message);
          await playLocalFile(fileA, { start, duration: remain });
          await advance();
        }
      } else {
        await playLocalFile(fileA, { start, duration: remain });
        await advance();
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
      honorStationOffsetOnce = false;
    }
  }
}

const server = http.createServer((req, res) => {
  const urlPath = String(req.url || "/").split("?")[0];
  lastEvent = "req:" + urlPath;

  if (urlPath === "/health" || urlPath === "/") {
    let cachedTracks = 0;
    try {
      cachedTracks = fs
        .readdirSync(MEDIA_DIR)
        .filter((f) => /\.(m4a|webm|mp3|opus|mp4)$/i.test(f)).length;
    } catch {
      /* ignore */
    }
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
        mount: "/live.mp3",
        jsRuntime: "node",
        cookiesConfigured: Boolean(
          process.env.YTDLP_COOKIES || process.env.YOUTUBE_COOKIES
        ),
        cachedTracks,
        alwaysOn: true,
        lastArtist,
        nextVideoId,
        nextTitle,
        trackStartedAtMs,
        trackDurationSec,
        liveOffsetSec:
          trackStartedAtMs > 0
            ? Math.max(0, (Date.now() - trackStartedAtMs) / 1000)
            : 0,
        build: "sync-meta-v2"
      })
    );
    return;
  }

  // Authenticated cache seed: POST /admin/seed?videoId=XXX  body=raw audio bytes
  // Used when Render IPs are YouTube-bot-blocked — seed from a residential machine.
  if (urlPath === "/admin/seed" && req.method === "POST") {
    const secret = req.headers["x-stream-secret"] || "";
    const expected = process.env.FM_ADMIN_SECRET || "";
    if (!expected || secret !== expected) {
      res.statusCode = 401;
      res.end("unauthorized");
      return;
    }
    const u = new URL(req.url || "/", "http://localhost");
    const videoId = String(u.searchParams.get("videoId") || "").replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );
    if (!videoId || videoId.length < 6) {
      res.statusCode = 400;
      res.end("videoId required");
      return;
    }
    const ext = String(u.searchParams.get("ext") || "m4a").replace(
      /[^a-z0-9]/gi,
      ""
    ) || "m4a";
    const dest = path.join(MEDIA_DIR, `${videoId}.${ext}`);
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > 40 * 1024 * 1024) {
        res.statusCode = 413;
        res.end("too large");
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const buf = Buffer.concat(chunks);
        if (buf.length < 50_000) {
          res.statusCode = 400;
          res.end("file too small");
          return;
        }
        fs.writeFileSync(dest, buf);
        lastEvent = "seed:" + videoId;
        log("seeded", videoId, buf.length, ext);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, videoId, bytes: buf.length, path: dest }));
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e.message || e));
      }
    });
    return;
  }

  if (urlPath === "/admin/cache" && req.method === "GET") {
    const secret = req.headers["x-stream-secret"] || "";
    const expected = process.env.FM_ADMIN_SECRET || "";
    if (!expected || secret !== expected) {
      res.statusCode = 401;
      res.end("unauthorized");
      return;
    }
    let files = [];
    try {
      files = fs.readdirSync(MEDIA_DIR).filter((f) => /\.(m4a|webm|mp3|opus|mp4)$/i.test(f));
    } catch {
      files = [];
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, count: files.length, files: files.slice(0, 500) }));
    return;
  }

  if (urlPath === "/live.mp3" || urlPath === "/live") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, no-cache, no-transform");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-LeafLock-Audio-Source", "continuous-encoder");
    res.setHeader("X-LeafLock-Station", "LeafLock Locked In Radio");
    res.setHeader("X-LeafLock-Sync", "always-on-shared");
    res.setHeader("icy-name", "LeafLock FM 104.2");
    res.setHeader("icy-description", "DJ420 - Locked In Radio");
    if (lastTitle) res.setHeader("icy-title", lastTitle);
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    clients.add(res);
    // Join live edge only — never kill/restart the shared encoder
    attachClient(res);
    log("client+", clients.size, "title", lastTitle || "-");

    const onClose = () => {
      clients.delete(res);
      log("client-", clients.size);
    };
    req.on("close", onClose);
    res.on("close", onClose);

    // Encoder is always-on from boot; keep a safety start if it ever died
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

cookiesPath = writeCookiesFile();

server.listen(PORT, "0.0.0.0", () => {
  log("listening", PORT, "api", FM_API_BASE, "node", NODE_BIN);
  // Start shared radio timeline immediately (do not wait for first listener)
  void loop();
});

process.on("uncaughtException", (e) => log("uncaught", e.message));
process.on("unhandledRejection", (e) =>
  log("unhandled", e && e.message ? e.message : e)
);
