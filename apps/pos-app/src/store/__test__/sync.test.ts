import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
const mockGetSyncStatus = vi.fn();
const mockProcessPendingAssetJobs = vi.fn();
const mockRequestUploadPendingProductImages = vi.fn();
const mockHydrateMissingProductImages = vi.fn();
let mockOutletId: string | null = "outlet-1";
let mockMerchantId: string | null = "merchant-1";
let mockToken: string | null = "test-session-token";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("~/store/outlet", () => ({
  currentMerchantId: () => mockMerchantId,
  currentOutletId: () => mockOutletId,
}));

vi.mock("~/lib/auth/storage", () => ({
  AuthStorage: {
    getToken: () => Promise.resolve(mockToken),
  },
}));

vi.mock("~/lib/api/sync", () => ({
  getSyncStatus: (...args: unknown[]) => mockGetSyncStatus(...args),
}));

vi.mock("~/lib/assets/processing", () => ({
  processPendingAssetJobs: (...args: unknown[]) =>
    mockProcessPendingAssetJobs(...args),
}));

vi.mock("~/lib/assets/sync", () => ({
  hydrateMissingAssets: (...args: unknown[]) =>
    mockHydrateMissingProductImages(...args),
  uploadPendingAssets: (...args: unknown[]) =>
    mockRequestUploadPendingProductImages(...args),
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
    mockMerchantId = "merchant-1";
    mockToken = "test-session-token";
    mockProcessPendingAssetJobs.mockResolvedValue(0);
    mockHydrateMissingProductImages.mockResolvedValue(0);
    mockGetSyncStatus.mockResolvedValue({
      changedTables: [],
      hasChanges: false,
      latestEventId: 10,
      needsFullResync: false,
      oldestAvailableEventId: 1,
    });
  });

  test("returns empty result when no outletId", async () => {
    mockOutletId = null;
    mockMerchantId = null;

    const result = await syncNow();
    expect(result).toEqual({
      mode: "skipped",
      pull: { rows_received: 0, server_time: "" },
      push: { tables_synced: [], server_wins_count: 0, server_time: "" },
      purged: 0,
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockProcessPendingAssetJobs).not.toHaveBeenCalled();
  });

  test("throws when no session token", async () => {
    mockToken = null;

    await expect(syncNow()).rejects.toThrow(
      "Sesi tidak ditemukan. Silakan login ulang."
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("skips native transfer when local and server have no changes", async () => {
    mockInvoke.mockResolvedValueOnce({
      last_server_event_id: 10,
      local_dirty_count: 0,
    });
    mockRequestUploadPendingProductImages.mockResolvedValueOnce(0);

    const result = await syncNow();

    expect(mockRequestUploadPendingProductImages).toHaveBeenCalledWith({
      apiUrl: expect.any(String),
      merchantId: "merchant-1",
      sessionToken: "test-session-token",
    });
    expect(mockProcessPendingAssetJobs).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("get_sync_local_state", {
      outletId: "outlet-1",
    });
    expect(mockGetSyncStatus).toHaveBeenCalledWith({
      lastServerEventId: 10,
      outletId: "outlet-1",
    });
    expect(result.mode).toBe("skipped");
    expect(result.pull.rows_received).toBe(0);
  });

  test("runs a follow-up sync when another sync is requested during an active run", async () => {
    let finishPhotoJobs: ((value: number) => void) | undefined;
    mockProcessPendingAssetJobs.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishPhotoJobs = resolve;
        })
    );
    mockProcessPendingAssetJobs.mockResolvedValueOnce(0);
    mockRequestUploadPendingProductImages.mockResolvedValue(0);
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 1,
      })
      .mockResolvedValueOnce({
        pull: { rows_received: 0, server_time: "2026-05-13T00:00:00.000Z" },
        purged: 0,
        push: {
          server_time: "2026-05-13T00:00:00.000Z",
          server_wins_count: 0,
          tables_synced: ["products"],
        },
      })
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 0,
      });

    const firstSync = syncNow();
    const secondSync = syncNow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockProcessPendingAssetJobs).toHaveBeenCalledTimes(1);
    expect(mockRequestUploadPendingProductImages).not.toHaveBeenCalled();

    finishPhotoJobs?.(1);
    const [firstResult, secondResult] = await Promise.all([
      firstSync,
      secondSync,
    ]);

    expect(firstResult).toBe(secondResult);
    expect(secondResult.mode).toBe("skipped");
    expect(mockProcessPendingAssetJobs).toHaveBeenCalledTimes(2);
    expect(mockRequestUploadPendingProductImages).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "get_sync_local_state", {
      outletId: "outlet-1",
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "sync_push_outbox", {
      apiUrl: expect.any(String),
      outletId: "outlet-1",
      sessionToken: "test-session-token",
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, "get_sync_local_state", {
      outletId: "outlet-1",
    });
  });

  test("continues sync when queued image uploads fail", async () => {
    const syncResult = {
      mode: "push_only",
      pull: { rows_received: 1, server_time: "2025-01-01T00:00:00.000Z" },
      push: {
        tables_synced: ["products"],
        server_wins_count: 0,
        server_time: "2025-01-01T00:00:00.000Z",
      },
      purged: 0,
    };
    mockRequestUploadPendingProductImages.mockRejectedValueOnce(
      new Error("upload queue failed")
    );
    mockInvoke.mockResolvedValueOnce({
      last_server_event_id: 10,
      local_dirty_count: 1,
    });
    mockInvoke.mockResolvedValueOnce(syncResult);

    const result = await syncNow();

    expect(result.mode).toBe("push_only");
    expect(mockRequestUploadPendingProductImages).toHaveBeenCalledWith({
      apiUrl: expect.any(String),
      merchantId: "merchant-1",
      sessionToken: "test-session-token",
    });
    expect(mockProcessPendingAssetJobs).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(syncStatus()).toBe("idle");
  });

  test("resolves sync without waiting for asset hydration", async () => {
    let finishHydration: ((value: number) => void) | undefined;
    mockRequestUploadPendingProductImages.mockResolvedValueOnce(0);
    mockHydrateMissingProductImages.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishHydration = resolve;
        })
    );
    mockInvoke.mockResolvedValueOnce({
      last_server_event_id: 10,
      local_dirty_count: 0,
    });

    const result = await syncNow();

    expect(result.mode).toBe("skipped");
    expect(mockHydrateMissingProductImages).toHaveBeenCalledWith({
      apiUrl: expect.any(String),
      merchantId: "merchant-1",
      sessionToken: "test-session-token",
    });
    expect(syncStatus()).toBe("idle");

    finishHydration?.(0);
  });

  test("does not start overlapping asset hydration", async () => {
    let finishHydration: ((value: number) => void) | undefined;
    mockRequestUploadPendingProductImages.mockResolvedValue(0);
    mockHydrateMissingProductImages.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishHydration = resolve;
        })
    );
    mockHydrateMissingProductImages.mockResolvedValueOnce(0);
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 0,
      })
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 0,
      });

    await syncNow();
    await syncNow();

    expect(mockHydrateMissingProductImages).toHaveBeenCalledTimes(1);

    finishHydration?.(1);
    await vi.waitFor(() =>
      expect(mockHydrateMissingProductImages).toHaveBeenCalledTimes(2)
    );
  });

  test("keeps sync successful when background asset hydration fails", async () => {
    mockRequestUploadPendingProductImages.mockResolvedValueOnce(0);
    mockHydrateMissingProductImages.mockRejectedValueOnce(
      new Error("hydrate failed")
    );
    mockInvoke.mockResolvedValueOnce({
      last_server_event_id: 10,
      local_dirty_count: 0,
    });

    const result = await syncNow();

    expect(result.mode).toBe("skipped");
    await vi.waitFor(() =>
      expect(mockHydrateMissingProductImages).toHaveBeenCalledOnce()
    );
    expect(syncStatus()).toBe("idle");
  });

  test("runs push only when local has changes and server has none", async () => {
    const syncResult = {
      mode: "push_only",
      pull: { rows_received: 5, server_time: "2025-01-01T00:00:00.000Z" },
      push: {
        tables_synced: ["categories", "products"],
        server_wins_count: 0,
        server_time: "2025-01-01T00:00:00.000Z",
      },
      purged: 1,
    };
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 2,
      })
      .mockResolvedValueOnce(syncResult);

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_push_outbox", {
      outletId: "outlet-1",
      apiUrl: expect.any(String),
      sessionToken: "test-session-token",
    });
    expect(result).toEqual(syncResult);
    expect(syncStatus()).toBe("idle");
    expect(lastSyncTime()).toBe("2025-01-01T00:00:00.000Z");
  });

  test("runs pull only when server has changes and local has none", async () => {
    const syncResult = {
      mode: "pull_only",
      pull: { rows_received: 3, server_time: "2025-01-01T00:00:00.000Z" },
      push: {
        tables_synced: [],
        server_wins_count: 0,
        server_time: "",
      },
      purged: 0,
    };
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 0,
      })
      .mockResolvedValueOnce(syncResult);
    mockGetSyncStatus.mockResolvedValue({
      changedTables: ["products"],
      hasChanges: true,
      latestEventId: 11,
      needsFullResync: false,
      oldestAvailableEventId: 1,
    });

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_pull_events", {
      apiUrl: expect.any(String),
      latestEventId: 11,
      outletId: "outlet-1",
      sessionToken: "test-session-token",
    });
    expect(result.mode).toBe("pull_only");
  });

  test("pulls server event changes once then skips after the cursor catches up", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 0,
        local_dirty_count: 0,
      })
      .mockResolvedValueOnce({
        mode: "pull_only",
        pull: { rows_received: 3, server_time: "" },
        purged: 0,
        push: {
          server_time: "",
          server_wins_count: 0,
          tables_synced: [],
        },
      })
      .mockResolvedValueOnce({
        last_server_event_id: 3,
        local_dirty_count: 0,
      });
    mockGetSyncStatus
      .mockResolvedValueOnce({
        changedTables: ["categories", "products", "outlet_products"],
        hasChanges: true,
        latestEventId: 3,
        needsFullResync: false,
        oldestAvailableEventId: 1,
      })
      .mockResolvedValueOnce({
        changedTables: [],
        hasChanges: false,
        latestEventId: 3,
        needsFullResync: false,
        oldestAvailableEventId: 1,
      });

    const pullResult = await syncNow();
    const skippedResult = await syncNow();

    expect(mockInvoke).toHaveBeenNthCalledWith(2, "sync_pull_events", {
      apiUrl: expect.any(String),
      latestEventId: 3,
      outletId: "outlet-1",
      sessionToken: "test-session-token",
    });
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(pullResult.mode).toBe("pull_only");
    expect(pullResult.pull.rows_received).toBe(3);
    expect(skippedResult.mode).toBe("skipped");
    expect(mockGetSyncStatus).toHaveBeenNthCalledWith(2, {
      lastServerEventId: 3,
      outletId: "outlet-1",
    });
  });

  test("runs full sync when both sides have changes", async () => {
    const syncResult = {
      mode: "full",
      pull: { rows_received: 5, server_time: "2025-01-01T00:00:00.000Z" },
      push: {
        tables_synced: ["categories", "products"],
        server_wins_count: 0,
        server_time: "2025-01-01T00:00:00.000Z",
      },
      purged: 1,
    };
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 2,
      })
      .mockResolvedValueOnce(syncResult);
    mockGetSyncStatus.mockResolvedValue({
      changedTables: ["products"],
      hasChanges: true,
      latestEventId: 11,
      needsFullResync: false,
      oldestAvailableEventId: 1,
    });

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_now", {
      apiUrl: expect.any(String),
      outletId: "outlet-1",
      sessionToken: "test-session-token",
    });
    expect(result.mode).toBe("full");
  });

  test("returns empty result when no outletId", async () => {
    mockOutletId = null;

    const result = await syncNow();
    expect(result).toEqual({
      mode: "skipped",
      pull: { rows_received: 0, server_time: "" },
      push: { tables_synced: [], server_wins_count: 0, server_time: "" },
      purged: 0,
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("throws when no session token", async () => {
    mockToken = null;

    await expect(syncNow()).rejects.toThrow(
      "Sesi tidak ditemukan. Silakan login ulang."
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("runs full sync when server cursor requires full resync", async () => {
    const syncResult = {
      mode: "full",
      pull: { rows_received: 5, server_time: "2025-01-01T00:00:00.000Z" },
      push: {
        tables_synced: ["categories", "products"],
        server_wins_count: 0,
        server_time: "2025-01-01T00:00:00.000Z",
      },
      purged: 1,
    };
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 10,
        local_dirty_count: 0,
      })
      .mockResolvedValueOnce(syncResult);
    mockGetSyncStatus.mockResolvedValue({
      changedTables: ["products"],
      hasChanges: true,
      latestEventId: 50,
      needsFullResync: true,
      oldestAvailableEventId: 50,
    });

    const result = await syncNow();

    const call = mockInvoke.mock.calls[1];
    expect(call[0]).toBe("sync_full_resync");
    expect(call[1].outletId).toBe("outlet-1");
    expect(call[1].sessionToken).toBe("test-session-token");
    expect(call[1].apiUrl).toContain("://");
    expect(call[1].latestEventId).toBe(50);
    expect(result).toEqual(syncResult);
    expect(syncStatus()).toBe("idle");
    expect(lastSyncTime()).toBe("2025-01-01T00:00:00.000Z");
  });

  test("runs full sync when local outlet scope is missing after reinstall", async () => {
    const syncResult = {
      mode: "full",
      pull: { rows_received: 5, server_time: "2025-01-01T00:00:00.000Z" },
      push: {
        tables_synced: [],
        server_wins_count: 0,
        server_time: "",
      },
      purged: 0,
    };
    mockInvoke
      .mockResolvedValueOnce({
        last_server_event_id: 0,
        local_dirty_count: 0,
        needs_baseline_sync: true,
      })
      .mockResolvedValueOnce(syncResult);

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_full_resync", {
      apiUrl: expect.any(String),
      latestEventId: 10,
      outletId: "outlet-1",
      sessionToken: "test-session-token",
    });
    expect(result.mode).toBe("full");
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
    mockMerchantId = "merchant-1";
    mockToken = "test-session-token";
  });

  test("does nothing when no outletId", async () => {
    mockOutletId = null;
    mockMerchantId = null;

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
    mockMerchantId = "merchant-1";
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
