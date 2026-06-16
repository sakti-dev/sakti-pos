import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { DatePicker } from "~/components/ui/date-picker";
import {
  type DateRange,
  getMonthRange,
  getTodayRange,
  getWeekRange,
  getYearRange,
  getYesterdayRange,
  type PeriodPreset,
} from "~/lib/dashboard/period";
import { cn } from "~/lib/utils";

interface PeriodSelectorProps {
  onChange: (range: DateRange) => void;
  value: DateRange;
}

const presets: {
  label: string;
  value: PeriodPreset;
  range: () => DateRange;
}[] = [
  { label: "Hari ini", value: "today", range: getTodayRange },
  { label: "Kemarin", value: "yesterday", range: getYesterdayRange },
  { label: "Minggu ini", value: "week", range: getWeekRange },
  { label: "Bulan ini", value: "month", range: getMonthRange },
  { label: "Tahun ini", value: "year", range: getYearRange },
];

export const PeriodSelector: Component<PeriodSelectorProps> = (props) => {
  const handlePreset = (_preset: PeriodPreset, range: () => DateRange) => {
    props.onChange(range());
  };

  return (
    <div class="space-y-2">
      <div class="flex gap-2 overflow-x-auto">
        <For each={presets}>
          {(preset) => (
            <button
              class={cn(
                "shrink-0 rounded-lg border px-3 py-2 font-medium text-sm transition-colors",
                props.value.preset === preset.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:bg-accent"
              )}
              onClick={() => handlePreset(preset.value, preset.range)}
              type="button"
            >
              {preset.label}
            </button>
          )}
        </For>
        <button
          class={cn(
            "shrink-0 rounded-lg border px-3 py-2 font-medium text-sm transition-colors",
            props.value.preset === "custom"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card hover:bg-accent"
          )}
          onClick={() => props.onChange({ ...props.value, preset: "custom" })}
          type="button"
        >
          Kustom
        </button>
      </div>

      <Show when={props.value.preset === "custom"}>
        <div class="flex items-center gap-2">
          <DatePicker
            class="flex-1"
            max={props.value.dateTo}
            onChange={(val) =>
              props.onChange({
                ...props.value,
                dateFrom: val,
                preset: "custom",
              })
            }
            value={props.value.dateFrom}
          />
          <span class="shrink-0 text-muted-foreground text-sm">s/d</span>
          <DatePicker
            class="flex-1"
            min={props.value.dateFrom}
            onChange={(val) =>
              props.onChange({ ...props.value, dateTo: val, preset: "custom" })
            }
            value={props.value.dateTo}
          />
        </div>
      </Show>
    </div>
  );
};
