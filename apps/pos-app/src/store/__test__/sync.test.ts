import { describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  transformCallback: vi.fn(),
}));

const mockCurrentOutletId = vi.fn((): string | null => "outlet-1");
const mockCurrentMerchantId = vi.fn(() => "merchant-1");
const mockGetToken = vi.fn(
  (): Promise<string | null> => Promise.resolve("test-session-token")
);

vi.mock("~/store/outlet", () => ({
  currentMerchantId: mockCurrentMerchantId,
  currentOutletId: mockCurrentOutletId,
}));

vi.mock("~/lib/auth/storage", () => ({
  AuthStorage: {
    getToken: mockGetToken,
  },
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
  processPendingAssetJobs: vi.fn(() => Promise.resolve(0)),
}));

vi.mock("~/lib/assets/sync", () => ({
  hydrateMissingAssets: vi.fn(() => Promise.resolve(0)),
  uploadPendingAssets: vi.fn(() => Promise.resolve(0)),
}));

const mockSyncClient = {
  syncNow: vi.fn(() =>
    Promise.resolve({
      mode: "NoOp",
      pull: { rows_received: 0, server_time: "" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    })
  ),
  getState: vi.fn(() =>
    Promise.resolve({
      local_dirty_count: 0,
      last_server_watermark: "",
      needs_baseline_sync: false,
    })
  ),
  startPolling: vi.fn(),
  stopPolling: vi.fn(() => Promise.resolve()),
  setHeaders: vi.fn(() => Promise.resolve()),
};

vi.mock("~/lib/sync", () => ({
  getSyncClient: vi.fn(() => mockSyncClient),
}));

const { syncNow, runStartupSync, syncStatus } = await import("~/store/sync");

describe("syncNow", () => {
  test("returns NoOp when no outletId", async () => {
    mockCurrentOutletId.mockReturnValueOnce(null);

    const result = await syncNow();
    expect(result.mode).toBe("NoOp");
  });

  test("throws when no session token", async () => {
    mockGetToken.mockResolvedValueOnce(null);

    await expect(syncNow()).rejects.toThrow(
      "Sesi tidak ditemukan. Silakan login ulang."
    );
  });

  test("calls syncClient.syncNow when outlet and token exist", async () => {
    vi.mocked(mockSyncClient.syncNow).mockResolvedValueOnce({
      mode: "PullOnly",
      pull: { rows_received: 3, server_time: "2026-01-01T00:00:00.000Z" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    } as never);

    const result = await syncNow();
    expect(result.mode).toBe("PullOnly");
    expect(result.pull!.rows_received).toBe(3);
  });

  test("sets error status on auth failure", async () => {
    mockSyncClient.syncNow.mockRejectedValueOnce(new Error("401 Unauthorized"));

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("error");
  });

  test("sets offline status on network failure", async () => {
    mockSyncClient.syncNow.mockRejectedValueOnce(new Error("Network error"));

    await expect(syncNow()).rejects.toThrow("Gagal menyinkronkan");
    expect(syncStatus()).toBe("offline");
  });

  test("setHeaders is called on client before syncNow", async () => {
    vi.mocked(mockSyncClient.syncNow).mockResolvedValueOnce({
      mode: "PullOnly",
      pull: { rows_received: 1, server_time: "2026-01-01T00:00:00.000Z" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    } as never);

    await syncNow();

    expect(mockSyncClient.setHeaders).toHaveBeenCalledWith({
      Authorization: "Bearer test-session-token",
    });
    const headersOrder = mockSyncClient.setHeaders.mock.invocationCallOrder[0];
    const syncOrder = mockSyncClient.syncNow.mock.invocationCallOrder[0];
    expect(headersOrder).toBeLessThan(syncOrder);
  });
});

describe("runStartupSync", () => {
  test("does nothing when no outletId", async () => {
    mockCurrentOutletId.mockReturnValueOnce(null);

    await runStartupSync();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("does nothing when no session token", async () => {
    mockGetToken.mockResolvedValueOnce(null);

    await runStartupSync();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("sets idle on success", async () => {
    await runStartupSync();
    expect(syncStatus()).toBe("idle");
  });

  test("sets offline on error", async () => {
    mockSyncClient.syncNow.mockRejectedValueOnce(new Error("Network error"));

    await runStartupSync();
    expect(syncStatus()).toBe("offline");
  });
});
