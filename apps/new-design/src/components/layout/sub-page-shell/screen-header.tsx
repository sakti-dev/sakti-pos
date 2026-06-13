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
    <header class="flex h-14 shrink-0 items-center justify-between border-border border-b bg-card px-5 max-[900px]:px-3.5">
      <div class="flex items-center gap-3.5">
        <A
          aria-label={props.backLabel ?? "Kembali"}
          class="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border bg-card text-foreground transition-[background,border-color] duration-150 hover:border-primary/20 hover:bg-primary/5"
          href={props.backHref}
        >
          <ArrowLeftIcon class="h-[18px] w-[18px]" />
        </A>
        <span class="font-bold text-[17px] text-foreground tracking-[-0.01em]">
          {props.title}
        </span>
      </div>

      <div class="flex items-center gap-2.5">
        <Show when={props.right}>{props.right}</Show>

        <button
          aria-label="Ganti tema"
          class="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border bg-card text-faint-foreground transition-[background,color,border-color] duration-150 hover:border-primary/15 hover:bg-primary/5 hover:text-foreground [&>svg]:transition-transform [&>svg]:duration-300 [&>svg]:hover:rotate-20"
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
