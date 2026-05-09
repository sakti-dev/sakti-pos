import { describe, expect, test, vi } from "vitest";

vi.mock("~/db", () => ({
	db: {
		run: vi.fn(),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => [
					{
						id: 1,
						isActive: true,
						name: "Owner",
						pin: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef:abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01",
						role: "owner",
					},
				]),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(),
			})),
		})),
	},
}));

async function createPbkdf2Hash(pin: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(pin),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
		key,
		256,
	);
	const saltHex = Array.from(salt)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const hashHex = Array.from(new Uint8Array(bits))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${saltHex}:${hashHex}`;
}

describe("auth-provider", () => {
	test("verifyPin succeeds with correct PBKDF2 pin", async () => {
		const pin = "123456";
		const hash = await createPbkdf2Hash(pin);

		const { verifyPin } = await import("../auth-provider");

		const dbModule = await import("~/db");
		vi.mocked(dbModule.db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => [
					{
						id: 1,
						isActive: true,
						name: "Owner",
						pin: hash,
						role: "owner",
					},
				]),
			})),
		} as never);

		const user = await verifyPin("1", pin);
		expect(user.name).toBe("Owner");
		expect(user.role).toBe("owner");
	});

	test("verifyPin rejects wrong pin", async () => {
		const pin = "123456";
		const hash = await createPbkdf2Hash(pin);

		const { verifyPin } = await import("../auth-provider");

		const dbModule = await import("~/db");
		vi.mocked(dbModule.db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => [
					{
						id: 1,
						isActive: true,
						name: "Owner",
						pin: hash,
						role: "owner",
					},
				]),
			})),
		} as never);

		await expect(verifyPin("1", "654321")).rejects.toThrow("Invalid PIN");
	});

	test("verifyPin rejects inactive staff", async () => {
		const pin = "123456";
		const hash = await createPbkdf2Hash(pin);

		const { verifyPin } = await import("../auth-provider");

		const dbModule = await import("~/db");
		vi.mocked(dbModule.db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => [
					{
						id: 2,
						isActive: false,
						name: "Ex",
						pin: hash,
						role: "cashier",
					},
				]),
			})),
		} as never);

		await expect(verifyPin("2", pin)).rejects.toThrow("Staff is deactivated");
	});

	test("verifyPin rejects missing staff", async () => {
		const { verifyPin } = await import("../auth-provider");

		const dbModule = await import("~/db");
		vi.mocked(dbModule.db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => []),
			})),
		} as never);

		await expect(verifyPin("999", "123456")).rejects.toThrow("Staff not found");
	});
});
