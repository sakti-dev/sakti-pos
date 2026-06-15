import { createEffect, createSignal, Show } from "solid-js";
import { cn } from "~/lib/utils";

interface QuantityStepperProps {
  readonly ariaLabel?: string;
  readonly class?: string;
  readonly editable?: boolean;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
  readonly onInput?: (value: number) => void;
  readonly value: number;
}

export const QuantityStepper = (props: QuantityStepperProps) => {
  // Local text state for the editable input. Synced from value prop so
  // +/− button presses are reflected immediately, but lets the user type
  // freely (including clearing the field) without committing until blur/Enter.
  const [text, setText] = createSignal(String(props.value));

  createEffect(() => {
    setText(String(props.value));
  });

  const commit = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) {
      props.onInput?.(n);
    } else {
      setText(String(props.value));
    }
  };

  return (
    <div
      class={cn(
        "flex shrink-0 items-center overflow-hidden rounded-md border border-border",
        props.class
      )}
    >
      <button
        aria-label={`Kurangi ${props.ariaLabel ?? "jumlah"}`}
        class="grid h-9 w-9 place-items-center bg-card text-[16px] text-foreground transition-colors duration-100 hover:bg-muted active:bg-primary/5"
        onClick={props.onDecrement}
        type="button"
      >
        −
      </button>
      <Show
        fallback={
          <span class="grid h-9 w-8 place-items-center border-border border-x bg-muted font-semibold text-[13px] text-foreground tabular-nums">
            {String(props.value).padStart(2, "0")}
          </span>
        }
        when={props.editable}
      >
        <input
          aria-label={props.ariaLabel}
          class="grid h-9 w-9 place-items-center border-border border-x bg-muted text-center font-semibold text-[13px] text-foreground tabular-nums outline-none focus:bg-primary/5"
          onBlur={(e) => commit(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.select()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          type="number"
          value={text()}
        />
      </Show>
      <button
        aria-label={`Tambah ${props.ariaLabel ?? "jumlah"}`}
        class="grid h-9 w-9 place-items-center bg-card text-[16px] text-foreground transition-colors duration-100 hover:bg-muted active:bg-primary/5"
        onClick={props.onIncrement}
        type="button"
      >
        +
      </button>
    </div>
  );
};
