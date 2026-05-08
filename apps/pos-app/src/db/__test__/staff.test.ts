import { describe, expect, test, vi } from "vitest";

vi.mock("@repo/database", () => ({
	staff: {
		id: "id",
		merchantId: "merchant_id",
		name: "name",
		role: "role",
		pin: "pin",
	},
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions: unknown[]) => conditions),
	count: vi.fn(() => "count_placeholder"),
	eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
	inArray: vi.fn((col: unknown, values: unknown[]) => ({ col, values })),
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

vi.mock("~/store/outlet", () => ({
	currentMerchantId: vi.fn(() => null),
}));

function mockFromQuery(data: unknown[]) {
	return {
		where: vi.fn().mockResolvedValue(data),
		orderBy: vi.fn().mockResolvedValue(data),
	};
}

describe("staff db", () => {
	test("getStaff returns ordered staff", async () => {
		const fakeStaff = [
			{ id: "staff-1", name: "Alice" },
			{ id: "staff-2", name: "Bob" },
		];
		mockFrom.mockReturnValue(mockFromQuery(fakeStaff));

		const { getStaff } = await import("../staff");
		const result = await getStaff();

		expect(result).toEqual(fakeStaff);
		expect(mockSelect).toHaveBeenCalled();
		expect(mockFrom).toHaveBeenCalledWith(
			expect.objectContaining({ id: "id", name: "name" }),
		);
	});

	test("getStaffMember returns a single staff by id", async () => {
		const fakeStaffMember = { id: "staff-1", name: "Alice" };
		mockFrom.mockReturnValue(mockFromQuery([fakeStaffMember]));

		const { getStaffMember } = await import("../staff");
		const result = await getStaffMember("staff-1");

		expect(result).toEqual(fakeStaffMember);
	});

	test("getStaffMember returns undefined when not found", async () => {
		mockFrom.mockReturnValue(mockFromQuery([]));

		const { getStaffMember } = await import("../staff");
		const result = await getStaffMember("nonexistent");

		expect(result).toBeUndefined();
	});

	test("createStaffMember inserts and returns the new staff", async () => {
		const newStaffMember = { id: "staff-3", name: "Charlie", role: "cashier" };
		const mockReturning = vi.fn().mockResolvedValue([newStaffMember]);
		const mockValues = vi.fn(() => ({ returning: mockReturning }));
		mockInsert.mockReturnValue({ values: mockValues });

		const { createStaffMember } = await import("../staff");
		const result = await createStaffMember({
			name: "Charlie",
			role: "cashier",
		} as never);

		expect(result).toEqual(newStaffMember);
		expect(mockValues).toHaveBeenCalledWith({
			name: "Charlie",
			role: "cashier",
		});
	});

	test("updateStaffMember updates and returns the staff", async () => {
		const updatedStaffMember = {
			id: "staff-1",
			name: "Alice Updated",
			role: "manager",
		};
		const mockReturning = vi.fn().mockResolvedValue([updatedStaffMember]);
		const mockWhere = vi.fn(() => ({ returning: mockReturning }));
		const mockSet = vi.fn(() => ({ where: mockWhere }));
		mockUpdate.mockReturnValue({ set: mockSet });

		const { updateStaffMember } = await import("../staff");
		const result = await updateStaffMember("staff-1", {
			name: "Alice Updated",
		} as never);

		expect(result).toEqual(updatedStaffMember);
		expect(mockSet).toHaveBeenCalled();
		expect(mockWhere).toHaveBeenCalled();
	});

	test("countActiveManagers returns count from query", async () => {
		mockFrom.mockReturnValue(mockFromQuery([{ count: 3 }]));

		const { countActiveManagers } = await import("../staff");
		const result = await countActiveManagers();

		expect(result).toBe(3);
	});

	test("countActiveManagers returns 0 when no rows", async () => {
		mockFrom.mockReturnValue(mockFromQuery([]));

		const { countActiveManagers } = await import("../staff");
		const result = await countActiveManagers();

		expect(result).toBe(0);
	});
});
