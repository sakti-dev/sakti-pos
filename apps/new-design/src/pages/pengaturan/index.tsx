import { motion } from "motion-solidjs";
import { createSignal } from "solid-js";
import { SectionPanel } from "./components/section-panels";
import { type SectionKey, SettingsNav } from "./components/settings-nav";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Pengaturan() {
  const [activeSection, setActiveSection] = createSignal<SectionKey>("bisnis");

  return (
    <div
      class="scrollbar-none flex flex-1 flex-col gap-5 overflow-y-auto px-7 pt-6 pb-24 max-[800px]:gap-4 max-[800px]:px-[18px] max-[800px]:pb-28 max-[900px]:pb-28"
      data-ssgoi-transition="/pengaturan"
    >
      {/* Header */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <h1 class="font-bold font-display text-[22px] text-foreground tracking-[-0.01em]">
          Pengaturan
        </h1>
        <p class="mt-0.5 text-[13px] text-faint-foreground tracking-[0.02em]">
          Kelola konfigurasi bisnis dan aplikasi Anda
        </p>
      </motion.div>

      {/* Settings layout: nav + panel */}
      <div class="flex gap-6 max-[900px]:flex-col">
        {/* Nav slides in from left */}
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.06 }}
        >
          <SettingsNav active={activeSection()} onSelect={setActiveSection} />
        </motion.div>

        {/* Panel slides in from right with subtle scale */}
        <motion.div
          animate={{ opacity: 1, x: 0, scale: 1 }}
          class="flex min-w-0 flex-1 flex-col gap-6"
          initial={{ opacity: 0, x: 24, scale: 0.97 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.14 }}
        >
          <SectionPanel active={activeSection()} />
        </motion.div>
      </div>
    </div>
  );
}
