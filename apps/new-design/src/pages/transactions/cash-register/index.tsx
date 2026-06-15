import { A, useNavigate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { toast } from "solid-sonner";
import { ArrowLeftIcon, CartShoppingIcon } from "~/assets";
import { FadeIn } from "~/components/ui/fade-in";
import {
  Sheet,
  SheetBody,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { formatRupiah } from "~/lib/utils";
import { CartList } from "./components/cart-list";
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

export default function CashRegisterPage() {
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
    <div
      class="flex h-screen bg-muted font-sans text-foreground antialiased"
      data-ssgoi-transition="/transactions/cash-register"
    >
      {/* Left column — catalog */}
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <FadeIn
          class="flex h-14 shrink-0 items-center gap-3.5 border-border border-b bg-card px-3.5 lg:px-5"
          duration={0.4}
          x={-20}
        >
          <A
            aria-label="Kembali"
            class="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border bg-card text-foreground transition-[background,border-color] duration-150 hover:border-primary/20 hover:bg-primary/5"
            href="/"
          >
            <ArrowLeftIcon class="h-[18px] w-[18px]" />
          </A>
          <span class="font-bold font-display text-body-lg text-foreground">
            Transaksi Baru
          </span>
        </FadeIn>

        <FadeIn
          class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3.5 pb-20 lg:gap-4 lg:p-5"
          delay={0.08}
          duration={0.45}
          y={16}
        >
          <CategoryTabs active={activeCat()} onSelect={setActiveCat} />
          <SearchBar onInput={setSearch} value={search()} />
          <ProductGrid onAdd={addToCart} products={filtered()} />
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
          cart={cart()}
          onDecrement={decrement}
          onIncrement={increment}
          onPay={() => navigate("/transactions/payment")}
          onProcess={() => {
            toast.success("Transaksi disimpan & diproses");
            setCart([]);
          }}
          products={products}
        />
      </FadeIn>

      {/* Mobile cart drawer */}
      <Sheet
        onOpenChange={setSheetOpen}
        open={sheetOpen()}
        trigger={
          <SheetTrigger
            aria-label="Buka keranjang"
            class="fixed right-4 bottom-5 left-4 z-[90] flex h-14 items-center justify-between rounded-[14px] bg-primary px-5 font-semibold text-body-sm text-primary-foreground tracking-[0.02em] shadow-card transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] lg:hidden"
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
          </SheetTrigger>
        }
      >
        {({ close }) => (
          <>
            <SheetHeader>
              <SheetTitle>Keranjang</SheetTitle>
            </SheetHeader>

            <SheetBody>
              <CartList
                cart={cart()}
                onDecrement={decrement}
                onIncrement={increment}
                products={products}
              />
            </SheetBody>

            <CartTotals
              disabled={cart().length === 0}
              onPay={() => {
                close();
                navigate("/transactions/payment");
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
