import { motion } from "motion-solidjs";
import { EarningsCard } from "./components/earnings-card";
import { KpiCards } from "./components/kpi-cards";
import { QuickActions } from "./components/quick-actions";
import { VenueCard } from "./components/venue-card";

/* Stagger orchestration */
const STAGGER = 0.07;
const EASE = [0.22, 1, 0.36, 1] as const;

export default function Dashboard() {
  return (
    <div
      class="scrollbar-none relative flex flex-1 flex-col overflow-y-auto bg-banner-to"
      data-ssgoi-transition="/"
    >
      {/* Banner zone */}
      <div class="relative flex shrink-0 flex-col gap-3 px-[18px] pt-3.5 pb-10 md:px-6 md:pt-4 md:pb-24">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.45, ease: EASE, delay: STAGGER * 0 }}
        >
          <VenueCard />
        </motion.div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.45, ease: EASE, delay: STAGGER * 1 }}
        >
          <EarningsCard />
        </motion.div>
      </div>

      {/* Content body — slides up into the banner */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        class="relative z-10 -mt-6 flex flex-1 flex-col gap-5 rounded-t-3xl bg-background px-[18px] py-7 pb-[105px] md:-mt-14 md:gap-6 md:rounded-t-[60px] md:px-6 md:py-9"
        initial={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.55, ease: EASE, delay: STAGGER * 2 }}
      >
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.4, ease: EASE, delay: STAGGER * 4 }}
        >
          <QuickActions />
        </motion.div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.4, ease: EASE, delay: STAGGER * 6 }}
        >
          <KpiCards />
        </motion.div>
      </motion.div>
    </div>
  );
}
