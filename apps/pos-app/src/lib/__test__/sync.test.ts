import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
let mockShopId: string | null = "shop-1";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("~/lib/shop", () => ({
	currentShopId: () => mockShopId,
}));

vi.mock("~/lib/sync", async () => {
	const actual =
		await vi.importActual<typeof import("~/lib/sync")>("~/lib/sync");
	return {
		...actual,
	};
});

const {
	syncNow,
	runStartupSync,
	syncStatus,
	lastSyncTime,
	startSyncScheduler,
	stopSyncScheduler,
} = await import("~/lib/sync");

describe("syncNow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockShopId = "shop-1";
		document.cookie = "narvik_session=test-session-token";
	});

	test("returns empty result when no shopId", async () => {
		mockShopId = null;

		const result = await syncNow();
		expect(result).toEqual({
			pull: { rows_received: 0, server_time: "" },
			push: { tables_synced: [], server_wins_count: 0, server_time: "" },
			purged: 0,
		});
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("throws when no session cookie", async () => {
		document.cookie = "narvik_session=; Max-Age=0";

		await expect(syncNow()).rejects.toThrow(
			"Sesi tidak ditemukan. Silakan login ulang.",
		);
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("calls invoke with correct params including sessionCookie", async () => {
		const syncResult = {
			pull: { rows_received: 5, server_time: "2025-01-01T00:00:00.000Z" },
			push: {
				tables_synced: ["categories", "products"],
				server_wins_count: 0,
				server_time: "2025-01-01T00:00:00.000Z",
			},
			purged: 1,
		};
		mockInvoke.mockResolvedValue(syncResult);

		const result = await syncNow();

		expect(mockInvoke).toHaveBeenCalledWith("sync_now", {
			shopId: "shop-1",
			apiUrl: "http://localhost:3001",
			sessionCookie: "narvik_session=test-session-token",
		});
		expect(result).toEqual(syncResult);
		expect(syncStatus()).toBe("idle");
		expect(lastSyncTime()).toBe("2025-01-01T00:00:00.000Z");
	});

	test("sets offline and throws on invoke failure", async () => {
		mockInvoke.mockRejectedValue(new Error("Network error"));

		await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
		expect(syncStatus()).toBe("offline");
	});
});

describe("runStartupSync", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockShopId = "shop-1";
		document.cookie = "narvik_session=test-session-token";
	});

	test("does nothing when no shopId", async () => {
		mockShopId = null;

		await runStartupSync();
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("does nothing when no session cookie", async () => {
		document.cookie = "narvik_session=; Max-Age=0";

		await runStartupSync();
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("silently catches errors", async () => {
		mockInvoke.mockRejectedValue(new Error("Network error"));

		await expect(runStartupSync()).resolves.not.toThrow();
		expect(syncStatus()).toBe("offline");
	});

	test("sets idle on success", async () => {
		mockInvoke.mockResolvedValue({
			pull: { rows_received: 0, server_time: "" },
			push: { tables_synced: [], server_wins_count: 0, server_time: "" },
			purged: 0,
		});

		await runStartupSync();
		expect(syncStatus()).toBe("idle");
	});
});

describe("startSyncScheduler / stopSyncScheduler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockShopId = "shop-1";
		document.cookie = "narvik_session=test-session-token";
		mockInvoke.mockResolvedValue({
			pull: { rows_received: 0, server_time: "" },
			push: { tables_synced: [], server_wins_count: 0, server_time: "" },
			purged: 0,
		});
	});

	afterEach(() => {
		stopSyncScheduler();
		vi.useRealTimers();
	});

	test("startSyncScheduler calls syncNow immediately", async () => {
		startSyncScheduler();

		await vi.advanceTimersByTimeAsync(0);
		expect(mockInvoke).toHaveBeenCalledTimes(1);

		stopSyncScheduler();
	});

	test("stopSyncScheduler prevents further syncs", async () => {
		startSyncScheduler();
		stopSyncScheduler();

		await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
		expect(mockInvoke).toHaveBeenCalledTimes(1);
	});

	test("startSyncScheduler is idempotent", async () => {
		startSyncScheduler();
		startSyncScheduler();

		await vi.advanceTimersByTimeAsync(0);
		expect(mockInvoke).toHaveBeenCalledTimes(1);

		stopSyncScheduler();
	});
});
