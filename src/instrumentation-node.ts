/**
 * Node-only boot. Imported only when NEXT_RUNTIME === "nodejs"
 * so Edge instrumentation never bundles fs/path.
 */
export async function bootNodeInstrumentation(): Promise<void> {
  try {
    const { resolveWritableDataDir } = await import("@/lib/data-dir");
    resolveWritableDataDir();

    const { bootDj420Host, startDj420Heartbeat } = await import("@/lib/dj420-host");
    await bootDj420Host();
    startDj420Heartbeat();
  } catch (error) {
    console.error("[instrumentation] DJ420 boot failed (app will still start):", error);
  }
}
