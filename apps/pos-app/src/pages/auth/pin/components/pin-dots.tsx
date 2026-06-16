import { For } from "solid-js";
import { MAX_PIN } from "../types";

interface PinDotsProps {
  readonly hasError: boolean;
  readonly length: number;
}

export function PinDots(props: PinDotsProps) {
  const dotClass = (i: number) => {
    if (props.hasError && props.length > 0) {
      return "h-4 w-4 animate-shake rounded-full border-2 border-danger bg-danger ring-4 ring-danger/10";
    }
    if (i < props.length) {
      return "h-4 w-4 scale-125 rounded-full border-2 border-primary bg-primary ring-4 ring-primary/10 dark:border-accent dark:bg-accent";
    }
    return "h-[14px] w-[14px] rounded-full border-2 border-border bg-transparent transition duration-200 sm:h-4 sm:w-4";
  };

  return (
    <fieldset
      aria-label="PIN input"
      class="flex justify-center gap-[14px] border-none px-0 py-2 sm:gap-[18px]"
    >
      <For each={Array.from({ length: MAX_PIN })}>
        {(_, i) => (
          <div
            class={dotClass(i())}
            style={{
              "transition-timing-function": "cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        )}
      </For>
    </fieldset>
  );
}
