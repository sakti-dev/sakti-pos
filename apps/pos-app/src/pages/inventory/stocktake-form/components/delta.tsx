import { cn } from "~/lib/utils";

/* ── Delta color/format helpers ── */

export function diffColor(diff: number): string {
  if (diff < 0) {
    return "text-status-danger";
  }
  if (diff > 0) {
    return "text-status-success";
  }
  return "text-faint-foreground";
}

export function diffBadgeColor(diff: number): string {
  if (diff < 0) {
    return "bg-status-danger/10 text-status-danger";
  }
  if (diff > 0) {
    return "bg-status-success/10 text-status-success";
  }
  return "text-faint-foreground";
}

export function formatCount(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

export function formatDelta(diff: number, unit: string): string {
  if (diff === 0) {
    return "—";
  }
  return `${diff > 0 ? "+" : ""}${formatCount(diff)} ${unit}`;
}

/* ── Delta display ── */

/** Pill-style delta, used in the desktop table's Selisih column. */
export function DeltaBadge(props: { diff: number; unit: string }) {
  return (
    <div class="flex items-center justify-center">
      <span
        class={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold text-caption-sm normal-case tabular-nums",
          diffBadgeColor(props.diff)
        )}
      >
        {formatDelta(props.diff, props.unit)}
      </span>
    </div>
  );
}

/** Inline colored delta, used in the mobile list meta line. */
export function DeltaInline(props: { diff: number; unit: string }) {
  return (
    <span class={cn("tabular-nums", diffColor(props.diff))}>
      Selisih: {formatDelta(props.diff, props.unit)}
    </span>
  );
}
