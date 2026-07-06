export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootDj420Host, startDj420Heartbeat } = await import("@/lib/dj420-host");
    await bootDj420Host();
    startDj420Heartbeat();
  }
}