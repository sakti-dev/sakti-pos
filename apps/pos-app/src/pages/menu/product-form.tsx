import { useNavigate, useParams } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import {
  createProduct,
  getCategories,
  getProduct,
  updateProduct,
} from "~/db/menu";

export default function ProductForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => !!params.id;
  const title = () => (isEdit() ? "Edit Produk" : "Tambah Produk");

  const [categories] = createResource(getCategories);
  const [product] = createResource(
    () => (isEdit() ? Number(params.id) : undefined),
    (id) => (id === undefined ? undefined : getProduct(id))
  );

  const [name, setName] = createSignal("");
  const [categoryId, setCategoryId] = createSignal<number | null>(null);
  const [price, setPrice] = createSignal("");
  const [imageUrl, setImageUrl] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSave = async () => {
    const trimmedName = name().trim();
    const parsedPrice = Number.parseInt(price(), 10);
    if (
      !trimmedName ||
      Number.isNaN(parsedPrice) ||
      parsedPrice < 0 ||
      categoryId() === null
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = {
        name: trimmedName,
        categoryId: categoryId()!,
        price: parsedPrice,
        imageUrl: imageUrl().trim() || null,
      };

      if (isEdit()) {
        await updateProduct(Number(params.id), data);
      } else {
        await createProduct(data);
      }
      navigate("/menu/products", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan produk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader backHref="/menu/products">{title()}</PageHeader>
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
          when={!isEdit() || (product() && categories())}
        >
          <div class="flex flex-col gap-4">
            <div>
              <label class="mb-1.5 block font-medium text-sm" for="prod-name">
                Nama Produk
              </label>
              <input
                class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                id="prod-name"
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Contoh: Kopi Susu"
                type="text"
                value={isEdit() ? (product()?.name ?? "") : name()}
              />
            </div>

            <div>
              <label
                class="mb-1.5 block font-medium text-sm"
                for="prod-category"
              >
                Kategori
              </label>
              <Select
                label="Kategori"
                name="category"
                onChange={(v) =>
                  setCategoryId(v == null ? null : (v as number))
                }
                options={
                  categories()?.map((cat) => ({
                    value: cat.id,
                    label: cat.name,
                  })) ?? []
                }
                placeholder="Pilih kategori"
                value={
                  categoryId() ??
                  (isEdit() ? product()?.categoryId : undefined) ??
                  undefined
                }
              />
            </div>

            <div>
              <label class="mb-1.5 block font-medium text-sm" for="prod-price">
                Harga (Rp)
              </label>
              <input
                class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                id="prod-price"
                inputMode="numeric"
                onInput={(e) => setPrice(e.currentTarget.value)}
                placeholder="0"
                type="number"
                value={isEdit() ? String(product()?.price ?? "") : price()}
              />
            </div>

            <div>
              <label class="mb-1.5 block font-medium text-sm" for="prod-image">
                URL Gambar <span class="text-muted-foreground">(opsional)</span>
              </label>
              <input
                class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                id="prod-image"
                onInput={(e) => setImageUrl(e.currentTarget.value)}
                placeholder="https://..."
                type="url"
                value={isEdit() ? (product()?.imageUrl ?? "") : imageUrl()}
              />
            </div>
          </div>
        </Show>

        <div class="mt-auto pt-4">
          <Button
            class="w-full"
            disabled={
              !name().trim() ||
              Number.isNaN(Number.parseInt(price(), 10)) ||
              categoryId() === null ||
              loading()
            }
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
