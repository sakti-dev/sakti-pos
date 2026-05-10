import { describe, expect, test } from "bun:test";
import { syncEvents } from "@repo/database/api-schema";

describe("api smart sync schema", () => {
  test("defines compact sync events table", () => {
    expect(syncEvents).toBeDefined();
  });
});
