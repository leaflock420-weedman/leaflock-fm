"use client";

import { FM_PLAYLIST_LABELS, type FmPlaylistKey } from "@/lib/fm-playlists";

export type PublicScheduleItem = {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  playlistKey: FmPlaylistKey;
  note?: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDay(dayOfWeek: number) {
  if (dayOfWeek < 0) return "Every day";
  return DAY_NAMES[dayOfWeek] ?? "Every day";
}

type FmScheduleViewProps = {
  items: PublicScheduleItem[];
};

export default function FmScheduleView({ items }: FmScheduleViewProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center text-sm text-zinc-400">
        Schedule coming soon.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 sm:px-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-sm text-emerald-400">
                {FM_PLAYLIST_LABELS[item.playlistKey]}
              </p>
            </div>
            <div className="text-right text-sm tabular-nums text-zinc-300">
              <p>{formatDay(item.dayOfWeek)}</p>
              <p className="text-zinc-500">
                {item.startTime} – {item.endTime} AEST
              </p>
            </div>
          </div>
          {item.note ? <p className="mt-2 text-xs text-zinc-500">{item.note}</p> : null}
        </article>
      ))}

      <p className="text-center text-xs text-zinc-600">
        Create matching playlists in YouTube: Main Rotation, Night / Chill, Interview Drops, Live
        Sessions.
      </p>
    </div>
  );
}