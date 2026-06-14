import type { RouteSectionProps } from "@solidjs/router";
import { useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { FadeIn } from "~/components/ui/fade-in";
import { useIsWide } from "~/lib/use-is-wide";
import { useOrientation } from "~/lib/use-orientation";
import { NAV_ITEMS, SettingsNav } from "./components/settings-nav";

export default function Pengaturan(props: RouteSectionProps) {
  const isPortrait = useOrientation();
  const isWide = useIsWide();
  const enable = () => !isPortrait();
  const location = useLocation();

  // Section sub-route? (e.g. /pengaturan/umum — not the bare /pengaturan)
  const isSectionRoute = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.length > 1 && parts[0] === "pengaturan";
  };

  const sectionTitle = () => {
    const seg = location.pathname.split("/")[2];
    return NAV_ITEMS.find((i) => i.key === seg)?.label ?? "Pengaturan";
  };

  return (
    <Show
      fallback={
        /* ── Index route (mobile) or two-column layout (desktop) ── */
        <div
          class="scrollbar-none flex flex-1 flex-col gap-4 overflow-y-auto px-[18px] pt-6 pb-28 lg:gap-5 lg:px-7 lg:pb-24"
          data-ssgoi-transition="/pengaturan"
        >
          <FadeIn duration={0.35} enable={enable()} y={-8}>
            <h1 class="font-bold font-display text-foreground text-heading-sm">
              Pengaturan
            </h1>
            <p class="mt-0.5 text-body-sm text-muted-foreground tracking-[0.02em]">
              Kelola konfigurasi bisnis dan aplikasi Anda
            </p>
          </FadeIn>

          <div class="flex flex-col gap-6 lg:flex-row">
            <FadeIn delay={0.06} duration={0.45} enable={enable()} x={-30}>
              <SettingsNav />
            </FadeIn>

            {/* Desktop only — section panel. Hidden below lg (nav is the menu). */}
            <Show when={isWide()}>
              <FadeIn
                class="flex min-w-0 flex-1 flex-col gap-6"
                delay={0.14}
                duration={0.5}
                enable={enable()}
                scale={0.97}
                x={24}
              >
                <Show keyed when={location.pathname}>
                  {(_) => (
                    <FadeIn
                      duration={0.35}
                      enable={enable()}
                      scale={0.98}
                      x={16}
                    >
                      {props.children}
                    </FadeIn>
                  )}
                </Show>
              </FadeIn>
            </Show>
          </div>
        </div>
      }
      when={!isWide() && isSectionRoute()}
    >
      {/* ── Mobile section route → full-screen SubPageShell ── */}
      <SubPageShell
        backHref="/pengaturan"
        data-ssgoi-transition={location.pathname}
        title={sectionTitle()}
      >
        <div class="scrollbar-none flex-1 overflow-y-auto p-5 pb-28">
          {props.children}
        </div>
      </SubPageShell>
    </Show>
  );
}
