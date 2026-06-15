import { createSignal, Show } from "solid-js";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { Tab } from "~/components/ui/tab";
import { CategoryTab } from "./components/category-tab";
import { ProductTab } from "./components/product-tab";
import { SpeedDialFab } from "./components/speed-dial-fab";
import { VariantTab } from "./components/variant-tab";

type TabKey = "produk" | "varian" | "kategori";

export default function CatalogPage() {
  const [tab, setTab] = createSignal<TabKey>("produk");

  return (
    <SubPageShell backHref="/" data-ssgoi-transition="/catalog" title="Katalog">
      <div class="flex flex-1 flex-col overflow-hidden">
        {/* Tab nav */}
        <div class="flex shrink-0 gap-2 border-border border-b px-4 py-2 lg:px-6">
          <Tab active={tab() === "produk"} onClick={() => setTab("produk")}>
            Produk
          </Tab>
          <Tab active={tab() === "varian"} onClick={() => setTab("varian")}>
            Varian
          </Tab>
          <Tab active={tab() === "kategori"} onClick={() => setTab("kategori")}>
            Kategori
          </Tab>
        </div>

        {/* Tab panels */}
        <Show when={tab() === "produk"}>
          <ProductTab />
        </Show>
        <Show when={tab() === "varian"}>
          <VariantTab />
        </Show>
        <Show when={tab() === "kategori"}>
          <CategoryTab />
        </Show>
      </div>

      <SpeedDialFab />
    </SubPageShell>
  );
}
