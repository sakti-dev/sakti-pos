import { createSignal } from "solid-js";
import { SectionPanel } from "./components/section-panels";
import { type SectionKey, SettingsNav } from "./components/settings-nav";

export default function Pengaturan() {
  const [activeSection, setActiveSection] = createSignal<SectionKey>("bisnis");

  return (
    <div
      class="scrollbar-none flex flex-1 flex-col gap-5 overflow-y-auto px-7 pt-6 pb-24 max-[800px]:gap-4 max-[800px]:px-[18px] max-[800px]:pb-28 max-[900px]:pb-28"
      data-ssgoi-transition="/pengaturan"
    >
      {/* Header */}
      <div>
        <h1 class="font-bold font-display text-[22px] text-text tracking-[-0.01em] dark:text-[#ededed]">
          Pengaturan
        </h1>
        <p class="mt-0.5 text-[13px] text-text-muted tracking-[0.02em]">
          Kelola konfigurasi bisnis dan aplikasi Anda
        </p>
      </div>

      {/* Settings layout: nav + panel */}
      <div class="flex gap-6 max-[900px]:flex-col">
        <SettingsNav active={activeSection()} onSelect={setActiveSection} />
        <div class="flex min-w-0 flex-1 flex-col gap-6">
          <SectionPanel active={activeSection()} />
        </div>
      </div>
    </div>
  );
}
