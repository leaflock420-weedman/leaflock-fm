/**
 * Next.js instrumentation — static import path so standalone output includes the module.
 * Only runs on Node (not Edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    // Static path (not a variable) so Next/standalone packages this file.
    const { bootNodeInstrumentation } = await import("./instrumentation-node");
    await bootNodeInstrumentation();
  } catch (error) {
    // Never crash the process on boot failure — health must stay green for deploys.
    console.error("[instrumentation] boot failed (continuing):", error);
  }
}
