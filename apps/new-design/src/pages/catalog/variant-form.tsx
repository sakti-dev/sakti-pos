import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { toast } from "solid-sonner";
import { PlusIcon, XCloseIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { products, type VariantOption, variants } from "~/lib/data/catalog";
import { cn } from "~/lib/utils";

interface OptionRow extends VariantOption {
  readonly _id: number;
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
      : [{ _id: _rowId++, label: "", price: 0 }]
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
        <div class="mx-auto w-full max-w-2xl rounded-lg border border-border bg-card p-6">
          {/* ── Name ── */}
          <TextField class="mb-6 gap-1.5" onChange={setName} value={name()}>
            <TextFieldLabel>Nama Varian</TextFieldLabel>
            <TextFieldInput autofocus placeholder="e.g. Size, Level Pedas" />
          </TextField>

          {/* ── Options & prices ── */}
          <div class="mb-6">
            <div class="mb-2.5 flex items-center justify-between">
              <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
                Opsi &amp; Harga
              </span>
              <Button
                look="soft"
                onClick={addOption}
                size="xs"
                tone="primary"
                type="button"
              >
                <PlusIcon class="h-3.5 w-3.5" />
                Tambah Opsi
              </Button>
            </div>

            <div class="flex flex-col gap-2">
              <For each={options}>
                {(opt) => (
                  <div class="flex items-center gap-2">
                    <input
                      class="h-11 min-w-0 flex-1 rounded-sm border-2 border-input bg-background px-3.5 font-sans text-body-sm text-foreground outline-none transition-colors transition-shadow duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                      onChange={(e) =>
                        setOptions(
                          (o) => o._id === opt._id,
                          "label",
                          e.currentTarget.value
                        )
                      }
                      placeholder="Nama opsi"
                      type="text"
                      value={opt.label}
                    />
                    <div class="flex shrink-0 items-center gap-1">
                      <span class="text-caption-sm text-faint-foreground">
                        +Rp
                      </span>
                      <input
                        aria-label={`Harga opsi ${opt.label || ""}`}
                        class="h-11 w-24 rounded-sm border-2 border-input bg-background px-3 text-right font-sans text-body-sm text-foreground tabular-nums outline-none transition-colors transition-shadow duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                        min="0"
                        onInput={(e) =>
                          setOptions(
                            (o) => o._id === opt._id,
                            "price",
                            Math.max(
                              0,
                              Number.parseInt(e.currentTarget.value, 10) || 0
                            )
                          )
                        }
                        placeholder="0"
                        type="number"
                        value={opt.price}
                      />
                    </div>
                    <Button
                      aria-label="Hapus opsi"
                      look="ghost"
                      onClick={() => removeOption(opt._id)}
                      size="icon-sm"
                      tone="danger"
                      type="button"
                    >
                      <XCloseIcon class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </For>
            </div>
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
                          "inline-flex items-center whitespace-nowrap rounded-full border border-primary/15 bg-accent-soft px-3 py-1 font-medium text-caption-sm text-primary"
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
