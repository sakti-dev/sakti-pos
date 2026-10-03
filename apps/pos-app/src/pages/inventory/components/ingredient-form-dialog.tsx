import { FiPlus } from "solid-icons/fi";
import { createSignal, For } from "solid-js";
import { toast } from "solid-sonner";
import { PickerField } from "~/components/picker-field";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { Button } from "~/components/ui/button";
import { createIngredient, getIngredientCategories } from "~/db/ingredients";
import { setLowStockThreshold } from "~/db/inventory";
import { useDrizzleQuery } from "~/lib/api/use-drizzle-query";

const UNIT_OPTIONS = ["Pcs/Sachet", "Kg", "Gram", "Liter"] as const;

interface IngredientFormDialogProps {
  readonly onCreated: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function IngredientFormDialog(props: IngredientFormDialogProps) {
  const [name, setName] = createSignal("");
  const [unit, setUnit] = createSignal<string>(UNIT_OPTIONS[0]);
  const [category, setCategory] = createSignal("");
  const [threshold, setThreshold] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const categoriesQuery = useDrizzleQuery(
    ["drizzle", "ingredients", "categories"],
    () => getIngredientCategories()
  );
  /** Categories created inline this session — kept until a saved bahan
      row carries them into the distinct list. */
  const [extraCategories, setExtraCategories] = createSignal<string[]>([]);
  const categoryOptions = () => {
    const base = categoriesQuery.data() ?? [];
    return [...new Set([...base, ...extraCategories()])].map((c) => ({
      label: c,
      value: c,
    }));
  };

  const canCreate = () => name().trim().length > 0 && !saving();

  const handleCreate = () => {
    const trimmed = name().trim();
    if (!trimmed || saving()) {
      return;
    }
    setSaving(true);
    createIngredient({
      category: category(),
      name: trimmed,
      sku: null,
      unit: unit(),
    })
      .then(async (id) => {
        const min = Number.parseFloat(threshold().replace(",", "."));
        if (Number.isFinite(min) && min >= 0) {
          await setLowStockThreshold("ingredient", id, min);
        }
        toast.success(`Bahan ${trimmed} ditambahkan`);
        reset();
        props.onCreated();
        props.onOpenChange(false);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Gagal menambah bahan"
        );
      })
      .finally(() => setSaving(false));
  };

  const reset = () => {
    setName("");
    setUnit(UNIT_OPTIONS[0]);
    setCategory("");
    setThreshold("");
  };

  return (
    <AdaptiveDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AdaptiveDialogContent>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>Bahan Baku Baru</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            Tambahkan bahan mentah baru ke gudang dapur.
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <div class="space-y-4">
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption text-muted-foreground">
              Nama Bahan <span class="text-danger">*</span>
            </span>
            <input
              class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Contoh: Cabai Rawit / Nescafe Sachet"
              type="text"
              value={name()}
            />
          </label>
          <div class="flex flex-col gap-1">
            <span class="font-medium text-caption text-muted-foreground">
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
            <span class="font-medium text-caption text-muted-foreground">
              Kategori
            </span>
            <PickerField
              onChange={setCategory}
              onCreate={(query) => {
                setExtraCategories((prev) => [...new Set([...prev, query])]);
                return query;
              }}
              options={categoryOptions()}
              placeholder="Pilih atau ketik kategori baru"
              title="Kategori"
              value={category()}
            />
          </div>
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption text-muted-foreground">
              Stok Minimum (opsional)
            </span>
            <input
              class="h-10 rounded-md border-2 border-input bg-background px-3 font-sans text-body-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              inputMode="decimal"
              onInput={(e) => setThreshold(e.currentTarget.value)}
              placeholder={`Contoh: 2 (${unit().toLowerCase()})`}
              type="text"
              value={threshold()}
            />
          </label>
        </div>
        <AdaptiveDialogFooter>
          <Button
            look="ghost"
            onClick={() => {
              reset();
              props.onOpenChange(false);
            }}
            tone="neutral"
            type="button"
          >
            Batal
          </Button>
          <Button
            disabled={!canCreate()}
            look="solid"
            onClick={handleCreate}
            tone="primary"
            type="button"
          >
            <FiPlus class="h-4 w-4" /> Tambah
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
