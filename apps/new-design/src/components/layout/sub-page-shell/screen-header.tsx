import { useColorMode } from "@kobalte/core";
import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { ArrowLeftIcon, MoonIcon, SunIcon } from "~/assets";

interface ScreenHeaderProps {
  readonly backHref: string;
  readonly backLabel?: string;
  readonly right?: JSX.Element;
  readonly title: string;
}

export const ScreenHeader = (props: ScreenHeaderProps) => {
  const { colorMode, setColorMode } = useColorMode();

  return (
    <header class="flex h-14 shrink-0 items-center justify-between border-border border-b bg-surface px-5 max-[900px]:px-3.5 dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1a1a1a]">
      <div class="flex items-center gap-3.5">
        <A
          aria-label={props.backLabel ?? "Kembali"}
          class="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border bg-surface text-text transition-[background,border-color] duration-150 hover:border-[rgba(26,51,0,0.20)] hover:bg-primary-light dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1a1a1a] dark:text-[#f0f0f0] dark:hover:border-[rgba(168,229,229,0.20)] dark:hover:bg-[rgba(168,229,229,0.08)]"
          href={props.backHref}
        >
          <ArrowLeftIcon class="h-[18px] w-[18px]" />
        </A>
        <span class="font-bold text-[17px] text-text tracking-[-0.01em] dark:text-[#f0f0f0]">
          {props.title}
        </span>
      </div>

      <div class="flex items-center gap-2.5">
        <Show when={props.right}>{props.right}</Show>

        <button
          aria-label="Ganti tema"
          class="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border bg-surface text-text-muted transition-[background,color,border-color] duration-150 hover:border-[rgba(26,51,0,0.15)] hover:bg-[rgba(168,229,229,0.08)] hover:text-text dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1a1a1a] dark:text-[#ffe95c] dark:hover:border-[rgba(255,233,92,0.20)] dark:hover:bg-[rgba(255,233,92,0.10)] [&>svg]:transition-transform [&>svg]:duration-300 [&>svg]:hover:rotate-20"
          onClick={() =>
            setColorMode(colorMode() === "dark" ? "light" : "dark")
          }
          type="button"
        >
          <Show
            fallback={<MoonIcon class="h-[18px] w-[18px]" />}
            when={colorMode() !== "dark"}
          >
            <SunIcon class="h-[18px] w-[18px]" />
          </Show>
        </button>
      </div>
    </header>
  );
};
