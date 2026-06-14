import { For } from "solid-js";
import { DeleteIcon } from "~/assets";

interface NumpadProps {
  readonly disabled: boolean;
  readonly onBackspace: () => void;
  readonly onDigit: (digit: string) => void;
}

export function Numpad(props: NumpadProps) {
  return (
    <fieldset
      aria-label="Numpad"
      class="grid w-full max-w-[260px] grid-cols-3 gap-2 border-none p-0 sm:max-w-[280px] sm:gap-2.5"
    >
      <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "back"]}>
        {(key) => {
          if (key === null) {
            return <div class="h-14 sm:h-[60px]" />;
          }
          if (key === "back") {
            return (
              <button
                aria-label="Hapus"
                class="flex h-14 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-none transition-[background,transform] duration-150 hover:border-destructive/20 hover:bg-destructive/5 hover:text-destructive active:scale-[0.94] active:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40 sm:h-[60px]"
                disabled={props.disabled}
                onClick={props.onBackspace}
                type="button"
              >
                <DeleteIcon class="h-[22px] w-[22px]" />
              </button>
            );
          }
          return (
            <button
              aria-label={String(key)}
              class="grid h-14 place-items-center rounded-lg border-none bg-card font-display font-semibold text-foreground text-heading-sm text-subheading shadow-card transition-[background,color,transform,box-shadow] duration-150 hover:bg-accent-soft hover:text-primary hover:shadow-card-hover active:scale-[0.94] active:bg-accent/10 disabled:pointer-events-none disabled:opacity-40 sm:h-[60px]"
              disabled={props.disabled}
              onClick={() => props.onDigit(String(key))}
              type="button"
            >
              {key}
            </button>
          );
        }}
      </For>
    </fieldset>
  );
}
