import { describe, expect, test } from "bun:test";
import {
  decodePushRequestTables,
  encodePullResponse,
  encodeStatusResponse,
} from "../protobuf";

describe("sync protobuf helpers", () => {
  test("decodes push request payload JSON into table rows", () => {
    const tables = decodePushRequestTables(
      JSON.stringify({
        products: [{ id: "product-1", name: "Coffee" }],
      })
    );

    expect(tables).toEqual({
      products: [{ id: "product-1", name: "Coffee" }],
    });
  });

  test("rejects malformed push payload JSON", () => {
    expect(() => decodePushRequestTables("{bad-json")).toThrow(
      "Invalid sync payload JSON"
    );
  });

  test("encodes status null oldest event with explicit presence flag", () => {
    const response = encodeStatusResponse({
      changedTables: [],
      hasChanges: false,
      latestEventId: 10,
      needsFullResync: false,
      oldestAvailableEventId: null,
    });

    expect(response.oldestAvailableEventId).toBe(0);
    expect(response.hasOldestAvailableEventId).toBe(false);
  });

  test("encodes table rows as JSON strings", () => {
    const response = encodePullResponse({
      products: [{ id: "product-1" }],
      serverTime: "2026-05-10T00:00:00.000Z",
    });

    expect(response.serverTime).toBe("2026-05-10T00:00:00.000Z");
    expect(response.tables).toEqual([
      { table: "products", rowsJson: JSON.stringify([{ id: "product-1" }]) },
    ]);
  });
});
