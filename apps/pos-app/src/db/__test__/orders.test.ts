import { describe, expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	categories: { name: "name", isActive: "is_active", id: "id" },
	orderItems: {
		id: "id",
		orderId: "order_id",
		productName: "product_name",
		quantity: "quantity",
		subtotal: "subtotal",
		unitPrice: "unit_price",
	},
	orders: {
		id: "id",
		orderNumber: "order_number",
		userId: "user_id",
		total: "total",
		paymentMethod: "payment_method",
		amountPaid: "amount_paid",
		changeAmount: "change_amount",
		status: "status",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
	products: {
		id: "id",
		categoryId: "category_id",
		name: "name",
		price: "price",
		imageUrl: "image_url",
		isActive: "is_active",
		sortOrder: "sort_order",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
	users: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((col: unknown) => col),
	eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
	gte: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "gte" })),
	isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
	like: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "like" })),
	lt: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "lt" })),
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
		strings,
		values,
	})),
}));

vi.mock("drizzle-orm/sqlite-proxy", () => ({
	drizzle: vi.fn(),
}));

const mockDbSelect = vi.fn();
vi.mock("../index", () => ({
	db: {
		select: mockDbSelect,
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(),
			})),
		})),
	},
}));

const ORDER_NUMBER_PATTERN = /^\d{4}-\d{2}-\d{2}-001$/;

describe("createOrder", () => {
	test("calls invoke with correct SQL statements and returns order number", async () => {
		const { invoke } = await import("@tauri-apps/api/core");
		const mockedInvoke = vi.mocked(invoke);

		mockDbSelect.mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					orderBy: vi.fn(() => []),
				})),
			})),
		} as never);

		mockedInvoke.mockResolvedValue({ last_insert_id: 1, rows_affected: 1 });

		const { createOrder } = await import("../orders");
		const orderNumber = await createOrder({
			amountPaid: 20_000,
			changeAmount: 0,
			items: [
				{ price: 10_000, product_id: 1, product_name: "Nasi Goreng", qty: 2 },
			],
			paymentMethod: "cash",
			total: 20_000,
			userId: 1,
		});

		expect(orderNumber).toMatch(ORDER_NUMBER_PATTERN);
		expect(mockedInvoke).toHaveBeenCalledWith("run_sql_batch", {
			statements: expect.arrayContaining([
				expect.objectContaining({
					sql: expect.stringContaining("INSERT INTO orders"),
				}),
			]),
		});
	});
});
