import type { RouteSectionProps } from "@solidjs/router";
import { Ssgoi } from "@ssgoi/solid";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { createRootConfig } from "~/lib/ssgoi-config";
import { useIsWide } from "~/lib/use-is-wide";
import { useOrientation } from "~/lib/use-orientation";
import { cn } from "~/lib/utils";
import { Fab } from "./fab";
import { NotchNav } from "./notch-nav";
import type { NavKey } from "./sidebar";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/* ── Zone detection ──────────────────────────────────────────────── */

type Zone = "shell" | "flow" | "auth";

const ZONE_MAP: Record<string, Zone> = {
  "/": "shell",
  "/transactions": "shell",
  "/katalog": "shell",
  "/inventory": "shell",
  "/pengaturan": "shell",
  "/transaction-new": "flow",
  "/payment": "flow",
  "/receipt": "flow",
  "/login": "auth",
  "/register": "auth",
  "/pin": "auth",
};

const SECTION_ROUTE_RE = /^\/pengaturan\/.+$/;

const navFromPath = (pathname: string): NavKey => {
  if (pathname === "/") {
    return "home";
  }
  if (pathname === "/transactions") {
    return "transactions";
  }
  if (pathname === "/inventory") {
    return "inventory";
  }
  if (pathname.startsWith("/pengaturan")) {
    return "settings";
  }
  return "home";
};

/* ── AppShell ────────────────────────────────────────────────────── */

export const AppShell = (props: RouteSectionProps) => {
  const pathname = () => props.location.pathname;
  const isPortrait = useOrientation();
  const isWide = useIsWide();
  const zone = (): Zone => {
    const base = ZONE_MAP[pathname()] ?? "shell";
    // Pengaturan section sub-pages are full-screen drill-in screens below lg
    if (base === "shell" && !isWide() && SECTION_ROUTE_RE.test(pathname())) {
      return "flow";
    }
    return base;
  };
  const isShell = () => zone() === "shell";
  const activeNav = () => navFromPath(pathname());

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
          isShell() && "mt-[54px] h-[calc(100vh-54px)] lg:ml-[80px]",
          !isShell() && "h-screen"
        )}
        onPointerDown={closeSidebar}
      >
        <Ssgoi config={config()}>{props.children}</Ssgoi>
      </main>

      {/* ── Shell-only chrome ── */}
      <Show when={isShell() && !pathname().startsWith("/pengaturan")}>
        <Fab />
      </Show>
      <Show when={isShell()}>
        <NotchNav active={activeNav()} />
      </Show>
    </div>
  );
};
