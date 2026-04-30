import { useNavigate, useParams } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { createCategory, getCategory, updateCategory } from "~/db/menu";

export default function CategoryForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => !!params.id;
  const title = () => (isEdit() ? "Edit Kategori" : "Tambah Kategori");

  const [category] = createResource(
    () => (isEdit() ? Number(params.id) : undefined),
    (id) => (id === undefined ? undefined : getCategory(id))
  );

  const [name, setName] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSave = async () => {
    const trimmed = name().trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isEdit()) {
        await updateCategory(Number(params.id), { name: trimmed });
      } else {
        await createCategory({ name: trimmed });
      }
      navigate("/menu/categories");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan kategori");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader backHref="/menu/categories">{title()}</PageHeader>
      <div class="flex flex-1 flex-col p-4">
        <Show when={error()}>
          <div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
            {error()}
          </div>
        </Show>

        <Show
          fallback={
            <div class="flex flex-1 items-center justify-center text-muted-foreground">
              Memuat...
            </div>
          }
          when={!isEdit() || category()}
        >
          <div class="flex flex-col gap-4">
            <div>
              <label class="mb-1.5 block font-medium text-sm" for="cat-name">
                Nama Kategori
              </label>
              <input
                class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                id="cat-name"
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Contoh: Minuman"
                type="text"
                value={isEdit() ? (category()?.name ?? "") : name()}
              />
            </div>
          </div>
        </Show>

        <div class="mt-auto pt-4">
          <Button
            class="w-full"
            disabled={!name().trim() || loading()}
            onClick={handleSave}
            size="lg"
          >
            {loading() ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </>
  );
}
