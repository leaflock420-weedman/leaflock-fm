import FmListenMode from "@/components/FmListenMode";
import FmScheduleSection from "@/components/FmScheduleSection";
import InstallPrompt from "@/components/InstallPrompt";
import FmDeskPanel from "@/components/FmDeskPanel";
import TopLovedTracks from "@/components/TopLovedTracks";
import ConductorHeartbeat from "@/components/fm/ConductorHeartbeat";
import FmFooter from "@/components/fm/FmFooter";
import FmHero from "@/components/fm/FmHero";

export default function FMPage() {
  return (
    <main className="min-h-[100dvh] bg-black px-4 pb-[max(6rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-12 md:pb-16 md:py-16">
      <ConductorHeartbeat />
      <div className="mx-auto max-w-2xl space-y-8 sm:space-y-10">
        <FmHero />
        <FmListenMode />
        <TopLovedTracks />
        <FmScheduleSection />
        <FmFooter />
      </div>
      <InstallPrompt />
      <FmDeskPanel />
    </main>
  );
}