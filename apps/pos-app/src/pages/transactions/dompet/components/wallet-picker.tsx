import { For } from "solid-js";
import type { WalletRow } from "~/db/wallets";
import { cn } from "~/lib/utils";

export const WALLET_TYPE_META: Record<
  WalletRow["type"],
  { emoji: string; label: string }
> = {
  bank: { emoji: "🏦", label: "Bank" },
  cash: { emoji: "💵", label: "Tunai" },
  qris: { emoji: "📱", label: "QRIS" },
};

interface WalletPickerProps {
  readonly excludeId?: string;
  readonly label: string;
  readonly onChange: (walletId: string) => void;
  readonly value: string | undefined;
  readonly wallets: readonly WalletRow[];
}

/** Vertical radio-style wallet list (wallet counts are small). */
export function WalletPicker(props: WalletPickerProps) {
  return (
    <div class="flex flex-col gap-1">
      <span class="font-medium text-caption text-muted-foreground">
        {props.label}
      </span>
      <div class="flex flex-col gap-1.5">
        <For each={props.wallets.filter((w) => w.id !== props.excludeId)}>
          {(wallet) => (
            <button
              aria-pressed={props.value === wallet.id}
              class={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
                props.value === wallet.id
                  ? "border-primary bg-primary/[0.06]"
                  : "border-border bg-card hover:border-primary/30"
              )}
              onClick={() => props.onChange(wallet.id)}
              type="button"
            >
              <span class="flex items-center gap-2">
                <span aria-hidden="true">
                  {WALLET_TYPE_META[wallet.type].emoji}
                </span>
                <span class="font-medium text-body-sm text-foreground">
                  {wallet.name}
                </span>
                <span class="text-caption text-muted-foreground">
                  {WALLET_TYPE_META[wallet.type].label}
                </span>
              </span>
              <span class="font-semibold text-caption text-muted-foreground tabular-nums">
                {wallet.currentBalanceMinorUnits > 0
                  ? `Rp ${(wallet.currentBalanceMinorUnits / 100).toLocaleString("id-ID")}`
                  : ""}
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
