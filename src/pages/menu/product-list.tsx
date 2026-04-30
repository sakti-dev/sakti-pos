import { A, useNavigate } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { ConfirmBottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import {
  deleteProduct,
  getCategories,
  getProducts,
  type Product,
  updateProduct,
} from "~/db/menu";
import { cn, formatIDR } from "~/lib/utils";

export default function ProductList() {
  const navigate = useNavigate();
  const [categories] = createResource(getCategories);
  const [filterCategoryId, setFilterCategoryId] = createSignal<
    number | undefined
  >(undefined);
  const [products, { refetch }] = createResource(
    () => filterCategoryId(),
    (id) => getProducts(id)
  );

  const [deleteTarget, setDeleteTarget] = createSignal<Product | undefined>();
  const [error, setError] = createSignal("");

  const categoryName = (catId: number | null) => {
    if (catId === null) {
      return "-";
    }
    return categories()?.find((c) => c.id === catId)?.name ?? "-";
  };

  const handleDelete = async () => {
    const target = deleteTarget();
    if (!target) {
      return;
    }
    try {
      await deleteProduct(target.id);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus produk");
    }
  };

  const toggleActive = async (product: Product) => {
    try {
      await updateProduct(product.id, { isActive: !product.isActive });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  return (
    <>
      <PageHeader backHref="/menu">Produk</PageHeader>
      <div class="p-4">
        <Show when={error()}>
          {(msg) => (
            <div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
              <div class="flex items-center justify-between">
                <span>{msg()}</span>
                <button onClick={() => setError("")} type="button">
                  ✕
                </button>
              </div>
            </div>
          )}
        </Show>

        <div class="mb-4 flex items-center justify-between gap-2">
          <select
            class="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            onChange={(e) => {
              const val = e.currentTarget.value;
              setFilterCategoryId(val ? Number(val) : undefined);
            }}
          >
            <option value="">Semua Kategori</option>
            <For each={categories()}>
              {(cat) => <option value={cat.id}>{cat.name}</option>}
            </For>
          </select>
          <A href="/menu/products/add">
            <Button size="sm">+ Tambah</Button>
          </A>
        </div>

        <Show
          fallback={
            <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>Belum ada produk</p>
              <p class="text-sm">Tap "+ Tambah" untuk membuat produk baru</p>
            </div>
          }
          when={products() && products()!.length > 0}
        >
          <div class="space-y-2">
            <For each={products()}>
              {(product) => (
                <div class="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{product.name}</p>
                    <p class="text-muted-foreground text-xs">
                      {categoryName(product.categoryId)} ·{" "}
                      {formatIDR(product.price)}
                    </p>
                  </div>
                  <button
                    class={cn(
                      "shrink-0 rounded-full px-2.5 py-1 font-medium text-xs",
                      product.isActive
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                    onClick={() => toggleActive(product)}
                    type="button"
                  >
                    {product.isActive ? "Aktif" : "Nonaktif"}
                  </button>
                  <button
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                    onClick={() =>
                      navigate(`/menu/products/${product.id}/edit`)
                    }
                    type="button"
                  >
                    ✏️
                  </button>
                  <button
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                    onClick={() => setDeleteTarget(product)}
                    type="button"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <ConfirmBottomSheet
        message={`Hapus produk "${deleteTarget()?.name}"?`}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={handleDelete}
        open={!!deleteTarget()}
        title="Hapus Produk"
      />
    </>
  );
}
