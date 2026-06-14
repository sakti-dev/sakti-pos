import { createSignal } from "solid-js";
import { FadeIn } from "~/components/ui/fade-in";
import { useOrientation } from "~/lib/use-orientation";
import { SectionPanel } from "./components/section-panels";
import { type SectionKey, SettingsNav } from "./components/settings-nav";

export default function Pengaturan() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  const [activeSection, setActiveSection] = createSignal<SectionKey>("bisnis");

  return (
    <div
      class="scrollbar-none flex flex-1 flex-col gap-5 overflow-y-auto px-7 pt-6 pb-24 max-[800px]:gap-4 max-[800px]:px-[18px] max-[800px]:pb-28 max-[900px]:pb-28"
      data-ssgoi-transition="/pengaturan"
    >
      {/* Header */}
      <FadeIn duration={0.35} enable={enable()} y={-8}>
        <h1 class="font-bold font-display text-foreground text-heading-sm">
          Pengaturan
        </h1>
        <p class="mt-0.5 text-body-sm text-muted-foreground tracking-[0.02em]">
          Kelola konfigurasi bisnis dan aplikasi Anda
        </p>
      </FadeIn>

      {/* Settings layout: nav + panel */}
      <div class="flex gap-6 max-[900px]:flex-col">
        {/* Nav slides in from left */}
        <FadeIn delay={0.06} duration={0.45} enable={enable()} x={-30}>
          <SettingsNav active={activeSection()} onSelect={setActiveSection} />
        </FadeIn>

        {/* Panel slides in from right with subtle scale */}
        <FadeIn
          class="flex min-w-0 flex-1 flex-col gap-6"
          delay={0.14}
          duration={0.5}
          enable={enable()}
          scale={0.97}
          x={24}
        >
          <SectionPanel active={activeSection()} />
        </FadeIn>
      </div>
    </div>
  );
}
