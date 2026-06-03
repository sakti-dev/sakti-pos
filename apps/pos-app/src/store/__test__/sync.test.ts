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
  transformCallback: vi.fn(),
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

vi.mock("~/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
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

const {
  syncNow,
  runStartupSync,
  syncStatus,
  lastSyncTime,
  startSyncScheduler,
  stopSyncScheduler,
} = await import("~/store/sync");

function resetSyncMocks() {
  mockInvoke.mockReset();
  mockGetSyncStatus.mockReset();
  mockProcessPendingAssetJobs.mockReset();
  mockRequestUploadPendingProductImages.mockReset();
  mockHydrateMissingProductImages.mockReset();
  mockOutletId = "outlet-1";
  mockMerchantId = "merchant-1";
  mockToken = "test-session-token";
  mockInvoke.mockResolvedValue({
    last_server_watermark: "",
    local_dirty_count: 0,
  });
  mockProcessPendingAssetJobs.mockResolvedValue(0);
  mockHydrateMissingProductImages.mockResolvedValue(0);
  mockGetSyncStatus.mockResolvedValue({
    changedTables: [],
    hasChanges: false,
    cursor: "",
  });
}

async function flushMicrotasks(count = 6) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

describe("syncNow", () => {
  beforeEach(() => {
    resetSyncMocks();
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
      last_server_watermark: "",
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
      cursor: "",
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
        last_server_watermark: "",
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
        last_server_watermark: "",
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
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "sync_push", {
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
      last_server_watermark: "",
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
      last_server_watermark: "",
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
        last_server_watermark: "",
        local_dirty_count: 0,
      })
      .mockResolvedValueOnce({
        last_server_watermark: "",
        local_dirty_count: 0,
      });

    await syncNow();
    await syncNow();

    expect(mockHydrateMissingProductImages).toHaveBeenCalledTimes(1);

    finishHydration?.(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockHydrateMissingProductImages).toHaveBeenCalledTimes(2);
  });

  test("keeps sync successful when background asset hydration fails", async () => {
    mockRequestUploadPendingProductImages.mockResolvedValueOnce(0);
    mockHydrateMissingProductImages.mockRejectedValueOnce(
      new Error("hydrate failed")
    );
    mockInvoke.mockResolvedValueOnce({
      last_server_watermark: "",
      local_dirty_count: 0,
    });

    const result = await syncNow();

    expect(result.mode).toBe("skipped");
    await Promise.resolve();
    await Promise.resolve();
    expect(mockHydrateMissingProductImages).toHaveBeenCalledOnce();
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
        last_server_watermark: "",
        local_dirty_count: 2,
      })
      .mockResolvedValueOnce(syncResult);

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_push", {
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
        last_server_watermark: "",
        local_dirty_count: 0,
      })
      .mockResolvedValueOnce(syncResult);
    mockGetSyncStatus.mockResolvedValue({
      changedTables: ["products"],
      hasChanges: true,
      cursor: "sync:11:products:p1",
    });

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_pull", {
      apiUrl: expect.any(String),
      outletId: "outlet-1",
      sessionToken: "test-session-token",
      tables: ["products"],
    });
    expect(result.mode).toBe("pull_only");
  });

  test("pulls server event changes once then skips after the cursor catches up", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        last_server_watermark: "",
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
        last_server_watermark: "sync:3:products:p1",
        local_dirty_count: 0,
      });
    mockGetSyncStatus
      .mockResolvedValueOnce({
        changedTables: ["categories", "products", "outlet_products"],
        hasChanges: true,
        cursor: "sync:3:products:p1",
      })
      .mockResolvedValueOnce({
        changedTables: [],
        hasChanges: false,
        cursor: "sync:3:products:p1",
      });

    const pullResult = await syncNow();
    const skippedResult = await syncNow();

    expect(mockInvoke).toHaveBeenNthCalledWith(2, "sync_pull", {
      apiUrl: expect.any(String),
      outletId: "outlet-1",
      sessionToken: "test-session-token",
      tables: ["categories", "products", "outlet_products"],
    });
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(pullResult.mode).toBe("pull_only");
    expect(pullResult.pull.rows_received).toBe(3);
    expect(skippedResult.mode).toBe("skipped");
    expect(mockGetSyncStatus).toHaveBeenNthCalledWith(2, {
      cursor: "sync:3:products:p1",
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
        last_server_watermark: "",
        local_dirty_count: 2,
      })
      .mockResolvedValueOnce(syncResult);
    mockGetSyncStatus.mockResolvedValue({
      changedTables: ["products"],
      hasChanges: true,
      cursor: "sync:11:products:p1",
    });

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_now", {
      apiUrl: expect.any(String),
      outletId: "outlet-1",
      sessionToken: "test-session-token",
      tables: ["products"],
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
        last_server_watermark: "",
        local_dirty_count: 0,
        needs_baseline_sync: true,
      })
      .mockResolvedValueOnce(syncResult);

    const result = await syncNow();

    expect(mockInvoke).toHaveBeenLastCalledWith("sync_full_resync", {
      apiUrl: expect.any(String),
      outletId: "outlet-1",
      sessionToken: "test-session-token",
      tables: [],
    });
    expect(result.mode).toBe("full");
  });

  test("sets error and stops scheduler on auth failure", async () => {
    vi.useFakeTimers();
    startSyncScheduler();
    vi.advanceTimersByTime(0);
    await flushMicrotasks();
    vi.useRealTimers();
    resetSyncMocks();

    mockInvoke.mockRejectedValue({ status: 401, message: "Unauthorized" });

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("error");

    vi.useFakeTimers();
    vi.advanceTimersByTime(10 * 60 * 1000);
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    stopSyncScheduler();
  });

  test("sets error on 403 forbidden", async () => {
    mockInvoke.mockRejectedValue({ status: 403, message: "Forbidden" });

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("error");
  });

  test("sets error on native 401 string failure", async () => {
    mockInvoke.mockRejectedValue(
      new Error("Sync push batch failed (401 Unauthorized): expired")
    );

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("error");
  });

  test("sets error on structured native auth failure", async () => {
    mockInvoke.mockRejectedValue(
      '{"kind":"auth","status":401,"message":"expired"}'
    );

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("error");
  });

  test("sets offline on native 413 string failure", async () => {
    mockInvoke.mockRejectedValue(
      new Error("Sync push batch failed (413 Payload Too Large): too many rows")
    );

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("offline");
  });

  test("sets offline on structured native payload failure", async () => {
    mockInvoke.mockRejectedValue(
      '{"kind":"payload_too_large","status":413,"message":"too many rows"}'
    );

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("offline");
  });

  test("sets offline on network failure", async () => {
    mockInvoke.mockRejectedValue(new Error("Network error"));

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("offline");
  });

  test("sets offline on server 5xx failure", async () => {
    mockInvoke.mockRejectedValue({ status: 502, message: "Bad Gateway" });

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("offline");
  });

  test("sets offline on generic invoke failure", async () => {
    mockInvoke.mockRejectedValue(new Error("something unexpected"));

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("offline");
  });
});

describe("runStartupSync", () => {
  beforeEach(() => {
    resetSyncMocks();
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

    await expect(runStartupSync()).resolves.toBeUndefined();
    expect(syncStatus()).toBe("offline");
  });

  test("preserves auth error state when startup sync receives native 401", async () => {
    mockInvoke.mockRejectedValue(
      new Error("Sync pull batch failed (401 Unauthorized): expired")
    );

    await expect(runStartupSync()).resolves.toBeUndefined();
    expect(syncStatus()).toBe("error");
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
    resetSyncMocks();
    vi.useFakeTimers();
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

    vi.advanceTimersByTime(0);
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    stopSyncScheduler();
  });

  test("stopSyncScheduler prevents further syncs", async () => {
    startSyncScheduler();
    stopSyncScheduler();

    vi.advanceTimersByTime(10 * 60 * 1000);
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  test("startSyncScheduler is idempotent", async () => {
    startSyncScheduler();
    startSyncScheduler();

    vi.advanceTimersByTime(0);
    await flushMicrotasks();
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    stopSyncScheduler();
  });
});
