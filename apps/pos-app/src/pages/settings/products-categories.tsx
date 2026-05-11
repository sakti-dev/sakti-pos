import { clsx } from "clsx";
import { createSignal, Show } from "solid-js";
import { PageHeader } from "~/components/ui/page-header";
import CategoryList from "~/pages/menu/category-list";
import ProductList from "~/pages/menu/product-list";

export default function ProductsCategoriesSettings() {
  const [activeTab, setActiveTab] = createSignal<"kategori" | "produk">(
    "kategori"
  );

  return (
    <>
      <PageHeader backHref="/settings">Produk & Kategori</PageHeader>
      <div class="sticky top-12 z-30 border-b bg-background px-4 py-2">
        <div class="flex overflow-hidden rounded-lg border">
          <button
            class={clsx(
              "flex-1 px-4 py-2 font-medium text-sm",
              activeTab() === "kategori" && "bg-primary text-primary-foreground"
            )}
            onClick={() => setActiveTab("kategori")}
            type="button"
          >
            Kategori
          </button>
          <button
            class={clsx(
              "flex-1 border-l px-4 py-2 font-medium text-sm",
              activeTab() === "produk" && "bg-primary text-primary-foreground"
            )}
            onClick={() => setActiveTab("produk")}
            type="button"
          >
            Produk
          </button>
        </div>
      </div>
      <Show when={activeTab() === "kategori"}>
        <CategoryListContent />
      </Show>
      <Show when={activeTab() === "produk"}>
        <ProductListContent />
      </Show>
    </>
  );
}

function CategoryListContent() {
  return <CategoryList hideHeader />;
}

function ProductListContent() {
  return <ProductList hideHeader />;
}
