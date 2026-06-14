import { FadeIn } from "~/components/ui/fade-in";
import { useOrientation } from "~/lib/use-orientation";
import { EarningsCard } from "./components/earnings-card";
import { KpiCards } from "./components/kpi-cards";
import { QuickActions } from "./components/quick-actions";
import { VenueCard } from "./components/venue-card";

/* Stagger orchestration */
const STAGGER = 0.07;

export default function Dashboard() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  return (
    <div
      class="scrollbar-none relative flex flex-1 flex-col overflow-y-auto bg-banner-to"
      data-ssgoi-transition="/"
    >
      {/* Banner zone */}
      <div class="relative flex shrink-0 flex-col gap-3 px-[18px] pt-3.5 pb-10 md:px-6 md:pt-4 md:pb-24">
        <FadeIn delay={STAGGER * 0} duration={0.45} enable={enable()} y={12}>
          <VenueCard />
        </FadeIn>
        <FadeIn delay={STAGGER * 1} duration={0.45} enable={enable()} y={12}>
          <EarningsCard />
        </FadeIn>
      </div>

      {/* Content body — slides up into the banner */}
      <FadeIn
        class="relative z-10 -mt-6 flex flex-1 flex-col gap-5 rounded-t-3xl bg-background px-[18px] py-7 pb-[105px] md:-mt-14 md:gap-6 md:rounded-t-[60px] md:px-6 md:py-9"
        delay={STAGGER * 2}
        duration={0.55}
        enable={enable()}
        y={40}
      >
        <FadeIn delay={STAGGER * 4} duration={0.4} enable={enable()} y={14}>
          <QuickActions />
        </FadeIn>
        <FadeIn delay={STAGGER * 6} duration={0.4} enable={enable()} y={14}>
          <KpiCards />
        </FadeIn>
      </FadeIn>
    </div>
  );
}
