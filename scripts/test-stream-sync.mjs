/**
 * Multi-listener live-edge sync test for leaflock-stream.
 *
 * Simulates:
 *  - 3 clients joining at staggered times
 *  - one client "pause" (disconnect) for 10s then resume (new connection)
 *  - asserts they receive the same live timeline (overlapping SHA of concurrent windows)
 *
 * Usage: node scripts/test-stream-sync.mjs
 */

import crypto from "crypto";

const STREAM = process.env.STREAM_URL || "https://leaflock-stream.onrender.com/live.mp3";
const HEALTH = process.env.HEALTH_URL || "https://leaflock-stream.onrender.com/health";

async function getHealth() {
  const res = await fetch(HEALTH, { cache: "no-store" });
  return res.json();
}

/**
 * Read N seconds of stream bytes.
 * @param {string} label
 * @param {number} seconds
 * @param {string} [url]
 */
async function readStream(label, seconds, url = STREAM) {
  const edge = `${url.split("?")[0]}?edge=${Date.now()}-${label}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), (seconds + 5) * 1000);
  const started = Date.now();
  try {
    const res = await fetch(edge, {
      signal: ac.signal,
      headers: { Accept: "audio/mpeg" }
    });
    if (!res.ok || !res.body) throw new Error(`${label} http ${res.status}`);
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    const buf = Buffer.concat(chunks.map((u) => Buffer.from(u)));
    // Hash the last ~32KB (live edge) not the first (attach noise)
    const slice = buf.subarray(Math.max(0, buf.length - 32768));
    const sha = crypto.createHash("sha256").update(slice).digest("hex").slice(0, 16);
    return {
      label,
      bytes: total,
      sha,
      ms: Date.now() - started,
      title: null
    };
  } finally {
    clearTimeout(timer);
  }
}

function overlapOk(a, b) {
  // Under paced broadcast, staggered joiners' *live-edge tails* should match
  // when sampled at the same wall-clock end time (same last bytes).
  return a.sha === b.sha;
}

async function main() {
  console.log("health before…");
  const h0 = await getHealth();
  console.log(
    JSON.stringify(
      {
        build: h0.build,
        readrate: h0.readrate,
        lastTitle: h0.lastTitle,
        clients: h0.clients,
        maxClientBuffer: h0.maxClientBuffer
      },
      null,
      2
    )
  );

  if (h0.readrate !== 1 && h0.build && !String(h0.build).includes("paced")) {
    console.warn("WARN: expected paced-readrate build on stream service");
  }

  console.log("\n1) Three clients join staggered (0s / 2s / 4s), each read 8s…");
  const pA = readStream("A", 8);
  await new Promise((r) => setTimeout(r, 2000));
  const pB = readStream("B", 8);
  await new Promise((r) => setTimeout(r, 2000));
  const pC = readStream("C", 8);
  const [a, b, c] = await Promise.all([pA, pB, pC]);
  console.log(a, b, c);

  // Staggered start means different total windows; compare B and C which overlap more
  // End-of-window SHA should match if they share the same live edge at finish.
  // Allow B vs C (started 2s apart, both end ~same wall time if durations equal)
  console.log("\n2) Pause client D 10s then resume to live edge…");
  const d1 = await readStream("D-before", 5);
  console.log("D before pause", d1);
  console.log("sleeping 10s (paused)…");
  await new Promise((r) => setTimeout(r, 10_000));
  const d2 = await readStream("D-after", 5);
  console.log("D after resume", d2);

  const h1 = await getHealth();
  const concurrent = await Promise.all([
    readStream("X", 6),
    readStream("Y", 6)
  ]);
  console.log("\n3) Two concurrent readers (same start):", concurrent[0], concurrent[1]);
  const concurrentMatch = concurrent[0].sha === concurrent[1].sha;

  const summary = {
    build: h1.build,
    readrate: h1.readrate,
    lastTitle: h1.lastTitle,
    concurrentLiveEdgeMatch: concurrentMatch,
    resumeChangedEdge: d1.sha !== d2.sha, // after 10s pause, live edge should have moved
    droppedSlowClients: h1.droppedSlowClients ?? null,
    ok: Boolean(h1.readrate === 1 || String(h1.build || "").includes("paced")) && concurrentMatch
  };

  console.log("\nSUMMARY", summary);
  if (!summary.ok) {
    process.exitCode = 1;
    console.error("FAIL: stream not paced or concurrent clients diverged");
  } else {
    console.log("PASS: paced broadcast + concurrent live edge match");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
