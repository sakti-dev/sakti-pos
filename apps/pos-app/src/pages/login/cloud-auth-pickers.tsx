import { For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import type { Outlet, SessionMerchant } from "~/lib/cloud-auth";
import type { CloudAuthStep } from "./use-cloud-auth-flow";

interface CloudAuthPickersProps {
  error: string;
  merchants: SessionMerchant[];
  onBack: () => void;
  onSelectMerchant: (merchant: SessionMerchant) => void;
  onSelectOutlet: (outlet: Outlet) => void;
  outlets: Outlet[];
  picking: boolean;
  step: Exclude<CloudAuthStep, "auth">;
}

export function CloudAuthPickers(props: CloudAuthPickersProps) {
  return (
    <div class="flex w-full max-w-sm flex-col items-center gap-3">
      <Show when={props.error}>
        <div class="w-full rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {props.error}
        </div>
      </Show>

      <Show
        when={props.step === "merchant-picker"}
        fallback={
          <div class="grid w-full gap-2">
            <For each={props.outlets}>
              {(outlet) => (
                <Button
                  class="justify-start"
                  disabled={props.picking}
                  onClick={() => props.onSelectOutlet(outlet)}
                  variant="outline"
                >
                  <div class="text-left">
                    <span class="block font-medium">{outlet.name}</span>
                    <Show when={outlet.address}>
                      <span class="block text-muted-foreground text-xs">
                        {outlet.address}
                      </span>
                    </Show>
                  </div>
                </Button>
              )}
            </For>
            <Button class="w-full" onClick={props.onBack} variant="secondary">
              ← Kembali ke pilih bisnis
            </Button>
          </div>
        }
      >
        <div class="grid w-full gap-2">
          <For each={props.merchants}>
            {(merchant) => (
              <Button
                class="justify-start"
                disabled={props.picking}
                onClick={() => props.onSelectMerchant(merchant)}
              >
                <span class="font-medium">{merchant.name}</span>
              </Button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
