import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
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
import { getProducts } from "~/db/catalog";
import {
  createModifierGroup,
  getModifierGroups,
  type SelectionType,
  softDeleteModifierGroup,
  updateModifierGroup,
} from "~/db/modifier-groups";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { cn } from "~/lib/utils";

interface OptionRow {
  _id: number;
  /** Present when editing an existing option row. */
  dbId?: string;
  label: string;
  /** Whole Rupiah; converted to minor units at the save seam. */
  price: number;
}

let rowSeq = 0;

export default function VariantFormPage() {
  const navigate = useNavigate();
  const params = useParams();

  const isEdit = () => Boolean(params.id && params.id !== "new");

  const groupsQuery = useDrizzleQuery(
    ["drizzle", "modifier-groups", "list"],
    () => getModifierGroups()
  );
  const productsQuery = useDrizzleQuery(
    ["drizzle", "products", "list-for-variant-form"],
    () => getProducts()
  );

  const existing = () =>
    isEdit() ? groupsQuery.data()?.find((g) => g.id === params.id) : undefined;

  const [name, setName] = createSignal("");
  const [selectionType, setSelectionType] =
    createSignal<SelectionType>("single");
  const [isRequired, setIsRequired] = createSignal(true);
  const [options, setOptions] = createStore<OptionRow[]>([
    { _id: rowSeq++, label: "", price: 0 },
  ]);
  const [attached, setAttached] = createStore<Record<string, boolean>>({});
  const [hydrated, setHydrated] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  // Hydrate the form once the edit target arrives from the DB.
  createEffect(() => {
    if (!isEdit() || hydrated()) {
      return;
    }
    const group = existing();
    if (group == null) {
      return;
    }
    setName(group.name);
    setSelectionType(group.selectionType);
    setIsRequired(group.isRequired);
    setOptions(
      group.options.map((o) => ({
        _id: rowSeq++,
        dbId: o.id,
        label: o.label,
        price: o.priceDeltaMinorUnits / 100,
      }))
    );
    const next: Record<string, boolean> = {};
    for (const p of group.products) {
      next[p.id] = true;
    }
    setAttached(next);
    setHydrated(true);
  });

  const addOption = () =>
    setOptions((prev) => [...prev, { _id: rowSeq++, label: "", price: 0 }]);

  const removeOption = (id: number) => {
    if (options.length <= 1) {
      toast.error("Minimal 1 opsi");
      return;
    }
    setOptions((prev) => prev.filter((o) => o._id !== id));
  };

  const toggleProduct = (id: string) => setAttached(id, (on) => !on);

  const attachedCount = () => Object.values(attached).filter(Boolean).length;

  const handleSave = async () => {
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
    if (valid.length !== options.length) {
      toast.error("Ada opsi tanpa nama — isi atau hapus dulu");
      return;
    }
    const input = {
      isRequired: isRequired(),
      name: trimmed,
      options: valid.map((o) => ({
        id: o.dbId,
        label: o.label,
        priceDeltaMinorUnits: Math.max(0, Math.round(o.price)) * 100,
      })),
      productIds:
        productsQuery
          .data()
          ?.filter((p) => attached[p.id])
          .map((p) => p.id) ?? [],
      selectionType: selectionType(),
    };
    setSaving(true);
    try {
      if (isEdit() && params.id != null) {
        await updateModifierGroup(params.id, input);
        toast.success("Varian diperbarui");
      } else {
        await createModifierGroup(input);
        toast.success("Varian ditambahkan");
      }
      navigate("/catalog");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menyimpan varian"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (params.id == null) {
      return;
    }
    setSaving(true);
    try {
      await softDeleteModifierGroup(params.id);
      toast.success("Varian dihapus");
      navigate("/catalog");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus varian"
      );
      setSaving(false);
    }
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition={useLocation().pathname}
      title={isEdit() ? "Edit Varian" : "Tambah Varian"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6">
          {/* ── Name ── */}
          <TextField class="mb-6 gap-1.5" onChange={setName} value={name()}>
            <TextFieldLabel>Nama Varian</TextFieldLabel>
            <TextFieldInput autofocus placeholder="e.g. Size, Level Pedas" />
          </TextField>

          {/* ── Selection type + required ── */}
          <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:gap-6">
            <div class="flex flex-col gap-2">
              <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
                Cara Pilih
              </span>
              <div class="inline-flex rounded-lg border border-border p-0.5">
                <For
                  each={
                    [
                      { label: "Satu pilihan", value: "single" },
                      { label: "Bisa beberapa", value: "multi" },
                    ] as const
                  }
                >
                  {(choice) => (
                    <button
                      class={cn(
                        "rounded-md px-3 py-1.5 font-medium text-caption-sm transition-colors",
                        selectionType() === choice.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setSelectionType(choice.value)}
                      type="button"
                    >
                      {choice.label}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
                Wajib Dipilih?
              </span>
              <div class="inline-flex rounded-lg border border-border p-0.5">
                <For each={[true, false] as const}>
                  {(value) => (
                    <button
                      class={cn(
                        "rounded-md px-3 py-1.5 font-medium text-caption-sm transition-colors",
                        isRequired() === value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setIsRequired(value)}
                      type="button"
                    >
                      {value ? "Wajib" : "Opsional"}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* ── Options & prices ── */}
          <div class="mb-6">
            <span class="mb-2.5 block font-medium text-body-sm text-foreground leading-none tracking-normal">
              Opsi Varian
            </span>

            <div class="flex flex-col gap-2.5">
              <For each={options}>
                {(opt) => (
                  <div class="rounded-lg border border-border bg-muted/50 p-3">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                      <input
                        class="h-11 w-full min-w-0 rounded-sm border-2 border-input bg-background px-3.5 font-sans text-body-sm text-foreground outline-none transition duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 sm:flex-1 dark:focus:border-accent"
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
                                Math.max(0, v)
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

          {/* ── Product attachment ── */}
          <div class="mb-7 flex flex-col gap-2">
            <span class="font-medium text-body-sm text-muted-foreground leading-none tracking-normal">
              Produk yang memakai varian ini ({attachedCount()})
            </span>
            <div class="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted p-2.5">
              <Show
                fallback={
                  <p class="w-full py-2 text-center text-caption-sm text-muted-foreground">
                    Belum ada produk
                  </p>
                }
                when={(productsQuery.data()?.length ?? 0) > 0}
              >
                <For each={productsQuery.data() ?? []}>
                  {(product) => (
                    <button
                      class={cn(
                        "inline-flex cursor-pointer items-center whitespace-nowrap rounded-full border px-3 py-1 font-medium text-caption-sm transition-colors",
                        attached[product.id]
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      )}
                      onClick={() => toggleProduct(product.id)}
                      type="button"
                    >
                      {product.name}
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>

          {/* ── Actions ── */}
          <div class="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <Show when={isEdit()}>
              <Button
                class="sm:mr-auto"
                disabled={saving()}
                look="ghost"
                onClick={handleDelete}
                tone="danger"
                type="button"
              >
                Hapus Varian
              </Button>
            </Show>
            <div class="flex flex-col-reverse gap-2.5 sm:flex-row">
              <Button
                disabled={saving()}
                look="outline"
                onClick={() => navigate("/catalog")}
                tone="neutral"
                type="button"
              >
                Batal
              </Button>
              <Button disabled={saving()} onClick={handleSave} type="button">
                {isEdit() ? "Simpan Perubahan" : "Simpan Varian"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
