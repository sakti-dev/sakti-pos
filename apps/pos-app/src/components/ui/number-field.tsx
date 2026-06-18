/* biome-ignore-all lint/a11y/noLabelWithoutControl: compound component label */
import { cva } from "class-variance-authority";
import { createEffect, type JSX, on, splitProps } from "solid-js";
import { cn } from "~/lib/utils";

const formatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

const formatNum = (n: number): string => (n > 0 ? formatter.format(n) : "");

/** Count digit chars before a cursor position in the display string. */
const digitsBefore = (str: string, pos: number): number => {
  let count = 0;
  for (let i = 0; i < pos && i < str.length; i++) {
    if (str[i] >= "0" && str[i] <= "9") {
      count++;
    }
  }
  return count;
};

/** Map a digit count → cursor position in formatted text. */
const cursorFromDigits = (formatted: string, digitCount: number): number => {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] >= "0" && formatted[i] <= "9") {
      count++;
      if (count === digitCount) {
        return i + 1;
      }
    }
  }
  return formatted.length;
};

interface NumberFieldProps {
  children: JSX.Element;
  class?: string;
}

/** Wrapper — mirrors TextField's flex-col gap layout. */
export const NumberField = (props: NumberFieldProps) => (
  <div class={cn("flex flex-col gap-1", props.class)}>{props.children}</div>
);

interface NumberFieldInputProps {
  ariaLabel?: string;
  autofocus?: boolean;
  class?: string;
  disabled?: boolean;
  id?: string;
  onChange?: (value: number) => void;
  placeholder?: string;
  value?: number;
}

export const NumberFieldInput = (props: NumberFieldInputProps) => {
  let ref: HTMLInputElement | undefined;

  const handleInput = (e: InputEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    const beforeDigits = digitsBefore(el.value, el.selectionStart ?? 0);
    const raw = el.value.replace(/\D/g, "");
    const num = raw ? Number.parseInt(raw, 10) : 0;
    const formatted = formatNum(num);

    if (el.value !== formatted) {
      el.value = formatted;
    }

    const pos = cursorFromDigits(formatted, beforeDigits);
    el.setSelectionRange(pos, pos);

    props.onChange?.(num);
  };

  // Anchor dependency on props.value UNCONDITIONALLY via on(), so early returns
  // inside the handler can never tombstone the effect out of the reactive graph.
  createEffect(
    on(
      () => props.value,
      (value) => {
        if (!ref) {
          return;
        }
        if (document.activeElement === ref) {
          return;
        }
        const formatted = formatNum(value ?? 0);
        if (ref.value !== formatted) {
          ref.value = formatted;
          ref.setSelectionRange(formatted.length, formatted.length);
        }
      }
    )
  );

  return (
    <input
      aria-label={props.ariaLabel}
      autocomplete="off"
      autofocus={props.autofocus}
      class={cn(
        "h-12 w-full rounded-sm border-2 border-input bg-background px-3.5 font-sans text-body-sm text-foreground outline-none transition-colors transition-shadow duration-standard ease-standard placeholder:text-muted-foreground",
        "focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10",
        "dark:focus:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        props.class
      )}
      disabled={props.disabled}
      id={props.id}
      inputMode="numeric"
      onInput={handleInput}
      placeholder={props.placeholder}
      ref={(el) => {
        ref = el;
      }}
      type="text"
    />
  );
};

const labelVariants = cva(
  "font-medium text-body-sm text-foreground leading-none tracking-normal",
  {
    variants: {
      variant: {
        label: "",
        description: "font-normal text-muted-foreground",
      },
    },
    defaultVariants: { variant: "label" },
  }
);

interface NumberFieldLabelProps {
  children: JSX.Element;
  class?: string;
}

export const NumberFieldLabel = (props: NumberFieldLabelProps) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <label class={cn(labelVariants(), local.class)} {...others}>
      {local.children}
    </label>
  );
};
