import { createMemo, createSignal } from "solid-js";
import { toast } from "solid-sonner";
import {
  createOrder,
  getActiveProductsByCategory,
  type ProductWithCategory,
} from "~/db/orders";
import { getAllOutlets, getOutletReceiptHeader } from "~/db/outlets";
import { formatUtcTimestamp } from "~/lib/date-time";
import { createLogger } from "~/lib/logger";
import { getDefaultPrinter, printReceipt } from "~/lib/printer/client";
import type { ReceiptData } from "~/lib/receipt/types";
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
import { currentUser, currentUserRole } from "~/store/auth";
import { cartItems, cartTotal, clearCart } from "~/store/cart";
import { currentOutletId, currentOutletTimezone } from "~/store/outlet";
import { useIsPhone } from "~/store/responsive";
import { getCategoryNames, getVisibleProducts } from "./pos-utils";

const posLogger = createLogger({ domain: "POS", module: "pos" });

interface OutletOption {
  id: string;
  name: string;
  timezone: string;
}

export interface PosState {
  categories: () => string[];
  filteredProducts: () => ProductWithCategory[];
  handlePayment: (data: {
    amountPaid: number | null;
    changeAmount: number | null;
    paymentMethod: "cash" | "qris";
  }) => Promise<void>;
  handleReprint: () => void;
  isPhone: () => boolean;
  lastReceipt: () => ReceiptData | null;
  orderResult: () => string | null;
  outlets: () => OutletOption[];
  paymentLoading: () => boolean;
  paymentOpen: () => boolean;
  role: string | null;
  search: () => string;
  selectedCategory: () => string | null;
  setPaymentOpen: (open: boolean) => void;
  setSearch: (value: string) => void;
  setSelectedCategory: (value: string | null) => void;
}

export function usePos(): PosState {
  const isPhone = useIsPhone();
  const groupedDataQuery = useDrizzleQuery(["products"], () =>
    getActiveProductsByCategory()
  );
  const outletsQuery = useDrizzleQuery(["outlets"], () => getAllOutlets());
  const role = currentUserRole();
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(
    null
  );
  const [paymentOpen, setPaymentOpen] = createSignal(false);
  const [paymentLoading, setPaymentLoading] = createSignal(false);
  const [orderResult, setOrderResult] = createSignal<string | null>(null);
  const [lastReceipt, setLastReceipt] = createSignal<ReceiptData | null>(null);
  const [search, setSearch] = createSignal("");

  const categories = createMemo(() =>
    getCategoryNames(groupedDataQuery.data())
  );
  const filteredProducts = createMemo(() =>
    getVisibleProducts(groupedDataQuery.data(), selectedCategory(), search())
  );
  const outletTimezone = createMemo(() => currentOutletTimezone());

  const handlePayment = async (data: {
    amountPaid: number | null;
    changeAmount: number | null;
    paymentMethod: "cash" | "qris";
  }) => {
    const user = currentUser();
    if (!user) {
      return;
    }

    setPaymentLoading(true);
    try {
      const items = cartItems();
      const total = cartTotal();
      const createdAt = formatUtcTimestamp();

      const orderNumber = await createOrder({
        amountPaidMinorUnits: data.amountPaid,
        changeAmountMinorUnits: data.changeAmount,
        createdAt,
        items: items.map((item) => ({
          priceMinorUnits: item.product.priceMinorUnits,
          product_id: item.product.id,
          product_name: item.product.name,
          qty: item.quantity,
        })),
        paymentMethod: data.paymentMethod,
        timezone: outletTimezone(),
        totalMinorUnits: total,
        staffId: user.id,
      });

      setPaymentOpen(false);

      const outletId = currentOutletId();
      const receiptHeader = outletId
        ? await getOutletReceiptHeader(outletId)
        : { address: null, name: "SAKTI POS" };

      const receiptData: ReceiptData = {
        business: {
          address: receiptHeader.address ?? undefined,
          name: receiptHeader.name || "SAKTI POS",
          timezone: outletTimezone(),
        },
        items: items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          subtotal: item.product.priceMinorUnits * item.quantity,
          unitPrice: item.product.priceMinorUnits,
        })),
        order: {
          cashierName: user.name,
          createdAt,
          orderNumber,
        },
        payment: {
          amountPaid: data.amountPaid ?? total,
          changeAmount: data.changeAmount,
          method: data.paymentMethod,
        },
        totals: { total },
      };

      clearCart();
      setOrderResult(orderNumber);
      setLastReceipt(receiptData);

      const printerAddress = getDefaultPrinter();
      if (printerAddress) {
        printReceipt(printerAddress, receiptData).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Gagal mencetak struk";
          posLogger.error("checkout:auto_print:failed", error, {
            address: printerAddress,
            orderNumber,
          });
          toast.error(message);
        });
      }

      setTimeout(() => {
        setOrderResult(null);
        setLastReceipt(null);
      }, 2000);
    } catch {
      toast.error("Gagal membuat pesanan");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleReprint = () => {
    const printerAddress = getDefaultPrinter();
    const receipt = lastReceipt();
    if (!(printerAddress && receipt)) {
      return;
    }

    printReceipt(printerAddress, receipt).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Gagal mencetak struk";
      posLogger.error("checkout:reprint:failed", error, {
        address: printerAddress,
        orderNumber: receipt.order.orderNumber,
      });
      toast.error(message);
    });
  };

  return {
    categories,
    filteredProducts,
    handlePayment,
    handleReprint,
    isPhone,
    lastReceipt,
    orderResult,
    outlets: () => outletsQuery.data() ?? [],
    paymentLoading,
    paymentOpen,
    role,
    search,
    selectedCategory,
    setPaymentOpen,
    setSearch,
    setSelectedCategory,
  };
}
