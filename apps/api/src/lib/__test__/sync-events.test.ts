import { describe, expect, test, vi } from "bun:test";

const mockInsert = vi.fn();

vi.mock("../../db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
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

describe("recordSyncEvent", () => {
  test("records compact metadata without payload", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values });

    const { recordSyncEvent } = await import("../sync-events");
    await recordSyncEvent({
      changedAt: "2026-05-09T12:00:00.000Z",
      operation: "update",
      rowId: "prod-1",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    expect(values).toHaveBeenCalledWith({
      changedAt: "2026-05-09T12:00:00.000Z",
      operation: "update",
      rowId: "prod-1",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });
    expect(JSON.stringify(values.mock.calls)).not.toContain("payload");
  });
});
