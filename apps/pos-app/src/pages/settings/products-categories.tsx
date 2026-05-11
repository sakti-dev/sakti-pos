import { clsx } from "clsx";
import { createSignal } from "solid-js";
import { PageHeader } from "~/components/ui/page-header";

export default function ProductsCategoriesSettings() {
  const [activeTab, setActiveTab] = createSignal<"kategori" | "produk">(
    "kategori"
  );

  return (
    <>
      <PageHeader backHref="/settings">Produk & Kategori</PageHeader>
      <div class="p-4">
        <div class="mb-4 flex overflow-hidden rounded-lg border">
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
    </>
  );
}
