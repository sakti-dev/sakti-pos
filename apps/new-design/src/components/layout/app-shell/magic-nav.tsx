import { A } from "@solidjs/router";
import { motion } from "motion-solidjs";
import { For, Show } from "solid-js";
import { FileIcon, HomeIcon, SettingsIcon } from "~/assets";
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

/* Spring configs — physics-based, tuned for a snappy mobile nav */
const BUBBLE_SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;
const ICON_SPRING = { type: "spring", stiffness: 500, damping: 26 } as const;

export const MagicNav = (props: MagicNavProps) => {
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
                <li class="relative z-[1] h-[75px] flex-1">
                  <A
                    class="relative flex h-full w-full cursor-pointer flex-col items-center justify-center no-underline"
                    href={tab.href}
                  >
                    <motion.span
                      animate={{ y: isActive() ? -32 : 0 }}
                      class={cn(
                        "relative flex items-center justify-center text-faint-foreground leading-none transition-colors duration-300",
                        isActive() && "text-primary dark:text-accent"
                      )}
                      transition={ICON_SPRING}
                    >
                      <tab.Icon class="h-[22px] w-[22px]" />
                    </motion.span>
                    <motion.span
                      animate={{
                        y: isActive() ? 0 : 10,
                        opacity: isActive() ? 1 : 0,
                      }}
                      class="absolute bottom-2 whitespace-nowrap font-semibold text-[10px] text-foreground tracking-[0.04em] dark:text-foreground"
                      transition={ICON_SPRING}
                    >
                      {tab.label}
                    </motion.span>
                  </A>

                  {/* Indicator bubble — shared-layout animation via layoutId */}
                  <Show when={isActive()}>
                    <motion.div
                      class="absolute top-[-28px] left-1/2 z-[3] -ml-[31px] flex h-[62px] w-[62px] items-center justify-center rounded-full border-[6px] border-background bg-primary shadow-card"
                      layoutId="magic-bubble"
                      transition={BUBBLE_SPRING}
                    >
                      {/* Curved cutout pseudo-elements via box-shadow trick */}
                      <span class="pointer-events-none absolute top-[48px] left-[-22px] h-5 w-5 rounded-tr-[20px] bg-transparent shadow-[1px_-10px_0_0_var(--color-card)]" />
                      <span class="pointer-events-none absolute top-[48px] right-[-22px] h-5 w-5 rounded-tl-[20px] bg-transparent shadow-[-1px_-10px_0_0_var(--color-card)]" />
                      <tab.Icon class="h-6 w-6 text-primary-foreground" />
                    </motion.div>
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </div>
    </nav>
  );
};
