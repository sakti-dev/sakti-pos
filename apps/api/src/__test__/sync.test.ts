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

vi.mock("../lib/oauth", () => ({
	google: {
		createAuthorizationURL: vi.fn(
			() => new URL("https://accounts.google.com/o/oauth2/v2/auth"),
		),
		validateAuthorizationCode: vi.fn(),
	},
	generateState: vi.fn(() => "test-state"),
	generateCodeVerifier: vi.fn(() => "test-verifier"),
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

const { handlePush, handlePull, verifyShopAccess } = await import(
	"../lib/sync"
);

describe("verifyShopAccess", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("returns true when user.shopId matches requestedShopId", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ shopId: "shop-1" }]),
				}),
			}),
		});

		const result = await verifyShopAccess("user-1", "shop-1");
		expect(result).toBe(true);
	});

	test("returns false when user not found and not shop owner", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([undefined]),
				}),
			}),
		});

		const result = await verifyShopAccess("user-1", "shop-1");
		expect(result).toBe(false);
	});

	test("returns true when user.shopId differs but user owns the shop", async () => {
		let callCount = 0;
		mockSelect.mockImplementation(() => ({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockImplementation(async () => {
						callCount++;
						if (callCount === 1) return [{ shopId: "other-shop" }];
						return [{ id: "shop-1" }];
					}),
				}),
			}),
		}));

		const result = await verifyShopAccess("user-1", "shop-1");
		expect(result).toBe(true);
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
		const result = await handlePush("shop-1", {
			categories: [
				{
					id: "cat-1",
					name: "Minuman",
					shopId: "shop-1",
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

		const result = await handlePush("shop-1", {
			categories: [
				{
					id: "cat-1",
					name: "Minuman Updated",
					shopId: "shop-1",
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

		const result = await handlePush("shop-1", {
			categories: [
				{
					id: "cat-1",
					name: "Minuman Updated",
					shopId: "shop-1",
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

		const result = await handlePush("shop-1", {
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

	test("handles empty tables gracefully", async () => {
		mockTransaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<void>) => {
				await fn({});
			},
		);

		const result = await handlePush("shop-1", {});
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

		const result = await handlePush("shop-1", {
			categories: [
				{
					id: "cat-deleted",
					name: "Deleted Category",
					shopId: "shop-1",
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
		const mockRows = [{ id: "cat-1", name: "Minuman", shopId: "shop-1" }];
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(mockRows),
			}),
		});

		const result = await handlePull(
			"shop-1",
			["categories"],
			"2025-01-01T00:00:00.000Z",
		);

		expect(result.categories).toEqual(mockRows);
		expect(result.serverTime).toBeDefined();
	});

	test("returns empty for unknown table names", async () => {
		const result = await handlePull(
			"shop-1",
			["unknown_table"],
			"2025-01-01T00:00:00.000Z",
		);
		expect(result.unknown_table).toBeUndefined();
		expect(result.serverTime).toBeDefined();
	});

	test("pulls multiple tables", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});

		const result = await handlePull(
			"shop-1",
			["categories", "products", "orders", "order_items"],
			"2025-01-01T00:00:00.000Z",
		);

		expect(result.categories).toEqual([]);
		expect(result.products).toEqual([]);
		expect(result.orders).toEqual([]);
		expect(result.order_items).toEqual([]);
		expect(result.serverTime).toBeDefined();
	});

	test("pulls order_items", async () => {
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});

		const result = await handlePull(
			"shop-1",
			["categories", "order_items"],
			"2025-01-01T00:00:00.000Z",
		);

		expect(result.categories).toEqual([]);
		expect(result.order_items).toEqual([]);
	});
});
