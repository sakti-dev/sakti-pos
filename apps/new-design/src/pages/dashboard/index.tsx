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
      class="flex flex-1 flex-col overflow-hidden bg-primary"
      data-ssgoi-transition="/"
    >
      {/* Banner zone */}
      <div class="flex shrink-0 flex-col gap-3 px-6 pt-4 pb-12 max-[800px]:px-[18px] max-[800px]:pt-3.5 max-[800px]:pb-10">
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
        class="scrollbar-none relative z-10 -mt-9 flex flex-1 flex-col gap-6 overflow-y-auto rounded-t-[60px] bg-background px-6 py-9 max-[800px]:gap-5 max-[800px]:px-[18px] max-[800px]:py-7 max-[900px]:pb-24"
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
