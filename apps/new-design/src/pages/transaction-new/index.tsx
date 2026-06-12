import { A, useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ArrowLeftIcon, CartShoppingIcon } from "~/assets";
import {
  Sheet,
  SheetBody,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { formatRupiah } from "~/lib/utils";
import { CartItemRow } from "./components/cart-item-row";
import { CartPanel } from "./components/cart-panel";
import { CartTotals } from "./components/cart-totals";
import { type CategoryKey, CategoryTabs } from "./components/category-tabs";
import { ProductGrid } from "./components/product-grid";
import { SearchBar } from "./components/search-bar";
import type { CartEntry, Product } from "./components/types";

const products: readonly Product[] = [
  { id: 1, name: "Es Kopi Susu", price: 18_000, cat: "minuman", img: 225 },
  { id: 2, name: "Kopi Hitam", price: 12_000, cat: "minuman", img: 302 },
  { id: 3, name: "Matcha Latte", price: 22_000, cat: "minuman", img: 425 },
  { id: 4, name: "Cappuccino", price: 25_000, cat: "minuman", img: 431 },
  { id: 5, name: "Teh Manis", price: 8000, cat: "minuman", img: 591 },
  { id: 6, name: "Americano", price: 20_000, cat: "minuman", img: 312 },
  { id: 7, name: "Es Teh Tarik", price: 15_000, cat: "minuman", img: 383 },
  {
    id: 8,
    name: "Chocolate Milkshake",
    price: 28_000,
    cat: "minuman",
    img: 404,
  },
  {
    id: 9,
    name: "Nasi Goreng Spesial",
    price: 32_000,
    cat: "makanan",
    img: 292,
  },
  { id: 10, name: "Mie Goreng", price: 28_000, cat: "makanan", img: 505 },
  { id: 11, name: "Ayam Geprek", price: 25_000, cat: "makanan", img: 416 },
  { id: 12, name: "Sandwich Club", price: 30_000, cat: "makanan", img: 326 },
  { id: 13, name: "Burger Classic", price: 35_000, cat: "makanan", img: 461 },
  {
    id: 14,
    name: "Roti Bakar Coklat",
    price: 18_000,
    cat: "makanan",
    img: 488,
  },
  { id: 15, name: "Indomie Goreng", price: 15_000, cat: "makanan", img: 366 },
  { id: 16, name: "Kentang Goreng", price: 20_000, cat: "snack", img: 429 },
  { id: 17, name: "Pisang Goreng Keju", price: 18_000, cat: "snack", img: 317 },
  { id: 18, name: "Dimsum Ayam", price: 22_000, cat: "snack", img: 257 },
  { id: 19, name: "Cireng Isi", price: 15_000, cat: "snack", img: 139 },
  { id: 20, name: "Tahu Crispy", price: 12_000, cat: "snack", img: 493 },
  { id: 21, name: "Es Krim Vanilla", price: 15_000, cat: "dessert", img: 357 },
  { id: 22, name: "Pancake Madu", price: 25_000, cat: "dessert", img: 490 },
  { id: 23, name: "Waffle Coklat", price: 28_000, cat: "dessert", img: 225 },
  { id: 24, name: "Brownies", price: 20_000, cat: "dessert", img: 411 },
  { id: 25, name: "Paket Hemat A", price: 38_000, cat: "paket", img: 460 },
  { id: 26, name: "Paket Hemat B", price: 45_000, cat: "paket", img: 402 },
  { id: 27, name: "Paket Couple", price: 65_000, cat: "paket", img: 318 },
  { id: 28, name: "Paket Keluarga", price: 95_000, cat: "paket", img: 359 },
] as const;

export default function TransactionNew() {
  const navigate = useNavigate();
  const [activeCat, setActiveCat] = createSignal<CategoryKey>("minuman");
  const [search, setSearch] = createSignal("");
  const [cart, setCart] = createSignal<CartEntry[]>([]);
  const [sheetOpen, setSheetOpen] = createSignal(false);

  const filtered = () =>
    products.filter((p) => {
      const catOk = p.cat === activeCat();
      const searchOk =
        !search() || p.name.toLowerCase().includes(search().toLowerCase());
      return catOk && searchOk;
    });

  const addToCart = (id: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === id);
      if (existing) {
        return prev.map((c) => (c.id === id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { id, qty: 1 }];
    });
  };

  const increment = (id: number) =>
    setCart((prev) =>
      prev.map((c) => (c.id === id ? { ...c, qty: c.qty + 1 } : c))
    );

  const decrement = (id: number) =>
    setCart((prev) => {
      const item = prev.find((c) => c.id === id);
      if (item && item.qty <= 1) {
        return prev.filter((c) => c.id !== id);
      }
      return prev.map((c) => (c.id === id ? { ...c, qty: c.qty - 1 } : c));
    });

  const cartTotal = () =>
    cart().reduce((s, c) => {
      const p = products.find((pr) => pr.id === c.id);
      return s + (p ? p.price * c.qty : 0);
    }, 0);

  const cartItemCount = () => cart().reduce((s, c) => s + c.qty, 0);

  return (
    <div class="flex h-screen bg-surface-gray font-sans text-text antialiased dark:bg-[#111] dark:text-[#f0f0f0]">
      {/* Left column — catalog */}
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-cream dark:bg-[#0a0a0a]">
        <header class="flex h-14 shrink-0 items-center gap-3.5 border-border border-b bg-surface px-5 max-[900px]:px-3.5 dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1a1a1a]">
          <A
            aria-label="Kembali"
            class="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border bg-surface text-text transition-[background,border-color] duration-150 hover:border-[rgba(26,51,0,0.20)] hover:bg-primary-light dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1a1a1a] dark:text-[#f0f0f0] dark:hover:border-[rgba(168,229,229,0.20)] dark:hover:bg-[rgba(168,229,229,0.08)]"
            href="/"
          >
            <ArrowLeftIcon class="h-[18px] w-[18px]" />
          </A>
          <span class="font-bold text-[17px] text-text tracking-[-0.01em] dark:text-[#f0f0f0]">
            Transaksi Baru
          </span>
        </header>

        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5 max-[900px]:gap-3 max-[900px]:p-3.5 max-[900px]:pb-20">
          <CategoryTabs active={activeCat()} onSelect={setActiveCat} />
          <SearchBar onInput={setSearch} value={search()} />
          <ProductGrid onAdd={addToCart} products={filtered()} />
        </div>
      </div>

      {/* Right column — cart sidebar (desktop only) */}
      <div class="flex w-[360px] min-w-[360px] flex-col overflow-hidden border-border border-l bg-surface max-[900px]:hidden max-[1100px]:w-[320px] max-[1100px]:min-w-[320px] dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1a1a1a]">
        <CartPanel
          cart={cart()}
          onDecrement={decrement}
          onIncrement={increment}
          onPay={() => navigate("/payment")}
          onProcess={() => {
            toast.success("Transaksi disimpan & diproses");
            setCart([]);
          }}
          products={products}
        />
      </div>

      {/* Mobile cart drawer */}
      <Sheet
        onOpenChange={setSheetOpen}
        open={sheetOpen()}
        trigger={
          <SheetTrigger
            aria-label="Buka keranjang"
            class="fixed right-4 bottom-5 left-4 z-[90] hidden h-14 items-center justify-between rounded-[14px] bg-primary px-5 font-semibold text-[14px] text-primary-foreground tracking-[0.02em] shadow-[0_6px_24px_rgba(9,73,51,0.30)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(9,73,51,0.40)] active:scale-[0.98] max-[900px]:flex dark:shadow-[0_6px_24px_rgba(0,0,0,0.60)] dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.70)]"
          >
            <div class="flex items-center gap-2.5">
              <CartShoppingIcon class="h-5 w-5" />
              <span class="grid min-w-[20px] place-items-center rounded-full bg-accent px-1.5 py-0 font-bold text-[11px] text-primary tabular-nums">
                {cartItemCount()}
              </span>
              <span>Keranjang</span>
            </div>
            <span class="font-bold text-[15px] tabular-nums">
              {formatRupiah(cartTotal())}
            </span>
          </SheetTrigger>
        }
      >
        {({ close }) => (
          <>
            <SheetHeader>
              <SheetTitle>Keranjang</SheetTitle>
            </SheetHeader>

            <SheetBody>
              <Show
                fallback={
                  <div class="flex flex-1 flex-col items-center justify-center gap-2.5 px-5 py-10 text-text-muted">
                    <CartShoppingIcon class="h-10 w-10 opacity-30" />
                    <span class="font-medium text-[14px]">
                      Keranjang kosong
                    </span>
                    <span class="text-[12px]">Tap menu untuk menambahkan</span>
                  </div>
                }
                when={cart().length > 0}
              >
                <For each={cart()}>
                  {(item) => {
                    const p = products.find((pr) => pr.id === item.id);
                    return (
                      <CartItemRow
                        name={p?.name ?? ""}
                        onDecrement={() => decrement(item.id)}
                        onIncrement={() => increment(item.id)}
                        price={p?.price ?? 0}
                        qty={item.qty}
                      />
                    );
                  }}
                </For>
              </Show>
            </SheetBody>

            <CartTotals
              disabled={cart().length === 0}
              onPay={() => {
                close();
                navigate("/payment");
              }}
              onProcess={() => {
                close();
                toast.success("Transaksi disimpan & diproses");
                setCart([]);
              }}
              subtotal={cartTotal()}
            />
          </>
        )}
      </Sheet>
    </div>
  );
}
