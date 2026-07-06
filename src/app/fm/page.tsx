import FmListenMode from "@/components/FmListenMode";
import FmDeskPanel from "@/components/FmDeskPanel";
import TopLovedTracks from "@/components/TopLovedTracks";
import ConductorHeartbeat from "@/components/fm/ConductorHeartbeat";
import FmFooter from "@/components/fm/FmFooter";
import FmHero from "@/components/fm/FmHero";
import FmNavLinks from "@/components/fm/FmNavLinks";
import FmScheduleCards from "@/components/fm/FmScheduleCards";

/** Static shell — player hydrates client-side for fast first paint on Render. */
export const dynamic = "force-static";

export default function FMPage() {
  return (
    <div className="fm-page">
      <ConductorHeartbeat />
      <div className="fm-shell mx-auto max-w-6xl px-4 pb-[max(7rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-8">
        <div className="space-y-5 sm:space-y-6">
          <FmHero />
          <FmNavLinks />
        </div>

        <div className="fm-grid-desktop mt-6 sm:mt-8">
          <div className="space-y-6">
            <FmListenMode />
            <TopLovedTracks />
          </div>
          <div className="space-y-6">
            <FmScheduleCards />
          </div>
        </div>

        <FmFooter />
      </div>
      <FmDeskPanel />
    </div>
  );
}