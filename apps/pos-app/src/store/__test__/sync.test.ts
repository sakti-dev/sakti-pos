import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
let mockOutletId: string | null = "outlet-1";
let mockToken: string | null = "test-session-token";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("~/store/outlet", () => ({
	currentOutletId: () => mockOutletId,
}));

vi.mock("~/lib/auth-storage", () => ({
	AuthStorage: {
		getToken: () => Promise.resolve(mockToken),
	},
}));

vi.mock("~/store/sync", async () => {
	const actual =
		await vi.importActual<typeof import("~/store/sync")>("~/store/sync");
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
} = await import("~/store/sync");

describe("syncNow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOutletId = "outlet-1";
		mockToken = "test-session-token";
	});

	test("returns empty result when no outletId", async () => {
		mockOutletId = null;

		const result = await syncNow();
		expect(result).toEqual({
			pull: { rows_received: 0, server_time: "" },
			push: { tables_synced: [], server_wins_count: 0, server_time: "" },
			purged: 0,
		});
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("throws when no session token", async () => {
		mockToken = null;

		await expect(syncNow()).rejects.toThrow(
			"Sesi tidak ditemukan. Silakan login ulang.",
		);
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("calls invoke with correct params including sessionToken", async () => {
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
			outletId: "outlet-1",
			apiUrl: expect.any(String),
			sessionToken: "test-session-token",
		});
		expect(result).toEqual(syncResult);
		expect(syncStatus()).toBe("idle");
		expect(lastSyncTime()).toBe("2025-01-01T00:00:00.000Z");
	});

	test("returns empty result when no outletId", async () => {
		mockOutletId = null;

		const result = await syncNow();
		expect(result).toEqual({
			pull: { rows_received: 0, server_time: "" },
			push: { tables_synced: [], server_wins_count: 0, server_time: "" },
			purged: 0,
		});
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("throws when no session token", async () => {
		mockToken = null;

		await expect(syncNow()).rejects.toThrow(
			"Sesi tidak ditemukan. Silakan login ulang.",
		);
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("calls invoke with correct params including sessionToken", async () => {
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

		const call = mockInvoke.mock.calls[0];
		expect(call[0]).toBe("sync_now");
		expect(call[1].outletId).toBe("outlet-1");
		expect(call[1].sessionToken).toBe("test-session-token");
		expect(call[1].apiUrl).toContain("://");
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
		mockOutletId = "outlet-1";
		mockToken = "test-session-token";
	});

	test("does nothing when no outletId", async () => {
		mockOutletId = null;

		await runStartupSync();
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("does nothing when no session token", async () => {
		mockToken = null;

		await runStartupSync();
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("does nothing when no outletId", async () => {
		mockOutletId = null;

		await runStartupSync();
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	test("does nothing when no session token", async () => {
		mockToken = null;

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
		mockOutletId = "outlet-1";
		mockToken = "test-session-token";
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
