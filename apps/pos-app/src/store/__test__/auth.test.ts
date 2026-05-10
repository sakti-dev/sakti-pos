import { beforeEach, describe, expect, test, vi } from "vitest";

const mockSetUser = vi.fn();
const mockUser = vi.fn<() => { id: string; name: string; role: string } | null>(
	() => null,
);
const mockVerifyPin = vi.fn();
const mockChangePin = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("solid-js", () => ({
	createSignal: () => [mockUser, mockSetUser],
}));

vi.mock("~/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => mockDbSelect(),
			}),
		}),
	},
}));

vi.mock("~/lib/auth/provider", () => ({
	verifyPin: (...args: unknown[]) => mockVerifyPin(...args),
	changePin: (...args: unknown[]) => mockChangePin(...args),
}));

describe("auth", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
	});

	describe("getLastUserId / setLastUserId", () => {
		test("returns null when no stored value", async () => {
			const { getLastUserId } = await import("~/store/auth");
			expect(getLastUserId()).toBeNull();
		});

		test("returns stored staff id", async () => {
			const { getLastUserId, setLastUserId } = await import("~/store/auth");
			setLastUserId("staff-42");
			expect(getLastUserId()).toBe("staff-42");
		});
	});

	describe("isAuthenticated / currentUser / currentUserRole", () => {
		test("returns false when no user", async () => {
			mockUser.mockReturnValue(null);
			const { isAuthenticated } = await import("~/store/auth");
			expect(isAuthenticated()).toBe(false);
		});

		test("returns true when user is set", async () => {
			mockUser.mockReturnValue({
				id: "staff-1",
				name: "Manager",
				role: "manager",
			});
			const { isAuthenticated } = await import("~/store/auth");
			expect(isAuthenticated()).toBe(true);
		});

		test("currentUser returns the user object", async () => {
			const u = { id: "staff-2", name: "Kasir", role: "cashier" };
			mockUser.mockReturnValue(u);
			const { currentUser } = await import("~/store/auth");
			expect(currentUser()).toEqual(u);
		});

		test("currentUserRole returns role when set", async () => {
			mockUser.mockReturnValue({
				id: "staff-1",
				name: "Manager",
				role: "manager",
			});
			const { currentUserRole } = await import("~/store/auth");
			expect(currentUserRole()).toBe("manager");
		});

		test("currentUserRole returns null when no user", async () => {
			mockUser.mockReturnValue(null);
			const { currentUserRole } = await import("~/store/auth");
			expect(currentUserRole()).toBeNull();
		});
	});

	describe("login", () => {
		test("calls verifyPin, sets user, and stores last staff id", async () => {
			const authUser = { id: "staff-5", name: "Test", role: "cashier" };
			mockVerifyPin.mockResolvedValue(authUser);

			const { login } = await import("~/store/auth");
			const result = await login("staff-5", "123456");

			expect(mockVerifyPin).toHaveBeenCalledWith("staff-5", "123456");
			expect(mockSetUser).toHaveBeenCalledWith(authUser);
			expect(result).toEqual(authUser);
			expect(localStorage.getItem("sakti-pos:last-staff-id")).toBe("staff-5");
		});
	});

	describe("cloud staff login", () => {
		test("loginWithCloudStaff sets active user without verifying PIN", async () => {
			mockDbSelect.mockResolvedValue([
				{ id: "staff-owner", name: "Owner", role: "owner", isActive: true },
			]);

			const { loginWithCloudStaff } = await import("~/store/auth");
			const result = await loginWithCloudStaff("staff-owner");

			expect(mockVerifyPin).not.toHaveBeenCalled();
			expect(mockSetUser).toHaveBeenCalledWith({
				id: "staff-owner",
				name: "Owner",
				role: "owner",
			});
			expect(result).toEqual({
				id: "staff-owner",
				name: "Owner",
				role: "owner",
			});
			expect(localStorage.getItem("sakti-pos:last-staff-id")).toBe(
				"staff-owner",
			);
		});

		test("loginWithCloudStaff rejects inactive staff", async () => {
			mockDbSelect.mockResolvedValue([
				{ id: "staff-owner", name: "Owner", role: "owner", isActive: false },
			]);

			const { loginWithCloudStaff } = await import("~/store/auth");

			await expect(loginWithCloudStaff("staff-owner")).rejects.toThrow(
				"Staff is deactivated",
			);
		});
	});

	describe("logout", () => {
		test("clears the user signal", async () => {
			const { logout } = await import("~/store/auth");
			logout();
			expect(mockSetUser).toHaveBeenCalledWith(null);
		});
	});

	describe("changeCurrentUserPin", () => {
		test("throws when not authenticated", async () => {
			mockUser.mockReturnValue(null);
			const { changeCurrentUserPin } = await import("~/store/auth");
			await expect(changeCurrentUserPin("654321")).rejects.toThrow(
				"Not authenticated",
			);
		});

		test("calls changePin with staff id", async () => {
			mockUser.mockReturnValue({
				id: "staff-3",
				name: "Test",
				role: "manager",
			});
			const { changeCurrentUserPin } = await import("~/store/auth");
			await changeCurrentUserPin("654321");
			expect(mockChangePin).toHaveBeenCalledWith("staff-3", "654321");
		});
	});

	describe("getActiveStaff", () => {
		test("returns active staff from db", async () => {
			mockDbSelect.mockResolvedValue([
				{ id: "staff-1", name: "Manager", role: "manager" },
				{ id: "staff-2", name: "Kasir", role: "cashier" },
			]);

			const { getActiveStaff } = await import("~/store/auth");
			const staff = await getActiveStaff();

			expect(staff).toEqual([
				{ id: "staff-1", name: "Manager", role: "manager" },
				{ id: "staff-2", name: "Kasir", role: "cashier" },
			]);
		});

		test("returns empty array when no active staff", async () => {
			mockDbSelect.mockResolvedValue([]);
			const { getActiveStaff } = await import("~/store/auth");
			const staff = await getActiveStaff();
			expect(staff).toEqual([]);
		});
	});
});
