"use client";

import { useEffect, useState } from "react";
import LeafLockPlayer from "@/app/components/LeafLockPlayer";
import FmScheduleView, { type PublicScheduleItem } from "@/components/FmScheduleView";
import LeafLockLogo from "@/components/LeafLockLogo";
import TopLovedTracks from "@/components/TopLovedTracks";
import TrackRequestForm from "@/components/TrackRequestForm";
import YouTubeLivePlayer from "@/components/YouTubeLivePlayer";

type FmTab = "shuffle" | "live" | "clips" | "schedule";

type FmConfig = {
  playlistId: string;
  simplePlaylistId?: string;
  playlistLabel?: string;
  youtubeLiveVideoId?: string;
  youtubeChannelId?: string;
  schedule?: PublicScheduleItem[];
};

export default function FmHome() {
  const [tab, setTab] = useState<FmTab>("shuffle");
  const [config, setConfig] = useState<FmConfig | null>(null);

  useEffect(() => {
    void fetch("/api/fm/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: FmConfig) => setConfig(payload))
      .catch(() => setConfig(null));
  }, []);

  const tabs: { id: FmTab; label: string }[] = [
    { id: "shuffle", label: "Shuffle" },
    { id: "live", label: "Live Radio" },
    { id: "clips", label: "Clips" },
    { id: "schedule", label: "Schedule" }
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 sm:space-y-8">
      <header className="space-y-4">
        <LeafLockLogo
          className="mx-auto sm:max-w-[300px]"
          onSecretTap={() => window.dispatchEvent(new Event("leaflock:open-desk"))}
        />
        <nav
          className="grid grid-cols-4 gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5 sm:gap-2"
          aria-label="FM sections"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-1.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors sm:px-2 sm:text-xs ${
                tab === item.id
                  ? "bg-emerald-500 text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "shuffle" ? (
        <section className="space-y-6">
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-500 sm:text-xs">
              Just songs — tap play
            </p>
            <p className="mb-4 text-sm text-zinc-400">
              Your main playlist only. No schedule, no clips — just shuffle and enjoy.
            </p>
            <LeafLockPlayer
              mode="simple"
              hideLogo
              subtitle="Main rotation — simple shuffle"
            />
          </div>
          <TopLovedTracks />
        </section>
      ) : null}

      {tab === "live" ? (
        <section className="space-y-6">
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-500 sm:text-xs">
              YouTube live
            </p>
            <YouTubeLivePlayer
              videoId={config?.youtubeLiveVideoId}
              channelId={config?.youtubeChannelId}
            />
          </div>
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-500 sm:text-xs">
              Scheduled rotation — {config?.playlistLabel ?? "auto"}
            </p>
            <LeafLockPlayer
              mode="mainRotation"
              hideLogo
              subtitle="Follows schedule & night playlist"
            />
          </div>
          <TopLovedTracks />
        </section>
      ) : null}

      {tab === "clips" ? (
        <section className="space-y-6">
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-500 sm:text-xs">
              Clips & episodes
            </p>
            <LeafLockPlayer
              mode="interviewDrops"
              hideLogo
              subtitle="Interviews, promos & on-demand"
            />
          </div>
          <TrackRequestForm />
          <TopLovedTracks />
        </section>
      ) : null}

      {tab === "schedule" ? (
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-500 sm:text-xs">
            Station schedule
          </p>
          <FmScheduleView items={config?.schedule ?? []} />
        </section>
      ) : null}
    </div>
  );
}