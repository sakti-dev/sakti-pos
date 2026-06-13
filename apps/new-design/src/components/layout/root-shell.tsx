import type { RouteSectionProps } from "@solidjs/router";
import { A } from "@solidjs/router";
import { Ssgoi } from "@ssgoi/solid";
import { motion } from "motion-solidjs";
import { createSignal, For, onCleanup, Show } from "solid-js";
import {
  BellIcon,
  CloudIcon,
  FileIcon,
  HomeIcon,
  LogoutIcon,
  SettingsIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
import { rootConfig } from "~/lib/ssgoi-config";
import { cn } from "~/lib/utils";
import { Fab } from "./app-shell/fab";
import { MagicNav } from "./app-shell/magic-nav";

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

export type NavKey = "home" | "transactions" | "settings";

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

const navItems: readonly {
  key: NavKey;
  Icon: typeof HomeIcon;
  label: string;
  href: string;
}[] = [
  { key: "home", Icon: HomeIcon, label: "Home", href: "/" },
  {
    key: "transactions",
    Icon: FileIcon,
    label: "Transaksi",
    href: "/transactions",
  },
  {
    key: "settings",
    Icon: SettingsIcon,
    label: "Pengaturan",
    href: "/pengaturan",
  },
] as const;

/* ── RootShell ───────────────────────────────────────────────────── */

export const RootShell = (props: RouteSectionProps) => {
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
      <motion.nav
        animate={{
          x: isShell() ? 0 : -80,
          opacity: isShell() ? 1 : 0,
          pointerEvents: isShell() ? "auto" : "none",
          width: isShell() && expanded() ? 200 : 80,
        }}
        class="fixed top-0 left-0 z-[100] flex h-screen flex-col overflow-hidden border-border border-r bg-surface px-3 py-5 pb-4 max-[900px]:hidden dark:border-[rgba(255,255,255,0.06)] dark:bg-[#141414]"
        initial={{ x: -80, opacity: 0, width: 80 }}
        onClick={touchSidebar}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      >
        {/* Brand */}
        <div class="mb-7 flex h-12 shrink-0 items-center gap-2.5">
          <div class="grid h-12 w-12 shrink-0 place-items-center rounded-[14px]">
            <img
              alt="Nata POS"
              class="h-full w-full object-contain"
              src="/logo.png"
            />
          </div>
          <Show when={expanded()}>
            <span class="whitespace-nowrap font-bold text-[20px] text-text-primary tracking-tight">
              Nata POS
            </span>
          </Show>
        </div>
        <div class="flex flex-1 flex-col justify-center gap-2">
          <For each={navItems}>
            {(item) => {
              const isActive = () => activeNav() === item.key;
              return (
                <Button
                  activeClass="[&>svg]:!text-[#059669] [&>span]:font-bold [&>span]:tracking-[0.07em] dark:[&>svg]:!text-[#34d399]"
                  aria-label={item.label}
                  as={A}
                  class={cn(
                    "flex h-[58px] items-center justify-start gap-[7px] rounded-[14px] transition-[width,padding] duration-300 [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:scale-108",
                    expanded() ? "w-full px-3" : "w-[52px] px-[15px]"
                  )}
                  end={item.key === "home"}
                  href={item.href}
                  look={isActive() ? "soft" : "ghost"}
                  size="none"
                  tone="primary"
                >
                  <item.Icon class="h-[22px] w-[22px] shrink-0" />
                  <Show when={expanded()}>
                    <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em]">
                      {item.label}
                    </span>
                  </Show>
                </Button>
              );
            }}
          </For>
        </div>

        {/* Logout */}
        <Button
          aria-label="Keluar"
          class={cn(
            "flex h-[58px] items-center justify-start gap-[7px] rounded-[14px] transition-[width,padding] duration-300 [&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:hover:translate-x-0.5",
            expanded() ? "mb-1 w-full px-3" : "mb-1 w-[52px] px-[15px]"
          )}
          look="ghost"
          size="none"
          tone="destructive"
          type="button"
        >
          <LogoutIcon class="h-[22px] w-[22px] shrink-0" />
          <Show when={expanded()}>
            <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em]">
              Keluar
            </span>
          </Show>
        </Button>
      </motion.nav>

      {/* ── TopBar ── */}
      <motion.header
        animate={{
          x: isShell() ? 0 : -80,
          opacity: isShell() ? 1 : 0,
          pointerEvents: isShell() ? "auto" : "none",
        }}
        class={cn(
          "fixed top-0 right-0 z-[99] flex h-[54px] shrink-0 items-center justify-between border-border border-b bg-surface px-7 transition-[left] duration-300 max-[900px]:left-0 max-[900px]:px-[18px] dark:border-[rgba(255,255,255,0.06)] dark:bg-[#141414]",
          isShell() && (expanded() ? "left-[200px]" : "left-[80px]"),
          !isShell() && "left-0"
        )}
        initial={{ x: -80, opacity: 0 }}
        onPointerDown={closeSidebar}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      >
        <TopBar />
      </motion.header>

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

/* ── TopBar content (inline) ─────────────────────────────────────── */

function formatClock(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const TopBar = () => {
  const [clock, setClock] = createSignal(formatClock());
  const [syncing, setSyncing] = createSignal(false);

  const timer = setInterval(() => setClock(formatClock()), 1000);
  onCleanup(() => clearInterval(timer));

  const handleSync = () => {
    if (syncing()) {
      return;
    }
    setSyncing(true);
    setTimeout(() => setSyncing(false), 1800);
  };

  return (
    <>
      <div class="flex items-center gap-3">
        <button
          aria-label="Sinkronisasi"
          class="inline-flex items-center gap-[7px] rounded-pill border border-[rgba(60,208,112,0.18)] bg-[rgba(60,208,112,0.12)] px-3.5 py-1.5 font-medium text-[#3cd070] text-[13px] tracking-[0.01em] transition-[background,border-color,transform] duration-200 hover:border-[rgba(60,208,112,0.35)] hover:bg-[rgba(60,208,112,0.20)] active:scale-[0.96] dark:border-[rgba(60,208,112,0.25)] dark:bg-[rgba(60,208,112,0.12)] dark:text-[#3cd070] dark:hover:border-[rgba(60,208,112,0.40)] dark:hover:bg-[rgba(60,208,112,0.22)]"
          onClick={handleSync}
          type="button"
        >
          <span class="relative h-4 w-4 shrink-0">
            <CloudIcon class={syncing() ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span class="absolute -right-0.5 -bottom-px h-[7px] w-[7px] animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full border-[#094933] border-[1.5px] bg-[#3cd070] dark:border-[#073d2b] dark:bg-[#3cd070]" />
          </span>
          {syncing() ? "Sinkronisasi\u2026" : "Online"}
        </button>

        <span class="font-medium text-[14px] text-text-secondary tabular-nums">
          {clock()}
          <span class="ml-1 text-[11px] text-text-muted tracking-[0.02em]">
            WIB
          </span>
        </span>
      </div>

      <button
        aria-label="Notifikasi"
        class="grid h-[38px] w-[38px] place-items-center rounded-[8px] border border-border bg-surface text-text-secondary transition-[background,border-color,box-shadow] duration-150 hover:border-[rgba(9,73,51,0.15)] hover:bg-surface-gray hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.10)] dark:bg-[#1a1a1a] dark:text-[#a0a0a0] dark:hover:border-[rgba(255,255,255,0.12)] dark:hover:bg-[#222] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.30)]"
        type="button"
      >
        <BellIcon class="h-[18px] w-[18px]" />
      </button>
    </>
  );
};
