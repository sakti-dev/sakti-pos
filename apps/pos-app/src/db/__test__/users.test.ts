import { describe, expect, test, vi } from "vitest";

vi.mock("@repo/database", () => ({
	users: { id: "id", name: "name", role: "role", pin: "pin" },
}));

vi.mock("drizzle-orm", () => ({
	count: vi.fn(() => "count_placeholder"),
	eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
}));

const mockFrom = vi.fn();
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../index", () => ({
	db: {
		select: mockSelect,
		insert: mockInsert,
		update: mockUpdate,
	},
}));

function mockFromQuery(data: unknown[]) {
	return {
		where: vi.fn().mockResolvedValue(data),
		orderBy: vi.fn().mockResolvedValue(data),
	};
}

describe("users db", () => {
	test("getUsers returns ordered users", async () => {
		const fakeUsers = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];
		mockFrom.mockReturnValue(mockFromQuery(fakeUsers));

		const { getUsers } = await import("../users");
		const result = await getUsers();

		expect(result).toEqual(fakeUsers);
		expect(mockSelect).toHaveBeenCalled();
		expect(mockFrom).toHaveBeenCalledWith(
			expect.objectContaining({ id: "id", name: "name" }),
		);
	});

	test("getUser returns a single user by id", async () => {
		const fakeUser = { id: 1, name: "Alice" };
		mockFrom.mockReturnValue(mockFromQuery([fakeUser]));

		const { getUser } = await import("../users");
		const result = await getUser(1);

		expect(result).toEqual(fakeUser);
	});

	test("getUser returns undefined when not found", async () => {
		mockFrom.mockReturnValue(mockFromQuery([]));

		const { getUser } = await import("../users");
		const result = await getUser(999);

		expect(result).toBeUndefined();
	});

	test("createUser inserts and returns the new user", async () => {
		const newUser = { id: 1, name: "Charlie", role: "cashier" };
		const mockReturning = vi.fn().mockResolvedValue([newUser]);
		const mockValues = vi.fn(() => ({ returning: mockReturning }));
		mockInsert.mockReturnValue({ values: mockValues });

		const { createUser } = await import("../users");
		const result = await createUser({
			name: "Charlie",
			role: "cashier",
		} as never);

		expect(result).toEqual(newUser);
		expect(mockValues).toHaveBeenCalledWith({
			name: "Charlie",
			role: "cashier",
		});
	});

	test("updateUser updates and returns the user", async () => {
		const updatedUser = { id: 1, name: "Alice Updated", role: "owner" };
		const mockReturning = vi.fn().mockResolvedValue([updatedUser]);
		const mockWhere = vi.fn(() => ({ returning: mockReturning }));
		const mockSet = vi.fn(() => ({ where: mockWhere }));
		mockUpdate.mockReturnValue({ set: mockSet });

		const { updateUser } = await import("../users");
		const result = await updateUser(1, { name: "Alice Updated" } as never);

		expect(result).toEqual(updatedUser);
		expect(mockSet).toHaveBeenCalled();
		expect(mockWhere).toHaveBeenCalled();
	});

	test("countActiveOwners returns count from query", async () => {
		mockFrom.mockReturnValue(mockFromQuery([{ count: 3 }]));

		const { countActiveOwners } = await import("../users");
		const result = await countActiveOwners();

		expect(result).toBe(3);
	});

	test("countActiveOwners returns 0 when no rows", async () => {
		mockFrom.mockReturnValue(mockFromQuery([]));

		const { countActiveOwners } = await import("../users");
		const result = await countActiveOwners();

		expect(result).toBe(0);
	});
});
