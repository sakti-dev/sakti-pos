import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@repo/database", () => ({
	staff: {
		cloudUserId: "cloud_user_id",
		id: "id",
		isActive: "is_active",
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
const mockRecordLocalChange = vi.fn();

vi.mock("../index", () => ({
	db: {
		select: mockSelect,
		insert: mockInsert,
		update: mockUpdate,
	},
}));

vi.mock("../sync-outbox", () => ({
	recordLocalChange: (...args: unknown[]) => mockRecordLocalChange(...args),
}));

vi.mock("~/store/outlet", () => ({
	currentMerchantId: vi.fn(() => null),
}));

function mockFromQuery(data: unknown[]) {
	const limitFn = vi.fn().mockResolvedValue(data);
	const whereResult = Object.assign(Promise.resolve(data), {
		limit: limitFn,
	});
	return {
		where: vi.fn().mockReturnValue(whereResult),
		orderBy: vi.fn().mockResolvedValue(data),
	};
}

describe("staff db", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

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
		const newStaffMember = {
			id: "staff-3",
			merchantId: "merchant-1",
			name: "Charlie",
			role: "cashier",
		};
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
		expect(mockRecordLocalChange).toHaveBeenCalledWith({
			operation: "insert",
			rowId: "staff-3",
			scopeId: "merchant-1",
			scopeType: "merchant",
			tableName: "staff",
		});
	});

	test("updateStaffMember updates and returns the staff", async () => {
		const updatedStaffMember = {
			id: "staff-1",
			merchantId: "merchant-1",
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
		expect(mockRecordLocalChange).toHaveBeenCalledWith({
			operation: "update",
			rowId: "staff-1",
			scopeId: "merchant-1",
			scopeType: "merchant",
			tableName: "staff",
		});
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

	test("getOwnerStaff returns owner staff for a merchant", async () => {
		const owner = { id: "owner-1", name: "Owner", role: "owner" };
		mockFrom.mockReturnValue(mockFromQuery([owner]));

		const { getOwnerStaff } = await import("../staff");
		const result = await getOwnerStaff("merchant-1");

		expect(result).toEqual(owner);
	});

	test("getOwnerStaff returns undefined when no owner exists", async () => {
		mockFrom.mockReturnValue(mockFromQuery([]));

		const { getOwnerStaff } = await import("../staff");
		const result = await getOwnerStaff("merchant-1");

		expect(result).toBeUndefined();
	});

	test("getStaffByCloudUserId returns matching active staff", async () => {
		const owner = {
			id: "owner-1",
			name: "Owner",
			role: "owner",
			cloudUserId: "cloud-user-1",
		};
		mockFrom.mockReturnValue(mockFromQuery([owner]));

		const { getStaffByCloudUserId } = await import("../staff");
		const result = await getStaffByCloudUserId("merchant-1", "cloud-user-1");

		expect(result).toEqual(owner);
	});
});
