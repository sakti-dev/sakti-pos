import { createEffect, createSignal, Show } from "solid-js";
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
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import {
  executeWalletTransfer,
  getWalletsWithBalance,
  type WalletRow,
} from "~/db/wallets";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { WalletPicker } from "./wallet-picker";

interface TransferSheetProps {
  readonly onClose: () => void;
  readonly open: boolean;
}

/** Transfer antar dompet — one atomic paired ledger write. */
export function TransferSheet(props: TransferSheetProps) {
  const walletsQuery = useDrizzleQuery(["drizzle", "wallets", "list"], () =>
    getWalletsWithBalance()
  );
  const wallets = (): WalletRow[] => walletsQuery.data() ?? [];

  const [amount, setAmount] = createSignal(0);
  const [fromId, setFromId] = createSignal<string | undefined>(undefined);
  const [toId, setToId] = createSignal<string | undefined>(undefined);
  const [notes, setNotes] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (props.open) {
      const cash = wallets().find((w) => w.type === "cash");
      setFromId(cash?.id);
      setToId(undefined);
      setAmount(0);
      setNotes("");
      setError(null);
    }
  });

  const submit = async () => {
    const from = wallets().find((w) => w.id === fromId());
    const to = wallets().find((w) => w.id === toId());
    if (!(from && to)) {
      setError("Pilih dompet asal dan tujuan");
      return;
    }
    if (from.id === to.id) {
      setError("Dompet asal dan tujuan tidak boleh sama");
      return;
    }
    if (!Number.isInteger(amount()) || amount() <= 0) {
      setError("Jumlah harus lebih dari nol");
      return;
    }
    if (from.currentBalanceMinorUnits < amount()) {
      setError(`Saldo ${from.name} tidak cukup`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await executeWalletTransfer({
        amountMinorUnits: amount(),
        fromWalletId: from.id,
        notes: notes().trim() || null,
        toWalletId: to.id,
      });
      toast.success(`Transfer ${from.name} → ${to.name} tercatat`);
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
      {() => (
        <>
          <DrawerHeader>
            <DrawerTitle>Transfer</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <div class="flex flex-col gap-4">
              <Show when={wallets().length > 0}>
                <WalletPicker
                  label="Dari Dompet"
                  onChange={setFromId}
                  value={fromId()}
                  wallets={wallets()}
                />
                <WalletPicker
                  excludeId={fromId()}
                  label="Ke Dompet"
                  onChange={setToId}
                  value={toId()}
                  wallets={wallets()}
                />
              </Show>

              <NumberField>
                <NumberFieldLabel>Jumlah</NumberFieldLabel>
                <NumberFieldInput
                  id="transfer-amount"
                  onChange={setAmount}
                  placeholder="0"
                  value={amount()}
                />
              </NumberField>

              <TextField onChange={setNotes} value={notes()}>
                <TextFieldLabel>Catatan (opsional)</TextFieldLabel>
                <TextFieldInput
                  id="transfer-notes"
                  placeholder="Misal: setoran ke rekening"
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
              {saving() ? "Memproses…" : "Transfer"}
            </Button>
            <Button
              look="outline"
              onClick={() => props.onClose()}
              tone="neutral"
            >
              Batal
            </Button>
          </div>
        </>
      )}
    </DrawerRoot>
  );
}
