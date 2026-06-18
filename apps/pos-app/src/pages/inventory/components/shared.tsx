import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cn } from "~/lib/utils";

const TONE_CHIP = {
  danger: "bg-status-danger text-status-danger-foreground",
  warning: "bg-status-warning text-status-warning-foreground",
  neutral: "bg-status-success text-status-success-foreground",
} as const;

export function StatCard(props: {
  dot?: "danger" | "warning";
  icon: JSX.Element;
  label: string;
  value: string;
  valueSuffix: string;
}) {
  const tone = (): "danger" | "neutral" | "warning" => {
    if (props.dot === "danger") {
      return "danger";
    }
    if (props.dot === "warning") {
      return "warning";
    }
    return "neutral";
  };

  return (
    <article class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card dark:shadow-none">
      <header class="flex items-start justify-between gap-3">
        <h4 class="pt-1.5 font-medium text-body-sm text-foreground tracking-tight">
          {props.label}
        </h4>
        <span
          class={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border",
            TONE_CHIP[tone()]
          )}
        >
          <span class="[&>*]:size-4">{props.icon}</span>
        </span>
      </header>

      <div
        class="font-display font-normal text-foreground tabular-nums leading-none"
        style={{
          "font-size": props.value === "0" ? "18px" : "20px",
          "letter-spacing": "-0.5px",
        }}
      >
        {props.value}
      </div>

      <Show when={props.valueSuffix}>
        <footer class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-[3px] font-semibold text-caption-sm text-muted-foreground tabular-nums">
            {props.valueSuffix}
          </span>
        </footer>
      </Show>
    </article>
  );
}

export function BadgeStock(props: { qty: number }) {
  const low = () => props.qty > 0 && props.qty <= 5;
  const out = () => props.qty <= 0;

  return (
    <span
      class={cn(
        "rounded-full px-2 py-0.5 font-medium text-caption-sm normal-case",
        out() && "bg-status-danger/10 text-status-danger",
        low() && "bg-status-warning/15 text-status-warning",
        !(low() || out()) && "bg-status-success/10 text-status-success"
      )}
    >
      {out() ? "Habis" : `Sisa: ${props.qty} item`}
    </span>
  );
}
