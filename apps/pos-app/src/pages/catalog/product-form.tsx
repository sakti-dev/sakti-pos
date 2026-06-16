import { A, useLocation, useNavigate, useParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
import { UploadIcon, XCloseIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { PickerField } from "~/components/picker-field";
import { Button } from "~/components/ui/button";
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
import { categories, products } from "~/lib/data/catalog";

const UNITS = ["cup", "glass", "plate", "pcs", "bowl", "bottle"] as const;

const labelClass =
  "font-medium text-body-sm text-foreground leading-none tracking-normal";

export default function ProductFormPage() {
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
    editId() ? products.find((p) => p.id === editId()) : undefined;
  const isEditing = () => Boolean(existing());

  const [name, setName] = createSignal(existing()?.name ?? "");
  const [sku, setSku] = createSignal(existing()?.sku ?? "");
  const [category, setCategory] = createSignal(existing()?.category ?? "");
  const [price, setPrice] = createSignal(
    existing() ? String(existing()!.price) : ""
  );
  const [initialStock, setInitialStock] = createSignal("");
  const [unit, setUnit] = createSignal(existing()?.unit ?? "cup");
  const [photo, setPhoto] = createSignal<string | null>(null);
  const [categoryOptions, setCategoryOptions] = createSignal(
    categories.map((c) => ({ value: c.id, label: c.name }))
  );

  const handlePhotoChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const trimmedName = name().trim();
    if (!trimmedName) {
      toast.error("Nama produk wajib diisi");
      return;
    }
    if (!sku().trim()) {
      toast.error("SKU wajib diisi");
      return;
    }
    if (!category()) {
      toast.error("Pilih kategori");
      return;
    }
    if (!price() || Number.parseInt(price(), 10) <= 0) {
      toast.error("Harga wajib diisi");
      return;
    }
    toast.success(isEditing() ? "Produk diperbarui" : "Produk ditambahkan");
    navigate("/catalog");
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition={useLocation().pathname}
      title={isEditing() ? "Edit Produk" : "Tambah Produk"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6">
          {/* ── Photo + Name + SKU ── */}
          <div class="flex flex-col gap-5 sm:flex-row">
            <div class="flex flex-col gap-1.5">
              <span class={labelClass}>Foto Produk</span>
              <label class="group relative grid aspect-square size-[120px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border-2 border-input border-dashed bg-background sm:size-[132px]">
                <Show when={photo()}>
                  <img
                    alt="Preview"
                    class="absolute inset-0 h-full w-full object-cover"
                    src={photo()!}
                  />
                </Show>
                <Show when={!photo()}>
                  <div class="flex flex-col items-center gap-1.5 text-muted-foreground transition-colors group-hover:text-foreground">
                    <UploadIcon class="h-6 w-6" />
                    <span class="font-medium text-caption-sm">Upload</span>
                  </div>
                </Show>
                <input
                  accept="image/*"
                  class="sr-only"
                  onChange={handlePhotoChange}
                  type="file"
                />
              </label>
              <Show when={photo()}>
                <button
                  class="inline-flex items-center justify-center gap-1 font-medium text-caption-sm text-danger transition-colors hover:text-danger/80"
                  onClick={() => setPhoto(null)}
                  type="button"
                >
                  <XCloseIcon class="h-3 w-3" />
                  Hapus Foto
                </button>
              </Show>
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-4">
              <TextField class="gap-1.5" onChange={setName} value={name()}>
                <TextFieldLabel>Nama Produk</TextFieldLabel>
                <TextFieldInput autofocus placeholder="e.g. Es Kopi Susu" />
              </TextField>
              <TextField class="gap-1.5" onChange={setSku} value={sku()}>
                <TextFieldLabel>SKU</TextFieldLabel>
                <TextFieldInput placeholder="e.g. KPI-001" />
              </TextField>
            </div>
          </div>

          {/* ── Divider ── */}
          <hr class="my-6 border-border" />

          {/* ── Category + Price + Stock + Unit ── */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <span class={labelClass}>Kategori</span>
              <PickerField
                onChange={setCategory}
                onCreate={(query) => {
                  const id = query.toLowerCase().replace(/\s+/g, "-");
                  setCategoryOptions((prev) => [
                    ...prev,
                    { value: id, label: query },
                  ]);
                  return id;
                }}
                options={categoryOptions()}
                placeholder="Pilih kategori"
                title="Pilih Kategori"
                value={category()}
              />
            </div>
            <NumberField class="gap-1.5">
              <NumberFieldLabel>Harga (Rp)</NumberFieldLabel>
              <NumberFieldInput
                onChange={(v) => setPrice(v > 0 ? String(v) : "")}
                placeholder="25000"
                value={price() ? Number.parseInt(price(), 10) : 0}
              />
            </NumberField>
            <Show
              fallback={
                <div class="flex flex-col gap-1.5">
                  <span class={labelClass}>Stok</span>
                  <p class="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-body-sm text-muted-foreground">
                    Stok dikelola di menu{" "}
                    <A class="font-medium text-primary" href="/inventory">
                      Stok
                    </A>
                    .
                  </p>
                </div>
              }
              when={!isEditing()}
            >
              <NumberField class="gap-1.5">
                <NumberFieldLabel>Stok Awal</NumberFieldLabel>
                <NumberFieldInput
                  onChange={(v) => setInitialStock(v > 0 ? String(v) : "")}
                  placeholder="50"
                  value={
                    initialStock() ? Number.parseInt(initialStock(), 10) : 0
                  }
                />
              </NumberField>
            </Show>
            <div class="flex flex-col gap-1.5">
              <span class={labelClass}>Satuan</span>
              <PickerField
                onChange={setUnit}
                options={UNITS.map((u) => ({
                  value: u,
                  label: u.charAt(0).toUpperCase() + u.slice(1),
                }))}
                placeholder="Pilih satuan"
                title="Pilih Satuan"
                value={unit()}
              />
            </div>
          </div>

          {/* ── Actions ── */}
          <div class="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button
              look="outline"
              onClick={() => navigate("/catalog")}
              tone="neutral"
              type="button"
            >
              Batal
            </Button>
            <Button onClick={handleSave} type="button">
              {isEditing() ? "Simpan Perubahan" : "Simpan Produk"}
            </Button>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
