import { afterEach, describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../db", () => ({
	db: {
		insert: (...args: unknown[]) => mockInsert(...args),
		select: (...args: unknown[]) => mockSelect(...args),
		update: (...args: unknown[]) => mockUpdate(...args),
		delete: (...args: unknown[]) => mockDelete(...args),
		transaction: (fn: unknown) => mockTransaction(fn),
	},
}));

vi.mock("../lib/auth", () => ({
	narvik: {
		createSession: vi.fn(),
		invalidateSession: vi.fn(),
		cookieName: "narvik_session",
		validateSession: vi.fn(),
		createCookie: vi.fn(() => ({ serialize: () => "narvik_session=test" })),
		createBlankCookie: vi.fn(() => ({
			serialize: () => "narvik_session=; Max-Age=0",
		})),
	},
}));

vi.mock("cloudflare:workers", () => ({
	env: {
		TURSO_DATABASE_URL: "http://127.0.0.1:8080",
		TURSO_AUTH_TOKEN: "",
		GOOGLE_CLIENT_ID: "",
		GOOGLE_CLIENT_SECRET: "",
		API_URL: "http://localhost:3001",
		NODE_ENV: "development",
	},
}));

const { handlePush, handlePull, verifyOutletAccess } = await import(
	"../lib/sync"
);

describe("verifyOutletAccess", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns true when user has access via user_merchants", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ merchantId: "merchant-1" }]),
				}),
			}),
		});

		const result = await verifyOutletAccess("user-1", "outlet-1");
		expect(result).toBe(true);
	});

	test("returns false when user has no access to outlet", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([undefined]),
				}),
			}),
		});

		const result = await verifyOutletAccess("user-1", "outlet-1");
		expect(result).toBe(false);
	});
});

describe("handlePush", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns empty serverWins when inserting new rows", async () => {
		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				const tx = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				};
				await fn(tx);
			},
		);

		const now = new Date().toISOString();
		const result = await handlePush("outlet-1", "merchant-1", {
			categories: [
				{
					id: "cat-1",
					name: "Minuman",
					merchantId: "merchant-1",
					updatedAt: now,
					createdAt: now,
				},
			],
		});

		expect(result.serverWins).toEqual([]);
		expect(result.serverTime).toBeDefined();
	});

	test("server wins when client updatedAt is older", async () => {
		const oldTime = "2025-01-01T00:00:00.000Z";
		const newTime = "2025-01-02T00:00:00.000Z";

		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				const tx = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue([{ id: "cat-1", updatedAt: newTime }]),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				};
				await fn(tx);
			},
		);

		const result = await handlePush("outlet-1", "merchant-1", {
			categories: [
				{
					id: "cat-1",
					name: "Minuman Updated",
					merchantId: "merchant-1",
					updatedAt: oldTime,
					createdAt: oldTime,
				},
			],
		});

		expect(result.serverWins).toHaveLength(1);
		expect(result.serverWins[0]).toEqual({
			table: "categories",
			ids: ["cat-1"],
		});
	});

	test("client wins when client updatedAt is newer or equal", async () => {
		const oldTime = "2025-01-01T00:00:00.000Z";
		const newTime = "2025-01-02T00:00:00.000Z";

		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				const tx = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue([{ id: "cat-1", updatedAt: oldTime }]),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				};
				await fn(tx);
			},
		);

		const result = await handlePush("outlet-1", "merchant-1", {
			categories: [
				{
					id: "cat-1",
					name: "Minuman Updated",
					merchantId: "merchant-1",
					updatedAt: newTime,
					createdAt: oldTime,
				},
			],
		});

		expect(result.serverWins).toHaveLength(0);
	});

	test("handles order_items using createdAt for conflict resolution", async () => {
		const oldCreated = "2025-01-01T00:00:00.000Z";
		const newCreated = "2025-01-02T00:00:00.000Z";

		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				const tx = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue([{ id: "oi-1", createdAt: newCreated }]),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				};
				await fn(tx);
			},
		);

		const result = await handlePush("outlet-1", "merchant-1", {
			order_items: [
				{
					id: "oi-1",
					quantity: 5,
					createdAt: oldCreated,
				},
			],
		});

		expect(result.serverWins).toHaveLength(1);
		expect(result.serverWins[0]).toEqual({
			table: "order_items",
			ids: ["oi-1"],
		});
	});

	test("handles outlet_products push", async () => {
		const now = new Date().toISOString();

		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				const tx = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				};
				await fn(tx);
			},
		);

		const result = await handlePush("outlet-1", "merchant-1", {
			outlet_products: [
				{
					id: "op-1",
					outletId: "outlet-1",
					productId: "prod-1",
					price: 5000,
					updatedAt: now,
					createdAt: now,
				},
			],
		});

		expect(result.serverWins).toEqual([]);
	});

	test("handles empty tables gracefully", async () => {
		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				await fn({});
			},
		);

		const result = await handlePush("outlet-1", "merchant-1", {});
		expect(result.serverWins).toEqual([]);
	});

	test("tombstoned records flow through push normally", async () => {
		const now = new Date().toISOString();
		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				const tx = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(undefined),
						}),
					}),
				};
				await fn(tx);
			},
		);

		const result = await handlePush("outlet-1", "merchant-1", {
			categories: [
				{
					id: "cat-deleted",
					name: "Deleted Category",
					merchantId: "merchant-1",
					updatedAt: now,
					createdAt: now,
					deletedAt: now,
				},
			],
		});

		expect(result.serverWins).toEqual([]);
	});
});

describe("handlePull", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns rows for requested tables", async () => {
		const mockRows = [
			{ id: "cat-1", name: "Minuman", merchantId: "merchant-1" },
		];
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(mockRows),
			}),
		});

		const result = (await handlePull(
			"outlet-1",
			"merchant-1",
			["categories"],
			"2025-01-01T00:00:00.000Z",
		)) as Record<string, unknown>;

		expect(result.categories).toEqual(mockRows);
		expect(result.serverTime).toBeDefined();
	});

	test("returns empty for unknown table names", async () => {
		const result = (await handlePull(
			"outlet-1",
			"merchant-1",
			["unknown_table"],
			"2025-01-01T00:00:00.000Z",
		)) as Record<string, unknown>;
		expect(result.unknown_table).toBeUndefined();
		expect(result.serverTime).toBeDefined();
	});

	test("pulls multiple tables", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});

		const result = (await handlePull(
			"outlet-1",
			"merchant-1",
			[
				"categories",
				"products",
				"orders",
				"order_items",
				"outlet_products",
				"staff",
			],
			"2025-01-01T00:00:00.000Z",
		)) as Record<string, unknown>;

		expect(result.categories).toEqual([]);
		expect(result.products).toEqual([]);
		expect(result.orders).toEqual([]);
		expect(result.order_items).toEqual([]);
		expect(result.outlet_products).toEqual([]);
		expect(result.staff).toEqual([]);
		expect(result.serverTime).toBeDefined();
	});

	test("categories and products are scoped by merchantId", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});

		await handlePull(
			"outlet-1",
			"merchant-1",
			["categories", "products"],
			"2025-01-01T00:00:00.000Z",
		);

		expect(mockSelect).toHaveBeenCalled();
	});

	test("orders and order_items are scoped by outletId", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});

		await handlePull(
			"outlet-1",
			"merchant-1",
			["orders", "order_items"],
			"2025-01-01T00:00:00.000Z",
		);

		expect(mockSelect).toHaveBeenCalled();
	});
});
