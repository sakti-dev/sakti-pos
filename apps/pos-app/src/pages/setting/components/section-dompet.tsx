import { A } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import {
  DrawerBody,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "~/components/ui/drawer";
import { TabButton } from "~/components/ui/tabs";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import {
  deactivateWallet,
  getWalletsWithBalance,
  saveWallet,
  type WalletRow,
} from "~/db/wallets";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { cn, formatRupiah } from "~/lib/utils";
import { WALLET_TYPE_META } from "~/pages/transactions/dompet/components/wallet-picker";
import { CardDesc, CardTitle, SectionCard } from "./primitives";

const EDITABLE_TYPES = ["cash", "bank"] as const;
const TYPE_LABEL: Record<string, string> = {
  bank: "Bank",
  cash: "Tunai",
  qris: "QRIS",
};

interface EditState {
  readonly accountNumber: string;
  readonly balanceMinorUnits: number;
  readonly id?: string;
  readonly isDefault: boolean;
  readonly name: string;
  readonly type: "cash" | "bank";
}

const emptyEdit = (): EditState => ({
  balanceMinorUnits: 0,
  name: "",
  type: "bank",
  accountNumber: "",
  isDefault: false,
});

export function SectionDompet() {
  const walletsQuery = useDrizzleQuery(["drizzle", "wallets", "list"], () =>
    getWalletsWithBalance()
  );
  const wallets = (): WalletRow[] => walletsQuery.data() ?? [];

  const [editOpen, setEditOpen] = createSignal(false);
  const [edit, setEdit] = createSignal<EditState>(emptyEdit());
  const [confirmDeactivateId, setConfirmDeactivateId] = createSignal<
    string | null
  >(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    if (!editOpen()) {
      setError(null);
    }
  });

  const openCreate = () => {
    setEdit(emptyEdit());
    setEditOpen(true);
  };

  const openEdit = (wallet: WalletRow) => {
    setEdit({
      accountNumber: wallet.accountNumber ?? "",
      balanceMinorUnits: wallet.currentBalanceMinorUnits,
      id: wallet.id,
      isDefault: wallet.isDefault,
      name: wallet.name,
      type: wallet.type === "bank" ? "bank" : "cash",
    });
    setEditOpen(true);
  };

  const submit = async () => {
    const state = edit();
    if (!state.name.trim()) {
      setError("Nama dompet wajib diisi");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveWallet({
        accountNumber: state.accountNumber.trim() || null,
        id: state.id,
        isDefault: state.isDefault,
        name: state.name,
        type: state.type,
      });
      toast.success(state.id ? "Dompet diperbarui" : "Dompet ditambahkan");
      setEditOpen(false);
      await walletsQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (wallet: WalletRow) => {
    try {
      await deactivateWallet(wallet.id);
      toast.success(`${wallet.name} dinonaktifkan`);
      setConfirmDeactivateId(null);
      await walletsQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menonaktifkan");
      setConfirmDeactivateId(null);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <SectionCard>
        <CardTitle>Dompet</CardTitle>
        <CardDesc>
          Tempat uang disimpan: kas, rekening bank, dan QRIS. Saldo mengikuti
          penjualan dan setiap pergerakan uang.
        </CardDesc>

        <div class="mt-3 flex flex-col gap-2">
          <For each={wallets()}>
            {(wallet) => (
              <div class="rounded-xl border border-border bg-card p-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="flex items-center gap-2 font-semibold text-body-sm text-foreground">
                      <span aria-hidden="true">
                        {WALLET_TYPE_META[wallet.type].emoji}
                      </span>
                      <span class="truncate">{wallet.name}</span>
                      <Show when={wallet.isDefault}>
                        <span class="rounded-full bg-primary/10 px-2 py-0.5 text-caption text-primary">
                          DEFAULT
                        </span>
                      </Show>
                    </p>
                    <p class="text-caption text-muted-foreground">
                      {TYPE_LABEL[wallet.type] ?? wallet.type}
                      <Show when={wallet.accountNumber}>
                        {" "}
                        · {wallet.accountNumber}
                      </Show>
                      {" · "}
                      {formatRupiah(wallet.currentBalanceMinorUnits / 100)}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5">
                    <Button
                      look="ghost"
                      onClick={() => openEdit(wallet)}
                      size="sm"
                      tone="neutral"
                    >
                      Edit
                    </Button>
                    <Show
                      fallback={
                        <Button
                          look="ghost"
                          onClick={() => setConfirmDeactivateId(wallet.id)}
                          size="sm"
                          tone="danger"
                        >
                          Nonaktifkan
                        </Button>
                      }
                      when={confirmDeactivateId() === wallet.id}
                    >
                      <Button
                        look="ghost"
                        onClick={() => setConfirmDeactivateId(null)}
                        size="sm"
                        tone="neutral"
                      >
                        Batal
                      </Button>
                      <Button
                        look="ghost"
                        onClick={() => deactivate(wallet)}
                        size="sm"
                        tone="danger"
                      >
                        Yakin?
                      </Button>
                    </Show>
                  </div>
                </div>
                <Show
                  when={
                    confirmDeactivateId() === wallet.id &&
                    wallet.currentBalanceMinorUnits !== 0
                  }
                >
                  <p class="mt-2 rounded-lg bg-danger/10 p-2 text-caption text-danger">
                    Dompet ini masih memiliki saldo{" "}
                    {formatRupiah(wallet.currentBalanceMinorUnits / 100)}.
                    Riwayat transaksinya tetap tersimpan setelah dinonaktifkan.
                  </p>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <Button look="soft" onClick={openCreate} size="sm" tone="primary">
            + Tambah Dompet
          </Button>
          <A
            class="font-medium text-body-sm text-primary underline underline-offset-4"
            href="/transactions/dompet"
          >
            Buka Dompet
          </A>
        </div>
      </SectionCard>

      <DrawerRoot
        onOpenChange={(open) => !open && setEditOpen(false)}
        open={editOpen()}
      >
        {() => (
          <>
            <DrawerHeader>
              <DrawerTitle>
                {edit().id ? "Edit Dompet" : "Dompet Baru"}
              </DrawerTitle>
            </DrawerHeader>
            <DrawerBody>
              <div class="flex flex-col gap-4">
                <TextField
                  onChange={(v) => setEdit((p) => ({ ...p, name: v }))}
                  value={edit().name}
                >
                  <TextFieldLabel>Nama</TextFieldLabel>
                  <TextFieldInput
                    id="wallet-name"
                    placeholder="Misal: Bank BCA"
                  />
                </TextField>

                <Show when={!edit().id}>
                  <div class="flex flex-col gap-1">
                    <span class="font-medium text-caption text-muted-foreground">
                      Jenis
                    </span>
                    <div class="flex gap-2">
                      <For each={[...EDITABLE_TYPES]}>
                        {(type) => (
                          <TabButton
                            active={edit().type === type}
                            onClick={() => setEdit((p) => ({ ...p, type }))}
                            shape="pill"
                            tone="accent"
                          >
                            {TYPE_LABEL[type]}
                          </TabButton>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <Show when={edit().type === "bank"}>
                  <TextField
                    onChange={(v) =>
                      setEdit((p) => ({ ...p, accountNumber: v }))
                    }
                    value={edit().accountNumber}
                  >
                    <TextFieldLabel>No. Rekening (opsional)</TextFieldLabel>
                    <TextFieldInput
                      id="wallet-account"
                      inputmode="numeric"
                      placeholder="1234567890"
                    />
                  </TextField>
                </Show>

                <button
                  class={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
                    edit().isDefault
                      ? "border-primary bg-primary/[0.06]"
                      : "border-border bg-card"
                  )}
                  onClick={() =>
                    setEdit((p) => ({ ...p, isDefault: !p.isDefault }))
                  }
                  type="button"
                >
                  <span class="font-medium text-body-sm text-foreground">
                    Jadikan dompet default
                  </span>
                  <span
                    class={cn(
                      "font-semibold text-caption",
                      edit().isDefault
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {edit().isDefault ? "YA" : "TIDAK"}
                  </span>
                </button>

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
                onClick={() => submit()}
                tone="primary"
              >
                {saving() ? "Menyimpan…" : "Simpan"}
              </Button>
              <Button
                look="outline"
                onClick={() => setEditOpen(false)}
                tone="neutral"
              >
                Batal
              </Button>
            </div>
          </>
        )}
      </DrawerRoot>
    </div>
  );
}
