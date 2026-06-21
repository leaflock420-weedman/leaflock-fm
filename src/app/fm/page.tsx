import FmHome from "@/components/FmHome";
import InstallPrompt from "@/components/InstallPrompt";
import FmDeskPanel from "@/components/FmDeskPanel";

export default function FMPage() {
  return (
    <main className="min-h-[100dvh] bg-black px-4 pb-[max(6rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-12 md:pb-16 md:py-16">
      <FmHome />

      <div className="mx-auto mt-8 max-w-2xl text-center text-xs text-zinc-500 sm:mt-12 sm:text-sm">
        Leaf Lock Locked In Radio — stay locked.
      </div>
      <InstallPrompt />
      <FmDeskPanel />
    </main>
  );
}