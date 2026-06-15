import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import {
  FileIcon,
  GridIcon,
  HomeIcon,
  LogoutIcon,
  SettingsIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export type NavKey = "home" | "transactions" | "katalog" | "settings";

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
    key: "katalog",
    Icon: GridIcon,
    label: "Katalog",
    href: "/katalog",
  },
  {
    key: "settings",
    Icon: SettingsIcon,
    label: "Pengaturan",
    href: "/pengaturan",
  },
] as const;

interface SidebarProps {
  readonly activeNav: NavKey;
  readonly expanded: boolean;
  readonly isShell: boolean;
  readonly onClose: () => void;
  readonly onTouch: () => void;
}

export const Sidebar = (props: SidebarProps) => {
  return (
    <div
      class={cn(
        "fixed top-0 left-0 z-[100] h-screen w-[80px] bg-card after:absolute after:top-0 after:right-0 after:bottom-0 after:z-[1] after:w-px after:bg-border after:transition-opacity after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)]",
        props.isShell ? "hidden lg:block" : "hidden",
        props.expanded ? "after:opacity-0" : "after:opacity-100"
      )}
    >
      <nav
        class={cn(
          "h-full w-[202px] flex-col border-border border-r bg-card px-3 py-5 pb-4 transition-[clip-path,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          props.expanded
            ? "shadow-2xl [clip-path:inset(0_0_0_0)]"
            : "[clip-path:inset(0_120px_0_0)]"
        )}
        onClick={props.onTouch}
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
          <Show when={props.expanded}>
            <span class="whitespace-nowrap font-bold font-display text-[20px] text-foreground tracking-tight transition-opacity duration-150">
              Nata POS
            </span>
          </Show>
        </div>
        <div class="flex flex-1 flex-col justify-center gap-2">
          <For each={navItems}>
            {(item) => {
              const isActive = () => props.activeNav === item.key;
              return (
                <Button
                  aria-label={item.label}
                  as={A}
                  class={cn(
                    "relative flex h-[58px] items-center justify-start gap-[7px] rounded-[14px] [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:scale-108",
                    props.expanded ? "w-full px-3" : "w-[52px] px-[15px]"
                  )}
                  end={item.key === "home"}
                  href={item.href}
                  look="soft"
                  size="none"
                  tone={isActive() ? "primary" : "neutral"}
                >
                  <Show when={isActive()}>
                    <span
                      aria-hidden="true"
                      class="absolute top-1/2 left-[-12px] h-6 w-[4px] -translate-y-1/2 rounded-r-full bg-accent-foreground dark:bg-accent"
                    />
                  </Show>
                  <item.Icon class="h-[22px] w-[22px] shrink-0" />
                  <Show when={props.expanded}>
                    <span class="whitespace-nowrap font-bold text-[10px] leading-none tracking-[0.06em] transition-opacity duration-150">
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
            "flex h-[58px] items-center justify-start gap-[7px] rounded-[14px] [&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:hover:translate-x-0.5",
            props.expanded ? "mb-1 w-full px-3" : "mb-1 w-[52px] px-[15px]"
          )}
          look="ghost"
          size="none"
          tone="danger"
          type="button"
        >
          <LogoutIcon class="h-[22px] w-[22px] shrink-0" />
          <Show when={props.expanded}>
            <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em] transition-opacity duration-150">
              Keluar
            </span>
          </Show>
        </Button>
      </nav>
    </div>
  );
};
