import { createEffect, createSignal, Show } from "solid-js";
import { cn } from "~/lib/utils";

interface QuantityStepperProps {
  readonly ariaLabel?: string;
  readonly class?: string;
  readonly editable?: boolean;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
  readonly onInput?: (value: number) => void;
  readonly placeholder?: string;
  readonly value?: number;
}

export const QuantityStepper = (props: QuantityStepperProps) => {
  const [text, setText] = createSignal(
    props.value === undefined ? "" : String(props.value)
  );

  createEffect(() => {
    setText(props.value === undefined ? "" : String(props.value));
  });

  const commit = (raw: string) => {
    const n = Number.parseFloat(raw);
    if (!Number.isNaN(n) && n >= 0) {
      props.onInput?.(n);
    } else {
      setText(props.value === undefined ? "" : String(props.value));
    }
  };

  return (
    <div
      class={cn(
        "flex w-full shrink-0 items-center overflow-hidden rounded-md border border-border",
        props.class
      )}
    >
      <button
        aria-label={`Kurangi ${props.ariaLabel ?? "jumlah"}`}
        class="grid h-9 w-7 shrink-0 place-items-center bg-card text-foreground transition-colors duration-100 hover:bg-muted active:bg-primary/5"
        onClick={props.onDecrement}
        type="button"
      >
        −
      </button>
      <Show
        fallback={
          <span class="grid h-9 min-w-0 flex-1 place-items-center border-border border-x bg-muted px-1 text-center font-semibold text-[13px] text-faint-foreground tabular-nums">
            {props.value === undefined
              ? (props.placeholder ?? "")
              : String(props.value)}
          </span>
        }
        when={props.editable}
      >
        <input
          aria-label={props.ariaLabel}
          class="h-9 min-w-0 flex-1 border-border border-x bg-muted text-center font-semibold text-[13px] text-foreground tabular-nums outline-none focus:bg-primary/5"
          onBlur={(e) => commit(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.select()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder={props.placeholder}
          type="number"
          value={text()}
        />
      </Show>
      <button
        aria-label={`Tambah ${props.ariaLabel ?? "jumlah"}`}
        class="grid h-9 w-7 shrink-0 place-items-center bg-card text-foreground transition-colors duration-100 hover:bg-muted active:bg-primary/5"
        onClick={props.onIncrement}
        type="button"
      >
        +
      </button>
    </div>
  );
};
