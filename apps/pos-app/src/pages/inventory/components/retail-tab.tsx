import { useNavigate } from "@solidjs/router";
import { FiAlertTriangle, FiClipboard, FiInbox } from "solid-icons/fi";
import { createMemo, createSignal, For } from "solid-js";
import { SearchBar } from "~/components/search-bar";
import { Button } from "~/components/ui/button";
import { FadeIn } from "~/components/ui/fade-in";
import { products } from "~/lib/data/catalog";
import { isLowStock } from "./lib/stats";
import { currentStock } from "./lib/store";
import { BadgeStock, StatCard } from "./shared";

export function RetailTab() {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");

  const lowRetailCount = createMemo(
    () =>
      products.filter(
        (p) => p.isRetail && isLowStock(currentStock(p.id), "retail")
      ).length
  );

  const totalActive = createMemo(
    () => products.filter((p) => p.stock >= 0).length
  );

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    return products.filter((p) => {
      if (!q) {
        return true;
      }
      return (
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    });
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        {/* KPI cards — scroll away, giving the list full height once past */}
        <div class="grid grid-cols-2 gap-2 px-4 py-3 lg:px-6">
          <StatCard
            dot="warning"
            icon={<FiAlertTriangle class="h-4 w-4" />}
            label="Produk Mau Habis"
            value={String(lowRetailCount())}
            valueSuffix="Item"
          />
          <StatCard
            icon={<FiInbox class="h-4 w-4" />}
            label="Total Produk Aktif"
            value={String(totalActive())}
            valueSuffix="Menu"
          />
        </div>

        {/* Actions — scroll away too */}
        <div class="flex flex-wrap justify-end gap-2 px-4 lg:px-6">
          <Button
            class="justify-center rounded-xl"
            look="outline"
            onClick={() => navigate("/inventory/stocktake/new?scope=retail")}
            size="sm"
            tone="primary"
          >
            <FiClipboard class="h-4 w-4" /> Stock Opname
          </Button>
        </div>

        {/* Search — sticks while the cards above scroll away.
            bg-background matches the page so no visible band; covers the
            parchment-darker rows scrolling behind it. */}
        <div class="sticky top-0 z-10 mt-2 bg-background px-4 py-2 lg:px-6">
          <SearchBar
            onInput={setSearch}
            placeholder="Cari menu jualan..."
            value={search()}
          />
        </div>

        {/* List */}
        <div class="px-4 pb-28 lg:px-6 lg:pb-6">
          <For
            each={filtered()}
            fallback={
              <div class="flex flex-col items-center gap-1 py-20 text-center">
                <p class="text-body-sm text-muted-foreground">
                  Menu tidak ditemukan
                </p>
                <p class="text-caption text-faint-foreground">
                  Coba ubah kata kunci pencarian
                </p>
              </div>
            }
          >
            {(p, i) => (
              <FadeIn delay={0.05 + i() * 0.02} duration={0.3} y={8}>
                <ProductRow product={p} />
              </FadeIn>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function ProductRow(props: { product: (typeof products)[number] }) {
  const p = () => props.product;
  const retail = () => p().isRetail;

  return (
    <div class="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {p().name}
        </h3>
        <p class="mt-0.5 text-caption-sm text-faint-foreground">
          {p().sku} · {retail() ? "Ritel Beli-Jadi" : p().category}
        </p>
      </div>
      <div class="shrink-0">
        {retail() ? (
          <BadgeStock qty={currentStock(p().id)} />
        ) : (
          <span class="rounded-full bg-status-success/10 px-2 py-0.5 font-medium text-caption-sm text-status-success normal-case">
            ∞ Bebas Stok
          </span>
        )}
      </div>
    </div>
  );
}
