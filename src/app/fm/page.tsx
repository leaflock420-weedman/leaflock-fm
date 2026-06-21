import InstallPrompt from "@/components/InstallPrompt";
import TopLovedTracks from "@/components/TopLovedTracks";
import LeafLockPlayer from "@/app/components/LeafLockPlayer";
import LeafLockStreamPlayer from "@/app/components/LeafLockStreamPlayer";

export default function FMPage() {
  return (
    <main className="min-h-screen bg-black py-16 px-6">
      <div className="mx-auto max-w-2xl space-y-10">
        <section id="shuffle">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-500">
            YouTube shuffle playlist
          </p>
          <LeafLockPlayer />
        </section>

        <TopLovedTracks />

        <details className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-6">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Live radio stream (optional)
          </summary>
          <p className="mt-4 mb-6 text-sm text-zinc-400">
            AzuraCast background playback for phone lock screen and installed app.
          </p>
          <LeafLockStreamPlayer />
        </details>
      </div>

      <div className="mt-12 text-center text-zinc-500 text-sm">
        Built for the culture. Powered by AzuraCast + YouTube.
      </div>
      <InstallPrompt />
    </main>
  );
}