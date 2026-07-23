/**
 * Next.js instrumentation entry.
 * Must not statically import Node-only modules (fs/path) — Edge build will fail.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Variable import path keeps webpack from eagerly bundling Node deps into Edge.
  const nodeBoot = "./instrumentation-node";
  const mod = (await import(nodeBoot)) as {
    bootNodeInstrumentation: () => Promise<void>;
  };
  await mod.bootNodeInstrumentation();
}
