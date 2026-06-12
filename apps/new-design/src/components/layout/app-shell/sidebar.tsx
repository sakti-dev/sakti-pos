import { useColorMode } from "@kobalte/core";
import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import {
  FileIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "~/assets";

export type NavKey = "home" | "transactions" | "settings";

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

export const Sidebar = () => {
  const { colorMode, setColorMode } = useColorMode();

  return (
    <nav class="fixed top-0 left-0 z-[100] flex h-screen w-[var(--sidebar-w,80px)] min-w-[var(--sidebar-w,80px)] flex-col items-center border-border border-r bg-surface py-5 pb-4 max-[900px]:hidden dark:border-[rgba(255,255,255,0.06)] dark:bg-[#141414]">
      {/* Brand */}
      <div class="mb-7 grid h-12 w-12 place-items-center rounded-[14px]">
        <img
          alt="Nata POS"
          class="h-full w-full object-contain"
          height={48}
          src="/logo.png"
          width={48}
        />
      </div>

      {/* Nav items */}
      <div class="flex flex-1 flex-col items-center justify-center gap-7">
        <For each={navItems}>
          {(item) => (
            <A
              activeClass="!bg-accent-2 !text-primary [&>svg]:!text-primary [&>span]:font-bold [&>span]:tracking-[0.07em] hover:!bg-accent-2 hover:!text-primary dark:!bg-[rgba(60,208,112,0.15)] dark:!text-[#3cd070] dark:hover:!bg-[rgba(60,208,112,0.15)] dark:hover:!text-[#3cd070]"
              aria-label={item.label}
              class="flex w-[58px] flex-col items-center gap-[7px] rounded-[14px] px-1.5 py-2.5 text-text-muted transition-[background,color,box-shadow] duration-150 hover:bg-[rgba(9,73,51,0.04)] hover:text-text dark:text-[rgba(60,208,112,0.55)] dark:hover:bg-[rgba(60,208,112,0.10)] dark:hover:text-[rgba(60,208,112,0.85)] [&>svg]:transition-transform [&>svg]:duration-150 hover:[&>svg]:scale-108"
              end={item.key === "home"}
              href={item.href}
            >
              <item.Icon class="h-[22px] w-[22px] shrink-0" />
              <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em]">
                {item.label}
              </span>
            </A>
          )}
        </For>
      </div>

      {/* Theme toggle */}
      <button
        aria-label="Ganti tema"
        class="mb-1 flex w-[58px] flex-col items-center gap-[7px] rounded-[14px] px-1.5 py-2.5 text-text-muted transition-[background,color] duration-150 hover:bg-[rgba(60,208,112,0.06)] hover:text-text dark:text-[#3cd070] dark:hover:bg-[rgba(60,208,112,0.10)] [&>svg]:transition-transform [&>svg]:duration-300 [&>svg]:hover:rotate-20"
        onClick={() => setColorMode(colorMode() === "dark" ? "light" : "dark")}
        type="button"
      >
        <Show
          fallback={<MoonIcon class="h-[22px] w-[22px] shrink-0" />}
          when={colorMode() !== "dark"}
        >
          <SunIcon class="h-[22px] w-[22px] shrink-0" />
        </Show>
        <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em]">
          {colorMode() === "dark" ? "Terang" : "Gelap"}
        </span>
      </button>

      {/* Logout */}
      <button
        aria-label="Keluar"
        class="mb-1 flex w-[58px] flex-col items-center gap-[7px] rounded-[14px] px-1.5 py-2.5 text-[#b05050] transition-[background,color] duration-150 hover:bg-[rgba(176,80,80,0.08)] hover:text-[#8b3030] dark:text-[#d47070] dark:hover:bg-[rgba(212,112,112,0.10)] dark:hover:text-[#e08080] [&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:hover:translate-x-0.5"
        type="button"
      >
        <LogoutIcon class="h-[22px] w-[22px] shrink-0" />
        <span class="whitespace-nowrap font-semibold text-[9px] uppercase leading-none tracking-[0.06em]">
          Keluar
        </span>
      </button>
    </nav>
  );
};
