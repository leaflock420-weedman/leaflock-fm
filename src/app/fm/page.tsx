import InstallPrompt from "@/components/InstallPrompt";
import FmDeskPanel from "@/components/FmDeskPanel";
import TopLovedTracks from "@/components/TopLovedTracks";
import LeafLockPlayer from "@/app/components/LeafLockPlayer";
import LeafLockStreamPlayer from "@/app/components/LeafLockStreamPlayer";

export default function FMPage() {
  return (
    <main className="min-h-[100dvh] bg-black px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-12 md:py-16">
      <div className="mx-auto max-w-2xl space-y-8 sm:space-y-10">
        <section id="shuffle">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-500 sm:mb-4 sm:text-xs">
            YouTube shuffle playlist
          </p>
          <LeafLockPlayer />
        </section>

        <TopLovedTracks />

        <details className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-6">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Live radio stream (optional)
          </summary>
          <p className="mt-4 mb-6 text-sm text-zinc-400">
            AzuraCast background playback for phone lock screen and installed app.
          </p>
          <LeafLockStreamPlayer />
        </details>
      </div>

      <div className="mt-8 text-center text-xs text-zinc-500 sm:mt-12 sm:text-sm">
        Built for the culture. Powered by AzuraCast + YouTube.
      </div>
      <InstallPrompt />
      <FmDeskPanel />
    </main>
  );
}