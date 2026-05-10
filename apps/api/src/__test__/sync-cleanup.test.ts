import { describe, expect, test, vi } from "bun:test";

const mockDelete = vi.fn();

vi.mock("../db", () => ({
  db: {
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    API_URL: "http://localhost:3001",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    NODE_ENV: "development",
    TURSO_AUTH_TOKEN: "",
    TURSO_DATABASE_URL: "http://127.0.0.1:8080",
  },
}));

describe("cleanupSyncHistory", () => {
  test("deletes sync events older than retention window", async () => {
    const where = vi.fn().mockResolvedValue({ rowsAffected: 3 });
    mockDelete.mockReturnValue({ where });

    const { cleanupSyncHistory } = await import("../lib/sync-cleanup");
    const result = await cleanupSyncHistory({
      now: new Date("2026-05-09T12:00:00.000Z"),
      retentionDays: 30,
    });

    expect(result.deletedEvents).toBe(3);
    expect(mockDelete).toHaveBeenCalled();
  });

  test("does not hard-delete orders during sync cleanup", async () => {
    const where = vi.fn().mockResolvedValue({ rowsAffected: 0 });
    mockDelete.mockReturnValue({ where });

    const { cleanupSyncHistory } = await import("../lib/sync-cleanup");
    const result = await cleanupSyncHistory({
      now: new Date("2026-05-09T12:00:00.000Z"),
      retentionDays: 30,
    });

    expect(Object.keys(result.deletedSoftRows)).not.toContain("orders");
    expect(Object.keys(result.deletedSoftRows)).not.toContain("order_items");
  });
});
