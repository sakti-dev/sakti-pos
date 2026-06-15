import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import { CategoryTab } from "./components/category-tab";
import { ProductTab } from "./components/product-tab";
import { SpeedDialFab } from "./components/speed-dial-fab";
import { VariantTab } from "./components/variant-tab";

export default function CatalogPage() {
  return (
    <SubPageShell backHref="/" data-ssgoi-transition="/catalog" title="Katalog">
      <div class="flex flex-1 flex-col overflow-hidden">
        <Tabs
          class="flex flex-1 flex-col overflow-hidden"
          defaultValue="produk"
        >
          <div class="relative shrink-0 border-border border-b">
            <TabsList class="relative flex w-full">
              <TabsTrigger class="flex-1" value="produk">
                Produk
              </TabsTrigger>
              <TabsTrigger class="flex-1" value="varian">
                Varian
              </TabsTrigger>
              <TabsTrigger class="flex-1" value="kategori">
                Kategori
              </TabsTrigger>
              <TabsIndicator class="bg-primary" />
            </TabsList>
          </div>

          <TabsContent class="flex-1 overflow-hidden" value="produk">
            <ProductTab />
          </TabsContent>
          <TabsContent class="flex-1 overflow-hidden" value="varian">
            <VariantTab />
          </TabsContent>
          <TabsContent class="flex-1 overflow-hidden" value="kategori">
            <CategoryTab />
          </TabsContent>
        </Tabs>
      </div>

      <SpeedDialFab />
    </SubPageShell>
  );
}
