import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { OrderItemRow, OrderRow } from "~/db/orders";
import { OrderCard } from "../order-card";

const NASI_GORENG = /Nasi Goreng/;
const PRICE_20K = /Rp 20\.000/;

const mockOrder: OrderRow = {
	amountPaid: 30_000,
	changeAmount: 10_000,
	createdAt: "2026-05-04T10:30:00.000Z",
	id: "order-1",
	orderNumber: "2026-05-04-001",
	paymentMethod: "cash",
	staffId: "staff-1",
	staffName: "Kasir 1",
	status: "completed",
	total: 20_000,
};

const mockItems: OrderItemRow[] = [
	{
		id: "item-1",
		productName: "Nasi Goreng",
		quantity: 2,
		subtotal: 20_000,
		unitPrice: 10_000,
	},
];

const user = userEvent.setup();

describe("OrderCard", () => {
	test("renders order number and total", () => {
		const { getByText } = render(() => (
			<OrderCard items={mockItems} order={mockOrder} />
		));
		expect(getByText("2026-05-04-001")).toBeInTheDocument();
		expect(getByText(PRICE_20K)).toBeInTheDocument();
	});

	test("shows completed status", () => {
		const { getByText } = render(() => (
			<OrderCard items={mockItems} order={mockOrder} />
		));
		expect(getByText("Selesai")).toBeInTheDocument();
	});

	test("shows cancelled status", () => {
		const cancelledOrder = { ...mockOrder, status: "cancelled" as const };
		const { getByText } = render(() => (
			<OrderCard items={mockItems} order={cancelledOrder} />
		));
		expect(getByText("Batal")).toBeInTheDocument();
	});

	test("expands to show items on click", async () => {
		const { getByText } = render(() => (
			<OrderCard items={mockItems} order={mockOrder} />
		));
		const orderNumber = getByText("2026-05-04-001");
		await user.click(orderNumber);
		expect(getByText(NASI_GORENG)).toBeInTheDocument();
		expect(getByText("Tunai")).toBeInTheDocument();
	});

	test("shows cancel button when status is completed and onCancel provided", async () => {
		const onCancel = vi.fn();
		const { getByText } = render(() => (
			<OrderCard items={mockItems} onCancel={onCancel} order={mockOrder} />
		));
		await user.click(getByText("2026-05-04-001"));
		expect(getByText("Batalkan Pesanan")).toBeInTheDocument();
	});
});
