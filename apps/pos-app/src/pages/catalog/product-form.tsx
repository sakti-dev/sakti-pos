import {
  A,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "@solidjs/router";
import {
  createEffect,
  createResource,
  createSignal,
  onMount,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import { toast } from "solid-sonner";
import { UploadIcon, XCloseIcon } from "~/assets";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { PickerField } from "~/components/picker-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  NumberField,
  NumberFieldInput,
  NumberFieldLabel,
} from "~/components/ui/number-field";
import { RadioGroup, RadioOption } from "~/components/ui/radio-group";
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
  seedProductStock,
  setLowStockThreshold,
  stopTracking,
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
import { resolveStockSteps, type StockMode } from "./stock-steps";

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

  const [searchParams] = useSearchParams();
  const [stokHighlight, setStokHighlight] = createSignal(
    searchParams.highlight === "stok"
  );
  let stokCardRef: HTMLDivElement | undefined;

  // Deep-link from the inventory list ("Mulai Pantau"): bring the Stok
  // card into view so the merchant discovers the Terbatas radio.
  onMount(() => {
    if (!stokHighlight()) {
      return;
    }
    requestAnimationFrame(() => {
      stokCardRef?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  const [product] = createResource(
    () => (isEditing() ? params.id : undefined),
    (id) => getProduct(id!)
  );
  const [categoriesList, { refetch: refetchCategories }] =
    createResource(getCategories);

  const existing = () => product();

  const [name, setName] = createSignal("");
  const [category, setCategory] = createSignal<string>("");
  const [price, setPrice] = createSignal("");
  const [stockMode, setStockMode] = createSignal<StockMode>("unlimited");
  const [initialQty, setInitialQty] = createSignal("");
  const [threshold, setThreshold] = createSignal("");
  const [wasTracked, setWasTracked] = createSignal(false);
  const [trackedOnHand, setTrackedOnHand] = createSignal<number | null>(null);
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
          setWasTracked(stock?.tracked ?? false);
          setStockMode(stock?.tracked ? "limited" : "unlimited");
          setTrackedOnHand(stock?.onHandQty ?? null);
          setThreshold(stock?.tracked ? String(stock.lowStockThreshold) : "");
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
   * Stock steps decided by mode × tracked-state (see stock-steps.ts).
   * Failures don't block the product save — the product row is already
   * persisted, so we log and move on.
   */
  const applyStockSteps = async (productId: string) => {
    const steps = resolveStockSteps({
      mode: stockMode(),
      wasTracked: wasTracked(),
      initialQty: Number.parseFloat(initialQty().replace(",", ".")) || 0,
      threshold: Number.parseFloat(threshold().replace(",", ".")) || 0,
    });
    for (const step of steps) {
      if (step.kind === "seed") {
        await seedProductStock("product", productId, step.qty);
      } else if (step.kind === "threshold") {
        await setLowStockThreshold("product", productId, step.value);
      } else {
        await stopTracking("product", productId);
      }
    }
  };

  const runStockSteps = async (productId: string) => {
    try {
      await applyStockSteps(productId);
    } catch (error) {
      logger.warn("stock_step_failed", { error: String(error) });
    }
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
      await runStockSteps(productId);
      await setProductIngredients(productId, [...recipeRows]);
      navigate(-1);
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
      onBack={() => navigate(-1)}
      title={isEditing() ? "Edit Produk" : "Tambah Produk"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {/* ── Detail Produk ── */}
          <Card>
            <CardHeader class="p-5 pb-2">
              <CardTitle>Detail Produk</CardTitle>
            </CardHeader>
            <CardContent class="flex flex-col gap-4 p-5 pt-3">
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
                    <TextFieldInput placeholder="e.g. Es Kopi Susu" />
                  </TextField>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <span class={labelClass}>Kategori</span>
                  <PickerField
                    onChange={setCategory}
                    onCreate={async (query) => {
                      const created = await createCategory({ name: query });
                      await refetchCategories();
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
              </div>
            </CardContent>
          </Card>

          {/* ── Varian ── */}
          <Card>
            <CardHeader class="p-5 pb-2">
              <CardTitle>Varian</CardTitle>
            </CardHeader>
            <CardContent class="p-5 pt-3">
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
            </CardContent>
          </Card>

          {/* ── Stok ── */}
          <div
            class={
              stokHighlight()
                ? "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"
                : undefined
            }
            ref={(el) => {
              stokCardRef = el;
            }}
          >
            <Card>
              <CardHeader class="p-5 pb-2">
                <CardTitle>Stok</CardTitle>
              </CardHeader>
              <CardContent class="p-5 pt-3">
                <RadioGroup
                  onChange={(v) => {
                    setStockMode(v as StockMode);
                    setStokHighlight(false);
                  }}
                  value={stockMode()}
                >
                  <RadioOption
                    description="Stok tidak dipantau — produk selalu bisa dijual"
                    label="Tidak terbatas"
                    value="unlimited"
                  />
                  <RadioOption
                    description="Pantau stok — kelola via Stok & Opname"
                    label="Terbatas"
                    value="limited"
                  />
                </RadioGroup>

                <Show when={stockMode() === "limited"}>
                  <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Show
                      fallback={
                        <NumberField class="gap-1.5">
                          <NumberFieldLabel>Stok Saat Ini</NumberFieldLabel>
                          <NumberFieldInput
                            onChange={(v) => setInitialQty(String(v))}
                            placeholder="0"
                            value={
                              Number.parseInt(initialQty(), 10) || undefined
                            }
                          />
                        </NumberField>
                      }
                      when={isEditing() && wasTracked()}
                    >
                      <div class="flex flex-col gap-1.5">
                        <span class={labelClass}>Stok Saat Ini</span>
                        <div class="flex h-10 items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/40 px-3">
                          <span class="font-sans text-body-sm text-foreground">
                            {trackedOnHand()}
                          </span>
                          <A
                            class="font-medium text-caption-sm text-primary"
                            href="/inventory/stocktake/new"
                          >
                            Atur via Opname
                          </A>
                        </div>
                      </div>
                    </Show>

                    <NumberField class="gap-1.5">
                      <NumberFieldLabel>
                        Stok Minimum (opsional)
                      </NumberFieldLabel>
                      <NumberFieldInput
                        onChange={(v) => setThreshold(String(v))}
                        placeholder="5"
                        value={Number.parseInt(threshold(), 10) || undefined}
                      />
                    </NumberField>
                  </div>
                </Show>

                <Show when={wasTracked() && stockMode() === "unlimited"}>
                  <p class="mt-3 text-caption-sm text-faint-foreground">
                    Riwayat stok tetap tersimpan di Riwayat Stok.
                  </p>
                </Show>
              </CardContent>
            </Card>
          </div>

          {/* ── Resep ── */}
          <Card>
            <CardHeader class="p-5 pb-2">
              <CardTitle>Resep</CardTitle>
            </CardHeader>
            <CardContent class="p-5 pt-3">
              <RecipeField
                addLabel="Tambah Bahan"
                emptyMessage="Belum ada bahan — penjualan tidak mengurangi stok bahan baku"
                items={recipeItems()}
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
                      return rows.filter(
                        (r) => r.ingredientId !== ingredientId
                      );
                    }
                    return [...rows, { ingredientId, qtyPerUnit: 1 }];
                  })
                }
                rows={recipeRows}
                sheetTitle="Pilih Bahan Baku"
              />
              <p class="mt-1.5 text-caption-sm text-faint-foreground">
                Penjualan produk ini otomatis mengurangi stok bahan sesuai
                jumlah per porsi.
              </p>
            </CardContent>
          </Card>

          {/* ── Actions ── */}
          <div class="mt-2 flex items-center justify-end gap-3">
            <Button
              look="outline"
              onClick={() => navigate(-1)}
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
