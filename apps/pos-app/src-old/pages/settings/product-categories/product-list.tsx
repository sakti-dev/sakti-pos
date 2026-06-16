import { A, type RouteSectionProps, useNavigate } from "@solidjs/router";
import {
  TbOutlinePackage,
  TbOutlinePencil,
  TbOutlineTrash,
} from "solid-icons/tb";
import {
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Suspense,
  Switch,
} from "solid-js";
import { toast } from "solid-sonner";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { ProductImage } from "~/components/image";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { PageHeader } from "~/components/ui/page-header";
import { Select, type SelectOption } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  deleteProduct,
  getCategories,
  getProducts,
  type Product,
  updateProduct,
} from "~/db/menu";
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
import { cn, formatIDR } from "~/lib/utils";

export default function ProductList(
  props: Partial<RouteSectionProps> & { hideHeader?: boolean } = {}
) {
  const navigate = useNavigate();
  const categoriesQuery = useDrizzleQuery(["categories"], () =>
    getCategories()
  );
  const [filterCategoryId, setFilterCategoryId] = createSignal<
    string | undefined
  >(undefined);
  const productsQuery = useDrizzleQuery(
    () => filterCategoryId(),
    () => getProducts(filterCategoryId())
  );

  const [deleteTarget, setDeleteTarget] = createSignal<Product | undefined>();
  const [error, setError] = createSignal("");

  const categoryOptions = createMemo<SelectOption[]>(() => [
    { value: "", label: "Semua Kategori" },
    ...(categoriesQuery
      .data()
      ?.map((cat) => ({ value: cat.id, label: cat.name })) ?? []),
  ]);

  const isGrouped = () => filterCategoryId() === undefined;

  const groupedProducts = createMemo(() => {
    const cats = categoriesQuery.data();
    const prods = productsQuery.data();
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
      await productsQuery.refetch();
      toast.success("Produk dihapus");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus produk");
    }
  };

  const toggleActive = async (product: Product) => {
    try {
      await updateProduct(product.id, { isActive: !product.isActive });
      await productsQuery.refetch();
      toast.success(
        product.isActive ? "Produk dinonaktifkan" : "Produk diaktifkan"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  };

  const productCard = (product: Product) => (
    <Card class="flex items-center gap-2" size="sm">
      <ProductImage
        alt={product.name}
        class="size-12 shrink-0 rounded-md"
        entityId={product.id}
        imageAssetId={product.imageAssetId ?? null}
      />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">{product.name}</p>
        <p class="text-muted-foreground text-xs">
          {formatIDR(product.priceMinorUnits)}
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
          navigate(`/settings/products-categories/products/${product.id}/edit`)
        }
        type="button"
      >
        <TbOutlinePencil class="size-4" />
      </button>
      <button
        class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        onClick={() => setDeleteTarget(product)}
        type="button"
      >
        <TbOutlineTrash class="size-4" />
      </button>
    </Card>
  );

  return (
    <>
      {!props?.hideHeader && (
        <PageHeader backHref="/settings/products-categories">Produk</PageHeader>
      )}
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
              setFilterCategoryId(v === "" ? undefined : String(v))
            }
            options={categoryOptions()}
            placeholder="Semua Kategori"
            value={filterCategoryId() ?? ""}
          />
          <A href="/settings/products-categories/products/add">
            <Button size="sm">+ Tambah</Button>
          </A>
        </div>

        <Suspense
          fallback={
            <div class="space-y-2">
              <For each={[1, 2, 3]}>
                {() => (
                  <Card class="flex items-center gap-2" size="sm">
                    <div class="flex-1 space-y-2">
                      <Skeleton class="h-4 w-32" />
                      <Skeleton class="h-3 w-20" />
                    </div>
                    <Skeleton class="h-6 w-14" />
                    <Skeleton class="size-9" />
                    <Skeleton class="size-9" />
                  </Card>
                )}
              </For>
            </div>
          }
        >
          <Switch
            fallback={
              <div class="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <div class="flex size-16 items-center justify-center rounded-2xl bg-muted">
                  <TbOutlinePackage class="size-8 text-muted-foreground/60" />
                </div>
                <div class="text-center">
                  <p class="font-medium text-foreground">Belum ada produk</p>
                  <p class="text-sm">
                    Tap "+ Tambah" untuk membuat produk baru
                  </p>
                </div>
              </div>
            }
          >
            <Match when={productsQuery.data()?.length}>
              <Show
                fallback={
                  <div class="space-y-2">
                    <For each={productsQuery.data()!}>
                      {(product) => productCard(product)}
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
                            {(product) => productCard(product)}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Match>
          </Switch>
        </Suspense>
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
