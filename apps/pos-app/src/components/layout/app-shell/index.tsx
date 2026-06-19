import type { RouteSectionProps } from "@solidjs/router";
import { Ssgoi } from "@ssgoi/solid";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { useBreakpoints } from "~/lib/ui/breakpoints";
import { FAB_PATHS, getNavKey, getZone } from "~/lib/ui/shell-config";
import { createRootConfig } from "~/lib/ui/ssgoi-config";
import { useOrientation } from "~/lib/ui/use-orientation";
import { cn } from "~/lib/utils";
import { Fab } from "./fab";
import { NotchNav } from "./notch-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/* ── AppShell ────────────────────────────────────────────────────── */

export const AppShell = (props: RouteSectionProps) => {
  const pathname = () => props.location.pathname;
  const isPortrait = useOrientation();
  const bp = useBreakpoints();
  const isWide = () => bp.lg;
  const isShell = () => getZone(pathname(), isWide()) === "shell";
  const activeNav = () => getNavKey(pathname());

  /* ── Expandable sidebar ── */
  const [expanded, setExpanded] = createSignal(false);
  let expandTimer: ReturnType<typeof setTimeout> | undefined;

  /* ── SSGOI config memo: axis choice (x vs y) tracks orientation.
     SSGOI's own createMemo recreates the transition context when config
     identity changes. Orientation signal is global (use-orientation.ts). */
  const config = createMemo(() => createRootConfig(isPortrait()));

  const touchSidebar = () => {
    setExpanded(true);
    clearTimeout(expandTimer);
    expandTimer = setTimeout(() => setExpanded(false), 1200);
  };

  const closeSidebar = () => {
    if (expanded()) {
      setExpanded(false);
      clearTimeout(expandTimer);
    }
  };

  onCleanup(() => clearTimeout(expandTimer));

  return (
    <div class="bg-card">
      <Sidebar
        activeNav={activeNav()}
        expanded={expanded()}
        isShell={isShell()}
        onClose={closeSidebar}
        onTouch={touchSidebar}
      />

      <TopBar isShell={isShell()} onClose={closeSidebar} />

      {/* ── Main content area ── fixed 80px margin for sidebar rail.
          Sidebar expands as overlay (clip-path), content stays put. */}
      <main
        class={cn(
          "relative flex flex-1 flex-col overflow-hidden bg-background",
          isShell() &&
            "mt-header h-[calc(100dvh-var(--spacing-header))] lg:ml-sidebar-rail",
          !isShell() && "h-[100dvh] overflow-hidden"
        )}
        onPointerDown={closeSidebar}
      >
        <Ssgoi config={config()}>{props.children}</Ssgoi>
      </main>

      {/* ── Shell-only chrome ── */}
      <Show
        when={
          isShell() && (FAB_PATHS as readonly string[]).includes(pathname())
        }
      >
        <Fab />
      </Show>
      <Show when={isShell()}>
        <NotchNav active={activeNav()} />
      </Show>
    </div>
  );
};
