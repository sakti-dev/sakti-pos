import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { UploadIcon, XCloseIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import { categories, products } from "~/lib/data/catalog";

const UNITS = ["cup", "glass", "plate", "pcs", "bowl", "bottle"] as const;

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
  const [stock, setStock] = createSignal(
    existing() ? String(existing()!.stock) : ""
  );
  const [unit, setUnit] = createSignal(existing()?.unit ?? "cup");
  const [photo, setPhoto] = createSignal<string | null>(null);

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
      data-ssgoi-transition="/catalog/product"
      title={isEditing() ? "Edit Produk" : "Tambah Produk"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl rounded-lg border border-border bg-card p-6">
          {/* ── Photo + Name + SKU ── */}
          <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div class="flex flex-col gap-1.5">
              <span class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]">
                Foto Produk
              </span>
              <label class="group relative grid h-[120px] w-[120px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg bg-muted">
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
              <div class="flex flex-col gap-1.5">
                <label
                  class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]"
                  for="fName"
                >
                  Nama Produk
                </label>
                <input
                  autofocus
                  class="h-12 w-full rounded-sm border-[1.5px] border-input bg-background px-3.5 font-sans text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                  id="fName"
                  onInput={(e) => setName(e.currentTarget.value)}
                  placeholder="e.g. Es Kopi Susu"
                  type="text"
                  value={name()}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]"
                  for="fSku"
                >
                  SKU
                </label>
                <input
                  class="h-12 w-full rounded-sm border-[1.5px] border-input bg-background px-3.5 font-sans text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                  id="fSku"
                  onInput={(e) => setSku(e.currentTarget.value)}
                  placeholder="e.g. KPI-001"
                  type="text"
                  value={sku()}
                />
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <hr class="my-6 border-border" />

          {/* ── Category + Price + Stock + Unit ── */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label
                class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]"
                for="fCategory"
              >
                Kategori
              </label>
              <select
                class="h-12 w-full cursor-pointer appearance-none rounded-sm border-[1.5px] border-input bg-[length:12px_8px] bg-[position:right_14px_center] bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2712%27%20height%3D%278%27%20viewBox%3D%270%200%2012%208%27%20fill%3D%27none%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cpath%20d%3D%27M1%201.5L6%206.5L11%201.5%27%20stroke%3D%27%23737c77%27%20stroke-width%3D%271.5%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%2F%3E%3C%2Fsvg%3E')] bg-background bg-no-repeat px-3.5 pr-9 font-sans text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-standard ease-standard focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                id="fCategory"
                onChange={(e) => setCategory(e.currentTarget.value)}
                value={category()}
              >
                <option disabled value="">
                  Pilih kategori
                </option>
                <For each={categories}>
                  {(cat) => <option value={cat.id}>{cat.name}</option>}
                </For>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label
                class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]"
                for="fPrice"
              >
                Harga (Rp)
              </label>
              <input
                class="h-12 w-full rounded-sm border-[1.5px] border-input bg-background px-3.5 font-sans text-[15px] text-foreground tabular-nums outline-none transition-[border-color,box-shadow] duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                id="fPrice"
                min="0"
                onInput={(e) => setPrice(e.currentTarget.value)}
                placeholder="25000"
                type="number"
                value={price()}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label
                class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]"
                for="fStock"
              >
                Stok
              </label>
              <input
                class="h-12 w-full rounded-sm border-[1.5px] border-input bg-background px-3.5 font-sans text-[15px] text-foreground tabular-nums outline-none transition-[border-color,box-shadow] duration-standard ease-standard placeholder:text-muted-foreground focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                id="fStock"
                min="0"
                onInput={(e) => setStock(e.currentTarget.value)}
                placeholder="50"
                type="number"
                value={stock()}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label
                class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]"
                for="fUnit"
              >
                Satuan
              </label>
              <select
                class="h-12 w-full cursor-pointer appearance-none rounded-sm border-[1.5px] border-input bg-[length:12px_8px] bg-[position:right_14px_center] bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2712%27%20height%3D%278%27%20viewBox%3D%270%200%2012%208%27%20fill%3D%27none%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cpath%20d%3D%27M1%201.5L6%206.5L11%201.5%27%20stroke%3D%27%23737c77%27%20stroke-width%3D%271.5%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%2F%3E%3C%2Fsvg%3E')] bg-background bg-no-repeat px-3.5 pr-9 font-sans text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-standard ease-standard focus:border-primary focus:outline-2 focus:outline-ring focus:outline-offset-1 focus:ring-2 focus:ring-primary/10 dark:focus:border-accent"
                id="fUnit"
                onChange={(e) => setUnit(e.currentTarget.value)}
                value={unit()}
              >
                <For each={UNITS}>
                  {(u) => (
                    <option value={u}>
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </option>
                  )}
                </For>
              </select>
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
