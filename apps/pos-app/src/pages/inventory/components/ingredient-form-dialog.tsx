import { FiPlus } from "solid-icons/fi";
import { createSignal, For } from "solid-js";
import { PickerField, type PickerOption } from "~/components/picker-field";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { Button } from "~/components/ui/button";
import { addIngredient } from "./lib/ingredients";

const UNIT_OPTIONS = ["Pcs/Sachet", "Kg", "Gram", "Liter"] as const;

const CATEGORY_OPTIONS: PickerOption[] = [
  { label: "Bumbu & Bahan Dapur", value: "Bumbu & Bahan Dapur" },
  { label: "Sachet & Minuman", value: "Sachet & Minuman" },
  { label: "Bumbu Kering", value: "Bumbu Kering" },
  { label: "Lainnya", value: "Lainnya" },
];

interface IngredientFormDialogProps {
  readonly onCreated: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function IngredientFormDialog(props: IngredientFormDialogProps) {
  const [name, setName] = createSignal("");
  const [unit, setUnit] = createSignal<string>(UNIT_OPTIONS[0]);
  const [category, setCategory] = createSignal("Bumbu & Bahan Dapur");

  const canCreate = () => name().trim().length > 0;

  const handleCreate = () => {
    const trimmed = name().trim();
    if (!trimmed) {
      return;
    }
    addIngredient({
      name: trimmed,
      unit: unit(),
      category: category(),
    });
    reset();
    props.onCreated();
    props.onOpenChange(false);
  };

  const reset = () => {
    setName("");
    setUnit(UNIT_OPTIONS[0]);
    setCategory("Bumbu & Bahan Dapur");
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
          <PickerField
            onChange={setCategory}
            options={CATEGORY_OPTIONS}
            placeholder="Pilih kategori"
            title="Kategori"
            value={category()}
          />
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
