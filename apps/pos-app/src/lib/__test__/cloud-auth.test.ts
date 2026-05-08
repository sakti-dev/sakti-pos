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
});
