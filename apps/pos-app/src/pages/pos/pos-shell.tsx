import { TbOutlineSearch, TbOutlineX } from "solid-icons/tb";
import { Show } from "solid-js";
import { AppShell } from "~/components/layout";
import { CartPanel, CartSidebar } from "~/components/pos/cart-panel";
import { CategoryTabs } from "~/components/pos/category-tabs";
import OutletSelector from "~/components/pos/outlet-selector";
import { PaymentDialog } from "~/components/pos/payment-dialog";
import { ProductGrid } from "~/components/pos/product-grid";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { cn } from "~/lib/utils";
import { setCurrentOutletId } from "~/store/outlet";
import type { PosState } from "./use-pos";
import { usePos } from "./use-pos";

interface PosShellProps {
  state: PosState;
}

export function PosShell(props: PosShellProps) {
  return (
    <div
      class={cn(
        "grid h-full grid-rows-1 landscape:grid-cols-[3fr_2fr]",
        props.state.isPhone() && "landscape:grid-cols-[7fr_3fr]"
      )}
    >
      <Show when={props.state.orderResult()}>
        {(num) => (
          <div class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background/95">
            <span class="font-bold text-4xl text-primary">Selesai!</span>
            <span class="text-lg text-muted-foreground">{num()}</span>
            <Show when={props.state.lastReceipt()}>
              <button
                class="mt-2 rounded-lg border px-4 py-2 text-sm active:bg-accent"
                onClick={props.state.handleReprint}
                type="button"
              >
                Cetak Ulang
              </button>
            </Show>
          </div>
        )}
      </Show>

      <AppShell
        class="min-h-0 landscape:flex"
        title="Kasir"
        topbarSuffix={
          <div class="hidden items-center landscape:flex">
            <Show
              when={
                (props.state.role === "manager" ||
                  props.state.role === "owner") &&
                props.state.outlets().length > 0
              }
            >
              <OutletSelector
                onChange={(id) => setCurrentOutletId(id)}
                outlets={props.state.outlets()}
              />
            </Show>
            <TextField
              class="gap-0"
              onChange={props.state.setSearch}
              value={props.state.search()}
            >
              <div class="relative flex items-center">
                <TbOutlineSearch class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <TextFieldInput
                  class={cn(
                    "h-9 w-52 rounded-lg bg-muted pr-3 pl-9 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0",
                    props.state.search() && "rounded-r-none"
                  )}
                  placeholder="Cari produk..."
                  type="text"
                />
                <Show when={props.state.search()}>
                  <button
                    class="flex h-9 shrink-0 items-center justify-center rounded-r-lg border-t border-r border-b border-l bg-muted px-3 active:bg-accent"
                    onClick={() => props.state.setSearch("")}
                    type="button"
                  >
                    <TbOutlineX class="size-4 text-muted-foreground" />
                  </button>
                </Show>
              </div>
            </TextField>
          </div>
        }
      >
        <div class="flex h-full flex-1 flex-col">
          <CategoryTabs
            categories={props.state.categories()}
            onChange={props.state.setSelectedCategory}
            selected={props.state.selectedCategory()}
          />

          <div class="flex-1 overflow-y-auto">
            <ProductGrid products={props.state.filteredProducts()} />
          </div>

          <CartPanel onPay={() => props.state.setPaymentOpen(true)} />
        </div>
      </AppShell>

      <CartSidebar onPay={() => props.state.setPaymentOpen(true)} />
      <PaymentDialog
        loading={props.state.paymentLoading()}
        onClose={() => props.state.setPaymentOpen(false)}
        onConfirm={props.state.handlePayment}
        open={props.state.paymentOpen()}
      />
    </div>
  );
}

export default function POS() {
  const state = usePos();

  return <PosShell state={state} />;
}
