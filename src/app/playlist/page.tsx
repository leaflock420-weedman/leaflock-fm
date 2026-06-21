import InstallPrompt from "@/components/InstallPrompt";
import TopLovedTracks from "@/components/TopLovedTracks";
import LeafLockPlayer from "@/app/components/LeafLockPlayer";

export default function PlaylistPage() {
  return (
    <main className="min-h-screen bg-black py-16 px-6">
      <div className="mx-auto max-w-2xl">
        <LeafLockPlayer />
        <TopLovedTracks />
      </div>
      <div className="mt-12 text-center text-zinc-500 text-sm space-y-2">
        <p>Shuffled YouTube playlist — best for on-site listening.</p>
        <p>
          For background radio, use{" "}
          <a href="/fm" className="text-emerald-400 hover:underline">
            LeafLock FM live stream
          </a>
          .
        </p>
      </div>
      <InstallPrompt />
    </main>
  );
}