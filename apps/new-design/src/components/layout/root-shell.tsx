import type { RouteSectionProps } from "@solidjs/router";
import { A } from "@solidjs/router";
import { Ssgoi } from "@ssgoi/solid";
import { motion } from "motion-solidjs";
import { For, Show } from "solid-js";
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

  return (
    <div class="bg-cream dark:bg-surface">
      {/* ── Sidebar ── */}
      <motion.nav
        animate={{
          x: isShell() ? 0 : -80,
          opacity: isShell() ? 1 : 0,
          pointerEvents: isShell() ? "auto" : "none",
        }}
        class="fixed top-0 left-0 z-[100] flex h-screen w-[var(--sidebar-w,80px)] min-w-[var(--sidebar-w,80px)] flex-col items-center border-border border-r bg-surface py-5 pb-4 max-[900px]:hidden dark:border-[rgba(255,255,255,0.06)] dark:bg-[#141414]"
        initial={{ x: -80, opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      >
        {/* Brand */}
        <div class="mb-7 grid h-12 w-12 place-items-center rounded-[14px]">
          <img
            alt="Nata POS"
            class="h-full w-full object-contain"
            src="/logo.png"
          />
        </div>

        {/* Nav items */}
        <div class="flex flex-1 flex-col items-center justify-center gap-7">
          <For each={navItems}>
            {(item) => {
              const isActive = () => activeNav() === item.key;
              return (
                <Button
                  activeClass="!bg-accent-2 !text-primary [&>svg]:!text-primary [&>span]:font-bold [&>span]:tracking-[0.07em] hover:!bg-accent-2 hover:!text-primary dark:!bg-[rgba(60,208,112,0.15)] dark:!text-[#3cd070] dark:hover:!bg-[rgba(60,208,112,0.15)] dark:hover:!text-[#3cd070]"
                  aria-label={item.label}
                  as={A}
                  class="flex w-[58px] flex-col items-center gap-[7px] rounded-[14px] px-1.5 py-2.5 [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:scale-108"
                  end={item.key === "home"}
                  href={item.href}
                  look={isActive() ? "soft" : "ghost"}
                  size="none"
                  tone="primary"
                >
                  <item.Icon class="h-[22px] w-[22px] shrink-0" />
                  <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em]">
                    {item.label}
                  </span>
                </Button>
              );
            }}
          </For>
        </div>

        {/* Logout */}
        <Button
          aria-label="Keluar"
          class="mb-1 flex w-[58px] flex-col items-center gap-[7px] rounded-[14px] px-1.5 py-2.5 [&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:hover:translate-x-0.5"
          look="ghost"
          size="none"
          tone="destructive"
          type="button"
        >
          <LogoutIcon class="h-[22px] w-[22px] shrink-0" />
          <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em]">
            Keluar
          </span>
        </Button>
      </motion.nav>

      {/* ── TopBar ── */}
      <motion.header
        animate={{
          x: isShell() ? 0 : -80,
          y: isShell() ? 0 : -20,
          opacity: isShell() ? 1 : 0,
          pointerEvents: isShell() ? "auto" : "none",
        }}
        class="fixed top-0 right-0 left-[var(--sidebar-w,80px)] z-[99] flex h-[54px] shrink-0 items-center justify-between border-border border-b bg-surface px-7 max-[900px]:left-0 max-[900px]:px-[18px] dark:border-[rgba(255,255,255,0.06)] dark:bg-[#141414]"
        initial={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      >
        <TopBar />
      </motion.header>

      {/* ── Main content area ── margins snap, SSGOI masks the change */}
      <main
        class={cn(
          "relative flex flex-1 flex-col overflow-hidden dark:bg-surface",
          isShell() &&
            "mt-[54px] ml-[var(--sidebar-w,80px)] h-[calc(100vh-54px)] max-[900px]:ml-0",
          !isShell() && "h-screen"
        )}
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

import { createSignal, onCleanup } from "solid-js";

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
