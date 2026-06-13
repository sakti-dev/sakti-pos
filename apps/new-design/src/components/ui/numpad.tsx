import { For } from "solid-js";
import { cn } from "~/lib/utils";

interface NumpadProps {
  readonly class?: string;
  readonly onKey: (key: string) => void;
}

const keys = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: "000", label: "000" },
  { key: "0", label: "0" },
  { key: "back", label: "⌫" },
] as const;

export const Numpad = (props: NumpadProps) => (
  <div class={cn("grid grid-cols-3 gap-2", props.class)}>
    <For each={keys}>
      {(k) => (
        <button
          aria-label={k.key === "back" ? "Hapus digit" : k.label}
          class={cn(
            "flex min-h-[48px] select-none items-center justify-center rounded-[6px] border-[1.5px] border-border bg-card font-sans font-semibold text-[20px] text-foreground transition-[background,border-color,transform] duration-100 hover:border-primary/10 hover:bg-muted active:scale-[0.96] active:border-primary/20 active:bg-primary/5 dark:active:border-primary",
            k.key === "back" &&
              "bg-muted text-muted-foreground active:bg-destructive/10 active:text-destructive",
            k.key === "000" && "text-[16px] tracking-[0.02em]",
            k.key === "0" && "text-[22px]"
          )}
          onClick={() => props.onKey(k.key)}
          onPointerDown={(e) => e.preventDefault()}
          type="button"
        >
          {k.label}
        </button>
      )}
    </For>
  </div>
);
