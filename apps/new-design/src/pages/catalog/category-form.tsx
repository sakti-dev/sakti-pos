import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, For } from "solid-js";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Button } from "~/components/ui/button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { categories } from "~/lib/data/catalog";
import { cn } from "~/lib/utils";

/* ── Category color palette ────────────────────────────────────────
   These are DATA colors (category tags), not UI chrome — they don't
   violate the single-green brand rule. Ordered by hue for scanning.
   First entry is canopy green so the default matches our brand. */
const CATEGORY_COLORS = [
  "#1c3a13",
  "#0e7c5f",
  "#22c55e",
  "#16a34a",
  "#06b6d4",
  "#0284c7",
  "#0ea5e9",
  "#1d4ed8",
  "#6366f1",
  "#7c3aed",
  "#9333ea",
  "#db2777",
  "#e11d48",
  "#c62828",
  "#ea580c",
  "#f59e0b",
  "#e6a817",
  "#78716c",
  "#52525b",
  "#1e293b",
] as const;

export default function CategoryFormPage() {
  const navigate = useNavigate();
  const params = useParams();

  const editId = () =>
    params.id && params.id !== "new" ? params.id : undefined;
  const existing = () =>
    editId() ? categories.find((c) => c.id === editId()) : undefined;
  const isEditing = () => Boolean(existing());

  const [name, setName] = createSignal(existing()?.name ?? "");
  const [selectedColor, setSelectedColor] = createSignal(
    existing()?.color ?? CATEGORY_COLORS[0]
  );

  const handleSave = () => {
    const trimmed = name().trim();
    if (!trimmed) {
      toast.error("Nama kategori wajib diisi");
      return;
    }
    toast.success(isEditing() ? "Kategori diperbarui" : "Kategori ditambahkan");
    navigate("/catalog");
  };

  return (
    <SubPageShell
      backHref="/catalog"
      data-ssgoi-transition="/catalog/category"
      title={isEditing() ? "Edit Kategori" : "Tambah Kategori"}
    >
      <div class="scrollbar-none flex-1 overflow-y-auto px-5 py-6 pb-28">
        <div class="mx-auto w-full max-w-2xl rounded-lg border border-border bg-card p-6">
          {/* ── Name ── */}
          <TextField class="mb-6 gap-1.5" onChange={setName} value={name()}>
            <TextFieldLabel>Nama Kategori</TextFieldLabel>
            <TextFieldInput autofocus placeholder="e.g. Minuman" />
          </TextField>

          {/* ── Color ── */}
          <div class="mb-7 flex flex-col gap-2">
            <span class="font-medium text-[13px] text-foreground leading-none tracking-[0.01em]">
              Warna
            </span>
            <div class="flex flex-wrap gap-2">
              <For each={CATEGORY_COLORS}>
                {(color) => (
                  <label
                    class={cn(
                      "relative size-9 cursor-pointer rounded-md outline-none transition-[transform,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card hover:scale-110",
                      selectedColor() === color &&
                        "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                    )}
                    style={{ background: color }}
                  >
                    <input
                      aria-label={`Warna ${color}`}
                      checked={selectedColor() === color}
                      class="sr-only"
                      name="category-color"
                      onChange={() => setSelectedColor(color)}
                      type="radio"
                    />
                  </label>
                )}
              </For>
            </div>
          </div>

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
              {isEditing() ? "Simpan Perubahan" : "Simpan Kategori"}
            </Button>
          </div>
        </div>
      </div>
    </SubPageShell>
  );
}
