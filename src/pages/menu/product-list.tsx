import { A, useNavigate } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select, type SelectOption } from "~/components/ui/select";
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
  const [categories] = createResource(getCategories, {
    initialValue: undefined,
  });
  const [filterCategoryId, setFilterCategoryId] = createSignal<
    number | undefined
  >(undefined);
  const [products, { refetch }] = createResource(
    () => ({ filter: filterCategoryId() }),
    ({ filter }) => getProducts(filter)
  );

  const [deleteTarget, setDeleteTarget] = createSignal<Product | undefined>();
  const [error, setError] = createSignal("");

  const categoryOptions = createMemo<SelectOption[]>(() => [
    { value: "", label: "Semua Kategori" },
    ...(categories()?.map((cat) => ({ value: cat.id, label: cat.name })) ?? []),
  ]);

  const isGrouped = () => filterCategoryId() === undefined;

  const groupedProducts = createMemo(() => {
    const cats = categories();
    const prods = products();
    if (!(cats && prods)) {
      return [];
    }
    return cats
      .map((cat) => ({
        category: cat,
        products: prods.filter((p) => p.categoryId === cat.id),
      }))
      .filter((group) => group.products.length > 0);
  });

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
          <Select
            class="flex-1"
            label="Kategori"
            onChange={(v) =>
              setFilterCategoryId(v === "" ? undefined : (v as number))
            }
            options={categoryOptions()}
            placeholder="Semua Kategori"
            value={filterCategoryId() ?? ""}
          />
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
          <Show
            fallback={
              <div class="space-y-2">
                <For each={products()}>
                  {(product) => (
                    <div class="flex items-center gap-2 rounded-xl border bg-card p-3">
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-medium">{product.name}</p>
                        <p class="text-muted-foreground text-xs">
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
            }
            when={isGrouped()}
          >
            <div class="space-y-4">
              <For each={groupedProducts()}>
                {(group) => (
                  <div>
                    <h2 class="sticky top-14 z-30 bg-background pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      {group.category.name}
                    </h2>
                    <div class="space-y-2">
                      <For each={group.products}>
                        {(product) => (
                          <div class="flex items-center gap-2 rounded-xl border bg-card p-3">
                            <div class="min-w-0 flex-1">
                              <p class="truncate font-medium">{product.name}</p>
                              <p class="text-muted-foreground text-xs">
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
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <ConfirmDrawer
        message={`Hapus produk "${deleteTarget()?.name}"?`}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={handleDelete}
        open={!!deleteTarget()}
        title="Hapus Produk"
      />
    </>
  );
}
