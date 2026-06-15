import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { ArrowLeftIcon } from "~/assets";

interface ScreenHeaderProps {
  readonly backHref: string;
  readonly backLabel?: string;
  readonly right?: JSX.Element;
  readonly title: string;
}

export const ScreenHeader = (props: ScreenHeaderProps) => (
  <header class="flex h-header shrink-0 items-center justify-between border-border border-b bg-card px-3.5 lg:px-5">
    <div class="flex items-center gap-3.5">
      <A
        aria-label={props.backLabel ?? "Kembali"}
        class="grid h-[38px] w-[38px] place-items-center rounded-xl border border-border bg-card text-foreground transition-colors duration-150 hover:border-primary/20 hover:bg-primary/5"
        href={props.backHref}
      >
        <ArrowLeftIcon class="size-5" />
      </A>
      <span class="font-bold font-display text-[17px] text-foreground tracking-snug">
        {props.title}
      </span>
    </div>

    <div class="flex items-center gap-2.5">
      <Show when={props.right}>{props.right}</Show>
    </div>
  </header>
);
