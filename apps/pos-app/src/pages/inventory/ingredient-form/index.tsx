import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { PickerField } from "~/components/picker-field";
import { Button } from "~/components/ui/button";
import {
  createIngredientCategory,
  getIngredientCategories,
} from "~/db/ingredient-categories";
import {
  createIngredient,
  getIngredients,
  softDeleteIngredient,
  updateIngredient,
} from "~/db/ingredients";
import {
  getIngredientStockList,
  nextGoodsReceiptRef,
  recordGoodsReceipt,
  setLowStockThreshold,
  startTracking,
  stopTracking,
} from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";

const UNIT_OPTIONS = ["Pcs/Sachet", "Kg", "Gram", "Liter"] as const;

/** Session handoff: ingredient screen → open penerimaan nota. */
export const PENDING_RECEIPT_ADD_KEY = "sakti:pending-receipt-add";

export default function IngredientFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const isEditing = () => Boolean(params.id) && params.id !== "new";
  /** Created from the penerimaan picker — no stok awal (the nota line is
      the stock entry), and we return to the nota with an auto-add. */
  const fromReceipt = () => searchParams.context === "receipt";

  const [name, setName] = createSignal("");
  const [unit, setUnit] = createSignal<string>(UNIT_OPTIONS[0]);
  const [category, setCategory] = createSignal("");
  const [threshold, setThreshold] = createSignal("");
  const [openingQty, setOpeningQty] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  /* Prefill create-from-picker with the typed search. */
  if (!isEditing() && searchParams.name) {
    setName(String(searchParams.name));
  }

  const categoriesQuery = useDrizzleQuery(
    ["drizzle", "ingredient-categories", "list"],
    () => getIngredientCategories()
  );
  const categoryOptions = () =>
    (categoriesQuery.data() ?? []).map((c) => ({ label: c, value: c }));

  /* Edit mode: hydrate fields from the ingredient + its balance. */
  const [listResult] = createResource(
    () => (isEditing() ? params.id : null),
    async (id) => {
      const [ingredients, stocks] = await Promise.all([
        getIngredients(),
        getIngredientStockList(),
      ]);
      const ingredient = ingredients.find((i) => i.id === id);
      const stock = stocks.find((s) => s.id === id);
      return { ingredient, stock };
    }
  );
  createResource(
    () => listResult()?.ingredient ?? null,
    (ingredient) => {
      setName(ingredient.name);
      setUnit(ingredient.unit);
      setCategory(ingredient.category ?? "");
    }
  );
  createResource(
    () => listResult()?.stock ?? null,
    (stock) => {
      setThreshold(stock?.tracked ? String(stock.lowStockThreshold) : "");
    }
  );

  const canSave = () => name().trim().length > 0 && !saving();

  const saveLabel = (): string => {
    if (saving()) {
      return "Menyimpan…";
    }
    return isEditing() ? "Simpan Perubahan" : "Tambah Bahan";
  };

  const parseQty = (raw: string): number | null => {
    const n = Number.parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  /** Stok awal (standalone create only): writes a "Saldo awal"
      penerimaan event so the balance jump stays auditable in Riwayat. */
  const applyOpeningQty = async (ingredientId: string) => {
    const qty = parseQty(openingQty());
    if (qty === null || qty === 0) {
      return;
    }
    const ref = await nextGoodsReceiptRef();
    await recordGoodsReceipt({
      lines: [
        {
          qty,
          targetId: ingredientId,
          targetType: "ingredient",
          unitCostMinorUnits: null,
        },
      ],
      note: "Saldo awal",
      ref,
      supplierName: null,
    });
  };

  const applyThreshold = async (ingredientId: string) => {
    const value = parseQty(threshold());
    const stocks = await getIngredientStockList();
    const stock = stocks.find((s) => s.id === ingredientId);
    if (value === null || value === 0) {
      if (stock?.tracked) {
        await setLowStockThreshold("ingredient", ingredientId, 0);
      }
      return;
    }
    /* Setting a minimum on an untracked item starts tracking (row-exists
       convention) — otherwise setLowStockThreshold throws. */
    if (!stock?.tracked) {
      await startTracking("ingredient", ingredientId);
    }
    await setLowStockThreshold("ingredient", ingredientId, value);
  };

  const handleDeactivate = () => {
    if (saving() || !isEditing() || !params.id) {
      return;
    }
    setSaving(true);
    const id = params.id;
    softDeleteIngredient(id)
      .then(() => stopTracking("ingredient", id))
      .then(() => {
        toast.success("Bahan dinonaktifkan — riwayat tetap tersimpan");
        navigate("/inventory?tab=ingredient");
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Gagal menonaktifkan bahan"
        );
        setSaving(false);
      });
  };

  const handleSave = () => {
    if (!canSave()) {
      return;
    }
    setSaving(true);

    const finishCreate = async (id: string) => {
      await applyThreshold(id);
      if (fromReceipt()) {
        sessionStorage.setItem(
          PENDING_RECEIPT_ADD_KEY,
          JSON.stringify({ id, name: name().trim(), unit: unit() })
        );
        navigate("/inventory/goods-receipt/new");
        return;
      }
      await applyOpeningQty(id);
      toast.success(`Bahan ${name().trim()} ditambahkan`);
      navigate("/inventory?tab=ingredient");
    };

    if (isEditing() && params.id) {
      const editId = params.id;
      updateIngredient(editId, {
        category: category().trim() || null,
        name: name().trim(),
        sku: null,
        unit: unit(),
      })
        .then(() => applyThreshold(editId))
        .then(() => {
          toast.success("Bahan diperbarui");
          navigate("/inventory?tab=ingredient");
        })
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error ? error.message : "Gagal menyimpan bahan"
          );
          setSaving(false);
        });
      return;
    }

    createIngredient({
      category: category().trim() || null,
      name: name().trim(),
      sku: null,
      unit: unit(),
    })
      .then(finishCreate)
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Gagal menambah bahan"
        );
        setSaving(false);
      });
  };

  return (
    <SubPageShell
      backHref={
        fromReceipt()
          ? "/inventory/goods-receipt/new"
          : "/inventory?tab=ingredient"
      }
      data-ssgoi-transition={location.pathname}
      title={isEditing() ? "Ubah Bahan Baku" : "Bahan Baku Baru"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl space-y-5 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-6">
          <label class="flex flex-col gap-1">
            <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
              Nama Bahan <span class="text-danger">*</span>
            </span>
            <input
              class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Contoh: Biji Kopi Arabica"
              type="text"
              value={name()}
            />
          </label>

          <div class="flex flex-col gap-1">
            <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
              Satuan Stok <span class="text-danger">*</span>
            </span>
            <div class="flex flex-wrap gap-2">
              <For each={[...UNIT_OPTIONS]}>
                {(u) => (
                  <button
                    class={`rounded-full px-3 py-1.5 font-medium text-caption transition-colors ${
                      unit() === u
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:border-primary/50"
                    }`}
                    onClick={() => setUnit(u)}
                    type="button"
                  >
                    {u}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
              Kategori{" "}
              <span class="font-normal text-faint-foreground">(opsional)</span>
            </span>
            <PickerField
              onChange={setCategory}
              onCreate={async (query) => {
                const created = await createIngredientCategory(query);
                categoriesQuery.refetch();
                return created;
              }}
              options={categoryOptions()}
              placeholder="Pilih atau ketik kategori baru"
              title="Kategori"
              value={category()}
            />
          </div>

          <label class="flex flex-col gap-1">
            <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
              Stok Minimum{" "}
              <span class="font-normal text-faint-foreground">(opsional)</span>
            </span>
            <input
              class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              inputMode="decimal"
              onInput={(e) => setThreshold(e.currentTarget.value)}
              placeholder={`Contoh: 2 (${unit().toLowerCase()})`}
              type="text"
              value={threshold()}
            />
            <span class="text-caption-sm text-faint-foreground">
              Peringatan &ldquo;Stok menipis&rdquo; saat sisa ≤ angka ini
            </span>
          </label>

          <Show when={!(isEditing() || fromReceipt())}>
            <label class="flex flex-col gap-1">
              <span class="font-medium text-body-sm text-foreground leading-none tracking-normal">
                Stok Awal{" "}
                <span class="font-normal text-faint-foreground">
                  (opsional)
                </span>
              </span>
              <input
                class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                inputMode="decimal"
                onInput={(e) => setOpeningQty(e.currentTarget.value)}
                placeholder={`Contoh: 2 (${unit().toLowerCase()})`}
                type="text"
                value={openingQty()}
              />
              <span class="text-caption-sm text-faint-foreground">
                Tercatat sebagai penerimaan &ldquo;Saldo awal&rdquo; di Riwayat
              </span>
            </label>
          </Show>

          <Show when={isEditing()}>
            <div class="flex items-center justify-between gap-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-4 py-3">
              <div>
                <p class="font-medium text-body-sm text-foreground">
                  Nonaktifkan bahan
                </p>
                <p class="text-caption-sm text-muted-foreground">
                  Sembunyikan dari daftar; riwayat tetap tersimpan
                </p>
              </div>
              <Button
                look="outline"
                onClick={handleDeactivate}
                size="sm"
                tone="danger"
                type="button"
              >
                Nonaktifkan
              </Button>
            </div>
          </Show>
        </div>

        {/* ── Actions ── */}
        <div class="mx-auto mt-6 flex w-full max-w-2xl items-center justify-end gap-3">
          <Button
            look="outline"
            onClick={() =>
              navigate(
                fromReceipt()
                  ? "/inventory/goods-receipt/new"
                  : "/inventory?tab=ingredient"
              )
            }
            tone="neutral"
            type="button"
          >
            Batal
          </Button>
          <Button
            disabled={!canSave()}
            look="solid"
            onClick={handleSave}
            tone="primary"
            type="button"
          >
            {saveLabel()}
          </Button>
        </div>
      </div>
    </SubPageShell>
  );
}
