import type { RouteSectionProps } from "@solidjs/router";
import { Ssgoi } from "@ssgoi/solid";
import { createSignal, onCleanup, Show } from "solid-js";
import { rootConfig } from "~/lib/ssgoi-config";
import { cn } from "~/lib/utils";
import { Fab } from "./fab";
import { MagicNav } from "./magic-nav";
import type { NavKey } from "./sidebar";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/* ── Zone detection ──────────────────────────────────────────────── */

type Zone = "shell" | "flow" | "auth";

const ZONE_MAP: Record<string, Zone> = {
  "/": "shell",
  "/transactions": "shell",
  "/pengaturan": "shell",
  "/transaction-new": "flow",
  "/payment": "flow",
  "/receipt": "flow",
  "/login": "auth",
  "/register": "auth",
  "/pin": "auth",
};

const navFromPath = (pathname: string): NavKey => {
  if (pathname === "/") {
    return "home";
  }
  if (pathname === "/transactions") {
    return "transactions";
  }
  if (pathname === "/pengaturan") {
    return "settings";
  }
  return "home";
};

/* ── AppShell ────────────────────────────────────────────────────── */

export const AppShell = (props: RouteSectionProps) => {
  const pathname = () => props.location.pathname;
  const zone = (): Zone => ZONE_MAP[pathname()] ?? "shell";
  const isShell = () => zone() === "shell";
  const activeNav = () => navFromPath(pathname());

  /* ── Expandable sidebar ── */
  const [expanded, setExpanded] = createSignal(false);
  let expandTimer: ReturnType<typeof setTimeout> | undefined;

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
    <div class="bg-cream dark:bg-surface">
      <Sidebar
        activeNav={activeNav()}
        expanded={expanded()}
        isShell={isShell()}
        onClose={closeSidebar}
        onTouch={touchSidebar}
      />

      <TopBar
        expanded={expanded()}
        isShell={isShell()}
        onClose={closeSidebar}
      />

      {/* ── Main content area ── margins snap, SSGOI masks the change */}
      <main
        class={cn(
          "relative flex flex-1 flex-col overflow-hidden transition-[margin-left] duration-300 dark:bg-surface",
          isShell() && "mt-[54px] h-[calc(100vh-54px)]",
          isShell() && expanded() ? "ml-[200px]" : "ml-[80px]",
          !isShell() && "ml-0 h-screen",
          "max-[900px]:ml-0"
        )}
        onPointerDown={closeSidebar}
      >
        <Ssgoi config={rootConfig}>{props.children}</Ssgoi>
      </main>

      {/* ── Shell-only chrome ── */}
      <Show when={isShell()}>
        <Fab />
        <MagicNav active={activeNav()} />
      </Show>
    </div>
  );
};
