import { AppShell } from "~/components/layout/app-shell";
import { EarningsCard } from "./components/earnings-card";
import { KpiCards } from "./components/kpi-cards";
import { QuickActions } from "./components/quick-actions";
import { VenueCard } from "./components/venue-card";

export default function Dashboard() {
  return (
    <AppShell activeNav="home">
      {/* Content area — dark banner background */}
      <div class="flex flex-1 flex-col overflow-hidden bg-primary dark:bg-[linear-gradient(135deg,#073d2b,#042218)]">
        {/* Banner zone */}
        <div class="flex shrink-0 flex-col gap-3 px-6 pt-4 pb-12 max-[800px]:px-[18px] max-[800px]:pt-3.5 max-[800px]:pb-10">
          <VenueCard />
          <EarningsCard />
        </div>

        {/* Content body — canvas overlay */}
        <div class="scrollbar-none relative z-10 -mt-9 flex flex-1 flex-col gap-6 overflow-y-auto rounded-t-[60px] bg-cream px-6 py-9 max-[800px]:gap-5 max-[800px]:px-[18px] max-[800px]:py-7 max-[900px]:pb-24 dark:bg-surface">
          <QuickActions />
          <KpiCards />
        </div>
      </div>
    </AppShell>
  );
}
