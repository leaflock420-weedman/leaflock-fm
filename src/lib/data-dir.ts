import fs from "fs";
import path from "path";

/**
 * Resolve a writable on-disk data directory.
 *
 * Render may set STATION_DATA_DIR=/var/data/leaflock even when no disk is
 * mounted. mkdir('/var/data') then throws EACCES and kills instrumentation.
 * Always fall back to process.cwd()/data when the preferred path is not writable.
 */
let cachedDir: string | null = null;

function localFallback(): string {
  return path.join(process.cwd(), "data");
}

function canUseDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "ok", "utf8");
    try {
      fs.unlinkSync(probe);
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}

export function resolveWritableDataDir(): string {
  if (cachedDir) return cachedDir;

  const candidates = [
    process.env.STATION_DATA_DIR?.trim(),
    process.env.DATABASE_DIR?.trim(),
    // Only use /var/data if it already exists AND is writable (mounted disk).
    fs.existsSync("/var/data") ? "/var/data/leaflock" : null,
    localFallback()
  ].filter((v): v is string => Boolean(v && v.length > 0));

  for (const dir of candidates) {
    if (canUseDir(dir)) {
      cachedDir = dir;
      if (dir !== localFallback() && process.env.NODE_ENV !== "test") {
        console.info(`[data-dir] using ${dir}`);
      }
      return dir;
    }
    console.warn(`[data-dir] not writable, skipping: ${dir}`);
  }

  // Last resort — even if probe failed, point at cwd/data (caller may still fail).
  cachedDir = localFallback();
  return cachedDir;
}

export async function ensureWritableDataDir(): Promise<string> {
  const dir = resolveWritableDataDir();
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}
