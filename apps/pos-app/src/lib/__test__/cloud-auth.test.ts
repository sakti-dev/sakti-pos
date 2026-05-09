import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../auth-storage", () => ({
	AuthStorage: {
		getToken: vi.fn(() => Promise.resolve(null)),
		saveToken: vi.fn(() => Promise.resolve()),
		clearToken: vi.fn(() => Promise.resolve()),
	},
}));

describe("isCloudAuthenticated", () => {
	afterEach(() => {
		vi.resetModules();
		vi.unstubAllGlobals();
	});

	test("returns false when no token stored", async () => {
		const { isCloudAuthenticated } = await import("../cloud-auth");
		expect(await isCloudAuthenticated()).toBe(false);
	});

	test("returns true when token exists", async () => {
		const { AuthStorage } = await import("../auth-storage");
		(AuthStorage.getToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			"test-token",
		);
		const { isCloudAuthenticated } = await import("../cloud-auth");
		expect(await isCloudAuthenticated()).toBe(true);
	});

	test("getCurrentCloudStaff posts to staff me endpoint", async () => {
		const fetchMock = vi.fn(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				text: () =>
					Promise.resolve(
						JSON.stringify({
							claimed: false,
							staff: {
								hasPin: true,
								id: "staff-1",
								isActive: true,
								merchantId: "merchant-1",
								name: "Owner",
								outletId: "outlet-1",
								role: "owner",
							},
						}),
					),
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const { getCurrentCloudStaff } = await import("../cloud-auth");
		const result = await getCurrentCloudStaff("merchant-1");

		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/api/merchants/merchant-1/staff/me"),
			expect.objectContaining({ method: "POST" }),
		);
		expect(result.staff?.id).toBe("staff-1");
	});
});
