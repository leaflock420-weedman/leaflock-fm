export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    // Ensure data dir is writable BEFORE host boot (avoids EACCES on /var/data).
    const { resolveWritableDataDir } = await import("@/lib/data-dir");
    resolveWritableDataDir();

    const { bootDj420Host, startDj420Heartbeat } = await import("@/lib/dj420-host");
    await bootDj420Host();
    startDj420Heartbeat();
  } catch (error) {
    // Never crash the whole Next.js process on host boot failure.
    console.error("[instrumentation] DJ420 boot failed (app will still start):", error);
  }
}