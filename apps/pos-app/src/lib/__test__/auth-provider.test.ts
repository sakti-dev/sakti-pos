import { beforeEach, describe, expect, test, vi } from "vitest";

const PBKDF2_HASH_FOR_123456 =
	"000102030405060708090a0b0c0d0e0f:3e3d2422f00f2cc1d1bad045819bfb8360117d59c588035c4294f3403ac097a5";

const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("~/db", () => ({
	db: {
		run: vi.fn(),
		select: mockSelect,
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(),
			})),
		})),
	},
}));

function mockStaffRows(rows: unknown[]) {
	mockSelect.mockReturnValue({
		from: vi.fn(() => ({
			where: vi.fn(() => rows),
		})),
	});
}

describe("auth-provider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("verifyPin succeeds with correct PBKDF2 pin", async () => {
		const { verifyPin } = await import("../auth-provider");

		mockStaffRows([
			{
				id: 1,
				isActive: true,
				name: "Owner",
				pin: PBKDF2_HASH_FOR_123456,
				role: "owner",
			},
		]);

		const user = await verifyPin("1", "123456");
		expect(user.name).toBe("Owner");
		expect(user.role).toBe("owner");
	});

	test("verifyPin rejects wrong pin", async () => {
		const { verifyPin } = await import("../auth-provider");

		mockStaffRows([
			{
				id: 1,
				isActive: true,
				name: "Owner",
				pin: PBKDF2_HASH_FOR_123456,
				role: "owner",
			},
		]);

		await expect(verifyPin("1", "654321")).rejects.toThrow("Invalid PIN");
	});

	test("verifyPin rejects inactive staff", async () => {
		const { verifyPin } = await import("../auth-provider");

		mockStaffRows([
			{
				id: 2,
				isActive: false,
				name: "Ex",
				pin: PBKDF2_HASH_FOR_123456,
				role: "cashier",
			},
		]);

		await expect(verifyPin("2", "123456")).rejects.toThrow(
			"Staff is deactivated",
		);
	});

	test("verifyPin rejects missing staff", async () => {
		const { verifyPin } = await import("../auth-provider");

		mockStaffRows([]);

		await expect(verifyPin("999", "123456")).rejects.toThrow("Staff not found");
	});
});
