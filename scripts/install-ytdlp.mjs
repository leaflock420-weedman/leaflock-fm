/**
 * Download yt-dlp binary for the current platform into ./bin
 * Used by DJ420 /live.mp3 continuous audio source.
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const binDir = path.join(root, "bin");
fs.mkdirSync(binDir, { recursive: true });

const isWin = process.platform === "win32";
const name = isWin ? "yt-dlp.exe" : "yt-dlp";
const out = path.join(binDir, name);

if (fs.existsSync(out) && fs.statSync(out).size > 1_000_000) {
  console.log("[install-ytdlp] already present", out);
  process.exit(0);
}

const url = isWin
  ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
  : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

console.log("[install-ytdlp] downloading", url);

function get(urlToGet, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(urlToGet, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects < 5
        ) {
          res.resume();
          resolve(get(res.headers.location, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

try {
  const buf = await get(url);
  fs.writeFileSync(out, buf);
  if (!isWin) fs.chmodSync(out, 0o755);
  console.log("[install-ytdlp] wrote", out, buf.length, "bytes");
} catch (error) {
  console.warn("[install-ytdlp] failed (will try python -m yt_dlp at runtime):", error.message);
  process.exit(0);
}
