import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { toast } from "solid-sonner";
import { PlusIcon, XCloseIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import { NumberField, NumberFieldInput } from "~/components/ui/number-field";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { products, variants } from "~/lib/data/catalog";
import { cn } from "~/lib/utils";

interface OptionRow {
  _id: number;
  label: string;
  price: number;
}

let _rowId = 0;

export default function VariantFormPage() {
  const navigate = useNavigate();
  const params = useParams();

  const editId = () => {
    if (!params.id || params.id === "new") {
      return;
    }
    const n = Number.parseInt(params.id, 10);
    return Number.isNaN(n) ? undefined : n;
  };
  const existing = () =>
    editId() ? variants.find((v) => v.id === editId()) : undefined;
  const isEditing = () => Boolean(existing());

  const [name, setName] = createSignal(existing()?.name ?? "");
  const [options, setOptions] = createStore<OptionRow[]>(
    existing()
      ? existing()!.options.map((o) => ({ ...o, _id: _rowId++ }))
      : [{ _id: _rowId++, label: "", price: 0 }],
  );

  const addOption = () =>
    setOptions((prev) => [...prev, { _id: _rowId++, label: "", price: 0 }]);

  const removeOption = (id: number) => {
    if (options.length <= 1) {
      toast.error("Minimal 1 opsi");
      return;
    }
    setOptions((prev) => prev.filter((o) => o._id !== id));
  };

  const linkedProducts = () =>
    existing()
      ? existing()!
          .productIds.map((pid) => products.find((p) => p.id === pid)?.name)
          .filter(Boolean)
      : [];

  const handleSave = () => {
    const trimmed = name().trim();
    if (!trimmed) {
      toast.error("Nama varian wajib diisi");
      return;
    }
    const valid = options.filter((o) => o.label.trim());
    if (valid.length === 0) {
      toast.error("Minimal 1 opsi dengan nama");
      return;
    }
    toast.success(isEditing() ? "Varian diperbarui" : "Varian ditambahkan");
    navigate("/catalog");
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition="/catalog/variant"
      title={isEditing() ? "Edit Varian" : "Tambah Varian"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6">
          {/* ── Name ── */}
          <TextField class="mb-6 gap-1.5" onChange={setName} value={name()}>
            <TextFieldLabel>Nama Varian</TextFieldLabel>
            <TextFieldInput autofocus placeholder="e.g. Size, Level Pedas" />
          </TextField>

          {/* ── Options & prices ── */}
          <div class="mb-6">
            <span class="mb-2.5 block font-medium text-body-sm text-foreground leading-none tracking-normal">
              Opsi Varian
            </span>

            <div class="flex flex-col gap-2.5">
              <For each={options}>
                {(opt) => (
                  <div class="rounded-lg border border-border bg-muted/50 p-3">
                    {/* Mobile: stacked. Tablet+: inline row. */}
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                      <input
                        class="h-11 w-full min-w-0 rounded-sm border-2 border-input bg-background px-3.5 font-sans text-body-sm text-foreground outline-none transition duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 sm:flex-1 dark:focus:border-accent"
                        onChange={(e) =>
                          setOptions(
                            (o) => o._id === opt._id,
                            "label",
                            e.currentTarget.value,
                          )
                        }
                        placeholder="Nama opsi"
                        type="text"
                        value={opt.label}
                      />
                      <div class="flex items-center gap-2">
                        <NumberField class="flex flex-1 flex-row items-center gap-1.5 sm:flex-none">
                          <span class="shrink-0 font-medium text-caption text-primary dark:text-accent">
                            +Rp
                          </span>
                          <NumberFieldInput
                            ariaLabel={`Harga opsi ${opt.label || ""}`}
                            class="h-11 w-full px-3 text-right font-bold tabular-nums"
                            onChange={(v) =>
                              setOptions(
                                (o) => o._id === opt._id,
                                "price",
                                Math.max(0, v),
                              )
                            }
                            placeholder="0"
                            value={opt.price || 0}
                          />
                        </NumberField>
                        <Button
                          aria-label="Hapus opsi"
                          class="size-10 shrink-0 justify-center"
                          look="outline"
                          onClick={() => removeOption(opt._id)}
                          size="none"
                          tone="danger"
                          type="button"
                        >
                          <XCloseIcon class="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Add button at bottom */}
            <Button
              class="mt-2.5 w-full border border-dashed bg-background/20"
              look="outline"
              onClick={addOption}
              tone="neutral"
              type="button"
            >
              <PlusIcon class="h-4 w-4" />
              Tambah Opsi
            </Button>
          </div>

          {/* ── Linked products (edit mode only, read-only) ── */}
          <Show when={isEditing()}>
            <div class="mb-7 flex flex-col gap-2">
              <span class="font-medium text-body-sm text-muted-foreground leading-none tracking-normal">
                Produk yang menggunakan varian ini
              </span>
              <div class="flex max-h-50 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted p-2.5">
                <Show
                  fallback={
                    <p class="w-full py-2 text-center text-caption-sm text-muted-foreground">
                      Belum ada produk yang menggunakan varian ini
                    </p>
                  }
                  when={linkedProducts().length > 0}
                >
                  <For each={linkedProducts()}>
                    {(p) => (
                      <span
                        class={cn(
                          "inline-flex items-center whitespace-nowrap rounded-full border border-primary px-3 py-1 font-medium text-caption-sm text-primary",
                        )}
                      >
                        {p}
                      </span>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </Show>

          {/* ── Actions ── */}
          <div class="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button
              look="outline"
              onClick={() => navigate("/catalog")}
              tone="neutral"
              type="button"
            >
              Batal
            </Button>
            <Button onClick={handleSave} type="button">
              {isEditing() ? "Simpan Perubahan" : "Simpan Varian"}
            </Button>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
