import { useNavigate } from "@solidjs/router";
import { FiFileText, FiPackage, FiShoppingBag } from "solid-icons/fi";
import { createSignal } from "solid-js";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { IngredientFormDialog } from "./components/ingredient-form-dialog";
import { IngredientTab } from "./components/ingredient-tab";
import { RetailTab } from "./components/retail-tab";

const SUBTITLES: Record<string, string> = {
  retail: "Menu untuk mengelola makanan & barang di etalase kasir",
  ingredient: "Menu untuk memantau stok dan bumbu di dapur mentah",
};

export default function InventoryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = createSignal("retail");
  const [createOpen, setCreateOpen] = createSignal(false);

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/inventory"
    >
      <header class="shrink-0 px-4 pt-5 pb-3 lg:px-6 lg:pb-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="font-bold text-foreground text-heading-sm">Inventory</h1>
            <p class="mt-0.5 text-body-sm text-muted-foreground">
              {SUBTITLES[tab()] ?? ""}
            </p>
          </div>
          <Button
            look="outline"
            onClick={() => navigate("/inventory/history")}
            size="sm"
            tone="neutral"
          >
            <FiFileText class="h-4 w-4" /> Riwayat
          </Button>
        </div>
      </header>

      <Tabs
        class="flex flex-1 flex-col overflow-hidden"
        onChange={setTab}
        value={tab()}
      >
        <div class="shrink-0 px-4 lg:px-6">
          <TabsList class="relative grid grid-cols-2 gap-2">
            <TabsTrigger
              class="justify-center py-2.5"
              shape="rounded"
              tone="primary"
              value="retail"
              variant="pill"
            >
              <FiShoppingBag class="h-4 w-4" /> Menu Jualan
            </TabsTrigger>
            <TabsTrigger
              class="justify-center py-2.5"
              shape="rounded"
              tone="primary"
              value="ingredient"
              variant="pill"
            >
              <FiPackage class="h-4 w-4" /> Bahan Baku
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent class="flex-1 overflow-hidden" value="retail">
          <RetailTab />
        </TabsContent>
        <TabsContent class="flex-1 overflow-hidden" value="ingredient">
          <IngredientTab onCreateIngredient={() => setCreateOpen(true)} />
        </TabsContent>
      </Tabs>

      <IngredientFormDialog
        onCreated={() => setCreateOpen(false)}
        onOpenChange={setCreateOpen}
        open={createOpen()}
      />
    </div>
  );
}
