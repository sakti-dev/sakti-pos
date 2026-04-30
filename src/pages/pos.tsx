import { createResource, createSignal, Show } from "solid-js";
import { CartPanel } from "~/components/pos/cart-panel";
import { CategoryTabs } from "~/components/pos/category-tabs";
import { PaymentDialog } from "~/components/pos/payment-dialog";
import { ProductGrid } from "~/components/pos/product-grid";
import {
  createOrder,
  getActiveProductsByCategory,
  type ProductWithCategory,
} from "~/db/orders";
import { currentUser } from "~/lib/auth";
import { cartItems, cartTotal, clearCart } from "~/lib/cart";

export default function POS() {
  const [groupedData] = createResource(getActiveProductsByCategory);
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(
    null
  );
  const [paymentOpen, setPaymentOpen] = createSignal(false);
  const [orderResult, setOrderResult] = createSignal<string | null>(null);

  const categories = () => groupedData()?.map((g) => g.categoryName) ?? [];

  const filteredProducts = (): ProductWithCategory[] => {
    const data = groupedData();
    if (!data) {
      return [];
    }
    const selected = selectedCategory();
    if (!selected) {
      return data.flatMap((g) => g.products);
    }
    return data.find((g) => g.categoryName === selected)?.products ?? [];
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
    <div class="flex h-full flex-col">
      <Show when={orderResult()}>
        {(num) => (
          <div class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background/95">
            <span class="font-bold text-4xl text-primary">Selesai!</span>
            <span class="text-lg text-muted-foreground">{num()}</span>
          </div>
        )}
      </Show>

      <CategoryTabs
        categories={categories()}
        onChange={setSelectedCategory}
        selected={selectedCategory()}
      />

      <div class="flex-1 overflow-y-auto">
        <ProductGrid products={filteredProducts()} />
      </div>

      <CartPanel onPay={() => setPaymentOpen(true)} />
      <PaymentDialog
        onClose={() => setPaymentOpen(false)}
        onConfirm={handlePayment}
        open={paymentOpen()}
      />
    </div>
  );
}
