import { For, Show } from "solid-js";
import { cn } from "~/lib/utils";

export interface StatCardsProps {
  readonly low: number;
  readonly onLow?: () => void;
  readonly onOut?: () => void;
  readonly out: number;
  readonly total: number;
  readonly value: number; // raw rupiah; formatted inside
}

interface StatItem {
  readonly dot?: "warning" | "danger";
  readonly label: string;
  readonly onClick?: () => void;
  readonly value: string;
}

const formatJt = (n: number): string => {
  if (n >= 1_000_000) {
    return `Rp ${(n / 1_000_000).toFixed(1).replace(".0", "")} jt`;
  }
  if (n >= 1000) {
    return `Rp ${Math.round(n / 1000)}rb`;
  }
  return `Rp ${n}`;
};

const cardClass =
  "flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3 text-left";

export function StatCards(props: StatCardsProps) {
  const items = (): StatItem[] => [
    { label: "Produk", value: String(props.total) },
    {
      label: "Stok Rendah",
      value: String(props.low),
      dot: "warning",
      onClick: props.onLow,
    },
    {
      label: "Habis",
      value: String(props.out),
      dot: "danger",
      onClick: props.onOut,
    },
    { label: "Nilai Stok", value: formatJt(props.value) },
  ];

  return (
    <div class="grid grid-cols-4 gap-2">
      <For each={items()}>
        {(it) => (
          <Show
            fallback={
              <div class={cardClass}>
                <StatValue dot={it.dot} value={it.value} />
                <p class="text-caption-sm text-muted-foreground">{it.label}</p>
              </div>
            }
            when={it.onClick}
          >
            <button
              class={cn(cardClass, "transition-colors hover:border-primary/30")}
              onClick={it.onClick}
              type="button"
            >
              <StatValue dot={it.dot} value={it.value} />
              <p class="text-caption-sm text-muted-foreground">{it.label}</p>
            </button>
          </Show>
        )}
      </For>
    </div>
  );
}

function StatValue(props: { value: string; dot?: "warning" | "danger" }) {
  return (
    <div class="flex items-center gap-1.5">
      <Show when={props.dot}>
        <span
          class={cn(
            "inline-block size-1.5 rounded-full",
            props.dot === "warning" && "bg-warning",
            props.dot === "danger" && "bg-danger"
          )}
        />
      </Show>
      <span class="font-semibold text-body-sm text-foreground tabular-nums">
        {props.value}
      </span>
    </div>
  );
}
