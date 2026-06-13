import { A } from "@solidjs/router";
import { For } from "solid-js";
import { FileIcon, HomeIcon, PlusIcon, SettingsIcon } from "~/assets";
import { cn } from "~/lib/utils";
import type { NavKey } from "./sidebar";

interface MagicNavProps {
  readonly active: NavKey;
}

const tabs = [
  { key: "home" as NavKey, Icon: HomeIcon, label: "Home", href: "/" },
  {
    key: "transactions" as NavKey,
    Icon: FileIcon,
    label: "Transaksi",
    href: "/transactions",
  },
  {
    key: "settings" as NavKey,
    Icon: SettingsIcon,
    label: "Pengaturan",
    href: "/pengaturan",
  },
] as const;

export const MagicNav = (props: MagicNavProps) => {
  const activeIndex = () => tabs.findIndex((t) => t.key === props.active);

  return (
    <nav
      aria-label="Mobile navigation"
      class="fixed right-0 bottom-0 left-0 z-[100] hidden h-[75px] max-[900px]:block"
    >
      <div class="relative h-[75px] w-full bg-card shadow-card">
        <ul class="m-0 flex h-[75px] w-full list-none p-0">
          <For each={tabs}>
            {(tab) => {
              const isActive = () => props.active === tab.key;
              return (
                <li
                  class={cn(
                    "relative z-[1] h-[75px] flex-1",
                    isActive() && "active"
                  )}
                >
                  <A
                    class="relative flex h-full w-full cursor-pointer flex-col items-center justify-center no-underline"
                    href={tab.href}
                  >
                    <span
                      class={cn(
                        "relative flex items-center justify-center text-faint-foreground leading-none transition-[transform,color] duration-500 [transition-timing-function:cubic-bezier(0.175,0.885,0.32,1.275)]",
                        isActive() &&
                          "translate-y-[-32px] text-primary dark:text-accent"
                      )}
                    >
                      <tab.Icon class="h-[22px] w-[22px]" />
                    </span>
                    <span
                      class={cn(
                        "absolute bottom-2 translate-y-[10px] whitespace-nowrap font-semibold text-[10px] text-foreground tracking-[0.04em] opacity-0 transition-[transform,opacity] duration-500 [transition-timing-function:cubic-bezier(0.175,0.885,0.32,1.275)] dark:text-foreground",
                        isActive() && "translate-y-0 opacity-100"
                      )}
                    >
                      {tab.label}
                    </span>
                  </A>
                </li>
              );
            }}
          </For>

          {/* Indicator bubble */}
          <div
            class="absolute top-[-28px] z-[3] flex h-[62px] w-[62px] items-center justify-center rounded-full border-[6px] border-background bg-primary shadow-card transition-[left] duration-500 [transition-timing-function:cubic-bezier(0.175,0.885,0.32,1.275)]"
            style={{
              left: `calc(100% / 3 * ${activeIndex()} + (100% / 3 - 62px) / 2)`,
            }}
          >
            {/* Curved cutout pseudo-elements via box-shadow trick */}
            <span class="pointer-events-none absolute top-[48px] left-[-22px] h-5 w-5 rounded-tr-[20px] bg-transparent shadow-[1px_-10px_0_0_var(--color-card)]" />
            <span class="pointer-events-none absolute top-[48px] right-[-22px] h-5 w-5 rounded-tl-[20px] bg-transparent shadow-[-1px_-10px_0_0_var(--color-card)]" />
            <PlusIcon class="h-6 w-6 text-primary-foreground" />
          </div>
        </ul>
      </div>
    </nav>
  );
};
