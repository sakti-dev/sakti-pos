import { GreenFluxBackground } from "~/assets";
import { FadeIn } from "~/components/ui/fade-in";
import { useOrientation } from "~/lib/ui/use-orientation";
import { AttentionList } from "./components/attention-list";
import { MenuNav } from "./components/menu-nav";
import { MoneyHero } from "./components/money-hero";
import { StartSale } from "./components/start-sale";
import { StatusPlaque } from "./components/status-plaque";

/* Stagger orchestration */
const STAGGER = 0.07;

export default function HomePage() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  return (
    <div
      class="scrollbar-none relative flex flex-1 flex-col overflow-y-auto bg-banner-to"
      data-ssgoi-transition="/"
    >
      {/* Banner zone — the apothecary counter surface */}
      <GreenFluxBackground class="pointer-events-none absolute inset-0 h-full w-full" />

      <div class="relative z-1 flex shrink-0 flex-col gap-4 px-gutter pt-3.5 pb-10 lg:px-6 lg:pt-4 lg:pb-24">
        <FadeIn delay={STAGGER * 0} duration={0.45} enable={enable()} y={12}>
          <StatusPlaque />
        </FadeIn>
        <FadeIn delay={STAGGER * 1} duration={0.45} enable={enable()} y={12}>
          <MoneyHero />
        </FadeIn>
      </div>

      {/* Content body — slides up into the banner */}
      <FadeIn
        class="relative z-10 -mt-6 flex flex-1 flex-col gap-6 rounded-t-3xl bg-background px-gutter py-7 pb-[105px] lg:-mt-14 lg:gap-7 lg:rounded-t-[60px] lg:px-6 lg:py-9"
        delay={STAGGER * 2}
        duration={0.55}
        enable={enable()}
        y={40}
      >
        {/* Hero action — the sale is the anchor */}
        <FadeIn delay={STAGGER * 4} duration={0.4} enable={enable()} y={14}>
          <StartSale />
        </FadeIn>

        {/* Needs attention — a list, never a card grid */}
        <FadeIn delay={STAGGER * 6} duration={0.4} enable={enable()} y={14}>
          <AttentionList />
        </FadeIn>

        {/* Full menu — grouped navigation, not a flat launcher grid */}
        <FadeIn delay={STAGGER * 8} duration={0.4} enable={enable()} y={14}>
          <MenuNav />
        </FadeIn>
      </FadeIn>
    </div>
  );
}
