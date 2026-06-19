import { For, type JSX, Show } from "solid-js";
import { BagIcon, CheckIcon, UtensilsIcon } from "~/assets";
import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { cn } from "~/lib/utils";
import type { BusinessType } from "~/pages/onboarding/types";

interface StepMerchantProps {
  readonly businessType: BusinessType;
  readonly name: string;
  readonly nameInvalid: boolean;
  readonly onBusinessTypeChange: (value: BusinessType) => void;
  readonly onNameChange: (value: string) => void;
}

const BUSINESS_TYPES: ReadonlyArray<{
  value: BusinessType;
  label: string;
  emoji: string;
  description: string;
  Icon: (props: { class?: string }) => JSX.Element;
}> = [
  {
    value: "f&b",
    label: "Makanan & Minuman",
    emoji: "🍔",
    description: "Restoran, kafe, warung, kedai.",
    Icon: UtensilsIcon,
  },
  {
    value: "retail",
    label: "Toko Ritel / Kelontong",
    emoji: "🛒",
    description: "Minimarket, sembako, toko bangunan.",
    Icon: BagIcon,
  },
];

export function StepMerchant(props: StepMerchantProps) {
  return (
    <div class="flex flex-col gap-6">
      {/* Merchant name */}
      <TextField
        onChange={(v) => props.onNameChange(v)}
        validationState={props.nameInvalid ? "invalid" : "valid"}
        value={props.name}
      >
        <TextFieldLabel for="merchant_name">Nama Usaha / Bisnis</TextFieldLabel>
        <TextFieldInput
          autocomplete="organization"
          id="merchant_name"
          placeholder="Contoh: Warung Sakti Jaya"
          required
          type="text"
        />
        <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-all duration-standard ease-standard data-[invalid]:h-5 data-[invalid]:opacity-100">
          Nama usaha minimal 3 karakter.
        </TextFieldErrorMessage>
      </TextField>

      {/* Business type — accessible radio group rendered as cards.
          The native radio carries state + a11y; the visible card is its
          label, so clicking the card toggles the radio. */}
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1.5 font-medium text-body-sm text-foreground leading-none">
          Jenis Usaha
        </legend>
        <div
          aria-label="Jenis usaha"
          class="flex flex-col gap-2.5"
          role="radiogroup"
        >
          <For each={BUSINESS_TYPES}>
            {(bt) => {
              const selected = () => props.businessType === bt.value;
              const inputId = `business_type_${bt.value}`;
              return (
                <label
                  class={cn(
                    "group relative flex w-full cursor-pointer items-center gap-3.5 rounded-lg border-2 px-4 py-3.5 text-left transition-all duration-standard ease-standard",
                    // Selection reads through border + swatch tint + check chip.
                    // Card sits on bg-card (lifted from the page) in both modes,
                    // so it reads as a container on charcoal as well as parchment.
                    selected()
                      ? "border-primary bg-card dark:border-accent/70"
                      : "border-input bg-card hover:border-primary/40 dark:hover:border-accent/40"
                  )}
                  for={inputId}
                >
                  <input
                    aria-label={bt.label}
                    checked={selected()}
                    class="sr-only"
                    id={inputId}
                    name="business_type"
                    onChange={() => props.onBusinessTypeChange(bt.value)}
                    type="radio"
                    value={bt.value}
                  />

                  <span
                    aria-hidden
                    class={cn(
                      "grid size-11 shrink-0 place-items-center rounded-md transition-colors",
                      // Visible tint in both modes: lime wash (light) /
                      // bright-lime-at-20% (dark, where primary/10 is invisible).
                      selected()
                        ? "bg-primary/10 dark:bg-accent-soft/20"
                        : "bg-muted"
                    )}
                  >
                    <span class="text-[20px] leading-none">{bt.emoji}</span>
                  </span>

                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="flex items-center gap-1.5">
                      <bt.Icon class="size-4 shrink-0 text-muted-foreground" />
                      <span class="font-semibold text-body-sm text-foreground leading-tight">
                        {bt.label}
                      </span>
                    </span>
                    <span class="mt-0.5 text-[13px] text-muted-foreground leading-snug">
                      {bt.description}
                    </span>
                  </span>

                  {/* Selection check — canopy chip, never color alone */}
                  <Show when={selected()}>
                    <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <CheckIcon class="size-3.5" />
                    </span>
                  </Show>
                </label>
              );
            }}
          </For>
        </div>
      </fieldset>
    </div>
  );
}
