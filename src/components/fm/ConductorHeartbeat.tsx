"use client";

import { useEffect } from "react";

/** Keeps the LeafLock FM Conductor clock alive even with zero listeners. */
export default function ConductorHeartbeat() {
  useEffect(() => {
    const tick = () => {
      void fetch("/api/fm/conductor/tick", { method: "POST" }).catch(() => undefined);
    };
    tick();
    const interval = window.setInterval(tick, 20_000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}