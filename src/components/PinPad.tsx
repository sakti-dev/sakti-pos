import { createSignal, For } from "solid-js";
import { clsx } from "clsx";

interface PinPadProps {
  onSubmit: (pin: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

const KEYS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
  { value: "del", label: "⌫" },
  { value: "0", label: "0" },
  { value: "ok", label: "OK" },
];

export default function PinPad(props: PinPadProps) {
  const [pin, setPin] = createSignal("");
  const maxLen = () => props.maxLength ?? 6;
  const isComplete = () => pin().length >= maxLen();
  const dots = () => Array.from({ length: maxLen() }, (_, i) => i);

  const handleKey = (key: string) => {
    if (props.disabled) return;
    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "ok") {
      if (isComplete()) props.onSubmit(pin());
      return;
    }
    if (pin().length < maxLen()) {
      setPin((p) => p + key);
    }
  };

  return (
    <div class="flex flex-col items-center gap-4">
      <div class="flex gap-3 justify-center">
        <For each={dots()}>
          {(i) => (
            <div
              class={clsx(
                "w-4 h-4 rounded-full border-2 transition-all duration-150",
                i < pin().length
                  ? "bg-primary border-primary scale-110"
                  : "bg-transparent border-muted-foreground/30",
              )}
            />
          )}
        </For>
      </div>

      <div class="grid grid-cols-3 gap-2 w-64">
        <For each={KEYS}>
          {(key) => (
            <button
              type="button"
              onClick={() => handleKey(key.value)}
              disabled={props.disabled}
              class={clsx(
                "h-14 rounded-xl text-xl font-medium transition-colors",
                key.value === "ok"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
                props.disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {key.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
