/**
 * Keep this file free of Node-only imports (fs/path).
 * Edge instrumentation graph must compile without them.
 *
 * DJ420 host is kept alive by:
 * - /api/fm/warmup (cron every 5 min)
 * - ConductorHeartbeat on the FM page
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] node runtime ready (DJ420 via warmup cron)");
  }
}
