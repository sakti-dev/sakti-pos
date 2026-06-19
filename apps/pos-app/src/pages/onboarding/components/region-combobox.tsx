import { createSignal, For, Show } from "solid-js";
import { ChevronDownIcon } from "~/assets";
import { SearchBar } from "~/components/search-bar";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { filterRegions, type Region } from "~/lib/data/regions";
import { cn } from "~/lib/utils";

interface RegionComboboxProps {
  readonly class?: string;
  /** Trigger id (so an external <label for> can point at it). */
  readonly id?: string;
  /** Fired with the full region record on select. */
  readonly onSelect: (region: Region) => void;
  /** Selected region's display name (drives the trigger label). Optional. */
  readonly selectedLabel?: string;
  /** Selected subdistrict id (drives the trigger label). */
  readonly value: string;
}

const MAX_RESULTS = 40;

/**
 * Adaptive region picker for the onboarding location field.
 *
 * Mirrors {@link PickerField} — a trigger button that opens an
 * `AdaptiveDialog` (bottom sheet on mobile, centered dialog on tablet+).
 * The sheet holds a `SearchBar` plus the filtered option list. Selection
 * is gated on ≥3 typed characters per the spec.
 */
export function RegionCombobox(props: RegionComboboxProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");

  const results = () => filterRegions(query()).slice(0, MAX_RESULTS);
  const hasValue = () => props.value.length > 0;

  const reset = () => setQuery("");

  const handleSelect = (region: Region) => {
    props.onSelect(region);
    setOpen(false);
    reset();
  };

  return (
    <AdaptiveDialog
      onOpenChange={setOpen}
      open={open()}
      snapPoints={[0, 0.7, 1]}
    >
      <button
        aria-haspopup="dialog"
        class={cn(
          "flex h-12 w-full items-center justify-between rounded-sm border-2 border-input bg-background px-3.5 font-sans text-body-sm outline-none transition-colors duration-standard ease-standard",
          "hover:border-primary/50 dark:hover:border-accent/50",
          props.class
        )}
        id={props.id}
        onClick={() => setOpen(true)}
        type="button"
      >
        <span class={hasValue() ? "text-foreground" : "text-muted-foreground"}>
          {props.selectedLabel ?? "Cari kecamatan / kota…"}
        </span>
        <ChevronDownIcon class="size-4 shrink-0 text-muted-foreground" />
      </button>

      <AdaptiveDialogContent class="max-w-md">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>Cari lokasi usaha</AdaptiveDialogTitle>
          <p class="text-body-sm text-muted-foreground">
            Ketik kecamatan, kota, atau provinsi (min. 3 huruf).
          </p>
        </AdaptiveDialogHeader>

        <SearchBar
          mode="full"
          onInput={setQuery}
          placeholder="Contoh: Yogyakarta, Denpasar, Makassar…"
          value={query()}
        />

        <div class="scrollbar-none grow divide-y divide-border overflow-y-auto">
          <For each={results()}>
            {(region) => (
              <button
                class="flex w-full items-center px-3 py-3 text-left transition-colors duration-standard ease-standard hover:bg-muted"
                onClick={() => handleSelect(region)}
                type="button"
              >
                <span class="text-body-sm text-foreground leading-snug">
                  {region.name}
                </span>
              </button>
            )}
          </For>

          <Show when={query().trim().length >= 3 && results().length === 0}>
            <div class="flex items-center justify-center px-3 py-10 text-center">
              <span class="text-body-sm text-muted-foreground">
                Lokasi tidak ditemukan. Coba nama kota atau provinsi.
              </span>
            </div>
          </Show>

          <Show when={query().trim().length < 3}>
            <div class="flex items-center justify-center px-3 py-10 text-center">
              <span class="text-body-sm text-muted-foreground">
                Ketik minimal 3 huruf untuk mulai mencari.
              </span>
            </div>
          </Show>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
