import { createEffect, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import {
  DrawerBody,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "~/components/ui/drawer";
import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import { TabButton } from "~/components/ui/tabs";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import {
  getWalletsWithBalance,
  recordWalletMovement,
  type WalletRow,
} from "~/db/wallets";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { WalletPicker } from "./wallet-picker";

export type MovementMode = "cash_in" | "cash_out";

const CATEGORIES: Record<MovementMode, readonly string[]> = {
  cash_in: ["operasional", "modal", "lainnya"],
  cash_out: ["operasional", "supplier", "lainnya"],
};

const CATEGORY_LABEL: Record<string, string> = {
  lainnya: "Lainnya",
  modal: "Modal",
  operasional: "Operasional",
  supplier: "Supplier",
};

interface MovementSheetProps {
  readonly mode: MovementMode;
  readonly onClose: () => void;
  readonly open: boolean;
}

/** Uang Masuk / Uang Keluar sheet — one component, two modes. */
export function MovementSheet(props: MovementSheetProps) {
  const walletsQuery = useDrizzleQuery(["drizzle", "wallets", "list"], () =>
    getWalletsWithBalance()
  );
  const wallets = (): WalletRow[] => walletsQuery.data() ?? [];

  const [amount, setAmount] = createSignal(0);
  const [walletId, setWalletId] = createSignal<string | undefined>(undefined);
  const [category, setCategory] = createSignal<string | null>(null);
  const [notes, setNotes] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  /* Default the wallet to Laci Kas on every open. */
  createEffect(() => {
    if (props.open) {
      const cash = wallets().find((w) => w.type === "cash");
      setWalletId(cash?.id);
      setAmount(0);
      setCategory(null);
      setNotes("");
      setError(null);
    }
  });

  const isMasuk = () => props.mode === "cash_in";

  const submit = async () => {
    const target = wallets().find((w) => w.id === walletId());
    if (!target) {
      setError("Pilih dompet tujuan");
      return;
    }
    if (!Number.isInteger(amount()) || amount() <= 0) {
      setError("Jumlah harus lebih dari nol");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordWalletMovement({
        amountMinorUnits: amount(),
        category: category(),
        notes: notes().trim() || null,
        type: props.mode,
        walletId: target.id,
      });
      toast.success(
        isMasuk()
          ? `Uang masuk ${target.name} tercatat`
          : `Uang keluar dari ${target.name} tercatat`
      );
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerRoot
      onOpenChange={(open) => !open && props.onClose()}
      open={props.open}
    >
      {(api) => (
        <>
          <DrawerHeader>
            <DrawerTitle>
              {isMasuk() ? "Uang Masuk" : "Uang Keluar"}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <div class="flex flex-col gap-4">
              <NumberField>
                <NumberFieldLabel>Jumlah</NumberFieldLabel>
                <NumberFieldInput
                  id="movement-amount"
                  onChange={setAmount}
                  placeholder="0"
                  value={amount()}
                />
              </NumberField>

              <Show when={wallets().length > 0}>
                <WalletPicker
                  label={isMasuk() ? "Ke Dompet" : "Dari Dompet"}
                  onChange={setWalletId}
                  value={walletId()}
                  wallets={wallets()}
                />
              </Show>

              <div class="flex flex-col gap-1">
                <span class="font-medium text-caption text-muted-foreground">
                  Kategori
                </span>
                <div class="flex flex-wrap gap-2">
                  <For each={[...CATEGORIES[props.mode]]}>
                    {(cat) => (
                      <TabButton
                        active={category() === cat}
                        onClick={() =>
                          setCategory(category() === cat ? null : cat)
                        }
                        shape="pill"
                        tone="accent"
                      >
                        {CATEGORY_LABEL[cat] ?? cat}
                      </TabButton>
                    )}
                  </For>
                </div>
              </div>

              <TextField onChange={setNotes} value={notes()}>
                <TextFieldLabel>Catatan (opsional)</TextFieldLabel>
                <TextFieldInput
                  id="movement-notes"
                  placeholder={
                    isMasuk() ? "Misal: setoran modal" : "Misal: beli gas"
                  }
                />
              </TextField>

              <Show when={error()}>
                <p class="font-medium text-body-sm text-danger">{error()}</p>
              </Show>
            </div>
          </DrawerBody>
          <div class="flex gap-2 px-4 pb-4">
            <Button
              class="flex-1"
              disabled={saving()}
              look="solid"
              onClick={submit}
              tone="primary"
            >
              {saving() ? "Menyimpan…" : "Simpan"}
            </Button>
            <Button look="outline" onClick={() => api.close()} tone="neutral">
              Batal
            </Button>
          </div>
        </>
      )}
    </DrawerRoot>
  );
}
