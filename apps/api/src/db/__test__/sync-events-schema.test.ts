import { describe, expect, test } from "bun:test";
// biome-ignore lint/performance/noNamespaceImport: this test intentionally inspects the exported schema namespace.
import * as apiSchema from "@repo/database/api-schema";

describe("api smart sync schema", () => {
  test("does not export syncEvents", () => {
    expect(apiSchema).not.toHaveProperty("syncEvents");
  });
});
