import { createResource, createSignal, Show } from "solid-js";
import { AppShell } from "~/components/layout";
import { CartPanel, CartSidebar } from "~/components/pos/cart-panel";
import { CategoryTabs } from "~/components/pos/category-tabs";
import { PaymentDialog } from "~/components/pos/payment-dialog";
import { ProductGrid } from "~/components/pos/product-grid";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import {
  createOrder,
  getActiveProductsByCategory,
  type ProductWithCategory,
} from "~/db/orders";
import { currentUser } from "~/lib/auth";
import { cartItems, cartTotal, clearCart } from "~/lib/cart";
import { useIsPhone } from "~/lib/responsive";
import { cn } from "~/lib/utils";

export default function POS() {
  const isPhone = useIsPhone();
  const [groupedData] = createResource(getActiveProductsByCategory);
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(
    null
  );
  const [paymentOpen, setPaymentOpen] = createSignal(false);
  const [orderResult, setOrderResult] = createSignal<string | null>(null);
  const [search, setSearch] = createSignal("");

  const categories = () => groupedData()?.map((g) => g.categoryName) ?? [];

  const filteredProducts = (): ProductWithCategory[] => {
    const data = groupedData();
    if (!data) {
      return [];
    }
    let products: ProductWithCategory[];
    const selected = selectedCategory();
    if (selected) {
      products = data.find((g) => g.categoryName === selected)?.products ?? [];
    } else {
      products = data.flatMap((g) => g.products);
    }
    const q = search().trim().toLowerCase();
    if (q) {
      products = products.filter((p) => p.name.toLowerCase().includes(q));
    }
    return products;
  };

  const handlePayment = async (data: {
    amountPaid: number | null;
    changeAmount: number | null;
    paymentMethod: "cash" | "qris";
  }) => {
    const user = currentUser();
    if (!user) {
      return;
    }

    const orderNumber = await createOrder({
      amountPaid: data.amountPaid,
      changeAmount: data.changeAmount,
      items: cartItems().map((item) => ({
        price: item.product.price,
        product_id: item.product.id,
        product_name: item.product.name,
        qty: item.quantity,
      })),
      paymentMethod: data.paymentMethod,
      total: cartTotal(),
      userId: user.id,
    });

    setPaymentOpen(false);
    clearCart();
    setOrderResult(orderNumber);
    setTimeout(() => setOrderResult(null), 2000);
  };

  return (
    <div
      class={cn(
        "grid h-full grid-rows-1 landscape:grid-cols-[3fr_2fr]",
        isPhone() && "landscape:grid-cols-[7fr_3fr]"
      )}
    >
      <Show when={orderResult()}>
        {(num) => (
          <div class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background/95">
            <span class="font-bold text-4xl text-primary">Selesai!</span>
            <span class="text-lg text-muted-foreground">{num()}</span>
          </div>
        )}
      </Show>

      <AppShell
        class="min-h-0 landscape:flex"
        title="Kasir"
        topbarSuffix={
          <div class="hidden items-center landscape:flex">
            <TextField class="gap-0" onChange={setSearch} value={search()}>
              <div class="relative flex items-center">
                <svg
                  aria-hidden="true"
                  class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" x2="16.65" y1="21" y2="16.65" />
                </svg>
                <TextFieldInput
                  class={cn(
                    "h-9 w-52 rounded-lg bg-muted pr-3 pl-9 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0",
                    search() && "rounded-r-none"
                  )}
                  placeholder="Cari produk..."
                  type="text"
                />
                <Show when={search()}>
                  <button
                    class="flex h-9 shrink-0 items-center justify-center rounded-r-lg border-t border-r border-b border-l bg-muted px-3 active:bg-accent"
                    onClick={() => setSearch("")}
                    type="button"
                  >
                    <svg
                      aria-hidden="true"
                      class="size-4 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <line x1="18" x2="6" y1="6" y2="18" />
                      <line x1="6" x2="18" y1="6" y2="18" />
                    </svg>
                  </button>
                </Show>
              </div>
            </TextField>
          </div>
        }
      >
        <div class="flex h-full flex-1 flex-col">
          <CategoryTabs
            categories={categories()}
            onChange={setSelectedCategory}
            selected={selectedCategory()}
          />

          <div class="flex-1 overflow-y-auto">
            <ProductGrid products={filteredProducts()} />
          </div>

          <CartPanel onPay={() => setPaymentOpen(true)} />
        </div>
      </AppShell>

      <CartSidebar onPay={() => setPaymentOpen(true)} />
      <PaymentDialog
        onClose={() => setPaymentOpen(false)}
        onConfirm={handlePayment}
        open={paymentOpen()}
      />
    </div>
  );
}
