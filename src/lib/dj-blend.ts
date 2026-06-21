export const DEFAULT_PRE_ROLL_MS = 3000;
export const DEFAULT_BLEND_DURATION_MS = 12000;
export const DEFAULT_BLEND_LEAD_SEC = 16;
export const BLEND_POLL_INTERVAL_MS = 250;
export const TOTAL_BLEND_MS = DEFAULT_PRE_ROLL_MS + DEFAULT_BLEND_DURATION_MS;

const PRE_ROLL_RATIO = DEFAULT_PRE_ROLL_MS / TOTAL_BLEND_MS;
const INCOMING_FLOOR = 0.14;

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export function resolveTrackDuration(playerDuration: number, metadataDuration?: number): number {
  if (playerDuration > 1) return playerDuration;
  if (metadataDuration && metadataDuration > 1) return metadataDuration;
  return 0;
}

export function equalPowerGains(progress: number): { outgoing: number; incoming: number } {
  const eased = smoothstep(progress);
  return {
    outgoing: Math.cos(eased * Math.PI * 0.5),
    incoming: Math.sin(eased * Math.PI * 0.5)
  };
}

export function djMixGains(progress: number): { outgoing: number; incoming: number } {
  const t = Math.min(1, Math.max(0, progress));

  if (t < PRE_ROLL_RATIO) {
    const pre = smoothstep(t / PRE_ROLL_RATIO);
    return {
      outgoing: 1,
      incoming: 0.04 + pre * (INCOMING_FLOOR - 0.04)
    };
  }

  const blendT = (t - PRE_ROLL_RATIO) / (1 - PRE_ROLL_RATIO);
  const { outgoing, incoming } = equalPowerGains(blendT);

  return {
    outgoing,
    incoming: INCOMING_FLOOR + incoming * (1 - INCOMING_FLOOR)
  };
}

export function computeBlendLeadSeconds(trackDurationSec?: number): number {
  const totalOverlapSec = TOTAL_BLEND_MS / 1000 + 0.5;

  if (!trackDurationSec || trackDurationSec <= 0) {
    return Math.max(DEFAULT_BLEND_LEAD_SEC, totalOverlapSec);
  }

  const ratioLead = trackDurationSec * 0.2;
  return Math.min(22, Math.max(totalOverlapSec, ratioLead));
}

export function shouldStartBlend(
  currentTime: number,
  duration: number,
  leadSeconds: number,
  blendInProgress: boolean
): boolean {
  if (blendInProgress || duration <= 0 || currentTime <= 0) return false;
  const remaining = duration - currentTime;
  return remaining <= leadSeconds && remaining > 0.35;
}

export function runDjCrossfade(options: {
  durationMs?: number;
  masterVolume: number;
  onStep: (outgoingGain: number, incomingGain: number) => void;
  onComplete: () => void;
}): () => void {
  const durationMs = options.durationMs ?? TOTAL_BLEND_MS;
  const start = performance.now();
  let rafId = 0;
  let intervalId = 0;

  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / durationMs);
    const { outgoing, incoming } = djMixGains(progress);
    options.onStep(outgoing, incoming);

    if (progress >= 1) {
      if (rafId) cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
      options.onComplete();
    }
  };

  const tick = (now: number) => {
    step(now);
    if (performance.now() - start < durationMs) {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);
  intervalId = window.setInterval(() => step(performance.now()), 120);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (intervalId) window.clearInterval(intervalId);
  };
}