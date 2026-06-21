"use client";

import { useEffect, useState } from "react";
import FmScheduleView, { type PublicScheduleItem } from "@/components/FmScheduleView";

export default function FmScheduleSection() {
  const [items, setItems] = useState<PublicScheduleItem[]>([]);

  useEffect(() => {
    void fetch("/api/fm/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { schedule?: PublicScheduleItem[] }) => setItems(payload.schedule ?? []))
      .catch(() => setItems([]));
  }, []);

  return (
    <details className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-6">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
        Station schedule
      </summary>
      <div className="mt-4">
        <FmScheduleView items={items} />
      </div>
    </details>
  );
}