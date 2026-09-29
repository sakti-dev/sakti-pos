import { A, useNavigate } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ArrowLeftIcon, CartShoppingIcon } from "~/assets";
import { SafeAreaShell } from "~/components/layout/safe-area-shell";
import { SearchBar } from "~/components/search-bar";
import {
  DrawerBody,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import { FadeIn } from "~/components/ui/fade-in";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getOpenShift } from "~/db/cash-shifts";
import { getCategories, getProducts } from "~/db/catalog";
import * as sale from "~/lib/sales/sale-session";
import type { Product } from "~/lib/sales/types";
import { formatRupiah } from "~/lib/utils";
import { CartList } from "./components/cart-list";
import { CartPanel } from "./components/cart-panel";
import { CartTotals } from "./components/cart-totals";
import { ProductGrid } from "./components/product-grid";
import { ShiftClose } from "./components/shift-close";
import { ShiftGate } from "./components/shift-gate";

export default function CashRegisterPage() {
  const navigate = useNavigate();
  const [activeCat, setActiveCat] = createSignal<string>("all");
  const [search, setSearch] = createSignal("");
  const [sheetOpen, setSheetOpen] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  const [shift, { refetch: refetchShift }] = createResource(() =>
    getOpenShift()
  );
  const handleShiftOpened = () => refetchShift();
  const handleShiftClosed = () => {
    setClosing(false);
    refetchShift();
  };

  const [categories] = createResource(getCategories);
  const [productRows] = createResource(() => getProducts());

  const cart = sale.getCart;

  const categoryNames = () => {
    const map = new Map<string, string>();
    for (const c of categories() ?? []) {
      map.set(c.id, c.name);
    }
    return map;
  };

  const products = (): Product[] =>
    (productRows() ?? []).map((row) => ({
      categoryId: row.categoryId,
      id: row.id,
      imageAssetId: row.imageAssetId,
      name: row.name,
      price: row.priceMinorUnits / 100,
    }));

  const filteredByCat = (cat: string) => {
    const q = search().toLowerCase();
    return products().filter((p) => {
      const catOk =
        cat === "all" ||
        p.categoryId === cat ||
        (cat === "uncategorized" && p.categoryId === null);
      const searchOk = !q || p.name.toLowerCase().includes(q);
      return catOk && searchOk;
    });
  };

  const addToCart = (id: string) => {
    const product = products().find((p) => p.id === id);
    if (product) {
      const name =
        (product.categoryId && categoryNames().get(product.categoryId)) || "";
      sale.addToCart(product, name);
    }
  };

  const increment = sale.increment;
  const decrement = sale.decrement;

  const cartTotal = () => sale.totals().total;
  const cartItemCount = () => cart().reduce((s, c) => s + c.qty, 0);

  return (
    <Show fallback={null} when={!shift.loading}>
      <Show
        fallback={<ShiftGate onOpened={handleShiftOpened} />}
        when={shift()}
      >
        <Show
          fallback={
            <Show keyed when={shift()}>
              {(openShift) => (
                <ShiftClose
                  onCancel={() => setClosing(false)}
                  onClosed={handleShiftClosed}
                  shift={openShift}
                />
              )}
            </Show>
          }
          when={!closing()}
        >
          <SafeAreaShell
            class="bg-muted"
            data-ssgoi-transition="/transactions/cash-register"
          >
            <div class="flex h-full">
              {/* Left column — catalog */}
              <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
                <FadeIn
                  class="flex h-header shrink-0 items-center justify-between gap-3.5 border-border border-b bg-card px-3.5 lg:px-5"
                  duration={0.4}
                  x={-20}
                >
                  <div class="flex shrink-0 items-center gap-3.5">
                    <A
                      aria-label="Kembali"
                      class="grid h-[38px] w-[38px] place-items-center rounded-xl border border-border bg-card text-foreground transition-colors duration-150 hover:border-primary/20 hover:bg-primary/5"
                      href="/"
                    >
                      <ArrowLeftIcon class="size-5" />
                    </A>
                    <span class="font-bold font-display text-body-lg text-foreground">
                      Transaksi Baru
                    </span>
                  </div>
                  <button
                    aria-label="Tutup shift"
                    class="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3.5 py-2 font-semibold text-caption-sm text-success transition-colors hover:bg-success/20 lg:ml-0"
                    onClick={() => setClosing(true)}
                    type="button"
                  >
                    <span class="relative flex size-2">
                      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                      <span class="relative inline-flex size-2 rounded-full bg-current" />
                    </span>
                    Shift Buka · Tutup
                  </button>
                  <SearchBar
                    class="hidden w-72 lg:flex"
                    mode="compact"
                    onInput={setSearch}
                    placeholder="Cari menu..."
                    value={search()}
                  />
                </FadeIn>

                <FadeIn
                  class="flex min-h-0 flex-1 flex-col overflow-hidden p-3.5 pb-20 lg:gap-4 lg:p-5"
                  delay={0.08}
                  duration={0.45}
                  y={16}
                >
                  <Tabs
                    class="flex min-h-0 flex-1 flex-col gap-3"
                    onChange={(v) => setActiveCat(v)}
                    value={activeCat()}
                  >
                    <div class="shrink-0">
                      <TabsList class="scrollbar-none flex gap-2.5 overflow-x-auto pb-1">
                        <TabsTrigger
                          aria-label="Semua"
                          class="px-8 py-4 text-body"
                          shape="rounded"
                          value="all"
                          variant="pill"
                        >
                          Semua
                        </TabsTrigger>
                        <For each={categories() ?? []}>
                          {(cat) => (
                            <TabsTrigger
                              aria-label={cat.name}
                              class="px-8 py-4 text-body"
                              shape="rounded"
                              value={cat.id}
                              variant="pill"
                            >
                              {cat.name}
                            </TabsTrigger>
                          )}
                        </For>
                      </TabsList>
                    </div>

                    <TabsContent
                      class="scrollbar-none min-h-0 flex-1 gap-3 overflow-y-auto px-0.5 py-1"
                      value={activeCat()}
                    >
                      {/* Mobile search — scrolls with content */}
                      <SearchBar
                        class="mb-3 lg:hidden"
                        onInput={setSearch}
                        placeholder="Cari menu..."
                        value={search()}
                      />
                      <Show when={categories()}>
                        <ProductGrid
                          onAdd={addToCart}
                          products={filteredByCat(activeCat())}
                        />
                      </Show>
                    </TabsContent>
                  </Tabs>
                </FadeIn>
              </div>

              {/* Right column — cart sidebar (desktop only) */}
              <FadeIn
                class="hidden flex-col overflow-hidden border-border border-l bg-card lg:flex lg:w-[320px] lg:min-w-[320px] xl:w-[360px] xl:min-w-[360px]"
                delay={0.15}
                duration={0.45}
                x={40}
              >
                <CartPanel
                  lines={cart()}
                  onDecrement={decrement}
                  onIncrement={increment}
                  onPay={() => navigate("/transactions/payment")}
                  onProcess={() => {
                    toast.success("Transaksi disimpan & diproses");
                    sale.clearCart();
                  }}
                />
              </FadeIn>

              {/* Mobile cart drawer */}
              <DrawerRoot
                onOpenChange={setSheetOpen}
                open={sheetOpen()}
                trigger={
                  <DrawerTrigger
                    aria-label="Buka keranjang"
                    class="fixed right-4 bottom-5 left-4 z-40 flex h-14 items-center justify-between rounded-2xl bg-primary px-5 font-semibold text-body-sm text-primary-foreground tracking-wide shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] lg:hidden"
                  >
                    <div class="flex items-center gap-2.5">
                      <CartShoppingIcon class="h-5 w-5" />
                      <span class="grid min-w-[20px] place-items-center rounded-full bg-accent px-1.5 py-0 font-bold text-caption-sm text-primary tabular-nums">
                        {cartItemCount()}
                      </span>
                      <span>Keranjang</span>
                    </div>
                    <span class="font-bold text-body tabular-nums">
                      {formatRupiah(cartTotal())}
                    </span>
                  </DrawerTrigger>
                }
              >
                {({ close }) => (
                  <>
                    <DrawerHeader>
                      <DrawerTitle>Keranjang</DrawerTitle>
                    </DrawerHeader>

                    <DrawerBody>
                      <CartList
                        lines={cart()}
                        onDecrement={decrement}
                        onIncrement={increment}
                      />
                    </DrawerBody>

                    <CartTotals
                      disabled={cart().length === 0}
                      onPay={() => {
                        close();
                        navigate("/transactions/payment");
                      }}
                      onProcess={() => {
                        close();
                        toast.success("Transaksi disimpan & diproses");
                        sale.clearCart();
                      }}
                      totals={sale.totals()}
                    />
                  </>
                )}
              </DrawerRoot>
            </div>
          </SafeAreaShell>
        </Show>
      </Show>
    </Show>
  );
}
