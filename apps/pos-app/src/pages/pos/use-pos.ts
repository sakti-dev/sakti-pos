import { createMemo, createResource, createSignal } from "solid-js";
import { toast } from "solid-sonner";
import {
	createOrder,
	getActiveProductsByCategory,
	type ProductWithCategory,
} from "~/db/orders";
import { getAllOutlets } from "~/db/outlets";
import { getDefaultPrinter, printReceipt } from "~/lib/printer";
import { logPrinterError } from "~/lib/printer-log";
import type { ReceiptData } from "~/lib/receipt/types";
import { currentUser, currentUserRole } from "~/store/auth";
import { cartItems, cartTotal, clearCart } from "~/store/cart";
import { useIsPhone } from "~/store/responsive";
import { getCategoryNames, getVisibleProducts } from "./pos-utils";

type OutletOption = {
	id: string;
	name: string;
};

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
	const [groupedData] = createResource(getActiveProductsByCategory);
	const [outletsData] = createResource(getAllOutlets);
	const role = currentUserRole();
	const [selectedCategory, setSelectedCategory] = createSignal<string | null>(
		null,
	);
	const [paymentOpen, setPaymentOpen] = createSignal(false);
	const [paymentLoading, setPaymentLoading] = createSignal(false);
	const [orderResult, setOrderResult] = createSignal<string | null>(null);
	const [lastReceipt, setLastReceipt] = createSignal<ReceiptData | null>(null);
	const [search, setSearch] = createSignal("");

	const categories = createMemo(() => getCategoryNames(groupedData()));
	const filteredProducts = createMemo(() =>
		getVisibleProducts(groupedData(), selectedCategory(), search()),
	);

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

			const orderNumber = await createOrder({
				amountPaid: data.amountPaid,
				changeAmount: data.changeAmount,
				items: items.map((item) => ({
					price: item.product.price,
					product_id: item.product.id,
					product_name: item.product.name,
					qty: item.quantity,
				})),
				paymentMethod: data.paymentMethod,
				total,
				staffId: user.id,
			});

			setPaymentOpen(false);

			const receiptData: ReceiptData = {
				business: { name: "SAKTI POS" },
				items: items.map((item) => ({
					name: item.product.name,
					quantity: item.quantity,
					subtotal: item.product.price * item.quantity,
					unitPrice: item.product.price,
				})),
				order: {
					cashierName: user.name,
					createdAt: new Date().toISOString(),
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
					logPrinterError("checkout:auto_print:failed", error, {
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
		if (!printerAddress || !receipt) {
			return;
		}

		printReceipt(printerAddress, receipt).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : "Gagal mencetak struk";
			logPrinterError("checkout:reprint:failed", error, {
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
		outlets: () => outletsData() ?? [],
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
