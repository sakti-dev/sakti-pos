import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, Show } from "solid-js";
import { createStore } from "solid-js/store";
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
import {
  createCategory,
  createProduct,
  getCategories,
  getProduct,
  updateProduct,
} from "~/db/catalog";
import { getIngredients } from "~/db/ingredients";
import {
  getProductStock,
  setLowStockThreshold,
  startTracking,
} from "~/db/inventory";
import {
  getModifierGroups,
  setProductModifierGroups,
} from "~/db/modifier-groups";
import { getProductIngredients, setProductIngredients } from "~/db/recipes";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";
import { pickProductImage } from "~/lib/assets/product-image";
import { resolveImageUrl } from "~/lib/assets/resolve";
import { createLogger } from "~/lib/utils";
import { AttachmentField } from "./components/attachment-field";
import { RecipeField, type RecipeRowState } from "./components/recipe-field";

const logger = createLogger({ domain: "POS", module: "product-form" });

const labelClass =
  "font-medium text-body-sm text-foreground leading-none tracking-normal";

interface StagedPhoto {
  readonly assetId: string | null;
  readonly url: string;
}

export default function ProductFormPage() {
  const navigate = useNavigate();
  const params = useParams();

  const isEditing = () => Boolean(params.id) && params.id !== "new";

  const [product] = createResource(
    () => (isEditing() ? params.id : undefined),
    (id) => getProduct(id!)
  );
  const [categoriesList] = createResource(getCategories);

  const existing = () => product();

  const [name, setName] = createSignal("");
  const [category, setCategory] = createSignal<string>("");
  const [price, setPrice] = createSignal("");
  const [threshold, setThreshold] = createSignal("");
  const [photo, setPhoto] = createSignal<StagedPhoto | null>(null);
  const [saving, setSaving] = createSignal(false);

  const groupsQuery = useDrizzleQuery(
    ["drizzle", "modifier-groups", "list"],
    () => getModifierGroups()
  );
  const [attachedGroups, setAttachedGroups] = createStore<
    Record<string, boolean>
  >({});
  const [groupsHydrated, setGroupsHydrated] = createSignal(false);

  const bahanQuery = useDrizzleQuery(["drizzle", "ingredients", "list"], () =>
    getIngredients()
  );
  const [recipeRows, setRecipeRows] = createStore<RecipeRowState[]>([]);
  const [recipeHydrated, setRecipeHydrated] = createSignal(false);

  // Edit mode: pre-check groups currently linked to this product.
  createEffect(() => {
    if (!isEditing() || groupsHydrated() || !product()) {
      return;
    }
    const productId = product()!.id;
    const next: Record<string, boolean> = {};
    for (const group of groupsQuery.data() ?? []) {
      next[group.id] = group.products.some((p) => p.id === productId);
    }
    setAttachedGroups(next);
    setGroupsHydrated(true);
  });

  const selectedGroupIds = () =>
    (groupsQuery.data() ?? [])
      .filter((g) => attachedGroups[g.id])
      .map((g) => g.id);

  // Recipe items: active bahan plus any linked-but-deactivated ones so
  // the warning state can render (spec: never silently drop).
  const [linkedInactive, setLinkedInactive] = createStore<
    { id: string; isActive: false; title: string; unit: string }[]
  >([]);
  const recipeItems = () => {
    const active = (bahanQuery.data() ?? []).map((i) => ({
      id: i.id,
      isActive: true,
      title: i.name,
      unit: i.unit,
    }));
    const activeIds = new Set(active.map((i) => i.id));
    return [...active, ...linkedInactive.filter((i) => !activeIds.has(i.id))];
  };

  // Edit mode: pre-load this product's recipe rows.
  createEffect(() => {
    if (!isEditing() || recipeHydrated() || !product()) {
      return;
    }
    const productId = product()!.id;
    getProductIngredients(productId)
      .then((rows) => {
        setRecipeRows(
          rows.map((r) => ({
            ingredientId: r.ingredientId,
            qtyPerUnit: r.qtyPerUnit,
          }))
        );
        setLinkedInactive(
          rows
            .filter((r) => !r.isActive)
            .map((r) => ({
              id: r.ingredientId,
              isActive: false as const,
              title: r.ingredientName,
              unit: r.unit,
            }))
        );
      })
      .catch(() => undefined);
    setRecipeHydrated(true);
  });

  createResource(
    () => existing()?.imageAssetId ?? null,
    async (assetId) => {
      const resolved = await resolveImageUrl(assetId);
      if (resolved) {
        setPhoto(resolved);
      }
    }
  );

  createResource(
    () => existing()?.id ?? null,
    (id) => {
      if (!id) {
        return;
      }
      getProductStock(id)
        .then((stock) => {
          setThreshold(
            stock?.lowStockThreshold !== null &&
              stock?.lowStockThreshold !== undefined
              ? String(stock.lowStockThreshold)
              : ""
          );
        })
        .catch(() => undefined);
      const row = existing();
      setName(row?.name ?? "");
      setCategory(row?.categoryId ?? "");
      setPrice(row ? String(row.priceMinorUnits / 100) : "");
    }
  );

  const handlePhotoPick = async () => {
    const picked = await pickProductImage();
    if (picked) {
      setPhoto({ assetId: picked.assetId, url: picked.previewUrl });
    } else {
      toast.error("Gagal memilih foto");
    }
  };

  const saveLabel = () => {
    if (saving()) {
      return "Menyimpan…";
    }
    return isEditing() ? "Simpan Perubahan" : "Simpan Produk";
  };

  /**
   * Stok minimum: setting a value on an untracked product starts
   * tracking (row-exists convention); clearing it just nulls the
   * threshold. Failures don't block the product save.
   */
  const applyThreshold = async (productId: string) => {
    const raw = threshold().trim();
    if (raw.length === 0) {
      const stock = await getProductStock(productId);
      if (stock?.tracked) {
        await setLowStockThreshold("product", productId, null);
      }
      return;
    }
    const value = Number.parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    const stock = await getProductStock(productId);
    if (!stock?.tracked) {
      await startTracking("product", productId);
    }
    await setLowStockThreshold("product", productId, value);
  };

  const validate = (): { name: string; price: number } | null => {
    const trimmedName = name().trim();
    if (!trimmedName) {
      toast.error("Nama produk wajib diisi");
      return null;
    }
    if (!category()) {
      toast.error("Pilih kategori");
      return null;
    }
    const priceNum = Number.parseInt(price(), 10);
    if (!priceNum || priceNum <= 0) {
      toast.error("Harga wajib diisi");
      return null;
    }
    return { name: trimmedName, price: priceNum };
  };

  const handleSave = async () => {
    const valid = validate();
    if (!valid) {
      return;
    }

    setSaving(true);
    try {
      let productId: string;
      if (isEditing() && existing()) {
        await updateProduct(existing()!.id, {
          categoryId: category(),
          ...(photo()?.assetId ? { imageAssetId: photo()!.assetId } : {}),
          name: valid.name,
          price: valid.price,
        });
        productId = existing()!.id;
        toast.success("Produk diperbarui");
      } else {
        const created = await createProduct({
          categoryId: category(),
          ...(photo()?.assetId ? { imageAssetId: photo()!.assetId } : {}),
          name: valid.name,
          price: valid.price,
        });
        productId = created.id;
        toast.success(
          photo()?.assetId
            ? "Produk ditambahkan — foto akan diproses di background"
            : "Produk ditambahkan"
        );
      }
      await setProductModifierGroups(productId, selectedGroupIds());
      await applyThreshold(productId);
      await setProductIngredients(productId, [...recipeRows]);
      navigate("/catalog");
    } catch (error) {
      logger.error("PRODUCT_SAVE_FAILED", { error: String(error) });
      toast.error("Gagal menyimpan produk");
      setSaving(false);
    }
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition={useLocation().pathname}
      title={isEditing() ? "Edit Produk" : "Tambah Produk"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6">
          {/* ── Photo + Name ── */}
          <div class="flex flex-col gap-5 sm:flex-row">
            <div class="flex flex-col gap-1.5">
              <span class={labelClass}>Foto Produk</span>
              <button
                class="group relative grid aspect-square size-[120px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border-2 border-input border-dashed bg-background sm:size-[132px]"
                onClick={handlePhotoPick}
                type="button"
              >
                <Show when={photo()}>
                  <img
                    alt="Preview"
                    class="absolute inset-0 h-full w-full object-cover"
                    src={photo()!.url}
                  />
                </Show>
                <Show when={!photo()}>
                  <div class="flex flex-col items-center gap-1.5 text-muted-foreground transition-colors group-hover:text-foreground">
                    <UploadIcon class="h-6 w-6" />
                    <span class="font-medium text-caption-sm">Upload</span>
                  </div>
                </Show>
              </button>
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
            </div>
          </div>

          {/* ── Divider ── */}
          <hr class="my-6 border-border" />

          {/* ── Category + Price ── */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <span class={labelClass}>Kategori</span>
              <PickerField
                onChange={setCategory}
                onCreate={async (query) => {
                  const created = await createCategory({ name: query });
                  return created.id;
                }}
                options={(categoriesList() ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                placeholder="Pilih kategori"
                title="Pilih Kategori"
                value={category()}
              />
            </div>

            <NumberField class="gap-1.5">
              <NumberFieldLabel>Harga (Rp)</NumberFieldLabel>
              <NumberFieldInput
                onChange={(v) => setPrice(String(v))}
                placeholder="25000"
                value={Number.parseInt(price(), 10) || undefined}
              />
            </NumberField>

            <div class="gap-1.5">
              <label class="flex flex-col gap-1">
                <span class={labelClass}>
                  Stok Minimum (opsional){" "}
                  <span class="font-normal text-faint-foreground">
                    — mulai pantau stok produk ini
                  </span>
                </span>
                <input
                  class="h-10 rounded-md border border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                  inputMode="decimal"
                  onInput={(e) => setThreshold(e.currentTarget.value)}
                  placeholder="Contoh: 5"
                  type="text"
                  value={threshold()}
                />
              </label>
            </div>
          </div>

          {/* ── Modifier groups (varian) ── */}
          <div class="mt-6">
            <AttachmentField
              addLabel="Tambah Varian"
              emptyMessage="Belum ada varian — buat dulu di tab Varian"
              items={(groupsQuery.data() ?? []).map((g) => ({
                id: g.id,
                subtitle: `${g.selectionType === "single" ? "Pilih satu" : "Bisa beberapa"} · ${g.isRequired ? "Wajib" : "Opsional"} · ${g.options.length} opsi`,
                title: g.name,
              }))}
              label="Varian"
              onToggle={(id) => setAttachedGroups(id, (on) => !on)}
              selected={attachedGroups}
              sheetTitle="Pilih Varian"
            />
          </div>

          {/* ── Bahan baku (resep) ── */}
          <div class="mt-6">
            <RecipeField
              addLabel="Tambah Bahan"
              emptyMessage="Belum ada bahan — penjualan tidak mengurangi stok bahan baku"
              items={recipeItems()}
              label="Bahan Baku (resep)"
              onQty={(ingredientId, qty) =>
                setRecipeRows((rows) =>
                  rows.map((r) =>
                    r.ingredientId === ingredientId
                      ? { ...r, qtyPerUnit: qty }
                      : r
                  )
                )
              }
              onRemove={(ingredientId) =>
                setRecipeRows((rows) =>
                  rows.filter((r) => r.ingredientId !== ingredientId)
                )
              }
              onSelect={(ingredientId) =>
                setRecipeRows((rows) => {
                  if (rows.some((r) => r.ingredientId === ingredientId)) {
                    return rows.filter((r) => r.ingredientId !== ingredientId);
                  }
                  return [...rows, { ingredientId, qtyPerUnit: 1 }];
                })
              }
              rows={recipeRows}
              sheetTitle="Pilih Bahan Baku"
            />
            <p class="mt-1.5 text-caption-sm text-faint-foreground">
              Penjualan produk ini otomatis mengurangi stok bahan sesuai jumlah
              per porsi.
            </p>
          </div>

          {/* ── Actions ── */}
          <div class="mt-8 flex items-center justify-end gap-3">
            <Button
              look="outline"
              onClick={() => navigate("/catalog")}
              tone="neutral"
              type="button"
            >
              Batal
            </Button>
            <Button
              disabled={saving() || product.loading}
              onClick={handleSave}
              type="button"
            >
              {saveLabel()}
            </Button>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
